import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  LayoutDashboard,
  Store,
  Users,
  Wallet,
  Layers,
  History,
  LogOut,
  Plus,
  Download,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { api, get, useSession, money, labels } from "./api";
import {
  PageTitle,
  TableScroll,
  Button,
  Metric,
  Badge,
  Empty,
  Loading,
  ErrorBox,
  Modal,
  Field,
  useToast,
} from "./ui";
import { exportCsv } from "./catalog";
import AdminComplaints from "./AdminComplaints";

const sections = [
  ["overview", "Resumen", LayoutDashboard],
  ["companies", "Empresas", Store],
  ["plans", "Planes", Layers],
  ["activity", "Actividad", History],
  ["complaints", "Reclamos", MessageSquare],
] as const;
const statuses = ["TRIAL", "ACTIVA", "PAST_DUE", "SUSPENDIDA", "CANCELADA"];
const adminTimestamp = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  dateStyle: "medium",
  timeStyle: "short",
});
const activityLabels: Record<string, string> = {
  CREATE: "Plan creado",
  UPDATE: "Plan actualizado",
  CHANGE_PLAN: "Plan de empresa cambiado",
  UPDATE_SUBSCRIPTION: "Suscripción actualizada",
};
const featureNames: Record<string, string> = {
  pos: "Punto de venta",
  tables: "Mesas",
  kitchen: "Cocina",
  reports: "Reportes",
  inventory: "Inventario",
  delivery: "Domicilios",
  purchases: "Compras",
  branches: "Sucursales",
  recipes: "Recetas",
  api: "API",
};
type PlatformPlan = {
  id?: string;
  name: string;
  price: number;
  features: string[];
  limits: Record<string, number>;
  availableForSignup?: boolean;
  _count?: { subscriptions: number };
};
type Company = {
  id: string;
  name: string;
  email: string | null;
  city: string;
  nit: string | null;
  status: string;
  createdAt: string;
  _count: { users: number; branches: number };
  termsAcceptance: {
    version: string;
    acceptedAt: string;
    acceptedByEmail: string;
  } | null;
  subscription: {
    plan: { name: string };
    planId: string;
    status: string;
    renewsAt: string;
  } | null;
};
type Activity = {
  id: string;
  action: string;
  record: string | null;
  actor: { name: string; email: string } | null;
  createdAt: string;
};
type Filters = Partial<
  Record<"search" | "status" | "planId" | "renewal" | "companyStatus", string>
