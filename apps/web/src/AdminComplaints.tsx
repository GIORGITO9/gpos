import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api, date, get } from "./api";
import { Button, Empty, ErrorBox, Field, Loading, Modal } from "./ui";

const statuses = {
  OPEN: "Abierto",
  IN_PROGRESS: "En gestión",
  RESOLVED: "Respondido",
  CLOSED: "Cerrado",
};
type Status = keyof typeof statuses;
type Complaint = {
  id: number;
  subject: string;
  email: string;
  status: Status;
  receivedAt: string;
};
type Detail = Complaint & {
  description: string;
  events: {
    id: string;
    status: Status;
    actorName: string;
    createdAt: string;
    note: string;
  }[];
};
type List = { rows: Complaint[]; total: number; pageSize: number };

function statusOptions() {
  return Object.entries(statuses).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}
function receptionInput() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export default function AdminComplaints() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<number | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  const list = useQuery<List>({
    queryKey: ["admin", "complaints", "list", params.toString()],
    queryFn: () => get("admin/complaints?" + params),
  });
  const detail = useQuery<Detail>({
    queryKey: ["admin", "complaints", "detail", open],
    queryFn: () => get("admin/complaints/" + open),
    enabled: typeof open === "number",
  });
  const last = Math.max(
    1,
    Math.ceil((list.data?.total ?? 0) / (list.data?.pageSize ?? 20)),
  );

  function show(value: typeof open) {
    setError("");
    setOpen(value);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      if (open === "new") {
        const result = await api("admin/complaints", {
          ...fields,
          receivedAt: new Date(String(fields.receivedAt)).toISOString(),
        });
        setStatus("");
        setSearch("");
        setPage(1);
        setOpen(result.data.id);
      } else if (detail.data) {
        await api("admin/complaints/" + detail.data.id + "/events", {
          ...fields,
          previousStatus: detail.data.status,
        });
      }
      await qc.invalidateQueries({ queryKey: ["admin", "complaints"] });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el reclamo.",
      );
      if (open !== "new") await detail.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="complaints-title">
      <div className="panel-title">
        <h2 id="complaints-title">Reclamos</h2>
        <Button variant="primary" onClick={() => show("new")}>
          <Plus size={16} /> Registrar reclamo
        </Button>
      </div>
      <div className="admin-complaint-filters">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(
              String(new FormData(e.currentTarget).get("search") ?? "").trim(),
            );
            setPage(1);
          }}
        >
          <Field
            label="Buscar por radicado, correo o asunto"
            type="search"
            name="search"
            maxLength={191}
            key={search}
            defaultValue={search}
          />
          <Button>Buscar</Button>
        </form>
        <Field label="Estado">
          <select
            aria-label="Estado del reclamo"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {statusOptions()}
          </select>
        </Field>
      </div>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorBox error={list.error} retry={list.refetch} />
      ) : list.data.rows.length ? (
        <ul className="admin-activity admin-complaint-list">
          {list.data.rows.map((item) => (
            <li key={item.id}>
              <span>
                <strong>
                  #{item.id} · {item.subject}
                </strong>
                <small>{item.email}</small>
              </span>
              <span>
                {statuses[item.status]}
                <small>Recibido el {date(item.receivedAt)}</small>
              </span>
              <Button
                onClick={() => show(item.id)}
                aria-label={"Ver reclamo " + item.id}
              >
                Ver reclamo
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title="No se encontraron reclamos"
          text="Registra uno nuevo o ajusta la búsqueda."
        />
      )}
      <div className="admin-pagination">
        <span role="status">
          {list.data?.total ?? 0} reclamos · Página {page} de {last}
        </span>
        {(last > 1 || page > 1) && (
          <div>
            <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <Button disabled={page >= last} onClick={() => setPage(page + 1)}>
              Siguiente
            </Button>
          </div>
        )}
      </div>
      {open !== null && (
        <Modal
          title={open === "new" ? "Registrar reclamo" : "Reclamo #" + open}
          onClose={() => {
            if (!busy) show(null);
          }}
        >
          {open === "new" ? (
            <form onSubmit={submit}>
              <Field
                label="Correo de contacto"
                name="email"
                type="email"
                maxLength={191}
                required
              />
              <Field
                label="Asunto"
                name="subject"
                minLength={3}
                maxLength={191}
                required
              />
              <Field
                label="Fecha y hora de recepción (hora local)"
                name="receivedAt"
                type="datetime-local"
                defaultValue={receptionInput()}
                required
              />
              <Field label="Descripción">
                <textarea
                  name="description"
                  rows={4}
                  minLength={5}
                  maxLength={4000}
                  required
                />
              </Field>
              <p className="muted">
                Registra solo la información necesaria. Comunica el radicado por
                el canal donde recibiste el reclamo.
              </p>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <Button variant="primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar y generar radicado"}
              </Button>
            </form>
          ) : detail.isPending ? (
            <Loading />
          ) : detail.isError ? (
            <ErrorBox error={detail.error} retry={detail.refetch} />
          ) : (
            <>
              <h3>{detail.data.subject}</h3>
              <p className="muted">
                {detail.data.email} · Recibido el {date(detail.data.receivedAt)}{" "}
                · {statuses[detail.data.status]}
              </p>
              <p className="admin-complaint-text">{detail.data.description}</p>
              <h3>Historial</h3>
              <ol className="admin-complaint-history">
                {detail.data.events.map((entry) => (
                  <li key={entry.id}>
                    <strong>{statuses[entry.status]}</strong>
                    <small>
                      {entry.actorName} · {date(entry.createdAt)}
                    </small>
                    <p className="admin-complaint-text">{entry.note}</p>
                  </li>
                ))}
              </ol>
              <form key={detail.data.events.at(-1)?.id} onSubmit={submit}>
                <Field label="Nuevo estado">
                  <select
                    aria-label="Nuevo estado"
                    name="status"
                    defaultValue={detail.data.status}
                  >
                    {statusOptions()}
                  </select>
                </Field>
                <Field label="Nota interna">
                  <textarea
                    name="note"
                    rows={3}
                    minLength={3}
                    maxLength={4000}
                    required
                  />
                </Field>
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                <Button variant="primary" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar seguimiento"}
                </Button>
              </form>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
