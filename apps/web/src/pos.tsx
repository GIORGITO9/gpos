import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UtensilsCrossed,
  Truck,
  ShoppingBag,
  Package,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  Armchair,
  Users,
  Combine,
  ChefHat,
  Coffee,
  Pizza,
  IceCreamBowl,
  Beef,
  Check,
  Printer,
  CreditCard,
  Wallet,
  X,
  ScanBarcode,
  Star,
  ReceiptText,
  ArrowLeft,
  LayoutGrid,
} from "lucide-react";
import { orderRounds, preparationAction } from "./order-rounds";
import { api, get, useSession, money, date, labels, can } from "./api";
import {
  Button,
  PageTitle,
  Field,
  Modal,
  Empty,
  Loading,
  ErrorBox,
  useToast,
  Badge,
} from "./ui";
function newOperationKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Local network access over HTTP still supports cryptographic random values.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export const serviceIcons: any = {
  MESA: UtensilsCrossed,
  DOMICILIO: Truck,
  RECOGER: ShoppingBag,
  PARA_LLEVAR: Package,
};
export function ProductIcon({ name, size = 36 }: any) {
  const Icon = /pizza/i.test(name)
    ? Pizza
    : /café|limonada|té|bebida/i.test(name)
      ? Coffee
      : /brownie|cheesecake|postre/i.test(name)
        ? IceCreamBowl
        : /burger|hamburguesa/i.test(name)
          ? Beef
          : UtensilsCrossed;
  return <Icon size={size} strokeWidth={1.3} />;
}
type ReceiptPreferences = {
  width: 58 | 80;
  automatic: boolean;
  printer: string;
};
type ReceiptPrinter = {
  (action: "list"): Promise<string[]>;
  (action: "print", printer: string): Promise<void>;
};
const directReceiptPrinter = () =>
  (window as Window & { gposReceiptPrinter?: ReceiptPrinter })
    .gposReceiptPrinter;
const receiptPreferencesKey = "gpos.receipt-print";

function readReceiptPreferences(): ReceiptPreferences {
  try {
    const saved = JSON.parse(
      localStorage.getItem(receiptPreferencesKey) ?? "null",
    );
    return {
      width: saved?.width === 58 ? 58 : 80,
      automatic: saved?.automatic === true,
      printer: typeof saved?.printer === "string" ? saved.printer : "",
    };
  } catch {
    return { width: 80, automatic: false, printer: "" };
  }
}

function saveReceiptPreferences(changes: Partial<ReceiptPreferences>) {
  localStorage.setItem(
    receiptPreferencesKey,
    JSON.stringify({ ...readReceiptPreferences(), ...changes }),
  );
}

function RollWidth({
  value,
  onChange,
}: {
  value: 58 | 80;
  onChange: (value: 58 | 80) => void;
}) {
  return (
    <Field label="Ancho del rollo">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value === "58" ? 58 : 80)}
      >
        <option value="58">58 mm</option>
        <option value="80">80 mm</option>
      </select>
    </Field>
  );
}

