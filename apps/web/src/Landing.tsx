import { useEffect, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, money } from "./api";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  Armchair,
  ChartNoAxesCombined,
  Check,
  ChefHat,
  ChevronDown,
  Package,
  ReceiptText,
  RotateCcw,
  Mail,
  Monitor,
  ShieldCheck,
  Smartphone,
  Sparkles,
  WifiOff,
  ScanBarcode,
  Store,
  Tag,
  Truck,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import "./landing.css";

const restaurantJourney = [
  {
    name: "Pedido",
    icon: ReceiptText,
    title: "Mesa 04",
    status: "Pedido abierto",
    action: "Enviar a cocina",
    next: "En preparación",
    detail: "Registra los productos y envía la primera ronda a cocina.",
  },
  {
    name: "Cocina",
    icon: ChefHat,
    title: "Comanda de mesa",
    status: "En preparación",
    action: "Marcar lista y entregada",
    next: "Lista para cobrar",
    detail: "La cocina marca la comanda lista y el mesero registra la entrega.",
  },
  {
    name: "Caja",
    icon: Wallet,
    title: "Cobrar mesa",
    status: "Lista para cobrar",
    action: "Confirmar cobro",
    next: "Pago registrado",
    detail: "Confirma el pago y consulta el movimiento de caja de la venta.",
  },
];
const storeJourney = [
  {
    name: "Venta",
    icon: ScanBarcode,
    title: "Venta en mostrador",
    status: "Ticket abierto",
    action: "Ir a cobrar",
    next: "Listo para cobrar",
    detail: "Escanea o busca los productos. Los servicios se agregan igual.",
  },
  {
    name: "Cobro",
    icon: Wallet,
    title: "Cobrar ticket",
    status: "Listo para cobrar",
    action: "Confirmar cobro",
    next: "Pago registrado",
    detail: "Sin pasar por cocina: el ticket se cobra en el momento.",
  },
  {
    name: "Inventario",
    icon: Package,
    title: "Existencias",
    status: "Pago registrado",
    action: "Ver existencias",
    next: "Stock actualizado",
    detail:
      "Cada producto descuenta sus unidades; los servicios no tocan el inventario.",
  },
];
const modes = {
  restaurante: {
    label: "Restaurante",
    icon: UtensilsCrossed,
    journey: restaurantJourney,
    items: [
      ["Hamburguesa de la casa", "$18.000"],
      ["Limonada natural", "$7.000"],
    ],
    total: "$25.000",
    closing: "La mesa queda libre y la venta se registra en caja.",
    result: ["Receta descontada", "−1 pan · −150 g de carne en este ejemplo"],
  },
  tienda: {
    label: "Tienda",
    icon: Store,
    journey: storeJourney,
    items: [
      ["Cuaderno argollado", "$10.000"],
      ["Instalación de software", "$20.000"],
    ],
    total: "$30.000",
    closing: "El ticket queda pagado y la venta se registra en caja.",
    result: [
      "Stock actualizado",
      "−1 cuaderno · el servicio no descuenta stock",
    ],
  },
} as const;
type Mode = keyof typeof modes;

