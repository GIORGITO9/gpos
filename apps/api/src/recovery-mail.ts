import nodemailer from "nodemailer";

export const recoveryMinutes = 30;

export function recoveryMailer() {
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_USER || "no-reply@webcodecol.com";
  const frontend = process.env.FRONTEND_URL?.split(",")[0]?.trim();
  if (!password || !frontend) return;

  let url: URL;
  try {
    url = new URL("/restablecer-contrasena", frontend);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
      return;
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
  } catch {
    return;
  }

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
