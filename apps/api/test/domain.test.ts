import { test } from "node:test";
import assert from "node:assert/strict";
import { totals, allowed, cashExpected, transitions } from "../src/domain";
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
