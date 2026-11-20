// Fiado: quién debe, cuánto, y registrar abonos desde la caja abierta.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { api, get, money, date, labels, can, useSession } from "./api";
import { Button, Field, Modal, useToast } from "./ui";

const abonoMethods = [
  "EFECTIVO",
  "TARJETA",
  "TRANSFERENCIA",
  "NEQUI",
  "DAVIPLATA",
  "QR",
  "OTRO",
];

export function CreditAccounts({ open }: { open: (c: any) => void }) {
  const q = useQuery({
    queryKey: ["credit-accounts"],
    queryFn: () => get("credit/accounts"),
  });
  const rows: any[] = q.data ?? [];
  if (!rows.length) return null;
  const total = rows.reduce((n, r) => n + r.balance, 0);
  return (
    <section className="panel credit-panel">
      <div className="panel-title">
        <div>
          <h2>Cuentas por cobrar</h2>
          <p>
            {rows.length}{" "}
            {rows.length === 1 ? "cliente debe" : "clientes deben"}{" "}
            {money(total)} en fiado.
          </p>
        </div>
      </div>
      <ul className="credit-list">
        {rows.slice(0, 8).map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => open(r)}>
              <span>
                <strong>{r.name}</strong>
                {r.phone && <small>{r.phone}</small>}
              </span>
              <b>{money(r.balance)}</b>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CreditDialog({
  customer,
  close,
}: {
  customer: { id: string; name: string };
  close: () => void;
}) {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ["credit", customer.id],
    queryFn: () => get(`customers/${customer.id}/credit`),
  });
  const [amount, setAmount] = useState(""),
    [method, setMethod] = useState("EFECTIVO"),
    [busy, setBusy] = useState(false);
  const d = q.data;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`customers/${customer.id}/credit-payment`, {
        amount: Number(amount),
        method,
      });
      toast(`Abono de ${money(Number(amount))} registrado`);
      setAmount("");
      qc.invalidateQueries();
    } catch (err: any) {
      toast(err.message, true);
    } finally {
      setBusy(false);
    }
  }
  // Historial único ordenado: compras fiadas (+) y abonos (−).
  const history = d
    ? [
        ...d.sales.map((p: any) => ({
          id: p.id,
          at: p.createdAt,
          text: `Venta #${p.order.number}`,
          amount: p.amount,
        })),
        ...d.payments.map((p: any) => ({
          id: p.id,
          at: p.createdAt,
          text:
            p.method === "DEVOLUCION"
              ? p.note || "Devolución"
              : `Abono · ${labels[p.method] ?? p.method}`,
          amount: -p.amount,
        })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at))
    : [];
  return (
    <Modal title={"Fiado de " + customer.name} onClose={close}>
      <div className="credit-balance">
        <span>Saldo pendiente</span>
        <strong>{d ? money(d.balance) : "…"}</strong>
      </div>
      {d && d.balance > 0 && can(s.user, "ventas.crear") && (
        <form className="credit-form" onSubmit={submit}>
          <Field
            label="Valor del abono"
            type="number"
            min="1"
            max={d.balance}
            inputMode="numeric"
            required
            value={amount}
            onChange={(e: any) => setAmount(e.target.value)}
          />
          <Field label="Medio de pago">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {abonoMethods.map((m) => (
                <option key={m} value={m}>
                  {labels[m]}
                </option>
              ))}
            </select>
          </Field>
          <Button variant="primary" disabled={busy || !amount}>
            <HandCoins size={17} />
            {busy ? "Registrando…" : "Registrar abono"}
          </Button>
          <Button type="button" onClick={() => setAmount(String(d.balance))}>
            Pagar todo
          </Button>
        </form>
      )}
      {history.length > 0 && (
        <ul className="credit-history">
          {history.map((h) => (
            <li key={h.id}>
              <span>
                {h.text}
                <small>{date(h.at)}</small>
              </span>
              <b className={h.amount > 0 ? "negative" : "positive"}>
                {h.amount > 0 ? "+" : "−"}
                {money(Math.abs(h.amount))}
              </b>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">
        El abono entra a tu caja abierta con el medio elegido.
      </p>
    </Modal>
  );
}
