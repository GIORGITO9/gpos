import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db, transaction } from "./db";
import { audit, roles, passwordSchema } from "./auth";
import { serviceAllowed } from "./domain";
const text = z.string().trim().min(1).max(200),
  optional = z.string().trim().max(500).nullish();
export const money = z.number().int().min(0).max(1000000000);
export const recipeSchema = z.array(
  z.object({
    ingredientId: z.string().min(1),
    quantity: z.number().positive(),
  }),
);
export async function validateRecipe(
  tx: Prisma.TransactionClient,
  tenantId: string,
  recipe: z.infer<typeof recipeSchema>,
) {
  const ids = recipe.map((item) => item.ingredientId);
  if (new Set(ids).size !== ids.length)
    throw new BadRequestException(
      "Cada ingrediente debe aparecer una sola vez en la receta",
    );
  if (
    ids.length &&
    (await tx.ingredient.count({ where: { tenantId, id: { in: ids } } })) !==
      ids.length
  )
    throw new BadRequestException("Ingrediente inválido");
}
export const schemas: Record<string, z.ZodTypeAny> = {
  products: z.object({
    name: text,
    description: optional,
    categoryId: optional,
    sku: optional,
    barcode: optional,
    price: money,
    cost: money.default(0),
    station: text.default("Cocina"),
    trackStock: z.boolean().default(false),
    lowStockThreshold: z.number().int().min(0).max(2147483647).optional(),
    recipe: recipeSchema.optional(),
    active: z.boolean().default(true),
  }),
  categories: z.object({ name: text }),
  modifiers: z.object({ name: text, price: money }),
  customers: z.object({
    name: text,
    phone: optional,
    email: z.union([z.string().email(), z.literal("")]).nullish(),
    document: optional,
    notes: optional,
  }),
  suppliers: z.object({
    name: text,
    phone: optional,
    email: optional,
    document: optional,
  }),
  ingredients: z.object({
    name: text,
    unit: text,
    cost: money,
    minimum: z.number().min(0),
  }),
  branches: z.object({ name: text, address: optional, phone: optional }),
  tables: z.object({
    name: text,
    zone: text,
    seats: z.number().int().min(1).max(100),
    status: z.enum(["LIBRE", "RESERVADA", "FUERA_SERVICIO"]).default("LIBRE"),
  }),
  drivers: z.object({
    name: text,
    phone: optional,
    active: z.boolean().default(true),
  }),
  registers: z.object({ name: text }),
  promotions: z
    .object({
      name: text,
      type: z.enum(["NXM", "PORCENTAJE"]),
      buy: z.number().int().min(0).max(20).default(0),
      pay: z.number().int().min(0).max(19).default(0),
      percent: z.number().int().min(0).max(100).default(0),
      productIds: z.array(z.string().min(1)).max(300).default([]),
      days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
      startTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usa el formato HH:MM")
        .nullish(),
      endTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usa el formato HH:MM")
        .nullish(),
      active: z.boolean().default(true),
    })
    .refine((p) => p.type !== "NXM" || (p.buy >= 2 && p.buy > p.pay), {
      message: "En «lleva N, paga M», N debe ser mayor que M",
    })
    .refine((p) => p.type !== "PORCENTAJE" || p.percent > 0, {
      message: "Indica el porcentaje de descuento",
    })
    .refine((p) => !p.startTime === !p.endTime, {
      message: "Indica la hora de inicio y la de fin",
    }),
  reservations: z.object({
    name: text,
    phone: optional,
    partySize: z.number().int().min(1).max(200),
    at: z.string().datetime({ offset: true }),
    tableId: optional,
    notes: optional,
    status: z
      .enum(["PENDIENTE", "LLEGO", "CANCELADA", "NO_ASISTIO"])
      .default("PENDIENTE"),
  }),
  users: z.object({
    name: text,
    email: z.string().email(),
    password: passwordSchema.optional(),
    role: z.enum([
      "ADMIN",
      "GERENTE",
      "SUPERVISOR",
      "CAJERO",
      "MESERO",
      "COCINA",
      "DOMICILIARIO",
      "INVENTARIO",
    ]),
    branchIds: z.array(text).min(1),
    active: z.boolean().default(true),
  }),
};
export const resources: Record<
  string,
  { model: string; permission: string; branch?: boolean; include?: any }
