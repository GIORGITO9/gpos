import { test } from "node:test";
import assert from "node:assert/strict";

// Entorno mínimo de navegador para la cola local.
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
});
let online = true;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    get onLine() {
      return online;
    },
  },
});

const order = (requestKey: string) => ({
  requestKey,
  branchId: "b1",
  body: { service: "RECOGER", items: [] },
  label: "Para recoger · 1 unidad",
  createdAt: new Date().toISOString(),
});

test("la cola guarda sin red y envía, conserva o descarta según la respuesta", async () => {
  const { enqueue, flush, isNetworkError } = await import("./outbox");
  const pending = () => JSON.parse(store.get("gpos-outbox") || "[]");
  const messages: string[] = [];
  const notify = (m: string) => void messages.push(m);

  assert.equal(isNetworkError(new TypeError("Failed to fetch")), true);
  assert.equal(isNetworkError(new Error("Servicio no disponible")), false);

  enqueue(order("a"));
  enqueue(order("a")); // misma clave: no se duplica
  enqueue(order("b"));
  assert.equal(pending().length, 2);

  // Sin conexión no intenta enviar.
  online = false;
  await flush(notify, async () => assert.fail("no debe enviar sin red"));
  assert.equal(pending().length, 2);

  // Se corta a mitad: el primero sale, el segundo se conserva.
  online = true;
  let calls = 0;
  await flush(notify, async (o) => {
    if (calls++) throw new TypeError("Failed to fetch");
    return { data: { number: 7, key: o.requestKey } };
  });
  assert.deepEqual(
    pending().map((o: any) => o.requestKey),
    ["b"],
  );
  assert.match(messages.at(-1)!, /#7/);

  // El servidor lo rechaza: se descarta y se avisa.
  await flush(notify, async () => {
    throw new Error("Producto inactivo");
  });
  assert.equal(pending().length, 0);
  assert.match(messages.at(-1)!, /Producto inactivo/);
});
