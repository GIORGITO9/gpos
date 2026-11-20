// Pedidos en línea: activar el menú público y obtener el enlace y los QR por mesa.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Copy, ExternalLink, Printer, QrCode } from "lucide-react";
import { api, get, useSession, usesTables, can } from "./api";
import { Button, useToast } from "./ui";

function Qr({ url, size = 168 }: { url: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, { width: size * 2, margin: 1 }).then(setSrc, () =>
      setSrc(""),
    );
  }, [url, size]);
  return src ? (
    <img src={src} width={size} height={size} alt={"Código QR de " + url} />
  ) : (
    <span className="qr-placeholder" style={{ width: size, height: size }} />
  );
}

export function OnlineOrdersSettings({ settings }: { settings: any }) {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const tables = useQuery({
    queryKey: ["tables", s.branchId],
    queryFn: () => get("tables?limit=100"),
    enabled: usesTables(s.user),
  });
  const base = `${location.origin}/menu/${s.branchId}`;
  const enabled = !!settings.onlineOrders;
  async function toggle() {
    setBusy(true);
    try {
      const { name, nit, phone, address, city, taxRate } = settings;
      await api(
        "settings",
        { name, nit, phone, address, city, taxRate, onlineOrders: !enabled },
        "PUT",
      );
      qc.invalidateQueries();
      toast(
        enabled ? "Pedidos en línea pausados" : "Pedidos en línea activados",
      );
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Enlace copiado");
    } catch {
      toast("No se pudo copiar. Selecciona el enlace y cópialo.", true);
    }
  }
  return (
    <section className="panel settings-panel online-settings">
      <h2>Menú QR y pedidos en línea</h2>
      <p className="muted">
        Tus clientes ven el menú y piden desde el celular, sin descargar nada.
        Cada pedido llega a Pedidos como «Por aceptar» y pasa a cocina cuando lo
        aceptas.
      </p>
      <label className="switch-row large">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || !can(s.user, "configuracion.editar")}
          onChange={toggle}
        />
        {enabled ? "Recibiendo pedidos en línea" : "Pedidos en línea pausados"}
      </label>
      <div className="online-link">
        <Qr url={base} />
        <div>
          <strong>Enlace del negocio</strong>
          <p className="muted">
            Para WhatsApp, Instagram o un QR en la puerta. Los pedidos son para
            recoger.
          </p>
          <code>{base}</code>
          <div className="button-row">
            <Button onClick={() => copy(base)}>
              <Copy size={16} /> Copiar enlace
            </Button>
            <a className="button" href={base} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Ver menú
            </a>
          </div>
        </div>
      </div>
      {usesTables(s.user) && (tables.data?.length ?? 0) > 0 && (
        <>
          <div className="panel-title">
            <h3>
              <QrCode size={18} aria-hidden="true" /> QR por mesa
            </h3>
            <Button onClick={() => window.print()}>
              <Printer size={16} /> Imprimir QR
            </Button>
          </div>
          <p className="muted">
            Pégalo en cada mesa: el pedido llega con el número de mesa.
          </p>
          <div className="qr-grid">
            {tables.data.map((t: any) => (
              <figure key={t.id} className="qr-card">
                <Qr url={`${base}?mesa=${t.id}`} size={140} />
                <figcaption>
                  <strong>{t.name}</strong>
                  <small>Escanea y pide</small>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
