import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { connectReceiptPrinter } from "./receipt-printer.mjs";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pos = new URL("http://127.0.0.1:5173/app/pos");
const profile = fileURLToPath(
  new URL("../.local/chrome-pos/", import.meta.url),
);
let browser;

try {
  if (process.platform !== "darwin" || !existsSync(chrome)) {
    throw new Error("Instala Google Chrome en Aplicaciones de macOS.");
  }

  const response = await fetch(pos, {
    signal: AbortSignal.timeout(3000),
  }).catch(() => {
    throw new Error("Inicia el POS con npm run dev y vuelve a intentarlo.");
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error("No se pudo abrir el POS local.");

  browser = await chromium.launchPersistentContext(profile, {
    executablePath: chrome,
    headless: false,
    viewport: null,
  });
  const page = browser.pages()[0] ?? (await browser.newPage());
  await connectReceiptPrinter(page, pos.origin);
  await page.goto(pos.href);
  page.once("close", () => void browser.close());
  console.log("GPOS abierto en modo de impresión directa.");
} catch (error) {
  console.error(error.message);
  await browser?.close();
  process.exitCode = 1;
}
