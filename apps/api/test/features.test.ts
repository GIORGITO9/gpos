// Funciones nuevas contra MySQL real: empresa desechable que se borra al final.
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/db";
import { save } from "../src/catalog";
import {
  cashAction,
  checkoutTakeaway,
  creditDetail,
  creditPayment,
  inventoryCount,
  productConfig,
} from "../src/operations";
import { acceptDraft, publicOrder, rejectDraft } from "../src/online";

test(
  "fiado, promociones, stock por variante, toma física, pedidos QR y arqueo",
  { skip: process.env.RUN_INTEGRATION !== "true" },
  async () => {
    const plan = await db.plan.findFirstOrThrow();
    const tenant = await db.tenant.create({
      data: {
        name: "QA Funciones (temporal)",
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
    const t = tenant.id;
    try {
      const user = await db.user.create({
        data: {
          tenantId: t,
          name: "QA",
          email: `qa-f-${t}@gpos.local`,
          passwordHash: "x",
          role: "OWNER",
          permissions: ["*"],
          branches: { create: { branchId } },
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
          where: { id: t },
          include: { subscription: { include: { plan: true } } },
        }),
      };
      u.tenant.subscription.plan.limits = {};
      const sell = (items: any[], payments: any[], extra: any = {}) =>
        checkoutTakeaway(
          {
            idempotencyKey: randomUUID(),
            order: { items, ...extra },
            payments,
          },
          u,
          branchId,
        );
      const stockOf = async (ingredientId: string) =>
        (await db.inventory.findFirst({ where: { branchId, ingredientId } }))
          ?.quantity ?? 0;

      // 1. Stock por variante: la lata y la botella cuentan su propio inventario.
      const soda: any = await save(
        "products",
        undefined,
        {
          name: "Gaseosa QA",
          price: 4000,
          cost: 2000,
          trackStock: true,
          active: true,
          recipe: [],
        },
        u,
        branchId,
      );
      const [mirror] = await db.recipeItem.findMany({
        where: { productId: soda.id },
      });
      await productConfig(
        soda.id,
        {
          variants: [
            { name: "Lata", price: 4000 },
            { name: "Botella", price: 5000 },
          ],
          recipe: [{ ingredientId: mirror.ingredientId, quantity: 1 }],
        },
        u,
      );
      const variants = await db.variant.findMany({
        where: { productId: soda.id },
      });
      const lata = variants.find((v) => v.name === "Lata")!;
      assert.ok(lata.ingredientId, "la variante tiene stock propio");
      await db.inventory.create({
        data: { branchId, ingredientId: lata.ingredientId!, quantity: 3 },
      });
      await sell(
        [{ productId: soda.id, variantId: lata.id, quantity: 2 }],
        [{ method: "EFECTIVO", amount: 8000 }],
      );
      assert.equal(await stockOf(lata.ingredientId!), 1);
      assert.equal(
        await stockOf(mirror.ingredientId),
        0,
        "el stock general no se toca",
      );
      await assert.rejects(
        sell(
          [{ productId: soda.id, variantId: lata.id, quantity: 2 }],
          [{ method: "EFECTIVO", amount: 8000 }],
        ),
        /Inventario insuficiente/,
      );

      // 2. Promoción 2x1 automática: el servidor la aplica y el pago debe coincidir.
      const burger: any = await save(
        "products",
        undefined,
        {
          name: "Hamburguesa QA",
          price: 10000,
          trackStock: false,
          active: true,
        },
        u,
        branchId,
      );
      await save(
        "promotions",
        undefined,
        {
          name: "2x1 QA",
          type: "NXM",
          buy: 2,
          pay: 1,
          productIds: [burger.id],
        },
        u,
        branchId,
      );
      const promoSale: any = await sell(
        [{ productId: burger.id, quantity: 2 }],
        [{ method: "EFECTIVO", amount: 10000 }],
      );
      assert.equal(promoSale.promoDiscount, 10000);
      assert.equal(promoSale.total, 10000);

      // 3. Fiado: exige cliente; queda la deuda y se abona desde caja.
      await assert.rejects(
        sell(
          [{ productId: burger.id, quantity: 1 }],
          [{ method: "CREDITO", amount: 10000 }],
        ),
        /selecciona el cliente/,
      );
      const customer = await db.customer.create({
        data: { tenantId: t, name: "Vecino QA" },
      });
      await sell(
        [{ productId: burger.id, quantity: 1 }],
        [{ method: "CREDITO", amount: 10000 }],
        { customerId: customer.id },
      );
      assert.equal((await creditDetail(customer.id, u)).balance, 10000);
      await creditPayment(
        customer.id,
        { amount: 4000, method: "EFECTIVO" },
        u,
        branchId,
      );
      assert.equal((await creditDetail(customer.id, u)).balance, 6000);
      await assert.rejects(
        creditPayment(
          customer.id,
          { amount: 7000, method: "EFECTIVO" },
          u,
          branchId,
        ),
        /supera la deuda/,
      );

      // 4. Toma física: ajusta solo la diferencia.
      await inventoryCount(
        [{ ingredientId: lata.ingredientId!, counted: 5 }],
        u,
        branchId,
      );
      assert.equal(await stockOf(lata.ingredientId!), 5);
      assert.equal(
        await db.inventoryMovement.count({
          where: {
            branchId,
            type: "AJUSTE",
            reason: "Toma física de inventario",
          },
        }),
        1,
      );

      // 5. Pedido QR: solo si el negocio lo activa; entra por aceptar y no ocupa la mesa.
      const table = await db.diningTable.create({
        data: { branchId, name: "M1" },
      });
      const qr = {
        name: "Ana",
        phone: "300 123 4567",
        tableId: table.id,
        items: [{ productId: burger.id, quantity: 1 }],
      };
      await assert.rejects(publicOrder(branchId, qr), /no está recibiendo/);
      await db.tenant.update({
        where: { id: t },
        data: { onlineOrders: true },
      });
      const first = await publicOrder(branchId, qr);
      const draft = await db.order.findFirstOrThrow({
        where: { number: first.number },
      });
      assert.equal(draft.status, "BORRADOR");
      assert.equal(
        (await db.diningTable.findUniqueOrThrow({ where: { id: table.id } }))
          .status,
        "LIBRE",
      );
      const account: any = await acceptDraft(draft.id, u, branchId);
      assert.equal(account.status, "CONFIRMADO");
      assert.equal(
        (await db.diningTable.findUniqueOrThrow({ where: { id: table.id } }))
          .status,
        "OCUPADA",
      );
      // Un segundo pedido de la misma mesa se suma a su cuenta como ronda nueva.
      const second = await publicOrder(branchId, qr);
      const draft2 = await db.order.findFirstOrThrow({
        where: { number: second.number },
      });
      const merged: any = await acceptDraft(draft2.id, u, branchId);
      assert.equal(merged.id, account.id);
      assert.equal(merged.rounds.length, 2);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: draft2.id } }))
          .mergedIntoId,
        account.id,
      );
      const third = await publicOrder(branchId, { ...qr, tableId: undefined });
      const draft3 = await db.order.findFirstOrThrow({
        where: { number: third.number },
      });
      assert.equal(draft3.service, "RECOGER");
      await rejectDraft(draft3.id, { reason: "Sin existencias" }, u, branchId);
      await assert.rejects(
        acceptDraft(draft3.id, u, branchId),
        /ya fue atendido/,
      );
      // El campo trampa delata a los bots.
      await assert.rejects(publicOrder(branchId, { ...qr, website: "spam" }));

      // 6. Arqueo: las denominaciones deben sumar lo contado.
      await assert.rejects(
        cashAction(
          "close",
          { counted: 50000, countDetail: { "20000": 2 } },
          u,
          branchId,
        ),
        /no coincide/,
      );
      const closed: any = await cashAction(
        "close",
        { counted: 50000, countDetail: { "20000": 2, "10000": 1 } },
        u,
        branchId,
      );
      assert.deepEqual(closed.countDetail, { "20000": 2, "10000": 1 });
    } finally {
      const orders = { tenantId: t };
      await db.$transaction([
        db.creditPayment.deleteMany({ where: { tenantId: t } }),
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
        db.variant.deleteMany({ where: { product: { tenantId: t } } }),
        db.recipeItem.deleteMany({ where: { product: { tenantId: t } } }),
        db.product.deleteMany({ where: { tenantId: t } }),
        db.ingredient.deleteMany({ where: { tenantId: t } }),
        db.promotion.deleteMany({ where: { tenantId: t } }),
        db.reservation.deleteMany({ where: { branchId } }),
        db.notification.deleteMany({ where: { tenantId: t } }),
        db.auditLog.deleteMany({ where: { tenantId: t } }),
        db.customer.deleteMany({ where: { tenantId: t } }),
        db.userBranch.deleteMany({ where: { branchId } }),
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