const modules = [
  {
    id: "salon",
    label: "Ventas y mesas",
    icon: Armchair,
    title: "Atiende cada venta desde el mismo POS.",
    copy: "Cobra en mostrador, abre una cuenta de mesa o toma un domicilio. Las tiendas activan las mesas solo si las usan.",
    features: [
      [
        "Salón",
        "Agrega rondas, traslada cuentas, une mesas o mueve productos junto con sus abonos.",
      ],
      [
        "Venta directa",
        "Cobra al instante desde el ticket: para llevar en restaurantes, venta en mostrador en tiendas.",
      ],
      [
        "Catálogo",
        "Busca por nombre o código de barras y configura categorías, variantes y modificadores.",
      ],
      [
        "Clientes",
        "Guarda clientes y sus direcciones para atender pedidos de domicilio.",
      ],
    ],
  },
  {
    id: "cocina",
    label: "Cocina y despachos",
    icon: ChefHat,
    title: "Cada pedido llega a quien lo prepara.",
    copy: "En restaurantes, la cocina ve platos, cantidades y notas. En tiendas, el mismo tablero alista y despacha los domicilios.",
    features: [
      ["Comandas", "Envía pedidos y rondas nuevas al tablero de cocina."],
      [
        "Despachos",
        "Las tiendas alistan pedidos a domicilio y asignan el domiciliario al salir.",
      ],
      [
        "Preparación",
        "Organiza productos por estación y sigue el avance de cada ronda.",
      ],
      [
        "Entrega",
        "Marca la ronda como lista y luego como entregada desde su pedido.",
      ],
    ],
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: Package,
    title: "Sabe cuánto puedes vender antes de quedarte sin stock.",
    copy: "Restaurantes descuentan ingredientes por receta. Tiendas descuentan unidades por producto, y los servicios no tocan el inventario.",
    features: [
      [
        "Stock por producto",
        "En tiendas, cada producto lleva sus existencias y su alerta de pocas unidades.",
      ],
      [
        "Recetas",
        "Consulta cuántas unidades puedes vender y qué ingrediente limita la disponibilidad.",
      ],
      [
        "Reposición",
        "Filtra por pocas unidades o agotados y repón ingredientes desde el POS con una vista previa.",
      ],
      [
        "Compras",
        "Registra proveedores, recibe compras y controla los saldos pendientes.",
      ],
      [
        "Movimientos",
        "Consulta entradas, salidas, mermas y traslados de inventario por sucursal.",
      ],
    ],
  },
  {
    id: "caja",
    label: "Caja",
    icon: Wallet,
    title: "Del primer abono al cierre de turno.",
    copy: "Consulta qué entró en caja y cuánto sigue pendiente por cobrar.",
    features: [
      [
        "Pagos",
        "Combina medios de pago, divide la cuenta por productos y conserva los abonos al agregar otra ronda.",
      ],
      [
        "Efectivo",
        "Ingresa lo recibido y calcula el cambio. Caja registra el valor de la venta.",
      ],
      [
        "Turnos",
        "Gestiona aperturas, ingresos, retiros, gastos, devoluciones y arqueos.",
      ],
      [
        "Comprobantes",
        "Consulta e imprime el comprobante con formatos para rollos térmicos de 58 y 80 mm.",
      ],
    ],
  },
  {
    id: "gestion",
    label: "Gestión",
    icon: ChartNoAxesCombined,
    title: "Revisa cómo va cada sucursal.",
    copy: "Usa los datos de la operación para comparar ventas y organizar el trabajo de tu equipo.",
    features: [
      [
        "Reportes",
        "Filtra ventas por periodo, sucursal, producto o medio de pago y exporta a CSV o Excel.",
      ],
      [
        "Sucursales y equipo",
        "Asigna sucursales a los usuarios y controla el acceso según el rol.",
      ],
      [
        "Configuración",
        "Define los datos del negocio, las cajas, las mesas y el impuesto de tu operación.",
      ],
      [
        "Importación",
        "Carga productos, servicios, clientes e ingredientes desde CSV o Excel.",
      ],
    ],
  },
] as const;

const salesEmail = "webcodecol@webcodecol.com";
const salesLink = (subject: string) =>
  `mailto:${salesEmail}?subject=${encodeURIComponent(subject)}`;
const featureLabels: Record<string, string> = {
  pos: "Punto de venta",
  tables: "Mesas",
  kitchen: "Cocina",
  reports: "Reportes",
  inventory: "Inventario",
  purchases: "Compras",
  delivery: "Domicilios",
  recipes: "Recetas",
  api: "API",
};
const limitLabels = {
  branches: ["sucursal", "sucursales"],
  users: ["usuario", "usuarios"],
  registers: ["caja", "cajas"],
  products: ["producto", "productos"],
} as const;
type PublicPlan = {
  id: string;
  name: string;
  price: number;
  features: string[];
  limits: Record<string, number>;
};
const moduleImages = {
  salon: "mesas",
  cocina: "cocina",
  inventario: "inventario",
  caja: "caja",
  gestion: "reportes",
} as const;
const showcase = "/showcase/";

const questions = [
  [
    "¿Sirve para una tienda que no vende comida?",
    "Sí. GPOS tiene una versión para tiendas de productos o servicios: venta en mostrador, inventario por producto, servicios sin stock y domicilios. Las mesas se activan solo si tu negocio las usa.",
  ],
  [
    "¿Necesito instalar algo?",
    "GPOS funciona desde el navegador y requiere conexión a internet. La impresión directa en una térmica requiere configurar la impresora y el equipo de caja.",
  ],
  [
    "¿Puedo usar varias sucursales?",
    "Sí. Cada usuario accede a las sucursales que tiene asignadas, dentro de los límites de su plan.",
  ],
  [
    "¿Incluye facturación electrónica y WhatsApp?",
    "La facturación electrónica y la integración automática con WhatsApp no están activas. El comprobante de GPOS documenta el cobro del POS.",
  ],
] as const;

