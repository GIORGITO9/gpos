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
