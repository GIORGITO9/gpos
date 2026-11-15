import { lazy, Suspense, useEffect, useState, useRef } from "react";
import {
  Routes,
  Route,
  NavLink,
  Navigate,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ShoppingBag,
  ReceiptText,
  Armchair,
  Truck,
  ChefHat,
  Package,
  ShoppingCart,
  Users,
  UtensilsCrossed,
  Wallet,
  ChartNoAxesCombined,
  Settings,
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  ArrowRight,
  Check,
  Store,
  Command,
  ShieldCheck,
  X,
  Sun,
  CalendarDays,
} from "lucide-react";
import { api, get, useSession, restore, can } from "./api";
import { Button, Field, Loading, Modal, useToast } from "./ui";
const loadPages = () => import("./pages");
const Dashboard = lazy(() =>
  loadPages().then((module) => ({ default: module.Dashboard })),
);
const Orders = lazy(() =>
  loadPages().then((module) => ({ default: module.Orders })),
);
const Tables = lazy(() =>
  loadPages().then((module) => ({ default: module.Tables })),
);
const Kitchen = lazy(() =>
  loadPages().then((module) => ({ default: module.Kitchen })),
);
const Reports = lazy(() =>
  loadPages().then((module) => ({ default: module.Reports })),
);
const Cash = lazy(() =>
  loadPages().then((module) => ({ default: module.Cash })),
);
const Inventory = lazy(() =>
  loadPages().then((module) => ({ default: module.Inventory })),
);
const Purchases = lazy(() =>
  loadPages().then((module) => ({ default: module.Purchases })),
);
const SettingsPage = lazy(() =>
  loadPages().then((module) => ({ default: module.SettingsPage })),
);
const Admin = lazy(() =>
  loadPages().then((module) => ({ default: module.Admin })),
);
const Onboarding = lazy(() =>
  loadPages().then((module) => ({ default: module.Onboarding })),
);
const Catalog = lazy(() =>
  import("./catalog").then((module) => ({ default: module.Catalog })),
);
const POS = lazy(() => import("./pos"));
const nav = [
  ["Inicio", "/app", LayoutDashboard, "pedidos.ver"],
  ["Punto de venta", "/app/pos", ShoppingBag, "pedidos.crear"],
  ["Pedidos", "/app/orders", ReceiptText, "pedidos.ver"],
  ["Mesas", "/app/tables", Armchair, "mesas.ver"],
  ["Domicilios", "/app/delivery", Truck, "pedidos.ver"],
  ["Para recoger", "/app/pickup", ShoppingBag, "pedidos.ver"],
  ["Cocina", "/app/kitchen", ChefHat, "pedidos.ver"],
  ["Inventario", "/app/inventory", Package, "inventario.ver"],
  ["Compras", "/app/purchases", ShoppingCart, "compras.ver"],
  ["Clientes", "/app/customers", Users, "clientes.ver"],
  ["Productos", "/app/products", UtensilsCrossed, "productos.ver"],
  ["Caja", "/app/cash", Wallet, "caja.ver"],
  ["Reportes", "/app/reports", ChartNoAxesCombined, "reportes.ver"],
  ["Configuración", "/app/settings", Settings, "configuracion.ver"],
] as const;
function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-icon">
        <UtensilsCrossed size={20} />
      </span>
      <span>
        gpos<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export default function App() {
  const s = useSession();
  useEffect(() => {
    restore().catch(() => useSession.getState().clear());
  }, []);
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Auth />} />
      <Route path="/register" element={<Auth register />} />
      <Route
        path="/app/*"
        element={
          !s.ready ? (
            <Loading />
          ) : !s.user ? (
            <Navigate to="/login" />
          ) : s.user.role === "SUPER_ADMIN" ? (
            <Navigate to="/admin" />
          ) : (
            <Shell />
          )
        }
      />
      <Route
        path="/admin"
        element={
          !s.ready ? (
            <Loading />
          ) : s.user?.role === "SUPER_ADMIN" ? (
            <Suspense fallback={<Loading />}>
              <Admin />
            </Suspense>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
function Landing() {
  return (
    <div className="landing">
      <nav>
        <Brand />
        <div>
          <a href="#features">Tu operación</a>
          <a href="#plans">Planes</a>
          <Link to="/login">Iniciar sesión</Link>
          <Link className="button primary" to="/register">
            Probar gratis <ArrowRight size={16} />
          </Link>
        </div>
      </nav>
      <section className="landing-hero">
        <h1>
          Tu negocio.
          <br />
          <span>Todo en su lugar.</span>
        </h1>
        <p>
          Del primer pedido al cierre de caja. Conecta tu salón, tu cocina y tus
          ventas en una experiencia simple.
        </p>
        <div className="hero-actions">
          <Link className="button primary large" to="/register">
            Empezar mi prueba <ArrowRight size={18} />
          </Link>
          <Link className="button large" to="/login">
            Entrar a mi negocio
          </Link>
        </div>
        <span className="fine">
          Para restaurantes, cafeterías y negocios de comidas.
        </span>
        <div className="product-preview">
          <div className="preview-sidebar">
            <Brand />
            <span>Inicio</span>
            <span>Punto de venta</span>
            <span>Pedidos</span>
            <span>Cocina</span>
          </div>
          <div className="preview-main">
            <span className="preview-label">Así se conecta tu operación</span>
            <h2>
              Un buen día empieza
              <br />
              con todo en orden.
            </h2>
            <div className="preview-flow">
              <div>
                <ReceiptText />
                <strong>Pedido</strong>
                <span>Un solo registro</span>
              </div>
              <ArrowRight />
              <div>
                <ChefHat />
                <strong>Cocina</strong>
                <span>Preparación visible</span>
              </div>
              <ArrowRight />
              <div>
                <Wallet />
                <strong>Venta</strong>
                <span>Caja e inventario</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="features" className="landing-features">
        <h2>
          Menos pendientes.
          <br />
          Más tiempo para tus clientes.
        </h2>
        <div>
          {[
            [
              "Una venta, todo conectado",
              "Mesas, domicilios y pedidos para recoger comparten el mismo flujo.",
              ReceiptText,
            ],
            [
              "Tu cocina, a su ritmo",
              "Cada pedido avanza desde nuevo hasta listo. Sin perder los detalles.",
              ChefHat,
            ],
            [
              "Las cuentas claras",
              "Pagos mixtos, movimientos de caja y reportes de ventas en un solo lugar.",
              ChartNoAxesCombined,
            ],
          ].map(([title, copy, Icon]: any) => (
            <article key={title}>
              <Icon size={28} />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="plans" className="landing-plans">
        <h2>Espacio para crecer.</h2>
        <p>
          Empieza con lo que necesitas. Amplía tu operación cuando estés listo.
        </p>
        <div>
          {[
            [
              "Starter",
              "Una operación simple",
              "1 sucursal · 5 usuarios",
              "POS, mesas, cocina y reportes",
            ],
            [
              "Professional",
              "Tu negocio conectado",
              "3 sucursales · 20 usuarios",
              "Inventario, compras y recetas",
            ],
            [
              "Business",
              "Más posibilidades",
              "Límites configurables",
              "Operación multisucursal",
            ],
          ].map((p) => (
            <article key={p[0]}>
              <h3>{p[0]}</h3>
              <p>{p[1]}</p>
              <strong>{p[2]}</strong>
              <span>{p[3]}</span>
              <Link className="button" to="/register">
                Crear mi cuenta <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </div>
        <small>
          Las tarifas comerciales se configuran por el administrador de la
          plataforma. Integraciones externas sujetas a activación.
        </small>
      </section>
      <section className="faq">
        <h2>Antes de empezar.</h2>
        {[
          [
            "¿Necesito instalar algo?",
            "No. GPOS funciona desde el navegador y requiere conexión a internet.",
          ],
          [
            "¿Puedo usar varias sucursales?",
            "Sí. Cada usuario accede únicamente a las sucursales que tiene asignadas, dentro de los límites de su plan.",
          ],
          [
            "¿Incluye facturación electrónica y WhatsApp?",
            "Estas integraciones requieren configurar un proveedor y sus credenciales. El comprobante POS no reemplaza un documento fiscal.",
          ],
        ].map(([a, b]) => (
          <details key={a}>
            <summary>{a}</summary>
            <p>{b}</p>
          </details>
        ))}
      </section>
      <footer>
        <Brand />
        <span>Hecho para el ritmo de tu negocio.</span>
        <Link to="/login">
          Acceder <ArrowRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
function Auth({ register = false }: any) {
  const s = useSession(),
    navigate = useNavigate(),
    toast = useToast(),
    qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: any) {
    e.preventDefault();
    setPending(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const j = await api("auth/" + (register ? "register" : "login"), body);
      await qc.cancelQueries();
      qc.clear();
      s.setSession(j.data);
      s.setBranch(j.data.user.branches?.[0]?.branchId || "");
      navigate(
        j.data.user.role === "SUPER_ADMIN"
          ? "/admin"
          : register
            ? "/app/onboarding"
            : "/app",
      );
      if (register) toast("Tu negocio está listo para configurarse");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <Brand />
        <div>
          <h1>
            El buen servicio
            <br />
            empieza aquí.
          </h1>
          <p>
            Tu salón, tu cocina y tus cuentas.
            <br />
            Por fin, trabajando juntos.
          </p>
          <div className="auth-symbol">
            <UtensilsCrossed size={88} strokeWidth={1} />
          </div>
        </div>
        <span>GPOS · Hecho para negocios de comidas</span>
      </div>
      <main className="auth-main">
        <Link className="back-link" to="/">
          Volver al inicio
        </Link>
        <form onSubmit={submit}>
          <h1>
            {register ? "Dale espacio a tu negocio." : "Qué bueno verte."}
          </h1>
          <p>
            {register
              ? "Crea tu cuenta y empieza a organizar tu operación."
              : "Ingresa para continuar con tu operación."}
          </p>
          {register && (
            <>
              <Field
                label="Tu nombre"
                name="name"
                required
                autoComplete="name"
              />
              <Field label="Nombre del negocio" name="business" required />
            </>
          )}
          <Field
            label="Correo electrónico"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <Field
            label="Contraseña"
            name="password"
            type="password"
            minLength={register ? 10 : 1}
            autoComplete={register ? "new-password" : "current-password"}
            required
          />
          {register && <small>Utiliza al menos 10 caracteres.</small>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button variant="primary" disabled={pending}>
            {pending
              ? "Un momento…"
              : register
                ? "Crear mi negocio"
                : "Iniciar sesión"}
            <ArrowRight size={18} />
          </Button>
          <p className="auth-switch">
            {register ? "¿Ya tienes una cuenta?" : "¿Primera vez aquí?"}{" "}
            <Link to={register ? "/login" : "/register"}>
              {register ? "Iniciar sesión" : "Crear mi negocio"}
            </Link>
          </p>
        </form>
        <span className="auth-bottom">
          <ShieldCheck size={15} /> Cada negocio, su propio espacio.
        </span>
      </main>
    </div>
  );
}
function Shell() {
  const s = useSession(),
    navigate = useNavigate(),
    location = useLocation(),
    qc = useQueryClient();
  const [menu, setMenu] = useState(false),
    [notices, setNotices] = useState(false);
  const notes = useQuery({
    queryKey: ["notifications"],
    queryFn: () => get("notifications"),
    refetchInterval: 30000,
  });
  const drawerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const isPOS = location.pathname === "/app/pos";
  useEffect(() => {
    const viewport = window.visualViewport;
    const content = contentRef.current;
    if (!isPOS || !viewport || !content) return;

    let frame = 0;
    function update() {
      if (!viewport || !content) return;
      // iOS Safari can resize only the visible area when the keyboard opens.
      const keyboard =
        Math.abs(viewport.scale - 1) < 0.01 &&
        document.documentElement.clientHeight - viewport.height > 120;
      content.toggleAttribute("data-pos-keyboard", keyboard);
      content.style.setProperty("--pos-visible-height", `${viewport.height}px`);
      content.style.setProperty("--pos-visible-top", `${viewport.offsetTop}px`);
      const active = document.activeElement;
      const form = active?.closest(".payment-form");
      if (keyboard && active && form && content.contains(form)) {
        const field = active.getBoundingClientRect();
        const area = form.getBoundingClientRect();
        if (field.bottom > area.bottom - 8)
          form.scrollTop += field.bottom - area.bottom + 8;
        else if (field.top < area.top + 8)
          form.scrollTop -= area.top - field.top + 8;
      }
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }
    update();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      content.removeAttribute("data-pos-keyboard");
      content.style.removeProperty("--pos-visible-height");
      content.style.removeProperty("--pos-visible-top");
    };
  }, [isPOS]);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement;
    drawerRef.current?.querySelector<HTMLElement>("button,a[href]")?.focus();
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(false);
      }
      if (e.key === "Tab") {
        const elements = Array.from(
          drawerRef.current?.querySelectorAll<HTMLElement>(
            "a[href],button:not(:disabled)",
          ) || [],
        ).filter((el) => el.getClientRects().length > 0);
        if (e.shiftKey && document.activeElement === elements[0]) {
          e.preventDefault();
          elements.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === elements.at(-1)) {
          e.preventDefault();
          elements[0]?.focus();
        }
      }
    }
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [menu]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMenu(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const branch =
    s.user.branches.find((b: any) => b.branchId === s.branchId)?.branch ||
    s.user.branches[0]?.branch;
  useEffect(() => {
    setMenu(false);
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.defaultPrevented || document.querySelector('[aria-modal="true"]'))
        return;
      if (e.key === "F2") {
        const search =
          document.querySelector<HTMLInputElement>("#product-search");
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
          return;
        }
      }
      const pages: Record<string, string> = {
        F1: "pos",
        F2: "pos",
        F3: "customers",
        F4: "orders",
        F5: "tables",
        F6: "cash",
      };
      if (pages[e.key]) {
        e.preventDefault();
        navigate("/app/" + pages[e.key]);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".search input")?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  async function logout() {
    await api("auth/logout", {});
    s.clear();
    qc.clear();
    navigate("/login");
  }
  return (
    <div className={isPOS ? "app-shell pos-fullscreen" : "app-shell"}>
      <a className="skip-link button" href="#main-content">
        Ir al contenido
      </a>
      {menu && <div className="mobile-scrim" onClick={() => setMenu(false)} />}
      <aside
        id="app-navigation"
        ref={drawerRef}
        role={menu ? "dialog" : undefined}
        aria-modal={menu ? true : undefined}
        aria-label={menu ? "Navegación principal" : undefined}
        className={"sidebar " + (menu ? "open" : "")}
      >
        {menu && (
          <button
            className="icon-button drawer-close"
            aria-label="Cerrar menú"
            onClick={() => setMenu(false)}
          >
            <X size={20} />
          </button>
        )}
        <Brand />
        <div className="workspace">
          <span className="workspace-icon">
            <Store size={19} />
          </span>
          <div>
            <strong>{s.user.tenant.name}</strong>
            <span>{s.user.tenant.subscription.plan.name}</span>
          </div>
        </div>
        <nav>
          {nav
            .filter((n) => can(s.user, n[3]))
            .map(([title, to, Icon], i) => (
              <div key={to}>
                {[1, 6, 11].includes(i) && (
                  <span className="nav-section">
                    {i === 1
                      ? "VENTAS"
                      : i === 6
                        ? "OPERACIÓN"
                        : "ADMINISTRACIÓN"}
                  </span>
                )}
                <NavLink
                  to={to}
                  end={to === "/app"}
                  aria-label={title}
                  title={title}
                >
                  <Icon size={19} strokeWidth={1.7} />
                  <span>{title}</span>
                  {title === "Punto de venta" && <kbd>F1</kbd>}
                </NavLink>
              </div>
            ))}
        </nav>
        <div className="sidebar-foot">
          <div className="online-dot" />
          <span>Operación en línea</span>
          <Command size={14} />
        </div>
        <button className="profile" onClick={logout} title="Cerrar sesión">
          <span className="avatar">{s.user.name.slice(0, 1)}</span>
          <span>
            <strong>{s.user.name}</strong>
            <small>
              {s.user.role === "OWNER" ? "Propietario" : s.user.role}
            </small>
          </span>
          <LogOut size={17} />
        </button>
      </aside>
      <div className="app-body" inert={menu ? true : undefined}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              aria-expanded={menu}
              aria-controls="app-navigation"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <Store size={17} />
            <select
              aria-label="Sucursal activa"
              value={branch?.id || ""}
              onChange={(e) => {
                s.setBranch(e.target.value);
                qc.clear();
              }}
            >
              {s.user.branches.map((b: any) => (
                <option key={b.branchId} value={b.branchId}>
                  {b.branch.name}
                </option>
              ))}
            </select>
            <span className="topbar-divider" />
            <span className="topbar-date">
              <CalendarDays size={15} />
              {new Intl.DateTimeFormat("es-CO", {
                day: "numeric",
                month: "long",
                timeZone: "America/Bogota",
              }).format(new Date())}
            </span>
          </div>
          <div className="topbar-right">
            {s.user.tenant.name.includes("Demo") && (
              <span className="demo-label">
                <span className="demo-full">Datos de demostración</span>
                <span className="demo-short">Demo</span>
              </span>
            )}
            <button
              className="icon-button notification-button"
              onClick={() => setNotices(true)}
              aria-label="Ver notificaciones"
            >
              <Bell size={19} />
              {notes.data?.some((n: any) => !n.read) && <i />}
            </button>
            <span className="avatar small">{s.user.name.slice(0, 1)}</span>
          </div>
        </header>
        <main
          ref={contentRef}
          className="content"
          id="main-content"
          tabIndex={-1}
        >
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route
                index
                element={
                  s.user.role === "COCINA" ? (
                    <Kitchen />
                  ) : s.user.role === "INVENTARIO" ? (
                    <Inventory />
                  ) : s.user.role === "DOMICILIARIO" ? (
                    <Orders service="DOMICILIO" />
                  ) : (
                    <Dashboard />
                  )
                }
              />
              <Route path="pos" element={<POS />} />
              <Route path="orders" element={<Orders />} />
              <Route path="tables" element={<Tables />} />
              <Route path="delivery" element={<Orders service="DOMICILIO" />} />
              <Route path="pickup" element={<Orders service="RECOGER" />} />
              <Route path="kitchen" element={<Kitchen />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="purchases" element={<Purchases />} />
              <Route path="cash" element={<Cash />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="onboarding" element={<Onboarding />} />
              {[
                "products",
                "categories",
                "modifiers",
                "customers",
                "suppliers",
                "ingredients",
                "branches",
                "tables-admin",
                "drivers",
                "registers",
                "users",
              ].map((r) => (
                <Route
                  key={r}
                  path={r}
                  element={
                    <Catalog resource={r === "tables-admin" ? "tables" : r} />
                  }
                />
              ))}
              <Route path="*" element={<Navigate to="/app" />} />
            </Routes>
          </Suspense>
        </main>
        <nav className="bottom-nav">
          {nav
            .slice(0, 4)
            .filter((item) => can(s.user, item[3]))
            .map(([title, to, Icon]) => (
              <NavLink to={to} end={to === "/app"} key={to}>
                <Icon size={20} />
                <span>{title === "Punto de venta" ? "Vender" : title}</span>
              </NavLink>
            ))}
          <button
            aria-expanded={menu}
            aria-controls="app-navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={20} />
            <span>Más</span>
          </button>
        </nav>
      </div>
      {notices && (
        <Modal title="Notificaciones" onClose={() => setNotices(false)}>
          {notes.data?.length ? (
            notes.data.map((n: any) => (
              <div className="notice" key={n.id}>
                <Bell size={18} />
                <span>{n.title}</span>
                {!n.read && <i className="online-dot" />}
              </div>
            ))
          ) : (
            <p className="muted">No hay notificaciones pendientes.</p>
          )}
          <Button
            onClick={async () => {
              await api("notifications/read", {});
              qc.invalidateQueries({ queryKey: ["notifications"] });
              setNotices(false);
            }}
          >
            Marcar como leídas
          </Button>
        </Modal>
      )}
    </div>
  );
}
