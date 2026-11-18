import {
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, transaction } from "./db";
import { terms } from "./legal-terms";
import { allowed, roles } from "./domain";
import {
  recoveryMailer,
  recoveryMinutes,
  deviceCodeMailer,
  deviceCodeMinutes,
} from "./recovery-mail";
export function trialDays() {
  const days = Number(process.env.TRIAL_DAYS || 14);
  return Number.isSafeInteger(days) && days > 0 && days <= 365 ? days : 14;
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
// bcrypt ignora lo que pasa de 72 bytes: se rechaza en vez de truncar en silencio.
export const passwordSchema = z
  .string()
  .min(10)
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "La contraseña supera el tamaño permitido",
  );
// Iguala el tiempo de respuesta cuando el correo no existe (evita enumerar cuentas).
const timingHash = bcrypt.hashSync(randomBytes(16).toString("hex"), 12);
// Bloqueo temporal por cuenta tras intentos fallidos, además del límite por IP.
// Vive en la base: sobrevive a reinicios y se comparte entre instancias.
const maxLoginFailures = 8;
const loginLockMs = 15 * 60_000;
async function loginLocked(email: string, now: Date) {
  const entry = await db.loginAttempt.findUnique({ where: { email } });
  return !!entry && entry.windowEnds > now && entry.count >= maxLoginFailures;
}
async function recordLoginFailure(email: string, now: Date) {
  const windowEnds = new Date(now.getTime() + loginLockMs);
  const current = await db.loginAttempt.findUnique({ where: { email } });
  const row = await db.loginAttempt.upsert({
    where: { email },
    create: { email, count: 1, windowEnds },
    update:
      current && current.windowEnds > now
        ? { count: { increment: 1 }, windowEnds }
        : { count: 1, windowEnds },
  });
  return row.count;
}

// Verificación de dispositivo: un código por correo autoriza el dispositivo 180 días.
const deviceCookie = "gpos_device";
const deviceDays = 180;
const maxCodeAttempts = 5;
const deviceLabel = (req: Request) =>
  String(req.headers["user-agent"] || "").slice(0, 180);