function ReceiptPrintSettings({ close }: { close: () => void }) {
  const [preferences, setPreferences] = useState(readReceiptPreferences);
  const [error, setError] = useState("");
  const [printers, setPrinters] = useState<string[] | null>(null);
  const directPrint = directReceiptPrinter();
  useEffect(() => {
    if (!directPrint) return;
    let active = true;
    directPrint("list").then(
      (names) => {
        if (active) setPrinters(names);
      },
      () => {
        if (!active) return;
        setPrinters([]);
        setError("No se pudo consultar la lista de impresoras del Mac.");
      },
    );
    return () => {
      active = false;
    };
  }, [directPrint]);
  return (
    <Modal
      title="Impresión del comprobante"
      subtitle="Preferencias de este navegador."
      onClose={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            saveReceiptPreferences(preferences);
            close();
          } catch {
            setError("El navegador no pudo guardar las preferencias.");
          }
        }}
      >
        {directPrint && (
          <Field label="Impresora térmica">
            <select
              value={preferences.printer}
              disabled={!printers?.length}
              onChange={(event) =>
                setPreferences({ ...preferences, printer: event.target.value })
              }
            >
              <option value="">
                {printers === null
                  ? "Buscando impresoras…"
                  : printers.length
                    ? "Elige una impresora"
                    : "Sin impresoras disponibles"}
              </option>
              {preferences.printer &&
                !printers?.includes(preferences.printer) && (
                  <option value={preferences.printer} disabled>
                    {preferences.printer} (no disponible)
                  </option>
                )}
              {printers?.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <RollWidth
          value={preferences.width}
          onChange={(width) => setPreferences({ ...preferences, width })}
        />
        <label className="receipt-auto-setting">
          <input
            type="checkbox"
            checked={preferences.automatic}
            onChange={(event) =>
              setPreferences({
                ...preferences,
                automatic: event.target.checked,
              })
            }
          />
          Imprimir automáticamente al confirmar el cobro
        </label>
        <p className="muted">
          {directPrint
            ? "Al cerrar la venta, el comprobante se enviará a la impresora elegida."
            : "Al cerrar la venta se abrirá el diálogo de impresión."}
        </p>
        {error && <p role="alert">{error}</p>}
        <Button variant="primary">Guardar preferencias</Button>
      </form>
    </Modal>
  );
}

export default function POS() {
  const [params] = useSearchParams();
  const branch = useSession((s) => s.branchId);
  return (
    <OrderComposer
      key={branch + ":" + params.toString()}
      orderId={params.get("order")}
      initialTable={params.get("table") || ""}
    />
  );
}

function productStockMessage(product: { missingIngredients?: string[] }) {
  const missing = product.missingIngredients;
  return missing?.length
    ? `${missing.length === 1 ? "Falta" : "Faltan"}: ${missing.join(", ")}`
    : "";
}

function productStockStatus(product: {
  availableUnits?: number | null;
  lowStockThreshold?: number;
}) {
  const units = product.availableUnits;
  if (units === 0) return "sold-out";
  if (
    typeof units === "number" &&
    units > 0 &&
    units <= (product.lowStockThreshold ?? 3)
  )
    return "low";
  return "";
}

function OrderComposer({
  orderId,
  initialTable,
}: {
  orderId: string | null;
  initialTable: string;
}) {
  const s = useSession(),
    qc = useQueryClient(),
    toast = useToast();
  const orderPanel = useRef<HTMLElement>(null);
  const [showTicket, setShowTicket] = useState(false);
  const [printSettings, setPrintSettings] = useState(false);
  const [printAfterCheckout, setPrintAfterCheckout] = useState<string>();
  const [lastOrderId, setLastOrderId] = useState<string>();
  const [checkout, setCheckout] = useState<any>(null);
  const takeawayAttempt = useRef<{ draft: string; key: string } | null>(null);
  const productSearch = useRef<HTMLInputElement>(null);
  const favoriteKey = "gpos.pos.favorites:" + s.user.id;
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(favoriteKey) ?? "[]");
      return Array.isArray(saved)
        ? saved.filter((id) => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
  function toggleFavorite(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((value) => value !== id)
      : [...favorites, id];
    setFavorites(next);
    try {
      localStorage.setItem(favoriteKey, JSON.stringify(next));
    } catch {}
  }
  const [service, setService] = useState(
    initialTable || orderId ? "MESA" : "PARA_LLEVAR",
  );
  const [tableId, setTable] = useState(initialTable);
  const pendingRound = useRef<{ items: string; key: string } | null>(null);
  const [customerId, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [source, setSource] = useState("POS");
  const [notes, setNotes] = useState("");
  const [deliveryFee, setFee] = useState(0),
    [tip, setTip] = useState(0);
  const [cart, setCart] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("");
  const [configure, setConfigure] = useState<any>(null),
    [pending, setPending] = useState(false),
    [saved, setSaved] = useState<any>(null);
  const checkingStock = useRef(false);
  const [stockFilter, setStockFilter] = useState("");
  const [restock, setRestock] = useState<{
    recipe: RestockIngredient[];
    targetUnits: number;
  } | null>(null);
  const products = useQuery({
    queryKey: ["products", s.branchId, "pos", search, Boolean(stockFilter)],
    queryFn: async () => {
      const url =
        "products?availability=true&limit=100&search=" +
        encodeURIComponent(search);
      if (!stockFilter) return get(url);
      const first = await api(url);
      const remaining = await Promise.all(
        Array.from(
          { length: Math.ceil(first.meta.total / 100) - 1 },
          (_, index) => get(url + "&page=" + (index + 2)),
        ),
      );
      return first.data.concat(...remaining);
    },
    refetchInterval: 3000,
  });
  const visibleProducts = useMemo(() => {
    const favoriteIds = new Set(favorites);
    const pinned: any[] = [];
    const regular: any[] = [];
    for (const product of products.data ?? []) {
      if (!product.active || (category && product.categoryId !== category))
        continue;
      const status = productStockStatus(product);
      if (
        stockFilter &&
        (!status || (stockFilter !== "alerts" && stockFilter !== status))
      )
        continue;
      (favoriteIds.has(product.id) ? pinned : regular).push(product);
    }
    return pinned.concat(regular);
  }, [products.data, category, favorites, stockFilter]);
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => get("categories?limit=100"),
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => get("customers?limit=100"),
  });
  const savedAddresses =
    customers.data?.find((customer: any) => customer.id === customerId)
      ?.addresses || [];
  const tables = useQuery({
    queryKey: ["tables", s.branchId],
    queryFn: () => get("tables?limit=100"),
  });
  const openOrder = useQuery({
    queryKey: ["order", s.branchId, orderId],
    queryFn: () => get("orders/" + orderId),
    enabled: !!orderId,
    refetchInterval: orderId ? 4000 : false,
  });
  const lastOrder = useQuery({
    queryKey: ["order", s.branchId, lastOrderId],
    queryFn: () => get("orders/" + lastOrderId),
    enabled: !orderId && !!lastOrderId,
    refetchInterval: (query) =>
      ["CERRADO", "CANCELADO"].includes(query.state.data?.status)
        ? false
        : 4000,
  });
  const account = openOrder.data;
  const itemCount = cart.reduce((count, item) => count + item.quantity, 0);
  const subtotal = cart.reduce((a, i) => a + i.unitPrice * i.quantity, 0),
    tax = Math.round((subtotal * s.user.tenant.taxRate) / 10000),
    total = subtotal + tax + tip + (service === "DOMICILIO" ? deliveryFee : 0);
  const currentOrder = orderId ? account : lastOrder.data;
  const balance = currentOrder
    ? currentOrder.total - orderPaid(currentOrder)
    : 0;
  const awaitingPayment =
    !!currentOrder &&
    balance > 0 &&
    !["CERRADO", "CANCELADO"].includes(currentOrder.status);
  const canCharge = can(s.user, "ventas.crear");
  const readyToCharge =
    awaitingPayment &&
    currentOrder.status === "ENTREGADO" &&
    !itemCount &&
    !pending;
  async function updateCartWithStock(next: typeof cart, trackStock: boolean) {
    if (pending || checkingStock.current) return false;
    if (!trackStock) {
      setCart(next);
      return true;
    }
    checkingStock.current = true;
    setPending(true);
    try {
      await api("orders/check-stock", {
        orderId: orderId || undefined,
        items: next.map(({ productId, quantity }) => ({ productId, quantity })),
      });
      setCart(next);
      return true;
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "No se pudo comprobar el inventario",
        true,
      );
      return false;
    } finally {
      checkingStock.current = false;
      setPending(false);
    }
  }
  async function add(
    p: any,
    variantId = "",
    modifierIds: string[] = [],
    itemNotes = "",
  ) {
    const variant = p.variants?.find((v: any) => v.id === variantId);
    const mods =
      p.modifiers
        ?.filter((m: any) => modifierIds.includes(m.modifierId))
        .map((m: any) => m.modifier) || [];
    const unitPrice =
      (variant?.price ??
        p.prices?.find((v: any) => v.service === service)?.price ??
        p.price) + mods.reduce((a: number, m: any) => a + m.price, 0);
    const added = await updateCartWithStock(
      [
        ...cart,
        {
          key: newOperationKey(),
          productId: p.id,
          trackStock: p.trackStock,
          name: p.name,
          variantId,
          modifierIds,
          notes: itemNotes,
          quantity: 1,
          unitPrice,
          detail: [variant?.name, ...mods.map((m: any) => m.name)]
            .filter(Boolean)
            .join(" · "),
        },
      ],
      p.trackStock,
    );
    if (added) setConfigure(null);
  }
  const directTakeaway = !orderId && service === "PARA_LLEVAR" && canCharge;
  function ticketItems() {
    return cart.map(
      ({ productId, quantity, variantId, modifierIds, notes }) => ({
        productId,
        quantity,
        ...(variantId ? { variantId } : {}),
        modifierIds,
        notes,
      }),
    );
  }
  function openCheckout() {
    if (pending || checkingStock.current) return;
    if (directTakeaway && itemCount) {
      const draft = {
        source,
        notes,
        tip,
        ...(customerId ? { customerId } : {}),
        items: ticketItems(),
      };
      const serialized = JSON.stringify({
        draft,
        total,
        cart: cart.map((line) => line.key),
      });
      if (takeawayAttempt.current?.draft !== serialized)
        takeawayAttempt.current = {
          draft: serialized,
          key: newOperationKey(),
        };
      setCheckout({
        total,
        draft,
        idempotencyKey: takeawayAttempt.current.key,
      });
    } else {
      setCheckout(currentOrder);
    }
  }
  async function save() {
    if (!cart.length || pending || checkingStock.current) return;
    setPending(true);
    try {
      const items = ticketItems();
      let j;
      if (orderId) {
        const payload = JSON.stringify(items);
        if (pendingRound.current?.items !== payload)
          pendingRound.current = { items: payload, key: newOperationKey() };
        j = await api("orders/" + orderId + "/rounds", {
          items,
          requestKey: pendingRound.current.key,
        });
        pendingRound.current = null;
        qc.setQueryData(["order", s.branchId, orderId], j.data);
      } else {
        j = await api("orders", {
          service,
          source,
          ...(service === "MESA" ? { tableId } : {}),
          ...(customerId ? { customerId } : {}),
          address: address.trim(),
          ...(service === "RECOGER" && pickupTime
            ? { estimatedAt: new Date(pickupTime + "-05:00").toISOString() }
            : {}),
          notes,
          tip,
          deliveryFee: service === "DOMICILIO" ? deliveryFee : 0,
          items,
        });
      }
      qc.setQueryData(["order", s.branchId, j.data.id], j.data);
      setLastOrderId(j.data.id);
      setSaved(j.data);
      setCart([]);
      qc.invalidateQueries();
      toast(
        orderId
          ? "Ronda agregada a la cuenta y enviada a cocina"
          : `Pedido #${j.data.number} enviado a cocina`,
      );
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setPending(false);
    }
  }
  if (orderId && openOrder.isLoading) return <Loading />;
  if (
    orderId &&
    !saved &&
    !checkout &&
    (openOrder.error ||
      !account ||
      account.service !== "MESA" ||
      !account.table ||
      ["CERRADO", "CANCELADO"].includes(account.status))
  ) {
    return (
      <>
        <PageTitle
          title="Cuenta de mesa"
          action={
            <Link className="button" to="/app/tables">
              Volver a mesas
            </Link>
          }
        />
        {openOrder.error ? (
          <ErrorBox error={openOrder.error} retry={openOrder.refetch} />
        ) : (
          <Empty
            title="La cuenta ya no admite productos"
            text="Abre la mesa desde el salón para revisar su estado."
          />
        )}
      </>
    );
  }
  function selectProduct(product: any) {
    const shortage = productStockMessage(product);
    if (shortage) {
      toast(`${product.name} agotado. ${shortage}.`, true);
      return;
    }
    if (product.variants?.length || product.modifiers?.length)
      setConfigure(product);
    else add(product);
  }
  const currentTable = orderId
    ? account?.table
    : tables.data?.find((table: any) => table.id === tableId);
  return (
    <div className={"pos-workspace" + (showTicket ? " pos-ticket-open" : "")}>
      <header className="pos-workspace-header">
        <Link
          className="icon-button pos-back"
          to={currentTable ? "/app/tables" : "/app"}
          aria-label={
            currentTable ? "Volver a mesas" : "Salir del punto de venta"
          }
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div className="pos-workspace-title">
          <h1>
            {orderId && currentTable ? currentTable.name : "Punto de venta"}
          </h1>
          {currentTable && (
            <div className="pos-workspace-meta">
              <span>{currentTable.zone}</span>
              {orderId && (
                <>
                  <Badge value={currentTable.status} />
                  <span>Pedido #{account.number}</span>
                </>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className="icon-button pos-back"
          aria-label="Configurar impresión"
          title="Configurar impresión"
          onClick={() => setPrintSettings(true)}
        >
          <Printer size={20} aria-hidden="true" />
        </button>
        {!orderId && (
          <label className="field pos-service">
            <span>Servicio</span>
            <select
              value={service}
              disabled={!!itemCount || pending}
              onChange={(event) => setService(event.target.value)}
            >
              {Object.keys(serviceIcons).map((value) => (
                <option key={value} value={value}>
                  {labels[value]}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      <div className="pos-layout">
        <section className="catalog-panel">
          <form
            className="search pos-search"
            role="search"
            onSubmit={async (event) => {
              event.preventDefault();
              if (pending || !search.trim()) return;
              const code = search.trim().toLowerCase();
              try {
                const results = await products
                  .refetch({ throwOnError: true })
                  .then((result) => result.data ?? []);
                if (productSearch.current?.value.trim().toLowerCase() !== code)
                  return;
                const matches = results.filter(
                  (product: any) =>
                    product.active &&
                    [product.barcode, product.sku].some(
                      (value) => value?.trim().toLowerCase() === code,
                    ),
                );
                if (matches.length === 1) {
                  selectProduct(matches[0]);
                  setSearch("");
                }
              } catch (error: any) {
                toast(error.message, true);
              }
            }}
          >
            <ScanBarcode size={22} aria-hidden="true" />
            <input
              ref={productSearch}
              id="product-search"
              type="search"
              aria-label="Buscar producto, SKU o código de barras"
              placeholder="Buscar o escanear…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                className="icon-button"
                aria-label="Limpiar búsqueda"
                onClick={() => {
                  setSearch("");
                  productSearch.current?.focus();
                }}
              >
                <X size={16} />
              </button>
            )}
            <kbd>F2</kbd>
          </form>
          <div className="tabs category-tabs">
            <button
              className={!category ? "active" : ""}
              aria-pressed={!category}
              onClick={() => setCategory("")}
            >
              <LayoutGrid size={15} /> Todo el menú
            </button>
            {categories.data?.map((c: any) => (
              <button
                key={c.id}
                className={category === c.id ? "active" : ""}
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <label className="field pos-stock-filter">
            <span>Disponibilidad</span>
            <select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="alerts">Pocas unidades o agotados</option>
              <option value="low">Pocas unidades</option>
              <option value="sold-out">Agotados</option>
            </select>
          </label>
          {products.isLoading ? (
            <Loading />
          ) : products.error ? (
            <ErrorBox error={products.error} retry={products.refetch} />
          ) : visibleProducts.length ? (
            <div className="product-grid">
              {visibleProducts.map((p: any) => {
                const shortage = productStockMessage(p);
                const lowStock = productStockStatus(p) === "low";
                const canRestock =
                  stockFilter &&
                  (shortage || lowStock) &&
                  can(s.user, "inventario.ajustar");
                const targetUnits =
                  stockFilter === "sold-out"
                    ? 1
                    : (p.lowStockThreshold ?? 3) + 1;
                const ingredients: RestockIngredient[] = canRestock
                  ? (p.recipe ?? []).map(
                      (line: {
                        ingredient: Pick<
                          RestockIngredient,
                          "id" | "name" | "unit"
                        >;
                        quantity: number;
                        branchStock: number;
                      }) => ({
                        ...line.ingredient,
                        perUnit: line.quantity,
                        branchStock: line.branchStock,
                        suggested:
                          line.quantity * targetUnits - line.branchStock,
                      }),
                    )
                  : [];
                return (
                  <div className="pos-product-card" key={p.id}>
                    <button
                      className="product"
                      disabled={pending || !!shortage}
                      onClick={() => selectProduct(p)}
                    >
                      <div
                        className={
                          "product-art tone-" +
                          (categories.data?.findIndex(
                            (c: any) => c.id === p.categoryId,
                          ) %
                            5)
                        }
                      >
                        <ProductArtwork product={p} />
                        {!shortage && (
                          <span className="product-add" aria-hidden="true">
                            <Plus size={17} />
                          </span>
                        )}
                      </div>
                      <strong>{p.name}</strong>
                      {shortage && (
                        <span className="pos-product-stock">
                          <strong>Agotado</strong> · 0 disponibles · {shortage}
                        </span>
                      )}
                      {!shortage && typeof p.availableUnits === "number" && (
                        <span
                          className={
                            lowStock
                              ? "pos-product-meta pos-product-low-stock"
                              : "pos-product-meta"
                          }
                        >
                          {lowStock && <strong>Pocas unidades · </strong>}
                          {p.availableUnits}{" "}
                          {p.availableUnits === 1
                            ? "disponible"
                            : "disponibles"}
                          {lowStock && p.limitingIngredients?.length > 0 && (
                            <>
                              {" "}
                              ·{" "}
                              {p.limitingIngredients.length === 1
                                ? "Limita"
                                : "Limitan"}
                              : {p.limitingIngredients.join(", ")}
                            </>
                          )}
                        </span>
                      )}
                      <b>
                        {money(
                          p.prices?.find((v: any) => v.service === service)
                            ?.price ?? p.price,
                        )}
                      </b>
                      {p.barcode || p.sku ? (
                        <span className="pos-product-meta pos-product-code">
                          <ScanBarcode size={14} aria-hidden="true" />{" "}
                          {p.barcode || p.sku}
                        </span>
                      ) : p.description ? (
                        <span className="pos-product-meta">
                          {p.description}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="icon-button pos-favorite"
                      aria-label={"Favorito: " + p.name}
                      aria-pressed={favorites.includes(p.id)}
                      onClick={() => toggleFavorite(p.id)}
                    >
                      <Star size={17} aria-hidden="true" />
                    </button>
                    {ingredients.some((item) => item.suggested > 0) && (
                      <Button
                        type="button"
                        className="pos-restock"
                        aria-label={`Reponer ingrediente de ${p.name}`}
                        onClick={() =>
                          setRestock({ recipe: ingredients, targetUnits })
                        }
                      >
                        Reponer ingrediente
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title={
                stockFilter
                  ? "No hay productos con ese estado de stock"
                  : "No hay productos en esta vista"
              }
              text={
                stockFilter
                  ? "Cambia la disponibilidad, la búsqueda o la categoría."
                  : "Prueba otra búsqueda o cambia la categoría."
              }
            />
          )}
        </section>
        <aside
          className="order-panel"
          ref={orderPanel}
          tabIndex={-1}
          aria-label="Pedido actual"
        >
          <div className="order-heading">
            <div>
              <h2>
                <ReceiptText size={19} aria-hidden="true" />{" "}
                {orderId || service === "MESA" ? "Comanda" : "Ticket"}
              </h2>
              <span>{orderId ? "Nueva ronda" : labels[service]}</span>
            </div>
            <span className="pos-item-count">
              {itemCount} {itemCount === 1 ? "unidad" : "unidades"}
            </span>
            <button
              className="icon-button"
              aria-label="Vaciar pedido"
              disabled={pending || !itemCount}
              onClick={() => setCart([])}
            >
              <Trash2 size={18} />
            </button>
          </div>
          <div className="pos-ticket-scroll">
            {orderId && (
              <div className="pos-account-summary">
                <div>
                  <span>Saldo de la mesa</span>
                  <strong>{money(account.total - orderPaid(account))}</strong>
                </div>
                <Button onClick={() => setSaved(account)}>Ver cuenta</Button>
              </div>
            )}
            {!orderId && (
              <div className="order-options">
                {service === "MESA" && (
                  <Field label="Mesa">
                    <select
                      required
                      value={tableId}
                      onChange={(e) => setTable(e.target.value)}
                    >
                      <option value="">Selecciona una mesa</option>
                      {tables.data
                        ?.filter((t: any) => t.status === "LIBRE")
                        .map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.name} · {t.zone}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <Field
                  label={
                    service === "DOMICILIO"
                      ? "Cliente (obligatorio)"
                      : "Cliente"
                  }
                >
                  <select
                    value={customerId}
                    onChange={(e) => {
                      setCustomer(e.target.value);
                      setAddress("");
                    }}
                  >
                    <option value="">Consumidor final</option>
                    {customers.data?.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {service === "RECOGER" && (
                  <Field
                    label="Hora estimada de recogida (Bogotá)"
                    type="datetime-local"
                    value={pickupTime}
                    onChange={(e: any) => setPickupTime(e.target.value)}
                  />
                )}
                {service === "DOMICILIO" && (
                  <>
                    {savedAddresses.length > 0 && (
                      <Field label="Direcciones guardadas">
                        <select
                          value={
                            savedAddresses.find(
                              (row: any) => row.address === address,
                            )?.id || ""
                          }
                          onChange={(e) =>
                            setAddress(
                              savedAddresses.find(
                                (row: any) => row.id === e.target.value,
                              )?.address || "",
                            )
                          }
                        >
                          <option value="">Escribir otra dirección</option>
                          {savedAddresses.map((row: any) => (
                            <option key={row.id} value={row.id}>
                              {row.label} · {row.address}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Field
                      label="Dirección de entrega"
                      value={address}
                      onChange={(e: any) => setAddress(e.target.value)}
                      required
                    />
                    <Field
                      label="Costo de domicilio"
                      type="number"
                      min="0"
                      value={deliveryFee}
                      onChange={(e: any) => setFee(Number(e.target.value))}
                    />
                  </>
                )}
              </div>
            )}
            <div className="cart-items">
              {!cart.length ? (
                <Empty
                  title="Tu pedido empieza aquí"
                  text="Toca un producto del menú para agregarlo."
                />
              ) : (
                cart.map((i) => (
                  <div className="cart-item" key={i.key}>
                    <div className="cart-item-info">
                      <strong>{i.name}</strong>
                      {i.detail && <small>{i.detail}</small>}
                      <span>{money(i.unitPrice)}</span>
                    </div>
                    <div
                      className="quantity"
                      role="group"
                      aria-label={"Cantidad de " + i.name}
                    >
                      <button
                        aria-label={"Quitar uno de " + i.name}
                        disabled={pending}
                        onClick={() =>
                          setCart((c) =>
                            c
                              .map((x) =>
                                x.key === i.key
                                  ? { ...x, quantity: x.quantity - 1 }
                                  : x,
                              )
                              .filter((x) => x.quantity > 0),
                          )
                        }
                      >
                        <Minus size={13} />
                      </button>
                      <span aria-live="polite">{i.quantity}</span>
                      <button
                        aria-label={"Agregar uno de " + i.name}
                        disabled={pending || i.quantity >= 999}
                        onClick={() =>
                          updateCartWithStock(
                            cart.map((x) =>
                              x.key === i.key
                                ? { ...x, quantity: x.quantity + 1 }
                                : x,
                            ),
                            i.trackStock,
                          )
                        }
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!orderId && (
              <details className="order-extras">
                <summary>Notas y opciones del pedido</summary>
                <Field label="Notas para cocina">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>
                <Field label="Origen">
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    {["POS", "TELEFONO", "WHATSAPP", "WEB"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <small>
                  Origen registrado manualmente; no envía mensajes externos.
                </small>
                <Field
                  label="Propina voluntaria"
                  type="number"
                  min="0"
                  value={tip}
                  onChange={(e: any) => setTip(Number(e.target.value))}
                />
              </details>
            )}
          </div>
          <div
            className={
              "pos-ticket-footer" +
              ((readyToCharge || directTakeaway) && canCharge
                ? " pos-payment-ready"
                : "")
            }
          >
            <button
              type="button"
              className="button pos-ticket-toggle"
              aria-expanded={showTicket}
              onClick={() => {
                setShowTicket(!showTicket);
                if (!showTicket)
                  requestAnimationFrame(() => orderPanel.current?.focus());
              }}
            >
              <ReceiptText size={17} aria-hidden="true" />
              {showTicket ? "Volver al catálogo" : `Ver pedido (${itemCount})`}
            </button>
            <div className="order-totals">
              {orderId ? (
                <div className="total">
                  <strong>Subtotal de la ronda</strong>
                  <strong>{money(subtotal)}</strong>
                </div>
              ) : (
                <>
                  <div>
                    <span>Subtotal</span>
                    <span>{money(subtotal)}</span>
                  </div>
                  <div>
                    <span>Impuestos</span>
                    <span>{money(tax)}</span>
                  </div>
                  {tip > 0 && (
                    <div>
                      <span>Propina</span>
                      <span>{money(tip)}</span>
                    </div>
                  )}
                  <div className="total">
                    <strong>Total</strong>
                    <strong>{money(total)}</strong>
                  </div>
                </>
              )}
              <Button
                variant="primary"
                className="pos-send"
                disabled={
                  !cart.length ||
                  pending ||
                  (!orderId && service === "MESA" && !tableId) ||
                  (service === "DOMICILIO" && (!address || !customerId))
                }
                onClick={save}
              >
                <ChefHat size={18} />
                {pending
                  ? "Enviando…"
                  : orderId
                    ? "Enviar ronda a cocina"
                    : "Enviar a cocina"}
                <ArrowRight size={17} />
              </Button>
              {awaitingPayment && !orderId && (
                <Button onClick={() => setSaved(currentOrder)}>
                  Ver pedido #{currentOrder.number}
                </Button>
              )}
              {canCharge && (
                <div className="pos-checkout">
                  <Button
                    className="pos-charge"
                    disabled={
                      !readyToCharge &&
                      !(directTakeaway && itemCount && total > 0 && !pending)
                    }
                    onClick={openCheckout}
                  >
                    <CreditCard size={19} aria-hidden="true" />
                    <span>Cobrar</span>
                    <strong>
                      {money(
                        directTakeaway && itemCount
                          ? total
                          : awaitingPayment
                            ? balance
                            : orderId
                              ? 0
                              : total,
                      )}
                    </strong>
                  </Button>
                  {awaitingPayment && !readyToCharge && !itemCount && (
                    <small>
                      {currentOrder.status === "ENTREGADO"
                        ? "Actualizando pedido…"
                        : "Disponible cuando el pedido esté entregado."}
                    </small>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
      {configure && (
        <ProductConfig
          product={configure}
          close={() => setConfigure(null)}
          add={add}
          pending={pending}
        />
      )}{" "}
      {checkout && (
        <Payment
          order={checkout}
          close={() => setCheckout(null)}
          submitPayment={
            checkout.draft
              ? (payload: any) =>
                  api("orders/takeaway-checkout", {
                    ...payload,
                    order: checkout.draft,
                    idempotencyKey: checkout.idempotencyKey,
                  })
              : undefined
          }
          onPaid={(paidOrder: any) => {
            if (checkout.draft) {
              takeawayAttempt.current = null;
              setCart([]);
              setNotes("");
              setTip(0);
              setLastOrderId(paidOrder.id);
            }
            qc.setQueryData(["order", s.branchId, paidOrder.id], paidOrder);
            qc.invalidateQueries();
            setCheckout(null);
            setSaved(paidOrder);
            setPrintAfterCheckout(
              readReceiptPreferences().automatic ? paidOrder.id : undefined,
            );
          }}
        />
      )}
      {printSettings && (
        <ReceiptPrintSettings close={() => setPrintSettings(false)} />
      )}
      {restock && <RestockForm {...restock} close={() => setRestock(null)} />}
      {saved && (
        <OrderDetail
          order={saved}
          printOnOpen={printAfterCheckout === saved.id}
          close={() => {
            setSaved(null);
            setPrintAfterCheckout(undefined);
          }}
        />
      )}
    </div>
  );
}
type RestockIngredient = {
  id: string;
  name: string;
  unit: string;
  suggested: number;
  perUnit: number;
  branchStock: number;
};

function RestockForm({
  recipe,
  targetUnits,
  close,
}: {
  recipe: RestockIngredient[];
  targetUnits: number;
  close: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const ingredients = recipe.filter((item) => item.suggested > 0);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ingredients.map(({ id, suggested }) => [id, String(suggested)]),
    ),
  );
  const projection = recipe.map(
    ({ id, name, unit, branchStock, perUnit, suggested }) => {
      const stockAfter = branchStock + Number(amounts[id] || 0);
      return {
        id,
        name,
        unit,
        suggested,
        available: Math.max(0, Math.floor(stockAfter / perUnit)),
        missing: perUnit * targetUnits - stockAfter,
      };
    },
  );
  const projected = Math.min(...projection.map((item) => item.available));
  const missing = projection.filter((item) => item.missing > 0);
  const validPreview = Object.values(amounts).every(
    (value) =>
      value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0,
  );
  const multiple = ingredients.length > 1;
  return (
    <Modal
      title={multiple ? "Reponer ingredientes" : "Reponer ingrediente"}
      onClose={() => {
        if (!submitting.current) close();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current) return;
          const items = ingredients.map(({ id }) => ({
            ingredientId: id,
            quantity: Number(amounts[id]),
          }));
          if (
            items.some(
              ({ quantity }) => !Number.isFinite(quantity) || quantity < 0,
            )
          ) {
            setError(
              "Ingresa cantidades válidas. Usa cero para omitir un ingrediente.",
            );
            return;
          }
          const entries = items.filter(({ quantity }) => quantity > 0);
          if (!entries.length) {
            setError(
              "Ingresa una cantidad mayor que cero para al menos un ingrediente.",
            );
            return;
          }
          submitting.current = true;
          setBusy(true);
          setError("");
          try {
            await api("inventory/restock", entries);
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "No se pudo registrar la entrada.",
            );
            submitting.current = false;
            setBusy(false);
            return;
          }
          await qc.invalidateQueries({
            predicate: ({ queryKey }) =>
              ["products", "inventory", "inventory-movements"].includes(
                String(queryKey[0]),
              ),
          });
          close();
          toast(
            multiple
              ? "Reposición registrada."
              : `Entrada registrada para ${ingredients[0].name}.`,
          );
        }}
      >
        <p>
          Edita las cantidades sugeridas. Escribe 0 para omitir un ingrediente.
        </p>
        {ingredients.map((ingredient) => (
          <Field
            key={ingredient.id}
            label={`${ingredient.name} (${ingredient.unit})`}
            name={ingredient.id}
            type="number"
            value={amounts[ingredient.id]}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setAmounts((current) => ({
                ...current,
                [ingredient.id]: event.target.value,
              }))
            }
            inputMode="decimal"
            min={0}
            step="any"
            required
            disabled={busy}
          />
        ))}
        <p role="status">
          {validPreview ? (
            <>
              <strong>
                {projected}{" "}
                {projected === 1 ? "unidad disponible" : "unidades disponibles"}{" "}
                tras reponer.
              </strong>{" "}
              {projected >= targetUnits
                ? "El producto saldrá del filtro."
                : "El producto seguirá en el filtro."}
            </>
          ) : (
            "Completa las cantidades para ver la disponibilidad estimada."
          )}
        </p>
        {validPreview && missing.length > 0 && (
          <>
            <ul aria-label="Ingredientes pendientes para salir del filtro">
              {missing.map((item) => (
                <li key={item.id}>
                  {item.name} · Agrega{" "}
                  {Number(item.missing.toPrecision(15)).toLocaleString(
                    "es-CO",
                    {
                      maximumSignificantDigits: 15,
                    },
                  )}{" "}
                  más ({item.unit})
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setAmounts((current) => ({
                  ...current,
                  ...Object.fromEntries(
                    missing.map(({ id, suggested }) => [id, String(suggested)]),
                  ),
                }));
                setError("");
              }}
            >
              Completar faltantes
            </Button>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" disabled={busy}>
          {busy ? "Registrando…" : "Registrar reposición"}
        </Button>
      </form>
    </Modal>
  );
}

function ProductArtwork({
  product,
}: {
  product: { name: string; image?: string };
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const image = product.image?.trim();
  return image && /^https?:\/\//i.test(image) && failedImage !== image ? (
    <img
      src={image}
      alt=""
      loading="lazy"
      onError={() => setFailedImage(image)}
    />
  ) : (
    <ProductIcon name={product.name} />
  );
}
function ProductConfig({ product: p, close, add, pending }: any) {
  const [variant, setVariant] = useState(""),
    [mods, setMods] = useState<string[]>([]),
    [notes, setNotes] = useState("");
  return (
    <Modal title={p.name} subtitle="Prepáralo a su gusto." onClose={close}>
      {p.variants?.length > 0 && (
        <Field label="Presentación">
          <select value={variant} onChange={(e) => setVariant(e.target.value)}>
            <option value="">Estándar · {money(p.price)}</option>
            {p.variants.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.name} · {money(v.price)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="modifier-list">
        {p.modifiers?.map(({ modifier: m }: any) => (
          <label key={m.id}>
            <input
              type="checkbox"
              checked={mods.includes(m.id)}
              onChange={(e) =>
                setMods(
                  e.target.checked
                    ? [...mods, m.id]
                    : mods.filter((id) => id !== m.id),
                )
              }
            />
            <span>{m.name}</span>
            <strong>+ {money(m.price)}</strong>
          </label>
        ))}
      </div>
      <Field label="Nota especial">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Por ejemplo: término medio"
        />
      </Field>
      <Button
        variant="primary"
        disabled={pending}
        onClick={() => add(p, variant, mods, notes)}
      >
        <Plus size={17} />
        Agregar al pedido
      </Button>
    </Modal>
  );
}
export function OrderDetail({
  order: initial,
  close,
  printOnOpen = false,
}: any) {
  const qc = useQueryClient(),
    toast = useToast(),
    s = useSession();
  const [paperWidth, setPaperWidth] = useState(
    () => readReceiptPreferences().width,
  );
  const [autoPrintOrder, setAutoPrintOrder] = useState<string | undefined>(
    printOnOpen ? initial.id : undefined,
  );
  const printedOrder = useRef<string | undefined>(undefined);
  const printing = useRef(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const thermalReceipt = useRef<HTMLElement>(null);
  const printRule = useRef<HTMLStyleElement>(null);
  const printThermalReceipt = useCallback(async () => {
    const receipt = thermalReceipt.current;
    const rule = printRule.current;
    if (!receipt || !rule || printing.current) return;
    const heightMm =
      Math.ceil((receipt.getBoundingClientRect().height * 25.4) / 96) + 8;
    rule.textContent = `@page gpos-receipt { size: ${paperWidth}mm ${heightMm}mm; margin: 3mm ${paperWidth === 58 ? 5 : 4}mm; }`;
    const directPrint = directReceiptPrinter();
    if (!directPrint) {
      window.print();
      return;
    }
    const { printer } = readReceiptPreferences();
    if (!printer) {
      toast(
        "Pago registrado. Elige una impresora en Configurar impresión y vuelve a imprimir el comprobante.",
        true,
      );
      return;
    }
    printing.current = true;
    setIsPrinting(true);
    try {
      await directPrint("print", printer);
    } catch {
      toast(
        "No se pudo enviar el comprobante a " +
          printer +
          ". Revisa la impresora y vuelve a imprimir desde el pedido.",
        true,
      );
    } finally {
      printing.current = false;
      setIsPrinting(false);
    }
  }, [paperWidth, toast]);
  const [paying, setPaying] = useState(false),
    [splitting, setSplitting] = useState(false),
    [payingProducts, setPayingProducts] = useState(false),
    [separating, setSeparating] = useState(false),
    [tableAction, setTableAction] = useState<"move" | "merge" | null>(null),
    [activeOrderId, setActiveOrderId] = useState<string>(initial.id),
    [busy, setBusy] = useState(false),
    [cancel, setCancel] = useState(false),
    [reason, setReason] = useState(""),
    [returning, setReturning] = useState(false),
    [editing, setEditing] = useState<any>(null);
  const query = useQuery({
    queryKey: ["order", s.branchId, activeOrderId],
    queryFn: () => get("orders/" + activeOrderId),
    initialData: activeOrderId === initial.id ? initial : undefined,
    refetchInterval: 4000,
  });
  const o = query.data;
  useEffect(() => {
    if (
      !autoPrintOrder ||
      o?.id !== autoPrintOrder ||
      o.status !== "CERRADO" ||
      printedOrder.current === autoPrintOrder
    )
      return;
    printedOrder.current = autoPrintOrder;
    printThermalReceipt();
  }, [autoPrintOrder, o?.id, o?.status, printThermalReceipt]);
  function completePayment(data: any) {
    if (data.status === "CERRADO" && readReceiptPreferences().automatic)
      setAutoPrintOrder(data.id);
    updateOrder(data);
  }
  const rounds = o ? orderRounds(o) : [];
  const open = !!o && !["CERRADO", "CANCELADO"].includes(o.status);
  const canEdit = can(s.user, "pedidos.editar");
  const tableAccount = open && o.service === "MESA" && !!o.tableId;
  const paid = o ? orderPaid(o) : 0;
  const remaining = (o?.total ?? 0) - paid;
  const canCharge = can(s.user, "ventas.crear");
  function updateOrder(data: any) {
    qc.setQueryData(["order", s.branchId, o.id], data);
    qc.invalidateQueries();
  }
  const canCancel =
    can(s.user, "pedidos.cancelar") &&
    o &&
    !rounds.some((round) => round.status === "ENTREGADO") &&
    ["CONFIRMADO", "EN_PREPARACION", "LISTO"].includes(o.status);
  async function state(status: string, roundId?: string) {
    setBusy(true);
    try {
      const { data } = await api(`orders/${o.id}/state`, {
        status,
        reason,
        roundId,
      });
      updateOrder(data);
      toast("Pedido actualizado");
      setCancel(false);
    } catch (e: any) {
      query.refetch();
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  if (!o)
    return (
      <Modal title="Cuenta de mesa" onClose={close}>
        {query.error ? (
          <ErrorBox error={query.error} retry={query.refetch} />
        ) : (
          <Loading />
        )}
      </Modal>
    );
  if (o.mergedIntoId)
    return (
      <Modal title={"Pedido #" + o.number} onClose={close}>
        <p>
          Esta cuenta se unió a otra mesa. Sus productos y cobros se trasladaron
          a la cuenta de destino.
        </p>
        <Button onClick={() => setActiveOrderId(o.mergedIntoId)}>
          Ver cuenta unida
        </Button>
      </Modal>
    );
  return (
    <Modal
      title={"Pedido #" + o.number}
      subtitle={`${labels[o.service]} · ${o.table?.name || o.customer?.name || "Consumidor final"}`}
      onClose={close}
      printReceipt={o.status === "CERRADO"}
    >
      <div className="button-row">
        <Badge value={o.status} />
        {tableAccount && can(s.user, "pedidos.crear") && (
          <Link
            className="button primary"
            to={"/app/pos?order=" + encodeURIComponent(o.id)}
            onClick={close}
          >
            <Plus size={17} /> Agregar productos
          </Link>
        )}
        {tableAccount && (canEdit || can(s.user, "pedidos.cerrar")) && (
          <>
            <Button disabled={busy} onClick={() => setTableAction("move")}>
              <Armchair size={17} /> Mover mesa
            </Button>
            <Button disabled={busy} onClick={() => setTableAction("merge")}>
              <Combine size={17} /> Unir mesas
            </Button>
            <Button disabled={busy} onClick={() => setSeparating(true)}>
              <ArrowRight size={17} /> Separar productos
            </Button>
          </>
        )}
      </div>
      {rounds.map((round) => {
        const action = preparationAction(round.status);
        const canAdvance =
          action &&
          (can(
            s.user,
            action.next === "ENTREGADO"
              ? "pedidos.entregar"
              : "pedidos.preparar",
          ) ||
            canEdit ||
            (action.next === "ENTREGADO" && can(s.user, "pedidos.cerrar")));
        return (
          <section className="receipt-round" key={round.id ?? "initial"}>
            {round.id && (
              <div className="receipt-round-heading">
                <strong>Ronda {round.sequence}</strong>
                <Badge value={round.status} />
              </div>
            )}
            <div className="receipt-items">
              {round.items.map((item) => (
                <div key={item.id}>
                  <span>
                    <b>{item.quantity}×</b> {item.name}
                    {item.modifiers?.map((modifier: any) => (
                      <small key={modifier.id}>+ {modifier.name}</small>
                    ))}
                    {item.notes && <small>{item.notes}</small>}
                  </span>
                  <strong>{money(item.total)}</strong>
                </div>
              ))}
            </div>
            {open && (
              <div className="button-row">
                {round.status === "CONFIRMADO" && canEdit && !paid && (
                  <Button
                    variant="quiet"
                    onClick={() =>
                      setEditing({
                        ...o,
                        items: round.items,
                        roundId: round.id,
                        roundNumber: round.id ? round.sequence : undefined,
                      })
                    }
                  >
                    {round.id
                      ? "Editar ronda " + round.sequence
                      : "Editar pedido"}
                  </Button>
                )}
                {canAdvance &&
                  !(o.service === "DOMICILIO" && round.status === "LISTO") && (
                    <Button
                      disabled={busy}
                      onClick={() => state(action.next, round.id)}
                    >
                      {action.label}
                    </Button>
                  )}
              </div>
            )}
          </section>
        );
      })}
      {o.notes && <p className="order-note">{o.notes}</p>}
      {o.estimatedAt && (
        <p className="order-note">
          Recogida estimada:{" "}
          {new Date(o.estimatedAt).toLocaleString("es-CO", {
            timeZone: "America/Bogota",
          })}
        </p>
      )}
      {o.delivery && (
        <p className="order-note">Entrega: {o.delivery.address}</p>
      )}
      <div className="receipt-total">
        <span>Total</span>
        <strong>{money(o.total)}</strong>
      </div>
      {paid > 0 && <PaymentSummary order={o} />}
      {o.status === "CERRADO" ? (
        <>
          <div className="success-banner" role="status">
            <Check size={18} aria-hidden="true" /> Pago registrado
          </div>
          <div className="button-row receipt-print-actions">
            <RollWidth
              value={paperWidth}
              onChange={(width) => {
                setPaperWidth(width);
                try {
                  saveReceiptPreferences({ width });
                } catch {
                  toast(
                    "El navegador no pudo recordar el ancho del rollo.",
                    true,
                  );
                }
              }}
            />
            <Button onClick={printThermalReceipt} disabled={isPrinting}>
              <Printer size={17} />
              Imprimir comprobante
            </Button>
            {can(s.user, "ventas.devolver") && (
              <Button onClick={() => setReturning(true)}>Devolución</Button>
            )}
          </div>
          <article
            ref={thermalReceipt}
            className={`thermal-receipt thermal-receipt-${paperWidth}`}
          >
            <style ref={printRule} />
            <header>
              <h2>{s.user.tenant.name}</h2>
              <p>Comprobante #{o.number}</p>
              <p>
                {date(o.createdAt)} · {labels[o.service]}
              </p>
              {o.table && <p>{o.table.name}</p>}
            </header>
            <ul className="thermal-items">
              {rounds
                .flatMap((round) => round.items)
                .map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <strong>{money(item.total)}</strong>
                  </li>
                ))}
            </ul>
            <dl className="thermal-total">
              <dt>Total</dt>
              <dd>{money(o.total)}</dd>
            </dl>
            {paid > 0 && <PaymentSummary order={o} />}
            {o.refunds?.length > 0 && (
              <p>
                Devuelto:{" "}
                {money(
                  o.refunds.reduce(
                    (sum: number, refund: any) => sum + refund.amount,
                    0,
                  ),
                )}
              </p>
            )}
            <p className="thermal-note">
              Comprobante POS · No es factura electrónica
            </p>
          </article>
          <small className="muted">
            Comprobante de venta POS. No es factura electrónica.
          </small>
          {o.refunds?.length > 0 && (
            <p>
              Devuelto:{" "}
              {money(o.refunds.reduce((n: number, r: any) => n + r.amount, 0))}
            </p>
          )}
        </>
      ) : (
        open && (
          <>
            {o.service === "DOMICILIO" && o.status === "LISTO" && (
              <Link className="button" to="/app/kitchen" onClick={close}>
                Ir a cocina para despachar
              </Link>
            )}
            <div className="button-row">
              {canCharge && (
                <Button
                  variant="primary"
                  disabled={busy || o.status !== "ENTREGADO"}
                  onClick={() => setPaying(true)}
                >
                  <CreditCard size={17} /> {paid ? "Cobrar saldo" : "Cobrar"}{" "}
                  {money(remaining)}
                </Button>
              )}
              {tableAccount && canCharge && remaining > 1 && (
                <Button
                  disabled={busy || o.status !== "ENTREGADO"}
                  onClick={() => setSplitting(true)}
                >
                  <Users size={17} /> Dividir cuenta
                </Button>
              )}
              {tableAccount && canCharge && remaining > 0 && (
                <Button
                  disabled={busy || o.status !== "ENTREGADO"}
                  onClick={() => setPayingProducts(true)}
                >
                  <ShoppingBag size={17} /> Cobrar por productos
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="danger-quiet"
                  disabled={busy}
                  onClick={() => setCancel(true)}
                >
                  Cancelar pedido
                </Button>
              )}
            </div>
            {can(s.user, "ventas.crear") && o.status !== "ENTREGADO" && (
              <p className="muted">
                Podrás cobrar cuando se entregue todo el pedido.
              </p>
            )}
          </>
        )
      )}
      {cancel && canCancel && (
        <div className="inline-form">
          <Field
            label="Motivo de cancelación"
            value={reason}
            onChange={(e: any) => setReason(e.target.value)}
          />
          <Button
            variant="danger"
            disabled={busy || reason.length < 3}
            onClick={() => state("CANCELADO")}
          >
            Confirmar cancelación
          </Button>
        </div>
      )}
      {paying && (
        <Payment
          order={o}
          close={() => setPaying(false)}
          onPaid={(data: any) => {
            setPaying(false);
            completePayment(data);
          }}
        />
      )}
      {splitting && (
        <SplitPayment
          order={o}
          close={() => setSplitting(false)}
          refresh={() => query.refetch()}
          onPaid={(data: any) => {
            setSplitting(false);
            completePayment(data);
          }}
        />
      )}
      {payingProducts && (
        <ProductPayment
          order={o}
          close={() => setPayingProducts(false)}
          refresh={() => query.refetch()}
          onPaid={(data) => {
            setPayingProducts(false);
            completePayment(data);
          }}
        />
      )}
      {separating && (
        <SplitTableProducts
          order={o}
          close={() => setSeparating(false)}
          onSplit={({ source, target }) => {
            qc.setQueryData(["order", s.branchId, source.id], source);
            qc.setQueryData(["order", s.branchId, target.id], target);
            setSeparating(false);
            qc.invalidateQueries();
          }}
        />
      )}
      {tableAction && (
        <TableTransfer
          order={o}
          mode={tableAction}
          close={() => setTableAction(null)}
          onTransferred={(data: any) => {
            qc.setQueryData(["order", s.branchId, data.id], data);
            setActiveOrderId(data.id);
            setTableAction(null);
            qc.invalidateQueries();
          }}
        />
      )}
      {editing && (
        <EditOrder
          order={editing}
          close={() => setEditing(null)}
          onSaved={(data: any) =>
            qc.setQueryData(["order", s.branchId, o.id], data)
          }
        />
      )}
      {returning && <Refund order={o} close={() => setReturning(false)} />}
    </Modal>
  );
}
type ChargedProduct = {
  id: string;
  quantity: number;
  name: string;
  amount: number;
};
type RecordedPayment = {
  items?: ChargedProduct[] | null;
  id: string;
  method: string;
  amount: number;
  cashReceived?: number | null;
  cashChange?: number | null;
  idempotencyKey: string;
};
const paymentMethods = [
  "EFECTIVO",
  "TARJETA",
  "TRANSFERENCIA",
  "NEQUI",
  "DAVIPLATA",
  "QR",
  "OTRO",
];

function orderPaid(order: { payments?: RecordedPayment[] }) {
  return (order.payments ?? []).reduce(
    (total, payment) => total + payment.amount,
    0,
  );
}

function PaymentSummary({
  order,
}: {
  order: { total: number; payments: RecordedPayment[] };
}) {
  const paid = orderPaid(order);
  const cashPayments = order.payments.filter(
    (payment) => payment.method === "EFECTIVO" && payment.cashReceived != null,
  );
  const parts = new Map<string, RecordedPayment[]>();
  for (const payment of order.payments)
    parts.set(payment.idempotencyKey, [
      ...(parts.get(payment.idempotencyKey) ?? []),
      payment,
    ]);
  return (
    <section className="settlement-summary" aria-label="Cobros de la cuenta">
      <dl className="settlement-amounts">
        <dt>Cobrado</dt>
        <dd>{money(paid)}</dd>
        <dt>Saldo pendiente</dt>
        <dd>
          <strong>{money(order.total - paid)}</strong>
        </dd>
        {cashPayments.length > 0 && (
          <>
            <dt>Efectivo recibido</dt>
            <dd>
              {money(
                cashPayments.reduce(
                  (sum, payment) => sum + (payment.cashReceived ?? 0),
                  0,
                ),
              )}
            </dd>
            <dt>Cambio devuelto</dt>
            <dd>
              <strong>
                {money(
                  cashPayments.reduce(
                    (sum, payment) => sum + (payment.cashChange ?? 0),
                    0,
                  ),
                )}
              </strong>
            </dd>
          </>
        )}
      </dl>
      {parts.size > 1 ||
      paid < order.total ||
      order.payments.some((payment) => payment.items?.length) ? (
        <details>
          <summary>Ver cobros ({parts.size})</summary>
          <ul>
            {[...parts.values()].map((payments, index) => (
              <li key={payments[0].id}>
                <strong>Parte {index + 1}</strong>
                <span>
                  {payments
                    .map(
                      (p) =>
                        `${labels[p.method] || p.method} · ${money(p.amount)}`,
                    )
                    .join(" + ")}
                </span>
                {payments
                  .flatMap((payment) => payment.items ?? [])
                  .map((item) => (
                    <span key={item.id}>
                      {item.quantity}× {item.name}
                    </span>
                  ))}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function SplitTableProducts({
  order,
  close,
  onSplit,
}: {
  order: any;
  close: () => void;
  onSplit: (data: { source: any; target: any }) => void;
}) {
  const branchId = useSession((s) => s.branchId);
  const toast = useToast();
  const [destination, setDestination] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const paidUnits = new Map<string, number>();
  for (const payment of order.payments as RecordedPayment[])
    for (const item of payment.items ?? [])
      paidUnits.set(item.id, (paidUnits.get(item.id) ?? 0) + item.quantity);
  const choices = orderRounds(order)
    .flatMap((round) =>
      round.items.map((item) => ({
        item,
        round: round.sequence,
        available: item.quantity,
        paid: paidUnits.get(item.id) ?? 0,
      })),
    )
    .filter((choice) => choice.available > 0);
  const items = Object.entries(quantities)
    .filter(([, quantity]) => quantity !== 0)
    .map(([id, quantity]) => ({ id, quantity }));
  const valid =
    items.length > 0 &&
    items.every(({ id, quantity }) =>
      choices.some(
        (choice) =>
          choice.item.id === id &&
          quantity > 0 &&
          Number.isInteger(quantity) &&
          quantity <= choice.available,
      ),
    );
  const tables = useQuery({
    queryKey: ["split-tables", branchId],
    queryFn: () => get("tables?limit=100"),
  });
  const destinations = (tables.data ?? []).filter(
    (table: any) =>
      table.id !== order.tableId && ["LIBRE", "OCUPADA"].includes(table.status),
  );
  const selectedTable = destinations.find(
    (table: any) => table.id === destination,
  );
  const quote = useQuery({
    queryKey: [
      "split-table-quote",
      branchId,
      order.id,
      order.updatedAt,
      destination,
      selectedTable?.status,
      items,
    ],
    queryFn: async () =>
      (
        await api(`orders/${order.id}/split-table-quote`, {
          items,
          targetTableId: destination,
        })
      ).data as {
        amount: number;
        sourceBalance: number;
        targetOrderId?: string;
        targetBalance: number;
        paidMoved?: number;
      },
    enabled: valid && !!selectedTable,
    retry: false,
  });
  const ready =
    valid &&
    !quote.isFetching &&
    !quote.isError &&
    !!quote.data &&
    !!selectedTable;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy || !quote.data) return;
    const body = {
      sourceTableId: order.tableId,
      targetTableId: destination,
      items,
      expectedAmount: quote.data.amount,
      expectedSourceBalance: quote.data.sourceBalance,
      expectedTargetOrderId: quote.data.targetOrderId,
      expectedTargetBalance: quote.data.targetBalance,
    };
    const payload = JSON.stringify(body);
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: newOperationKey() };
    setBusy(true);
    setError("");
    try {
      const { data } = await api(`orders/${order.id}/split-table`, {
        ...body,
        requestKey: attempt.current.key,
      });
      onSplit(data);
      toast("Productos separados en " + data.target.table.name);
    } catch (e: any) {
      setError(e.message);
      void tables.refetch();
      void quote.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Separar productos"
      subtitle="Pasa productos a otra mesa. Si una línea tiene unidades cobradas, esas pasan primero junto con su pago."
      onClose={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        <Field label="Mesa de destino">
          <select
            required
            value={destination}
            disabled={busy || !destinations.length}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">
              {tables.isLoading
                ? "Cargando mesas…"
                : destinations.length
                  ? "Selecciona otra mesa"
                  : "No hay mesas disponibles para recibir productos"}
            </option>
            {destinations.map((table: any) => (
              <option key={table.id} value={table.id}>
                {table.name} · {table.zone} · {labels[table.status]}
              </option>
            ))}
          </select>
        </Field>
        {tables.error && (
          <ErrorBox error={tables.error} retry={tables.refetch} />
        )}
        <div className="product-payment-lines">
          {choices.map(({ item, round, available, paid }) => (
            <Field
              key={item.id}
              label={[
                item.name,
                "Ronda " + round,
                item.notes,
                ...(item.modifiers ?? []).map(
                  (modifier: { name: string }) => modifier.name,
                ),
                available + (available === 1 ? " unidad" : " unidades"),
                paid ? paid + (paid === 1 ? " cobrada" : " cobradas") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              type="number"
              min="0"
              max={available}
              step="1"
              value={quantities[item.id] ?? 0}
              disabled={busy}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setQuantities((previous) => ({
                  ...previous,
                  [item.id]: Number(event.target.value),
                }))
              }
            />
          ))}
        </div>
        {!choices.length && <p>No hay unidades para separar.</p>}
        {quote.isFetching && <p role="status">Calculando saldos…</p>}
        {(error || (valid && quote.error)) && (
          <p className="form-error" role="alert">
            {error || quote.error?.message}
          </p>
        )}
        {valid && selectedTable && quote.data && !quote.isError && (
          <dl className="settlement-amounts">
            {quote.data.paidMoved ? (
              <>
                <dt>Abono que se traslada</dt>
                <dd>{money(quote.data.paidMoved)}</dd>
              </>
            ) : null}
            <dt>Saldo en {order.table.name}</dt>
            <dd>{money(quote.data.sourceBalance)}</dd>
            <dt>Saldo en {selectedTable.name}</dt>
            <dd>{money(quote.data.targetBalance)}</dd>
          </dl>
        )}
        <Button variant="primary" disabled={!ready || busy}>
          {busy ? "Separando…" : "Confirmar separación"}
        </Button>
      </form>
    </Modal>
  );
}

function TableTransfer({
  order,
  close,
  onTransferred,
  mode,
}: {
  order: { id: string; tableId: string; table: { name: string } };
  close: () => void;
  mode: "move" | "merge";
  onTransferred: (data: any) => void;
}) {
  const merging = mode === "merge";
  const branchId = useSession((s) => s.branchId);
  const toast = useToast();
  const [origin] = useState(() => ({
    id: order.tableId,
    name: order.table.name,
  }));
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tables = useQuery({
    queryKey: ["move-tables", branchId],
    queryFn: () => get("tables?limit=100"),
  });
  const destinations = (tables.data || []).filter(
    (table: any) =>
      table.id !== origin.id &&
      table.status === (merging ? "OCUPADA" : "LIBRE"),
  );
  const target = useQuery({
    queryKey: ["merge-destination", branchId, destination],
    queryFn: () => get("tables/" + encodeURIComponent(destination) + "/order"),
    enabled: merging && !!destination,
    refetchOnMount: "always",
    retry: false,
  });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api(
        `orders/${order.id}/${merging ? "merge" : "move"}-table`,
        {
          sourceTableId: origin.id,
          targetTableId: destination,
          ...(merging ? { targetOrderId: target.data?.id } : {}),
        },
      );
      onTransferred(data);
      toast(
        merging
          ? "Cuentas unidas en " + data.table.name
          : "Cuenta movida a " + data.table.name,
      );
    } catch (error: any) {
      setError(error.message);
      void tables.refetch();
      if (merging) void target.refetch();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={merging ? "Unir mesas" : "Mover mesa"}
      subtitle={
        merging
          ? `La mesa ${origin.name} quedará libre. La mesa de destino conservará los productos, rondas y cobros de ambas cuentas.`
          : `La cuenta de ${origin.name} conservará sus productos, rondas y cobros.`
      }
      onClose={() => {
        if (!busy) close();
      }}
    >
      {tables.isLoading ? (
        <Loading />
      ) : tables.error ? (
        <ErrorBox error={tables.error} retry={tables.refetch} />
      ) : (
        <form onSubmit={submit}>
          <Field label="Mesa de destino">
            <select
              required
              value={destination}
              disabled={busy || !destinations.length}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">
                {destinations.length
                  ? merging
                    ? "Selecciona otra mesa ocupada"
                    : "Selecciona una mesa libre"
                  : merging
                    ? "No hay otras mesas ocupadas"
                    : "No hay mesas libres"}
              </option>
              {destinations.map((table: any) => (
                <option key={table.id} value={table.id}>
                  {table.name} · {table.zone}
                </option>
              ))}
            </select>
          </Field>
          {merging && target.data && (
            <p>
              Pedido #{target.data.number} · Saldo actual:{" "}
              {money(target.data.total - orderPaid(target.data))}
            </p>
          )}
          {merging && target.error && (
            <ErrorBox error={target.error} retry={target.refetch} />
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            disabled={
              busy ||
              (merging &&
                (!target.data || target.isFetching || target.isError)) ||
              !destinations.some((table: any) => table.id === destination)
            }
          >
            {merging
              ? busy
                ? "Uniendo…"
                : "Confirmar unión"
              : busy
                ? "Moviendo…"
                : "Confirmar traslado"}
          </Button>
        </form>
      )}
    </Modal>
  );
}

function useCashTender(due: number) {
  const [received, setReceived] = useState("");
  const tendered = received === "" ? due : Number(received);
  const invalid =
    due > 0 &&
    (!Number.isSafeInteger(tendered) ||
      tendered < due ||
      tendered > 1000000000);
  return { due, received, setReceived, tendered, invalid };
}

function CashChange({
  cash,
  disabled,
}: {
  cash: ReturnType<typeof useCashTender>;
  disabled: boolean;
}) {
  if (!(cash.due > 0)) return null;
  return (
    <>
      <Field
        label="Efectivo recibido"
        type="number"
        inputMode="numeric"
        min={cash.due}
        max={1000000000}
        step="1"
        placeholder="Pago exacto"
        value={cash.received}
        disabled={disabled}
        aria-invalid={cash.invalid || undefined}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          cash.setReceived(event.target.value)
        }
      />
      <dl className="settlement-amounts" aria-live="polite">
        {cash.invalid ? (
          <>
            <dt>
              {cash.tendered > 1000000000
                ? "Efectivo máximo permitido"
                : "Efectivo pendiente"}
            </dt>
            <dd>
              {money(
                cash.tendered > 1000000000
                  ? 1000000000
                  : Math.max(0, cash.due - cash.tendered),
              )}
            </dd>
          </>
        ) : (
          <>
            <dt>Cambio a devolver</dt>
            <dd>
              <strong>{money(cash.tendered - cash.due)}</strong>
            </dd>
          </>
        )}
      </dl>
    </>
  );
}

function ProductPayment({
  order,
  close,
  refresh,
  onPaid,
}: {
  order: {
    id: string;
    total: number;
    status: string;
    items: {
      id: string;
      productId: string;
      name: string;
      quantity: number;
      price: number;
      notes?: string;
      modifiers?: { id: string; name: string }[];
    }[];
    payments: RecordedPayment[];
  };
  close: () => void;
  refresh: () => void;
  onPaid: (data: any) => void;
}) {
  const branch = useSession((s) => s.branchId);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [method, setMethod] = useState("EFECTIVO");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const toast = useToast();
  const paid = orderPaid(order);
  const used = new Map<string, number>();
  for (const payment of order.payments ?? [])
    for (const item of payment.items ?? [])
      used.set(item.id, (used.get(item.id) ?? 0) + item.quantity);
  const available = order.items
    .map((item) => ({
      ...item,
      quantity: item.quantity - (used.get(item.id) ?? 0),
    }))
    .filter((item) => item.quantity > 0);
  const groups = new Map<string, typeof available>();
  for (const item of available) {
    const key = JSON.stringify([
      item.productId,
      item.name,
      item.price,
      item.notes ?? "",
      (item.modifiers ?? []).map((modifier) => modifier.id).sort(),
    ]);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  const choices = [...groups].map(([key, lines]) => ({
    key,
    lines,
    quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  }));
  const items: { id: string; quantity: number }[] = [];
  let valid = true;
  for (const [key, quantity] of Object.entries(quantities)) {
    if (quantity === 0) continue;
    const group = choices.find((choice) => choice.key === key);
    if (
      !group ||
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > group.quantity
    ) {
      valid = false;
      continue;
    }
    let remaining = quantity;
    for (const line of group.lines) {
      if (!remaining) break;
      const units = Math.min(remaining, line.quantity);
      items.push({ id: line.id, quantity: units });
      remaining -= units;
    }
  }
  valid = valid && items.length > 0;
  const ready = order.status === "ENTREGADO";
  const quote = useQuery({
    queryKey: ["product-quote", branch, order.id, order.total, paid, items],
    queryFn: async () =>
      (await api(`orders/${order.id}/product-quote`, { items })).data as {
        amount: number;
        paid: number;
        credit: number;
      },
    enabled: valid && ready,
    retry: false,
  });
  const amount = quote.data?.amount ?? 0;
  const cash = useCashTender(method === "EFECTIVO" ? amount : 0);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      busy ||
      !valid ||
      !ready ||
      !amount ||
      quote.data?.paid !== paid ||
      quote.isFetching ||
      cash.invalid
    )
      return;
    setBusy(true);
    setError("");
    const body = {
      partial: true,
      expectedPaid: paid,
      items,
      payments: [
        {
          method,
          amount,
          ...(method === "EFECTIVO" ? { cashReceived: cash.tendered } : {}),
        },
      ],
    };
    const payload = JSON.stringify(body);
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: newOperationKey() };
    try {
      const { data } = await api(`orders/${order.id}/payment`, {
        ...body,
        idempotencyKey: attempt.current.key,
      });
      onPaid(data);
      toast(
        data.status === "CERRADO"
          ? "Cuenta pagada por completo"
          : "Productos cobrados. La mesa sigue abierta.",
      );
    } catch (error: any) {
      setError(error.message);
      refresh();
      void quote.refetch();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Cobrar por productos"
      subtitle="Elige las unidades que quiere pagar este cliente."
      onClose={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        <div className="product-payment-lines">
          {choices.map(({ key, lines: [item], quantity }) => (
            <Field
              key={key}
              label={[
                item.name,
                ...(item.modifiers ?? []).map((modifier) => modifier.name),
                item.notes,
                money(item.price),
                quantity === 1
                  ? "1 unidad disponible"
                  : `${quantity} unidades disponibles`,
              ]
                .filter(Boolean)
                .join(" · ")}
              type="number"
              min="0"
              max={quantity}
              step="1"
              value={quantities[key] ?? 0}
              disabled={busy}
              onChange={(event: any) =>
                setQuantities((values) => ({
                  ...values,
                  [key]: Number(event.target.value),
                }))
              }
            />
          ))}
        </div>
        {!available.length && (
          <p className="muted">
            No quedan unidades disponibles para seleccionar.
          </p>
        )}
        {!ready && (
          <p className="muted">Entrega todas las rondas antes de cobrar.</p>
        )}
        <Field label="Medio de pago">
          <select
            value={method}
            disabled={busy}
            onChange={(event) => {
              setMethod(event.target.value);
              cash.setReceived("");
            }}
          >
            {paymentMethods.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </Field>
        {quote.isFetching && <p role="status">Calculando importe…</p>}
        {quote.error && valid && ready && (
          <p className="form-error" role="alert">
            {quote.error.message}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <dl className="settlement-amounts">
          {quote.data?.credit ? (
            <>
              <dt>Abono previo aplicado</dt>
              <dd>{money(quote.data.credit)}</dd>
            </>
          ) : null}
          <dt>Valor de la selección</dt>
          <dd>
            <strong>{money(amount)}</strong>
          </dd>
        </dl>
        <CashChange cash={cash} disabled={busy} />
        <p className="muted">Registra el pago después de recibirlo.</p>
        <Button
          variant="primary"
          disabled={
            busy ||
            !ready ||
            !valid ||
            quote.isFetching ||
            quote.isError ||
            cash.invalid ||
            !amount ||
            quote.data?.paid !== paid
          }
        >
          {busy ? "Registrando…" : "Registrar cobro de productos"}
        </Button>
      </form>
    </Modal>
  );
}

function SplitPayment({
  order,
  close,
  refresh,
  onPaid,
}: {
  order: { id: string; total: number; payments?: RecordedPayment[] };
  close: () => void;
  refresh: () => void;
  onPaid: (data: any) => void;
}) {
  const paid = orderPaid(order);
  const balance = order.total - paid;
  const [expectedPaid, setExpectedPaid] = useState(paid);
  const [people, setPeople] = useState("2");
  const [amount, setAmount] = useState(String(Math.ceil(balance / 2)));
  const [method, setMethod] = useState("EFECTIVO");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState(() => newOperationKey());
  const toast = useToast();
  const value = Number(amount);
  const cash = useCashTender(method === "EFECTIVO" ? value : 0);
  const peopleCount = Number(people);
  const validPeople =
    Number.isInteger(peopleCount) && peopleCount >= 2 && peopleCount <= 20;
  const balanceChanged = paid !== expectedPaid;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || balanceChanged || cash.invalid) return;
    setError("");
    setBusy(true);
    try {
      const { data } = await api(`orders/${order.id}/payment`, {
        idempotencyKey: key,
        partial: true,
        expectedPaid,
        payments: [
          {
            method,
            amount: value,
            ...(method === "EFECTIVO" ? { cashReceived: cash.tendered } : {}),
          },
        ],
      });
      toast(
        data.status === "CERRADO"
          ? "Cuenta pagada por completo"
          : "Parte cobrada. La mesa sigue abierta.",
      );
      onPaid(data);
    } catch (error: any) {
      setError(error.message);
      refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Dividir cuenta"
      subtitle="Cobra una parte y deja el resto pendiente."
      onClose={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        <dl className="settlement-amounts">
          <dt>Saldo pendiente</dt>
          <dd>
            <strong>{money(balance)}</strong>
          </dd>
        </dl>
        <div className="split-calculator">
          <Field
            label="Personas que faltan por pagar"
            type="number"
            min="2"
            max="20"
            step="1"
            value={people}
            disabled={busy}
            onChange={(event: any) => setPeople(event.target.value)}
          />
          <Button
            type="button"
            disabled={!validPeople || busy || balanceChanged || balance < 2}
            onClick={() => setAmount(String(Math.ceil(balance / peopleCount)))}
          >
            Calcular parte
          </Button>
        </div>
        <Field
          label="Valor de esta parte"
          type="number"
          min="1"
          max={balance}
          step="1"
          required
          value={amount}
          disabled={busy}
          onChange={(event: any) => setAmount(event.target.value)}
        />
        <Field label="Medio de pago">
          <select
            value={method}
            disabled={busy}
            onChange={(event) => {
              setMethod(event.target.value);
              cash.setReceived("");
            }}
          >
            {paymentMethods.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </Field>
        <CashChange cash={cash} disabled={busy} />
        <p className="muted">Registra el pago después de recibirlo.</p>
        {balanceChanged && (
          <div className="form-error" role="alert">
            <p>
              Otro cobro cambió el saldo. Revisa la parte antes de confirmar.
            </p>
            <Button
              type="button"
              disabled={busy || balance < 1}
              onClick={() => {
                setExpectedPaid(paid);
                setKey(newOperationKey());
                setAmount(
                  String(Math.ceil(balance / (validPeople ? peopleCount : 2))),
                );
                setError("");
              }}
            >
              Actualizar parte
            </Button>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button
          variant="primary"
          disabled={
            busy ||
            balanceChanged ||
            cash.invalid ||
            !Number.isSafeInteger(value) ||
            value < 1 ||
            value > balance
          }
        >
          {busy ? "Registrando…" : "Registrar cobro de la parte"}
        </Button>
      </form>
    </Modal>
  );
}

function Payment({ order, close, onPaid, submitPayment }: any) {
  const formId = useId();
  const balance = order.total - orderPaid(order);
  const [payments, setPayments] = useState<any[]>([
      { method: "EFECTIVO", amount: balance },
    ]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [key] = useState(newOperationKey);
  const toast = useToast();
  const sum = payments.reduce((s, p) => s + Number(p.amount), 0);
  const cash = useCashTender(
    Number(
      payments.find((payment) => payment.method === "EFECTIVO")?.amount ?? 0,
    ),
  );
  async function submit(e: any) {
    e.preventDefault();
    if (busy || sum !== balance || cash.invalid) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        idempotencyKey: key,
        payments: payments.map((p) => ({
          ...p,
          amount: Number(p.amount),
          ...(p.method === "EFECTIVO" ? { cashReceived: cash.tendered } : {}),
        })),
      };
      const { data } = submitPayment
        ? await submitPayment(payload)
        : await api(`orders/${order.id}/payment`, payload);
      toast("Pago registrado. La venta quedó cerrada.");
      onPaid(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Cobrar pedido"
      subtitle={"Total a pagar · " + money(balance)}
      onClose={() => {
        if (!busy) close();
      }}
    >
      <form id={formId} className="payment-form" onSubmit={submit}>
        <div className="payment-total">{money(balance)}</div>
        {payments.map((p, i) => (
          <div className="payment-row" key={i}>
            <Field label="Medio de pago">
              <select
                value={p.method}
                onChange={(e) => {
                  if (p.method === "EFECTIVO" || e.target.value === "EFECTIVO")
                    cash.setReceived("");
                  setPayments((v) =>
                    v.map((x, n) =>
                      n === i ? { ...x, method: e.target.value } : x,
                    ),
                  );
                }}
              >
                {paymentMethods.map((m) => (
                  <option
                    key={m}
                    value={m}
                    disabled={payments.some(
                      (v, n) => n !== i && v.method === m,
                    )}
                  >
                    {labels[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Valor"
              type="number"
              min="1"
              step="1"
              required
              value={p.amount}
              onChange={(e: any) =>
                setPayments((v) =>
                  v.map((x, n) =>
                    n === i ? { ...x, amount: e.target.value } : x,
                  ),
                )
              }
            />
            {payments.length > 1 && (
              <button
                type="button"
                className="icon-button"
                aria-label="Quitar pago"
                onClick={() => {
                  if (p.method === "EFECTIVO") cash.setReceived("");
                  setPayments((v) => v.filter((_, n) => n !== i));
                }}
              >
                <X size={17} />
              </button>
            )}
          </div>
        ))}
        {payments.length < 7 && (
          <Button
            type="button"
            variant="quiet"
            onClick={() =>
              setPayments((v) => [
                ...v,
                {
                  method: paymentMethods.find(
                    (m) => !v.some((p) => p.method === m),
                  ),
                  amount: Math.max(0, balance - sum),
                },
              ])
            }
          >
            <Plus size={16} />
            Dividir entre otro medio de pago
          </Button>
        )}
        <CashChange cash={cash} disabled={busy} />
        <div className="receipt-total">
          <span>Por completar</span>
          <strong>{money(balance - sum)}</strong>
        </div>
        <p className="muted">
          Registra únicamente pagos ya recibidos. Los medios digitales no
          realizan un cargo automático.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="payment-modal-footer">
        <Button
          type="submit"
          form={formId}
          variant="primary"
          disabled={busy || sum !== balance || cash.invalid}
        >
          {busy ? "Registrando…" : "Confirmar pago"} <Check size={17} />
        </Button>
      </div>
    </Modal>
  );
}
function Refund({ order, close }: any) {
  const [quantities, setQuantities] = useState<Record<string, number>>({}),
    [reason, setReason] = useState(""),
    [method, setMethod] = useState("EFECTIVO"),
    [busy, setBusy] = useState(false);
  const qc = useQueryClient(),
    toast = useToast();
  return (
    <Modal
      title="Devolución parcial o completa"
      subtitle="Los alimentos preparados no regresan al inventario automáticamente."
      onClose={close}
    >
      {order.items.map((i: any) => (
        <Field
          key={i.id}
          label={`${i.name} · disponible ${i.quantity - i.refundedQuantity}`}
          type="number"
          min="0"
          max={i.quantity - i.refundedQuantity}
          value={quantities[i.id] || 0}
          onChange={(e: any) =>
            setQuantities({ ...quantities, [i.id]: Number(e.target.value) })
          }
        />
      ))}
      <Field
        label="Motivo"
        required
        value={reason}
        onChange={(e: any) => setReason(e.target.value)}
      />
      <Field label="Medio de devolución">
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          {[
            "EFECTIVO",
            "TARJETA",
            "TRANSFERENCIA",
            "NEQUI",
            "DAVIPLATA",
            "QR",
            "OTRO",
          ].map((value) => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </select>
      </Field>
      <Button
        variant="danger"
        disabled={
          busy ||
          reason.length < 3 ||
          !Object.values(quantities).some((n) => n > 0)
        }
        onClick={async () => {
          setBusy(true);
          try {
            await api(`orders/${order.id}/refund`, {
              reason,
              method,
              items: Object.entries(quantities)
                .filter(([, n]) => n > 0)
                .map(([id, quantity]) => ({ id, quantity })),
            });
            qc.invalidateQueries();
            toast("Devolución registrada");
            close();
          } catch (e: any) {
            toast(e.message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        Registrar devolución
      </Button>
    </Modal>
  );
}
function EditOrder({ order, close, onSaved }: any) {
  const products = useQuery({
      queryKey: ["products-edit"],
      enabled: !order.roundId,
      queryFn: () => get("products?limit=100"),
    }),
    qc = useQueryClient(),
    toast = useToast();
  const [items, setItems] = useState(
      order.items.map((i: any) => ({ id: i.id, quantity: i.quantity })),
    ),
    [additions, setAdditions] = useState<any[]>([]),
    [notes, setNotes] = useState(order.notes || ""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={
        order.roundId
          ? "Editar ronda " + order.roundNumber
          : "Editar pedido #" + order.number
      }
      subtitle="Disponible mientras cocina no haya empezado la preparación."
      onClose={close}
    >
      {items.map((i: any, index: number) => (
        <Field
          key={i.id}
          label={order.items[index].name}
          type="number"
          min="0"
          max="999"
          value={i.quantity}
          onChange={(e: any) =>
            setItems((v: any) =>
              v.map((x: any) =>
                x.id === i.id ? { ...x, quantity: Number(e.target.value) } : x,
              ),
            )
          }
        />
      ))}
      {!order.roundId && (
        <>
          <Field label="Agregar producto (presentación estándar)">
            <select
              value=""
              onChange={(e) =>
                e.target.value &&
                setAdditions((v) => [
                  ...v,
                  { productId: e.target.value, quantity: 1 },
                ])
              }
            >
              <option value="">Selecciona un producto</option>
              {products.data
                ?.filter((p: any) => p.active)
                .map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {money(p.price)}
                  </option>
                ))}
            </select>
          </Field>
          {additions.map((i, index) => (
            <Field
              key={index}
              label={
                products.data?.find((p: any) => p.id === i.productId)?.name
              }
              type="number"
              min="1"
              value={i.quantity}
              onChange={(e: any) =>
                setAdditions((v) =>
                  v.map((x, n) =>
                    n === index
                      ? { ...x, quantity: Number(e.target.value) }
                      : x,
                  ),
                )
              }
            />
          ))}
          <Field
            label="Notas"
            value={notes}
            onChange={(e: any) => setNotes(e.target.value)}
          />
        </>
      )}
      <Button
        variant="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { data } = await api(
              "orders/" + order.id,
              {
                items,
                additions,
                ...(order.roundId ? { roundId: order.roundId } : { notes }),
              },
              "PUT",
            );
            onSaved(data);
            qc.invalidateQueries();
            toast("Pedido actualizado");
            close();
          } catch (e: any) {
            toast(e.message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Guardando…"
          : order.roundId
            ? "Guardar ronda"
            : "Guardar pedido"}
      </Button>
    </Modal>
  );
}
