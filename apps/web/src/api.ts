import { create } from "zustand";
import { services, serviceAllowed } from "../../api/src/domain";
export const useSession = create<any>((set) => ({
  token: null,
  user: null,
  branchId: localStorage.getItem("gpos.branch"),
  ready: false,
  setSession: (data: any) =>
    set({ token: data.access_token, user: data.user, ready: true }),
  setBranch: (branchId: string) => {
    localStorage.setItem("gpos.branch", branchId);
    set({ branchId });
  },
  clear: () => set({ token: null, user: null, ready: true }),
}));
let refreshing: Promise<any> | null = null;
export async function restore() {
  if (!refreshing)
    refreshing = fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Inicia sesión para continuar");
        const j = await r.json();
        useSession.getState().setSession(j.data);
        return j.data;
      })
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}
export async function api(
  path: string,
  body?: any,
  method?: string,
  retry = true,
  branchId?: string,
): Promise<any> {
  const s = useSession.getState();
  const r = await fetch("/api/v1/" + path, {
    method: method || (body ? "POST" : "GET"),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(s.token ? { Authorization: "Bearer " + s.token } : {}),
      ...(branchId || s.branchId
        ? { "X-Branch-Id": branchId || s.branchId }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.status === 401 && retry && !path.startsWith("auth/")) {
    try {
      await restore();
      return api(path, body, method, false, branchId);
    } catch {
      useSession.getState().clear();
      throw new Error("La sesión expiró. Inicia sesión de nuevo.");
    }
  }
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.success) {
    const fallback =
      r.status === 429
        ? "Demasiados intentos. Espera un minuto y vuelve a intentarlo."
        : "No fue posible conectar con el servidor";
    throw new Error(j?.message || fallback);
  }
  return j;
}
export const get = async (path: string) => (await api(path)).data;
export const can = (u: any, p: string) =>
  u?.permissions?.some(
    (v: string) => v === "*" || v === p || v === p.split(".")[0] + ".*",
  );
export const isStore = (u: any) => u?.tenant?.businessType === "TIENDA";
// Misma regla que valida el servidor: una sola fuente en apps/api/src/domain.ts.
const tenantRules = (u: any) => ({
  businessType: u?.tenant?.businessType ?? "RESTAURANTE",
  usesTables: !!u?.tenant?.usesTables,
});
export const posServices = (u: any): string[] =>
  services.filter((service) => serviceAllowed(tenantRules(u), service));
export const usesTables = (u: any) => serviceAllowed(tenantRules(u), "MESA");
// Pantallas ocultas en tienda. Cocina se queda: allí se despachan domicilios.
// Ingredientes: en tienda las existencias se crean solas desde cada producto.
export const hiddenPaths = (u: any) =>
  !isStore(u)
    ? []
    : [
        ...(posServices(u).includes("RECOGER") ? [] : ["pickup"]),
        "ingredients",
        ...(usesTables(u) ? [] : ["tables", "tables-admin"]),
      ];
export const serviceLabel = (u: any, service: string) =>
  isStore(u) && service === "PARA_LLEVAR"
    ? "Venta en mostrador"
    : labels[service];
const roleNames: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  GERENTE: "Gerente",
  SUPERVISOR: "Supervisor",
  CAJERO: "Cajero",
  MESERO: "Mesero",
  COCINA: "Cocina",
  DOMICILIARIO: "Domiciliario",
  INVENTARIO: "Inventario",
};
// En tienda el rol de cocina atiende Despachos.
export const roleLabel = (u: any, role: string) =>
  isStore(u) && role === "COCINA" ? "Despachos" : roleNames[role] || role;
// Sin mesas no hay meseros (se conserva el rol actual de quien ya lo tenga).
export const roleOptions = (u: any, current?: string) =>
  Object.keys(roleNames).filter(
    (r) =>
      r !== "OWNER" &&
      (r !== "MESERO" || usesTables(u) || current === "MESERO"),
  );
export const stockItem = (u: any) => (isStore(u) ? "Producto" : "Ingrediente");
export const money = (v: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v || 0);
export const date = (v: string) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(v));
export const labels: Record<string, string> = {
  CONFIRMADO: "Nuevo",
  EN_PREPARACION: "En preparación",
  LISTO: "Listo",
  EN_CAMINO: "En camino",
  ENTREGADO: "Entregado",
  CERRADO: "Cobrado",
  CANCELADO: "Cancelado",
  UNIDO: "Unido",
  BORRADOR: "Por aceptar",
  MESA: "En mesa",
  DOMICILIO: "Domicilio",
  RECOGER: "Para recoger",
  PARA_LLEVAR: "Para llevar",
  LIBRE: "Disponible",
  OCUPADA: "Ocupada",
  RESERVADA: "Reservada",
  FUERA_SERVICIO: "Fuera de servicio",
  PENDIENTE: "Pendiente",
  RECIBIDA: "Recibida",
  ACTIVA: "Activa",
  TRIAL: "Prueba gratuita",
  PAST_DUE: "Pago pendiente",
  SUSPENDIDA: "Suspendida",
  CANCELADA: "Cancelada",
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  NEQUI: "Nequi",
  TRANSFERENCIA: "Transferencia",
  DAVIPLATA: "Daviplata",
  QR: "QR",
  OTRO: "Otro",
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste",
  MERMA: "Merma",
  TRASLADO: "Traslado",
  VENTA: "Venta",
  DEVOLUCION: "Devolución",
  INGRESO: "Ingreso",
  RETIRO: "Retiro",
  GASTO: "Gasto",
  CREDITO: "Fiado",
  ABONO: "Abono de fiado",
  LLEGO: "Llegó",
  NO_ASISTIO: "No asistió",
  NXM: "Lleva N, paga M",
  PORCENTAJE: "Porcentaje",
};
// "8 unidad" → "8 unidades"; otras unidades (g, ml, kg) no se pluralizan.
export const unitLabel = (quantity: number, unit: string) =>
  unit === "unidad" && quantity !== 1 ? "unidades" : unit;
