import {
  allocateTotal,
  productSelection,
  quoteProducts,
  settlementLines,
  share,
  paidProductQuantities,
  validateProductSelection,
} from "./product-settlement";
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, transaction } from "./db";
import { audit } from "./auth";
import { money, recipeSchema, validateRecipe } from "./catalog";
import {
  services,
  sources,
  methods,
  totals,
  transitions,
  cashExpected,
  allowed,
  serviceAllowed,
} from "./domain";
const includeOrder = {
  items: true,
  rounds: {
    orderBy: { sequence: "asc" as const },
    select: { id: true, sequence: true, status: true, createdAt: true },
  },
  customer: true,
  table: true,
  delivery: { include: { driver: true } },
  payments: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  refunds: true,
};
// Solo la mesa de una tienda evita cocina; sus domicilios sí pasan por Despachos.
const skipsKitchen = (u: any, service: string) =>
  u.tenant.businessType === "TIENDA" && service === "MESA";
export async function findOrder(tx: any, id: string, u: any, branchId: string) {
  const o = await tx.order.findFirst({
    where: { id, tenantId: u.tenantId, branchId },
    include: includeOrder,
  });
  if (!o) throw new NotFoundException("Pedido no encontrado");
  return o;
}
export async function orders(u: any, branchId: string, q: any) {
  const where: any = { tenantId: u.tenantId, branchId };
  if (q.active === "true") where.status = { notIn: ["CERRADO", "CANCELADO"] };
  if (q.kitchen === "true")
    where.status = {
      in: ["CONFIRMADO", "EN_PREPARACION", "LISTO", "EN_CAMINO"],
    };
  if (["CERRADO", "CANCELADO"].includes(q.status)) where.status = q.status;
  if (q.status === "CANCELADO") where.mergedIntoId = null;
  if (q.status === "UNIDO") where.mergedIntoId = { not: null };
  if (q.service) where.service = q.service;
  const search =
    typeof q.search === "string" ? q.search.trim().slice(0, 100) : "";
  if (search) {
    const number = Number(search.replace(/^#/, ""));
    where.OR = [
      { customer: { name: { contains: search } } },
      ...(Number.isSafeInteger(number) && number > 0 && number <= 2147483647
        ? [{ number }]
        : []),
    ];
  }
  const page = Math.min(100000, Math.max(1, Math.floor(Number(q.page) || 1))),
    limit = Math.min(100, Math.max(1, Math.floor(Number(q.limit) || 50)));
  return {
    data: await db.order.findMany({
      where,
      include: includeOrder,
      orderBy:
        q.kitchen === "true" ? { updatedAt: "desc" } : { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
    meta: { page, limit, total: await db.order.count({ where }) },
  };
}
const orderLines = z.array(
  z.object({
    productId: z.string(),
    quantity: z.number().int().min(1).max(999),
    variantId: z.string().optional(),
    modifierIds: z.array(z.string()).max(20).default([]),
    notes: z.string().max(500).optional(),
  }),
);

async function priceOrderLines(
  tx: Prisma.TransactionClient,
  tenantId: string,
  service: string,
  lines: z.infer<typeof orderLines>,
) {
  const items = [];
  for (const item of lines) {
    const p = await tx.product.findFirst({
      where: { id: item.productId, tenantId, active: true },
      include: {
        variants: true,
        prices: true,
        modifiers: { include: { modifier: true } },
      },
    });
    if (!p) throw new BadRequestException("Producto no disponible");
    const variant = item.variantId
      ? p.variants.find((v) => v.id === item.variantId)
      : null;
    if (item.variantId && !variant)
      throw new BadRequestException("Variante inválida");
    const unique = [...new Set(item.modifierIds)];
    const mods = unique.map(
      (id) => p.modifiers.find((m) => m.modifierId === id)?.modifier,
    );
    if (mods.some((m) => !m))
      throw new BadRequestException("Modificador inválido");
    const price =
      (variant?.price ??
        p.prices.find((v) => v.service === service)?.price ??
        p.price) + mods.reduce((s, m) => s + m!.price, 0);
    items.push({
      productId: p.id,
      name: p.name + (variant ? " · " + variant.name : ""),
      quantity: item.quantity,
      price,
      cost: p.cost,
      total: price * item.quantity,
      station: p.station,
      notes: item.notes,
      modifiers: mods.filter((modifier) => modifier !== undefined),
    });
  }
  return items;
}

function orderAmounts(
  order: {
    subtotal: number;
    discount: number;
    tax: number;
    taxRate: number | null;
    tip: number;
    deliveryFee: number;
  },
  subtotal: number,
) {
  if (subtotal < order.discount)
    throw new BadRequestException("El descuento supera el subtotal");
  const taxRate =
    order.taxRate ??
    (order.subtotal > order.discount
      ? Math.round((order.tax * 10000) / (order.subtotal - order.discount))
      : 0);
  const amounts = totals(
    subtotal,
    order.discount,
    taxRate,
    order.tip,
    order.deliveryFee,
  );
  // Keep tax already recorded on the account, including transferred rounds.
  const priorTax = totals(
    order.subtotal,
    order.discount,
    taxRate,
    order.tip,
    order.deliveryFee,
  ).tax;
  const adjustment = order.tax - priorTax;
  amounts.tax += adjustment;
  amounts.total += adjustment;
  if (amounts.tax < 0 || amounts.total <= 0 || amounts.total > 1000000000)
    throw new BadRequestException("Total fuera de rango");
  return { ...amounts, taxRate };
}

export async function openTableOrder(
  tableId: string,
  u: any,
  branchId: string,
) {
  const order = await db.order.findFirst({
    where: {
      tableId,
      tenantId: u.tenantId,
      branchId,
      service: "MESA",
      status: { notIn: ["CERRADO", "CANCELADO"] },
    },
    include: includeOrder,
  });
  if (!order)
    throw new NotFoundException(
      "Esta mesa no tiene una cuenta abierta. Actualiza el salón.",
    );
  return order;
}

export async function moveTableOrder(
  id: string,
  body: unknown,
  u: any,
  branchId: string,
) {
  const input = z
    .object({
      sourceTableId: z.string().min(1),
      targetTableId: z.string().min(1),
    })
    .parse(body);
  if (input.sourceTableId === input.targetTableId)
    throw new BadRequestException("Selecciona una mesa diferente");
  return transaction(async (tx) => {
    const order = await findOrder(tx, id, u, branchId);
    if (
      order.service !== "MESA" ||
      !order.tableId ||
      order.table?.status !== "OCUPADA" ||
      ["CERRADO", "CANCELADO"].includes(order.status)
    )
      throw new ConflictException(
        "Solo puedes mover una cuenta de mesa abierta",
      );
    if (order.tableId === input.targetTableId) return order;
    if (order.tableId !== input.sourceTableId)
      throw new ConflictException(
        "La cuenta ya cambió de mesa. Actualiza y vuelve a intentar.",
      );
    const claimed = await tx.diningTable.updateMany({
      where: { id: input.targetTableId, branchId, status: "LIBRE" },
      data: { status: "OCUPADA" },
    });
    if (!claimed.count)
      throw new ConflictException("La mesa de destino ya no está disponible");
    if (
      await tx.order.findFirst({
        where: {
          branchId,
          tableId: input.targetTableId,
          status: { notIn: ["CERRADO", "CANCELADO"] },
        },
        select: { id: true },
      })
    )
      throw new ConflictException(
        "La mesa de destino tiene una cuenta abierta",
      );
    await tx.order.update({
      where: { id },
      data: { tableId: input.targetTableId },
    });
    await tx.diningTable.update({
      where: { id: input.sourceTableId },
      data: { status: "LIBRE" },
    });
    await audit(tx, u, "MOVE_TABLE", "orders", id, input);
    return findOrder(tx, id, u, branchId);
  });
}

export async function mergeTableOrders(
  id: string,
  body: unknown,
  u: any,
  branchId: string,
) {
  const input = z
    .object({
      sourceTableId: z.string().min(1),
      targetTableId: z.string().min(1),
      targetOrderId: z.string().min(1),
    })
    .parse(body);
  if (input.sourceTableId === input.targetTableId || id === input.targetOrderId)
    throw new BadRequestException("Selecciona otra mesa ocupada");

  return transaction(async (tx) => {
    const source = await findOrder(tx, id, u, branchId);
    const target = await findOrder(tx, input.targetOrderId, u, branchId);
    if (
      source.mergedIntoId === target.id &&
      source.tableId === input.sourceTableId
    )
      return target;
    const activeStates = ["CONFIRMADO", "EN_PREPARACION", "LISTO", "ENTREGADO"];
    for (const [order, tableId] of [
      [source, input.sourceTableId],
      [target, input.targetTableId],
    ] as const)
      if (
        order.service !== "MESA" ||
        order.tableId !== tableId ||
        order.table?.status !== "OCUPADA" ||
        !activeStates.includes(order.status)
      )
        throw new ConflictException(
          "Una de las mesas cambió de cuenta. Actualiza el salón.",
        );
    if (source.items.length + target.items.length > 500)
      throw new BadRequestException(
        "La cuenta unida admite hasta 500 líneas de productos",
      );
    const amounts = {
      subtotal: source.subtotal + target.subtotal,
      discount: source.discount + target.discount,
      tax: source.tax + target.tax,
      tip: source.tip + target.tip,
      deliveryFee: source.deliveryFee + target.deliveryFee,
      total: source.total + target.total,
    };
    if (amounts.total > 1000000000)
      throw new BadRequestException(
        "El total de la cuenta unida supera el límite",
      );
    const targetKeys = new Set(
      (
        await tx.orderRound.findMany({
          where: { orderId: target.id, requestKey: { not: null } },
          select: { requestKey: true },
        })
      ).map((round) => round.requestKey),
    );
    const sourceKeys = await tx.orderRound.findMany({
      where: { orderId: source.id, requestKey: { not: null } },
      select: { requestKey: true },
    });
    // Request keys remain attached to their original rounds for safe retries.
    if (sourceKeys.some((round) => targetKeys.has(round.requestKey)))
      throw new ConflictException(
        "Las cuentas tienen solicitudes de ronda repetidas",
      );

    if (
      [source, target].some(
        (order) =>
          order.payments.length ||
          order.items.some((item: any) => item.settlementTotal !== null),
      )
    ) {
      await freezeSettlement(tx, source);
      await freezeSettlement(tx, target);
    }
    async function materialize(order: typeof source) {
      if (order.rounds.length) return order.rounds;
      const round = await tx.orderRound.create({
        data: {
          orderId: order.id,
          sequence: 1,
          status: order.status,
          createdAt: order.createdAt,
        },
      });
      await tx.orderItem.updateMany({
        where: { orderId: order.id, roundId: null },
        data: { roundId: round.id },
      });
      return [round];
    }
    const targetRounds = await materialize(target);
    const sourceRounds = await materialize(source);
    let sequence = targetRounds.at(-1).sequence;
    for (const round of sourceRounds)
      await tx.orderRound.update({
        where: { id: round.id },
        data: { orderId: target.id, sequence: ++sequence },
      });

    await tx.orderItem.updateMany({
      where: { orderId: source.id },
      data: { orderId: target.id },
    });
    await tx.payment.updateMany({
      where: { orderId: source.id },
      data: { orderId: target.id },
    });
    await tx.order.update({
      where: { id: target.id },
      data: {
        ...amounts,
        status: activeStates.find((status) =>
          [...targetRounds, ...sourceRounds].some(
            (round: any) => round.status === status,
          ),
        ),
        customerId: target.customerId ?? source.customerId,
        notes:
          [
            target.notes,
            source.notes && `${source.table.name}: ${source.notes}`,
          ]
            .filter(Boolean)
            .join("\n") || null,
      },
    });
    await tx.order.update({
      where: { id: source.id },
      data: { status: "CANCELADO", mergedIntoId: target.id },
    });
    await tx.diningTable.update({
      where: { id: input.sourceTableId },
      data: { status: "LIBRE" },
    });
    await audit(tx, u, "MERGE_TABLES", "orders", target.id, {
      ...input,
      sourceOrderId: source.id,
      total: amounts.total,
    });
    return findOrder(tx, target.id, u, branchId);
  });
}

const splitSelection = z.object({
  items: productSelection,
  targetTableId: z.string().min(1).optional(),
});
const splitRequest = splitSelection.extend({
  sourceTableId: z.string().min(1),
  targetTableId: z.string().min(1),
  requestKey: z.uuid(),
  expectedAmount: money,
  expectedSourceBalance: money,
  expectedTargetOrderId: z.string().min(1).optional(),
  expectedTargetBalance: money.optional(),
});
type TableOrder = Prisma.OrderGetPayload<{ include: typeof includeOrder }>;

function planTableSplit(
  order: TableOrder,
  items: z.infer<typeof productSelection>,
) {
  if (
    order.service !== "MESA" ||
    !order.tableId ||
    order.table?.status !== "OCUPADA" ||
    !["CONFIRMADO", "EN_PREPARACION", "LISTO", "ENTREGADO"].includes(
      order.status,
    )
  )
    throw new ConflictException(
      "Solo puedes separar productos de una mesa abierta",
    );
  const pricedLines = settlementLines(order);
  validateProductSelection(pricedLines, new Map(), items);
  // Paid units come first within each line, in the original payment order.
  const unitsToMove = new Map(items.map(({ id, quantity }) => [id, quantity]));
  const movedPaymentsByLine = new Map<string, number>();
  const retainedPaymentsByLine = new Map<string, number>();
  type PaidLine = {
    id: string;
    name: string;
    quantity: number;
    amount: number;
  };
  const paymentTransfers = order.payments.flatMap((payment) => {
    if (!Array.isArray(payment.items) || !payment.items.length) return [];
    const details = payment.items as PaidLine[];
    const actualAmounts = allocateTotal(
      payment.amount,
      details.map((line) => line.amount),
    );
    const moved: PaidLine[] = [];
    const retained: PaidLine[] = [];
    for (const [index, line] of details.entries()) {
      const quantity = Math.min(line.quantity, unitsToMove.get(line.id) ?? 0);
      const amount = share(actualAmounts[index], quantity, line.quantity);
      if (quantity) {
        moved.push({ ...line, quantity, amount });
        movedPaymentsByLine.set(
          line.id,
          (movedPaymentsByLine.get(line.id) ?? 0) + amount,
        );
        unitsToMove.set(line.id, unitsToMove.get(line.id)! - quantity);
      }
      if (quantity < line.quantity) {
        const retainedAmount = actualAmounts[index] - amount;
        retainedPaymentsByLine.set(
          line.id,
          (retainedPaymentsByLine.get(line.id) ?? 0) + retainedAmount,
        );
        retained.push({
          ...line,
          quantity: line.quantity - quantity,
          amount: retainedAmount,
        });
      }
    }
    return moved.length
      ? [
          {
            payment,
            moved,
            retained,
            amount: moved.reduce((sum, line) => sum + line.amount, 0),
          },
        ]
      : [];
  });
  const paidMoved = paymentTransfers.reduce(
    (sum, transfer) => sum + transfer.amount,
    0,
  );
  const paidQuantities = paidProductQuantities(order);
  const lines = items.map(({ id, quantity }) => {
    const item = order.items.find((line) => line.id === id)!;
    const settlementTotal = pricedLines.find(
      (line) => line.id === id,
    )!.settlementTotal;
    const movedPaid = movedPaymentsByLine.get(id) ?? 0;
    const retainedPaid = retainedPaymentsByLine.get(id) ?? 0;
    const hasPaidUnits = paidQuantities.has(id);
    const amount = hasPaidUnits
      ? Math.max(
          movedPaid,
          Math.min(
            settlementTotal - retainedPaid,
            share(settlementTotal, quantity, item.quantity),
          ),
        )
      : settlementTotal -
        share(settlementTotal, item.quantity - quantity, item.quantity);
    return { item, quantity, kept: settlementTotal - amount, amount };
  });
  const amount = lines.reduce((sum, line) => sum + line.amount, 0);
  const paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const sourceBalance = order.total - (paid - paidMoved) - amount;
  if (amount <= 0 || paidMoved > amount || sourceBalance < 0)
    throw new BadRequestException(
      "El valor a trasladar debe estar cubierto por el saldo pendiente. Reduce la selección para conservar el abono en la mesa de origen.",
    );
  if (
    items.reduce((sum, item) => sum + item.quantity, 0) ===
    order.items.reduce((sum, item) => sum + item.quantity, 0)
  )
    throw new BadRequestException(
      "Deja al menos un producto en la mesa de origen o usa Mover mesa",
    );
  const movedById = new Map(lines.map((line) => [line.item.id, line.quantity]));
  const remaining = order.items.filter(
    (line) => (movedById.get(line.id) ?? 0) < line.quantity,
  );
  const stateFor = (item: TableOrder["items"][number]) =>
    order.rounds.find((round) => round.id === item.roundId)?.status ??
    order.status;
  if (
    !sourceBalance &&
    remaining.some((line) => stateFor(line) !== "ENTREGADO")
  )
    throw new BadRequestException(
      "Entrega los productos que quedan en origen antes de dejar su saldo en cero",
    );
  return {
    lines,
    remaining,
    stateFor,
    amount,
    sourceBalance,
    paidMoved,
    paymentTransfers,
  };
}

async function splitDestination(
  tx: Prisma.TransactionClient,
  tableId: string,
  u: any,
  branchId: string,
) {
  const table = await tx.diningTable.findFirst({
    where: { id: tableId, branchId },
  });
  if (table?.status === "LIBRE") return null;
  if (table?.status === "OCUPADA") {
    const order = await tx.order.findFirst({
      where: {
        tableId,
        branchId,
        tenantId: u.tenantId,
        service: "MESA",
        status: { in: ["CONFIRMADO", "EN_PREPARACION", "LISTO", "ENTREGADO"] },
      },
      include: includeOrder,
    });
    if (order) return order;
  }
  throw new ConflictException(
    "La mesa de destino ya no admite productos. Elige otra mesa.",
  );
}

function splitDestinationBalance(target: TableOrder | null, amount: number) {
  return (
    amount +
    (target
      ? target.total -
        target.payments.reduce((sum, payment) => sum + payment.amount, 0)
      : 0)
  );
}

export async function tableSplitQuote(
  id: string,
  body: unknown,
  u: any,
  branchId: string,
) {
  const { items, targetTableId } = splitSelection.parse(body);
  const source = await findOrder(db, id, u, branchId);
  const { amount, sourceBalance, paidMoved } = planTableSplit(source, items);
  if (!targetTableId) return { amount, sourceBalance };
  if (targetTableId === source.tableId)
    throw new BadRequestException("Selecciona otra mesa");
  const target = await splitDestination(db, targetTableId, u, branchId);
  return {
    amount,
    sourceBalance,
    targetOrderId: target?.id,
    targetBalance: splitDestinationBalance(target, amount - paidMoved),
    ...(paidMoved ? { paidMoved } : {}),
  };
}

export async function splitTableOrder(
  id: string,
  body: unknown,
  u: any,
  branchId: string,
) {
  const input = splitRequest.parse(body);
  if (input.sourceTableId === input.targetTableId)
    throw new BadRequestException("Selecciona otra mesa");
  const auditId = "table-split-" + input.requestKey;
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return transaction(async (tx) => {
    const order: TableOrder = await findOrder(tx, id, u, branchId);
    const previous = await tx.auditLog.findUnique({ where: { id: auditId } });
    if (previous) {
      const metadata = z
        .object({ hash: z.string(), targetOrderId: z.string() })
        .safeParse(previous.metadata);
      if (
        previous.tenantId !== u.tenantId ||
        previous.recordId !== id ||
        !metadata.success ||
        metadata.data.hash !== hash
      )
        throw new ConflictException(
          "La solicitud ya fue utilizada con otros datos",
        );
      return {
        source: order,
        target: await findOrder(tx, metadata.data.targetOrderId, u, branchId),
      };
    }
    if (order.tableId !== input.sourceTableId)
      throw new ConflictException(
        "La cuenta cambió de mesa. Actualiza la cuenta.",
      );
    const plan = planTableSplit(order, input.items);
    if (
      plan.amount !== input.expectedAmount ||
      plan.sourceBalance !== input.expectedSourceBalance
    )
      throw new ConflictException(
        "El saldo cambió. Revisa la selección antes de confirmar.",
      );
    const destination = await splitDestination(
      tx,
      input.targetTableId,
      u,
      branchId,
    );
    if (
      destination?.id !== input.expectedTargetOrderId ||
      splitDestinationBalance(destination, plan.amount - plan.paidMoved) !==
        (input.expectedTargetBalance ?? plan.amount - plan.paidMoved)
    )
      throw new ConflictException(
        "La cuenta de destino cambió. Revisa los saldos antes de confirmar.",
      );
    if (destination) {
      if (
        destination.items.length + plan.lines.length > 500 ||
        destination.total + plan.amount > 1000000000
      )
        throw new BadRequestException(
          "La cuenta de destino supera el límite de productos o importe",
        );
    } else {
      const claimed = await tx.diningTable.updateMany({
        where: { id: input.targetTableId, branchId, status: "LIBRE" },
        data: { status: "OCUPADA" },
      });
      if (!claimed.count)
        throw new ConflictException(
          "La mesa de destino cambió. Actualiza los saldos.",
        );
    }

    const subtotal = plan.lines.reduce(
      (sum, line) => sum + line.item.price * line.quantity,
      0,
    );
    const adjustment = plan.amount - subtotal;
    const discount = Math.max(0, -adjustment);
    const extras = [order.tax, order.tip, order.deliveryFee];
    if (
      discount > order.discount ||
      adjustment > extras.reduce((sum, value) => sum + value, 0)
    )
      throw new ConflictException(
        "El desglose de la cuenta cambió. Actualiza la selección.",
      );
    const [tax, tip, deliveryFee] = allocateTotal(
      Math.max(0, adjustment),
      extras,
    );
    const states = ["CONFIRMADO", "EN_PREPARACION", "LISTO", "ENTREGADO"];
    const statusFor = (items: TableOrder["items"]) =>
      states.find((status) =>
        items.some((line) => plan.stateFor(line) === status),
      ) ?? "ENTREGADO";

    await freezeSettlement(tx, order);
    const targetBalance = splitDestinationBalance(
      destination,
      plan.amount - plan.paidMoved,
    );
    const movedStatus = statusFor(plan.lines.map(({ item }) => item));
    if (
      !targetBalance &&
      (movedStatus !== "ENTREGADO" ||
        (destination && destination.status !== "ENTREGADO"))
    )
      throw new BadRequestException(
        "Entrega los productos de destino antes de dejar su saldo en cero",
      );
    let nextSequence = 1;
    if (destination) {
      await freezeSettlement(tx, destination);
      if (destination.rounds.length) {
        nextSequence = destination.rounds.at(-1)!.sequence + 1;
      } else {
        const firstRound = await tx.orderRound.create({
          data: {
            orderId: destination.id,
            sequence: nextSequence++,
            status: destination.status,
            createdAt: destination.createdAt,
          },
        });
        await tx.orderItem.updateMany({
          where: { orderId: destination.id, roundId: null },
          data: { roundId: firstRound.id },
        });
      }
    }
    const amounts = {
      subtotal,
      discount,
      tax,
      tip,
      deliveryFee,
      total: plan.amount,
    };
    const target = destination
      ? await tx.order.update({
          where: { id: destination.id },
          data: {
            subtotal: destination.subtotal + subtotal,
            discount: destination.discount + discount,
            tax: destination.tax + tax,
            tip: destination.tip + tip,
            deliveryFee: destination.deliveryFee + deliveryFee,
            total: destination.total + plan.amount,
            status: states.find(
              (status) =>
                status === destination.status || status === movedStatus,
            ),
          },
        })
      : await tx.order.create({
          data: {
            tenantId: order.tenantId,
            branchId,
            userId: u.id,
            service: order.service,
            source: order.source,
            tableId: input.targetTableId,
            ...amounts,
            taxRate: order.taxRate,
            notes: order.notes,
            status: movedStatus,
          },
        });
    const targetRounds = new Map<string | null, string>();
    const movedLineIds = new Map<string, string>();
    for (const { item, quantity, kept, amount } of plan.lines) {
      let roundId = targetRounds.get(item.roundId);
      if (!roundId) {
        const original = order.rounds.find(
          (round) => round.id === item.roundId,
        );
        const round = await tx.orderRound.create({
          data: {
            orderId: target.id,
            sequence: nextSequence++,
            status: plan.stateFor(item),
            createdAt: original?.createdAt ?? order.createdAt,
          },
        });
        roundId = round.id;
        targetRounds.set(item.roundId, roundId);
      }
      const line = {
        orderId: target.id,
        roundId,
        quantity,
        total: item.price * quantity,
        settlementTotal: amount,
      };
      if (quantity === item.quantity) {
        await tx.orderItem.update({ where: { id: item.id }, data: line });
        movedLineIds.set(item.id, item.id);
      } else {
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            quantity: item.quantity - quantity,
            total: item.total - line.total,
            settlementTotal: kept,
          },
        });
        const movedLine = await tx.orderItem.create({
          data: {
            ...line,
            productId: item.productId,
            name: item.name,
            price: item.price,
            cost: item.cost,
            station: item.station,
            notes: item.notes,
            modifiers: item.modifiers as Prisma.InputJsonValue,
            stockApplied: item.stockApplied,
          },
        });
        movedLineIds.set(item.id, movedLine.id);
      }
    }
    for (const { payment, moved, retained, amount } of plan.paymentTransfers) {
      const movedItems = moved.map((line) => ({
        ...line,
        id: movedLineIds.get(line.id)!,
      }));
      if (!retained.length) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { orderId: target.id, items: movedItems },
        });
      } else {
        await tx.payment.update({
          where: { id: payment.id },
          data: { amount: payment.amount - amount, items: retained },
        });
        // The original cash movement remains the record of the money received.
        await tx.payment.create({
          data: {
            orderId: target.id,
            tenantId: payment.tenantId,
            sessionId: payment.sessionId,
            method: payment.method,
            createdAt: payment.createdAt,
            amount,
            items: movedItems,
            idempotencyKey:
              "split-" +
              createHash("sha256")
                .update(input.requestKey + payment.id)
                .digest("hex"),
          },
        });
      }
    }
    if (!targetBalance) {
      const received = await tx.orderItem.findMany({
        where: { orderId: target.id },
      });
      await applyLineStock(tx, u, branchId, target.number, received);
      await tx.order.update({
        where: { id: target.id },
        data: { status: "CERRADO", stockApplied: true },
      });
      await tx.diningTable.update({
        where: { id: input.targetTableId },
        data: { status: "LIBRE" },
      });
    }
    // Keep request keys on emptied rounds so old send-to-kitchen retries stay idempotent.
    const retainedRounds = new Set(plan.remaining.map((item) => item.roundId));
    for (const round of order.rounds)
      if (!retainedRounds.has(round.id) && round.status !== "ENTREGADO")
        await tx.orderRound.update({
          where: { id: round.id },
          data: { status: "ENTREGADO" },
        });
    await tx.order.update({
      where: { id },
      data: {
        subtotal: order.subtotal - subtotal,
        discount: order.discount - discount,
        tax: order.tax - tax,
        tip: order.tip - tip,
        deliveryFee: order.deliveryFee - deliveryFee,
        total: order.total - plan.amount,
        status: plan.sourceBalance ? statusFor(plan.remaining) : "CERRADO",
        ...(plan.sourceBalance ? {} : { stockApplied: true }),
      },
    });
    if (!plan.sourceBalance) {
      const retained = await tx.orderItem.findMany({ where: { orderId: id } });
      await applyLineStock(tx, u, branchId, order.number, retained);
      await tx.diningTable.update({
        where: { id: input.sourceTableId },
        data: { status: "LIBRE" },
      });
    }
    await tx.auditLog.create({
      data: {
        id: auditId,
        tenantId: u.tenantId,
        userId: u.id,
        action: "SPLIT_TABLE",
        module: "orders",
        recordId: id,
        metadata: {
          hash,
          sourceTableId: input.sourceTableId,
          targetTableId: input.targetTableId,
          targetOrderId: target.id,
          amount: plan.amount,
          paidMoved: plan.paidMoved,
          items: input.items,
        },
      },
    });
    return {
      source: await findOrder(tx, id, u, branchId),
      target: await findOrder(tx, target.id, u, branchId),
    };
  });
}

