import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import {
  X,
  Plus,
  LoaderCircle,
  Search,
  ArrowUpRight,
  MoveHorizontal,
  AlertCircle,
  CheckCircle2,
  Inbox,
} from "lucide-react";
import { labels } from "./api";
const ToastContext = createContext({
  show: (_message: string, _error?: boolean) => {},
  dismissSuccess: () => {},
});
export const useToast = () => useContext(ToastContext).show;
export function ToastProvider({ children }: any) {
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((message: string, error = false) => {
    clearTimeout(timer.current);
    setToast({ message, error });
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  const notifications = useMemo(
    () => ({
      show,
      dismissSuccess: () =>
        setToast((current) => (current?.error ? current : null)),
    }),
    [show],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={notifications}>
      {children}
      {toast && (
        <div
          className={"toast " + (toast.error ? "error" : "")}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label="Cerrar notificación"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export function Button({
  children,
  variant = "",
  className = "",
  ...props
}: any) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function PageTitle({ title, subtitle, action }: any) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
export function Badge({ value }: any) {
  return <span className={"badge " + value}>{labels[value] || value}</span>;
}
export function Empty({
  title = "Todavía no hay registros",
  text = "Los nuevos registros aparecerán aquí.",
  action,
}: any) {
  return (
    <div className="empty">
      <Inbox size={32} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} aria-hidden="true" />
      <span>Cargando tu negocio…</span>
    </div>
  );
}
export function ErrorBox({ error, retry }: any) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={22} />
      <div>
        <strong>No pudimos cargar la información</strong>
        <p>{error?.message || String(error)}</p>
      </div>
      {retry && <Button onClick={retry}>Reintentar</Button>}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar…",
  id,
}: any) {
  return (
    <label className="search">
      <Search size={18} />
      <input
        id={id}
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <kbd>⌘ K</kbd>
    </label>
  );
}
export function TableScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    const measure = () =>
      setOverflow(viewport.scrollWidth > viewport.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (viewport.firstElementChild)
      observer.observe(viewport.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <div className="table-frame">
      {overflow && (
        <p className="table-hint">
          <MoveHorizontal size={15} /> Desplaza la tabla para ver más columnas
        </p>
      )}
      <div
        className="table-scroll"
        ref={ref}
        tabIndex={overflow ? 0 : undefined}
        role={overflow ? "region" : undefined}
        aria-label={
          overflow ? "Tabla con desplazamiento horizontal" : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  printReceipt = false,
}: any) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef(onClose);
  const { dismissSuccess } = useContext(ToastContext);
  useEffect(() => {
    dismissSuccess();
  }, [dismissSuccess]);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const last = document.activeElement as HTMLElement;
    const dialog = ref.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button, input, select, textarea, a[href], summary, [tabindex]",
        ) ?? [],
      ).filter(
        (node) =>
          node.tabIndex >= 0 &&
          !node.matches(":disabled") &&
          node.closest('[role="dialog"]') === dialog &&
          node.getClientRects().length > 0,
      );
    (focusable()[0] ?? dialog)?.focus();
    function key(e: KeyboardEvent) {
      if (
        Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) !==
        ref.current
      )
        return;
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = focusable();
        if (!nodes.length) {
          e.preventDefault();
          dialog?.focus();
        } else if (!nodes.includes(document.activeElement as HTMLElement)) {
          e.preventDefault();
          (e.shiftKey ? nodes.at(-1) : nodes[0])?.focus();
        } else if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      last?.focus();
    };
  }, []);
  return (
    <div
      className={printReceipt ? "scrim print-receipt" : "scrim"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descriptionId : undefined}
        tabIndex={-1}
        className={"modal " + (wide ? "wide" : "")}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p id={descriptionId}>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Field({ label, children, ...props }: any) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function Metric({ label, value, detail, icon: Icon }: any) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        {Icon && <Icon size={18} />}
      </div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}
export { Plus, ArrowUpRight };
