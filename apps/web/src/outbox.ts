import { useSyncExternalStore } from "react";

// Pedidos tomados sin conexión. Se guardan en el dispositivo y se envían al volver la red.
// shortcut: localStorage (síncrono, ~5 MB) basta para pocos pedidos; pasar a IndexedDB si se encolan cientos.
export type PendingOrder = {
  requestKey: string;
  branchId: string;
  body: Record<string, unknown>;
  label: string;
  createdAt: string;
};
const KEY = "gpos-outbox";
const listeners = new Set<() => void>();
let snapshot: PendingOrder[] = read();
let flushing = false;

function read(): PendingOrder[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function write(next: PendingOrder[]) {
  snapshot = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

// Un fallo de red (fetch rechazado o navegador sin conexión) se encola; un error del servidor no.
export const isNetworkError = (e: unknown) =>
  !navigator.onLine || e instanceof TypeError;

export function enqueue(order: PendingOrder) {
  write([...snapshot.filter((o) => o.requestKey !== order.requestKey), order]);
}

export async function flush(
  notify: (message: string, error?: boolean) => void,
  post: (order: PendingOrder) => Promise<{ data: { number: number } }>,
) {
  if (flushing || !navigator.onLine || !snapshot.length) return;
  flushing = true;
  try {
    for (const order of [...snapshot]) {
      try {
        const { data } = await post(order);
        notify(`Pedido #${data.number} enviado: ${order.label}`);
      } catch (e: any) {
        // Sin red o sesión vencida: se conserva y se reintenta después.
        if (isNetworkError(e) || /sesión/i.test(e?.message)) break;
        notify(`No se pudo enviar ${order.label}: ${e.message}`, true);
      }
      write(snapshot.filter((o) => o.requestKey !== order.requestKey));
    }
  } finally {
    flushing = false;
  }
}

export function useOutbox() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}