export async function addTableRound(
  id: string,
  body: unknown,
  u: any,
  branchId: string,
) {
  const input = z
    .object({ requestKey: z.uuid(), items: orderLines.min(1).max(100) })
    .parse(body);
  const requestHash = createHash("sha256")
    .update(JSON.stringify(input.items))
    .digest("hex");
  return transaction(async (tx) => {
    const order = await findOrder(tx, id, u, branchId);
    const previous = await tx.orderRound.findUnique({
      where: {
        orderId_requestKey: { orderId: id, requestKey: input.requestKey },
      },
    });
    if (previous) {
      if (previous.requestHash !== requestHash)
        throw new ConflictException("La ronda ya se envió con otros productos");
      return order;
    }
    if (
      order.service !== "MESA" ||
      !order.tableId ||
      order.table?.status !== "OCUPADA" ||
      !["CONFIRMADO", "EN_PREPARACION", "LISTO", "ENTREGADO"].includes(
        order.status,
      )
    )
      throw new ConflictException(
        "La cuenta de esta mesa ya no admite productos",
      );
    if (order.items.length + input.items.length > 500)
      throw new BadRequestException(
        "La cuenta admite hasta 500 líneas de productos",
      );
    const items = await priceOrderLines(
      tx,
      u.tenantId,
      order.service,
      input.items,
    );
    const amounts = orderAmounts(
      order,
      order.subtotal + items.reduce((sum, item) => sum + item.total, 0),
    );
    if (!order.rounds.length) {
      const first = await tx.orderRound.create({
        data: {
          orderId: id,
          sequence: 1,
          status: order.status,
          createdAt: order.createdAt,
        },
      });
      await tx.orderItem.updateMany({
        where: { orderId: id, roundId: null },
        data: { roundId: first.id },
      });
    }
    const fixedAmounts =
      order.payments.length > 0 ||
      order.items.some((item: any) => item.settlementTotal !== null);
    if (fixedAmounts) await freezeSettlement(tx, order);
    const extraTotals = fixedAmounts
      ? allocateTotal(
          amounts.total - order.total,
          items.map((item) => item.total),
        )
      : [];
    const sequence = (order.rounds.at(-1)?.sequence ?? 1) + 1;
    const round = await tx.orderRound.create({
      data: {
        orderId: id,
        sequence,
        requestKey: input.requestKey,
        requestHash,
        ...(skipsKitchen(u, order.service) ? { status: "ENTREGADO" } : {}),
        items: {
          create: items.map((item, index) => ({
            ...item,
            orderId: id,
            settlementTotal: extraTotals[index],
          })),
        },
      },
    });
    await tx.order.update({
      where: { id },
      data: {
        ...amounts,
        // Solo sigue entregado si no quedan rondas previas pendientes en cocina.
        status:
          skipsKitchen(u, order.service) && order.status === "ENTREGADO"
            ? "ENTREGADO"
            : "CONFIRMADO",
      },
    });
    await audit(tx, u, "ADD_ROUND", "orders", id, {
      roundId: round.id,
      sequence,
      total: amounts.total,
    });
    return findOrder(tx, id, u, branchId);
  });
}

