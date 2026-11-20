// Promociones automáticas: 2x1, 3x2, porcentaje y happy hour por días y franja.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, BadgePercent } from "lucide-react";
import { api, get, can, useSession, isStore } from "./api";
import {
  PageTitle,
  Button,
  Field,
  Modal,
  Empty,
  Loading,
  ErrorBox,
  useToast,
} from "./ui";

const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function describe(p: any, products: Map<string, string>) {
  const what = p.productIds.length
    ? p.productIds.map((id: string) => products.get(id) ?? "—").join(", ")
    : "Todos los productos";
  const deal =
    p.type === "NXM"
      ? `Lleva ${p.buy}, paga ${p.pay}`
      : `${p.percent}% de descuento`;
  const when = [
    p.days.length && p.days.length < 7
      ? p.days.map((d: number) => dayNames[d]).join(" ")
      : "Todos los días",
    p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { what, deal, when };
}

export function Promotions() {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ["promotions"],
    queryFn: () => get("promotions?limit=100"),
  });
  const products = useQuery({
    queryKey: ["products", "promo-picker"],
    queryFn: () => get("products?limit=100"),
  });
  const names = useMemo(
    () => new Map((products.data ?? []).map((p: any) => [p.id, p.name])),
    [products.data],
  ) as Map<string, string>;
  const [editing, setEditing] = useState<any>(null);
  const canEdit = can(s.user, "productos.editar");
  async function toggle(p: any) {
    try {
      await api("promotions/" + p.id, { ...p, active: !p.active }, "PUT");
      qc.invalidateQueries({ queryKey: ["promotions"] });
    } catch (e: any) {
      toast(e.message, true);
    }
  }
  async function remove(p: any) {
    try {
      await api("promotions/" + p.id, undefined, "DELETE");
      qc.invalidateQueries({ queryKey: ["promotions"] });
      toast("Promoción eliminada");
    } catch (e: any) {
      toast(e.message, true);
    }
  }
  return (
    <>
      <PageTitle
        title="Promociones"
        subtitle="Se aplican solas en caja cuando se cumplen sus condiciones."
        action={
          can(s.user, "productos.crear") && (
            <Button variant="primary" onClick={() => setEditing({})}>
              <Plus size={17} />
              Nueva promoción
            </Button>
          )
        }
      />
      <div className="section-links">
        <Link to="/app/products">{isStore(s.user) ? "Catálogo" : "Menú"}</Link>
        <Link to="/app/categories">Categorías</Link>
        <Link to="/app/modifiers">Modificadores</Link>
        <Link className="active" to="/app/promotions">
          Promociones
        </Link>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={q.refetch} />
      ) : q.data?.length ? (
        <div className="promo-grid">
          {q.data.map((p: any) => {
            const d = describe(p, names);
            return (
              <article
                key={p.id}
                className={"promo-card" + (p.active ? "" : " paused")}
              >
                <span className="promo-icon">
                  <BadgePercent size={22} aria-hidden="true" />
                </span>
                <h3>{p.name}</h3>
                <strong className="promo-deal">{d.deal}</strong>
                <p>{d.what}</p>
                <small>{d.when}</small>
                {canEdit && (
                  <div className="button-row">
                    <label className="switch-row">
                      <input
                        type="checkbox"
                        checked={p.active}
                        onChange={() => toggle(p)}
                      />
                      {p.active ? "Activa" : "Pausada"}
                    </label>
                    <button
                      className="icon-button"
                      aria-label={"Editar " + p.name}
                      onClick={() => setEditing(p)}
                    >
                      <Pencil size={16} />
                    </button>
                    {can(s.user, "productos.eliminar") && (
                      <button
                        className="icon-button"
                        aria-label={"Eliminar " + p.name}
                        onClick={() => remove(p)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="Sin promociones todavía"
            text="Crea un 2x1, un 3x2 o un descuento por horas. Caja lo aplica sola."
          />
        </section>
      )}
      {editing && (
        <PromotionForm
          row={editing}
          products={products.data ?? []}
          close={() => setEditing(null)}
        />
      )}
    </>
  );
}

function PromotionForm({ row, products, close }: any) {
  const qc = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState(row.type ?? "NXM");
  const [days, setDays] = useState<number[]>(row.days ?? []);
  const [picked, setPicked] = useState<string[]>(row.productIds ?? []);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as any;
    const body = {
      name: f.name,
      type,
      buy: type === "NXM" ? Number(f.buy) : 0,
      pay: type === "NXM" ? Number(f.pay) : 0,
      percent: type === "PORCENTAJE" ? Number(f.percent) : 0,
      productIds: picked,
      days,
      startTime: f.startTime || null,
      endTime: f.endTime || null,
      active: row.active ?? true,
    };
    setBusy(true);
    setError("");
    try {
      await api(
        "promotions" + (row.id ? "/" + row.id : ""),
        body,
        row.id ? "PUT" : "POST",
      );
      qc.invalidateQueries({ queryKey: ["promotions"] });
      toast("Promoción guardada");
      close();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const shown = products.filter((p: any) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <Modal
      title={row.id ? "Editar promoción" : "Nueva promoción"}
      onClose={close}
      wide
    >
      <form className="entity-form" onSubmit={submit}>
        <Field
          label="Nombre"
          name="name"
          defaultValue={row.name ?? ""}
          placeholder="2x1 en cervezas"
          required
          maxLength={200}
        />
        <div className="segmented" role="radiogroup" aria-label="Tipo">
          {[
            ["NXM", "Lleva N, paga M"],
            ["PORCENTAJE", "Porcentaje"],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={type === v}
              className={type === v ? "active" : ""}
              onClick={() => setType(v)}
            >
              {l}
            </button>
          ))}
        </div>
        {type === "NXM" ? (
          <div className="form-row">
            <Field
              label="Lleva"
              name="buy"
              type="number"
              min="2"
              max="20"
              defaultValue={row.buy || 2}
              required
            />
            <Field
              label="Paga"
              name="pay"
              type="number"
              min="0"
              max="19"
              defaultValue={row.pay || 1}
              required
            />
          </div>
        ) : (
          <Field
            label="Descuento (%)"
            name="percent"
            type="number"
            min="1"
            max="100"
            defaultValue={row.percent || 10}
            required
          />
        )}
        <fieldset className="promo-products">
          <legend>
            Productos{" "}
            <small>
              {picked.length
                ? `${picked.length} elegidos`
                : "ninguno: aplica a todo"}
            </small>
          </legend>
          <input
            type="search"
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="promo-product-list">
            {shown.map((p: any) => (
              <label key={p.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={picked.includes(p.id)}
                  onChange={(e) =>
                    setPicked((v) =>
                      e.target.checked
                        ? [...v, p.id]
                        : v.filter((x) => x !== p.id),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>
            Días <small>{days.length ? "" : "todos los días"}</small>
          </legend>
          <div className="day-chips">
            {dayNames.map((name, i) => (
              <button
                key={name}
                type="button"
                aria-pressed={days.includes(i)}
                className={days.includes(i) ? "active" : ""}
                onClick={() =>
                  setDays((v) =>
                    v.includes(i) ? v.filter((d) => d !== i) : [...v, i].sort(),
                  )
                }
              >
                {name}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="form-row">
          <Field
            label="Desde (opcional)"
            name="startTime"
            type="time"
            defaultValue={row.startTime ?? ""}
          />
          <Field
            label="Hasta"
            name="endTime"
            type="time"
            defaultValue={row.endTime ?? ""}
          />
        </div>
        <small className="muted">
          Para un happy hour elige la franja; si cruza la medianoche (22:00 a
          02:00) también funciona.
        </small>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar promoción"}
        </Button>
      </form>
    </Modal>
  );
}
