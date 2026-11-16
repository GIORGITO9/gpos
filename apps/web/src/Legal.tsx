import { type ComponentType, useEffect } from "react";
import { localLegalPreview, useTerms } from "./legal-client";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, FileText, Mail, ShieldCheck } from "lucide-react";

const contactEmail = "webcodecol@webcodecol.com";
const privacyContact = `mailto:${contactEmail}?subject=Protecci%C3%B3n%20de%20datos%20GPOS`;
type Operator = {
  name: string;
  taxId?: string;
  city: string;
  address?: string;
  phone?: string;
};
type LegalInformation = { operator: Operator; effectiveDate?: string };
const draftInformation: LegalInformation = {
  operator: {
    name: "GIGATEC CÚCUTA",
    taxId: "1093746862-3",
    city: "Cúcuta, Colombia",
  },
};

const documents = [
  { id: "terminos", label: "Términos de uso", icon: FileText },
  { id: "privacidad", label: "Política de privacidad", icon: ShieldCheck },
] as const;

function Contact() {
  return <a href={privacyContact}>{contactEmail}</a>;
}

export default function Legal({
  Brand,
  information = draftInformation,
}: {
  Brand: ComponentType;
  information?: LegalInformation;
}) {
  const operator = information?.operator;
  const effectiveDate = information?.effectiveDate;
  const showPrivacy = Boolean(effectiveDate) || localLegalPreview;
  const terms = useTerms();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [hash]);

  useEffect(() => {
    const previous = document.title;
    document.title = "Información legal · GPOS";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="legal-layout">
      <header className="legal-shell legal-header">
        <Brand />
        <Link to="/" className="button">
          <ArrowLeft size={16} aria-hidden="true" /> Volver a inicio
        </Link>
      </header>
      <main className="legal-shell">
        <div className="legal-intro">
          <h1>Información legal</h1>
          <p>
            Condiciones de uso de GPOS, información del titular y canales de
            contacto.
          </p>
          {effectiveDate ? (
            <p>
              <small>Vigente desde el {effectiveDate}.</small>
            </p>
          ) : localLegalPreview ? (
            <p className="legal-draft">
              La política de privacidad está en revisión.
            </p>
          ) : null}
        </div>
        <div className="legal-reading">
          <nav aria-label="Documentos legales">
            {documents
              .filter(({ id }) => id !== "privacidad" || showPrivacy)
              .map(({ id, label, icon: Icon }) => (
                <a key={id} href={"#" + id}>
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </a>
              ))}
            <a href="#contacto">
              <Mail size={18} aria-hidden="true" />
              Contacto legal
            </a>
          </nav>
          <div className="legal-documents">
            <article id="terminos" aria-labelledby="terms-title">
              <h2 id="terms-title">Términos de uso</h2>
              {terms.isPending ? (
                <p role="status">Cargando términos…</p>
              ) : terms.isError ? (
                <p role="alert">
                  No se pudieron cargar los términos.{" "}
                  <button
                    type="button"
                    className="button"
                    onClick={() => void terms.refetch()}
                  >
                    Reintentar
                  </button>
                </p>
              ) : (
                <>
                  <p>
                    <small>Versión {terms.data.version}</small>
                  </p>
                  {terms.data.sections.map((section) => (
                    <div key={section.title}>
                      <h3>{section.title}</h3>
                      {section.paragraphs.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </article>
            {showPrivacy && (
              <article id="privacidad" aria-labelledby="privacy-title">
                <h2 id="privacy-title">Política de privacidad</h2>
                <h3>Quién trata los datos</h3>
                <p>
                  {operatorDetails(operator)} El responsable atiende las
                  solicitudes sobre cuentas, administración del servicio y
                  contactos directos. Cuando un negocio usa GPOS para registrar
                  datos de su equipo, clientes o proveedores, ese negocio
                  determina las finalidades del tratamiento y GPOS actúa como
                  encargado en la medida en que procesa esos datos siguiendo sus
                  instrucciones. El negocio debe informar a las personas sobre
                  el tratamiento, obtener la autorización cuando corresponda y
                  limitar los datos que registra a lo necesario para su
                  operación.
                </p>
                <h3>Qué datos usamos y para qué</h3>
                <ul>
                  <li>
                    <strong>Cuenta y negocio.</strong> Nombre, correo,
                    credenciales protegidas mediante hash y datos del negocio
                    para crear la cuenta, gestionar el acceso y administrar la
                    suscripción.
                  </li>
                  <li>
                    <strong>Operación del negocio.</strong> Datos de usuarios,
                    clientes, proveedores, direcciones de entrega y operaciones
                    que el negocio decida registrar para gestionar su actividad.
                  </li>
                  <li>
                    <strong>Soporte y seguridad.</strong> Información de las
                    solicitudes, sesiones y registros de actividad para atender
                    consultas, recuperar el acceso, gestionar permisos e
                    investigar incidentes.
                  </li>
                </ul>
                <h3>Proveedores, conservación y acceso</h3>
                <p>
                  Usamos servicios de alojamiento y correo para operar la
                  plataforma. Los accesos a información se limitan según las
                  funciones y permisos necesarios. Conservamos la información
                  mientras sea necesaria para la finalidad correspondiente y
                  durante los periodos exigidos por obligaciones legales o
                  contractuales. Las solicitudes de retiro o supresión se
                  evalúan según esas obligaciones. La vigencia de las bases de
                  datos está vinculada a la finalidad de cada tratamiento y a
                  las obligaciones de conservación que resulten aplicables.
                </p>
                <p>
                  Cuando la ley exija autorización, el responsable la solicitará
                  antes del tratamiento. Los cambios sustanciales a esta
                  política se comunicarán antes de aplicarlos y se solicitará
                  una nueva autorización en los casos exigidos por la ley.
                </p>
                <h3>Cookies y almacenamiento del navegador</h3>
                <p>
                  GPOS usa una cookie de sesión para mantener el acceso y
                  almacenamiento local para recordar preferencias, como la
                  sucursal y la configuración de impresión. Puedes borrar estos
                  datos desde tu navegador. Algunas funciones perderán las
                  preferencias guardadas o requerirán iniciar sesión de nuevo.
                </p>
                <h3>Derechos y cómo ejercerlos</h3>
                <p>
                  Puedes solicitar acceso, actualización o rectificación de tus
                  datos, información sobre su uso y prueba de la autorización
                  cuando proceda. También puedes solicitar la revocación de la
                  autorización o la supresión de los datos en los casos
                  previstos por la ley.
                </p>
                <p>
                  Escribe a <Contact /> con tu nombre, correo para responder,
                  negocio relacionado y una descripción de la solicitud.
                  Podremos pedir información proporcional para verificar tu
                  identidad o representación. Si los datos fueron cargados por
                  un negocio, indica cuál para tramitar la solicitud con el
                  responsable correspondiente. Evita enviar contraseñas o
                  códigos de acceso.
                </p>
                <p>
                  Las consultas se atienden en hasta 10 días hábiles y los
                  reclamos en hasta 15 días hábiles, según las reglas y
                  prórrogas de los artículos 14 y 15 de la Ley 1581 de 2012. Una
                  vez agotado el trámite aplicable, puedes acudir a la{" "}
                  <a href="https://www.sic.gov.co/">
                    Superintendencia de Industria y Comercio
                  </a>
                  .
                </p>
              </article>
            )}
            <section id="contacto" aria-labelledby="legal-contact-title">
              <h2 id="legal-contact-title">Contacto legal</h2>
              <p>
                Para consultas de privacidad, tratamiento de datos, términos de
                uso y reclamaciones, escribe a <Contact />.
              </p>
              {operator && (
                <dl className="legal-operator">
                  <div>
                    <dt>Titular</dt>
                    <dd>{operator.name}</dd>
                  </div>
                  {operator.taxId && (
                    <div>
                      <dt>NIT</dt>
                      <dd>{operator.taxId}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Domicilio</dt>
                    <dd>{operator.city}</dd>
                  </div>
                  {operator.address && (
                    <div>
                      <dt>Dirección de notificaciones</dt>
                      <dd>{operator.address}</dd>
                    </div>
                  )}
                  {operator.phone && (
                    <div>
                      <dt>Teléfono</dt>
                      <dd>{operator.phone}</dd>
                    </div>
                  )}
                </dl>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function operatorDetails(value: Operator | undefined) {
  return value
    ? `${value.name}, con domicilio en ${value.city}, opera GPOS.`
    : "La identificación del responsable está pendiente de confirmar.";
}
