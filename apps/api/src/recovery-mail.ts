import nodemailer from "nodemailer";

export const recoveryMinutes = 30;

export const deviceCodeMinutes = 10;

// Conexión SMTP del buzón no-reply del hosting; sin contraseña configurada no hay envío.
function smtp() {
  const password = process.env.SMTP_PASSWORD;
  if (!password) return;
  const from = process.env.SMTP_USER || "no-reply@webcodecol.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: from, pass: password },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
  return { transport, from };
}

export function deviceCodeMailer() {
  const mail = smtp();
  if (!mail) return;
  return async (to: string, code: string, device: string) => {
    await mail.transport.sendMail({
      from: { name: "GPOS", address: mail.from },
      to,
      subject: `${code} es tu código para autorizar este dispositivo en GPOS`,
      text: [
        "Alguien inició sesión en tu cuenta de GPOS desde un dispositivo nuevo:",
        device || "Dispositivo desconocido",
        "",
        `Código de verificación: ${code}`,
        "",
        `Vence en ${deviceCodeMinutes} minutos. Después de verificarlo, ese dispositivo no volverá a pedir código.`,
        "Si no fuiste tú, no compartas el código y cambia tu contraseña.",
      ].join("\n"),
    });
  };
}

export function recoveryMailer() {
  const mail = smtp();
  const frontend = process.env.FRONTEND_URL?.split(",")[0]?.trim();
  if (!mail || !frontend) return;
  const { transport, from } = mail;

  let url: URL;
  try {
    url = new URL("/restablecer-contrasena", frontend);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
      return;
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
  } catch {
    return;
  }

  return async (to: string, token: string) => {
    url.hash = new URLSearchParams({ token }).toString();
    await transport.sendMail({
      from: { name: "GPOS", address: from },
      to,
      subject: "Restablece tu contraseña de GPOS",
      text: [
        "Recibimos una solicitud para restablecer tu contraseña de GPOS.",
        "",
        url.toString(),
        "",
        `El enlace vence en ${recoveryMinutes} minutos y se puede usar una sola vez.`,
        "Si no solicitaste el cambio, puedes ignorar este correo.",
      ].join("\n"),
    });
  };
}