>;
type PageData = { total: number; pageSize: number };
function listPath(
  path: string,
  page: number,
  filters: Record<string, string | undefined>,
) {
  const params = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filters))
    if (value?.trim()) params.set(key, value.trim());
  return path + "?" + params.toString();
}
function Pagination({
  page,
  data,
  onChange,
}: {
  page: number;
  data: PageData;
  onChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="admin-pagination">
      <span role="status">
        {data.total
          ? `Página ${page} de ${lastPage} · ${data.total} registros`
          : "0 registros"}
      </span>
      {lastPage > 1 && (
        <div>
          <Button
            aria-label="Página anterior"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            <ArrowLeft size={16} />
          </Button>
          <Button
            aria-label="Página siguiente"
            disabled={page >= lastPage}
            onClick={() => onChange(page + 1)}
          >
            <ArrowRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}

const adminDateInput = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const adminRenewalDate = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  dateStyle: "medium",
});
const planLimits = [
  ["branches", "Sucursales"],
  ["users", "Usuarios"],
  ["registers", "Cajas"],
  ["products", "Productos"],
] as const;

export default function Admin() {
  const q = useQuery({
      queryKey: ["admin", "overview"],
      queryFn: () => get("admin/overview"),
    }),
    qc = useQueryClient(),
    toast = useToast();
  const [editing, setEditing] = useState<Company | null>(null);
  const [plan, setPlan] = useState<PlatformPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [activityModule, setActivityModule] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const section =
    sections.find(([key]) => key === params.get("section"))?.[0] ?? "overview";
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(filters.search ?? ""),
      250,
    );
    return () => clearTimeout(timer);
  }, [filters.search]);
  const companyPath = listPath("admin/companies", page, {
    ...filters,
    search: debouncedSearch,
  });
  const companyQuery = useQuery({
    queryKey: ["admin", companyPath],
    queryFn: () => get(companyPath),
    enabled: section === "companies",
  });
  const activityPath = listPath("admin/activity", activityPage, {
    module: activityModule,
  });
  const activity = useQuery({
    queryKey: ["admin", activityPath],
    queryFn: () => get(activityPath),
    enabled: section === "activity",
  });
  const companies: Company[] = companyQuery.data?.companies ?? [];
  const lastCompanyPage = companyQuery.data
    ? Math.max(
        1,
        Math.ceil(companyQuery.data.total / companyQuery.data.pageSize),
      )
    : undefined;
  useEffect(() => {
    if (lastCompanyPage !== undefined && page > lastCompanyPage)
      setPage(lastCompanyPage);
  }, [page, lastCompanyPage]);

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function openCompanies(next: Filters) {
    setFilters(next);
    setDebouncedSearch("");
    setPage(1);
    navigate("/admin?section=companies");
  }

  async function downloadTerms(tenantId: string) {
    setBusy(true);
    setFormError("");
    try {
      const acceptance = await get("admin/tenants/" + tenantId + "/terms");
      if (!acceptance)
        throw new Error("Esta empresa aún no tiene una constancia.");
      const payload = {
        ...acceptance,
        document: JSON.parse(acceptance.document),
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "gpos-aceptacion-" + acceptance.version + ".json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "No fue posible descargar la constancia.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing?.subscription) return;
    setFormError("");
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      const original = editing.subscription.renewsAt;
      const renewsAt =
        fields.renewsAt === adminDateInput.format(new Date(original))
          ? original
          : new Date(fields.renewsAt + "T23:59:59-05:00").toISOString();
      await api("admin/tenants/" + editing.id, { ...fields, renewsAt }, "PUT");
      await qc.invalidateQueries({ queryKey: ["admin"] });
      setEditing(null);
      toast("Suscripción actualizada");
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!plan) return;
    setFormError("");
    const fields = new FormData(e.currentTarget);
    const limits = { ...plan.limits };
    for (const [key] of planLimits) limits[key] = Number(fields.get(key));
    setBusy(true);
    try {
      await api(
        plan.id ? "admin/plans/" + plan.id : "admin/plans",
        {
          name: String(fields.get("name")).trim(),
          price: Number(fields.get("price")),
          features: String(fields.get("features"))
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          limits,
        },
        plan.id ? "PUT" : "POST",
      );
      await qc.invalidateQueries({ queryKey: ["admin"] });
      setPlan(null);
      toast(plan.id ? "Plan actualizado" : "Plan creado");
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-layout">
      <header className="admin-header">
        <Link className="brand" to="/">
          gpos<span className="brand-dot">.</span>
        </Link>

        <Button
          onClick={async () => {
            await api("auth/logout", {});
            useSession.getState().clear();
            qc.clear();
            navigate("/login");
          }}
        >
          <LogOut size={16} />
          Salir
        </Button>
      </header>
      <PageTitle
        title="Administración de plataforma"
        subtitle="Gestiona empresas, renovaciones y planes de GPOS."
      />
      <nav
        className="admin-navigation"
        aria-label="Administración de plataforma"
      >
        {sections.map(([key, label, Icon]) => (
          <Link
            key={key}
            to={key === "overview" ? "/admin" : "/admin?section=" + key}
            aria-current={section === key ? "page" : undefined}
          >
            <Icon size={18} aria-hidden="true" /> {label}
          </Link>
        ))}
      </nav>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={q.refetch} />
      ) : (
        <>
          {section === "overview" && (
            <div className="admin-overview">
              <div className="metrics">
                <Metric
                  label="Empresas"
                  value={q.data.companies}
                  detail={q.data.suspended + " suspendidas"}
                  icon={Store}
                />
                <Metric
                  label="Suscripciones activas"
                  value={q.data.counts.ACTIVA ?? 0}
                  detail={(q.data.counts.TRIAL ?? 0) + " en prueba"}
                  icon={Users}
                />
                <Metric
                  label="Ingreso mensual estimado"
                  value={money(q.data.mrr)}
                  detail={money(q.data.arr) + " proyectados al año"}
                  icon={Wallet}
                />
              </div>
              <div className="admin-summary">
                <section className="panel" aria-labelledby="renewal-heading">
                  <div className="panel-title">
                    <h2 id="renewal-heading">Renovaciones</h2>
                  </div>
                  <div className="admin-summary-list">
                    <button
                      type="button"
                      onClick={() => openCompanies({ renewal: "overdue" })}
                    >
                      <span>
                        <strong>Vencidas</strong>
                        <small>Con fecha de renovación ya cumplida</small>
                      </span>
                      <b>{q.data.overdue}</b>
                      <ChevronRight size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openCompanies({ renewal: "upcoming" })}
                    >
                      <span>
                        <strong>Próximos 7 días</strong>
                        <small>Pruebas y suscripciones por renovar</small>
                      </span>
                      <b>{q.data.upcoming}</b>
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </section>
                <section className="panel" aria-labelledby="status-heading">
                  <div className="panel-title">
                    <h2 id="status-heading">Suscripciones por estado</h2>
                  </div>
                  <div className="admin-summary-list">
                    {statuses.map((status) => (
                      <button
                        type="button"
                        key={status}
                        onClick={() => openCompanies({ status })}
                      >
                        <span>{labels[status]}</span>
                        <b>{q.data.counts[status] ?? 0}</b>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}
          {section === "companies" && (
            <section
              className="panel admin-companies"
              aria-labelledby="admin-companies-title"
            >
              <div className="panel-title">
                <h2 id="admin-companies-title">Empresas</h2>
                <Button
                  disabled={
                    !companies.length ||
                    companyQuery.isFetching ||
                    debouncedSearch !== (filters.search ?? "")
                  }
                  onClick={() =>
                    exportCsv(
                      companies.map((company) => ({
                        Empresa: company.name,
                        Correo: company.email ?? "",
                        Ciudad: company.city,
                        Plan: company.subscription?.plan.name ?? "",
                        Suscripción: company.subscription
                          ? labels[company.subscription.status]
                          : "",
                        "Estado de empresa": labels[company.status],
                        Sucursales: company._count.branches,
                        Usuarios: company._count.users,
                        Renovación: company.subscription
                          ? adminDateInput.format(
                              new Date(company.subscription.renewsAt),
                            )
                          : "",
                      })),
                      "gpos-empresas-pagina-" + page,
                    )
                  }
                >
                  <Download size={16} /> Exportar página
                </Button>
              </div>
              <div className="admin-filters">
                <Field label="Buscar empresa">
                  <input
                    type="search"
                    placeholder="Nombre, correo, ciudad o NIT"
                    maxLength={191}
                    value={filters.search ?? ""}
                    onChange={(e) => updateFilter("search", e.target.value)}
                  />
                </Field>
                <Field label="Suscripción">
                  <select
                    aria-label="Suscripción"
                    value={filters.status ?? ""}
                    onChange={(e) => updateFilter("status", e.target.value)}
                  >
                    <option value="">Todas</option>
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {labels[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Plan">
                  <select
                    aria-label="Plan"
                    value={filters.planId ?? ""}
                    onChange={(e) => updateFilter("planId", e.target.value)}
                  >
                    <option value="">Todos</option>
                    {q.data.plans.map((p: PlatformPlan) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Renovación">
                  <select
                    aria-label="Renovación"
                    value={filters.renewal ?? ""}
                    onChange={(e) => updateFilter("renewal", e.target.value)}
                  >
                    <option value="">Todas</option>
                    <option value="overdue">Vencidas</option>
                    <option value="upcoming">Próximos 7 días</option>
                  </select>
                </Field>
                <Field label="Estado de empresa">
                  <select
                    aria-label="Estado de empresa"
                    value={filters.companyStatus ?? ""}
                    onChange={(e) =>
                      updateFilter("companyStatus", e.target.value)
                    }
                  >
                    <option value="">Todos</option>
                    <option value="ACTIVA">Activa</option>
                    <option value="SUSPENDIDA">Suspendida</option>
                  </select>
                </Field>
              </div>
              {companyQuery.isLoading ? (
                <Loading />
              ) : companyQuery.error ? (
                <ErrorBox
                  error={companyQuery.error}
                  retry={companyQuery.refetch}
                />
              ) : companies.length ? (
                <TableScroll>
                  <table className="admin-company-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        {[
                          "Negocio",
                          "Plan",
                          "Estado",
                          "Sucursales / Usuarios",
                          "Renovación",
                          "Acciones",
                        ].map((label) => (
                          <th scope="col" role="columnheader" key={label}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {companies.map((company) => (
                        <tr key={company.id} role="row">
                          <td role="cell" className="admin-company-name">
                            <strong>{company.name}</strong>
                            <small>
                              {[company.city, company.email]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          </td>
                          <td role="cell">
                            <span
                              className="admin-cell-label"
                              aria-hidden="true"
                            >
                              Plan
                            </span>
                            {company.subscription?.plan.name ?? "Sin plan"}
                          </td>
                          <td role="cell">
                            <span
                              className="admin-cell-label"
                              aria-hidden="true"
                            >
                              Estado
                            </span>
                            <div className="admin-company-status">
                              {company.status === "SUSPENDIDA" &&
                                company.subscription?.status !==
                                  "SUSPENDIDA" && <Badge value="SUSPENDIDA" />}
                              <Badge
                                value={
                                  company.subscription?.status ??
                                  "Sin suscripción"
                                }
                              />
                            </div>
                          </td>
                          <td role="cell">
                            <span
                              className="admin-cell-label"
                              aria-hidden="true"
                            >
                              Sucursales / Usuarios
                            </span>
                            {company._count.branches} / {company._count.users}
                          </td>
                          <td role="cell">
                            <span
                              className="admin-cell-label"
                              aria-hidden="true"
                            >
                              Renovación
                            </span>
                            {company.subscription
                              ? adminRenewalDate.format(
                                  new Date(company.subscription.renewsAt),
                                )
                              : "—"}
                          </td>
                          <td role="cell" className="admin-company-action">
                            <Button
                              aria-label={"Administrar " + company.name}
                              onClick={() => {
                                setFormError("");
                                setEditing(company);
                              }}
                            >
                              {company.subscription
                                ? "Administrar"
                                : "Ver detalles"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              ) : (
                <Empty
                  title="No hay empresas en esta vista"
                  text="Prueba con otros filtros o espera a que se registre un negocio."
                />
              )}
              {companyQuery.data && (
                <Pagination
                  page={page}
                  data={companyQuery.data}
                  onChange={setPage}
                />
              )}
            </section>
          )}
          {section === "plans" && (
            <section className="panel">
              <div className="panel-title">
                <h2>Planes comerciales</h2>
                <Button
                  variant="primary"
                  onClick={() => {
                    setFormError("");
                    setPlan({ name: "", price: 0, features: [], limits: {} });
                  }}
                >
                  <Plus size={16} /> Nuevo plan
                </Button>
              </div>
              {q.data.plans.map((p: PlatformPlan) => (
                <div className="integration-row admin-plan-row" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <p>
                      {money(p.price)} / mes · {p._count?.subscriptions ?? 0}{" "}
                      suscripciones
                    </p>
                    <small>
                      {p.features
                        .map((feature) => featureNames[feature] ?? feature)
                        .join(" · ") || "Sin funciones incluidas"}
                    </small>
                  </div>
                  <Button
                    aria-label={"Configurar plan " + p.name}
                    onClick={() => {
                      setFormError("");
                      setPlan(p);
                    }}
                  >
                    Configurar
                  </Button>
                </div>
              ))}
            </section>
          )}
          {section === "complaints" && <AdminComplaints />}
          {section === "activity" && (
            <section className="panel">
              <div className="panel-title">
                <h2>Historial de cambios</h2>
                <select
                  aria-label="Filtrar historial por módulo"
                  value={activityModule}
                  onChange={(e) => {
                    setActivityModule(e.target.value);
                    setActivityPage(1);
                  }}
                >
                  <option value="">Todos los módulos</option>
                  <option value="tenants">Empresas</option>
                  <option value="plans">Planes</option>
                </select>
              </div>
              {activity.isLoading ? (
                <Loading />
              ) : activity.error ? (
                <ErrorBox error={activity.error} retry={activity.refetch} />
              ) : activity.data?.rows?.length ? (
                <ul className="admin-activity">
                  {activity.data.rows.map((entry: Activity) => (
                    <li key={entry.id}>
                      <span>
                        <strong>
                          {activityLabels[entry.action] ?? entry.action}
                        </strong>
                        <small>
                          {entry.record ?? "Registro no disponible"}
                        </small>
                      </span>
                      <span>
                        {entry.actor?.name ?? "Cuenta no disponible"}
                        <small>{entry.actor?.email}</small>
                      </span>
                      <time dateTime={entry.createdAt}>
                        {adminTimestamp.format(new Date(entry.createdAt))}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty
                  title="Todavía no hay cambios registrados"
                  text="Los cambios en empresas y planes aparecerán aquí."
                />
              )}
              {activity.data && (
                <Pagination
                  page={activityPage}
                  data={activity.data}
                  onChange={setActivityPage}
                />
              )}
            </section>
          )}
        </>
      )}
      {editing && (
        <Modal
          title={"Administrar " + editing.name}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <dl className="admin-company-details">
            <div>
              <dt>Correo</dt>
              <dd>{editing.email ?? "Sin correo"}</dd>
            </div>
            <div>
              <dt>Ciudad</dt>
              <dd>{editing.city}</dd>
            </div>
            <div>
              <dt>NIT</dt>
              <dd>{editing.nit ?? "Sin NIT"}</dd>
            </div>
            <div>
              <dt>Registro</dt>
              <dd>{adminRenewalDate.format(new Date(editing.createdAt))}</dd>
            </div>
            <div>
              <dt>Términos aceptados</dt>
              <dd>
                {editing.termsAcceptance
                  ? "Versión " + editing.termsAcceptance.version
                  : "Sin aceptación registrada"}
              </dd>
            </div>
            {editing.termsAcceptance && (
              <div>
                <dt>Fecha y cuenta</dt>
                <dd>
                  {adminTimestamp.format(
                    new Date(editing.termsAcceptance.acceptedAt),
                  )}{" "}
                  · {editing.termsAcceptance.acceptedByEmail}
                </dd>
              </div>
            )}
          </dl>
          {editing.termsAcceptance && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void downloadTerms(editing.id)}
            >
              <Download size={16} /> Descargar constancia
            </Button>
          )}
          {editing.subscription && (
            <form onSubmit={saveTenant}>
              <Field label="Estado de empresa">
                <select name="status" defaultValue={editing.status}>
                  <option value="ACTIVA">{labels.ACTIVA}</option>
                  <option value="SUSPENDIDA">{labels.SUSPENDIDA}</option>
                </select>
              </Field>
              <Field label="Suscripción">
                <select
                  name="subscriptionStatus"
                  defaultValue={editing.subscription.status}
                >
                  {[
                    "TRIAL",
                    "ACTIVA",
                    "PAST_DUE",
                    "SUSPENDIDA",
                    "CANCELADA",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {labels[v]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Plan">
                <select
                  aria-label="Plan"
                  name="planId"
                  defaultValue={editing.subscription.planId}
                >
                  {q.data.plans.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Renovación"
                name="renewsAt"
                type="date"
                required
                defaultValue={adminDateInput.format(
                  new Date(editing.subscription.renewsAt),
                )}
              />
              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}
              <div className="button-row modal-actions">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </Button>
                <Button variant="primary" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar y auditar cambio"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
      {plan && (
        <Modal
          title={plan.id ? "Plan " + plan.name : "Nuevo plan"}
          onClose={() => {
            if (!busy) setPlan(null);
          }}
        >
          <form onSubmit={savePlan}>
            {!plan.id && (
              <p className="muted">
                Puedes asignar este plan a una empresa desde su suscripción.
              </p>
            )}
            <Field
              label="Nombre"
              name="name"
              defaultValue={plan.name}
              required
              minLength={2}
              maxLength={191}
            />
            <Field
              label="Precio mensual COP"
              name="price"
              type="number"
              min="0"
              max="1000000000"
              step="1"
              defaultValue={plan.price}
              required
            />
            <Field label="Funciones (separadas por coma)">
              <textarea
                name="features"
                rows={3}
                defaultValue={plan.features.join(", ")}
              />
            </Field>
            <fieldset className="admin-limit-fields">
              <legend>Límites del plan</legend>
              <p className="muted">Escribe 0 para un límite ilimitado.</p>
              <div className="form-grid">
                {planLimits.map(([key, label]) => (
                  <Field
                    key={key}
                    name={key}
                    label={label}
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={plan.limits?.[key] ?? 0}
                    required
                  />
                ))}
              </div>
            </fieldset>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="button-row modal-actions">
              <Button
                type="button"
                disabled={busy}
                onClick={() => setPlan(null)}
              >
                Cancelar
              </Button>
              <Button variant="primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar plan"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
