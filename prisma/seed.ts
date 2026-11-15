import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
async function main() {
  for (const p of [
    {
      name: "Starter",
      price: 0,
      features: ["pos", "tables", "kitchen", "reports"],
      limits: { branches: 1, users: 5, registers: 1, products: 500 },
    },
    {
      name: "Professional",
      price: 0,
      features: [
        "pos",
        "tables",
        "kitchen",
        "reports",
        "inventory",
        "purchases",
        "delivery",
        "recipes",
      ],
      limits: { branches: 3, users: 20, registers: 5, products: 0 },
    },
    {
      name: "Business",
      price: 0,
      features: [
        "pos",
        "tables",
        "kitchen",
        "reports",
        "inventory",
        "purchases",
        "delivery",
        "recipes",
        "api",
      ],
      limits: { branches: 0, users: 0, registers: 0, products: 0 },
    },
  ])
    await db.plan.upsert({ where: { name: p.name }, update: {}, create: p });
  if (process.env.SEED_DEMO !== "true") {
    console.log("Planes creados. Precios pendientes de configuración.");
    return;
  }
  if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 10)
    throw new Error("Configura DEMO_PASSWORD (10 caracteres mínimo)");
  if (await db.user.findUnique({ where: { email: "demo@gpos.local" } })) {
    console.log("Demostración ya existe");
    return;
  }
  const plan = await db.plan.findUniqueOrThrow({
    where: { name: "Professional" },
  });
  const tenant = await db.tenant.create({
    data: {
      name: "La Buena Mesa · Demo",
      email: "demo@gpos.local",
      subscription: {
        create: {
          planId: plan.id,
          status: "TRIAL",
          renewsAt: new Date(Date.now() + 14 * 86400000),
        },
      },
    },
  });
  const branch = await db.branch.create({
    data: {
      tenantId: tenant.id,
      name: "Chapinero",
      address: "Bogotá · Datos de demostración",
    },
  });
  const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD, 12);
  const user = await db.user.create({
    data: {
      tenantId: tenant.id,
      name: "Valentina",
      email: "demo@gpos.local",
      passwordHash,
      role: "OWNER",
      permissions: ["*"],
      branches: { create: { branchId: branch.id } },
    },
  });
  const register = await db.cashRegister.create({
    data: { branchId: branch.id, name: "Caja principal" },
  });
  await db.cashSession.create({
    data: { registerId: register.id, userId: user.id, opening: 150000 },
  });
  for (let n = 1; n <= 12; n++)
    await db.diningTable.create({
      data: {
        branchId: branch.id,
        name: `Mesa ${String(n).padStart(2, "0")}`,
        zone: n > 8 ? "Terraza" : "Salón principal",
        seats: n % 3 === 0 ? 6 : 4,
      },
    });
  const cats = [
    "Hamburguesas",
    "Pizzas",
    "Para compartir",
    "Bebidas",
    "Postres",
  ];
  const categories = await Promise.all(
    cats.map((name) =>
      db.category.create({ data: { tenantId: tenant.id, name } }),
    ),
  );
  const products = [
    [
      "Burger de la casa",
      24900,
      0,
      "Carne artesanal, queso cheddar y salsa de la casa.",
    ],
    ["Burger de pollo", 22900, 0, "Pollo crujiente, lechuga fresca y alioli."],
    ["Burger veggie", 23900, 0, "Portobello, queso y vegetales asados."],
    ["Pizza margarita", 32900, 1, "Tomate, mozzarella y albahaca fresca."],
    ["Pizza pepperoni", 36900, 1, "Mozzarella y pepperoni al horno."],
    ["Papas rústicas", 12900, 2, "Papas con piel, romero y salsa de ajo."],
    ["Nachos para dos", 21900, 2, "Totopos, guacamole, queso y pico de gallo."],
    ["Limonada natural", 8900, 3, "Limón recién exprimido."],
    ["Té de frutos rojos", 9900, 3, "Infusión fría de frutos rojos."],
    ["Café americano", 5900, 3, "Café colombiano de origen."],
    [
      "Brownie de chocolate",
      12900,
      4,
      "Chocolate oscuro y helado de vainilla.",
    ],
    [
      "Cheesecake de frutos",
      14900,
      4,
      "Queso suave y compota de frutos rojos.",
    ],
  ];
  for (const [name, price, cat, description] of products)
    await db.product.create({
      data: {
        tenantId: tenant.id,
        name: String(name),
        price: Number(price),
        cost: Math.round(Number(price) * 0.35),
        categoryId: categories[Number(cat)].id,
        description: String(description),
        sku: `P${products.findIndex((p) => p[0] === name) + 1}`,
        station: Number(cat) === 3 ? "Bar" : "Cocina",
      },
    });
  for (const [name, unit, quantity, minimum, cost] of [
    ["Carne de res", "kg", 12, 5, 28000],
    ["Pan brioche", "unidad", 45, 20, 1800],
    ["Queso cheddar", "kg", 2, 3, 22000],
    ["Papa", "kg", 18, 5, 4500],
  ]) {
    const i = await db.ingredient.create({
      data: {
        tenantId: tenant.id,
        name: String(name),
        unit: String(unit),
        minimum: Number(minimum),
        cost: Number(cost),
      },
    });
    await db.inventory.create({
      data: {
        branchId: branch.id,
        ingredientId: i.id,
        quantity: Number(quantity),
      },
    });
  }
  for (const [name, price] of [
    ["Extra queso", 3000],
    ["Tocineta", 4000],
    ["Sin cebolla", 0],
  ]) {
    const m = await db.modifier.create({
      data: { tenantId: tenant.id, name: String(name), price: Number(price) },
    });
    const ps = await db.product.findMany({
      where: { tenantId: tenant.id, categoryId: categories[0].id },
    });
    for (const p of ps)
      await db.productModifier.create({
        data: { productId: p.id, modifierId: m.id },
      });
  }
  for (const name of ["Laura Martínez", "Andrés López", "Camila Torres"])
    await db.customer.create({
      data: { tenantId: tenant.id, name, phone: "3000000000" },
    });
  await db.supplier.create({
    data: {
      tenantId: tenant.id,
      name: "Proveedor de demostración",
      phone: "3000000000",
    },
  });
  await db.driver.create({
    data: { branchId: branch.id, name: "Daniel · Demo", phone: "3000000000" },
  });
  console.log(
    "Datos de demostración creados: demo@gpos.local. Contraseña: la configurada en DEMO_PASSWORD.",
  );
}
main().finally(() => db.$disconnect());
