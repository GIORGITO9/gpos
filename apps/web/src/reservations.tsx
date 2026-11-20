// Reservas de mesas por día: quién viene, a qué hora, cuántos y en qué mesa.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CalendarDays, Users, Phone } from "lucide-react";
import { api, get, can, labels, useSession } from "./api";
import {
  PageTitle,
  Button,
  Field,
  Modal,
  Empty,
  Loading,
  ErrorBox,
  Badge,
  useToast,
} from "./ui";

const bogotaDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
const hour = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(iso));

export function useReservations(day: string) {
  const s = useSession();
  return useQuery({
    queryKey: ["reservations", s.branchId, day],
    queryFn: () => get(`reservations?limit=100&date=${day}`),
    enabled: can(s.user, "mesas.ver"),
  });
}

export function Reservations() {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [day, setDay] = useState(() => bogotaDay(new Date()));
  const [editing, setEditing] = useState<any>(null);
  const q = useReservations(day);
  const canEdit = can(s.user, "mesas.editar");
  async function setStatus(r: any, status: string) {
    try {
      await api(
        "reservations/" + r.id,
        {
          name: r.name,
          phone: r.phone,
          partySize: r.partySize,
          at: r.at,
          tableId: r.tableId,
          notes: r.notes,
          status,
        },
        "PUT",
      );
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast(`${r.name}: ${labels[status] ?? status}`);
    } catch (e: any) {
      toast(e.message, true);
    }
  }
  const rows: any[] = q.data ?? [];
  const guests = rows
    .filter((r) => ["PENDIENTE", "LLEGO"].includes(r.status))
    .reduce((n, r) => n + r.partySize, 0);
  return (
    <>
      <PageTitle
        title="Reservas"
        subtitle="Quién viene hoy, a qué hora y en qué mesa."
        action={
          can(s.user, "mesas.crear") && (
            <Button variant="primary" onClick={() => setEditing({ day })}>
              <Plus size={17} />
              Nueva reserva
            </Button>
          )
        }
      />
      <div className="date-range">
        <Field
          label="Día"
          type="date"
          value={day}
          onChange={(e: any) => e.target.value && setDay(e.target.value)}
        />
        <p className="muted reservation-summary">
          <CalendarDays size={15} aria-hidden="true" /> {rows.length}{" "}
          {rows.length === 1 ? "reserva" : "reservas"} · {guests} personas
        </p>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={q.refetch} />
      ) : rows.length ? (
        <section className="panel">
          <ul className="reservation-list">
            {rows.map((r) => (
              <li key={r.id} className={"reservation " + r.status}>
                <time>{hour(r.at)}</time>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    <Users size={13} aria-hidden="true" /> {r.partySize}
                    {r.table && ` · ${r.table.name}`}
                    {r.phone && (
                      <>
                        {" · "}
                        <Phone size={13} aria-hidden="true" /> {r.phone}
                      </>
                    )}
                  </small>
                  {r.notes && <small className="muted">{r.notes}</small>}
                </div>
                <Badge value={r.status} />
                {canEdit && r.status === "PENDIENTE" && (
                  <div className="button-row">
                    <Button
                      variant="primary"
                      onClick={() => setStatus(r, "LLEGO")}
                    >
                      Llegó
                    </Button>
                    <Button onClick={() => setStatus(r, "NO_ASISTIO")}>
                      No vino
                    </Button>
                    <Button onClick={() => setStatus(r, "CANCELADA")}>
                      Cancelar
                    </Button>
                    <Button variant="quiet" onClick={() => setEditing(r)}>
                      Editar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="panel">
          <Empty
            title="Sin reservas este día"
            text="Registra una reserva para apartar la mesa y la hora."
          />
        </section>
      )}
      {editing && (
        <ReservationForm row={editing} close={() => setEditing(null)} />
      )}
    </>
  );
}

function ReservationForm({ row, close }: any) {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const tables = useQuery({
    queryKey: ["tables", s.branchId],
    queryFn: () => get("tables?limit=100"),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const initialDay = row.at ? bogotaDay(new Date(row.at)) : row.day;
  const initialTime = row.at
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Bogota",
      }).format(new Date(row.at))
    : "19:00";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as any;
    setBusy(true);
    setError("");
    try {
      await api(
        "reservations" + (row.id ? "/" + row.id : ""),
        {
          name: f.name,
          phone: f.phone || null,
          partySize: Number(f.partySize),
          at: new Date(`${f.day}T${f.time}:00-05:00`).toISOString(),
          tableId: f.tableId || null,
          notes: f.notes || null,
          status: row.status ?? "PENDIENTE",
        },
        row.id ? "PUT" : "POST",
      );
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast("Reserva guardada");
      close();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={row.id ? "Editar reserva" : "Nueva reserva"} onClose={close}>
      <form className="entity-form" onSubmit={submit}>
        <Field
          label="Nombre"
          name="name"
          defaultValue={row.name ?? ""}
          required
          maxLength={200}
        />
        <div className="form-row">
          <Field
            label="Celular"
            name="phone"
            type="tel"
            defaultValue={row.phone ?? ""}
            maxLength={30}
          />
          <Field
            label="Personas"
            name="partySize"
            type="number"
            min="1"
            max="200"
            defaultValue={row.partySize ?? 2}
            required
          />
        </div>
        <div className="form-row">
          <Field
            label="Día"
            name="day"
            type="date"
            defaultValue={initialDay}
            required
          />
          <Field
            label="Hora"
            name="time"
            type="time"
            defaultValue={initialTime}
            required
          />
        </div>
        <Field label="Mesa (opcional)">
          <select name="tableId" defaultValue={row.tableId ?? ""}>
            <option value="">Asignar al llegar</option>
            {tables.data?.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.seats} puestos
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Notas"
          name="notes"
          defaultValue={row.notes ?? ""}
          maxLength={500}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar reserva"}
        </Button>
      </form>
    </Modal>
  );
}
