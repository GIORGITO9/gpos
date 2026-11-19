import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowRight,
  ArrowUpRight,
  ReceiptText,
  Truck,
  Armchair,
  Wallet,
  Clock,
  ChefHat,
  Check,
  Package,
  AlertTriangle,
  Download,
  Printer,
  ShoppingCart,
  Settings,
  Users,
  Store,
  Layers,
  ShieldCheck,
  SlidersHorizontal,
  History,
  CheckCircle2,
  UtensilsCrossed,
  RefreshCw,
  CalendarDays,
  PackageCheck,
  PackageX,
  TriangleAlert,
} from "lucide-react";
import {
  api,
  get,
  useSession,
  money,
  date,
  labels,
  can,
  isStore,
  hiddenPaths,
  usesTables,
  stockItem,
  unitLabel,
  serviceLabel,
} from "./api";
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
  SearchInput,
  useToast,
} from "./ui";
import { OrderDetail, serviceIcons } from "./pos";
import { orderRounds, preparationAction } from "./order-rounds";
import { exportCsv } from "./catalog";
function useData(key: string, path = key, interval?: number) {
  const branch = useSession((s) => s.branchId);
  return useQuery({
    queryKey: [key, branch],
    queryFn: () => get(path),
    refetchInterval: interval,
  });
}
export function Dashboard() {
  const s = useSession(),
    q = useData("dashboard", "dashboard", 15000),
    [selected, setSelected] = useState<any>(null);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} retry={q.refetch} />;
  const d = q.data;
  const max = Math.max(10000, ...d.hourly.map((h: any) => h.total));
  return (
    <>
      <PageTitle
        title={`Todo listo, ${s.user.name.split(" ")[0]}.`}
        subtitle="Un vistazo a lo que está pasando en tu negocio hoy."
        action={
          <Link className="button primary" to="/app/pos">
            <Plus size={18} />
            Nueva venta <kbd>F1</kbd>
          </Link>
        }
      />
      <div className={usesTables(s.user) ? "metrics" : "metrics three"}>
        <Metric
          label="Ventas de hoy"
          value={money(d.sales)}
          detail="Ventas cobradas · menos devoluciones"
          icon={Wallet}
        />
        <Metric
          label="Pedidos"
          value={d.count}
          detail="Recibidos durante el día"
          icon={ReceiptText}
        />
        {usesTables(s.user) && (
          <Metric
            label="Mesas ocupadas"
            value={
              <>
                {d.occupied}
                <em> / {d.tables}</em>
              </>
            }
            detail={`${d.tables - d.occupied} mesas sin ocupar`}
            icon={Armchair}
          />
        )}
        <Metric
          label="Domicilios"
          value={d.deliveries}
          detail="Pedidos con entrega a domicilio"
          icon={Truck}
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel sales-panel">
          <div className="panel-title">
            <div>
              <h2>El ritmo de tus ventas</h2>
              <p>Ventas cobradas por hora</p>
            </div>
            <span className="subtle-chip">
              <CalendarDays size={14} /> Hoy
            </span>
          </div>
          <div className="chart">
            <div className="chart-labels">
              <span>{money(max)}</span>
              <span>{money(Math.round(max / 2))}</span>
              <span>$0</span>
            </div>
            <div className="chart-bars">
              {d.hourly
                .filter((h: any) => h.hour >= 7 && h.hour <= 23)
                .map((h: any) => (
                  <div key={h.hour} className="chart-bar-cell">
                    <div
                      className={"chart-bar " + (h.total ? "has-value" : "")}
                      style={{
                        height: Math.max(2, (h.total / max) * 100) + "%",
                      }}
                      title={`${h.hour}:00 · ${money(h.total)}`}
                    />
                    <span>{h.hour % 2 !== 0 ? h.hour + "h" : ""}</span>
                  </div>
                ))}
            </div>
          </div>
          {d.sales === 0 && (
            <p className="chart-empty">
              Tu primera venta cobrada aparecerá aquí.
            </p>
          )}
        </section>
        <section className="daily-panel">
          <div className="panel-title">
            <h2>Tu operación</h2>
            <span className="live-label">
              <i />
              En vivo
            </span>
          </div>
          <Link to="/app/kitchen" className="operation-row">
            <span className="operation-icon orange">
              {isStore(s.user) ? (
                <PackageCheck size={21} />
              ) : (
                <ChefHat size={21} />
              )}
            </span>
            <div>
              <strong>
                {isStore(s.user) ? "Despachos en marcha" : "Cocina en marcha"}
              </strong>
              <span>
                {
                  d.orders.filter((o: any) => o.status === "EN_PREPARACION")
                    .length
                }{" "}
                pedidos en preparación
              </span>
            </div>
            <ArrowUpRight size={17} />
          </Link>
          <Link to="/app/cash" className="operation-row">
            <span className="operation-icon green">
              <Wallet size={21} />
            </span>
            <div>
              <strong>
                {d.cash.length
                  ? "Tu caja está abierta"
                  : "Tu caja está cerrada"}
              </strong>
              <span>
                {d.cash.length
                  ? "Todo listo para recibir pagos"
                  : "Abre un turno para cobrar"}
              </span>
            </div>
            <ArrowUpRight size={17} />
          </Link>
          <Link to="/app/inventory" className="operation-row">
            <span className="operation-icon blue">
              <Package size={21} />
            </span>
            <div>
              <strong>Revisa tu inventario</strong>
              <span>
                {d.lowStock.length
                  ? `${d.lowStock.length} ${stockItem(s.user).toLowerCase()}s con stock bajo`
                  : "Sin alertas de stock bajo"}
              </span>
            </div>
            <ArrowUpRight size={17} />
          </Link>
          <div className="daily-note">
            <UtensilsCrossed size={24} strokeWidth={1.3} />
            <p>
              Más tiempo para lo que mejor haces.
              <br />
              <strong>Nosotros ponemos el orden.</strong>
            </p>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-title">
          <div className="heading-with-count">
            <h2>Pedidos activos</h2>
            <span className="count">{d.orders.length}</span>
          </div>
          <Link className="text-link" to="/app/orders">
            Ver todos <ArrowRight size={15} />
          </Link>
        </div>
        <OrderTable orders={d.orders.slice(0, 6)} select={setSelected} />
      </section>
      {selected && (
        <OrderDetail order={selected} close={() => setSelected(null)} />
      )}
    </>
  );
}
function OrderTable({ orders, select }: any) {
  return orders.length ? (
    <TableScroll>
      <table>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Servicio</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Total</th>
            <th>Hora</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((o: any) => {
            const Icon = serviceIcons[o.service];
            return (
              <tr key={o.id}>
                <td>
                  <button
                    className="text-button strong"
                    onClick={() => select(o)}
                  >
                    #{o.number}
                  </button>
                </td>
                <td>
                  <span className="inline-icon">
                    <Icon size={16} />
                    {o.table?.name || labels[o.service]}
                  </span>
                </td>
                <td>{o.customer?.name || "Consumidor final"}</td>
                <td>
                  <Badge value={o.mergedIntoId ? "UNIDO" : o.status} />
                </td>
                <td className="strong">
                  {o.mergedIntoId ? "Cuenta trasladada" : money(o.total)}
                </td>
                <td>
                  {new Date(o.createdAt).toLocaleTimeString("es-CO", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/Bogota",
                  })}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={"Ver pedido " + o.number}
                    onClick={() => select(o)}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  ) : (
    <Empty
      title="Todo está al día"
      text="Los próximos pedidos aparecerán aquí."
      action={
        <Link className="button" to="/app/pos">
          <Plus size={16} />
          Crear un pedido
        </Link>
      }
    />
  );
}
export function Orders({ service }: any) {
  const branchId = useSession((s) => s.branchId);
  const [selected, setSelected] = useState<any>(null),
    [status, setStatus] = useState("active"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const params = new URLSearchParams({
    page: String(page),
    limit: "20",
    search,
  });
  if (service) params.set("service", service);
  if (status === "active") params.set("active", "true");
  else if (status !== "all") params.set("status", status);
  const q = useQuery({
    queryKey: ["orders", branchId, params.toString()],
    queryFn: () => api("orders?" + params.toString()),
    refetchInterval: 5000,
  });
  const title =
    service === "DOMICILIO"
      ? "Domicilios"
      : service === "RECOGER"
        ? "Para recoger"
        : "Pedidos";
  const rows = q.data?.data || [];
  return (
    <>
      <PageTitle
        title={title}
        subtitle="Cada pedido, en el momento correcto."
        action={
          <Link className="button primary" to="/app/pos">
            <Plus size={17} />
            Nuevo pedido
          </Link>
        }
      />
      <div className="panel">
        <div className="table-toolbar">
          <div className="tabs">
            {[
              ["active", "Activos"],
              ["CERRADO", "Cobrados"],
              ["CANCELADO", "Cancelados"],
              ["UNIDO", "Unidos"],
              ["all", "Todos"],
            ].map(([v, l]) => (
              <button
                key={v}
                className={status === v ? "active" : ""}
                onClick={() => {
                  setStatus(v);
                  setPage(1);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <SearchInput
            value={search}
            onChange={(value: string) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Buscar pedido o cliente…"
          />
        </div>
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} />
        ) : (
          <OrderTable orders={rows} select={setSelected} />
        )}
        <div className="pagination">
          <span>{q.data?.meta?.total || 0} pedidos</span>
          <div>
            <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span>Página {page}</span>
            <Button
              disabled={page * 20 >= (q.data?.meta?.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>
      {service === "DOMICILIO" && (
        <div className="section-links">
          <Link to="/app/drivers">
            Administrar domiciliarios <ArrowUpRight size={15} />
          </Link>
          <Link to="/app/kitchen">
            Preparación y despacho <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
      {selected && (
        <OrderDetail order={selected} close={() => setSelected(null)} />
      )}
    </>
  );
}
export function Tables() {
  const user = useSession((s) => s.user);
  const q = useData("tables", "tables?limit=100", 5000),
    orders = useData(
      "active-orders",
      "orders?active=true&service=MESA&limit=100",
      5000,
    );
  const [zone, setZone] = useState(""),
    [tableStatus, setTableStatus] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [opening, setOpening] = useState("");
  const navigate = useNavigate(),
    toast = useToast();
  async function openTable(table: any) {
    if (table.status === "LIBRE") {
      if (!can(user, "pedidos.crear"))
        return toast("Tu perfil no puede abrir pedidos", true);
      navigate("/app/pos?table=" + encodeURIComponent(table.id));
      return;
    }
    if (table.status !== "OCUPADA")
      return toast("Esta mesa no está disponible para un nuevo pedido", true);
    setOpening(table.id);
    try {
      const order = await get(
        "tables/" + encodeURIComponent(table.id) + "/order",
      );
      if (can(user, "pedidos.crear"))
        navigate("/app/pos?order=" + encodeURIComponent(order.id));
      else setSelected(order);
    } catch (error: any) {
      toast(error.message, true);
      q.refetch();
    } finally {
      setOpening("");
    }
  }
  const tables = q.data ?? [];
  const statusOptions = ["", "LIBRE", "OCUPADA", "RESERVADA", "FUERA_SERVICIO"];
  const visibleTables = tables.filter(
    (table: any) =>
      (!zone || table.zone === zone) &&
      (!tableStatus || table.status === tableStatus),
  );
  const byTable = new Map<string, any>(
    (orders.data ?? []).map((order: any) => [order.tableId, order]),
  );
  return (
    <section className="salon-workspace">
      <PageTitle
        title="Mesas del salón"
        subtitle="Abre una mesa para tomar el pedido o consultar su saldo."
        action={
          <Link className="button" to="/app/tables-admin">
            <Settings size={16} />
            Configurar mesas
          </Link>
        }
      />
      {tables.length > 0 && (
        <div className="salon-filters">
          <div
            className="tabs salon-statuses"
            role="group"
            aria-label="Filtrar por estado"
          >
            {statusOptions.map((status) => (
              <button
                key={status}
                aria-pressed={tableStatus === status}
                className={tableStatus === status ? "active" : ""}
                onClick={() => setTableStatus(status)}
              >
                {status ? labels[status] : "Todas"}{" "}
                <span>
                  {status
                    ? tables.filter((table: any) => table.status === status)
                        .length
                    : tables.length}
                </span>
              </button>
            ))}
          </div>
          <label className="field salon-zone">
            <span>Zona</span>
            <select
              value={zone}
              onChange={(event) => setZone(event.target.value)}
            >
              <option value="">Todas las zonas</option>
              {[...new Set<string>(tables.map((table: any) => table.zone))].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
        </div>
      )}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : visibleTables.length ? (
        <div className="tables-grid">
          {visibleTables.map((table: any) => {
            const order = byTable.get(table.id);
            const balance = order
              ? order.total -
                order.payments.reduce(
                  (sum: number, payment: { amount: number }) =>
                    sum + payment.amount,
                  0,
                )
              : null;
            const available = table.status === "LIBRE";
            const occupied = table.status === "OCUPADA";
            return (
              <button
                key={table.id}
                className={"dining-table " + table.status}
                disabled={!!opening || (!available && !occupied)}
                onClick={() => openTable(table)}
              >
                <span className="salon-card-top">
                  <span className="salon-table-icon">
                    <Armchair size={21} aria-hidden="true" />
                  </span>
                  <Badge value={table.status} />
                </span>
                <span className="salon-card-title">
                  <strong>{table.name}</strong>
                  <small>
                    {table.zone} · {table.seats}{" "}
                    {table.seats === 1 ? "puesto" : "puestos"}
                  </small>
                </span>
                {(occupied || available) && (
                  <span className="salon-card-footer">
                    {balance === null ? (
                      occupied ? (
                        opening === table.id ? (
                          "Abriendo…"
                        ) : (
                          "Ver cuenta"
                        )
                      ) : (
                        "Abrir mesa"
                      )
                    ) : (
                      <span>
                        Saldo pendiente <strong>{money(balance)}</strong>
                      </span>
                    )}
                    <ArrowRight size={16} aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : tables.length ? (
        <Empty
          title="No hay mesas con estos filtros"
          action={
            <Button
              onClick={() => {
                setZone("");
                setTableStatus("");
              }}
            >
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <Empty
          title="Tu salón está por tomar forma"
          text="Crea las mesas y zonas de tu sucursal."
          action={
            <Link className="button primary" to="/app/tables-admin">
              Configurar mesas
            </Link>
          }
        />
      )}{" "}
      {selected && (
        <OrderDetail order={selected} close={() => setSelected(null)} />
      )}
    </section>
  );
}
// "8 min", "2 h 5 min": un pedido viejo no se lee como "826 min".
const elapsed = (from: string) => {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(from).getTime()) / 60000),
  );
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
};
export function Kitchen() {
  const user = useSession((s) => s.user);
  const q = useData("kitchen", "orders?kitchen=true&limit=100", 4000),
    drivers = useData("drivers", "drivers?limit=100");
  const qc = useQueryClient(),
    toast = useToast();
  const [station, setStation] = useState(""),
    [assign, setAssign] = useState<any>(null),
    [driver, setDriver] = useState(""),
    [busy, setBusy] = useState("");
  async function advance(
    o: any,
    status: string,
    driverId?: string,
    roundId?: string,
  ) {
    setBusy(roundId ?? o.id);
    try {
      await api(`orders/${o.id}/state`, {
        status,
        roundId,
        ...(driverId ? { driverId } : {}),
      });
      qc.invalidateQueries();
      toast(`Pedido #${o.number}: ${labels[status]}`);
      setAssign(null);
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy("");
    }
  }
  const tickets = (q.data || []).flatMap((order: any) =>
    orderRounds(order)
      .filter((round) => round.status !== "ENTREGADO")
      .map((round) => ({ order, round })),
  ) as Array<{ order: any; round: ReturnType<typeof orderRounds>[number] }>;
  const stations = [
    ...new Set(
      tickets.flatMap(({ round }) => round.items.map((item) => item.station)),
    ),
  ];
  return (
    <>
      <PageTitle
        title={isStore(user) ? "Despachos" : "Cocina"}
        subtitle="Los pedidos se actualizan automáticamente cada 4 segundos."
        action={
          <span className="live-label">
            <i />
            Actualización en vivo
          </span>
        }
      />
      {!isStore(user) && (
        <div className="tabs">
          <button
            className={!station ? "active" : ""}
            onClick={() => setStation("")}
          >
            Todas las estaciones
          </button>
          {stations.map((v: any) => (
            <button
              key={v}
              onClick={() => setStation(v)}
              className={station === v ? "active" : ""}
            >
              {v}
            </button>
          ))}
        </div>
      )}
      {q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        <div className="kitchen-board">
          {["CONFIRMADO", "EN_PREPARACION", "LISTO", "EN_CAMINO"].map(
            (status) => {
              const rows = tickets.filter(
                ({ round }) =>
                  round.status === status &&
                  (!station ||
                    round.items.some((item) => item.station === station)),
              );
              return (
                <section className="kitchen-column" key={status}>
                  <div className="kitchen-title">
                    <Badge value={status} />
                    <span>{rows.length}</span>
                  </div>
                  {rows.length ? (
                    rows.map(({ order: o, round }) => {
                      const action = preparationAction(status)!;
                      const dispatch =
                        status === "LISTO" && o.service === "DOMICILIO";
                      const canAdvance =
                        can(user, "pedidos.editar") ||
                        can(
                          user,
                          action.next === "ENTREGADO"
                            ? "pedidos.entregar"
                            : "pedidos.preparar",
                        ) ||
                        (!dispatch &&
                          action.next === "ENTREGADO" &&
                          can(user, "pedidos.cerrar"));
                      return (
                        <article className="ticket" key={round.id ?? o.id}>
                          <header>
                            <strong>
                              #{o.number}
                              {o.service === "MESA" && round.id
                                ? " · Ronda " + round.sequence
                                : ""}
                              {o.status === "CERRADO" ? " · Pagado" : ""}
                            </strong>
                            <span>
                              <Clock size={13} />
                              {elapsed(round.createdAt)}
                            </span>
                          </header>
                          <p>
                            {o.table?.name || labels[o.service]}{" "}
                            <span>· {o.source}</span>
                          </p>
                          <div className="ticket-items">
                            {round.items
                              .filter(
                                (i: any) => !station || i.station === station,
                              )
                              .map((i: any) => (
                                <div key={i.id}>
                                  <b>{i.quantity}</b>
                                  <div>
                                    <strong>{i.name}</strong>
                                    {i.modifiers?.map((m: any) => (
                                      <small key={m.id}>+ {m.name}</small>
                                    ))}
                                    {i.notes && (
                                      <small className="ticket-note">
                                        {i.notes}
                                      </small>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                          {o.notes && <p className="order-note">{o.notes}</p>}
                          {canAdvance && (
                            <Button
                              variant={
                                status === "EN_PREPARACION" ? "primary" : ""
                              }
                              disabled={busy === (round.id ?? o.id)}
                              onClick={() =>
                                dispatch
                                  ? (setAssign(o),
                                    setDriver(drivers.data?.[0]?.id || ""))
                                  : advance(o, action.next, undefined, round.id)
                              }
                            >
                              {dispatch ? "Asignar y despachar" : action.label}
                              <ArrowRight size={16} />
                            </Button>
                          )}
                        </article>
                      );
                    })
                  ) : (
                    <div className="column-empty">
                      Sin pedidos en esta etapa
                    </div>
                  )}
                </section>
              );
            },
          )}
        </div>
      )}
      {assign && (
        <Modal
          title={"Despachar #" + assign.number}
          onClose={() => setAssign(null)}
        >
          <Field label="Domiciliario">
            <select value={driver} onChange={(e) => setDriver(e.target.value)}>
              <option value="">Selecciona</option>
              {drivers.data?.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Button
            variant="primary"
            disabled={!driver || !!busy}
            onClick={() => advance(assign, "EN_CAMINO", driver)}
          >
            Confirmar salida
          </Button>
        </Modal>
      )}
    </>
  );
}
export function Cash() {
  const s = useSession(),
    q = useData("cash", "cash/current"),
    registers = useData("registers"),
    history = useData("cash-history", "cash/history");
  const [modal, setModal] = useState(""),
    [busy, setBusy] = useState(false);
  const toast = useToast(),
    qc = useQueryClient();
  const current = q.data?.find((c: any) => c.userId === s.user.id);
  const [counted, setCounted] = useState("");
  // Cobros netos del turno por medio de pago (ventas menos devoluciones), para cuadrar cada uno.
  const byMethod = Object.entries(
    (current?.movements ?? [])
      .filter((m: any) => ["VENTA", "DEVOLUCION"].includes(m.type))
      .reduce((acc: Record<string, number>, m: any) => {
        acc[m.method] = (acc[m.method] ?? 0) + m.amount;
        return acc;
      }, {}),
  ).sort((a: any, b: any) => b[1] - a[1]) as [string, number][];
  const netSales = byMethod.reduce((n, [, v]) => n + v, 0);
  async function submit(e: any) {
    e.preventDefault();
    const data: any = Object.fromEntries(new FormData(e.currentTarget));
    ["opening", "counted", "amount"].forEach((k) => {
      if (k in data) data[k] = Number(data[k]);
    });
    setBusy(true);
    try {
      const j = await api("cash/" + modal, data);
      qc.invalidateQueries();
      setModal("");
      setCounted("");
      toast(
        modal === "close"
          ? `Caja cerrada. Diferencia: ${money(j.data.difference)}`
          : "Movimiento registrado",
      );
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Caja"
        subtitle="Cada movimiento cuenta. Cierra el día con tranquilidad."
        action={
          <Button
            variant="primary"
            onClick={() => setModal(current ? "close" : "open")}
          >
            <Wallet size={17} />
            {current ? "Cerrar mi turno" : "Abrir caja"}
          </Button>
        }
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        <>
          <div className="metrics three">
            <Metric
              label="Base de apertura"
              value={money(current?.opening)}
              detail={current ? date(current.openedAt) : "Sin turno abierto"}
              icon={Wallet}
            />
            <Metric
              label="Efectivo esperado"
              value={money(current?.expected)}
              detail="Base + entradas − salidas en efectivo"
              icon={ReceiptText}
            />
            <Metric
              label="Ventas netas del turno"
              value={money(netSales)}
              detail="Todos los medios, menos devoluciones"
              icon={ShoppingCart}
            />
          </div>
          {byMethod.length > 0 && (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h2>Cobros por medio de pago</h2>
                  <p>Cuadra cada medio con el datáfono, Nequi o el banco.</p>
                </div>
              </div>
              <div className="report-breakdown">
                {byMethod.map(([method, value]) => (
                  <div key={method}>
                    <span>{labels[method] ?? method}</span>
                    <div className="report-track">
                      <i
                        style={{
                          width:
                            (netSales > 0
                              ? Math.max(0, (value / netSales) * 100)
                              : 0) + "%",
                        }}
                      />
                    </div>
                    <strong>{money(value)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-title">
              <h2>Movimientos de mi turno</h2>
              {current && (
                <Button onClick={() => setModal("movement")}>
                  <Plus size={16} />
                  Registrar movimiento
                </Button>
              )}
            </div>
            {current?.movements.length ? (
              <TableScroll>
                <table>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Descripción</th>
                      <th>Medio</th>
                      <th>Valor</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...current.movements].reverse().map((m: any) => (
                      <tr key={m.id}>
                        <td>{labels[m.type] ?? m.type}</td>
                        <td>{m.reason}</td>
                        <td>{labels[m.method]}</td>
                        <td className={m.amount < 0 ? "negative" : "positive"}>
                          {money(m.amount)}
                        </td>
                        <td>{date(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            ) : (
              <Empty
                title={
                  current ? "Tu turno está listo" : "Abre tu caja para empezar"
                }
                text={
                  current
                    ? "Los cobros y movimientos de este turno aparecerán aquí."
                    : "Registra la base de efectivo con la que comienzas."
                }
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Historial de turnos</h2>
              <Link className="text-link" to="/app/registers">
                Administrar cajas <ArrowUpRight size={15} />
              </Link>
            </div>
            <TableScroll>
              <table>
                <thead>
                  <tr>
                    <th>Caja</th>
                    <th>Usuario</th>
                    <th>Apertura</th>
                    <th>Estado</th>
                    <th>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data?.map((h: any) => (
                    <tr key={h.id}>
                      <td>{h.register.name}</td>
                      <td>{h.user.name}</td>
                      <td>{date(h.openedAt)}</td>
                      <td>
                        <Badge value={h.closedAt ? "CERRADO" : "ACTIVA"} />
                      </td>
                      <td>{h.closedAt ? money(h.difference) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </section>
        </>
      )}
      {modal && (
        <Modal
          title={
            modal === "open"
              ? "Abrir mi caja"
              : modal === "close"
                ? "Cerrar mi turno"
                : "Nuevo movimiento"
          }
          onClose={() => {
            setModal("");
            setCounted("");
          }}
        >
          <form onSubmit={submit}>
            {modal === "open" ? (
              <>
                <Field label="Caja">
                  <select name="registerId" required>
                    {registers.data?.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Base de efectivo"
                  name="opening"
                  type="number"
                  min="0"
                  required
                />
              </>
            ) : modal === "close" ? (
              <>
                {byMethod.length > 0 && (
                  <dl className="cash-close-summary">
                    {byMethod.map(([method, value]) => (
                      <div key={method}>
                        <dt>{labels[method] ?? method}</dt>
                        <dd>{money(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p>
                  Efectivo esperado en caja:{" "}
                  <strong>{money(current.expected)}</strong>
                </p>
                <Field
                  label="Efectivo contado"
                  name="counted"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={counted}
                  onChange={(e: any) => setCounted(e.target.value)}
                  required
                  autoFocus
                />
                {counted !== "" && (
                  <p
                    className={
                      "cash-difference " +
                      (Number(counted) === current.expected
                        ? "even"
                        : Number(counted) > current.expected
                          ? "over"
                          : "short")
                    }
                    role="status"
                  >
                    {Number(counted) === current.expected
                      ? "La caja cuadra exacto."
                      : Number(counted) > current.expected
                        ? `Sobran ${money(Number(counted) - current.expected)}`
                        : `Faltan ${money(current.expected - Number(counted))}`}
                  </p>
                )}
                <p className="muted">
                  El cierre guarda la diferencia y finaliza este turno.
                </p>
              </>
            ) : (
              <>
                <Field label="Tipo">
                  <select name="type">
                    <option value="INGRESO">Ingreso</option>
                    <option value="RETIRO">Retiro</option>
                    <option value="GASTO">Gasto</option>
                  </select>
                </Field>
                <Field
                  label="Valor en efectivo"
                  name="amount"
                  type="number"
                  min="1"
                  required
                />
                <Field label="Motivo" name="reason" required minLength={3} />
              </>
            )}
            <Button variant="primary" disabled={busy}>
              {busy
                ? "Guardando…"
                : modal === "close"
                  ? "Confirmar cierre"
                  : "Guardar"}
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Inventory() {
  const q = useData("inventory"),
    movements = useData("inventory-movements", "inventory/movements"),
    s = useSession();
  const store = isStore(s.user),
    item = stockItem(s.user);
  const [modal, setModal] = useState(false),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const toast = useToast(),
    qc = useQueryClient();
  // Agotados primero, luego stock bajo: lo urgente arriba.
  const stock = useMemo(
    () =>
      (q.data ?? [])
        .map((i: any) => {
          const qty = i.inventory[0]?.quantity || 0;
          return {
            ...i,
            qty,
            level: qty <= 0 ? 0 : qty <= i.minimum ? 1 : 2,
          };
        })
        .sort(
          (a: any, b: any) => a.level - b.level || a.name.localeCompare(b.name),
        ),
    [q.data],
  );
  const shown = stock.filter((i: any) =>
    i.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const stockValue = stock.reduce(
    (n: number, i: any) => n + Math.max(0, i.qty) * i.cost,
    0,
  );
  async function submit(e: any) {
    e.preventDefault();
    const body: any = Object.fromEntries(new FormData(e.currentTarget));
    body.quantity = Number(body.quantity);
    if (!body.targetBranchId) delete body.targetBranchId;
    setBusy(true);
    try {
      await api("inventory/adjustment", body);
      qc.invalidateQueries();
      setModal(false);
      toast("Inventario actualizado");
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Inventario"
        subtitle="Lo que tienes. Lo que necesitas. Sin sorpresas."
        action={
          <Button variant="primary" onClick={() => setModal(true)}>
            <Plus size={17} />
            Registrar movimiento
          </Button>
        }
      />
      <div className="section-links">
        {!store && (
          <Link to="/app/ingredients">
            Ingredientes <ArrowUpRight size={15} />
          </Link>
        )}
        <Link to="/app/products">
          {store ? "Productos" : "Recetas de productos"}{" "}
          <ArrowUpRight size={15} />
        </Link>
        <Link to="/app/purchases">
          Compras <ArrowUpRight size={15} />
        </Link>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        <>
          {stock.length > 0 && (
            <div className="metrics three">
              <Metric
                label="Valor del inventario"
                value={money(Math.round(stockValue))}
                detail="Existencias × costo unitario"
                icon={Package}
              />
              <Metric
                label="Stock bajo"
                value={stock.filter((i: any) => i.level === 1).length}
                detail="En el mínimo o por debajo"
                icon={TriangleAlert}
              />
              <Metric
                label="Agotados"
                value={stock.filter((i: any) => i.level === 0).length}
                detail={
                  store
                    ? "Productos sin unidades"
                    : "Ingredientes sin existencias"
                }
                icon={PackageX}
              />
            </div>
          )}
          <div className="panel">
            <div className="panel-title">
              <h2>Existencias por {item.toLowerCase()}</h2>
              <span className="muted">Sucursal actual</span>
            </div>
            {stock.length > 5 && (
              <div className="table-toolbar">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder={`Buscar ${item.toLowerCase()}…`}
                />
              </div>
            )}
            {q.data?.length ? (
              <TableScroll>
                <table>
                  <thead>
                    <tr>
                      <th>{item}</th>
                      <th>Disponible</th>
                      <th>Mínimo</th>
                      <th>Costo unitario</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((i: any) => {
                      const qty = i.qty;
                      return (
                        <tr key={i.id}>
                          <td>
                            <strong>{i.name}</strong>
                          </td>
                          <td>
                            {qty.toLocaleString("es-CO")}{" "}
                            {unitLabel(qty, i.unit)}
                          </td>
                          <td>
                            {i.minimum} {unitLabel(i.minimum, i.unit)}
                          </td>
                          <td>{money(i.cost)}</td>
                          <td>
                            <span
                              className={
                                "badge " +
                                ["CANCELADO", "PENDIENTE", "ACTIVA"][i.level]
                              }
                            >
                              {["Agotado", "Stock bajo", "Disponible"][i.level]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            ) : (
              <Empty
                title={
                  store
                    ? "Sin productos con inventario"
                    : "Agrega tus ingredientes"
                }
                text={
                  store
                    ? "Activa “Controlar inventario” en un producto para ver sus existencias aquí."
                    : "Después podrás registrar existencias y crear recetas."
                }
              />
            )}
            {stock.length > 0 && !shown.length && (
              <Empty title="Sin resultados" text="Prueba con otro nombre." />
            )}
          </div>
        </>
      )}
      <section className="panel">
        <div className="panel-title">
          <h2>Últimos movimientos</h2>
        </div>
        <TableScroll>
          <table>
            <thead>
              <tr>
                <th>{item}</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Motivo</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {movements.data?.map((m: any) => (
                <tr key={m.id}>
                  <td>{m.ingredient.name}</td>
                  <td>{labels[m.type] ?? m.type}</td>
                  <td className={m.quantity < 0 ? "negative" : "positive"}>
                    {m.quantity > 0 ? "+" : ""}
                    {m.quantity}
                  </td>
                  <td>{m.reason}</td>
                  <td>{date(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        {!movements.data?.length && (
          <Empty
            title="Sin movimientos todavía"
            text="Aquí verás entradas, ventas, mermas y ajustes."
          />
        )}
      </section>
      {modal && (
        <Modal title="Movimiento de inventario" onClose={() => setModal(false)}>
          <form onSubmit={submit}>
            <Field label={item}>
              <select name="ingredientId" required>
                {q.data?.map((i: any) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.unit}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo">
              <select name="type">
                <option value="ENTRADA">Entrada</option>
                <option value="AJUSTE">Ajuste</option>
                <option value="MERMA">Merma (cantidad negativa)</option>
                <option value="TRASLADO">Traslado (cantidad positiva)</option>
              </select>
            </Field>
            <Field
              label="Cantidad (+ entrada / − salida)"
              name="quantity"
              type="number"
              step="any"
              required
            />
            <Field label="Sucursal destino (solo traslados)">
              <select name="targetBranchId">
                <option value="">No aplica</option>
                {s.user.branches
                  .filter((b: any) => b.branchId !== s.branchId)
                  .map((b: any) => (
                    <option key={b.branchId} value={b.branchId}>
                      {b.branch.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Motivo" name="reason" minLength={3} required />
            <Button variant="primary" disabled={busy}>
              Guardar movimiento
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Purchases() {
  const user = useSession((s) => s.user),
    store = isStore(user),
    stockLabel = stockItem(user);
  const q = useData("purchases"),
    suppliers = useData("suppliers"),
    ingredients = useData("ingredients");
  const [modal, setModal] = useState(false),
    [settling, setSettling] = useState<any>(null),
    [items, setItems] = useState<any[]>([
      { ingredientId: "", quantity: 1, cost: 0 },
    ]),
    [busy, setBusy] = useState(false);
  const qc = useQueryClient(),
    toast = useToast();
  async function receive(id: string) {
    setBusy(true);
    try {
      await api(`purchases/${id}/receive`, {});
      qc.invalidateQueries();
      toast("Compra recibida. Inventario actualizado.");
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: any) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("purchases", {
        supplierId: new FormData(e.currentTarget).get("supplierId"),
        items,
      });
      qc.invalidateQueries();
      setModal(false);
      toast("Orden de compra creada");
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Compras"
        subtitle="Del proveedor a tu inventario, sin perder el hilo."
        action={
          <Button variant="primary" onClick={() => setModal(true)}>
            <Plus size={17} />
            Nueva compra
          </Button>
        }
      />
      <div className="section-links">
        <Link to="/app/suppliers">
          Proveedores <ArrowUpRight size={15} />
        </Link>
        {!store && (
          <Link to="/app/ingredients">
            Ingredientes <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
      <div className="panel">
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} />
        ) : q.data?.length ? (
          <TableScroll>
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Por pagar</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.supplier.name}</strong>
                      <small>
                        {p.items
                          .map(
                            (i: any) =>
                              `${i.quantity} ${i.ingredient.unit} ${i.ingredient.name}`,
                          )
                          .join(", ")}
                      </small>
                    </td>
                    <td>{date(p.createdAt)}</td>
                    <td>
                      <Badge value={p.status} />
                    </td>
                    <td>{money(p.total)}</td>
                    <td>{money(p.total - p.paid)}</td>
                    <td>
                      {p.status === "RECIBIDA" && p.paid < p.total && (
                        <Button onClick={() => setSettling(p)}>
                          Registrar abono
                        </Button>
                      )}
                      {p.status === "PENDIENTE" && (
                        <Button disabled={busy} onClick={() => receive(p.id)}>
                          Recibir compra
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : (
          <Empty
            title="Tus compras, en orden"
            text={`Crea una orden y recibe los ${stockLabel.toLowerCase()}s para actualizar el inventario.`}
          />
        )}
      </div>
      {settling && (
        <Modal
          title="Registrar abono a proveedor"
          subtitle="Registra un pago ya realizado por fuera de la caja POS."
          onClose={() => setSettling(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                await api(`purchases/${settling.id}/payment`, {
                  amount: Number(f.get("amount")),
                  reason: f.get("reason"),
                });
                qc.invalidateQueries();
                setSettling(null);
                toast("Abono registrado");
              } catch (e: any) {
                toast(e.message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Valor abonado"
              name="amount"
              type="number"
              min="1"
              max={settling.total - settling.paid}
              defaultValue={settling.total - settling.paid}
              required
            />
            <Field
              label="Referencia o motivo"
              name="reason"
              minLength={3}
              required
            />
            <Button variant="primary" disabled={busy}>
              Guardar abono
            </Button>
          </form>
        </Modal>
      )}
      {modal && (
        <Modal
          title="Nueva orden de compra"
          onClose={() => setModal(false)}
          wide
        >
          <form onSubmit={submit}>
            <Field label="Proveedor">
              <select name="supplierId" required>
                <option value="">Selecciona un proveedor</option>
                {suppliers.data?.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            {items.map((item, i) => (
              <div className="form-row" key={i}>
                <Field label={stockLabel}>
                  <select
                    required
                    value={item.ingredientId}
                    onChange={(e) =>
                      setItems((v) =>
                        v.map((x, n) =>
                          n === i
                            ? {
                                ...x,
                                ingredientId: e.target.value,
                                // Propone el último costo conocido; se puede corregir.
                                cost:
                                  x.cost ||
                                  ingredients.data?.find(
                                    (g: any) => g.id === e.target.value,
                                  )?.cost ||
                                  0,
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    <option value="">Selecciona</option>
                    {ingredients.data?.map((g: any) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.unit})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Cantidad"
                  type="number"
                  min="0.001"
                  step="any"
                  required
                  value={item.quantity}
                  onChange={(e: any) =>
                    setItems((v) =>
                      v.map((x, n) =>
                        n === i
                          ? { ...x, quantity: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
                <Field
                  label="Costo unitario"
                  type="number"
                  min="0"
                  required
                  value={item.cost}
                  onChange={(e: any) =>
                    setItems((v) =>
                      v.map((x, n) =>
                        n === i ? { ...x, cost: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              onClick={() =>
                setItems((v) => [
                  ...v,
                  { ingredientId: "", quantity: 1, cost: 0 },
                ])
              }
            >
              <Plus size={15} />
              Agregar {stockLabel.toLowerCase()}
            </Button>
            <div className="receipt-total">
              <span>Total</span>
              <strong>
                {money(items.reduce((s, i) => s + i.cost * i.quantity, 0))}
              </strong>
            </div>
            <Button variant="primary" disabled={busy}>
              Crear orden de compra
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Reports() {
  const bogotaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [from, setFrom] = useState(() =>
      bogotaDate.format(new Date(Date.now() - 30 * 86400000)),
    ),
    [to, setTo] = useState(() => bogotaDate.format(new Date())),
    [tab, setTab] = useState("products"),
    [scope, setScope] = useState("current");
  const s = useSession();
  const q = useQuery({
    queryKey: ["reports", s.branchId, from, to, scope],
    queryFn: () => get(`reports/sales?from=${from}&to=${to}&scope=${scope}`),
  });
  const d = q.data;
  const paidDay = (iso: string) => bogotaDate.format(new Date(iso));
  // Ventas por día (o por mes si el período supera dos meses), con los días sin ventas en cero.
  const trend = useMemo(() => {
    if (!d) return [];
    const monthly = Date.parse(to) - Date.parse(from) > 62 * 86400000;
    const key = (day: string) => (monthly ? day.slice(0, 7) : day);
    const totals: Record<string, number> = {};
    for (const o of d.orders)
      if (o.paidAt)
        totals[key(paidDay(o.paidAt))] =
          (totals[key(paidDay(o.paidAt))] ?? 0) + o.total;
    const out: { key: string; label: string; total: number }[] = [];
    const cursor = new Date(from + "T12:00:00-05:00");
    const end = new Date(to + "T12:00:00-05:00");
    while (cursor <= end) {
      const k = key(bogotaDate.format(cursor));
      if (!out.length || out.at(-1)!.key !== k)
        out.push({
          key: k,
          label: monthly
            ? new Intl.DateTimeFormat("es-CO", {
                month: "short",
                timeZone: "America/Bogota",
              }).format(cursor)
            : String(Number(k.slice(8))),
          total: totals[k] ?? 0,
        });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [d, from, to]);
  const trendMax = Math.max(1, ...trend.map((t) => t.total));
  // Restaurante: mesa, domicilio, recoger, llevar. Tienda: mostrador y domicilio.
  const services = useMemo(() => {
    const out: Record<string, number> = {};
    for (const o of d?.orders ?? []) {
      const label = serviceLabel(s.user, o.service);
      out[label] = (out[label] ?? 0) + o.total;
    }
    return out;
  }, [d, s.user]);
  async function excel() {
    const ExcelJS = await import("exceljs");
    const w = new ExcelJS.Workbook(),
      sheet = w.addWorksheet("Ventas");
    sheet.columns = [
      { header: "Pedido", key: "number", width: 15 },
      { header: "Fecha de cobro", key: "paidAt", width: 28 },
      { header: "Total", key: "total", width: 18 },
      { header: "Servicio", key: "service", width: 20 },
    ];
    sheet.addRows(
      d.orders.map((o: any) => ({
        ...o,
        paidAt: o.paidAt ? date(o.paidAt) : "",
        service: serviceLabel(s.user, o.service),
      })),
    );
    sheet.getRow(1).font = { bold: true };
    const blob = new Blob([await w.xlsx.writeBuffer()], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "ventas.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageTitle
        title="Reportes"
        subtitle="Entiende tu negocio. Decide con claridad."
        action={
          <div className="button-row">
            <Button onClick={() => window.print()}>
              <Printer size={16} />
              PDF / Imprimir
            </Button>
            <Button disabled={!d} onClick={excel}>
              <Download size={16} />
              Excel
            </Button>
            <Button
              disabled={!d}
              onClick={() =>
                exportCsv(
                  d.orders.map((o: any) => ({
                    pedido: o.number,
                    fecha: o.paidAt ? date(o.paidAt) : "",
                    total: o.total,
                    servicio: serviceLabel(s.user, o.service),
                    usuario: o.user.name,
                  })),
                  "ventas",
                )
              }
            >
              <Download size={16} />
              CSV
            </Button>
          </div>
        }
      />
      <div className="date-range">
        <Field
          label="Desde"
          type="date"
          value={from}
          onChange={(e: any) => setFrom(e.target.value)}
        />
        <Field
          label="Hasta"
          type="date"
          value={to}
          onChange={(e: any) => setTo(e.target.value)}
        />
        <Field label="Sucursales">
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="current">Sucursal actual</option>
            <option value="authorized">Todas mis sucursales</option>
          </select>
        </Field>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        <>
          <div className="metrics">
            <Metric
              label="Ventas brutas"
              value={money(d.gross)}
              detail={`${d.count} ventas cobradas`}
            />
            <Metric
              label="Devoluciones"
              value={money(d.refunds)}
              detail="Registradas sobre estas ventas"
            />
            <Metric
              label="Ventas netas"
              value={money(d.net)}
              detail="Ventas menos devoluciones"
            />
            <Metric
              label="Ticket promedio"
              value={money(d.average)}
              detail="Por venta cobrada"
            />
          </div>
          {d.count > 0 && (
            <section className="panel sales-panel">
              <div className="panel-title">
                <div>
                  <h2>Ventas en el período</h2>
                  <p>
                    {trend.length && trend[0].key.length === 7
                      ? "Ventas cobradas por mes"
                      : "Ventas cobradas por día"}
                  </p>
                </div>
              </div>
              <div className="chart">
                <div className="chart-labels">
                  <span>{money(trendMax)}</span>
                  <span>{money(Math.round(trendMax / 2))}</span>
                  <span>$0</span>
                </div>
                <div className="chart-bars">
                  {trend.map((t, i) => (
                    <div key={t.key} className="chart-bar-cell">
                      <div
                        className={"chart-bar " + (t.total ? "has-value" : "")}
                        style={{
                          height: Math.max(2, (t.total / trendMax) * 100) + "%",
                        }}
                        title={`${t.key} · ${money(t.total)}`}
                      />
                      <span>
                        {trend.length <= 16 ||
                        i % Math.ceil(trend.length / 12) === 0
                          ? t.label
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
          <div className="tabs">
            {[
              ["products", "Productos"],
              ["services", "Por servicio"],
              ["payments", "Medios de pago"],
              ["employees", "Por usuario"],
              ["customers", "Por cliente"],
              ["branches", "Por sucursal"],
              ["categories", "Por categoría"],
            ].map(([k, v]) => (
              <button
                className={tab === k ? "active" : ""}
                key={k}
                onClick={() => setTab(k)}
              >
                {v}
              </button>
            ))}
          </div>
          <section className="panel">
            {tab === "products" ? (
              <TableScroll>
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Unidades vendidas</th>
                      <th>Venta de productos</th>
                      <th>Costo histórico</th>
                      <th>Margen bruto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.products.map((p: any) => (
                      <tr key={p.name}>
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td>{p.quantity}</td>
                        <td>{money(p.total)}</td>
                        <td>{money(p.cost)}</td>
                        <td>{money(p.total - p.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            ) : (
              <div className="report-breakdown">
                {Object.entries(tab === "services" ? services : d[tab])
                  .sort((a: any, b: any) => b[1] - a[1])
                  .map(([name, value]: any) => (
                    <div key={name}>
                      <span>{labels[name] || name}</span>
                      <div className="report-track">
                        <i
                          style={{
                            width:
                              (d.gross ? (value / d.gross) * 100 : 0) + "%",
                          }}
                        />
                      </div>
                      <strong>{money(value)}</strong>
                    </div>
                  ))}
              </div>
            )}
            {!d.count && (
              <Empty
                title="Aún no hay ventas en este período"
                text="Prueba otro rango de fechas o registra tu primera venta."
              />
            )}
          </section>
          <p className="muted">
            Productos: importes antes de descuentos e impuestos. El costo
            utiliza el valor guardado al vender.{" "}
            {d.capped
              ? "Se alcanzó el límite de 10.000 ventas; reduce el período."
              : ""}
          </p>
        </>
      )}
    </>
  );
}
export function SettingsPage() {
  const hidden = hiddenPaths(useSession((s) => s.user));
  const q = useData("settings"),
    audit = useData("audit");
  const qc = useQueryClient(),
    toast = useToast(),
    s = useSession();
  const [tab, setTab] = useState("business"),
    [busy, setBusy] = useState(false);
  async function submit(e: any) {
    e.preventDefault();
    const b: any = Object.fromEntries(new FormData(e.currentTarget));
    b.taxRate = Math.round(Number(b.taxRate) * 100);
    setBusy(true);
    try {
      await api("settings", b, "PUT");
      qc.invalidateQueries();
      const user = await get("me");
      useSession.setState({ user });
      toast("Configuración guardada");
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  const options = [
    ["branches", "Sucursales", "Lugares donde opera tu negocio", Store],
    ["users", "Equipo y permisos", "Usuarios, roles y accesos", Users],
    ["registers", "Cajas", "Puntos de cobro de la sucursal", Wallet],
    ["tables-admin", "Mesas y zonas", "Distribución del salón", Armchair],
    ["drivers", "Domiciliarios", "Equipo de entregas", Truck],
  ];
  return (
    <>
      <PageTitle
        title="Configuración"
        subtitle="Un sistema que trabaja a tu manera."
      />
      <div className="tabs">
        {[
          ["business", "Mi negocio"],
          ["team", "Operación y equipo"],
          ["subscription", "Suscripción"],
          ["audit", "Auditoría"],
          ["integrations", "Integraciones"],
        ].map(([k, v]) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {v}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : tab === "business" ? (
        <section className="panel settings-panel">
          <h2>Información del negocio</h2>
          <p className="muted">
            Estos datos identifican tu operación y tus comprobantes.
          </p>
          <form onSubmit={submit}>
            <div className="form-grid">
              {[
                ["name", "Nombre comercial"],
                ["nit", "NIT"],
                ["phone", "Teléfono"],
                ["address", "Dirección"],
                ["city", "Ciudad"],
              ].map(([k, v]) => (
                <Field
                  key={k}
                  label={v}
                  name={k}
                  defaultValue={q.data[k] || ""}
                  required={["name", "city"].includes(k)}
                />
              ))}
              <Field
                label="Impuesto sobre la venta (%)"
                name="taxRate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                defaultValue={q.data.taxRate / 100}
              />
            </div>
            <div className="settings-info">
              <span>
                Moneda <strong>COP · Peso colombiano</strong>
              </span>
              <span>
                Zona horaria <strong>America/Bogota</strong>
              </span>
            </div>
            <Button variant="primary" disabled={busy}>
              Guardar cambios
            </Button>
          </form>
        </section>
      ) : tab === "team" ? (
        <div className="settings-list">
          {options
            .filter(([path]: any) => !hidden.includes(path))
            .map(([path, title, description, Icon]: any) => (
              <Link key={path} to={"/app/" + path}>
                <span className="operation-icon blue">
                  <Icon size={21} />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <ArrowRight size={18} />
              </Link>
            ))}
        </div>
      ) : tab === "subscription" ? (
        <section className="panel settings-panel">
          <span className="plan-icon">
            <Layers size={32} />
          </span>
          <h2>Plan {q.data.subscription.plan.name}</h2>
          <Badge value={q.data.subscription.status} />
          <p>Próxima revisión: {date(q.data.subscription.renewsAt)}</p>
          <div className="plan-features">
            {q.data.subscription.plan.features.map((f: string) => (
              <span key={f}>
                <Check size={16} />
                {(
                  {
                    pos: "Punto de venta",
                    tables: "Mesas",
                    kitchen: isStore(s.user) ? "Despachos" : "Cocina",
                    reports: "Reportes",
                    inventory: "Inventario",
                    purchases: "Compras",
                    delivery: "Domicilios",
                    recipes: "Recetas",
                    api: "API",
                  } as any
                )[f] || f}
              </span>
            ))}
          </div>
          <p className="muted">
            Los cambios de plan y la activación comercial se gestionan con el
            administrador de la plataforma. No se realizan cargos desde esta
            pantalla.
          </p>
        </section>
      ) : tab === "audit" ? (
        <section className="panel">
          <TableScroll>
            <table>
              <thead>
                <tr>
                  <th>Acción</th>
                  <th>Módulo</th>
                  <th>Registro</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {audit.data?.map((a: any) => (
                  <tr key={a.id}>
                    <td>{a.action}</td>
                    <td>{a.module}</td>
                    <td>
                      <code>{a.recordId?.slice(-10) || "—"}</code>
                    </td>
                    <td>{date(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      ) : (
        <section className="panel settings-panel">
          <h2>Conecta tus canales</h2>
          <p className="muted">
            Las integraciones requieren un proveedor y credenciales de
            producción.
          </p>
          {[
            ["WhatsApp Business", "Recepción de pedidos por webhook"],
            ["Facturación electrónica", "Proveedor fiscal para Colombia"],
            ["Pasarela de pagos", "Cobros y conciliación en línea"],
            ["Correo electrónico", "Notificaciones y recuperación de cuenta"],
          ].map(([a, b]) => (
            <div className="integration-row" key={a}>
              <div>
                <strong>{a}</strong>
                <p>{b}</p>
              </div>
              <span className="badge PENDIENTE">Sin configurar</span>
            </div>
          ))}
          <p>
            El origen de un pedido puede registrarse manualmente en el POS
            mientras se configura el canal externo.
          </p>
        </section>
      )}
    </>
  );
}
export function Onboarding() {
  const user = useSession((s) => s.user),
    store = isStore(user),
    hidden = hiddenPaths(user);
  const tasks = [
    [
      "settings",
      "Completa la información del negocio",
      "Nombre, NIT y datos de contacto",
      Store,
    ],
    [
      "categories",
      "Organiza tus categorías",
      "Ayuda a encontrar cada producto",
      Layers,
    ],
    [
      "products",
      store ? "Crea tu catálogo" : "Crea tu menú",
      store
        ? "Productos, servicios y precios"
        : "Precios, variantes y adicionales",
      store ? Layers : UtensilsCrossed,
    ],
    [
      "tables-admin",
      "Prepara tu salón",
      "Zonas y mesas para tus clientes",
      Armchair,
    ],
    [
      "cash",
      "Abre tu primera caja",
      "Registra la base inicial de efectivo",
      Wallet,
    ],
  ];
  return (
    <>
      <PageTitle
        title="Tu negocio empieza aquí."
        subtitle="Configura lo esencial. Puedes volver al resto cuando quieras."
        action={
          <Link className="button" to="/app">
            Saltar por ahora <ArrowRight size={16} />
          </Link>
        }
      />
      <div className="onboarding">
        <div className="onboarding-intro">
          <span className="plan-icon">
            <Store size={36} />
          </span>
          <h2>
            Unos pasos.
            <br />
            Todo listo para vender.
          </h2>
          <p>
            No necesitas configurarlo todo de una vez. Comienza por tu{" "}
            {store ? "catálogo" : "menú"} y tu caja.
          </p>
        </div>
        <div className="settings-list">
          {tasks
            .filter(([path]: any) => !hidden.includes(path))
            .map(([path, title, description, Icon]: any) => (
              <Link key={path} to={"/app/" + path}>
                <Icon size={22} />
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <ArrowRight size={18} />
              </Link>
            ))}
        </div>
      </div>
    </>
  );
}
