// Controles de seguridad contra MySQL real, con una empresa desechable que se borra al final.
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/db";
import { authAction, passwordSchema } from "../src/auth";
import { save } from "../src/catalog";
import { emailLayout, escapeHtml } from "../src/recovery-mail";

test("contraseñas: se rechaza lo que bcrypt truncaría en silencio", () => {
  assert.equal(passwordSchema.safeParse("a".repeat(72)).success, true);
  assert.equal(passwordSchema.safeParse("a".repeat(73)).success, false);
  assert.equal(passwordSchema.safeParse("ñ".repeat(37)).success, false); // 74 bytes
  assert.equal(passwordSchema.safeParse("corta").success, false);
});

test("correos: el User-Agent no puede inyectar HTML", () => {
  const ua = '<img src=x onerror="alert(1)">';
  assert.equal(escapeHtml(ua).includes("<"), false);
  const html = emailLayout({
    preheader: "p",
    title: "t",
    intro: "i",
    body: escapeHtml(ua),
    note: "n",
  });
  assert.equal(html.includes("<img"), false);
});

test(
  "verificación de dispositivo por correo, bloqueo persistente, gracia de sesión y propietario protegido",
  { skip: process.env.RUN_INTEGRATION !== "true" },
  async () => {
    // Valor de prueba solo si el entorno no define uno.
    process.env.JWT_SECRET ||= randomUUID() + randomUUID();
    // Sin SMTP en desarrollo el código se imprime en consola: la prueba lo lee de ahí.
    const savedSmtp = process.env.SMTP_PASSWORD;
    delete process.env.SMTP_PASSWORD;
    const info = console.info;
    let mailedCode = "";
    console.info = (msg: string) => {
      mailedCode = /(\d{6})$/.exec(String(msg))?.[1] ?? mailedCode;
    };
    const tag = randomUUID().slice(0, 8);
    const password = `QA-${randomUUID()}`;
    const plan = await db.plan.findFirstOrThrow();
    const tenant = await db.tenant.create({
      data: {
        name: `QA seguridad ${tag}`,
        branches: { create: { name: "Principal" } },
        subscription: {
          create: {
            planId: plan.id,
            status: "ACTIVA",
            renewsAt: new Date(Date.now() + 864e5),
          },
        },
      },
      include: { branches: true },
    });
    const branchId = tenant.branches[0].id;
    const passwordHash = await bcrypt.hash(password, 12);
    const make = (role: string) =>
      db.user.create({
        data: {
          tenantId: tenant.id,
          name: role,
          email: `qa-${role.toLowerCase()}-${tag}@gpos.local`,
          passwordHash,
          role,
          permissions: ["*"],
          branches: { create: { branchId } },
        },
      });
    try {
      const owner = await make("OWNER");
      const admin = await make("ADMIN");
      const cookies: Record<string, string> = {};
      const res: any = {
        cookie: (name: string, value: string) => (cookies[name] = value),
        clearCookie() {},
      };
      const req = (deviceToken?: string, refresh?: string): any => ({
        ip: "203.0.113.7",
        headers: { "user-agent": "QA Safari iPhone" },
        cookies: {
          ...(deviceToken ? { gpos_device: deviceToken } : {}),
          ...(refresh ? { gpos_refresh: refresh } : {}),
        },
      });
      const login = (email: string, pass: string, device?: string) =>
        authAction("login", { email, password: pass }, req(device), res);

      // Un correo inexistente pasa por bcrypt igual que uno real (sin atajo medible).
      const start = performance.now();
      await assert.rejects(
        login(`nadie-${tag}@gpos.local`, "x"),
        /incorrectos/,
      );
      assert.ok(performance.now() - start > 50, "debe comparar contra un hash");

      // 1. Dispositivo nuevo: contraseña correcta, pero pide código y no entrega tokens.
      const first: any = await login(owner.email, password);
      assert.equal(first.access_token, undefined);
      assert.equal(first.verification.email, "q•••@gpos.local");
      assert.match(mailedCode, /^\d{6}$/);
      const challengeId = first.verification.challengeId;
      const verify = (code: string) =>
        authAction("verify-device", { challengeId, code }, req(), res);

      // 2. Código incorrecto: rechazado y auditado.
      const wrong = mailedCode === "000000" ? "111111" : "000000";
      await assert.rejects(verify(wrong), /Código incorrecto/);
      assert.equal(
        await db.auditLog.count({
          where: { userId: owner.id, action: "DEVICE_CODE_FAILED" },
        }),
        1,
      );

      // 3. Código correcto: entra y queda una cookie de dispositivo.
      const verified: any = await verify(mailedCode);
      assert.ok(verified.access_token);
      const deviceToken = cookies.gpos_device;
      assert.match(deviceToken, /^[a-f0-9]{64}$/);
      // El mismo código no sirve dos veces.
      await assert.rejects(verify(mailedCode), /venció/);

      // 4. Dispositivo autorizado: entra directo, sin código.
      const again: any = await login(owner.email, password, deviceToken);
      assert.ok(again.access_token);
      assert.equal(again.verification, undefined);

      // 5. Un atacante agota los intentos desde otro dispositivo: queda bloqueado
      //    (en la base), pero el dueño desde su dispositivo autorizado sigue entrando.
      for (let i = 0; i < 8; i++)
        await assert.rejects(login(owner.email, "incorrecta"), /incorrectos/);
      await assert.rejects(login(owner.email, password), /Demasiados intentos/);
      const attempt = await db.loginAttempt.findUniqueOrThrow({
        where: { email: owner.email },
      });
      assert.equal(attempt.count, 8);
      const trusted: any = await login(owner.email, password, deviceToken);
      assert.ok(
        trusted.access_token,
        "el dispositivo autorizado no se bloquea",
      );

      // 6. Renovación concurrente: el mismo refresh sirve durante la gracia.
      const refresh = cookies.gpos_refresh;
      const r1: any = await authAction(
        "refresh",
        {},
        req(undefined, refresh),
        res,
      );
      const r2: any = await authAction(
        "refresh",
        {},
        req(undefined, refresh),
        res,
      );
      assert.ok(r1.access_token && r2.access_token);
      // Pasada la gracia, el token viejo ya no sirve.
      await db.refreshSession.updateMany({
        where: {
          userId: owner.id,
          expiresAt: { lt: new Date(Date.now() + 60_000) },
        },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await assert.rejects(
        authAction("refresh", {}, req(undefined, refresh), res),
        /Unauthorized/,
      );

      // 7. Un ADMIN no puede tomar la cuenta del propietario.
      const actor = { ...admin, tenant };
      await assert.rejects(
        save(
          "users",
          owner.id,
          {
            name: "Tomado",
            email: owner.email,
            role: "CAJERO",
            branchIds: [branchId],
            password: `QA-${randomUUID()}`,
          },
          actor,
          branchId,
        ),
        /Solo el propietario/,
      );
      const intact = await db.user.findUniqueOrThrow({
        where: { id: owner.id },
      });
      assert.equal(intact.role, "OWNER");
      assert.equal(intact.passwordHash, passwordHash);
    } finally {
      console.info = info;
      if (savedSmtp !== undefined) process.env.SMTP_PASSWORD = savedSmtp;
      const users = await db.user.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, email: true },
      });
      const userIds = users.map((x) => x.id);
      await db.$transaction([
        db.loginAttempt.deleteMany({
          where: { email: { in: users.map((x) => x.email) } },
        }),
        db.refreshSession.deleteMany({ where: { userId: { in: userIds } } }),
        db.trustedDevice.deleteMany({ where: { userId: { in: userIds } } }),
        db.loginChallenge.deleteMany({ where: { userId: { in: userIds } } }),
        db.auditLog.deleteMany({ where: { tenantId: tenant.id } }),
        db.userBranch.deleteMany({ where: { branchId } }),
        db.user.deleteMany({ where: { tenantId: tenant.id } }),
        db.branch.deleteMany({ where: { tenantId: tenant.id } }),
        db.subscription.deleteMany({ where: { tenantId: tenant.id } }),
        db.tenant.delete({ where: { id: tenant.id } }),
      ]);
      await db.$disconnect();
    }
  },
);
