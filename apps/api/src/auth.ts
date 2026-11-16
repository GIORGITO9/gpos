import {
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, transaction } from "./db";
import { allowed, roles } from "./domain";
import { recoveryMailer, recoveryMinutes } from "./recovery-mail";
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
  const { user, session } = await transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: u.id, passwordHash: u.passwordHash, active: true },
      include: {
        branches: { include: { branch: true } },
        tenant: { include: { subscription: { include: { plan: true } } } },
      },
    });
    if (!user) throw new UnauthorizedException("Inicia sesión de nuevo");
    const session = await tx.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: hash(raw),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    return { user, session };
  });
  res.cookie("gpos_refresh", raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: 7 * 86400000,
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

async function deliverRecovery(
  email: string,
  send: NonNullable<ReturnType<typeof recoveryMailer>>,
) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hash(token);
  const user = await transaction(async (tx) => {
    const account = await tx.user.findUnique({
      where: { email },
      select: { id: true, email: true, active: true },
    });
    if (!account?.active) return;

    const createdAt = new Date();
    const data = {
      tokenHash,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + recoveryMinutes * 60_000),
    };
    const updated = await tx.passwordReset.updateMany({
      where: {
        userId: account.id,
        createdAt: { lte: new Date(createdAt.getTime() - 120_000) },
      },
      data,
    });
    if (updated.count) return account;
    const inserted = await tx.passwordReset.createMany({
      data: [{ userId: account.id, ...data }],
      skipDuplicates: true,
    });
    if (inserted.count) return account;
  });
  if (!user) return;

  try {
    await send(user.email, token);
  } catch (error) {
    await db.passwordReset.deleteMany({ where: { tokenHash } });
    throw error;
  }
}

async function resetPassword(body: unknown) {
  const { token, password } = z
    .object({
      token: z.string().regex(/^[a-f0-9]{64}$/, "El enlace no es válido"),
      password: z
        .string()
        .min(10)
        .max(72)
        .refine(
          (value) => Buffer.byteLength(value, "utf8") <= 72,
          "La contraseña supera el tamaño permitido",
        ),
    })
    .parse(body);
  const tokenHash = hash(token);
  const invalidLink = () =>
    new BadRequestException(
      "El enlace venció o ya se usó. Solicita uno nuevo.",
    );
  const candidate = await db.passwordReset.findUnique({ where: { tokenHash } });
  if (!candidate || candidate.expiresAt <= new Date()) throw invalidLink();
  const passwordHash = await bcrypt.hash(password, 12);

  await transaction(async (tx) => {
    const consumed = await tx.passwordReset.deleteMany({
      where: { tokenHash, expiresAt: { gt: new Date() } },
    });
    if (!consumed.count) throw invalidLink();
    const changed = await tx.user.updateMany({
      where: { id: candidate.userId, active: true },
      data: { passwordHash },
    });
    if (!changed.count) throw invalidLink();
    await tx.refreshSession.deleteMany({ where: { userId: candidate.userId } });
  });
  return { updated: true };
}
export async function authAction(
  action: string,
  body: any,
  req: Request,
  res: Response,
) {
  if (action === "forgot-password") {
    const { email } = z
      .object({ email: z.string().trim().email().max(191) })
      .parse(body);
    const send = recoveryMailer();
    if (!send)
      throw new ServiceUnavailableException(
        "La recuperación por correo aún no está disponible.",
      );
    void deliverRecovery(email.toLowerCase(), send).catch(() => {
      console.warn(
        "No se pudo completar un envío de recuperación de contraseña.",
      );
    });
    return { accepted: true };
  }
  if (action === "reset-password") return resetPassword(body);
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
    const plan = await db.plan.findFirst({
      where: { availableForSignup: true },
      orderBy: { price: "asc" },
    });
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
