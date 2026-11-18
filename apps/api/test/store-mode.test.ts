// Modo TIENDA contra MySQL real: empresa desechable que se borra al final.
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/db";
import { save } from "../src/catalog";
import {
  checkoutTakeaway,
  createOrder,
  productConfig,
} from "../src/operations";

test(
  "tienda: stock espejo 1:1, servicios sin inventario y sin mesas",
  { skip: process.env.RUN_INTEGRATION !== "true" },
  async () => {
    const plan = await db.plan.findFirstOrThrow();
    const tenant = await db.tenant.create({
      data: {
        name: "QA Tienda (temporal)",
        businessType: "TIENDA",
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

      const product = await save(
        "products",
        undefined,
        {
          name: "Gaseosa QA",
          price: 3000,
          cost: 1500,
          trackStock: true,
          lowStockThreshold: 2,
          active: true,
        },
        u,
        branchId,
      );
      const service = await save(
        "products",
        undefined,
        { name: "Corte QA", price: 20000, trackStock: false, active: true },
        u,
        branchId,
      );

      const recipe = await db.recipeItem.findMany({
        where: { productId: product.id },
        include: { ingredient: true },
      });
      assert.equal(recipe.length, 1);
      assert.equal(recipe[0].quantity, 1);
      assert.equal(recipe[0].ingredient.name, "Gaseosa QA");
      assert.equal(
        await db.recipeItem.count({ where: { productId: service.id } }),
        0,
      );
      const ingredientId = recipe[0].ingredientId;
      await db.inventory.create({
        data: { branchId, ingredientId, quantity: 5 },
      });

      // Renombrar reutiliza el mismo espejo (no crea otro ingrediente).
      await save(
        "products",
        product.id,
        {
          name: "Gaseosa 400ml QA",
          price: 3000,
          cost: 1500,
          trackStock: true,
          lowStockThreshold: 2,
          active: true,
        },
        u,
        branchId,
      );
      const after = await db.recipeItem.findFirstOrThrow({
        where: { productId: product.id },
        include: { ingredient: true },
      });
      assert.equal(after.ingredientId, ingredientId);
      assert.equal(after.ingredient.name, "Gaseosa 400ml QA");
      assert.equal(
        await db.ingredient.count({ where: { tenantId: tenant.id } }),
        1,
      );

      // Un producto que trae receta de restaurante no pierde su receta al editarse en tienda.
      const harina = await db.ingredient.create({
        data: { tenantId: tenant.id, name: "Harina QA", unit: "g" },
      });
      const legacy = await db.product.create({
        data: {
          tenantId: tenant.id,
          name: "Pan QA",
          price: 2000,
          trackStock: true,
          recipe: { create: [{ ingredientId: harina.id, quantity: 80 }] },
        },
      });
      await save(
        "products",
        legacy.id,
        { name: "Pan QA", price: 2500, trackStock: true, active: true },
        u,
        branchId,
      );
      const kept = await db.recipeItem.findMany({
        where: { productId: legacy.id },
      });
      assert.deepEqual(
        kept.map((r) => [r.ingredientId, r.quantity]),
        [[harina.id, 80]],
      );

      // Guardar variantes no debe borrar el espejo de stock.
      await productConfig(
        product.id,
        { variants: [{ name: "Grande", price: 4000 }] },
        u,
      );
      assert.equal(
        await db.recipeItem.count({
          where: { productId: product.id, ingredientId },
        }),
        1,
      );
      const order: any = await checkoutTakeaway(
        {
          idempotencyKey: randomUUID(),
          order: {
            items: [
              { productId: product.id, quantity: 2 },
              { productId: service.id, quantity: 1 },
            ],
          },
          payments: [{ method: "NEQUI", amount: 26000 }],
        },
        u,
        branchId,
      );
      assert.equal(order.status, "CERRADO");
      const stock = await db.inventory.findFirstOrThrow({
        where: { branchId, ingredientId },
      });
      assert.equal(
        stock.quantity,
        3,
        "vender 2 gaseosas descuenta 2; el servicio no toca inventario",
      );

      await assert.rejects(
        createOrder(
          { service: "MESA", items: [{ productId: service.id, quantity: 1 }] },
          u,
          branchId,
        ),
        /no disponible para tiendas/,
      );
      await assert.rejects(
        createOrder(
          {
            service: "PARA_LLEVAR",
            tableId: "x",
            items: [{ productId: service.id, quantity: 1 }],
          },
          u,
          branchId,
        ),
        /no disponible para tiendas/,
      );

      // Reenvío tras perder la conexión: misma clave, un solo pedido.
      const offlineOrder = {
        service: "DOMICILIO",
        customerId: undefined as string | undefined,
        address: "Calle 1",
        requestKey: randomUUID(),
        items: [{ productId: service.id, quantity: 1 }],
      };
      const customer = await db.customer.create({
        data: { tenantId: tenant.id, name: "Cliente QA" },
      });
      offlineOrder.customerId = customer.id;
      const first: any = await createOrder(offlineOrder, u, branchId);
      const again: any = await createOrder(offlineOrder, u, branchId);
      assert.equal(again.id, first.id);
      assert.equal(
        await db.order.count({
          where: { requestKey: offlineOrder.requestKey },
        }),
        1,
      );

      // Con mesas activadas, la cuenta de mesa no pasa por cocina: queda lista para cobrar.
      u.tenant.usesTables = true;
      const table = await db.diningTable.create({
        data: { branchId, name: "M1" },
      });
      const tableOrder: any = await createOrder(
        {
          service: "MESA",
          tableId: table.id,
          items: [{ productId: service.id, quantity: 1 }],
        },
        u,
        branchId,
      );
      assert.equal(tableOrder.status, "ENTREGADO");
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