export async function createOrder(
  body: any,
  u: any,
  branchId: string,
  checkoutTx?: Prisma.TransactionClient,
) {
  const b = z
    .object({
      service: z.enum(services),
      source: z.enum(sources).default("POS"),
      tableId: z.string().optional(),
      customerId: z.string().optional(),
      notes: z.string().max(2000).optional(),
      address: z.string().max(500).optional(),
      estimatedAt: z.string().datetime().optional(),
      discount: money.default(0),
      tip: money.default(0),
      deliveryFee: money.default(0),
      items: orderLines.min(1).max(100),
    })
    .parse(body);
  if (
    !serviceAllowed(u.tenant, b.service) ||
    (b.tableId && !serviceAllowed(u.tenant, "MESA"))
  )
    throw new BadRequestException("Servicio no disponible para tiendas");
  if (b.discount && !allowed(u.permissions, "ventas.editar"))
    throw new ForbiddenException("No tienes permiso para descuentos");
  const create = async (tx: Prisma.TransactionClient) => {
    if (
      b.customerId &&
      !(await tx.customer.findFirst({
        where: { id: b.customerId, tenantId: u.tenantId },
      }))
    )
      throw new BadRequestException("Cliente inválido");
    if (b.service === "MESA") {
      if (!b.tableId) throw new BadRequestException("Selecciona una mesa");
      const claimed = await tx.diningTable.updateMany({
        where: { id: b.tableId, branchId, status: "LIBRE" },
        data: { status: "OCUPADA" },
      });
      if (claimed.count !== 1)
        throw new BadRequestException("La mesa no está disponible");
    } else if (b.tableId)
      throw new BadRequestException("El servicio no admite mesa");
    if (b.service === "DOMICILIO" && (!b.customerId || !b.address))
      throw new BadRequestException("Selecciona cliente y dirección");
    const items = await priceOrderLines(tx, u.tenantId, b.service, b.items);
    if (b.discount > items.reduce((s, i) => s + i.total, 0))
      throw new BadRequestException("El descuento supera el subtotal");
    const amounts = totals(
      items.reduce((s, i) => s + i.total, 0),
      b.discount,
      u.tenant.taxRate,
      b.tip,
      b.deliveryFee,
    );
    if (amounts.total <= 0 || amounts.total > 1000000000)
      throw new BadRequestException("Total fuera de rango");
    const o = await tx.order.create({
      data: {
        tenantId: u.tenantId,
        branchId,
        userId: u.id,
        service: b.service,
        // Tienda: la cuenta de mesa no pasa por cocina, queda lista para cobrar.
        ...(checkoutTx || skipsKitchen(u, b.service)
          ? { status: "ENTREGADO" }
          : {}),
        source: b.source,
        tableId: b.tableId,
        customerId: b.customerId,
        notes: b.notes,
        estimatedAt: b.estimatedAt,
        ...amounts,
        taxRate: u.tenant.taxRate,
        items: { create: items },
        ...(b.service === "DOMICILIO"
          ? { delivery: { create: { address: b.address! } } }
          : {}),
      },
      include: includeOrder,
    });
    await audit(tx, u, "CREATE", "orders", o.id);
    return o;
  };
  return checkoutTx ? create(checkoutTx) : transaction(create);
}
export async function orderState(
  id: string,
  body: any,
  u: any,
  branchId: string,
) {
  const b = z
    .object({
      status: z.string(),
      roundId: z.string().optional(),
      reason: z.string().max(500).optional(),
      driverId: z.string().optional(),
    })
    .parse(body);
  return transaction(async (tx) => {
    const o = await findOrder(tx, id, u, branchId);
    if (["CERRADO", "CANCELADO"].includes(o.status))
      throw new ConflictException("La cuenta ya está cerrada");
    const round = b.roundId
      ? o.rounds.find((item: any) => item.id === b.roundId)
      : undefined;
    if (b.roundId && !round) throw new NotFoundException("Ronda no encontrada");
    if (o.rounds.length && !round && b.status !== "CANCELADO")
      throw new ConflictException("Selecciona la ronda que quieres actualizar");
    if (round && b.status === "CANCELADO")
      throw new BadRequestException(
        "La cancelación se hace desde la cuenta completa",
      );
    if (!transitions[round?.status ?? o.status]?.includes(b.status))
      throw new BadRequestException(
        "El pedido cambió de estado. Actualiza la cuenta.",
      );
    const permission =
      b.status === "CANCELADO"
        ? "pedidos.cancelar"
        : ["EN_PREPARACION", "LISTO"].includes(b.status)
          ? "pedidos.preparar"
          : "pedidos.entregar";
    if (
      !allowed(u.permissions, permission) &&
      !(b.status !== "CANCELADO" && allowed(u.permissions, "pedidos.editar")) &&
      !(b.status === "ENTREGADO" && allowed(u.permissions, "pedidos.cerrar"))
    )
      throw new ForbiddenException("No tienes permiso para este cambio");
    if (
      b.status === "CANCELADO" &&
      o.rounds.some((item: any) => item.status === "ENTREGADO")
    )
      throw new ConflictException("La cuenta ya tiene productos entregados");
    if (b.status === "CANCELADO" && !b.reason?.trim())
      throw new BadRequestException("Indica el motivo");
    if (b.status === "EN_CAMINO" && o.service !== "DOMICILIO")
      throw new BadRequestException("Solo para domicilios");
    if (
      o.service === "DOMICILIO" &&
      b.status === "ENTREGADO" &&
      o.status !== "EN_CAMINO"
    )
      throw new BadRequestException(
        "Despacha el domicilio antes de confirmar la entrega",
      );
    if (o.delivery) {
      if (
        b.driverId &&
        !(await tx.driver.findFirst({
          where: { id: b.driverId, branchId, active: true },
        }))
      )
        throw new BadRequestException("Domiciliario inválido");
      if (b.status === "EN_CAMINO" && !b.driverId && !o.delivery.driverId)
        throw new BadRequestException("Asigna un domiciliario");
      await tx.delivery.update({
        where: { id: o.delivery.id },
        data: {
          driverId: b.driverId,
          status: ["EN_CAMINO", "ENTREGADO", "CANCELADO"].includes(b.status)
            ? b.status
            : o.delivery.status,
        },
      });
    }
    if (b.status === "CANCELADO" && o.tableId)
      await tx.diningTable.update({
        where: { id: o.tableId },
        data: { status: "LIBRE" },
      });
    let status = b.status;
    if (round) {
      await tx.orderRound.update({
        where: { id: round.id },
        data: { status: b.status },
      });
      const states = o.rounds.map((item: any) =>
        item.id === round.id ? b.status : item.status,
      );
      status =
        ["CONFIRMADO", "EN_PREPARACION", "LISTO"].find((value) =>
          states.includes(value),
        ) ?? "ENTREGADO";
    }
    await tx.order.update({ where: { id }, data: { status } });
    if (b.status === "LISTO")
      await tx.notification.create({
        data: {
          tenantId: u.tenantId,
          title: `Pedido #${o.number} listo para entregar`,
        },
      });
    await audit(
      tx,
      u,
      b.status === "CANCELADO" ? "CANCEL" : "UPDATE",
      "orders",
      id,
      {
        status: b.status,
        reason: b.reason || "",
        ...(round ? { roundId: round.id } : {}),
      },
    );
    return findOrder(tx, id, u, branchId);
  });
}
async function stockMove(
  tx: any,
  u: any,
  branchId: string,
  ingredientId: string,
  quantity: number,
  type: string,
  reason: string,
) {
  const ingredient = await tx.ingredient.findFirst({
    where: { id: ingredientId, tenantId: u.tenantId },
    select: { name: true },
  });
  if (!ingredient) throw new BadRequestException("Ingrediente inválido");
  if (quantity < 0) {
    const result = await tx.inventory.updateMany({
      where: { branchId, ingredientId, quantity: { gte: -quantity } },
      data: { quantity: { increment: quantity } },
    });
    if (!result.count)
      throw new BadRequestException(
        `Inventario insuficiente: falta ${ingredient.name}.`,
      );
  } else
    await tx.inventory.upsert({
      where: { branchId_ingredientId: { branchId, ingredientId } },
      create: { branchId, ingredientId, quantity },
      update: { quantity: { increment: quantity } },
    });
  await tx.inventoryMovement.create({
    data: { branchId, ingredientId, quantity, type, reason, userId: u.id },
  });
}
type StockLine = {
  productId: string;
  quantity: number;
  stockApplied?: boolean;
};

