// Menú público (QR de mesa o enlace del negocio): el cliente pide sin cuenta.
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, ShoppingBag, Check, X } from "lucide-react";
import { money } from "./api";
import "./menu.css";

type Line = {
  key: string;
  productId: string;
  variantId?: string;
  modifierIds: string[];
  name: string;
  unit: number;
  quantity: number;
};

async function call(path: string, body?: unknown) {
  const r = await fetch("/api/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false)
    throw new Error(j.message || "No se pudo completar. Intenta de nuevo.");
  return j.data;
}

export default function PublicMenu() {
  const { branchId = "" } = useParams();
  const [params] = useSearchParams();
  const mesa = params.get("mesa") ?? "";
  const q = useQuery({
    queryKey: ["public-menu", branchId, mesa],
    queryFn: () =>
      call(
        `public/menu/${encodeURIComponent(branchId)}${mesa ? `?mesa=${encodeURIComponent(mesa)}` : ""}`,
      ),
    retry: false,
  });
  const [category, setCategory] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [picking, setPicking] = useState<any>(null);
  const [checkout, setCheckout] = useState(false);
  const [sent, setSent] = useState<{ number: number } | null>(null);
  const d = q.data;
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of d?.products ?? [])
      if (p.category) seen.set(p.category.id, p.category.name);
    return [...seen];
  }, [d]);
  const shown = (d?.products ?? []).filter(
    (p: any) => !category || p.category?.id === category,
  );
  const count = cart.reduce((n, l) => n + l.quantity, 0);
  const total = cart.reduce((n, l) => n + l.unit * l.quantity, 0);
  function add(line: Omit<Line, "quantity" | "key">) {
    const key = [line.productId, line.variantId, ...line.modifierIds].join("|");
    setCart((c) =>
      c.some((l) => l.key === key)
        ? c.map((l) =>
            l.key === key
              ? { ...l, quantity: Math.min(20, l.quantity + 1) }
              : l,
          )
        : [...c, { ...line, key, quantity: 1 }],
    );
  }
  function tap(p: any) {
    if (p.variants.length || p.modifiers.length) setPicking(p);
    else add({ productId: p.id, modifierIds: [], name: p.name, unit: p.price });
  }
  if (q.isLoading)
    return <main className="menu-page menu-center">Cargando menú…</main>;
  if (q.error || !d)
    return (
      <main className="menu-page menu-center">
        <h1>Menú no disponible</h1>
        <p>Revisa el enlace o pregunta en el negocio.</p>
      </main>
    );
  if (sent)
    return (
      <main className="menu-page menu-center">
        <span className="menu-done">
          <Check size={34} />
        </span>
        <h1>Pedido #{sent.number} enviado</h1>
        <p>
          {d.business} lo confirmará en un momento
          {d.table ? ` y lo llevará a ${d.table.name}` : ""}.
        </p>
        <button
          className="menu-primary"
          onClick={() => (setSent(null), setCart([]))}
        >
          Hacer otro pedido
        </button>
      </main>
    );
  return (
    <main className="menu-page">
      <header className="menu-header">
        <h1>{d.business}</h1>
        <p>
          {d.table ? `Estás en ${d.table.name}` : d.branch}
          {!d.accepting && " · No estamos recibiendo pedidos en este momento"}
        </p>
      </header>
      {categories.length > 1 && (
        <nav className="menu-chips" aria-label="Categorías">
          <button
            className={!category ? "active" : ""}
            onClick={() => setCategory("")}
          >
            Todo
          </button>
          {categories.map(([id, name]) => (
            <button
              key={id}
              className={category === id ? "active" : ""}
              onClick={() => setCategory(id)}
            >
              {name}
            </button>
          ))}
        </nav>
      )}
      <ul className="menu-list">
        {shown.map((p: any) => (
          <li key={p.id}>
            <div>
              <strong>{p.name}</strong>
              {p.description && <p>{p.description}</p>}
              <span>{money(p.price)}</span>
            </div>
            {d.accepting && (
              <button
                className="menu-add"
                aria-label={"Agregar " + p.name}
                onClick={() => tap(p)}
              >
                <Plus size={20} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {count > 0 && (
        <button className="menu-cart-bar" onClick={() => setCheckout(true)}>
          <ShoppingBag size={19} />
          Ver pedido ({count})<strong>{money(total)}</strong>
        </button>
      )}
      {picking && (
        <Picker
          product={picking}
          close={() => setPicking(null)}
          add={(line: any) => (add(line), setPicking(null))}
        />
      )}
      {checkout && (
        <Checkout
          branchId={branchId}
          table={d.table}
          cart={cart}
          setCart={setCart}
          total={total}
          close={() => setCheckout(false)}
          done={(r: { number: number }) => (setCheckout(false), setSent(r))}
        />
      )}
    </main>
  );
}

function Sheet({ title, close, children }: any) {
  return (
    <div
      className="menu-scrim"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <section
        className="menu-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="menu-icon" aria-label="Cerrar" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Picker({ product: p, close, add }: any) {
  const [variant, setVariant] = useState(p.variants[0]?.id ?? "");
  const [mods, setMods] = useState<string[]>([]);
  const v = p.variants.find((x: any) => x.id === variant);
  const unit =
    (v?.price ?? p.price) +
    p.modifiers
      .filter(({ modifier: m }: any) => mods.includes(m.id))
      .reduce((n: number, { modifier: m }: any) => n + m.price, 0);
  return (
    <Sheet title={p.name} close={close}>
      {p.variants.length > 0 && (
        <fieldset className="menu-options">
          <legend>Elige una opción</legend>
          {p.variants.map((x: any) => (
            <label key={x.id}>
              <input
                type="radio"
                name="variant"
                checked={variant === x.id}
                onChange={() => setVariant(x.id)}
              />
              {x.name}
              <span>{money(x.price)}</span>
            </label>
          ))}
        </fieldset>
      )}
      {p.modifiers.length > 0 && (
        <fieldset className="menu-options">
          <legend>Adicionales</legend>
          {p.modifiers.map(({ modifier: m }: any) => (
            <label key={m.id}>
              <input
                type="checkbox"
                checked={mods.includes(m.id)}
                onChange={(e) =>
                  setMods((c) =>
                    e.target.checked
                      ? [...c, m.id]
                      : c.filter((x) => x !== m.id),
                  )
                }
              />
              {m.name}
              <span>+{money(m.price)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <button
        className="menu-primary"
        onClick={() =>
          add({
            productId: p.id,
            variantId: variant || undefined,
            modifierIds: mods,
            name: p.name + (v ? " · " + v.name : ""),
            unit,
          })
        }
      >
        Agregar · {money(unit)}
      </button>
    </Sheet>
  );
}

function Checkout({ branchId, table, cart, setCart, total, close, done }: any) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = (key: string, delta: number) =>
    setCart((c: Line[]) =>
      c
        .map((l) =>
          l.key === key
            ? { ...l, quantity: Math.min(20, l.quantity + delta) }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as any;
    setBusy(true);
    setError("");
    try {
      done(
        await call(`public/orders/${encodeURIComponent(branchId)}`, {
          name: f.name,
          phone: f.phone,
          notes: f.notes || undefined,
          website: f.website || undefined,
          tableId: table?.id,
          items: cart.map((l: Line) => ({
            productId: l.productId,
            variantId: l.variantId,
            modifierIds: l.modifierIds,
            quantity: l.quantity,
          })),
        }),
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title="Tu pedido" close={close}>
      <ul className="menu-cart">
        {cart.map((l: Line) => (
          <li key={l.key}>
            <span>
              <strong>{l.name}</strong>
              <small>{money(l.unit)}</small>
            </span>
            <span className="menu-stepper">
              <button
                aria-label={"Quitar uno de " + l.name}
                onClick={() => change(l.key, -1)}
              >
                <Minus size={16} />
              </button>
              <b>{l.quantity}</b>
              <button
                aria-label={"Agregar uno de " + l.name}
                onClick={() => change(l.key, 1)}
              >
                <Plus size={16} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="menu-total">
        Total estimado <strong>{money(total)}</strong>
      </p>
      <form className="menu-form" onSubmit={submit}>
        <label>
          Tu nombre
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
          />
        </label>
        <label>
          Celular
          <input
            name="phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
          />
        </label>
        <label>
          Notas (opcional)
          <input
            name="notes"
            maxLength={300}
            placeholder="Sin cebolla, salsa aparte…"
          />
        </label>
        {/* Trampa para bots: oculta para las personas. */}
        <input
          className="menu-trap"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
        {error && (
          <p className="menu-error" role="alert">
            {error}
          </p>
        )}
        <button className="menu-primary" disabled={busy || !cart.length}>
          {busy
            ? "Enviando…"
            : table
              ? `Pedir para ${table.name}`
              : "Enviar pedido para recoger"}
        </button>
        <small>
          El negocio confirma tu pedido y el total final antes de prepararlo.
        </small>
      </form>
    </Sheet>
  );
}
