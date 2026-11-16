import { useState, type ComponentType } from "react";
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
  Store,
  Wallet,
} from "lucide-react";
import "./landing.css";

const journey = [
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
] as const;

const modules = [
  {
    id: "salon",
    label: "Ventas y mesas",
    icon: Armchair,
    title: "Atiende cada pedido desde el mismo POS.",
    copy: "Abre una cuenta en el salón, toma un domicilio o cobra una venta para llevar.",
    features: [
      [
        "Salón",
        "Agrega rondas, traslada cuentas, une mesas o mueve productos junto con sus abonos.",
      ],
      [
        "Venta directa",
        "Cobra pedidos para llevar desde el ticket. Registra pedidos de domicilio o para recoger.",
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
    label: "Cocina",
    icon: ChefHat,
    title: "Cada ronda llega a cocina con sus detalles.",
    copy: "El equipo ve los platos, las cantidades y las notas antes de empezar.",
    features: [
      ["Comandas", "Envía pedidos y rondas nuevas al tablero de cocina."],
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
    title: "Descubre cuánto puedes vender antes de quedarte sin ingredientes.",
    copy: "Define las cantidades de cada receta y GPOS descuenta los ingredientes al cobrar.",
    features: [
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
        "Carga catálogos de productos, clientes e ingredientes desde CSV o Excel.",
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

function OrderDemo({ trial }: { trial: string }) {
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
          <Store size={19} aria-hidden="true" /> Del pedido al cobro
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
            <div>
              <dt>
                <span>1×</span> Hamburguesa de la casa
              </dt>
              <dd>$18.000</dd>
            </div>
            <div>
              <dt>
                <span>1×</span> Limonada natural
              </dt>
              <dd>$7.000</dd>
            </div>
          </dl>
          <div className="landing-ticket-total">
            <span>{completed ? "Registrado en caja" : "Total del pedido"}</span>
            <strong>$25.000</strong>
          </div>
        </div>
        <p className="landing-ticket-explanation" role="status">
          {completed
            ? "La mesa queda libre y la venta se registra en caja."
            : current.detail}
        </p>
        {completed && (
          <div className="landing-recipe-result">
            <Package size={18} aria-hidden="true" />
            <div>
              <strong>Receta descontada</strong>
              <small>−1 pan · −150 g de carne en este ejemplo</small>
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
          Explora las funciones que conectan tu salón, tu cocina y la
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

export function Landing({ Brand }: { Brand: ComponentType }) {
  const offer = useQuery<{ data: PublicPlan[]; trialDays?: number }>({
    queryKey: ["public-plans"],
    queryFn: () => api("plans"),
    staleTime: 60_000,
  });
  const days = offer.data?.trialDays;
  const trial = days ? `Probar ${days} días gratis` : "Empezar prueba gratis";
  return (
    <div className="landing">
      <nav className="landing-shell landing-nav" aria-label="Principal">
        <Brand />
        <div className="landing-nav-links">
          <a href="#demo">Demo</a>
          <a href="#features">Funciones</a>
          <a href="#plans">Planes</a>
        </div>
        <Link className="button landing-login" to="/login">
          Iniciar sesión <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </nav>
      <main id="landing-main">
        <div className="landing-hero-band">
          <section
            className="landing-shell landing-hero landing-sales-hero"
            aria-labelledby="landing-title"
          >
            <div className="landing-intro">
              <h1 id="landing-title">
                Toma pedidos, envíalos a cocina <span>y cobra en GPOS.</span>
              </h1>
              <p>
                El punto de venta para restaurantes, cafeterías y negocios de
                comidas. Controla mesas, recetas y caja en el mismo sistema.
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
          className="landing-shell landing-demo-band"
          aria-labelledby="demo-title"
        >
          <div className="landing-demo-intro">
            <h2 id="demo-title">Haz una venta de principio a fin.</h2>
            <p>
              Envía el pedido a cocina, cobra la mesa y mira qué queda
              registrado en caja e inventario.
            </p>
            <ol>
              <li>
                <ReceiptText size={19} aria-hidden="true" /> Toma el pedido en
                la mesa
              </li>
              <li>
                <ChefHat size={19} aria-hidden="true" /> Sigue la comanda en
                cocina
              </li>
              <li>
                <Wallet size={19} aria-hidden="true" /> Registra el cobro y el
                consumo de la receta
              </li>
            </ol>
          </div>
          <OrderDemo trial={trial} />
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
              Configura tu negocio y toma el primer pedido.
            </h2>
            <p>Crea tu cuenta, agrega tu menú y prueba una venta.</p>
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
        <Link to="/login">
          Iniciar sesión <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