async function checkRecipeStock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
  items: StockLine[],
) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (item.stockApplied) continue;
    quantities.set(
      item.productId,
      (quantities.get(item.productId) ?? 0) + item.quantity,
    );
  }
  if (!quantities.size) return new Map();
  const products = await tx.product.findMany({
    where: { tenantId, id: { in: [...quantities.keys()] }, trackStock: true },
    include: {
      recipe: {
        include: { ingredient: { select: { name: true, unit: true } } },
      },
    },
  });
  const needs = new Map<
    string,
    { name: string; unit: string; quantity: number }
  >();
  for (const product of products) {
    if (!product.recipe.length)
      throw new BadRequestException(`Configura la receta de ${product.name}`);
    for (const { ingredientId, ingredient, quantity } of product.recipe) {
      needs.set(ingredientId, {
        ...ingredient,
        quantity:
          (needs.get(ingredientId)?.quantity ?? 0) +
          quantity * quantities.get(product.id)!,
      });
    }
  }
  if (needs.size) {
    const inventory = await tx.inventory.findMany({
      where: { branchId, ingredientId: { in: [...needs.keys()] } },
    });
    const available = new Map(
      inventory.map((row) => [row.ingredientId, row.quantity]),
    );
    const format = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 6 });
    const missing = [...needs].flatMap(([id, item]) => {
      const stock = available.get(id) ?? 0;
      return stock < item.quantity
        ? [
            `${item.name} (requiere ${format.format(item.quantity)} ${item.unit}; disponible: ${format.format(stock)})`,
          ]
        : [];
    });
    if (missing.length)
      throw new BadRequestException(
        `Inventario insuficiente. ${missing.length === 1 ? "Falta" : "Faltan"}: ${missing.join(", ")}.`,
      );
  }
  return new Map(products.map((product) => [product.id, product]));
}