function OrderDemo({ trial, mode }: { trial: string; mode: Mode }) {
  const { journey, items, total, closing, result } = modes[mode];
  const [step, setStep] = useState(0);
  const completed = step === journey.length;
  const current = journey[Math.min(step, journey.length - 1)];
  const StageIcon = current.icon;

  return (
    <section
      id="demo"
      className="landing-demo"
      aria-label="Demo interactiva de GPOS"
    >
      <header className="landing-demo-header">
        <h2>
          <Store size={19} aria-hidden="true" />{" "}
          {mode === "tienda" ? "Del ticket al stock" : "Del pedido al cobro"}
        </h2>
        <span>Demo interactiva</span>
      </header>
      <div
        className="landing-journey"
        role="group"
        aria-label="Etapas de la venta"
      >
        {journey.map(({ name, icon: Icon }, index) => (
          <button
            key={name}
            type="button"
            aria-pressed={index === Math.min(step, journey.length - 1)}
            onClick={() => setStep(index)}
          >
            {step > index ? (
              <Check size={17} aria-hidden="true" />
            ) : (
              <Icon size={17} aria-hidden="true" />
            )}
            {name}
          </button>
        ))}
      </div>
      <div className="landing-ticket">
        <div key={step} className="landing-ticket-state">
          <div className="landing-ticket-heading">
            <div className="landing-ticket-title">
              <span className="landing-ticket-icon">
                {completed ? (
                  <Check size={21} aria-hidden="true" />
                ) : (
                  <StageIcon size={21} aria-hidden="true" />
                )}
              </span>
              <div>
                <span className="landing-ticket-number">
                  Pedido de ejemplo #024
                </span>
                <h3>{completed ? "Venta cerrada" : current.title}</h3>
              </div>
            </div>
            <span
              className={
                completed
                  ? "landing-ticket-status is-paid"
                  : "landing-ticket-status"
              }
            >
              {completed ? current.next : current.status}
            </span>
          </div>
          <dl className="landing-ticket-items">
            {items.map(([name, price]) => (
              <div key={name}>
                <dt>
                  <span>1×</span> {name}
                </dt>
                <dd>{price}</dd>
              </div>
            ))}
          </dl>
          <div className="landing-ticket-total">
            <span>{completed ? "Registrado en caja" : "Total del pedido"}</span>
            <strong>{total}</strong>
          </div>
        </div>
        <p className="landing-ticket-explanation" role="status">
          {completed ? closing : current.detail}
        </p>
        {completed && (
          <div className="landing-recipe-result">
            <Package size={18} aria-hidden="true" />
            <div>
              <strong>{result[0]}</strong>
              <small>{result[1]}</small>
            </div>
          </div>
        )}
        <button
          type="button"
          className={
            completed
              ? "button landing-demo-action"
              : "button primary landing-demo-action"
          }
          onClick={() => setStep(completed ? 0 : step + 1)}
        >
          {completed ? (
            <>
              Repetir demo <RotateCcw size={17} aria-hidden="true" />
            </>
          ) : (
            <>
              {current.action} <ArrowRight size={17} aria-hidden="true" />
            </>
          )}
        </button>
        {completed && (
          <Link
            className="button primary landing-demo-action landing-demo-trial"
            to="/register"
          >
            {trial}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}

function FeatureExplorer() {
  const [active, setActive] = useState<(typeof modules)[number]["id"]>("salon");
  const current = modules.find((entry) => entry.id === active) ?? modules[0];

  return (
    <section
      id="features"
      className="landing-features landing-shell"
      aria-labelledby="features-title"
    >
      <div className="landing-section-heading">
        <h2 id="features-title">Mira cómo trabaja GPOS.</h2>
        <p>
          Explora las funciones que conectan tus ventas, tu inventario y la
          administración del negocio.
        </p>
      </div>
      <div className="landing-explorer">
        <div
          className="landing-module-nav"
          role="group"
          aria-label="Funciones de GPOS"
        >
          {modules.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={active === id}
              aria-controls="landing-module-panel"
              onClick={() => setActive(id)}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
              <ArrowRight
                className="landing-module-arrow"
                size={17}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
        <div
          id="landing-module-panel"
          className="landing-module-panel"
          role="region"
          aria-labelledby="landing-module-title"
        >
          <div key={active} className="landing-module-content">
            <h3 id="landing-module-title">{current.title}</h3>
            <p>{current.copy}</p>
            <img
              className="landing-module-image"
              src={showcase + moduleImages[current.id] + ".webp"}
              alt={
                "Pantalla de " +
                current.label +
                " de GPOS con datos de demostración"
              }
              width="1440"
              height="960"
              loading="lazy"
              decoding="async"
            />
            <dl>
              {current.features.map(([title, copy]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{copy}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

// Lo que GPOS hace de verdad, en tarjetas de distinto tamaño.
const highlights = [
  {
    icon: WifiOff,
    tone: "blue",
    wide: true,
    title: "Sigue vendiendo sin internet.",
    copy: "Si se cae la conexión, el pedido se guarda en el equipo y llega a cocina apenas vuelve. Sin duplicados.",
  },
  {
    icon: ChefHat,
    tone: "orange",
    title: "Cocina en vivo.",
    copy: "Cada comanda aparece sola y avanza por estación, de nuevo a entregado.",
  },
  {
    icon: Package,
    tone: "green",
    title: "Inventario que avisa.",
    copy: "Descuenta recetas o unidades al cobrar y te alerta antes de que se agote.",
  },
  {
    icon: ShieldCheck,
    tone: "violet",
    title: "Tu cuenta, protegida.",
    copy: "Cada dispositivo nuevo se autoriza con un código que llega a tu correo.",
  },
  {
    icon: Smartphone,
    tone: "pink",
    title: "En cualquier pantalla.",
    copy: "Computador, tablet o celular, desde el navegador. Sin instalar nada.",
  },
] as const;

// Aparición suave al hacer scroll; con movimiento reducido todo se muestra de una vez.
function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll(".reveal");
    if (
      !("IntersectionObserver" in window) ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export function Landing({ Brand }: { Brand: ComponentType }) {
  useReveal();
  const offer = useQuery<{ data: PublicPlan[]; trialDays?: number }>({
    queryKey: ["public-plans"],
    queryFn: () => api("plans"),
    staleTime: 60_000,
  });
  const [mode, setMode] = useState<Mode>("restaurante");
  const days = offer.data?.trialDays;
  const trial = days ? `Probar ${days} días gratis` : "Empezar prueba gratis";
  return (
    <div className="landing">
      <header className="landing-header">
        <nav className="landing-shell landing-nav" aria-label="Principal">
          <Brand />
          <div className="landing-nav-links">
            <a href="#negocios">Negocios</a>
            <a href="#demo">Demo</a>
            <a href="#features">Funciones</a>
            <a href="#plans">Planes</a>
          </div>
          <Link className="button landing-login" to="/login">
            Iniciar sesión <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </header>
      <main id="landing-main">
        <div className="landing-hero-band">
          <div className="landing-aurora" aria-hidden="true" />
          <section
            className="landing-shell landing-hero landing-sales-hero"
            aria-labelledby="landing-title"
          >
            <div className="landing-intro">
              <a className="landing-eyebrow" href="#negocios">
                <Sparkles size={14} aria-hidden="true" />
                Nuevo: GPOS para tiendas
                <ArrowRight size={14} aria-hidden="true" />
              </a>
              <h1 id="landing-title">
                Vende, cobra y controla tu stock <span>en un solo POS.</span>
              </h1>
              <p>
                Para restaurantes, cafeterías y tiendas de productos o
                servicios. GPOS se adapta a cómo vendes: mesas y cocina, o
                mostrador e inventario por producto.
              </p>
              <div className="hero-actions">
                <Link className="button primary large" to="/register">
                  {trial}
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a className="button large" href="#demo">
                  Probar la demo <ArrowDown size={17} aria-hidden="true" />
                </a>
              </div>
              <p className="landing-audience">
                <Monitor size={17} aria-hidden="true" /> Desde el navegador ·
                Sin tarjeta para empezar
              </p>
            </div>
            <figure className="landing-product">
              <img
                className="landing-product-pos"
                src={showcase + "pos.webp"}
                alt="GPOS en una pantalla de escritorio con catálogo de platos y ticket de venta"
                width="1440"
                height="960"
                fetchPriority="high"
              />
              <img
                className="landing-product-phone"
                src={showcase + "movil.webp"}
                alt="Punto de venta de GPOS en celular"
                width="390"
                height="770"
                decoding="async"
              />
              <figcaption>GPOS con datos de demostración</figcaption>
            </figure>
          </section>
        </div>
        <section
          className="landing-shell landing-highlights"
          aria-labelledby="highlights-title"
        >
          <div className="landing-section-heading reveal">
            <h2 id="highlights-title">Hecho para la hora pico.</h2>
            <p>
              Menos clics en caja, menos errores en cocina y el negocio en orden
              aunque falle el internet.
            </p>
          </div>
          <div className="landing-bento">
            {highlights.map(({ icon: Icon, tone, title, copy, ...rest }) => (
              <article
                key={title}
                className={`landing-bento-card reveal tone-${tone}${"wide" in rest ? " wide" : ""}`}
              >
                <span className="landing-bento-icon">
                  <Icon size={24} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{copy}</p>
                {tone === "blue" && (
                  <div className="landing-offline-visual" aria-hidden="true">
                    <span className="landing-offline-chip pending">
                      <WifiOff size={15} /> Pedido #128 · guardado en el equipo
                    </span>
                    <span className="landing-offline-chip sent">
                      <Check size={15} /> Pedido #128 · llegó a cocina
                    </span>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
        <section
          id="negocios"
          className="landing-shell landing-modes"
          aria-labelledby="modes-title"
        >
          <div className="landing-section-heading reveal">
            <h2 id="modes-title">Un sistema. Dos formas de vender.</h2>
            <p>
              Activamos la versión que encaja con tu negocio. Cambia el menú, el
              punto de venta y el inventario; tus datos y tu caja siguen igual.
            </p>
          </div>
          <div className="landing-mode-cards reveal">
            {(
              [
                [
                  "restaurante",
                  "Para restaurantes y cafeterías",
                  "Del pedido en la mesa a la comanda en cocina.",
                  [
                    "Mesas, rondas y cuentas divididas",
                    "Tablero de cocina por estación",
                    "Recetas que descuentan ingredientes",
                    "Domicilios y pedidos para recoger",
                  ],
                ],
                [
                  "tienda",
                  "Para tiendas de productos o servicios",
                  "Del escáner al cobro, sin pasar por cocina.",
                  [
                    "Venta en mostrador con cobro inmediato",
                    "Inventario por producto y alertas de stock",
                    "Servicios que no descuentan inventario",
                    "Domicilios con despachos y mesas opcionales",
                  ],
                ],
              ] as const
            ).map(([key, title, copy, points]) => {
              const Icon = modes[key].icon;
              return (
                <article key={key} className="landing-mode-card">
                  <span className="landing-mode-icon">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  <ul className="landing-plan-features">
                    {points.map((point) => (
                      <li key={point}>
                        <Check size={14} aria-hidden="true" /> {point}
                      </li>
                    ))}
                  </ul>
                  <a
                    className="landing-text-link landing-mode-link"
                    href="#demo"
                    onClick={() => setMode(key)}
                  >
                    Ver la demo de {modes[key].label.toLowerCase()}
                    <ArrowRight size={16} aria-hidden="true" />
                  </a>
                </article>
              );
            })}
          </div>
        </section>
        <section
          className="landing-shell landing-demo-band"
          aria-labelledby="demo-title"
        >
          <div className="landing-demo-intro">
            <h2 id="demo-title">Haz una venta de principio a fin.</h2>
            <div
              className="landing-segmented"
              role="group"
              aria-label="Tipo de negocio de la demo"
            >
              {(Object.keys(modes) as Mode[]).map((key) => {
                const Icon = modes[key].icon;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={mode === key}
                    onClick={() => setMode(key)}
                  >
                    <Icon size={17} aria-hidden="true" />
                    {modes[key].label}
                  </button>
                );
              })}
            </div>
            <p>
              {mode === "tienda"
                ? "Cobra en mostrador y mira cómo se actualizan la caja y las existencias."
                : "Envía el pedido a cocina, cobra la mesa y mira qué queda registrado en caja e inventario."}
            </p>
            <ol>
              {(mode === "tienda"
                ? [
                    [Tag, "Escanea productos y agrega servicios"],
                    [Wallet, "Cobra en el momento, sin cocina"],
                    [Truck, "Despacha domicilios cuando los tengas"],
                  ]
                : [
                    [ReceiptText, "Toma el pedido en la mesa"],
                    [ChefHat, "Sigue la comanda en cocina"],
                    [Wallet, "Registra el cobro y el consumo de la receta"],
                  ]
              ).map(([Icon, text]: any) => (
                <li key={text}>
                  <Icon size={19} aria-hidden="true" /> {text}
                </li>
              ))}
            </ol>
          </div>
          <OrderDemo key={mode} trial={trial} mode={mode} />
        </section>
        <FeatureExplorer />
        <section
          id="plans"
          className="landing-plans"
          aria-labelledby="plans-title"
        >
          <div className="landing-shell">
            <div className="landing-section-heading">
              <h2 id="plans-title">Planes para tu negocio.</h2>
              <p>
                Compara qué incluye cada plan. Para contratar, escríbenos y
                confirma el precio y las condiciones de activación.
              </p>
            </div>
            {offer.data?.data.length ? (
              <div className="landing-plan-list">
                {offer.data.data.map((plan) => (
                  <article key={plan.id}>
                    <h3>{plan.name}</h3>
                    <p className="landing-plan-price">
                      {plan.price > 0 ? (
                        <>
                          <strong>{money(plan.price)}</strong> COP / mes
                        </>
                      ) : (
                        <strong>Precio a consultar</strong>
                      )}
                    </p>
                    <p>
                      {Object.entries(limitLabels)
                        .flatMap(([key, names]) => {
                          const limit = plan.limits[key];
                          return limit === undefined
                            ? []
                            : [
                                limit === 0
                                  ? `Sin límite de ${names[1]}`
                                  : `${limit.toLocaleString("es-CO")} ${names[limit === 1 ? 0 : 1]}`,
                              ];
                        })
                        .join(" · ")}
                    </p>
                    <ul className="landing-plan-features">
                      {plan.features.map((feature) => (
                        <li key={feature}>
                          <Check size={14} aria-hidden="true" />{" "}
                          {featureLabels[feature] ?? feature}
                        </li>
                      ))}
                    </ul>
                    <a
                      className="button"
                      href={salesLink("Cotización GPOS — " + plan.name)}
                    >
                      Solicitar cotización{" "}
                      <ArrowRight size={16} aria-hidden="true" />
                    </a>
                  </article>
                ))}
              </div>
            ) : (
              <p role={offer.isError ? "status" : undefined}>
                {offer.isPending ? (
                  "Cargando planes…"
                ) : (
                  <>
                    Consulta los planes disponibles por{" "}
                    <a
                      className="landing-text-link"
                      href={salesLink("Planes de GPOS")}
                    >
                      correo comercial
                    </a>
                    .
                  </>
                )}
              </p>
            )}
          </div>
        </section>
        <section
          className="landing-shell landing-faq"
          aria-labelledby="faq-title"
        >
          <h2 id="faq-title">Antes de empezar.</h2>
          <div>
            <details>
              <summary>
                ¿Qué pasa al terminar mi prueba?
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>
                {days ? `Tu prueba dura ${days} días. ` : ""}El acceso depende
                de que tu suscripción esté vigente. Puedes escribirnos para
                activar un plan. El registro no pide tarjeta.
              </p>
            </details>
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section
          className="landing-shell landing-close"
          aria-labelledby="landing-close-title"
        >
          <div>
            <h2 id="landing-close-title">
              Configura tu negocio y haz la primera venta.
            </h2>
            <p>Crea tu cuenta, agrega tu menú o catálogo y prueba una venta.</p>
          </div>
          <div className="hero-actions">
            <Link className="button primary large" to="/register">
              {trial}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a
              className="button large"
              href={salesLink("Asesoría comercial GPOS")}
            >
              <Mail size={17} aria-hidden="true" /> Hablar con ventas
            </a>
          </div>
        </section>
      </main>
      <footer className="landing-shell landing-footer">
        <Brand />
        <a href={salesLink("Información de GPOS")}>{salesEmail}</a>
        <Link to="/legal">Información legal</Link>
        <Link to="/login">
          Iniciar sesión <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
