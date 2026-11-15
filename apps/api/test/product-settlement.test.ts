import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateTotal, quoteProducts } from "../src/product-settlement";

test("reparte todos los pesos y conserva el precio de las unidades tras otro pedido", () => {
  const totals = allocateTotal(101, [60, 40]);
  assert.equal(totals[0] + totals[1], 101);
  const old = {
    id: "a",
    name: "Arepa",
    quantity: 2,
    total: 60,
    settlementTotal: totals[0],
  };
  const first = quoteProducts({ total: 101, items: [old], payments: [] }, [
    { id: "a", quantity: 1 },
  ]);
  const account = {
    total: 111,
    items: [
      old,
      {
        id: "b",
        name: "Jugo",
        quantity: 1,
        total: 40,
        settlementTotal: totals[1],
      },
      { id: "c", name: "Extra", quantity: 1, total: 10, settlementTotal: 10 },
    ],
    payments: [{ amount: first.amount, items: first.items }],
  };
  assert.throws(
    () => quoteProducts(account, [{ id: "a", quantity: 2 }]),
    /ya se cobraron/,
  );
  const rest = quoteProducts(
    account,
    account.items.map((item) => ({ id: item.id, quantity: 1 })),
  );
  assert.equal(first.amount + rest.amount, 111);
});

test("un abono previo por monto se conserva al cobrar la selección final", () => {
  const quote = quoteProducts(
    {
      total: 10000,
      items: [
        {
          id: "a",
          name: "Plato",
          quantity: 1,
          total: 10000,
          settlementTotal: null,
        },
      ],
      payments: [{ amount: 4000 }],
    },
    [{ id: "a", quantity: 1 }],
  );
  assert.equal(quote.amount, 6000);
  assert.equal(quote.credit, 4000);
});
