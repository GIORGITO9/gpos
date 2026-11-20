// Comanda impresa: ticket de 80 mm en un iframe propio, sin depender del diseño de la pantalla.
// Para imprimir sin diálogo, abre Chrome con --kiosk-printing en el equipo de cocina.
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const kitchenAutoKey = "gpos.kitchen-autoprint";

export function printKitchenTicket(
  order: any,
  round: { sequence?: number; items: any[]; id?: string },
  where: string,
  station = "",
) {
  const items = round.items.filter((i) => !station || i.station === station);
  if (!items.length) return;
  const time = new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date());
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comanda #${order.number}</title>
<link rel="stylesheet" href="/kitchen-ticket.css"></head><body>
<h1>#${esc(order.number)}${round.sequence && order.service === "MESA" ? ` · R${esc(round.sequence)}` : ""}</h1>
<div class="meta">${esc(where)}${station ? ` · ${esc(station)}` : ""} · ${esc(time)}</div>
${items
  .map(
    (i) =>
      `<div class="item"><b>${esc(i.quantity)}</b><div>${esc(i.name)}${(
        i.modifiers ?? []
      )
        .map((m: any) => `<small>+ ${esc(m.name)}</small>`)
        .join(
          "",
        )}${i.notes ? `<small class="note">${esc(i.notes)}</small>` : ""}</div></div>`,
  )
  .join("")}
${order.notes ? `<div class="foot">${esc(order.notes)}</div>` : ""}
</body></html>`;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  // La CSP solo permite estilos del propio sitio: se imprime cuando carga la hoja de la comanda.
  let printed = false;
  const print = () => {
    if (printed) return;
    printed = true;
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
  };
  const sheet = doc.querySelector("link");
  if (sheet) sheet.onload = print;
  setTimeout(print, 1500);
  // Se retira después: algunos navegadores imprimen de forma asíncrona.
  setTimeout(() => frame.remove(), 60_000);
}
