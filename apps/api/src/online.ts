// Menú QR y pedidos en línea: el cliente pide sin cuenta; caja acepta o rechaza.
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { db, transaction } from "./db";
import { audit } from "./auth";
import { createOrder, findOrder } from "./operations";

const activeSubscription = ["TRIAL", "ACTIVA", "PAST_DUE"];

/** Sucursal que acepta pedidos en línea, con su empresa y quien figura como creador. */
async function onlineBranch(branchId: string) {
  const branch = await db.branch.findFirst({
    where: { id: branchId, active: true },
    include: {
      tenant: { include: { subscription: { include: { plan: true } } } },
    },
  });
  const t = branch?.tenant;
  const sub = t?.subscription;
  if (
    !branch ||
    !t ||
    t.status !== "ACTIVA" ||
    !sub ||
    !activeSubscription.includes(sub.status) ||
    (sub.status === "TRIAL" && sub.renewsAt < new Date())
  )
    throw new NotFoundException("Menú no disponible");
  return branch;
}

export async function publicMenu(branchId: string, tableId?: string) {
  const branch = await onlineBranch(branchId);
  const t = branch.tenant;
  const table = tableId
    ? await db.diningTable.findFirst({
        where: { id: tableId, branchId },
        select: { id: true, name: true },
      })
    : null;
  const products = await db.product.findMany({
    where: { tenantId: t.id, active: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      category: { select: { id: true, name: true } },
      variants: { select: { id: true, name: true, price: true } },
      modifiers: {
        select: { modifier: { select: { id: true, name: true, price: true } } },
      },
    },
    orderBy: { name: "asc" },
    take: 500,
  });
  return {
    business: t.name,
    branch: branch.name,
    businessType: t.businessType,
    accepting: t.onlineOrders,
    table,
    products,
  };
}

const phoneDigits = (v: string) => v.replace(/\D/g, "").slice(-10);

