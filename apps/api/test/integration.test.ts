import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_API_URL || "http://127.0.0.1:3000/api/v1";
let token = "",
  branch = "";
async function call(
  path: string,
  body?: any,
  method?: string,
  extra: any = {},
) {
  const res = await fetch(base + "/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      "X-Branch-Id": branch,
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { ...json, status: res.status, headers: res.headers };
}
test(
  "operación real con MySQL: aislamiento, autorización, cocina, pagos, stock, devoluciones y caja",
  { skip: process.env.RUN_INTEGRATION !== "true" },
  async () => {
    const suffix = randomUUID().slice(0, 8);
    const password = `QA-${randomUUID()}!aB9`;
    const a = await call("auth/register", {
      name: "Prueba A",
      business: "QA aislada " + suffix,
      email: `qa-${suffix}@example.test`,
      password,
    });
    assert.equal(a.status, 201);
    token = a.data.access_token;
    branch = a.data.user.branches[0].branchId;
    const tokenA = token,
      branchA = branch;
    const b = await call("auth/register", {
      name: "Prueba B",
      business: "QA otra " + suffix,
      email: `qa-b-${suffix}@example.test`,
      password,
    });
    assert.equal(b.status, 201);
    const forged = await call("products", undefined, undefined, {
      "X-Branch-Id": b.data.user.branches[0].branchId,
    });
    assert.equal(forged.status, 403);
    const product = await call("products", {
      name: "Producto QA",
      price: 10000,
      cost: 3000,
    });
    assert.equal(product.status, 201);
    const pid = product.data.id;
    const category = await call("categories", { name: "QA" });
    assert.equal(category.status, 201);
    token = b.data.access_token;
    branch = b.data.user.branches[0].branchId;
    assert.equal((await call("products")).data.length, 0);
    assert.equal(
      (await call("products/" + pid, { name: "intruso", price: 1 }, "PUT"))
        .status,
      404,
    );
    assert.equal(
      (
        await call("products", {
          name: "FK externa",
          price: 1,
          categoryId: category.data.id,
        })
      ).status,
      400,
    );
    token = tokenA;
    branch = branchA;
    const cashier = await call("users", {
      name: "Cajero QA",
      email: `cashier-${suffix}@example.test`,
      password,
      role: "CAJERO",
      branchIds: [branch],
    });
    assert.equal(cashier.status, 201);
    const login = await call("auth/login", {
      email: `cashier-${suffix}@example.test`,
      password,
    });
    token = login.data.access_token;
    assert.equal(
      (await call("products", { name: "no autorizado", price: 1 })).status,
      403,
    );
    token = tokenA;
    const table = await call("tables", {
      name: "Mesa QA",
      zone: "QA",
      seats: 2,
    });
    assert.equal(table.status, 201);
    const order = await call("orders", {
      service: "MESA",
      tableId: table.data.id,
      items: [{ productId: pid, quantity: 2 }],
      total: 1,
      tenantId: b.data.user.tenantId,
    });
    assert.equal(order.status, 201);
    assert.equal(order.data.total, 20000);
    assert.equal(order.data.tenantId, a.data.user.tenantId);
    const id = order.data.id;
    assert.equal(
      (
        await call("orders", {
          service: "MESA",
          tableId: table.data.id,
          items: [{ productId: pid, quantity: 1 }],
        })
      ).status,
      400,
    );
    assert.equal(
      (await call("orders/" + id + "/state", { status: "CERRADO" })).status,
      400,
    );
    const edited = await call(
      "orders/" + id,
      {
        notes: "Sin cubiertos",
        items: order.data.items.map((item: any) => ({
          id: item.id,
          quantity: item.quantity,
        })),
      },
      "PUT",
    );
    assert.equal(edited.status, 200);
    assert.equal(edited.data.total, 20000);
    for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
      assert.equal(
        (await call("orders/" + id + "/state", { status })).status,
        201,
      );
    assert.equal(
      (
        await call("orders/" + id + "/payment", {
          idempotencyKey: randomUUID(),
          payments: [{ method: "EFECTIVO", amount: 20000 }],
        })
      ).status,
      400,
    );
    const registers = await call("registers");
    assert.equal(
      (
        await call("cash/open", {
          registerId: registers.data[0].id,
          opening: 50000,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await call("orders/" + id + "/payment", {
          idempotencyKey: randomUUID(),
          payments: [{ method: "EFECTIVO", amount: 1 }],
        })
      ).status,
      400,
    );
    const key = randomUUID(),
      payload = {
        idempotencyKey: key,
        payments: [
          { method: "EFECTIVO", amount: 8000 },
          { method: "NEQUI", amount: 12000 },
        ],
      };
    const paid = await Promise.all([
      call("orders/" + id + "/payment", payload),
      call("orders/" + id + "/payment", payload),
    ]);
    assert.equal(paid[0].status, 201);
    assert.equal(paid[1].status, 201);
    assert.equal((await call("orders/" + id)).data.payments.length, 2);
    assert.equal((await call("tables")).data[0].status, "LIBRE");
    assert.equal(
      (
        await call("orders/" + id + "/payment", {
          ...payload,
          payments: [{ method: "EFECTIVO", amount: 20000 }],
        })
      ).status,
      400,
    );
    const refund = await call("orders/" + id + "/refund", {
      reason: "Prueba devolución",
      method: "EFECTIVO",
      items: [{ id: order.data.items[0].id, quantity: 1 }],
    });
    assert.equal(refund.status, 201);
    assert.equal(refund.data.amount, 10000);
    assert.equal(
      (
        await call("orders/" + id + "/refund", {
          reason: "Exceso",
          method: "EFECTIVO",
          items: [{ id: order.data.items[0].id, quantity: 2 }],
        })
      ).status,
      400,
    );
    const close = await call("cash/close", { counted: 48000 });
    assert.equal(close.status, 201);
    assert.equal(close.data.expected, 48000);
    assert.equal(close.data.difference, 0);
    const reports = await call("reports/sales");
    assert.equal(reports.data.net, 10000);
    const branchReport = await call("reports/sales?scope=authorized");
    assert.equal(
      Object.values(branchReport.data.branches).reduce(
        (total, value) => Number(total) + Number(value),
        0,
      ),
      20000,
    );
    const filteredOrders = await call(
      "orders?status=CERRADO&search=" + order.data.number + "&limit=1",
    );
    assert.equal(filteredOrders.data[0]?.id, id);
    assert.equal(filteredOrders.meta.total, 1);
    token = b.data.access_token;
    branch = b.data.user.branches[0].branchId;
    assert.equal((await call("orders/" + id)).status, 404);
    token = tokenA;
    branch = branchA;
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();
    try {
      const professional = await db.plan.findUniqueOrThrow({
        where: { name: "Professional" },
      });
      await db.subscription.update({
        where: { tenantId: a.data.user.tenantId },
        data: { planId: professional.id },
      });
      const ing = await call("ingredients", {
        name: "Ingrediente QA",
        unit: "unidad",
        cost: 1000,
        minimum: 1,
      });
      assert.equal(ing.status, 201);
      assert.equal(
        (
          await call("inventory/adjustment", {
            ingredientId: ing.data.id,
            quantity: 2,
            type: "ENTRADA",
            reason: "Stock inicial",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await call(
            "products/" + pid,
            { name: "Producto QA", price: 10000, cost: 3000, trackStock: true },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await call("products/" + pid + "/config", {
            recipe: [{ ingredientId: ing.data.id, quantity: 1 }],
          })
        ).status,
        201,
      );
      await call("cash/open", { registerId: registers.data[0].id, opening: 0 });
      const low = await call("orders", {
        service: "PARA_LLEVAR",
        items: [{ productId: pid, quantity: 3 }],
      });
      for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
        await call("orders/" + low.data.id + "/state", { status });
      const denied = await call("orders/" + low.data.id + "/payment", {
        idempotencyKey: randomUUID(),
        payments: [{ method: "EFECTIVO", amount: 30000 }],
      });
      assert.equal(denied.status, 400);
      const unchanged = await call("orders/" + low.data.id);
      assert.equal(unchanged.data.status, "ENTREGADO");
      assert.equal(unchanged.data.payments.length, 0);
      assert.equal((await call("inventory")).data[0].inventory[0].quantity, 2);
      await call("inventory/adjustment", {
        ingredientId: ing.data.id,
        quantity: 2,
        type: "ENTRADA",
        reason: "Reposición",
      });
      const good = await call("orders/" + low.data.id + "/payment", {
        idempotencyKey: randomUUID(),
        payments: [{ method: "EFECTIVO", amount: 30000 }],
      });
      assert.equal(good.status, 201);
      assert.equal((await call("inventory")).data[0].inventory[0].quantity, 1);
      const supplier = await call("suppliers", { name: "Proveedor QA" });
      const purchase = await call("purchases", {
        supplierId: supplier.data.id,
        items: [{ ingredientId: ing.data.id, quantity: 10, cost: 500 }],
      });
      assert.equal(purchase.status, 201);
      assert.equal(
        (await call("purchases/" + purchase.data.id + "/receive", {})).status,
        201,
      );
      assert.equal(
        (await call("purchases/" + purchase.data.id + "/receive", {})).status,
        400,
      );
      assert.equal((await call("inventory")).data[0].inventory[0].quantity, 11);
      assert.equal(
        (
          await call("purchases/" + purchase.data.id + "/payment", {
            amount: 2000,
            reason: "Transferencia QA",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await call("purchases/" + purchase.data.id + "/payment", {
            amount: 4000,
            reason: "Abono excedido",
          })
        ).status,
        400,
      );
      // A table can order again after the first service and keep one payable account.
      const tableId = table.data.id;
      const initial = await call("orders", {
        service: "MESA",
        tableId,
        items: [{ productId: pid, quantity: 1 }],
      });
      assert.equal(initial.status, 201);
      const tableOrderId = initial.data.id;
      const orderPath = "orders/" + tableOrderId;
      for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
        assert.equal(
          (await call(orderPath + "/state", { status })).status,
          201,
        );
      const modifier = await call("modifiers", {
        name: "Extra QA",
        price: 2000,
      });
      assert.equal(modifier.status, 201);
      assert.equal(
        (
          await call("products/" + pid + "/config", {
            variants: [{ name: "Grande QA", price: 15000 }],
            modifierIds: [modifier.data.id],
            recipe: [{ ingredientId: ing.data.id, quantity: 1 }],
          })
        ).status,
        201,
      );
      const menu = await call("products");
      const variantId = menu.data.find((p: any) => p.id === pid).variants[0].id;
      const roundRequest = {
        requestKey: randomUUID(),
        items: [
          {
            productId: pid,
            quantity: 1,
            variantId,
            modifierIds: [modifier.data.id],
            notes: "Sin sal",
          },
        ],
      };
      const [firstRound, repeatedRound] = await Promise.all([
        call(orderPath + "/rounds", roundRequest),
        call(orderPath + "/rounds", roundRequest),
      ]);
      assert.equal(firstRound.status, 201, firstRound.message);
      assert.equal(repeatedRound.status, 201, repeatedRound.message);
      assert.equal(firstRound.data.total, 27000);
      assert.equal(repeatedRound.data.items.length, 2);
      assert.deepEqual(
        firstRound.data.rounds.map((round: any) => round.status),
        ["ENTREGADO", "CONFIRMADO"],
      );
      const additional = firstRound.data.rounds[1];
      const newLine = firstRound.data.items.find(
        (item: any) => item.roundId === additional.id,
      );
      assert.equal(newLine.price, 17000);
      assert.equal(newLine.notes, "Sin sal");
      assert.equal(
        firstRound.data.items.find(
          (item: any) => item.id === initial.data.items[0].id,
        ).price,
        10000,
      );
      assert.equal(
        (await call("tables/" + tableId + "/order")).data.id,
        tableOrderId,
      );
      assert.equal(
        (
          await call(orderPath + "/rounds", {
            ...roundRequest,
            items: [{ productId: pid, quantity: 9 }],
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call(orderPath + "/payment", {
            idempotencyKey: randomUUID(),
            payments: [{ method: "EFECTIVO", amount: 27000 }],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await call(orderPath + "/state", {
            status: "CANCELADO",
            reason: "Mesa ya servida",
          })
        ).status,
        409,
      );
      const thirdRound = await call(orderPath + "/rounds", {
        requestKey: randomUUID(),
        items: [{ productId: pid, quantity: 1 }],
      });
      assert.equal(thirdRound.status, 201);
      const third = thirdRound.data.rounds[2];
      const corrected = await call(
        orderPath,
        {
          roundId: third.id,
          items: [
            {
              id: thirdRound.data.items.find(
                (item: any) => item.roundId === third.id,
              ).id,
              quantity: 2,
            },
          ],
        },
        "PUT",
      );
      assert.equal(corrected.status, 200);
      assert.equal(corrected.data.total, 47000);
      const destination = await call("tables", {
        name: "Mesa destino QA",
        zone: "QA",
        seats: 4,
      });
      assert.equal(destination.status, 201);
      const reserved = await call("tables", {
        name: "Mesa reservada QA",
        zone: "QA",
        seats: 4,
        status: "RESERVADA",
      });
      assert.equal(reserved.status, 201);
      assert.equal(
        (
          await call(orderPath + "/move-table", {
            sourceTableId: tableId,
            targetTableId: reserved.data.id,
          })
        ).status,
        409,
      );
      assert.equal(
        (await call("tables/" + tableId + "/order")).data.id,
        tableOrderId,
      );
      const transfer = {
        sourceTableId: tableId,
        targetTableId: destination.data.id,
      };
      const moved = await call(orderPath + "/move-table", transfer);
      assert.equal(moved.status, 201);
      assert.equal(moved.data.id, tableOrderId);
      assert.equal(moved.data.tableId, destination.data.id);
      assert.equal(moved.data.total, 47000);
      assert.deepEqual(moved.data.rounds, corrected.data.rounds);
      assert.deepEqual(
        moved.data.items.map((item: any) => item.id).sort(),
        corrected.data.items.map((item: any) => item.id).sort(),
      );
      assert.equal(
        (await call(orderPath + "/move-table", transfer)).status,
        201,
      );
      assert.equal((await call("tables/" + tableId + "/order")).status, 404);
      assert.equal(
        (await call("tables/" + destination.data.id + "/order")).data.id,
        tableOrderId,
      );
      for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
        assert.equal(
          (await call(orderPath + "/state", { roundId: third.id, status }))
            .status,
          201,
        );
      assert.equal((await call(orderPath)).data.status, "CONFIRMADO");
      for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
        assert.equal(
          (await call(orderPath + "/state", { roundId: additional.id, status }))
            .status,
          201,
        );
      const items = [{ id: newLine.id, quantity: 1 }];
      const quote = await call(orderPath + "/product-quote", { items });
      assert.equal(quote.status, 201, quote.message);
      assert.equal(quote.data.amount, 17000);
      const firstPart = {
        items,
        idempotencyKey: randomUUID(),
        partial: true,
        expectedPaid: 0,
        payments: [{ method: "EFECTIVO", amount: 17000 }],
      };
      const [partial, retried] = await Promise.all([
        call(orderPath + "/payment", firstPart),
        call(orderPath + "/payment", firstPart),
      ]);
      assert.equal(partial.status, 201, partial.message);
      assert.equal(retried.status, 201, retried.message);
      assert.equal(partial.data.status, "ENTREGADO");
      assert.equal(retried.data.payments.length, 1);
      assert.equal(
        (await call("tables")).data.find(
          (row: any) => row.id === destination.data.id,
        ).status,
        "OCUPADA",
      );
      assert.equal((await call("inventory")).data[0].inventory[0].quantity, 7);
      assert.equal(
        (
          await call(orderPath + "/payment", {
            ...firstPart,
            idempotencyKey: randomUUID(),
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call(orderPath + "/payment", {
            ...firstPart,
            idempotencyKey: randomUUID(),
            expectedPaid: 17000,
            items: undefined,
            payments: [{ method: "EFECTIVO", amount: 30001 }],
          })
        ).status,
        400,
      );
      assert.equal(
        (await call(orderPath + "/product-quote", { items })).status,
        409,
      );
      const afterAbono = await call(orderPath + "/rounds", {
        requestKey: randomUUID(),
        items: [{ productId: pid, quantity: 1 }],
      });
      assert.equal(afterAbono.status, 201, afterAbono.message);
      assert.equal(afterAbono.data.total, 57000);
      assert.equal(afterAbono.data.payments[0].amount, 17000);
      assert.equal(afterAbono.data.payments[0].items[0].id, newLine.id);
      assert.equal(
        afterAbono.data.total - afterAbono.data.payments[0].amount,
        40000,
      );
      const lastRound = afterAbono.data.rounds.at(-1);
      assert.equal(
        (
          await call(orderPath + "/payment", {
            idempotencyKey: randomUUID(),
            payments: [{ method: "EFECTIVO", amount: 40000 }],
          })
        ).status,
        400,
      );
      for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
        assert.equal(
          (await call(orderPath + "/state", { roundId: lastRound.id, status }))
            .status,
          201,
        );
      const movedWithPayment = await call(orderPath + "/move-table", {
        sourceTableId: destination.data.id,
        targetTableId: tableId,
      });
      assert.equal(movedWithPayment.status, 201);
      assert.equal(movedWithPayment.data.payments[0].amount, 17000);
      const closingPayment = await call(orderPath + "/payment", {
        idempotencyKey: randomUUID(),
        payments: [
          { method: "TARJETA", amount: 20000 },
          { method: "NEQUI", amount: 20000 },
        ],
      });
      assert.equal(closingPayment.status, 201, closingPayment.message);
      assert.equal(closingPayment.data.status, "CERRADO");
      assert.equal(
        closingPayment.data.payments.reduce(
          (sum: number, payment: any) => sum + payment.amount,
          0,
        ),
        57000,
      );
      const tableList = (await call("tables")).data;
      assert.equal(
        tableList.find((row: any) => row.id === tableId).status,
        "LIBRE",
      );
      assert.equal(
        tableList.find((row: any) => row.id === destination.data.id).status,
        "LIBRE",
      );
      assert.equal((await call("inventory")).data[0].inventory[0].quantity, 6);
      const shifts = (await call("cash/current")).data;
      const splitMovements = shifts
        .flatMap((shift: any) => shift.movements)
        .filter(
          (movement: any) =>
            movement.reason === "Venta #" + initial.data.number,
        );
      assert.equal(splitMovements.length, 3);
      assert.equal(
        splitMovements.reduce(
          (sum: number, movement: any) => sum + movement.amount,
          0,
        ),
        57000,
      );
      const dateInBogota = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
      });
      const finalPaymentDate = new Date(
        closingPayment.data.payments.at(-1).createdAt,
      );
      const previousDay = new Date(finalPaymentDate.getTime() - 86400000);
      await db.payment.updateMany({
        where: {
          orderId: tableOrderId,
          idempotencyKey: firstPart.idempotencyKey,
        },
        data: { createdAt: previousDay },
      });
      const previousReport = await call(
        "reports/sales?from=" +
          dateInBogota.format(previousDay) +
          "&to=" +
          dateInBogota.format(previousDay),
      );
      const finalReport = await call(
        "reports/sales?from=" +
          dateInBogota.format(finalPaymentDate) +
          "&to=" +
          dateInBogota.format(finalPaymentDate),
      );
      assert.equal(
        previousReport.data.orders.filter(
          (item: any) => item.id === tableOrderId,
        ).length,
        0,
      );
      assert.equal(
        finalReport.data.orders.filter((item: any) => item.id === tableOrderId)
          .length,
        1,
      );
      assert.equal(
        (
          await call(orderPath + "/rounds", {
            ...roundRequest,
            requestKey: randomUUID(),
          })
        ).status,
        409,
      );
      // Unir una cuenta abonada con una ronda pendiente conserva ambas hasta el cierre.
      const mergeProduct = await call("products", {
        name: "Producto unión QA",
        price: 10000,
      });
      const makeTableOrder = (tableId: string, quantity: number) =>
        call("orders", {
          service: "MESA",
          tableId,
          items: [{ productId: mergeProduct.data.id, quantity }],
        });
      const source = await makeTableOrder(tableId, 2);
      const target = await makeTableOrder(destination.data.id, 1);
      assert.equal(source.status, 201, source.message);
      assert.equal(target.status, 201, target.message);
      const sourcePath = "orders/" + source.data.id;
      for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
        assert.equal(
          (await call(sourcePath + "/state", { status })).status,
          201,
        );
      const deposit = await call(sourcePath + "/payment", {
        idempotencyKey: randomUUID(),
        partial: true,
        expectedPaid: 0,
        items: [{ id: source.data.items[0].id, quantity: 1 }],
        payments: [{ method: "EFECTIVO", amount: 10000 }],
      });
      assert.equal(deposit.status, 201, deposit.message);
      const join = {
        sourceTableId: tableId,
        targetTableId: destination.data.id,
        targetOrderId: target.data.id,
      };
      const [joined, replayed] = await Promise.all([
        call(sourcePath + "/merge-table", join),
        call(sourcePath + "/merge-table", join),
      ]);
      for (const response of [joined, replayed]) {
        assert.equal(response.status, 201, response.message);
        assert.equal(response.data.id, target.data.id);
        assert.equal(response.data.total, 30000);
        assert.equal(response.data.payments.length, 1);
        assert.equal(response.data.payments[0].id, deposit.data.payments[0].id);
        assert.deepEqual(
          response.data.rounds.map((round: any) => round.status),
          ["CONFIRMADO", "ENTREGADO"],
        );
      }
      assert.equal((await call("tables/" + tableId + "/order")).status, 404);
      assert.equal((await call(sourcePath)).data.mergedIntoId, target.data.id);
      const targetPath = "orders/" + target.data.id;
      const finalCharge = {
        idempotencyKey: randomUUID(),
        payments: [{ method: "NEQUI", amount: 20000 }],
      };
      assert.equal(
        (await call(targetPath + "/payment", finalCharge)).status,
        400,
      );
      for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
        assert.equal(
          (
            await call(targetPath + "/state", {
              status,
              roundId: joined.data.rounds[0].id,
            })
          ).status,
          201,
        );
      const charged = await call(targetPath + "/payment", finalCharge);
      assert.equal(charged.status, 201, charged.message);
      assert.equal(charged.data.status, "CERRADO");
      assert.equal(
        charged.data.payments.reduce(
          (sum: number, payment: any) => sum + payment.amount,
          0,
        ),
        30000,
      );
      const toSplit = await makeTableOrder(tableId, 3);
      assert.equal(toSplit.status, 201, toSplit.message);
      const splitPath = "orders/" + toSplit.data.id;
      for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
        assert.equal(
          (await call(splitPath + "/state", { status })).status,
          201,
        );
      const lineId = toSplit.data.items[0].id;
      const splitDeposit = await call(splitPath + "/payment", {
        idempotencyKey: randomUUID(),
        partial: true,
        expectedPaid: 0,
        payments: [{ method: "EFECTIVO", amount: 15000 }],
      });
      assert.equal(splitDeposit.status, 201, splitDeposit.message);
      assert.equal(
        (
          await call(splitPath + "/split-table-quote", {
            items: [{ id: lineId, quantity: 2 }],
          })
        ).status,
        400,
      );
      const selection = [{ id: lineId, quantity: 1 }];
      const splitPreview = await call(splitPath + "/split-table-quote", {
        items: selection,
      });
      assert.deepEqual(splitPreview.data, {
        amount: 10000,
        sourceBalance: 5000,
      });
      const splitBody = {
        sourceTableId: tableId,
        targetTableId: destination.data.id,
        requestKey: randomUUID(),
        expectedAmount: 10000,
        expectedSourceBalance: 5000,
        items: selection,
      };
      const [split, splitRetry] = await Promise.all([
        call(splitPath + "/split-table", splitBody),
        call(splitPath + "/split-table", splitBody),
      ]);
      assert.equal(split.status, 201, split.message);
      assert.equal(splitRetry.status, 201, splitRetry.message);
      assert.equal(split.data.target.id, splitRetry.data.target.id);
      assert.equal(split.data.source.total, 20000);
      assert.equal(
        split.data.source.payments[0].id,
        splitDeposit.data.payments[0].id,
      );
      assert.equal(split.data.source.items[0].quantity, 2);
      assert.equal(split.data.target.total, 10000);
      assert.equal(split.data.target.items[0].quantity, 1);
      assert.equal(split.data.target.payments.length, 0);
      for (const [account, amount] of [
        [split.data.source, 5000],
        [split.data.target, 10000],
      ]) {
        const receipt = await call("orders/" + account.id + "/payment", {
          idempotencyKey: randomUUID(),
          payments: [{ method: "NEQUI", amount }],
        });
        assert.equal(receipt.status, 201, receipt.message);
        assert.equal(receipt.data.status, "CERRADO");
        assert.equal(
          receipt.data.payments.reduce(
            (sum: number, payment: any) => sum + payment.amount,
            0,
          ),
          account.total,
        );
      }
      const receiving = await makeTableOrder(destination.data.id, 2);
      const sending = await makeTableOrder(tableId, 2);
      assert.equal(receiving.status, 201);
      assert.equal(sending.status, 201);
      const receivingPath = "orders/" + receiving.data.id;
      const sendingPath = "orders/" + sending.data.id;
      for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
        assert.equal(
          (await call(receivingPath + "/state", { status })).status,
          201,
        );
      const receivingDeposit = await call(receivingPath + "/payment", {
        idempotencyKey: randomUUID(),
        partial: true,
        expectedPaid: 0,
        payments: [{ method: "EFECTIVO", amount: 5000 }],
      });
      assert.equal(receivingDeposit.status, 201);
      const moveItems = [{ id: sending.data.items[0].id, quantity: 1 }];
      const occupiedQuote = await call(sendingPath + "/split-table-quote", {
        items: moveItems,
        targetTableId: destination.data.id,
      });
      assert.deepEqual(occupiedQuote.data, {
        amount: 10000,
        sourceBalance: 10000,
        targetOrderId: receiving.data.id,
        targetBalance: 25000,
      });
      const occupiedRequest = {
        sourceTableId: tableId,
        targetTableId: destination.data.id,
        requestKey: randomUUID(),
        items: moveItems,
        expectedAmount: 10000,
        expectedSourceBalance: 10000,
        expectedTargetOrderId: receiving.data.id,
        expectedTargetBalance: 25000,
      };
      assert.equal(
        (
          await call(sendingPath + "/split-table", {
            ...occupiedRequest,
            expectedTargetBalance: 30000,
          })
        ).status,
        409,
      );
      const movedProducts = await call(
        sendingPath + "/split-table",
        occupiedRequest,
      );
      assert.equal(movedProducts.status, 201, movedProducts.message);
      const existingAccount = movedProducts.data.target;
      assert.equal(existingAccount.id, receiving.data.id);
      assert.equal(existingAccount.total, 30000);
      assert.deepEqual(
        existingAccount.payments.map((payment: any) => payment.id),
        [receivingDeposit.data.payments[0].id],
      );
      assert.deepEqual(
        existingAccount.rounds.map((round: any) => round.status),
        ["ENTREGADO", "CONFIRMADO"],
      );
      const remainingCharge = {
        idempotencyKey: randomUUID(),
        payments: [{ method: "NEQUI", amount: 25000 }],
      };
      assert.equal(
        (await call(receivingPath + "/payment", remainingCharge)).status,
        400,
      );
      for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
        assert.equal(
          (
            await call(receivingPath + "/state", {
              status,
              roundId: existingAccount.rounds[1].id,
            })
          ).status,
          201,
        );
      const settledDestination = await call(
        receivingPath + "/payment",
        remainingCharge,
      );
      assert.equal(settledDestination.status, 201, settledDestination.message);
      assert.equal(settledDestination.data.status, "CERRADO");
      const takeaway = {
        idempotencyKey: randomUUID(),
        order: { items: [{ productId: mergeProduct.data.id, quantity: 1 }] },
        payments: [{ method: "EFECTIVO", amount: 10000, cashReceived: 20000 }],
      };
      const beforeCheckout = await db.order.count({
        where: { branchId: branch },
      });
      const wrongTotal = await call("orders/takeaway-checkout", {
        ...takeaway,
        payments: [{ method: "EFECTIVO", amount: 1 }],
      });
      assert.equal(wrongTotal.status, 400);
      assert.equal(
        await db.order.count({ where: { branchId: branch } }),
        beforeCheckout,
      );
      const insufficientCash = await call("orders/takeaway-checkout", {
        ...takeaway,
        payments: [{ method: "EFECTIVO", amount: 10000, cashReceived: 5000 }],
      });
      assert.equal(insufficientCash.status, 400);
      const [sale, replay] = await Promise.all([
        call("orders/takeaway-checkout", takeaway),
        call("orders/takeaway-checkout", takeaway),
      ]);
      assert.equal(sale.status, 201, sale.message);
      assert.equal(replay.status, 201, replay.message);
      assert.equal(sale.data.id, replay.data.id);
      assert.equal(sale.data.status, "CERRADO");
      assert.equal(sale.data.service, "PARA_LLEVAR");
      assert.equal(sale.data.payments.length, 1);
      assert.equal(sale.data.payments[0].cashReceived, 20000);
      assert.equal(sale.data.payments[0].cashChange, 10000);

      assert.equal(
        await db.order.count({ where: { branchId: branch } }),
        beforeCheckout + 1,
      );
      assert.equal(
        await db.cashMovement.count({
          where: {
            sessionId: sale.data.payments[0].sessionId,
            reason: "Venta #" + sale.data.number,
            amount: 10000,
          },
        }),
        1,
      );
      await db.order.update({
        where: { id },
        data: { createdAt: new Date(Date.now() - 60 * 86400000) },
      });
      assert.equal(
        (await call("reports/sales")).data.orders.some((o: any) => o.id === id),
        true,
        "Una venta se reporta por fecha de cobro",
      );
    } finally {
      await db.$disconnect();
    }
    const cookie = a.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await call("auth/logout", {}, undefined, { Cookie: cookie })).status,
      201,
    );
    assert.equal((await call("products")).status, 401);
  },
);
