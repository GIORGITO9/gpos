import nodemailer from "nodemailer";

export const recoveryMinutes = 30;

export const deviceCodeMinutes = 10;

// El nombre del dispositivo sale del User-Agent (lo controla quien inicia sesión): siempre escapado.
export const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const font =
  "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Seis casillas en tabla (Gmail y Outlook ignoran grid/flex); el código completo va también en el asunto para copiarlo.
const codeBoxes = (code: string) =>
  `<table role="presentation" align="center" cellpadding="0" cellspacing="0" width="100%" style="margin:0 auto;max-width:312px;"><tr>${[
    ...code,
  ]
    .map(
      (d) =>
        `<td width="16%" style="padding:0 3px;"><div style="height:56px;line-height:56px;border:1px solid #d2d2d7;border-radius:12px;background:#f5f5f7;text-align:center;font-family:${font};font-size:28px;font-weight:700;color:#1d1d1f;">${d}</div></td>`,
    )
    .join("")}</tr></table>`;

// Plantilla con tablas y estilos en línea: es lo que respetan Gmail, Outlook y Apple Mail.
export function emailLayout(o: {
  preheader: string;
  title: string;
  intro: string;
  body: string;
  note: string;
}) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${o.title}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${o.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="padding:0 8px 24px;font-family:${font};font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#1d1d1f;">gpos<span style="color:#006bd6;">.</span></td></tr>
<tr><td style="background:#ffffff;border-radius:20px;padding:40px 36px;font-family:${font};color:#1d1d1f;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.4px;">${o.title}</h1>
<p style="margin:0 0 28px;font-size:15px;line-height:1.55;color:#4c4c50;">${o.intro}</p>
${o.body}
<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e9e9ed;font-size:13px;line-height:1.5;color:#646469;">${o.note}</p>
</td></tr>
<tr><td style="padding:24px 8px 0;font-family:${font};font-size:12px;line-height:1.5;color:#86868b;text-align:center;">Este es un correo automático de GPOS. No respondas a este mensaje.</td></tr>
</table></td></tr></table></body></html>`;
}

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
      html: emailLayout({
        preheader: `Tu código es ${code}. Vence en ${deviceCodeMinutes} minutos.`,
        title: "Autoriza este dispositivo",
        intro:
          "Alguien inició sesión en tu cuenta de GPOS desde un dispositivo nuevo. Escribe este código para autorizarlo:",
        body: `${codeBoxes(code)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;font-size:14px;line-height:1.5;">
<tr><td style="color:#646469;padding:4px 0;">Dispositivo</td><td align="right" style="color:#1d1d1f;padding:4px 0;">${escapeHtml(device || "Dispositivo desconocido")}</td></tr>
<tr><td style="color:#646469;padding:4px 0;">Vence en</td><td align="right" style="color:#1d1d1f;padding:4px 0;">${deviceCodeMinutes} minutos</td></tr>
</table>`,
        note: 'Después de verificarlo, ese dispositivo no volverá a pedir código. <strong style="color:#1d1d1f;">Si no fuiste tú</strong>, no compartas el código y cambia tu contraseña.',
      }),
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
      html: emailLayout({
        preheader: `El enlace vence en ${recoveryMinutes} minutos.`,
        title: "Restablece tu contraseña",
        intro:
          "Recibimos una solicitud para cambiar la contraseña de tu cuenta de GPOS. Pulsa el botón para elegir una nueva.",
        body: `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="background:#006bd6;border-radius:999px;"><a href="${escapeHtml(url.toString())}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Elegir nueva contraseña</a></td></tr></table>
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#646469;">¿El botón no funciona? Copia este enlace en tu navegador:<br><a href="${escapeHtml(url.toString())}" style="color:#006bd6;word-break:break-all;">${escapeHtml(url.toString())}</a></p>`,
        note: `El enlace vence en ${recoveryMinutes} minutos y se puede usar una sola vez. Si no solicitaste el cambio, ignora este correo: tu contraseña sigue igual.`,
      }),
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
