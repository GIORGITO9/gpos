import { useState, type ComponentType } from "react";
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
  ShoppingBag,
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
    title: "Sabe cuánto puedes vender antes de quedarte sin ingredientes.",
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

const plans = [
  [
    "Starter",
    "Para empezar con un local.",
    "1 sucursal · 5 usuarios",
    "POS, mesas, cocina y reportes",
  ],
  [
    "Professional",
    "Para gestionar insumos y compras.",
    "3 sucursales · 20 usuarios",
    "También incluye inventario, compras y recetas",
  ],
  [
    "Business",
    "Para administrar varias sucursales.",
    "Límites configurables",
    "Operación multisucursal y funciones del plan Professional",
  ],
] as const;

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

function OrderDemo() {
  const [step, setStep] = useState(0);
  const completed = step === journey.length;
  const current = journey[Math.min(step, journey.length - 1)];
  const StageIcon = current.icon;

  return (
    <section className="landing-demo" aria-label="Demo interactiva de GPOS">
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
        <button
          type="button"
          className="button primary landing-demo-action"
          onClick={() => setStep(completed ? 0 : step + 1)}
        >
          {completed ? (
            <>
              Reiniciar demo <RotateCcw size={17} aria-hidden="true" />
            </>
          ) : (
            <>
              {current.action} <ArrowRight size={17} aria-hidden="true" />
            </>
          )}
        </button>
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
        <h2 id="features-title">Todo lo que puedes hacer con GPOS.</h2>
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
  return (
    <div className="landing">
      <nav className="landing-shell landing-nav" aria-label="Principal">
        <Brand />
        <div className="landing-nav-links">
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
            className="landing-shell landing-hero"
            aria-labelledby="landing-title"
          >
            <div className="landing-intro">
              <h1 id="landing-title">
                Tu restaurante, <span>todo en su lugar.</span>
              </h1>
              <p>
                Del primer pedido al cierre de caja. Maneja mesas, cocina,
                inventario y ventas desde un solo lugar.
              </p>
              <div className="hero-actions">
                <Link className="button primary large" to="/register">
                  Empezar mi prueba <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a className="button large" href="#features">
                  Explorar funciones <ArrowDown size={17} aria-hidden="true" />
                </a>
              </div>
              <p className="landing-audience">
                <ShoppingBag size={17} aria-hidden="true" /> Para restaurantes,
                cafeterías y negocios de comidas.
              </p>
            </div>
            <OrderDemo />
          </section>
        </div>
        <FeatureExplorer />
        <section
          id="plans"
          className="landing-plans"
          aria-labelledby="plans-title"
        >
          <div className="landing-shell">
            <div className="landing-section-heading">
              <h2 id="plans-title">Un plan para cada etapa.</h2>
              <p>
                Elige según el tamaño de tu equipo y las funciones que necesita
                tu negocio.
              </p>
            </div>
            <div className="landing-plan-list">
              {plans.map(([name, text, limit, included]) => (
                <article key={name}>
                  <h3>{name}</h3>
                  <p>{text}</p>
                  <strong>{limit}</strong>
                  <span>{included}</span>
                  <Link className="button" to="/register">
                    Crear mi cuenta <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
            <small>
              Las tarifas comerciales se configuran por el administrador de la
              plataforma.
            </small>
          </div>
        </section>
        <section
          className="landing-shell landing-faq"
          aria-labelledby="faq-title"
        >
          <h2 id="faq-title">Antes de empezar.</h2>
          <div>
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
      </main>
      <footer className="landing-shell landing-footer">
        <Brand />
        <Link to="/login">
          Iniciar sesión <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