export async function checkOrderStock(body: unknown, u: any, branchId: string) {
  const { items, orderId } = z
    .object({
      items: z
        .array(
          z.object({
            productId: z.string().min(1),
            quantity: z.number().int().min(1).max(999),
          }),
        )
        .min(1),
      orderId: z.string().optional(),
    })
    .parse(body);
  const existing = orderId
    ? (await findOrder(db, orderId, u, branchId)).items
    : [];
  await checkRecipeStock(db, u.tenantId, branchId, [...existing, ...items]);
}

async function applyLineStock(
  tx: Prisma.TransactionClient,
  u: any,
  branchId: string,
  number: number,
  items: Pick<
    TableOrder["items"][number],
    "id" | "productId" | "quantity" | "stockApplied"
  >[],
) {
  const products = await checkRecipeStock(tx, u.tenantId, branchId, items);
  for (const item of items) {
    if (item.stockApplied) continue;
    const p = products.get(item.productId);
    if (p) {
      for (const r of p.recipe)
        await stockMove(
          tx,
          u,
          branchId,
          r.ingredientId,
          -r.quantity * item.quantity,
          "SALIDA",
          `Venta #${number}`,
        );
    }
    await tx.orderItem.update({
      where: { id: item.id },
      data: { stockApplied: true },
    });
  }
}
async function freezeSettlement(
  tx: Prisma.TransactionClient,
  order: Parameters<typeof settlementLines>[0],
) {
  if (order.items.every((item) => item.settlementTotal !== null)) return;
  const lines = settlementLines(order);
  for (const line of lines)
    await tx.orderItem.updateMany({
      where: { id: line.id, settlementTotal: null },
      data: { settlementTotal: line.settlementTotal },
    });
}

