// Modo RESTAURANTE contra MySQL real: empresa desechable que se borra al final.
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/db";
import { save } from "../src/catalog";
import {
  checkoutTakeaway,
  createOrder,
  orderState,
  orders,
} from "../src/operations";

test(
  "restaurante: gaseosa sin receta con stock por unidad; mesa y recoger van a cocina",
  { skip: process.env.RUN_INTEGRATION !== "true" },
  async () => {
    const plan = await db.plan.findFirstOrThrow();
    const tenant = await db.tenant.create({
      data: {
        name: "QA Restaurante (temporal)",
        branches: { create: { name: "Principal" } },
        subscription: {
          create: {
            planId: plan.id,
            status: "ACTIVA",
            renewsAt: new Date(Date.now() + 864e5),
          },
        },
      },
      include: { branches: true },
    });
    const branchId = tenant.branches[0].id;
    try {
      const user = await db.user.create({
        data: {
          tenantId: tenant.id,
          name: "QA",
          email: `qa-${tenant.id}@gpos.local`,
          passwordHash: "x",
          role: "ADMIN",
          permissions: ["*"],
        },
      });
      const register = await db.cashRegister.create({
        data: { branchId, name: "Caja" },
      });
      await db.cashSession.create({
        data: { registerId: register.id, userId: user.id, opening: 0 },
      });
      const u: any = {
        ...user,
        tenant: await db.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
          include: { subscription: { include: { plan: true } } },
        }),
      };
      u.tenant.subscription.plan.limits = {}; // sin límites: no depender del plan sembrado

      // Una gaseosa se vende tal cual: sin ingredientes, su stock se crea solo y se cuenta por unidad.
      const soda = await save(
        "products",
        undefined,
        {
          name: "Coca-Cola QA",
          price: 4000,
          cost: 2000,
          trackStock: true,
          lowStockThreshold: 2,
          active: true,
          recipe: [],
        },
        u,
        branchId,
      );
      const [mirror, ...extra] = await db.recipeItem.findMany({
        where: { productId: soda.id },
        include: { ingredient: true },
      });
      assert.equal(extra.length, 0);
      assert.equal(mirror.quantity, 1);
      assert.equal(mirror.ingredient.name, "Coca-Cola QA");
      await db.inventory.create({
        data: { branchId, ingredientId: mirror.ingredientId, quantity: 5 },
      });
      // Editarla sin ingredientes reutiliza el mismo espejo.
      await save(
        "products",
        soda.id,
        {
          name: "Coca-Cola 400ml QA",
          price: 4000,
          cost: 2000,
          trackStock: true,
          active: true,
          recipe: [],
        },
        u,
        branchId,
      );
      const [renamed] = await db.recipeItem.findMany({
        where: { productId: soda.id },
        include: { ingredient: true },
      });
      assert.equal(renamed.ingredientId, mirror.ingredientId);
      assert.equal(renamed.ingredient.name, "Coca-Cola 400ml QA");

      // Un plato con receta sigue usando sus ingredientes.
      const beef = await db.ingredient.create({
        data: { tenantId: tenant.id, name: "Carne QA", unit: "g" },
      });
      const burger = await save(
        "products",
        undefined,
        {
          name: "Hamburguesa QA",
          price: 20000,
          trackStock: true,
          active: true,
          recipe: [{ ingredientId: beef.id, quantity: 150 }],
        },
        u,
        branchId,
      );
      const burgerRecipe = await db.recipeItem.findMany({
        where: { productId: burger.id },
      });
      assert.deepEqual(
        burgerRecipe.map((r) => [r.ingredientId, r.quantity]),
        [[beef.id, 150]],
      );

      // Venta en mostrador de 2 gaseosas: descuenta 2 unidades.
      const sale: any = await checkoutTakeaway(
        {
          idempotencyKey: randomUUID(),
          order: { items: [{ productId: soda.id, quantity: 2 }] },
          payments: [{ method: "EFECTIVO", amount: 8000 }],
        },
        u,
        branchId,
      );
      assert.equal(sale.status, "CERRADO");
      const stock = await db.inventory.findFirstOrThrow({
        where: { branchId, ingredientId: mirror.ingredientId },
      });
      assert.equal(stock.quantity, 3);

      // La gaseosa sola no genera ticket de cocina.
      assert.equal(sale.rounds.length, 0);

      // Para llevar con comida: se cobra y queda cerrado, pero cocina recibe el ticket.
      await db.inventory.create({
        data: { branchId, ingredientId: beef.id, quantity: 1000 },
      });
      const meal: any = await checkoutTakeaway(
        {
          idempotencyKey: randomUUID(),
          order: {
            items: [
              { productId: burger.id, quantity: 1 },
              { productId: soda.id, quantity: 1 },
            ],
          },
          payments: [{ method: "EFECTIVO", amount: 24000 }],
        },
        u,
        branchId,
      );
      assert.equal(meal.status, "CERRADO");
      assert.equal(meal.rounds.length, 1);
      assert.equal(meal.rounds[0].status, "CONFIRMADO");
      const kitchen: any = await orders(u, branchId, { kitchen: "true" });
      const rows = kitchen.data ?? kitchen;
      assert.ok(
        rows.some((o: any) => o.id === meal.id),
        "cocina lo ve",
      );
      await assert.rejects(
        orderState(meal.id, { status: "CANCELADO", reason: "x" }, u, branchId),
        /cerrada/,
      );
      const roundId = meal.rounds[0].id;
      for (const status of ["EN_PREPARACION", "LISTO", "ENTREGADO"])
        await orderState(meal.id, { status, roundId }, u, branchId);
      const done = await db.order.findUniqueOrThrow({
        where: { id: meal.id },
        include: { rounds: true },
      });
      assert.equal(done.status, "CERRADO", "sigue cobrado");
      assert.equal(done.rounds[0].status, "ENTREGADO");
      const after: any = await orders(u, branchId, { kitchen: "true" });
      assert.ok(!(after.data ?? after).some((o: any) => o.id === meal.id));

      // Restaurante: mesa y para recoger existen y van a cocina.
      const table = await db.diningTable.create({
        data: { branchId, name: "M1" },
      });
      const tableOrder: any = await createOrder(
        {
          service: "MESA",
          tableId: table.id,
          items: [{ productId: soda.id, quantity: 1 }],
        },
        u,
        branchId,
      );
      assert.equal(tableOrder.status, "CONFIRMADO");
      const pickup: any = await createOrder(
        { service: "RECOGER", items: [{ productId: soda.id, quantity: 1 }] },
        u,
        branchId,
      );
      assert.equal(pickup.status, "CONFIRMADO");
    } finally {
      const t = tenant.id;
      const orders = { tenantId: t };
      await db.$transaction([
        db.payment.deleteMany({ where: { order: orders } }),
        db.orderItem.deleteMany({ where: { order: orders } }),
        db.orderRound.deleteMany({ where: { order: orders } }),
        db.delivery.deleteMany({ where: { order: orders } }),
        db.order.deleteMany({ where: orders }),
        db.cashMovement.deleteMany({
          where: { session: { register: { branchId } } },
        }),
        db.cashSession.deleteMany({ where: { register: { branchId } } }),
        db.cashRegister.deleteMany({ where: { branchId } }),
        db.inventoryMovement.deleteMany({ where: { branchId } }),
        db.inventory.deleteMany({ where: { branchId } }),
        db.recipeItem.deleteMany({ where: { product: { tenantId: t } } }),
        db.product.deleteMany({ where: { tenantId: t } }),
        db.ingredient.deleteMany({ where: { tenantId: t } }),
        db.auditLog.deleteMany({ where: { tenantId: t } }),
        db.notification.deleteMany({ where: { tenantId: t } }),
        db.customer.deleteMany({ where: { tenantId: t } }),
        db.user.deleteMany({ where: { tenantId: t } }),
        db.diningTable.deleteMany({ where: { branchId } }),
        db.branch.deleteMany({ where: { tenantId: t } }),
        db.subscription.deleteMany({ where: { tenantId: t } }),
        db.tenant.delete({ where: { id: t } }),
      ]);
      await db.$disconnect();
    }
  },
);