> = {
  products: {
    model: "product",
    permission: "productos",
    include: {
      category: true,
      variants: true,
      modifiers: { include: { modifier: true } },
      recipe: { include: { ingredient: true } },
      prices: true,
    },
  },
  categories: { model: "category", permission: "productos" },
  modifiers: { model: "modifier", permission: "productos" },
  customers: {
    model: "customer",
    permission: "clientes",
    include: { addresses: true },
  },
  suppliers: { model: "supplier", permission: "compras" },
  ingredients: { model: "ingredient", permission: "inventario" },
  branches: { model: "branch", permission: "configuracion" },
  tables: { model: "diningTable", permission: "mesas", branch: true },
  drivers: { model: "driver", permission: "pedidos", branch: true },
  registers: { model: "cashRegister", permission: "caja", branch: true },
  promotions: { model: "promotion", permission: "productos" },
  reservations: {
    model: "reservation",
    permission: "mesas",
    branch: true,
    include: { table: { select: { name: true } } },
  },
  users: { model: "user", permission: "usuarios", include: { branches: true } },
};
export function scope(resource: string, u: any, branchId: string) {
  return resources[resource].branch ? { branchId } : { tenantId: u.tenantId };
}
export async function list(resource: string, u: any, branchId: string, q: any) {
  const r = resources[resource];
  if (!r) throw new NotFoundException();
  const page = Math.max(1, Number(q.page) || 1),
    limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
  const where: any = scope(resource, u, branchId);
  if (resource === "branches")
    where.id = { in: u.branches.map((b: any) => b.branchId) };
  if (q.search)
    where.OR = [
      "name",
      ...(resource === "products"
        ? ["sku", "barcode"]
        : resource === "customers"
          ? ["phone", "document"]
          : []),
    ].map((k) => ({ [k]: { contains: String(q.search) } }));
  // Reservas de un día (hora de Colombia), en orden de llegada.
  if (resource === "reservations" && /^\d{4}-\d{2}-\d{2}$/.test(String(q.date)))
    where.at = {
      gte: new Date(q.date + "T00:00:00-05:00"),
      lte: new Date(q.date + "T23:59:59.999-05:00"),
    };
  const model = (db as any)[r.model];
  const withAvailability = resource === "products" && q.availability === "true";
  const [rows, total] = await Promise.all([
    model.findMany({
      where,
      include: r.include,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: resource === "reservations" ? { at: "asc" } : { name: "asc" },
    }),
    model.count({ where }),
  ]);
  const ingredientIds = new Set<string>();
  if (withAvailability)
    for (const product of rows)
      if (product.trackStock) {
        for (const item of product.recipe) ingredientIds.add(item.ingredientId);
        for (const variant of product.variants)
          if (variant.ingredientId) ingredientIds.add(variant.ingredientId);
      }
  const balances = ingredientIds.size
    ? await db.inventory.findMany({
        where: { branchId, ingredientId: { in: [...ingredientIds] } },
        select: { ingredientId: true, quantity: true },
      })
    : [];
  const stock = new Map(
    balances.map(({ ingredientId, quantity }) => [ingredientId, quantity]),
  );
  return {
    data: rows.map((v: any) => {
      delete v.passwordHash;
      if (withAvailability && v.trackStock) {
        let availableUnits = Infinity;
        let limitingIngredients: string[] = [];
        let limitingIngredientIds: string[] = [];
        const missingIngredients: string[] = [];
        for (const item of v.recipe) {
          const units = Math.max(
            0,
            Math.floor((stock.get(item.ingredientId) ?? 0) / item.quantity),
          );
          if (units < availableUnits) {
            availableUnits = units;
            limitingIngredients = [];
            limitingIngredientIds = [];
          }
          if (units === availableUnits) {
            limitingIngredients.push(item.ingredient.name);
            limitingIngredientIds.push(item.ingredientId);
          }
          if (units === 0) missingIngredients.push(item.ingredient.name);
        }
        v.availableUnits = v.recipe.length ? availableUnits : null;
        v.limitingIngredients = limitingIngredients;
        v.limitingIngredientIds = limitingIngredientIds;
        v.missingIngredients = missingIngredients;
        v.recipe = v.recipe.map((item: any) => ({
          ...item,
          branchStock: stock.get(item.ingredientId) ?? 0,
        }));
        // Con stock por variante, el producto suma las unidades de sus variantes.
        if (v.variants.some((x: any) => x.ingredientId)) {
          v.variants = v.variants.map((x: any) => ({
            ...x,
            availableUnits: x.ingredientId
              ? Math.max(0, Math.floor(stock.get(x.ingredientId) ?? 0))
              : null,
          }));
          v.availableUnits = v.variants.reduce(
            (n: number, x: any) => n + (x.availableUnits ?? 0),
            0,
          );
        }
      }
      return v;
    }),
    meta: { page, limit, total },
  };
}
export async function save(
  resource: string,
  id: string | undefined,
  body: any,
  u: any,
  branchId: string,
) {
  const r = resources[resource];
  const data: any = schemas[resource].parse(body);
  return transaction(async (tx) => {
    const model = (tx as any)[r.model];
    if (
      id &&
      !(await model.findFirst({
        where: { id, ...scope(resource, u, branchId) },
      }))
    )
      throw new NotFoundException();
    if (
      resource === "products" &&
      data.categoryId &&
      !(await tx.category.findFirst({
        where: { id: data.categoryId, tenantId: u.tenantId },
      }))
    )
      throw new BadRequestException("Categoría inválida");
    const store = u.tenant.businessType === "TIENDA";
    if (resource === "products" && store) delete data.recipe;
    // Producto que se vende tal cual (toda la tienda; en restaurante, una gaseosa sin receta):
    // su stock es un ingrediente espejo 1:1, así compras e inventario se reutilizan.
    const resale =
      resource === "products" &&
      data.trackStock &&
      (store || (Array.isArray(data.recipe) && !data.recipe.length));
    if (resale) {
      delete data.recipe;
      const current = id
        ? await tx.product.findUnique({
            where: { id },
            include: { recipe: { include: { ingredient: true } } },
          })
        : null;
      const stockData = {
        name: data.name,
        cost: data.cost,
        minimum: data.lowStockThreshold ?? 3,
      };
      const [line] = current?.recipe ?? [];
      // Espejo propio: único ítem ×1, mismo nombre y ningún otro producto lo usa.
      const ownMirror =
        current?.recipe.length === 1 &&
        line.quantity === 1 &&
        line.ingredient.name === current.name &&
        !(await tx.recipeItem.count({
          where: { ingredientId: line.ingredientId, productId: { not: id } },
        }));
      if (ownMirror)
        await tx.ingredient.update({
          where: { id: line.ingredientId },
          data: stockData,
        });
      // Sin receta: crea su espejo. En tienda, una receta de restaurante o compartida no se toca;
      // en restaurante, quitar todos los ingredientes la reemplaza por el espejo.
      else if (!current?.recipe.length || !store) {
        if (current?.recipe.length)
          await tx.recipeItem.deleteMany({ where: { productId: id } });
        const ingredient = await tx.ingredient.create({
          data: { ...stockData, tenantId: u.tenantId, unit: "unidad" },
        });
        data.recipe = {
          create: [{ ingredientId: ingredient.id, quantity: 1 }],
        };
      }
    } else if (resource === "products" && data.recipe !== undefined) {
      const recipe = data.recipe;
      await validateRecipe(tx, u.tenantId, recipe);
      if (id) await tx.recipeItem.deleteMany({ where: { productId: id } });
      data.recipe = { create: recipe };
    }
    if (
      resource === "promotions" &&
      data.productIds.length &&
      (await tx.product.count({
        where: { tenantId: u.tenantId, id: { in: data.productIds } },
      })) !== new Set(data.productIds).size
    )
      throw new BadRequestException("Producto inválido en la promoción");
    if (resource === "reservations") {
      if (!serviceAllowed(u.tenant, "MESA"))
        throw new BadRequestException("Tu negocio no usa mesas");
      if (
        data.tableId &&
        !(await tx.diningTable.findFirst({
          where: { id: data.tableId, branchId },
        }))
      )
        throw new BadRequestException("Mesa inválida");
      data.tableId ||= null;
    }
    if (resource === "tables" && id) {
      const active = await tx.order.count({
        where: {
          tableId: id,
          status: { notIn: ["CERRADO", "CANCELADO", "BORRADOR"] },
        },
      });
      if (active)
        throw new BadRequestException("La mesa tiene un pedido activo");
    }
    if (resource === "users") {
      if (id === u.id)
        throw new BadRequestException("No puedes cambiar tu propio acceso");
      // Un administrador no puede tomar ni degradar la cuenta del propietario.
      if (
        id &&
        u.role !== "OWNER" &&
        (await tx.user.count({
          where: { id, tenantId: u.tenantId, role: "OWNER" },
        }))
      )
        throw new ForbiddenException(
          "Solo el propietario puede modificar su cuenta",
        );
      const branches = await tx.branch.findMany({
        where: {
          id: { in: data.branchIds },
          tenantId: u.tenantId,
          active: true,
        },
      });
      if (branches.length !== data.branchIds.length)
        throw new BadRequestException("Sucursal inválida");
      data.branches = {
        ...(id ? { deleteMany: {} } : {}),
        create: data.branchIds.map((branchId: string) => ({ branchId })),
      };
      delete data.branchIds;
      if (!id && !data.password)
        throw new BadRequestException("La contraseña es obligatoria");
      if (data.password)
        data.passwordHash = await bcrypt.hash(data.password, 12);
      delete data.password;
      data.permissions = roles[data.role];
      data.email = data.email.toLowerCase();
    }
    if (!id) {
      const limits = u.tenant.subscription.plan.limits as any;
      const key =
        resource === "branches"
          ? "branches"
          : resource === "users"
            ? "users"
            : resource === "products"
              ? "products"
              : resource === "registers"
                ? "registers"
                : null;
      if (key && limits[key] > 0) {
        const count = await model.count({
          where:
            resource === "registers"
              ? { branch: { tenantId: u.tenantId } }
              : { tenantId: u.tenantId },
        });
        if (count >= limits[key])
          throw new ForbiddenException("Límite del plan alcanzado");
      }
    }
    const row = id
      ? await model.update({ where: { id }, data })
      : await model.create({
          data: { ...data, ...scope(resource, u, branchId) },
        });
    if (resource === "users" && id) {
      await tx.passwordReset.deleteMany({ where: { userId: id } });
      if (data.passwordHash)
        await tx.refreshSession.deleteMany({ where: { userId: id } });
    }
    if (resource === "branches" && !id) {
      await tx.userBranch.create({ data: { userId: u.id, branchId: row.id } });
      await tx.cashRegister.create({
        data: { branchId: row.id, name: "Caja principal" },
      });
    }
    await audit(tx, u, id ? "UPDATE" : "CREATE", resource, row.id);
    delete row.passwordHash;
    return row;
  });
}
export async function remove(
  resource: string,
  id: string,
  u: any,
  branchId: string,
) {
  if (resource !== "products")
    throw new BadRequestException(
      "Este registro no se elimina para conservar el histórico",
    );
  const found = await db.product.findFirst({
    where: { id, tenantId: u.tenantId },
  });
  if (!found) throw new NotFoundException();
  return transaction(async (tx) => {
    await audit(tx, u, "DELETE", resource, id);
    return tx.product.update({ where: { id }, data: { active: false } });
  });
}