export async function productQuote(
  id: string,
  body: unknown,
  u: any,
  branchId: string,
) {
  const { items } = z.object({ items: productSelection }).parse(body);
  const order = await findOrder(db, id, u, branchId);
  if (order.service !== "MESA" || order.status !== "ENTREGADO")
    throw new BadRequestException(
      "Solo puedes cobrar productos de una mesa con todas sus rondas entregadas",
    );
  return quoteProducts(order, items);
}

const paymentEntry = z
  .object({
    method: z.enum(methods),
    amount: money.refine((value) => value > 0),
    cashReceived: money.optional(),
  })
  .refine(
    ({ method, amount, cashReceived }) =>
      cashReceived === undefined ||
      (method === "EFECTIVO" && cashReceived >= amount),
    {
      path: ["cashReceived"],
      message: "El efectivo recibido debe cubrir el importe en efectivo",
    },
  );
const paymentEntries = z.array(paymentEntry).min(1).max(7);

export async function pay(
  id: string,
  body: any,
  u: any,
  branchId: string,
  checkoutTx?: Prisma.TransactionClient,
) {
  const b = z
    .object({
      idempotencyKey: z.string().min(8).max(100),
      partial: z.boolean().default(false),
      expectedPaid: money.optional(),
      items: productSelection.optional(),
      payments: paymentEntries,
    })
    .parse(body);
  if (new Set(b.payments.map((p) => p.method)).size !== b.payments.length)
    throw new BadRequestException("Agrupa los pagos del mismo método");
  const settle = async (tx: Prisma.TransactionClient) => {
    const o = await findOrder(tx, id, u, branchId);
    const prev = await tx.payment.findMany({
      where: { tenantId: u.tenantId, idempotencyKey: b.idempotencyKey },
    });
    const selected = b.items?.map(({ id, quantity }) => [id, quantity]).sort();
    const previousSelection = prev
      .flatMap((p) => (Array.isArray(p.items) ? p.items : []))
      .map((item: any) => [item.id, item.quantity])
      .sort();
    if (prev.length) {
      if (
        prev.some((p) => p.orderId !== id) ||
        JSON.stringify(selected ?? []) !== JSON.stringify(previousSelection) ||
        JSON.stringify(
          prev.map((p) => [p.method, p.amount, p.cashReceived ?? null]).sort(),
        ) !==
          JSON.stringify(
            b.payments
              .map((p) => [p.method, p.amount, p.cashReceived ?? null])
              .sort(),
          )
      )
        throw new BadRequestException(
          "La clave de pago ya fue utilizada con otros datos",
        );
      return o;
    }
    if (
      o.status !== "ENTREGADO" ||
      o.rounds.some((round: any) => round.status !== "ENTREGADO")
    )
      throw new BadRequestException(
        "Marca todos los productos como entregados antes de cobrar",
      );
    const paid = o.payments.reduce(
      (sum: number, payment: { amount: number }) => sum + payment.amount,
      0,
    );
    const remaining = o.total - paid;
    const received = b.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );
    if (b.partial && o.service !== "MESA")
      throw new BadRequestException("Solo las cuentas de mesa admiten abonos");
    if (b.partial && b.expectedPaid !== paid)
      throw new ConflictException(
        "El saldo de la cuenta cambió. Revisa los pagos registrados.",
      );
    if (b.items && (!b.partial || b.payments.length !== 1))
      throw new BadRequestException(
        "Registra la selección de productos con un solo medio de pago",
      );
    const quote = b.items ? quoteProducts(o, b.items) : undefined;
    if (quote && quote.amount !== received)
      throw new ConflictException(
        "El importe de los productos cambió. Vuelve a calcular el cobro.",
      );
    if (received > remaining || (!b.partial && received !== remaining))
      throw new BadRequestException("El pago debe respetar el saldo pendiente");
    const closing = received === remaining;
    const session = await tx.cashSession.findFirst({
      where: { userId: u.id, closedAt: null, register: { branchId } },
    });
    if (!session) throw new BadRequestException("Abre tu caja antes de cobrar");
    const locked = await tx.order.updateMany({
      where: { id, status: "ENTREGADO", updatedAt: o.updatedAt },
      data: { status: closing ? "CERRADO" : "ENTREGADO", stockApplied: true },
    });
    if (!locked.count)
      throw new ConflictException(
        "La cuenta cambió. Actualiza antes de cobrar",
      );
    if (o.service === "MESA") await freezeSettlement(tx, o);
    await applyLineStock(tx, u, branchId, o.number, o.items);
    for (const p of b.payments) {
      await tx.payment.create({
        data: {
          ...p,
          cashChange:
            p.cashReceived === undefined
              ? undefined
              : p.cashReceived - p.amount,
          items: quote?.items,
          tenantId: u.tenantId,
          orderId: id,
          sessionId: session.id,
          idempotencyKey: b.idempotencyKey,
        },
      });
      await tx.cashMovement.create({
        data: {
          sessionId: session.id,
          type: "VENTA",
          method: p.method,
          amount: p.amount,
          reason: `Venta #${o.number}`,
        },
      });
    }
    if (closing && o.tableId)
      await tx.diningTable.update({
        where: { id: o.tableId },
        data: { status: "LIBRE" },
      });
    await audit(tx, u, closing ? "PAY" : "PAY_PARTIAL", "orders", id, {
      total: o.total,
      received,
      remaining: remaining - received,
    });
    return findOrder(tx, id, u, branchId);
  };
  return checkoutTx ? settle(checkoutTx) : transaction(settle);
}
export async function checkoutTakeaway(
  body: unknown,
  u: any,
  branchId: string,
) {
  const input = z
    .object({
      idempotencyKey: z.uuid(),
      order: z.record(z.string(), z.unknown()),
      payments: paymentEntries,
    })
    .parse(body);
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ order: input.order, payments: input.payments }))
    .digest("hex");
  return transaction(async (tx) => {
    const existing = await tx.payment.findFirst({
      where: { tenantId: u.tenantId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      const order = await findOrder(tx, existing.orderId, u, branchId);
      const event = await tx.auditLog.findFirst({
        where: {
          tenantId: u.tenantId,
          recordId: order.id,
          action: "CHECKOUT_TAKEAWAY",
        },
      });
      const metadata = z
        .object({ requestHash: z.string() })
        .safeParse(event?.metadata);
      if (
        order.userId !== u.id ||
        !metadata.success ||
        metadata.data.requestHash !== requestHash
      )
        throw new ConflictException(
          "La clave de cobro ya se utilizó con otros datos",
        );
      return order;
    }

    // The order, inventory and cash movement commit together. Kitchen never sees this sale.
    const order = await createOrder(
      { ...input.order, service: "PARA_LLEVAR" },
      u,
      branchId,
      tx,
    );
    const paid = await pay(
      order.id,
      {
        idempotencyKey: input.idempotencyKey,
        payments: input.payments,
      },
      u,
      branchId,
      tx,
    );
    await audit(tx, u, "CHECKOUT_TAKEAWAY", "orders", order.id, {
      requestHash,
    });
    return paid;
  });
}
export async function refund(id: string, body: any, u: any, branchId: string) {
  const b = z
    .object({
      reason: z.string().min(3).max(500),
      method: z.enum(methods),
      items: z
        .array(
          z.object({ id: z.string(), quantity: z.number().int().positive() }),
        )
        .min(1),
    })
    .parse(body);
  if (new Set(b.items.map((i) => i.id)).size !== b.items.length)
    throw new BadRequestException("Ítems repetidos");
  return transaction(async (tx) => {
    const o = await findOrder(tx, id, u, branchId);
    if (o.status !== "CERRADO")
      throw new BadRequestException("Solo se devuelven ventas cobradas");
    const session = await tx.cashSession.findFirst({
      where: { userId: u.id, closedAt: null, register: { branchId } },
    });
    if (!session) throw new BadRequestException("Abre una caja");
    let amount = 0;
    for (const item of b.items) {
      const original = o.items.find((v: any) => v.id === item.id);
      if (
        !original ||
        original.refundedQuantity + item.quantity > original.quantity
      )
        throw new BadRequestException("Cantidad a devolver inválida");
      amount += Math.floor(
        (((original.total * item.quantity) / original.quantity) *
          (o.subtotal - o.discount + o.tax)) /
          o.subtotal,
      );
      await tx.orderItem.update({
        where: { id: item.id },
        data: { refundedQuantity: { increment: item.quantity } },
      });
    }
    const previous = o.refunds.reduce((s: number, r: any) => s + r.amount, 0);
    if (
      o.items.every(
        (i: any) =>
          i.refundedQuantity +
            (b.items.find((v) => v.id === i.id)?.quantity || 0) ===
          i.quantity,
      )
    )
      amount = o.total - previous;
    if (amount + previous > o.total)
      throw new BadRequestException("La devolución supera el pago");
    const row = await tx.refund.create({
      data: {
        orderId: id,
        userId: u.id,
        reason: b.reason,
        amount,
        items: b.items,
      },
    });
    await tx.cashMovement.create({
      data: {
        sessionId: session.id,
        type: "DEVOLUCION",
        method: b.method,
        amount: -amount,
        reason: b.reason,
      },
    });
    await audit(tx, u, "REFUND", "orders", id, { amount });
    return row;
  });
}
export async function currentCash(u: any, branchId: string) {
  const sessions = await db.cashSession.findMany({
    where: { register: { branchId }, closedAt: null },
    include: {
      register: true,
      user: { select: { name: true } },
      movements: true,
    },
  });
  return sessions.map((s) => ({
    ...s,
    expected: cashExpected(s.opening, s.movements),
  }));
}
export async function cashAction(
  action: string,
  body: any,
  u: any,
  branchId: string,
) {
  return transaction(async (tx) => {
    if (action === "open") {
      const b = z
        .object({ registerId: z.string(), opening: money })
        .parse(body);
      if (
        !(await tx.cashRegister.findFirst({
          where: { id: b.registerId, branchId },
        }))
      )
        throw new BadRequestException("Caja inválida");
      if (
        await tx.cashSession.findFirst({
          where: {
            closedAt: null,
            OR: [
              { registerId: b.registerId },
              { userId: u.id, register: { branchId } },
            ],
          },
        })
      )
        throw new BadRequestException(
          "La caja o el usuario ya tiene un turno abierto",
        );
      const s = await tx.cashSession.create({
        data: { registerId: b.registerId, userId: u.id, opening: b.opening },
      });
      await audit(tx, u, "OPEN_CASH", "cash", s.id);
      return s;
    }
    const s = await tx.cashSession.findFirst({
      where: { userId: u.id, closedAt: null, register: { branchId } },
      include: { movements: true },
    });
    if (!s) throw new BadRequestException("No tienes caja abierta");
    if (action === "close") {
      const b = z.object({ counted: money }).parse(body);
      const expected = cashExpected(s.opening, s.movements);
      const row = await tx.cashSession.update({
        where: { id: s.id },
        data: {
          closedAt: new Date(),
          counted: b.counted,
          expected,
          difference: b.counted - expected,
        },
      });
      await audit(tx, u, "CLOSE_CASH", "cash", s.id, {
        expected,
        counted: b.counted,
      });
      return row;
    }
    const b = z
      .object({
        type: z.enum(["INGRESO", "RETIRO", "GASTO"]),
        amount: money.refine((v) => v > 0),
        reason: z.string().min(3).max(500),
      })
      .parse(body);
    const permission = b.type === "INGRESO" ? "caja.ingreso" : "caja.retirar";
    if (!allowed(u.permissions, permission)) throw new ForbiddenException();
    const row = await tx.cashMovement.create({
      data: {
        sessionId: s.id,
        ...b,
        amount: b.type === "INGRESO" ? b.amount : -b.amount,
      },
    });
    await audit(tx, u, "CREATE", "cash", row.id);
    return row;
  });
}
export async function inventoryAction(body: any, u: any, branchId: string) {
  const b = z
    .object({
      ingredientId: z.string(),
      quantity: z
        .number()
        .finite()
        .refine((v) => v !== 0),
      type: z.enum(["ENTRADA", "AJUSTE", "MERMA", "TRASLADO"]),
      reason: z.string().min(3).max(500),
      targetBranchId: z.string().optional(),
    })
    .parse(body);
  return transaction(async (tx) => {
    if (b.type === "TRASLADO") {
      if (
        !b.targetBranchId ||
        b.targetBranchId === branchId ||
        !u.branches.some((v: any) => v.branchId === b.targetBranchId)
      )
        throw new BadRequestException("Sucursal destino no autorizada");
      if (b.quantity <= 0)
        throw new BadRequestException("Cantidad debe ser positiva");
      await stockMove(
        tx,
        u,
        branchId,
        b.ingredientId,
        -b.quantity,
        b.type,
        b.reason,
      );
      await stockMove(
        tx,
        u,
        b.targetBranchId,
        b.ingredientId,
        b.quantity,
        b.type,
        b.reason,
      );
    } else {
      if (b.type === "MERMA" && b.quantity >= 0)
        throw new BadRequestException("La merma debe ser negativa");
      if (b.type === "ENTRADA" && b.quantity < 0)
        throw new BadRequestException("La entrada debe ser positiva");
      await stockMove(
        tx,
        u,
        branchId,
        b.ingredientId,
        b.quantity,
        b.type,
        b.reason,
      );
    }
    await audit(tx, u, "UPDATE", "inventory", b.ingredientId, b);
    return { updated: true };
  });
}
export async function restockIngredients(
  body: unknown,
  u: any,
  branchId: string,
) {
  const items = z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        quantity: z.number().positive(),
      }),
    )
    .min(1)
    .parse(body);
  if (new Set(items.map((item) => item.ingredientId)).size !== items.length)
    throw new BadRequestException("Registra una cantidad por ingrediente");

  return transaction(async (tx) => {
    for (const item of items) {
      const reason = "Reposición desde el POS";
      await stockMove(
        tx,
        u,
        branchId,
        item.ingredientId,
        item.quantity,
        "ENTRADA",
        reason,
      );
      await audit(tx, u, "UPDATE", "inventory", item.ingredientId, {
        ...item,
        type: "ENTRADA",
        reason,
      });
    }
    return { updated: true };
  });
}

