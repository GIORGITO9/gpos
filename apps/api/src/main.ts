import "reflect-metadata";
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import {
  Module,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  Res,
  Query,
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { Request, Response } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import { db, transaction } from "./db";
import {
  authAction,
  trialDays,
  identity,
  branchFor,
  platformIdentity,
  audit,
} from "./auth";
import { resources, list, save, remove } from "./catalog";
import * as op from "./operations";
import { allowed } from "./domain";
import { terms } from "./legal-terms";
import * as complaints from "./complaints";
import {
  adminActivity,
  adminCompanies,
  adminOverview,
  planInput,
} from "./admin";
@Catch()
class Errors implements ExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      e instanceof ZodError
        ? 400
        : e instanceof HttpException
          ? e.getStatus()
          : e.code === "P2002"
            ? 409
            : e.code === "P2003"
              ? 400
              : 500;
    const message =
      e instanceof ZodError
        ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : e instanceof HttpException
          ? e.message
          : e.code === "P2002"
            ? "El registro ya existe"
            : e.code === "P2003"
              ? "El registro está relacionado con otras operaciones"
              : "No fue posible completar la operación";
    if (status === 500) console.error(e);
    res.status(status).json({
      success: false,
      message,
      code:
        status === 403
          ? "FORBIDDEN"
          : status === 401
            ? "UNAUTHORIZED"
            : String(status),
    });
  }
}
function ok(data: any) {
  return { success: true, data };
}
async function ctx(req: Request, permission?: string) {
  const u = await identity(req, permission);
  return { u, branchId: await branchFor(req, u) };
}
function feature(u: any, name: string) {
  if (!(u.tenant.subscription.plan.features as string[]).includes(name))
    throw new ForbiddenException("Función no incluida en tu plan");
}
@Controller("api/v1")
class Api {
  @Get("health") health() {
    return ok({ status: "ok" });
  }
  @Get("plans") async plans() {
    const plans = await db.plan.findMany({
      where: { availableForSignup: true },
      select: {
        id: true,
        name: true,
        price: true,
        features: true,
        limits: true,
      },
      orderBy: { price: "asc" },
    });
    return { ...ok(plans), trialDays: trialDays() };
  }
  @Get("legal/terms") legalTerms() {
    return ok(terms);
  }
  @Post("auth/:action") async auth(
    @Param("action") action: string,
    @Body() body: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return ok(await authAction(action, body, req, res));
  }
  @Get("me") async me(@Req() req: Request) {
    const u = await identity(req);
    const { passwordHash, ...safe } = u;
    return ok(safe);
  }
  @Get("dashboard") async dashboard(@Req() req: Request) {
    const { u, branchId } = await ctx(req, "pedidos.ver");
    const start = new Date(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: u.tenant!.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()) + "T00:00:00-05:00",
    );
    const [orders, tables, inventory, cash] = await Promise.all([
      db.order.findMany({
        where: {
          tenantId: u.tenantId!,
          branchId,
          OR: [
            { createdAt: { gte: start } },
            { payments: { some: { createdAt: { gte: start } } } },
            { status: { notIn: ["CERRADO", "CANCELADO"] } },
          ],
        },
        include: {
          items: true,
          payments: { orderBy: { createdAt: "desc" } },
          refunds: true,
          customer: true,
          table: true,
        },
      }),
      db.diningTable.findMany({ where: { branchId } }),
      db.inventory.findMany({
        where: { branchId },
        include: { ingredient: true },
      }),
      op.currentCash(u, branchId),
    ]);
    return ok({
      sales: orders
        .filter(
          (o) =>
            o.status === "CERRADO" &&
            o.payments.some((p) => p.createdAt >= start),
        )
        .reduce(
          (s, o) => s + o.total - o.refunds.reduce((r, v) => r + v.amount, 0),
          0,
        ),
      count: orders.filter(
        (o) => o.status !== "CANCELADO" && o.createdAt >= start,
      ).length,
      deliveries: orders.filter(
        (o) => o.service === "DOMICILIO" && o.createdAt >= start,
      ).length,
      occupied: tables.filter((t) => t.status === "OCUPADA").length,
      tables: tables.length,
      orders: orders.filter(
        (o) => !["CERRADO", "CANCELADO"].includes(o.status),
      ),
      lowStock: inventory.filter((i) => i.quantity <= i.ingredient.minimum),
      cash: cash.filter((s) => s.userId === u.id),
      hourly: Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        total: orders
          .filter(
            (o) =>
              o.status === "CERRADO" &&
              o.payments.some((p) => p.createdAt >= start) &&
              Number(
                new Intl.DateTimeFormat("en-US", {
                  timeZone: u.tenant!.timezone,
                  hour: "2-digit",
                  hourCycle: "h23",
                }).format(o.payments[0]?.createdAt || o.createdAt),
              ) === h,
          )
          .reduce((s, o) => s + o.total, 0),
      })),
    });
  }
  @Get("orders") async orders(@Req() req: Request, @Query() q: any) {
    const { u, branchId } = await ctx(req, "pedidos.ver");
    return { success: true, ...(await op.orders(u, branchId, q)) };
  }
  @Get("orders/:id") async order(@Param("id") id: string, @Req() req: Request) {
    const { u, branchId } = await ctx(req, "pedidos.ver");
    return ok(await op.findOrder(db, id, u, branchId));
  }
  @Get("tables/:id/order")
  async tableOrder(@Param("id") id: string, @Req() req: Request) {
    const { u, branchId } = await ctx(req, "pedidos.ver");
    return ok(await op.openTableOrder(id, u, branchId));
  }
  @Post("orders/:id/move-table")
  async moveTable(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { u, branchId } = await ctx(req, "pedidos.ver");
    const permissions = u.permissions as string[];
    if (
      !allowed(permissions, "pedidos.editar") &&
      !allowed(permissions, "pedidos.cerrar")
    )
      throw new ForbiddenException(
        "No tienes permiso para mover cuentas de mesa",
      );
    return ok(await op.moveTableOrder(id, body, u, branchId));
  }
  @Post("orders/:id/merge-table")
  async mergeTable(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { u, branchId } = await ctx(req, "pedidos.ver");
    const permissions = u.permissions as string[];
    if (
      !allowed(permissions, "pedidos.editar") &&
      !allowed(permissions, "pedidos.cerrar")
    )
      throw new ForbiddenException(
        "No tienes permiso para unir cuentas de mesa",
      );
    return ok(await op.mergeTableOrders(id, body, u, branchId));
  }
  @Post(["orders/:id/split-table-quote", "orders/:id/split-table"])
  async splitTable(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { u, branchId } = await ctx(req, "pedidos.ver");
    const permissions = u.permissions as string[];
    if (
      !allowed(permissions, "pedidos.editar") &&
      !allowed(permissions, "pedidos.cerrar")
    )
      throw new ForbiddenException(
        "No tienes permiso para separar productos de una mesa",
      );
    return ok(
      req.path.endsWith("/split-table-quote")
        ? await op.tableSplitQuote(id, body, u, branchId)
        : await op.splitTableOrder(id, body, u, branchId),
    );
  }
  @Post("orders/:id/rounds")
  async addRound(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { u, branchId } = await ctx(req, "pedidos.crear");
    return ok(await op.addTableRound(id, body, u, branchId));
  }
  @Post("orders/check-stock")
  async checkOrderStock(@Body() body: unknown, @Req() req: Request) {
    const { u, branchId } = await ctx(req, "pedidos.crear");
    await op.checkOrderStock(body, u, branchId);
    return ok({ available: true });
  }
  @Post("orders/takeaway-checkout")
  async takeawayCheckout(@Body() body: unknown, @Req() req: Request) {
    const { u, branchId } = await ctx(req, "ventas.crear");
    if (!allowed(u.permissions as string[], "pedidos.crear"))
      throw new ForbiddenException("No tienes permiso para crear pedidos");
    return ok(await op.checkoutTakeaway(body, u, branchId));
  }
  @Post("orders") async create(@Body() body: any, @Req() req: Request) {
    const { u, branchId } = await ctx(req, "pedidos.crear");
    return ok(await op.createOrder(body, u, branchId));
  }
  @Post("orders/:id/state") async state(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const { u, branchId } = await ctx(req, "pedidos.ver");
    return ok(await op.orderState(id, body, u, branchId));
  }
  @Post("orders/:id/product-quote")
  async productQuote(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { u, branchId } = await ctx(req, "ventas.crear");
    return ok(await op.productQuote(id, body, u, branchId));
  }
  @Post("orders/:id/payment") async pay(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const { u, branchId } = await ctx(req, "ventas.crear");
    return ok(await op.pay(id, body, u, branchId));
  }
  @Post("orders/:id/refund") async refund(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const { u, branchId } = await ctx(req, "ventas.devolver");
    return ok(await op.refund(id, body, u, branchId));
  }
  @Put("orders/:id")
  async editOrder(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const { u, branchId } = await ctx(req, "pedidos.editar");
    return ok(await op.editOrder(id, body, u, branchId));
  }
  @Post("purchases/:id/payment")
  async settlePurchase(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const { u, branchId } = await ctx(req, "compras.crear");
    feature(u, "purchases");
    return ok(await op.settlePurchase(id, body, u, branchId));
  }
  @Get("cash/current") async cash(@Req() req: Request) {
    const { u, branchId } = await ctx(req, "caja.ver");
    return ok(await op.currentCash(u, branchId));
  }
  @Get("cash/history") async cashHistory(@Req() req: Request) {
    const { branchId } = await ctx(req, "caja.ver");
    return ok(
      await db.cashSession.findMany({
        where: { register: { branchId } },
        include: { register: true, user: { select: { name: true } } },
        orderBy: { openedAt: "desc" },
        take: 100,
      }),
    );
  }
  @Post("cash/:action") async cashAction(
    @Param("action") action: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    if (!["open", "close", "movement"].includes(action))
      throw new NotFoundException();
    const { u, branchId } = await ctx(
      req,
      action === "open"
        ? "caja.abrir"
        : action === "close"
          ? "caja.cerrar"
          : "caja.ver",
    );
    return ok(await op.cashAction(action, body, u, branchId));
  }
  @Get("inventory") async inventory(@Req() req: Request) {
    const { u, branchId } = await ctx(req, "inventario.ver");
    feature(u, "inventory");
    return ok(
      await db.ingredient.findMany({
        where: { tenantId: u.tenantId! },
        include: { inventory: { where: { branchId } } },
        take: 100,
        orderBy: { name: "asc" },
      }),
    );
  }
  @Get("inventory/movements") async movements(@Req() req: Request) {
    const { branchId } = await ctx(req, "inventario.ver");
    return ok(
      await db.inventoryMovement.findMany({
        where: { branchId },
        include: { ingredient: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  }
  @Post("inventory/adjustment") async adjustment(
    @Req() req: Request,
    @Body() body: any,
  ) {
    const { u, branchId } = await ctx(req, "inventario.ajustar");
    feature(u, "inventory");
    return ok(await op.inventoryAction(body, u, branchId));
  }
  @Post("inventory/restock") async restock(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { u, branchId } = await ctx(req, "inventario.ajustar");
    feature(u, "inventory");
    return ok(await op.restockIngredients(body, u, branchId));
  }
  @Get("purchases") async purchases(@Req() req: Request) {
    const { u, branchId } = await ctx(req, "compras.ver");
    feature(u, "purchases");
    return ok(
      await db.purchase.findMany({
        where: { branchId },
        include: { supplier: true, items: { include: { ingredient: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  }
  @Post("purchases") async purchase(@Req() req: Request, @Body() body: any) {
    const { u, branchId } = await ctx(req, "compras.crear");
    feature(u, "purchases");
    return ok(await op.purchaseAction(undefined, body, u, branchId));
  }
  @Post("purchases/:id/receive") async receive(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    const { u, branchId } = await ctx(req, "compras.crear");
    return ok(await op.purchaseAction(id, {}, u, branchId));
  }
  @Post("products/:id/config") async productConfig(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const { u } = await ctx(req, "productos.editar");
    return ok(await op.productConfig(id, body, u));
  }
  @Post("customers/:id/addresses")
  async address(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    const { u } = await ctx(req, "clientes.editar");
    const b = z
      .object({
        id: z.string().optional(),
        label: z.string().trim().min(1).max(100),
        address: z.string().trim().min(5).max(191),
      })
      .parse(body);
    return ok(
      await transaction(async (tx) => {
        if (
          !(await tx.customer.findFirst({
            where: { id, tenantId: u.tenantId! },
          }))
        )
          throw new NotFoundException();
        const data = { label: b.label, address: b.address };
        if (b.id) {
          const updated = await tx.customerAddress.updateMany({
            where: { id: b.id, customerId: id },
            data,
          });
          if (!updated.count) throw new NotFoundException();
          await audit(tx, u, "UPDATE", "customers", id);
          return tx.customerAddress.findUnique({ where: { id: b.id } });
        }
        const address = await tx.customerAddress.create({
          data: { customerId: id, ...data },
        });
        await audit(tx, u, "UPDATE", "customers", id);
        return address;
      }),
    );
  }
  @Get("reports/sales") async reports(@Req() req: Request, @Query() q: any) {
    const { u, branchId } = await ctx(req, "reportes.ver");
    const from = q.from
      ? new Date(String(q.from) + "T00:00:00-05:00")
      : new Date(Date.now() - 30 * 86400000);
    const to = q.to
      ? new Date(String(q.to) + "T23:59:59.999-05:00")
      : new Date();
    if (
      !Number.isFinite(+from) ||
      !Number.isFinite(+to) ||
      from > to ||
      +to - +from > 366 * 86400000
    )
      throw new BadRequestException("Selecciona un período de hasta un año");
    const rows = await db.order.findMany({
      where: {
        tenantId: u.tenantId!,
        branchId:
          q.scope === "authorized"
            ? {
                in: u.branches
                  .filter((b) => b.branch.active)
                  .map((b) => b.branchId),
              }
            : branchId,
        status: "CERRADO",
        // Count a split sale once, on the date of the last payment.
        payments: {
          some: { createdAt: { gte: from, lte: to } },
          none: { createdAt: { gt: to } },
        },
      },
      include: {
        items: { include: { product: { include: { category: true } } } },
        branch: { select: { name: true } },
        payments: { orderBy: { createdAt: "desc" } },
        refunds: true,
        user: { select: { name: true } },
        customer: true,
      },
      take: 10000,
    });
    const products: Record<string, any> = {};
    const payments = Object.create(null),
      employees = Object.create(null),
      customers = Object.create(null),
      branches = Object.create(null),
      categories = Object.create(null);
    function add(group: Record<string, number>, label: string, value: number) {
      group[label] = (group[label] || 0) + value;
    }
    for (const o of rows) {
      add(employees, o.user.name, o.total);
      add(customers, o.customer?.name || "Consumidor final", o.total);
      add(branches, o.branch.name, o.total);
      for (const p of o.payments)
        payments[p.method] = (payments[p.method] || 0) + p.amount;
      for (const i of o.items) {
        add(categories, i.product.category?.name || "Sin categoría", i.total);
        products[i.productId] ??= {
          name: i.name,
          quantity: 0,
          total: 0,
          cost: 0,
        };
        products[i.productId].quantity += i.quantity;
        products[i.productId].total += i.total;
        products[i.productId].cost += i.cost * i.quantity;
      }
    }
    const gross = rows.reduce((s, o) => s + o.total, 0),
      refunds = rows.reduce(
        (s, o) => s + o.refunds.reduce((v, r) => v + r.amount, 0),
        0,
      );
    return ok({
      gross,
      refunds,
      net: gross - refunds,
      count: rows.length,
      average: rows.length ? Math.round(gross / rows.length) : 0,
      products: Object.values(products).sort((a, b) => b.total - a.total),
      payments,
      employees,
      customers,
      branches,
      categories,
      orders: rows.map((o) => ({
        id: o.id,
        number: o.number,
        total: o.total,
        service: o.service,
        user: o.user,
        branch: o.branch,
        paidAt: o.payments[0]?.createdAt,
      })),
      capped: rows.length === 10000,
    });
  }
  @Get("settings") async settings(@Req() req: Request) {
    const { u } = await ctx(req, "configuracion.ver");
    return ok(u.tenant);
  }
  @Put("settings") async settingsSave(@Req() req: Request, @Body() body: any) {
    const { u } = await ctx(req, "configuracion.editar");
    const b = z
      .object({
        name: z.string().min(2),
        nit: z.string().nullish(),
        phone: z.string().nullish(),
        address: z.string().nullish(),
        city: z.string(),
        taxRate: z.number().int().min(0).max(10000),
      })
      .parse(body);
    return ok(
      await transaction(async (tx) => {
        const row = await tx.tenant.update({
          where: { id: u.tenantId! },
          data: b,
        });
        await audit(tx, u, "UPDATE", "settings", row.id);
        return row;
      }),
    );
  }
  @Get("notifications") async notifications(@Req() req: Request) {
    const u = await identity(req);
    return ok(
      await db.notification.findMany({
        where: { tenantId: u.tenantId! },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    );
  }
  @Post("notifications/read") async read(@Req() req: Request) {
    const u = await identity(req);
    return ok(
      await db.notification.updateMany({
        where: { tenantId: u.tenantId! },
        data: { read: true },
      }),
    );
  }
  @Get("audit") async auditLogs(@Req() req: Request) {
    const { u } = await ctx(req, "configuracion.ver");
    return ok(
      await db.auditLog.findMany({
        where: { tenantId: u.tenantId! },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  }
  @Get("admin/overview") async admin(@Req() req: Request) {
    await platformIdentity(req);
    return ok(await adminOverview());
  }
  @Get("admin/companies") async platformCompanies(
    @Req() req: Request,
    @Query() query: unknown,
  ) {
    await platformIdentity(req);
    return ok(await adminCompanies(query));
  }
  @Get("admin/activity") async platformActivity(
    @Req() req: Request,
    @Query() query: unknown,
  ) {
    await platformIdentity(req);
    return ok(await adminActivity(query));
  }
  @Put("admin/tenants/:id") async tenantUpdate(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() body: any,
  ) {
    const u = await platformIdentity(req);
    const b = z
      .object({
        status: z.enum(["ACTIVA", "SUSPENDIDA"]),
        subscriptionStatus: z.enum([
          "TRIAL",
          "ACTIVA",
          "PAST_DUE",
          "SUSPENDIDA",
          "CANCELADA",
        ]),
        planId: z.string(),
        renewsAt: z.string().datetime(),
      })
      .parse(body);
    return ok(
      await transaction(async (tx) => {
        const current = await tx.tenant.findUnique({
          where: { id },
          include: { subscription: true },
        });
        if (!current?.subscription)
          throw new NotFoundException("Empresa sin suscripción");
        const previous = current.subscription;
        const action =
          previous.planId !== b.planId ? "CHANGE_PLAN" : "UPDATE_SUBSCRIPTION";
        if (
          current.status === b.status &&
          previous.status === b.subscriptionStatus &&
          previous.planId === b.planId &&
          previous.renewsAt.toISOString() === b.renewsAt
        )
          return current;
        const tenant = await tx.tenant.update({
          where: { id },
          data: {
            status: b.status,
            subscription: {
              update: {
                status: b.subscriptionStatus,
                planId: b.planId,
                renewsAt: b.renewsAt,
                cancelledAt:
                  b.subscriptionStatus === "CANCELADA"
                    ? (previous.cancelledAt ?? new Date())
                    : null,
                events: { create: { action } },
              },
            },
          },
        });
        await audit(tx, u, action, "tenants", id, b);
        return tenant;
      }),
    );
  }
  @Put("admin/plans/:id") async planUpdate(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() body: any,
  ) {
    const u = await platformIdentity(req);
    const b = planInput.parse(body);
    return ok(
      await transaction(async (tx) => {
        const row = await tx.plan.update({ where: { id }, data: b });
        await audit(tx, u, "UPDATE", "plans", id);
        return row;
      }),
    );
  }
  @Post("admin/plans") async planCreate(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const user = await platformIdentity(req);
    const data = planInput.parse(body);
    return ok(
      await transaction(async (tx) => {
        const plan = await tx.plan.create({
          data: { ...data, availableForSignup: false },
        });
        await audit(tx, user, "CREATE", "plans", plan.id);
        return plan;
      }),
    );
  }
  @Get("admin/complaints") async complaintList(
    @Req() req: Request,
    @Query() query: unknown,
  ) {
    await platformIdentity(req);
    return ok(await complaints.listComplaints(query));
  }
  @Get("admin/complaints/:id") async complaintDetail(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await platformIdentity(req);
    return ok(await complaints.getComplaint(id));
  }
  @Post("admin/complaints") async complaintCreate(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return ok(
      await complaints.createComplaint(await platformIdentity(req), body),
    );
  }
  @Post("admin/complaints/:id/events") async complaintUpdate(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return ok(
      await complaints.addComplaintEvent(await platformIdentity(req), id, body),
    );
  }
  @Get("admin/tenants/:id/terms") async acceptedTerms(
    @Req() req: Request,
    @Param("id") tenantId: string,
  ) {
    await platformIdentity(req);
    return ok(await db.termsAcceptance.findUnique({ where: { tenantId } }));
  }
  @Get(":resource") async catalog(
    @Param("resource") resource: string,
    @Req() req: Request,
    @Query() q: any,
  ) {
    const r = resources[resource];
    if (!r) throw new NotFoundException();
    const { u, branchId } = await ctx(req, r.permission + ".ver");
    return { success: true, ...(await list(resource, u, branchId, q)) };
  }
  @Post(":resource") async add(
    @Param("resource") resource: string,
    @Req() req: Request,
    @Body() body: any,
  ) {
    const r = resources[resource];
    if (!r) throw new NotFoundException();
    const { u, branchId } = await ctx(req, r.permission + ".crear");
    return ok(await save(resource, undefined, body, u, branchId));
  }
  @Put(":resource/:id") async edit(
    @Param("resource") resource: string,
    @Param("id") id: string,
    @Req() req: Request,
    @Body() body: any,
  ) {
    const r = resources[resource];
    if (!r) throw new NotFoundException();
    const { u, branchId } = await ctx(req, r.permission + ".editar");
    return ok(await save(resource, id, body, u, branchId));
  }
  @Delete(":resource/:id") async delete(
    @Param("resource") resource: string,
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    const r = resources[resource];
    if (!r) throw new NotFoundException();
    const { u, branchId } = await ctx(req, r.permission + ".eliminar");
    return ok(await remove(resource, id, u, branchId));
  }
}
@Module({ controllers: [Api] })
class AppModule {}
async function main() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET debe tener al menos 32 caracteres");
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.FRONTEND_URL || "http://localhost:5173").split(","),
    credentials: true,
  });
  app.use(
    "/api/v1/auth",
    rateLimit({
      windowMs: 60000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.useGlobalFilters(new Errors());
  if (process.env.SERVE_WEB === "true") {
    const webRoot = path.resolve(__dirname, "../../web/dist");
    app.useStaticAssets(webRoot);
    app
      .getHttpAdapter()
      .getInstance()
      .get("/{*path}", (req: Request, res: Response, next: () => void) => {
        if (
          req.path === "/api" ||
          req.path.startsWith("/api/") ||
          path.extname(req.path)
        ) {
          return next();
        }
        res.sendFile(path.join(webRoot, "index.html"));
      });
  }
  await app.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
  );
}
main();
