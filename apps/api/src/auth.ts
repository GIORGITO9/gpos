import {
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, transaction } from "./db";
import { allowed, roles } from "./domain";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function audit(
  tx: any,
  user: any,
  action: string,
  module: string,
  recordId?: string,
  metadata: any = {},
) {
  return tx.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      action,
      module,
      recordId,
      metadata,
    },
  });
}
export async function identity(req: Request, permission?: string) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const payload = jwt.verify(token || "", process.env.JWT_SECRET!, {
      algorithms: ["HS256"],
    }) as any;
    if (
      !payload.sid ||
      !(await db.refreshSession.findFirst({
        where: {
          id: payload.sid,
          userId: payload.sub,
          expiresAt: { gt: new Date() },
        },
      }))
    )
      throw new UnauthorizedException();
    const u = await db.user.findUnique({
      where: { id: payload.sub },
      include: {
        branches: { include: { branch: true } },
        tenant: { include: { subscription: { include: { plan: true } } } },
      },
    });
    if (!u?.active) throw new UnauthorizedException();
    if (u.role === "SUPER_ADMIN")
      throw new ForbiddenException(
        "Acceso operativo no habilitado para Super Admin",
      );
    if (u.tenant?.status !== "ACTIVA")
      throw new ForbiddenException("Empresa suspendida");
    const sub = u.tenant.subscription;
    if (
      !sub ||
      !["TRIAL", "ACTIVA", "PAST_DUE"].includes(sub.status) ||
      (sub.status === "TRIAL" && sub.renewsAt < new Date())
    )
      throw new ForbiddenException("Tu suscripción requiere renovación");
    if (permission && !allowed(u.permissions as string[], permission))
      throw new ForbiddenException("No tienes permiso para esta operación");
    return u;
  } catch (e) {
    if (e instanceof ForbiddenException) throw e;
    throw new UnauthorizedException(
      "La sesión expiró. Inicia sesión de nuevo.",
    );
  }
}
export async function branchFor(req: Request, u: any) {
  const id = String(
    req.headers["x-branch-id"] || u.branches[0]?.branchId || "",
  );
  if (
    !u.branches.some(
      (b: any) =>
        b.branchId === id &&
        b.branch.active &&
        b.branch.tenantId === u.tenantId,
    )
  )
    throw new ForbiddenException("Sucursal no autorizada");
  return id;
}
export async function platformIdentity(req: Request) {
  try {
    const p = jwt.verify(
      req.headers.authorization?.replace(/^Bearer /, "") || "",
      process.env.JWT_SECRET!,
      { algorithms: ["HS256"] },
    ) as any;
    if (
      !p.sid ||
      !(await db.refreshSession.findFirst({
        where: { id: p.sid, userId: p.sub, expiresAt: { gt: new Date() } },
      }))
    )
      throw new Error();
    const u = await db.user.findUnique({ where: { id: p.sub } });
    if (!u?.active || u.role !== "SUPER_ADMIN") throw new Error();
    return u;
  } catch {
    throw new ForbiddenException("Solo Super Admin");
  }
}
export async function publicUser(u: any) {
  const { passwordHash, ...safe } = u;
  return safe;
}
async function issue(u: any, res: Response) {
  const raw = randomBytes(48).toString("hex");
  const session = await db.refreshSession.create({
    data: {
      userId: u.id,
      tokenHash: hash(raw),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  res.cookie("gpos_refresh", raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: 7 * 86400000,
  });
  const user = await db.user.findUnique({
    where: { id: u.id },
    include: {
      branches: { include: { branch: true } },
      tenant: { include: { subscription: { include: { plan: true } } } },
    },
  });
  return {
    access_token: jwt.sign(
      { sub: u.id, sid: session.id },
      process.env.JWT_SECRET!,
      { expiresIn: "15m", algorithm: "HS256" },
    ),
    user: await publicUser(user),
  };
}
export async function authAction(
  action: string,
  body: any,
  req: Request,
  res: Response,
) {
  if (action === "login") {
    const b = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(body);
    const u = await db.user.findUnique({
      where: { email: b.email.toLowerCase() },
    });
    if (!u?.active || !(await bcrypt.compare(b.password, u.passwordHash)))
      throw new UnauthorizedException("Correo o contraseña incorrectos");
    await audit(db, u, "LOGIN", "auth");
    return issue(u, res);
  }
  if (action === "register") {
    const b = z
      .object({
        name: z.string().min(2).max(100),
        email: z.string().email(),
        password: z.string().min(10).max(128),
        business: z.string().min(2).max(100),
      })
      .parse(body);
    const passwordHash = await bcrypt.hash(b.password, 12);
    const plan = await db.plan.findFirst({ orderBy: { price: "asc" } });
    if (!plan)
      throw new BadRequestException(
        "Ejecuta la configuración inicial de planes",
      );
    const u = await transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: b.business,
          email: b.email,
          subscription: {
            create: {
              planId: plan.id,
              renewsAt: new Date(
                Date.now() + Number(process.env.TRIAL_DAYS || 14) * 86400000,
              ),
            },
          },
          branches: {
            create: {
              name: "Principal",
              registers: { create: { name: "Caja principal" } },
            },
          },
        },
        include: { branches: true },
      });
      return tx.user.create({
        data: {
          name: b.name,
          email: b.email.toLowerCase(),
          passwordHash,
          tenantId: tenant.id,
          role: "OWNER",
          permissions: ["*"],
          branches: { create: { branchId: tenant.branches[0].id } },
        },
      });
    });
    return issue(u, res);
  }
  if (action === "refresh") {
    const token = req.cookies?.gpos_refresh;
    if (!token) throw new UnauthorizedException();
    const session = await db.refreshSession.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date() || !session.user.active)
      throw new UnauthorizedException();
    const deleted = await db.refreshSession.deleteMany({
      where: { id: session.id },
    });
    if (!deleted.count) throw new UnauthorizedException();
    return issue(session.user, res);
  }
  if (action === "logout") {
    if (req.cookies?.gpos_refresh) {
      await transaction(async (tx) => {
        const session = await tx.refreshSession.findUnique({
          where: { tokenHash: hash(req.cookies.gpos_refresh) },
          include: { user: true },
        });
        if (session) {
          await tx.refreshSession.deleteMany({ where: { id: session.id } });
          await audit(tx, session.user, "LOGOUT", "auth");
        }
      });
    }
    res.clearCookie("gpos_refresh", { path: "/api/v1/auth" });
    return { loggedOut: true };
  }
  throw new BadRequestException("Acción desconocida");
}
export { roles };
