import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  Settings2,
} from "lucide-react";
import Papa from "papaparse";
import {
  api,
  get,
  useSession,
  money,
  can,
  isStore,
  serviceLabel,
  posServices,
  labels,
  roleLabel,
  roleOptions,
} from "./api";
import {
  PageTitle,
  TableScroll,
  Button,
  SearchInput,
  Modal,
  Field,
  Loading,
  ErrorBox,
  Empty,
  Badge,
  useToast,
} from "./ui";
import { ProductIcon } from "./pos";
import { CreditAccounts, CreditDialog } from "./credit";
type F = [string, string, string?, any?];
const definitions: Record<
  string,
  {
    title: string;
    singular: string;
    description: string;
    fields: F[];
    columns: string[];
    permission: string;
  }
> = {
  products: {
    title: "Productos",
    singular: "producto",
    description: "Tu menú, con todos sus detalles.",
    permission: "productos",
    fields: [
      ["name", "Nombre"],
      ["description", "Descripción"],
      ["categoryId", "Categoría", "select", "categories"],
      ["sku", "SKU"],
      ["barcode", "Código de barras"],
      ["price", "Precio de venta", "number"],
      ["cost", "Costo", "number"],
      ["station", "Estación de cocina"],
      ["trackStock", "Controlar inventario", "checkbox"],
      ["active", "Disponible para venta", "checkbox"],
    ],
    columns: ["name", "category", "price", "cost", "active"],
  },
  categories: {
    title: "Categorías",
    singular: "categoría",
    description: "Un menú fácil de recorrer.",
    permission: "productos",
    fields: [["name", "Nombre"]],
    columns: ["name"],
  },
  modifiers: {
    title: "Modificadores",
    singular: "modificador",
    description: "Adicionales y preferencias para cada pedido.",
    permission: "productos",
    fields: [
      ["name", "Nombre"],
      ["price", "Precio adicional", "number"],
    ],
    columns: ["name", "price"],
  },
  customers: {
    title: "Clientes",
    singular: "cliente",
    description: "Conoce a quienes siempre vuelven.",
    permission: "clientes",
    fields: [
      ["name", "Nombre"],
      ["phone", "Teléfono"],
      ["email", "Correo electrónico", "email"],
      ["document", "Documento"],
      ["notes", "Notas"],
    ],
    columns: ["name", "phone", "email", "document"],
  },
  suppliers: {
    title: "Proveedores",
    singular: "proveedor",
    description: "Las relaciones que mantienen tu negocio en marcha.",
    permission: "compras",
    fields: [
      ["name", "Nombre"],
      ["phone", "Teléfono"],
      ["email", "Correo", "email"],
      ["document", "NIT / Documento"],
    ],
    columns: ["name", "phone", "email", "document"],
  },
  ingredients: {
    title: "Ingredientes",
    singular: "ingrediente",
    description: "La base de tus recetas y de tu inventario.",
    permission: "inventario",
    fields: [
      ["name", "Nombre"],
      ["unit", "Unidad (kg, litro, unidad)"],
      ["cost", "Costo por unidad", "number"],
      ["minimum", "Stock mínimo", "number"],
    ],
    columns: ["name", "unit", "cost", "minimum"],
  },
  branches: {
    title: "Sucursales",
    singular: "sucursal",
    description: "Un mismo negocio, diferentes lugares.",
    permission: "configuracion",
    fields: [
      ["name", "Nombre"],
      ["address", "Dirección"],
      ["phone", "Teléfono"],
    ],
    columns: ["name", "address", "phone"],
  },
  tables: {
    title: "Configurar mesas",
    singular: "mesa",
    description: "Organiza las zonas de tu salón.",
    permission: "mesas",
    fields: [
      ["name", "Nombre"],
      ["zone", "Zona"],
      ["seats", "Puestos", "number"],
      ["status", "Estado", "select", ["LIBRE", "RESERVADA", "FUERA_SERVICIO"]],
    ],
    columns: ["name", "zone", "seats", "status"],
  },
  drivers: {
    title: "Domiciliarios",
    singular: "domiciliario",
    description: "Tu equipo de entregas.",
    permission: "pedidos",
    fields: [
      ["name", "Nombre"],
      ["phone", "Teléfono"],
      ["active", "Activo", "checkbox"],
    ],
    columns: ["name", "phone", "active"],
  },
  registers: {
    title: "Cajas",
    singular: "caja",
    description: "Puntos de cobro de esta sucursal.",
    permission: "caja",
    fields: [["name", "Nombre"]],
    columns: ["name"],
  },
  users: {
    title: "Equipo y permisos",
    singular: "usuario",
    description: "Cada persona, con el acceso que necesita.",
    permission: "usuarios",
    fields: [
      ["name", "Nombre"],
      ["email", "Correo", "email"],
      ["password", "Contraseña (10 caracteres)", "password"],
      [
        "role",
        "Rol",
        "select",
        [
          "ADMIN",
          "GERENTE",
          "SUPERVISOR",
          "CAJERO",
          "MESERO",
          "COCINA",
          "DOMICILIARIO",
          "INVENTARIO",
        ],
      ],
      ["active", "Activo", "checkbox"],
    ],
    columns: ["name", "email", "role", "active"],
  },
};
const fieldLabels: Record<string, string> = {
  name: "Nombre",
  category: "Categoría",
  price: "Precio",
  cost: "Costo",
  active: "Estado",
  phone: "Teléfono",
  email: "Correo electrónico",
  document: "Documento",
  unit: "Unidad",
  minimum: "Mínimo",
  address: "Dirección",
  zone: "Zona",
  seats: "Puestos",
  status: "Estado",
  role: "Rol",
};
export function exportCsv(rows: any[], name: string) {
  const safe = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        typeof v === "string" && /^[=+@\-\t\r]/.test(v) ? "'" + v : v,
      ]),
    ),
  );
  const blob = new Blob(["\uFEFF" + Papa.unparse(safe)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}
export function Catalog({ resource }: any) {
  const d = definitions[resource],
    s = useSession(),
    toast = useToast(),
    qc = useQueryClient();
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<any>(null),
    [config, setConfig] = useState<any>(null),
    [importing, setImporting] = useState<any[] | null>(null),
    [addressCustomer, setAddressCustomer] = useState<any>(null),
    [creditCustomer, setCreditCustomer] = useState<any>(null);
  const input = useRef<HTMLInputElement>(null);
  const q = useQuery({
    queryKey: [resource, s.branchId, search, page],
    queryFn: () =>
      api(
        `${resource}?search=${encodeURIComponent(search)}&page=${page}&limit=20`,
      ),
  });
  const rows = q.data?.data || [];
  async function readFile(file: File) {
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("El archivo supera 10 MB");
      let data: any[];
      if (/\.xlsx$/i.test(file.name)) {
        const ExcelJS = await import("exceljs");
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(await file.arrayBuffer());
        const sheet = book.worksheets[0];
        if (!sheet) throw new Error("El archivo no contiene hojas");
        const headers = (sheet.getRow(1).values as any[]).slice(1).map(String);
        data = [];
        sheet.eachRow((row, n) => {
          if (n > 1)
            data.push(
              Object.fromEntries(
                headers.map((h, i) => [h, row.getCell(i + 1).text]),
              ),
            );
        });
      } else
        data = Papa.parse(await file.text(), {
          header: true,
          skipEmptyLines: true,
        }).data as any[];
      if (data.length > 500)
        throw new Error("Importa máximo 500 filas por archivo");
      setImporting(data);
    } catch (e: any) {
      toast(e.message, true);
    }
  }
  return (
    <>
      <PageTitle
        title={d.title}
        subtitle={
          isStore(s.user) && resource === "products"
            ? "Tus productos y servicios, con todos sus detalles."
            : d.description
        }
        action={
          can(s.user, d.permission + ".crear") && (
            <Button variant="primary" onClick={() => setEditing({})}>
              <Plus size={17} />
              Nuevo {d.singular}
            </Button>
          )
        }
      />
      {resource === "products" && (
        <div className="section-links">
          <Link className="active" to="/app/products">
            {isStore(s.user) ? "Catálogo" : "Menú"}
          </Link>
          <Link to="/app/categories">Categorías</Link>
          <Link to="/app/modifiers">Modificadores</Link>
          <Link to="/app/promotions">Promociones</Link>
          {!isStore(s.user) && (
            <Link to="/app/ingredients">Ingredientes y recetas</Link>
          )}
        </div>
      )}
      {resource === "customers" && <CreditAccounts open={setCreditCustomer} />}
      <div className="panel">
        <div className="table-toolbar">
          <SearchInput
            value={search}
            onChange={(v: string) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={"Buscar " + d.title.toLowerCase() + "…"}
          />
          <div className="button-row">
            <Button
              onClick={() =>
                exportCsv(
                  rows.map((r: any) =>
                    Object.fromEntries(
                      d.fields.map(([key]) => [key, r[key] ?? ""]),
                    ),
                  ),
                  resource,
                )
              }
            >
              <Download size={16} />
              Exportar página
            </Button>
            {["products", "customers", "ingredients"].includes(resource) && (
              <>
                <Button onClick={() => input.current?.click()}>
                  <Upload size={16} />
                  Importar
                </Button>
                <input
                  ref={input}
                  type="file"
                  accept=".csv,.xlsx"
                  hidden
                  onChange={(e) =>
                    e.target.files?.[0] && readFile(e.target.files[0])
                  }
                />
              </>
            )}
          </div>
        </div>
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={q.refetch} />
        ) : rows.length ? (
          <TableScroll>
            <table>
              <thead>
                <tr>
                  {d.columns.map((c) => (
                    <th key={c}>{fieldLabels[c]}</th>
                  ))}
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id}>
                    {d.columns.map((c) => (
                      <td key={c}>
                        {c === "name" ? (
                          <div className="name-cell">
                            {resource === "products" && (
                              <span className="tiny-product">
                                <ProductIcon name={r.name} size={20} />
                              </span>
                            )}
                            <div>
                              <strong>{r[c]}</strong>
                              {resource === "products" && r.trackStock && (
                                <div className="muted">
                                  <small>
                                    {isStore(s.user)
                                      ? "Con inventario"
                                      : r.recipe?.length
                                        ? "Receta activa"
                                        : "Receta pendiente"}
                                  </small>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : ["price", "cost"].includes(c) ? (
                          money(r[c])
                        ) : c === "category" ? (
                          r.category?.name || "Sin categoría"
                        ) : c === "active" ? (
                          <span
                            className={
                              "badge " + (r.active ? "ACTIVA" : "CANCELADO")
                            }
                          >
                            {r.active ? "Activo" : "Inactivo"}
                          </span>
                        ) : c === "status" ? (
                          <Badge value={r[c]} />
                        ) : c === "role" ? (
                          roleLabel(s.user, r[c])
                        ) : (
                          r[c] || "—"
                        )}
                      </td>
                    ))}
                    <td>
                      <div className="button-row">
                        {resource === "customers" &&
                          can(s.user, "clientes.ver") && (
                            <Button onClick={() => setCreditCustomer(r)}>
                              Fiado
                            </Button>
                          )}
                        {resource === "customers" &&
                          can(s.user, "clientes.editar") && (
                            <Button onClick={() => setAddressCustomer(r)}>
                              Direcciones
                            </Button>
                          )}
                        {resource === "products" && (
                          <button
                            className="icon-button"
                            onClick={() => setConfig(r)}
                            aria-label={
                              (isStore(s.user)
                                ? "Variantes de "
                                : "Receta y variantes de ") + r.name
                            }
                          >
                            <Settings2 size={17} />
                          </button>
                        )}
                        <button
                          className="icon-button"
                          onClick={() => setEditing(r)}
                          aria-label={"Editar " + r.name}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : (
          <Empty
            title={"Aún no hay " + d.title.toLowerCase()}
            text={"Crea tu primer " + d.singular + " para empezar."}
          />
        )}
        <div className="pagination">
          <span>{q.data?.meta?.total || 0} registros</span>
          <div>
            <Button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft size={16} />
            </Button>
            <span>Página {page}</span>
            <Button
              disabled={page * 20 >= (q.data?.meta?.total || 0)}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Página siguiente"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>
      {creditCustomer && (
        <CreditDialog
          customer={creditCustomer}
          close={() => setCreditCustomer(null)}
        />
      )}
      {addressCustomer && (
        <AddressForm
          customer={addressCustomer}
          close={() => setAddressCustomer(null)}
        />
      )}
      {editing && (
        <EntityForm
          resource={resource}
          row={editing}
          close={() => setEditing(null)}
        />
      )}{" "}
      {config && <RecipeForm product={config} close={() => setConfig(null)} />}{" "}
      {importing && (
        <ImportDialog
          rows={importing}
          resource={resource}
          close={() => setImporting(null)}
        />
      )}
    </>
  );
}
function EntityForm({ resource, row, close }: any) {
  const d = definitions[resource],
    s = useSession(),
    toast = useToast(),
    qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const store = isStore(s.user);
  const [trackStock, setTrackStock] = useState(Boolean(row.trackStock));
  const [recipe, setRecipe] = useState<RecipeLine[]>(row.recipe ?? []);
  const [branchIds, setBranchIds] = useState<string[]>(
    row.branches?.map((b: any) => b.branchId) || [
      s.branchId || s.user.branches[0].branchId,
    ],
  );
  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: () => get("categories?limit=100"),
    enabled: resource === "products",
  });
  async function submit(e: any) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      body: any = {};
    for (const [key, , type] of d.fields) {
      const raw = fd.get(key);
      if (type === "checkbox") body[key] = raw === "on";
      else if (type === "number") body[key] = Number(raw);
      else if (type === "password") {
        if (raw) body[key] = raw;
      } else body[key] = raw || null;
    }
    if (resource === "products" && store) {
      // La API crea las existencias del producto; la estación de cocina no aplica.
      delete body.station;
      if (trackStock)
        body.lowStockThreshold = Number(fd.get("lowStockThreshold"));
    } else if (resource === "products" && trackStock) {
      body.lowStockThreshold = Number(fd.get("lowStockThreshold"));
      // Sin ingredientes se vende tal cual (una gaseosa): la API crea su existencia por unidad.
      if (!validRecipe(recipe, false)) {
        setError("Completa la receta con ingredientes y cantidades válidas.");
        return;
      }
      if (!row.id || !row.trackStock || recipe !== row.recipe)
        body.recipe = recipe.map(({ ingredientId, quantity }) => ({
          ingredientId,
          quantity,
        }));
    }
    if (resource === "users") body.branchIds = branchIds;
    setBusy(true);
    setError("");
    try {
      await api(
        resource + (row.id ? "/" + row.id : ""),
        body,
        row.id ? "PUT" : "POST",
      );
      qc.invalidateQueries();
      if (resource === "branches") {
        const user = await get("me");
        useSession.setState({ user });
      }
      toast("Cambios guardados");
      close();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${row.id ? "Editar" : "Nuevo"} ${d.singular}`}
      onClose={close}
    >
      <form onSubmit={submit} className="entity-form">
        {d.fields.map(([key, label, type, options]) =>
          store && key === "station" ? null : store && key === "trackStock" ? (
            <fieldset key={key}>
              <legend>Tipo e inventario</legend>
              <label className="checkbox-row">
                <input
                  name={key}
                  type="checkbox"
                  checked={trackStock}
                  onChange={(event) => setTrackStock(event.target.checked)}
                />
                Controlar inventario (producto físico)
              </label>
              <p>
                {trackStock
                  ? "Cada venta descuenta una unidad. Carga existencias en Compras o Inventario."
                  : "Sin inventario: ideal para servicios o productos que no cuentas."}
              </p>
              {trackStock && (
                <Field
                  label="Avisar cuando queden hasta"
                  name="lowStockThreshold"
                  type="number"
                  min={0}
                  max={2147483647}
                  step={1}
                  defaultValue={row.lowStockThreshold ?? 3}
                  required
                />
              )}
            </fieldset>
          ) : key === "trackStock" ? (
            <fieldset key={key}>
              <legend>Receta e inventario</legend>
              <label className="checkbox-row">
                <input
                  name={key}
                  type="checkbox"
                  checked={trackStock}
                  onChange={(event) => setTrackStock(event.target.checked)}
                />
                {label}
              </label>
              {trackStock && (
                <>
                  <p>
                    Si se prepara, indica cuánto ingrediente usa cada unidad. Si
                    se vende tal cual, como una gaseosa, déjalo sin
                    ingredientes: se contará por unidad. El stock se descuenta
                    al cobrar.
                  </p>
                  <RecipeEditor recipe={recipe} setRecipe={setRecipe} />
                  <Field
                    label="Avisar cuando queden hasta"
                    name="lowStockThreshold"
                    type="number"
                    min={0}
                    max={2147483647}
                    step={1}
                    defaultValue={row.lowStockThreshold ?? 3}
                    required
                    aria-describedby="recipe-stock-threshold-help"
                  />
                  <p id="recipe-stock-threshold-help">
                    Unidades que se pueden preparar. Usa 0 para desactivar el
                    aviso de pocas unidades.
                  </p>
                </>
              )}
            </fieldset>
          ) : (
            <Field key={key} label={label}>
              {type === "select" ? (
                <select name={key} defaultValue={row[key] || ""}>
                  {typeof options === "string" ? (
                    <>
                      <option value="">Sin categoría</option>
                      {cats.data?.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </>
                  ) : key === "role" ? (
                    roleOptions(s.user, row.role).map((v) => (
                      <option key={v} value={v}>
                        {roleLabel(s.user, v)}
                      </option>
                    ))
                  ) : (
                    options.map((v: string) => (
                      <option key={v} value={v}>
                        {labels[v] ?? v}
                      </option>
                    ))
                  )}
                </select>
              ) : type === "checkbox" ? (
                <input
                  name={key}
                  type="checkbox"
                  defaultChecked={row[key] ?? key === "active"}
                />
              ) : (
                <input
                  name={key}
                  type={type || "text"}
                  defaultValue={
                    type === "password"
                      ? ""
                      : (row[key] ??
                        (type === "number"
                          ? 0
                          : key === "station"
                            ? "Cocina"
                            : key === "zone"
                              ? "Salón principal"
                              : ""))
                  }
                  min={type === "number" ? 0 : undefined}
                  step={resource === "ingredients" ? "any" : "1"}
                  minLength={type === "password" ? 10 : undefined}
                  required={
                    [
                      "name",
                      "price",
                      "unit",
                      "email",
                      "seats",
                      "zone",
                    ].includes(key) &&
                    (key !== "email" || resource === "users")
                  }
                />
              )}
            </Field>
          ),
        )}
        {resource === "users" && (
          <fieldset>
            <legend>Sucursales autorizadas</legend>
            {s.user.branches.map((b: any) => (
              <label className="checkbox-row" key={b.branchId}>
                <input
                  type="checkbox"
                  checked={branchIds.includes(b.branchId)}
                  onChange={(e) =>
                    setBranchIds(
                      e.target.checked
                        ? [...branchIds, b.branchId]
                        : branchIds.filter((id) => id !== b.branchId),
                    )
                  }
                />
                {b.branch.name}
              </label>
            ))}
            <small>El rol determina los permisos operativos.</small>
          </fieldset>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row end">
          <Button type="button" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
type RecipeLine = { ingredientId: string; quantity: number };
type RecipeIngredient = { id: string; name: string; unit: string };

function validRecipe(recipe: RecipeLine[], trackStock: boolean) {
  return (
    (!trackStock || recipe.length > 0) &&
    recipe.every(
      (item) =>
        item.ingredientId &&
        item.quantity > 0 &&
        Number.isFinite(item.quantity),
    ) &&
    new Set(recipe.map((item) => item.ingredientId)).size === recipe.length
  );
}

function RecipeEditor({
  recipe,
  setRecipe,
}: {
  recipe: RecipeLine[];
  setRecipe: React.Dispatch<React.SetStateAction<RecipeLine[]>>;
}) {
  const ingredients = useQuery({
    queryKey: ["ingredients", "recipe-options"],
    queryFn: async (): Promise<RecipeIngredient[]> => {
      const first = await api("ingredients?limit=100");
      const remaining = await Promise.all(
        Array.from(
          { length: Math.max(0, Math.ceil(first.meta.total / 100) - 1) },
          (_, index) => get("ingredients?limit=100&page=" + (index + 2)),
        ),
      );
      return first.data.concat(...remaining);
    },
  });
  return (
    <>
      {ingredients.isPending && <p role="status">Cargando ingredientes…</p>}
      {ingredients.error && (
        <ErrorBox error={ingredients.error} retry={ingredients.refetch} />
      )}
      {ingredients.data?.length === 0 && (
        <p>Crea ingredientes en Inventario para usarlos en esta receta.</p>
      )}
      {recipe.map((r, i) => (
        <div className="form-row" key={i}>
          <Field label="Ingrediente">
            <select
              aria-label="Ingrediente"
              value={r.ingredientId}
              onChange={(e) =>
                setRecipe((v) =>
                  v.map((x, n) =>
                    n === i ? { ...x, ingredientId: e.target.value } : x,
                  ),
                )
              }
            >
              <option value="">Seleccionar</option>
              {ingredients.data?.map((g) => (
                <option
                  key={g.id}
                  value={g.id}
                  disabled={recipe.some(
                    (item, index) => index !== i && item.ingredientId === g.id,
                  )}
                >
                  {g.name} ({g.unit})
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Cantidad por producto"
            type="number"
            min="0.001"
            step="any"
            value={r.quantity}
            onChange={(e: any) =>
              setRecipe((v) =>
                v.map((x, n) =>
                  n === i ? { ...x, quantity: Number(e.target.value) } : x,
                ),
              )
            }
          />
          <Button
            type="button"
            onClick={() => setRecipe((v) => v.filter((_, n) => n !== i))}
          >
            Quitar
          </Button>
        </div>
      ))}
      <Button
        type="button"
        disabled={
          !ingredients.data?.length || recipe.length >= ingredients.data.length
        }
        onClick={() =>
          setRecipe((v) => [...v, { ingredientId: "", quantity: 1 }])
        }
      >
        <Plus size={16} />
        Agregar ingrediente
      </Button>
    </>
  );
}

function RecipeForm({ product, close }: any) {
  const qc = useQueryClient(),
    toast = useToast(),
    user = useSession((s) => s.user),
    store = isStore(user);
  const [recipe, setRecipe] = useState<RecipeLine[]>(product.recipe || []),
    [variants, setVariants] = useState<any[]>(product.variants || []),
    [prices, setPrices] = useState<any[]>(product.prices || []),
    [mods, setMods] = useState<string[]>(
      product.modifiers.map((m: any) => m.modifierId),
    ),
    [busy, setBusy] = useState(false);
  const modifiers = useQuery({
    queryKey: ["modifiers"],
    queryFn: () => get("modifiers?limit=100"),
  });
  return (
    <Modal
      title={(store ? "Variantes de " : "Preparación de ") + product.name}
      subtitle={
        store
          ? "Presentaciones, adicionales y precios por servicio."
          : "La receta se descuenta del stock al cobrar, si el producto controla inventario."
      }
      onClose={close}
      wide
    >
      {!store && (
        <>
          <h3>Receta</h3>
          <RecipeEditor recipe={recipe} setRecipe={setRecipe} />
        </>
      )}
      <h3>Variantes</h3>
      {variants.map((r, i) => (
        <div className="form-row" key={i}>
          <Field
            label="Presentación"
            value={r.name}
            onChange={(e: any) =>
              setVariants((v) =>
                v.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)),
              )
            }
          />
          <Field
            label="Precio"
            type="number"
            min="0"
            value={r.price}
            onChange={(e: any) =>
              setVariants((v) =>
                v.map((x, n) =>
                  n === i ? { ...x, price: Number(e.target.value) } : x,
                ),
              )
            }
          />
          <Button
            onClick={() => setVariants((v) => v.filter((_, n) => n !== i))}
          >
            Quitar
          </Button>
        </div>
      ))}
      <Button
        onClick={() =>
          setVariants((v) => [...v, { name: "", price: product.price }])
        }
      >
        <Plus size={16} />
        Agregar variante
      </Button>
      <h3>Precios por servicio</h3>
      {prices.map((r, i) => (
        <div className="form-row" key={i}>
          <Field label="Servicio">
            <select
              value={r.service}
              onChange={(e) =>
                setPrices((v) =>
                  v.map((x, n) =>
                    n === i ? { ...x, service: e.target.value } : x,
                  ),
                )
              }
            >
              {/* Conserva un servicio guardado aunque ya no aplique, para no mostrar otro. */}
              {[...new Set([...posServices(user), r.service])].map((t) => (
                <option key={t} value={t}>
                  {serviceLabel(user, t)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Precio"
            type="number"
            value={r.price}
            onChange={(e: any) =>
              setPrices((v) =>
                v.map((x, n) =>
                  n === i ? { ...x, price: Number(e.target.value) } : x,
                ),
              )
            }
          />
          <Button onClick={() => setPrices((v) => v.filter((_, n) => n !== i))}>
            Quitar
          </Button>
        </div>
      ))}
      <Button
        onClick={() =>
          setPrices((v) => [
            ...v,
            { service: "DOMICILIO", price: product.price },
          ])
        }
      >
        <Plus size={16} />
        Agregar precio
      </Button>
      <h3>Modificadores permitidos</h3>
      {modifiers.data?.map((m: any) => (
        <label className="checkbox-row" key={m.id}>
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
          {m.name} · {money(m.price)}
        </label>
      ))}
      <div className="modal-actions">
        <Button
          variant="primary"
          disabled={
            busy || (!store && !validRecipe(recipe, product.trackStock))
          }
          onClick={async () => {
            setBusy(true);
            try {
              await api(`products/${product.id}/config`, {
                recipe: recipe.map(({ ingredientId, quantity }) => ({
                  ingredientId,
                  quantity,
                })),
                variants: variants.map(({ name, price }) => ({ name, price })),
                prices: prices.map(({ service, price }) => ({
                  service,
                  price,
                })),
                modifierIds: mods,
              });
              qc.invalidateQueries();
              toast("Receta y opciones guardadas");
              close();
            } catch (e: any) {
              toast(e.message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          Guardar configuración
        </Button>
      </div>
    </Modal>
  );
}
function ImportDialog({ rows, resource, close }: any) {
  const toast = useToast(),
    qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [results, setResults] = useState<string[]>([]);
  const d = definitions[resource];
  async function run() {
    setBusy(true);
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const body: any = {};
        for (const [key, , type] of d.fields) {
          if (rows[i][key] !== undefined)
            body[key] =
              type === "number"
                ? Number(rows[i][key])
                : type === "checkbox"
                  ? ["true", "1", "sí"].includes(
                      String(rows[i][key]).toLowerCase(),
                    )
                  : rows[i][key];
        }
        await api(resource, body);
      } catch (e: any) {
        out.push(`Fila ${i + 2}: ${e.message}`);
      }
    }
    setResults(out);
    qc.invalidateQueries();
    setBusy(false);
    toast(`${rows.length - out.length} registros importados`);
    if (!out.length) close();
  }
  return (
    <Modal
      title="Revisar importación"
      subtitle={`${rows.length} filas · ${d.title}`}
      onClose={close}
    >
      <p>
        Usa estos encabezados:{" "}
        <code>{d.fields.map((f) => f[0]).join(", ")}</code>
      </p>
      <p>
        Se crean registros nuevos. Las filas inválidas se informan sin
        reemplazar registros existentes.
      </p>
      {results.length ? (
        <div className="form-error">
          {results.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      ) : (
        <pre className="import-preview">
          {JSON.stringify(rows.slice(0, 3), null, 2)}
        </pre>
      )}
      <Button
        variant="primary"
        disabled={busy || results.length > 0}
        onClick={run}
      >
        {busy ? "Importando…" : "Importar registros"}
      </Button>
    </Modal>
  );
}

function AddressForm({ customer, close }: any) {
  const [addresses, setAddresses] = useState<any[]>(customer.addresses || []);
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient(),
    toast = useToast();
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    setBusy(true);
    try {
      const { data } = await api("customers/" + customer.id + "/addresses", {
        ...fields,
        ...(editing ? { id: editing.id } : {}),
      });
      setAddresses((rows) =>
        editing
          ? rows.map((row) => (row.id === data.id ? data : row))
          : [...rows, data],
      );
      form.reset();
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast("Dirección guardada");
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={"Direcciones de " + customer.name} onClose={close}>
      {addresses.map((row) => (
        <div className="integration-row" key={row.id}>
          <div>
            <strong>{row.label}</strong>
            <p>{row.address}</p>
          </div>
          <Button onClick={() => setEditing(row)}>Editar</Button>
        </div>
      ))}
      <form key={editing?.id || "new"} onSubmit={save}>
        <h3>{editing ? "Editar dirección" : "Nueva dirección"}</h3>
        <Field
          label="Nombre de la dirección"
          name="label"
          defaultValue={editing?.label || ""}
          maxLength={100}
          required
        />
        <Field
          label="Dirección"
          name="address"
          defaultValue={editing?.address || ""}
          minLength={5}
          maxLength={191}
          required
        />
        <div className="button-row">
          {editing && (
            <Button type="button" onClick={() => setEditing(null)}>
              Cancelar edición
            </Button>
          )}
          <Button variant="primary" disabled={busy}>
            Guardar dirección
          </Button>
        </div>
      </form>
    </Modal>
  );
}
