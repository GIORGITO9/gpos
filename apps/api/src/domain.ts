// La web (apps/web/src/api.ts) importa este archivo: mantenerlo sin dependencias de Node.
export const services = [
  "MESA",
  "DOMICILIO",
  "RECOGER",
  "PARA_LLEVAR",
] as const;
// Una tienda vende en mostrador (cobro inmediato) o a domicilio; mesas solo si el superadmin las activa.
export const storeServices = ["PARA_LLEVAR", "DOMICILIO"] as const;
export const serviceAllowed = (
  tenant: { businessType: string; usesTables: boolean },
  service: string,
) =>
  tenant.businessType !== "TIENDA" ||
  (storeServices as readonly string[]).includes(service) ||
  (service === "MESA" && tenant.usesTables);
export const sources = [
  "POS",
  "WHATSAPP",
  "WEB",
  "TELEFONO",
  "APP",
  "API",
] as const;
export const methods = [
  "EFECTIVO",
  "TARJETA",
  "TRANSFERENCIA",
  "NEQUI",
  "DAVIPLATA",
  "QR",
  "OTRO",
  // Fiado: la venta queda como deuda del cliente y se paga después con abonos.
  "CREDITO",
] as const;
export const transitions: Record<string, string[]> = {
  BORRADOR: ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO: ["EN_PREPARACION", "CANCELADO"],
  EN_PREPARACION: ["LISTO", "CANCELADO"],
  LISTO: ["EN_CAMINO", "ENTREGADO", "CANCELADO"],
  EN_CAMINO: ["ENTREGADO"],
  ENTREGADO: [],
  CERRADO: [],
  CANCELADO: [],
};
export const roles: Record<string, string[]> = {
  OWNER: ["*"],
  ADMIN: ["*"],
  GERENTE: [
    "ventas.*",
    "pedidos.*",
    "mesas.*",
    "caja.*",
    "productos.*",
    "clientes.*",
    "inventario.*",
    "compras.*",
    "reportes.ver",
    "usuarios.ver",
    "configuracion.ver",
  ],
  SUPERVISOR: [
    "ventas.*",
    "pedidos.*",
    "mesas.*",
    "caja.*",
    "productos.ver",
    "clientes.*",
    "reportes.ver",
  ],
  CAJERO: [
    "ventas.ver",
    "ventas.crear",
    "pedidos.ver",
    "pedidos.crear",
    "pedidos.cerrar",
    "mesas.ver",
    "caja.ver",
    "caja.abrir",
    "caja.cerrar",
    "productos.ver",
    "clientes.*",
  ],
  MESERO: [
    "pedidos.ver",
    "pedidos.crear",
    "pedidos.editar",
    "mesas.*",
    "productos.ver",
    "clientes.*",
  ],
  COCINA: ["pedidos.ver", "pedidos.preparar", "productos.ver"],
  DOMICILIARIO: ["pedidos.ver", "pedidos.entregar", "clientes.ver"],
  INVENTARIO: ["inventario.*", "compras.*", "productos.*"],
};
export function allowed(perms: string[], p: string) {
  return (
    perms.includes("*") ||
    perms.includes(p) ||
    perms.includes(p.split(".")[0] + ".*")
  );
}
export function totals(
  subtotal: number,
  discount: number,
  taxRate: number,
  tip: number,
  deliveryFee: number,
) {
  if (discount > subtotal) throw new Error("El descuento supera el subtotal");
  const tax = Math.round(((subtotal - discount) * taxRate) / 10000);
  return {
    subtotal,
    discount,
    tax,
    tip,
    deliveryFee,
    total: subtotal - discount + tax + tip + deliveryFee,
  };
}
export function cashExpected(
  opening: number,
  movements: { method: string; amount: number }[],
) {
  return (
    opening +
    movements
      .filter((m) => m.method === "EFECTIVO")
      .reduce((s, m) => s + m.amount, 0)
  );
}

// ===== Promociones automáticas (las usa el servidor y el punto de venta) =====
export type PromoRule = {
  id: string;
  name: string;
  type: string; // "NXM" (lleva N, paga M) | "PORCENTAJE"
  buy: number;
  pay: number;
  percent: number;
  productIds: unknown; // string[]; vacío = todos los productos
  days: unknown; // number[] 0=domingo; vacío = todos los días
  startTime?: string | null; // "HH:MM" hora de Colombia
  endTime?: string | null;
  active: boolean;
};
export type PromoLine = { productId: string; quantity: number; price: number };

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
// Colombia no tiene horario de verano: UTC−5 fijo.
export function bogotaClock(at: Date) {
  const local = new Date(at.getTime() - 5 * 3600_000);
  return {
    day: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}
export function promoActiveAt(p: PromoRule, at: Date) {
  if (!p.active) return false;
  const { day, minutes } = bogotaClock(at);
  const days = Array.isArray(p.days) ? (p.days as number[]) : [];
  if (days.length && !days.includes(day)) return false;
  if (p.startTime && p.endTime) {
    const start = minutesOf(p.startTime),
      end = minutesOf(p.endTime);
    // Franja que cruza la medianoche (ej. 22:00–02:00).
    const inside =
      start <= end
        ? minutes >= start && minutes < end
        : minutes >= start || minutes < end;
    if (!inside) return false;
  }
  return true;
}
/** Descuento total y detalle; cada producto lo toma la primera promoción que aplique. */
export function promotionDiscount(
  promos: PromoRule[],
  lines: PromoLine[],
  at: Date,
) {
  const used = new Set<string>();
  const applied: { name: string; amount: number }[] = [];
  for (const p of promos) {
    if (!promoActiveAt(p, at)) continue;
    const ids = Array.isArray(p.productIds) ? (p.productIds as string[]) : [];
    const eligible = lines.filter(
      (l) =>
        l.quantity > 0 &&
        !used.has(l.productId) &&
        (!ids.length || ids.includes(l.productId)),
    );
    if (!eligible.length) continue;
    let amount = 0;
    if (p.type === "NXM" && p.buy > p.pay && p.pay >= 0) {
      // Los gratis son siempre las unidades más baratas del grupo.
      const units = eligible
        .flatMap((l) => Array<number>(l.quantity).fill(l.price))
        .sort((a, b) => a - b);
      const free = Math.floor(units.length / p.buy) * (p.buy - p.pay);
      amount = units.slice(0, free).reduce((s, v) => s + v, 0);
    } else if (p.type === "PORCENTAJE" && p.percent > 0 && p.percent <= 100) {
      amount = Math.round(
        (eligible.reduce((s, l) => s + l.price * l.quantity, 0) * p.percent) /
          100,
      );
    }
    if (amount <= 0) continue;
    eligible.forEach((l) => used.add(l.productId));
    applied.push({ name: p.name, amount });
  }
  return {
    total: applied.reduce((s, a) => s + a.amount, 0),
    applied,
  };
}
