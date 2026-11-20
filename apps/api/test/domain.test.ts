import { test } from "node:test";
import assert from "node:assert/strict";
import {
  totals,
  allowed,
  cashExpected,
  transitions,
  serviceAllowed,
} from "../src/domain";
test("totales calculados con descuento, impuesto, propina y envío", () => {
  assert.deepEqual(totals(100000, 10000, 1900, 5000, 7000), {
    subtotal: 100000,
    discount: 10000,
    tax: 17100,
    tip: 5000,
    deliveryFee: 7000,
    total: 119100,
  });
  assert.throws(() => totals(1, 2, 0, 0, 0));
});
test("permisos específicos y por módulo", () => {
  assert.equal(allowed(["pedidos.ver"], "pedidos.cancelar"), false);
  assert.equal(allowed(["pedidos.*"], "pedidos.crear"), true);
  assert.equal(allowed(["productos.*"], "pedidos.crear"), false);
});
test("arqueo excluye pagos digitales y descuenta retiros", () => {
  assert.equal(
    cashExpected(10000, [
      { method: "EFECTIVO", amount: 5000 },
      { method: "NEQUI", amount: 20000 },
      { method: "EFECTIVO", amount: -3000 },
    ]),
    12000,
  );
});
test("pedidos cerrados no vuelven a cocina", () => {
  assert.deepEqual(transitions.CERRADO, []);
  assert.equal(transitions.CONFIRMADO.includes("CERRADO"), false);
});
test("una tienda solo vende en mostrador o a domicilio", () => {
  const tienda = { businessType: "TIENDA", usesTables: false };
  assert.equal(serviceAllowed(tienda, "PARA_LLEVAR"), true);
  assert.equal(serviceAllowed(tienda, "DOMICILIO"), true);
  assert.equal(serviceAllowed(tienda, "MESA"), false);
  assert.equal(serviceAllowed(tienda, "RECOGER"), false);
  assert.equal(serviceAllowed({ ...tienda, usesTables: true }, "MESA"), true);
  assert.equal(
    serviceAllowed({ businessType: "RESTAURANTE", usesTables: false }, "MESA"),
    true,
  );
});

test("promociones: 2x1, porcentaje, franja horaria y días", async () => {
  const { promotionDiscount } = await import("../src/domain");
  const base = {
    id: "p",
    buy: 0,
    pay: 0,
    percent: 0,
    days: [],
    startTime: null,
    endTime: null,
    active: true,
  };
  const beer = { productId: "beer", quantity: 3, price: 8000 };
  const burger = { productId: "burger", quantity: 1, price: 20000 };
  // Jueves 19 de nov 2026, 18:30 en Colombia = 23:30 UTC.
  const at = new Date("2026-11-19T23:30:00Z");
  const twoForOne = {
    ...base,
    name: "2x1 cerveza",
    type: "NXM",
    buy: 2,
    pay: 1,
    productIds: ["beer"],
  };
  // 3 cervezas en 2x1: una gratis.
  assert.equal(promotionDiscount([twoForOne], [beer, burger], at).total, 8000);
  const happyHour = {
    ...twoForOne,
    startTime: "17:00",
    endTime: "19:00",
    days: [4],
  };
  assert.equal(promotionDiscount([happyHour], [beer], at).total, 8000);
  // Fuera de la franja o de los días configurados no aplica.
  assert.equal(
    promotionDiscount([happyHour], [beer], new Date("2026-11-20T01:00:00Z"))
      .total,
    0,
  );
  assert.equal(
    promotionDiscount([{ ...happyHour, days: [5] }], [beer], at).total,
    0,
  );
  // 10% en todo; un producto no recibe dos promociones.
  const tenOff = {
    ...base,
    name: "10%",
    type: "PORCENTAJE",
    percent: 10,
    productIds: [],
  };
  const both = promotionDiscount([twoForOne, tenOff], [beer, burger], at);
  assert.deepEqual(both.applied, [
    { name: "2x1 cerveza", amount: 8000 },
    { name: "10%", amount: 2000 },
  ]);
  // Inactiva no aplica.
  assert.equal(
    promotionDiscount([{ ...tenOff, active: false }], [burger], at).total,
    0,
  );
});
