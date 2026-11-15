import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const runCommand = promisify(execFile);
const commandOptions = {
  env: { ...process.env, LC_ALL: "C" },
  timeout: 10000,
};

export async function connectReceiptPrinter(page, origin, run = runCommand) {
  async function printers() {
    const { stdout } = await run(
      "/usr/bin/lpstat",
      ["-a"],
      commandOptions,
    ).catch((error) => {
      if (error.code === 1 && !error.stdout) return { stdout: "" };
      throw error;
    });
    return Array.from(
      stdout.matchAll(/^([\w.-]+)[ \t]/gm),
      ([, name]) => name,
    ).sort();
  }

  await page.exposeBinding(
    "gposReceiptPrinter",
    async (source, action, printer) => {
      if (
        source.frame !== page.mainFrame() ||
        new URL(source.frame.url()).origin !== origin
      ) {
        throw new Error("Impresión disponible solo desde GPOS.");
      }

      const available = await printers();
      if (action === "list") return available;
      if (action !== "print" || !available.includes(printer)) {
        throw new Error("La impresora seleccionada ya no está disponible.");
      }

      const receipt = page.locator(".print-receipt .thermal-receipt");
      if ((await receipt.count()) !== 1) {
        throw new Error("Abre el comprobante antes de imprimir.");
      }

      const pdf = await page.pdf({
        preferCSSPageSize: true,
        displayHeaderFooter: false,
      });
      const directory = await mkdtemp(join(tmpdir(), "gpos-receipt-"));
      try {
        const file = join(directory, "Comprobante.pdf");
        await writeFile(file, pdf, { mode: 0o600 });
        await run(
          "/usr/bin/lp",
          ["-d", printer, "-o", "print-scaling=none", file],
          commandOptions,
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