export async function purchaseAction(
  id: string | undefined,
  body: any,
  u: any,
  branchId: string,
) {
  return transaction(async (tx) => {
    if (id) {
      const p = await tx.purchase.findFirst({
        where: { id, branchId },
        include: { items: true },
      });
      if (!p || p.status !== "PENDIENTE")
        throw new BadRequestException("Compra no disponible para recepción");
      for (const item of p.items)
        await stockMove(
          tx,
          u,
          branchId,
          item.ingredientId,
          item.quantity,
          "ENTRADA",
          `Compra ${p.id}`,
        );
      const row = await tx.purchase.update({
        where: { id },
        data: { status: "RECIBIDA" },
      });
      await audit(tx, u, "UPDATE", "purchases", id);
      return row;
    }
    const b = z
      .object({
        supplierId: z.string(),
        items: z
          .array(
            z.object({
              ingredientId: z.string(),
              quantity: z.number().positive(),
              cost: money,
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(body);
    if (
      !(await tx.supplier.findFirst({
        where: { id: b.supplierId, tenantId: u.tenantId },
      }))
    )
      throw new BadRequestException("Proveedor inválido");
    for (const i of b.items)
      if (
        !(await tx.ingredient.findFirst({
          where: { id: i.ingredientId, tenantId: u.tenantId },
        }))
      )
        throw new BadRequestException("Ingrediente inválido");
    const row = await tx.purchase.create({
      data: {
        branchId,
        supplierId: b.supplierId,
        total: Math.round(b.items.reduce((s, i) => s + i.quantity * i.cost, 0)),
        items: { create: b.items },
      },
    });
    await audit(tx, u, "CREATE", "purchases", row.id);
    return row;
  });
}
export async function productConfig(id: string, body: any, u: any) {
  const b = z
    .object({
      variants: z
        .array(z.object({ name: z.string().min(1), price: money }))
        .default([]),
      modifierIds: z.array(z.string()).default([]),
      recipe: recipeSchema.default([]),
      prices: z
        .array(z.object({ service: z.enum(services), price: money }))
        .default([]),
    })
    .parse(body);
  return transaction(async (tx) => {
    if (!(await tx.product.findFirst({ where: { id, tenantId: u.tenantId } })))
      throw new NotFoundException();
    // Tienda: la receta es el espejo de stock que mantiene save(); aquí no se toca.
    const keepRecipe = u.tenant.businessType === "TIENDA";
    if (!keepRecipe) await validateRecipe(tx, u.tenantId, b.recipe);
    for (const m of b.modifierIds)
      if (
        !(await tx.modifier.findFirst({
          where: { id: m, tenantId: u.tenantId },
        }))
      )
        throw new BadRequestException("Modificador inválido");
    await tx.variant.deleteMany({ where: { productId: id } });
    await tx.productModifier.deleteMany({ where: { productId: id } });
    if (!keepRecipe)
      await tx.recipeItem.deleteMany({ where: { productId: id } });
    await tx.priceList.deleteMany({ where: { productId: id } });
    const row = await tx.product.update({
      where: { id },
      data: {
        variants: { create: b.variants },
        modifiers: {
          create: b.modifierIds.map((modifierId) => ({ modifierId })),
        },
        ...(keepRecipe ? {} : { recipe: { create: b.recipe } }),
        prices: { create: b.prices },
      },
    });
    await audit(tx, u, "UPDATE", "products", id);
    return row;
  });
}

/** Edits only unprepared orders; historical prices of existing lines are preserved. */
export async function editOrder(
  id: string,
  body: any,
  u: any,
  branchId: string,
) {
  const b = z
    .object({
      notes: z.string().max(2000).optional(),
      roundId: z.string().optional(),
      items: z
        .array(
          z.object({
            id: z.string(),
            quantity: z.number().int().min(0).max(999),
          }),
        )
        .max(100),
      additions: z
        .array(
          z.object({
            productId: z.string(),
            quantity: z.number().int().min(1).max(999),
          }),
        )
        .max(100)
        .default([]),
    })
    .parse(body);
  if (new Set(b.items.map((i) => i.id)).size !== b.items.length)
    throw new BadRequestException("Ítems repetidos");
  return transaction(async (tx) => {
    const o = await findOrder(tx, id, u, branchId);
    if (o.payments.length)
      throw new ConflictException(
        "No puedes editar una cuenta con abonos registrados",
      );
    const round = b.roundId
      ? o.rounds.find((row: any) => row.id === b.roundId)
      : undefined;
    if (b.roundId && !round) throw new NotFoundException("Ronda no encontrada");
    if (
      (o.rounds.length && !round) ||
      ["CERRADO", "CANCELADO"].includes(o.status) ||
      (round?.status ?? o.status) !== "CONFIRMADO"
    )
      throw new ConflictException(
        "Solo puedes corregir productos de una ronda que cocina aún no ha empezado",
      );
    const targetItems = o.items.filter(
      (item: any) => !round || item.roundId === round.id,
    );
    if (
      b.items.length !== targetItems.length ||
      b.items.some(
        (item) => !targetItems.some((current: any) => current.id === item.id),
      )
    )
      throw new ConflictException("El detalle cambió. Recarga el pedido.");
    if (!b.items.some((item) => item.quantity > 0) && !b.additions.length)
      throw new BadRequestException(
        "La ronda debe conservar al menos un producto",
      );
    let subtotal =
      o.subtotal -
      targetItems.reduce((sum: number, item: any) => sum + item.total, 0);
    for (const change of b.items) {
      const line = targetItems.find((i: any) => i.id === change.id);
      if (change.quantity === 0)
        await tx.orderItem.delete({ where: { id: line.id } });
      else {
        const total = line.price * change.quantity;
        subtotal += total;
        await tx.orderItem.update({
          where: { id: line.id },
          data: { quantity: change.quantity, total },
        });
      }
    }
    for (const add of b.additions) {
      const p = await tx.product.findFirst({
        where: { id: add.productId, tenantId: u.tenantId, active: true },
        include: { prices: true },
      });
      if (!p) throw new BadRequestException("Producto no disponible");
      const price =
        p.prices.find((v) => v.service === o.service)?.price ?? p.price;
      const total = price * add.quantity;
      subtotal += total;
      await tx.orderItem.create({
        data: {
          orderId: id,
          roundId: round?.id,
          productId: p.id,
          name: p.name,
          quantity: add.quantity,
          price,
          cost: p.cost,
          total,
          station: p.station,
          modifiers: [],
        },
      });
    }
    await tx.orderItem.updateMany({
      where: { orderId: id, settlementTotal: { not: null } },
      data: { settlementTotal: null },
    });
    const amounts = orderAmounts(o, subtotal);
    await tx.order.update({
      where: { id },
      data: { ...amounts, notes: b.notes },
    });
    await audit(tx, u, "UPDATE", "orders", id, { total: amounts.total });
    return findOrder(tx, id, u, branchId);
  });
}
export async function settlePurchase(
  id: string,
  body: any,
  u: any,
  branchId: string,
) {
  const b = z
    .object({
      amount: money.refine((n) => n > 0),
      reason: z.string().min(3).max(500),
    })
    .parse(body);
  return transaction(async (tx) => {
    const p = await tx.purchase.findFirst({
      where: { id, branchId, status: "RECIBIDA" },
    });
    if (!p || p.paid + b.amount > p.total)
      throw new BadRequestException("Abono inválido o compra sin recibir");
    const row = await tx.purchase.update({
      where: { id },
      data: { paid: { increment: b.amount } },
    });
    await audit(tx, u, "PAY", "purchases", id, b);
    return row;
  });
}