export async function publicOrder(branchId: string, body: unknown) {
  const b = z
    .object({
      name: z.string().trim().min(2).max(80),
      phone: z
        .string()
        .trim()
        .refine((v) => phoneDigits(v).length >= 7, "Escribe un celular válido"),
      notes: z.string().trim().max(300).optional(),
      tableId: z.string().max(64).optional(),
      // Campo trampa: los humanos no lo ven; si viene lleno es un bot.
      website: z.string().max(0).optional(),
      items: z
        .array(
          z.object({
            productId: z.string().min(1),
            variantId: z.string().optional(),
            modifierIds: z.array(z.string()).max(10).default([]),
            quantity: z.number().int().min(1).max(20),
            notes: z.string().max(200).optional(),
          }),
        )
        .min(1)
        .max(30),
    })
    .parse(body);
  const branch = await onlineBranch(branchId);
  const tenant = branch.tenant;
  if (!tenant.onlineOrders)
    throw new BadRequestException(
      "Este negocio no está recibiendo pedidos en línea",
    );
  if (b.tableId && !tenant.usesTables && tenant.businessType === "TIENDA")
    throw new BadRequestException("Este negocio no atiende en mesas");
  // El pedido figura creado por el propietario: no hay usuario de cliente.
  const owner = await db.user.findFirst({
    where: { tenantId: tenant.id, role: "OWNER", active: true },
    include: { branches: { include: { branch: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) throw new NotFoundException("Menú no disponible");
  const actor = { ...owner, tenant, permissions: [] as string[] };
  const phone = phoneDigits(b.phone);
  const customer =
    (await db.customer.findFirst({
      where: { tenantId: tenant.id, phone: { contains: phone } },
    })) ??
    (await db.customer.create({
      data: { tenantId: tenant.id, name: b.name, phone },
    }));
  const service = b.tableId
    ? "MESA"
    : tenant.businessType === "TIENDA"
      ? "PARA_LLEVAR"
      : "RECOGER";
  const order: any = await createOrder(
    {
      service,
      source: "WEB",
      draft: true,
      tableId: b.tableId,
      customerId: customer.id,
      notes: [`Pedido en línea de ${b.name}`, b.notes]
        .filter(Boolean)
        .join(" · "),
      items: b.items,
    },
    actor,
    branchId,
  );
  await db.notification.create({
    data: {
      tenantId: tenant.id,
      title: `Pedido en línea #${order.number} por aceptar${order.table ? ` · ${order.table.name}` : ""}`,
    },
  });
  return { number: order.number, total: order.total };
}

const activeStates = ["CONFIRMADO", "EN_PREPARACION", "LISTO", "ENTREGADO"];

export async function acceptDraft(id: string, u: any, branchId: string) {
  return transaction(async (tx) => {
    const draft = await findOrder(tx, id, u, branchId);
    if (draft.status !== "BORRADOR")
      throw new ConflictException("El pedido ya fue atendido");
    // Tienda con mesas: la cuenta de mesa no pasa por despachos.
    const ready =
      u.tenant.businessType === "TIENDA" && draft.service === "MESA";
    if (draft.service === "MESA" && draft.tableId) {
      const account = await tx.order.findFirst({
        where: {
          tableId: draft.tableId,
          branchId,
          service: "MESA",
          status: { in: activeStates },
        },
        include: { rounds: true, payments: true },
      });
      if (account) {
        // La mesa ya tiene cuenta: el pedido del QR entra como una ronda nueva.
        if (account.payments.length)
          throw new ConflictException(
            "La cuenta de la mesa ya tiene abonos. Agrega los productos desde la mesa.",
          );
        let rounds = account.rounds;
        if (!rounds.length) {
          const first = await tx.orderRound.create({
            data: {
              orderId: account.id,
              sequence: 1,
              status: account.status,
              createdAt: account.createdAt,
            },
          });
          await tx.orderItem.updateMany({
            where: { orderId: account.id, roundId: null },
            data: { roundId: first.id },
          });
          rounds = [first];
        }
        const round = await tx.orderRound.create({
          data: {
            orderId: account.id,
            sequence: Math.max(...rounds.map((r) => r.sequence)) + 1,
            status: ready ? "ENTREGADO" : "CONFIRMADO",
          },
        });
        await tx.orderItem.updateMany({
          where: { orderId: draft.id },
          data: { orderId: account.id, roundId: round.id },
        });
        await tx.order.update({
          where: { id: account.id },
          data: {
            subtotal: account.subtotal + draft.subtotal,
            discount: account.discount + draft.discount,
            promoDiscount: account.promoDiscount + draft.promoDiscount,
            tax: account.tax + draft.tax,
            total: account.total + draft.total,
            status:
              ready && account.status === "ENTREGADO"
                ? "ENTREGADO"
                : "CONFIRMADO",
            customerId: account.customerId ?? draft.customerId,
            notes:
              [account.notes, draft.notes].filter(Boolean).join("\n") || null,
          },
        });
        await tx.order.update({
          where: { id: draft.id },
          data: { status: "CANCELADO", mergedIntoId: account.id },
        });
        await audit(tx, u, "ACCEPT_ONLINE", "orders", account.id, {
          draftId: draft.id,
        });
        return findOrder(tx, account.id, u, branchId);
      }
      const claimed = await tx.diningTable.updateMany({
        where: { id: draft.tableId, branchId, status: "LIBRE" },
        data: { status: "OCUPADA" },
      });
      if (!claimed.count)
        throw new ConflictException(
          "La mesa está ocupada o fuera de servicio. Ábrela desde el salón y vuelve a aceptar.",
        );
    }
    await tx.order.update({
      where: { id: draft.id },
      data: { status: ready ? "ENTREGADO" : "CONFIRMADO" },
    });
    await audit(tx, u, "ACCEPT_ONLINE", "orders", draft.id);
    return findOrder(tx, draft.id, u, branchId);
  });
}

export async function rejectDraft(
  id: string,
  body: unknown,
  u: any,
  branchId: string,
) {
  const { reason } = z
    .object({ reason: z.string().trim().min(3).max(300) })
    .parse(body);
  return transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id, branchId, tenantId: u.tenantId, status: "BORRADOR" },
      data: { status: "CANCELADO" },
    });
    if (!claimed.count)
      throw new ConflictException("El pedido ya fue atendido");
    await audit(tx, u, "REJECT_ONLINE", "orders", id, { reason });
    return { rejected: true };
  });
}
