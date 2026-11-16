import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { money } from "./catalog";

const pageSize = 20;
const subscriptionStatuses = [
  "TRIAL",
  "ACTIVA",
  "PAST_DUE",
  "SUSPENDIDA",
  "CANCELADA",
] as const;
const renewals = ["upcoming", "overdue"] as const;
const paging = z.coerce.number().int().min(1).max(100_000).default(1);
const renewalStatuses = ["TRIAL", "ACTIVA", "PAST_DUE"];

function renewalWhere(
  now: Date,
  window: (typeof renewals)[number],
): Prisma.SubscriptionWhereInput {
  const nextWeek = new Date(now.getTime() + 7 * 86_400_000);
  return {
    status: { in: renewalStatuses },
    tenant: { status: "ACTIVA" },
    renewsAt: window === "overdue" ? { lt: now } : { gte: now, lte: nextWeek },
  };
}

export const planInput = z.object({
  name: z.string().trim().min(2).max(191),
  price: money,
  features: z
    .array(z.string().trim().min(1).max(100))
    .max(100)
    .transform((items) => [...new Set(items)]),
  limits: z.record(z.string(), z.number().int().min(0).max(2_147_483_647)),
});

export async function adminCompanies(input: unknown) {
  const query = z
    .object({
      page: paging,
      search: z.string().trim().max(191).default(""),
      status: z.enum(subscriptionStatuses).optional(),
      planId: z.string().max(191).optional(),
      renewal: z.enum(renewals).optional(),
      companyStatus: z.enum(["ACTIVA", "SUSPENDIDA"]).optional(),
    })
    .parse(input);
  const where: Prisma.TenantWhereInput = {
    status: query.companyStatus,
    AND: [
      ...(query.search
        ? [
            {
              OR: ["name", "email", "city", "nit"].map((field) => ({
                [field]: { contains: query.search },
              })),
            },
          ]
        : []),
      ...(query.renewal
        ? [{ subscription: renewalWhere(new Date(), query.renewal) }]
        : []),
      ...(query.planId || query.status
        ? [{ subscription: { planId: query.planId, status: query.status } }]
        : []),
    ],
  };
  const [companies, total] = await db.$transaction([
    db.tenant.findMany({
      where,
      include: {
        subscription: { include: { plan: { select: { name: true } } } },
        _count: { select: { users: true, branches: true } },
      },
      skip: (query.page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    db.tenant.count({ where }),
  ]);
  return { companies, total, pageSize };
}

export async function adminOverview() {
  const now = new Date();
  const [companies, suspended, byStatus, recurring, upcoming, overdue, plans] =
    await Promise.all([
      db.tenant.count(),
      db.tenant.count({ where: { status: "SUSPENDIDA" } }),
      db.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
      db.subscription.groupBy({
        by: ["planId"],
        where: { status: "ACTIVA", tenant: { status: "ACTIVA" } },
        _count: { _all: true },
      }),
      db.subscription.count({ where: renewalWhere(now, "upcoming") }),
      db.subscription.count({ where: renewalWhere(now, "overdue") }),
      db.plan.findMany({
        include: { _count: { select: { subscriptions: true } } },
        orderBy: [{ price: "asc" }, { name: "asc" }],
      }),
    ]);
  const counts = Object.fromEntries(
    byStatus.map((row) => [row.status, row._count._all]),
  );
  const prices = new Map(plans.map((plan) => [plan.id, plan.price]));
  const mrr = recurring.reduce(
    (total, row) => total + (prices.get(row.planId) ?? 0) * row._count._all,
    0,
  );
  return {
    companies,
    suspended,
    counts,
    mrr,
    arr: mrr * 12,
    upcoming,
    overdue,
    plans,
  };
}

export async function adminActivity(input: unknown) {
  const { page, module } = z
    .object({
      page: paging,
      module: z.enum(["tenants", "plans"]).optional(),
    })
    .parse(input);
  const where = {
    tenantId: null,
    module: module ?? { in: ["tenants", "plans"] },
  };
  const [logs, total] = await db.$transaction([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        userId: true,
        action: true,
        module: true,
        recordId: true,
        createdAt: true,
      },
    }),
    db.auditLog.count({ where }),
  ]);
  const [actors, tenants, plans] = await Promise.all([
    db.user.findMany({
      where: { id: { in: logs.map((log) => log.userId) } },
      select: { id: true, name: true, email: true },
    }),
    db.tenant.findMany({
      where: {
        id: {
          in: logs
            .filter((log) => log.module === "tenants")
            .flatMap((log) => log.recordId ?? []),
        },
      },
      select: { id: true, name: true },
    }),
    db.plan.findMany({
      where: {
        id: {
          in: logs
            .filter((log) => log.module === "plans")
            .flatMap((log) => log.recordId ?? []),
        },
      },
      select: { id: true, name: true },
    }),
  ]);
  const people = new Map(actors.map((actor) => [actor.id, actor]));
  const records = new Map(
    [...tenants, ...plans].map((item) => [item.id, item.name]),
  );
  return {
    rows: logs.map(({ userId, recordId, ...log }) => ({
      ...log,
      actor: people.get(userId) ?? null,
      record: records.get(recordId ?? "") ?? null,
    })),
    total,
    pageSize,
  };
}