const codeHash = (userId: string, code: string) => hash(`${userId}:${code}`);
const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}•••@${domain}`;
};
async function trustedDevice(req: Request, userId: string, now: Date) {
  const raw = req.cookies?.[deviceCookie];
  if (typeof raw !== "string" || !raw) return null;
  const device = await db.trustedDevice.findUnique({
    where: { tokenHash: hash(raw) },
  });
  return device && device.userId === userId && device.expiresAt > now
    ? device
    : null;
}
async function trustDevice(req: Request, res: Response, userId: string) {
  const raw = randomBytes(32).toString("hex");
  await db.trustedDevice.create({
    data: {
      userId,
      tokenHash: hash(raw),
      label: deviceLabel(req),
      expiresAt: new Date(Date.now() + deviceDays * 86400000),
    },
  });
  res.cookie(deviceCookie, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: deviceDays * 86400000,
  });
}
// Sin SMTP en desarrollo el código va a la consola del servidor; en producción
// sin SMTP no hay forma de entregarlo y la verificación queda desactivada.
function deviceCodeSender() {
  const send = deviceCodeMailer();
  if (send) return send;
  if (process.env.NODE_ENV !== "production")
    return async (to: string, code: string) =>
      console.info(`[desarrollo] Código de verificación para ${to}: ${code}`);
}
async function startDeviceChallenge(
  u: { id: string; email: string; tenantId: string | null },
  req: Request,
  send: NonNullable<ReturnType<typeof deviceCodeSender>>,
) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const challenge = await transaction(async (tx) => {
    await tx.loginChallenge.deleteMany({ where: { userId: u.id } });
    return tx.loginChallenge.create({
      data: {
        userId: u.id,
        codeHash: codeHash(u.id, code),
        expiresAt: new Date(Date.now() + deviceCodeMinutes * 60_000),
      },
    });
  });
  try {
    await send(u.email, code, deviceLabel(req));
  } catch {
    await db.loginChallenge.deleteMany({ where: { id: challenge.id } });
    throw new ServiceUnavailableException(
      "No pudimos enviar el código de verificación. Intenta de nuevo en un momento.",
    );
  }
  await audit(db, u, "DEVICE_CHALLENGE", "auth", undefined, {
    ip: req.ip,
    device: deviceLabel(req),
  });
  return {
    verification: {
      challengeId: challenge.id,
      email: maskEmail(u.email),
      minutes: deviceCodeMinutes,
    },
  };
}
async function verifyDevice(body: unknown, req: Request, res: Response) {
  const b = z
    .object({
      challengeId: z.string().min(1).max(64),
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Escribe los 6 dígitos del código"),
    })
    .parse(body);
  const now = new Date();
  const expired = () =>
    new BadRequestException(
      "El código venció. Inicia sesión de nuevo para recibir otro.",
    );
  const challenge = await db.loginChallenge.findUnique({
    where: { id: b.challengeId },
    include: { user: true },
  });
  if (
    !challenge ||
    challenge.expiresAt <= now ||
    challenge.attempts >= maxCodeAttempts ||
    !challenge.user.active
  )
    throw expired();
  const matches = timingSafeEqual(
    Buffer.from(codeHash(challenge.userId, b.code)),
    Buffer.from(challenge.codeHash),
  );
  if (!matches) {
    await db.loginChallenge.updateMany({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    // Los códigos fallidos también cuentan para el bloqueo de la cuenta.
    await recordLoginFailure(challenge.user.email, now);
    await audit(db, challenge.user, "DEVICE_CODE_FAILED", "auth", undefined, {
      ip: req.ip,
    });
    throw new BadRequestException(
      challenge.attempts + 1 >= maxCodeAttempts
        ? "Demasiados intentos. Inicia sesión de nuevo para recibir otro código."
        : "Código incorrecto. Revisa el correo e inténtalo de nuevo.",
    );
  }
  // Consumo atómico: el mismo código no autoriza dos veces.
  const consumed = await db.loginChallenge.deleteMany({
    where: { id: challenge.id, attempts: challenge.attempts },
  });
  if (!consumed.count) throw expired();
  await trustDevice(req, res, challenge.userId);
  await db.loginAttempt.deleteMany({ where: { email: challenge.user.email } });
  await audit(db, challenge.user, "DEVICE_VERIFIED", "auth", undefined, {
    ip: req.ip,
    device: deviceLabel(req),
  });
  return issue(challenge.user, res);
}
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
      password: passwordSchema,
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
    // Cambiar la contraseña desautoriza todos los dispositivos.
    await tx.trustedDevice.deleteMany({ where: { userId: candidate.userId } });
    await tx.loginChallenge.deleteMany({ where: { userId: candidate.userId } });
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
  if (action === "verify-device") return verifyDevice(body, req, res);
  if (action === "login") {
    const b = z
      .object({
        email: z
          .string()
          .trim()
          .email("Escribe un correo válido")
          .max(191, "El correo es demasiado largo"),
        password: z
          .string()
          .min(1, "Escribe tu contraseña")
          .max(128, "La contraseña es demasiado larga"),
      })
      .parse(body);
    const email = b.email.toLowerCase();
    const now = new Date();
    const u = await db.user.findUnique({ where: { email } });
    // Un dispositivo ya autorizado no queda bloqueado por intentos de terceros.
    const device = u ? await trustedDevice(req, u.id, now) : null;
    if (!device && (await loginLocked(email, now)))
      throw new HttpException(
        "Demasiados intentos fallidos. Espera 15 minutos o recupera tu contraseña.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const valid = await bcrypt.compare(
      b.password,
      u?.passwordHash ?? timingHash,
    );
    if (!u?.active || !valid) {
      const attempts = await recordLoginFailure(email, now);
      if (u)
        await audit(db, u, "LOGIN_FAILED", "auth", undefined, {
          ip: req.ip,
          attempts,
        });
      throw new UnauthorizedException("Correo o contraseña incorrectos");
    }
    await db.loginAttempt.deleteMany({ where: { email } });
    if (!device) {
      const send = deviceCodeSender();
      if (send) return startDeviceChallenge(u, req, send);
    } else
      await db.trustedDevice.update({
        where: { id: device.id },
        data: { lastUsedAt: now },
      });
    await audit(db, u, "LOGIN", "auth", undefined, {
      ip: req.ip,
      trustedDevice: !!device,
    });
    return issue(u, res);
  }
  if (action === "register") {
    const b = z
      .object({
        name: z.string().min(2).max(100),
        email: z
          .string()
          .trim()
          .email("Escribe un correo válido")
          .max(191, "El correo es demasiado largo"),
        password: passwordSchema,
        termsAccepted: z.literal(true, {
          error: "Debes aceptar los términos de uso",
        }),
        termsVersion: z.string(),
        business: z.string().min(2).max(100),
      })
      .parse(body);
    if (b.termsVersion !== terms.version) {
      throw new BadRequestException(
        "Los términos se actualizaron. Revísalos y vuelve a aceptar.",
      );
    }
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
              renewsAt: new Date(Date.now() + trialDays() * 86400000),
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
      const user = await tx.user.create({
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
      await tx.termsAcceptance.create({
        data: {
          tenantId: tenant.id,
          acceptedById: user.id,
          acceptedByEmail: user.email,
          version: terms.version,
          document: JSON.stringify(terms),
        },
      });
      return user;
    });
    // Quien crea la cuenta ya está en este dispositivo: no se le pide código.
    await trustDevice(req, res, u.id);
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
    // Rotación con 30 s de gracia: si dos pestañas renuevan a la vez, ambas
    // reciben sesión en vez de que la segunda quede fuera.
    const graceEnds = new Date(Date.now() + 30_000);
    await db.refreshSession.updateMany({
      where: { id: session.id, expiresAt: { gt: graceEnds } },
      data: { expiresAt: graceEnds },
    });
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
