# Auditoría de seguridad — GPOS

Fecha: 2026-11-18 · Alcance: repositorio completo (`apps/api`, `apps/web`, `prisma`, `scripts`, CI y documentación de despliegue) en la rama `main`.
Referencias: OWASP Top 10 (2021) y OWASP ASVS 4.0 (niveles 1–2).

> Este informe no declara que el sistema sea completamente seguro. Distingue entre **corregido y verificado**, **revisado sin hallazgos** y **pendiente**.

## 1. Resumen

GPOS ya tenía una base sólida: contraseñas con bcrypt, tokens de acceso cortos ligados a una sesión revocable, refresh opaco rotativo en cookie `HttpOnly`/`Secure`/`SameSite=strict`, validación de entrada con Zod en todas las rutas, consultas solo con Prisma (sin SQL crudo), aislamiento por empresa y sucursal en el servidor, idempotencia en pagos y rondas, y cabeceras de seguridad con Helmet.

En una segunda fase se cerraron los riesgos residuales: verificación de dispositivos por correo (dos pasos), bloqueo persistente, gracia en la renovación de sesión, CSP estricta y cola sin conexión por usuario (sección 2b).

La auditoría encontró **8 problemas reales**: 2 altos (control de acceso y disponibilidad en producción), 3 medios y 3 bajos. Se corrigieron los 8 y cada corrección tiene una prueba automática o una verificación contra el servidor compilado en modo producción. Quedan riesgos residuales y tareas manuales de infraestructura (secciones 5 a 7).

## 2. Vulnerabilidades identificadas y corregidas

| # | Gravedad | Hallazgo | OWASP | Archivos | Estado |
|---|---|---|---|---|---|
| 1 | **Alta** | Un usuario ADMIN podía editar la cuenta del OWNER: cambiarle la contraseña, bajarle el rol o desactivarlo, y tomar el control del negocio (escalamiento de privilegios). | A01 Broken Access Control | `apps/api/src/catalog.ts` | Corregido y verificado |
| 2 | **Alta** | Sin `trust proxy`, detrás del proxy de Hostinger todos los clientes comparten la IP del proxy: el límite de 20 peticiones/min de `/auth` se agotaría para todos (cualquiera podía bloquear el inicio de sesión de toda la plataforma). | A04 / A05 | `apps/api/src/main.ts`, `docs/DESPLIEGUE.md`, `.env.example` | Corregido y verificado (requiere `TRUST_PROXY=1` en Hostinger) |
| 3 | Media | Enumeración de cuentas por tiempo: con un correo inexistente el login respondía sin pasar por bcrypt (≈0 ms frente a ≈250 ms). | A07 Identification & Auth Failures | `apps/api/src/auth.ts` | Corregido y verificado |
| 4 | Media | Sin protección de fuerza bruta por cuenta: solo había límite por IP; con muchas IPs se podían probar contraseñas indefinidamente contra una cuenta. | A07 | `apps/api/src/auth.ts` | Corregido y verificado |
| 5 | Media | Los inicios de sesión fallidos no se auditaban y los exitosos no guardaban la IP. | A09 Logging & Monitoring Failures | `apps/api/src/auth.ts` | Corregido y verificado |
| 6 | Baja | El resto de la API no tenía límite de peticiones (abuso automatizado, scraping). | A04 | `apps/api/src/main.ts` | Corregido y verificado |
| 7 | Baja | bcrypt ignora lo que pasa de 72 bytes; registro y usuarios aceptaban contraseñas de hasta 128 caracteres que se truncaban en silencio (el restablecimiento sí lo validaba). | A07 / ASVS 2.1 | `apps/api/src/auth.ts`, `apps/api/src/catalog.ts` | Corregido y verificado |
| 8 | Baja (higiene) | Rutas como `/.env` o `/.git/config` respondían 200 con la página de la app. **No filtraban nada** (se comprobó el contenido), pero confundían escáneres y ocultaban intentos. | A05 | `apps/api/src/main.ts` | Corregido y verificado (ahora 404) |

### Detalle de las correcciones

1. **Propietario protegido.** Al editar un usuario, si el destino es OWNER y quien edita no es OWNER, se responde 403 «Solo el propietario puede modificar su cuenta». El propietario recupera su acceso con «¿Olvidaste tu contraseña?».
2. **`TRUST_PROXY`.** Nueva variable: `TRUST_PROXY=1` (número de proxies) o lista de IPs. Sin definir, Express no confía en `X-Forwarded-For`, así que no se puede falsificar la IP.
3. **Tiempo igualado.** Si el correo no existe se compara contra un hash bcrypt fijo de costo 12, con el mismo tiempo que un correo real.
4. **Bloqueo por cuenta.** 8 intentos fallidos por correo bloquean esa cuenta 15 minutos (HTTP 429), aunque la contraseña sea correcta, y se suma al límite por IP. Un acceso exitoso reinicia el contador.
5. **Auditoría.** `LOGIN_FAILED` (con IP y número de intento) y `LOGIN` (con IP) quedan en `AuditLog`. No se registran contraseñas ni tokens. No existe ninguna ruta que edite o borre registros de auditoría.
6. **Límite general.** 600 peticiones/min por IP en `/api/v1`, excepto `/health`, con margen para POS y cocina (que consulta cada 4 s).
7. **Regla única de contraseña.** `passwordSchema`: de 10 caracteres a 72 bytes, usada en registro, restablecimiento y alta/edición de usuarios.
8. **Archivos ocultos.** El fallback de la web devuelve 404 para cualquier ruta con un segmento que empieza por punto.

## 2b. Segunda fase: riesgos residuales cerrados

| Riesgo de la primera fase | Solución implementada | Archivos | Estado |
|---|---|---|---|
| Sin MFA | **Verificación de dispositivo por correo**: un dispositivo nuevo recibe un código de 6 dígitos desde el buzón `no-reply` del hosting (10 min, 5 intentos, hash con sal por usuario, comparación en tiempo constante, consumo atómico de un solo uso). El navegador verificado recibe una cookie `gpos_device` (`HttpOnly`, `Secure`, `SameSite=strict`, 180 días, guardada como hash) y no vuelve a pedir código. Cambiar la contraseña desautoriza todos los dispositivos. Se auditan `DEVICE_CHALLENGE`, `DEVICE_CODE_FAILED` y `DEVICE_VERIFIED` con IP y navegador. | `auth.ts`, `recovery-mail.ts`, `App.tsx`, `schema.prisma` + migración `20261118120000_device_verification` | Corregido y verificado |
| Bloqueo por cuenta en memoria | Pasa a la tabla `LoginAttempt`: sobrevive a reinicios y se comparte entre instancias. Los códigos fallidos también cuentan. | `auth.ts` | Corregido y verificado |
| Bloquear a una víctima conociendo su correo | El bloqueo solo aplica a dispositivos **no** autorizados: el dueño en su dispositivo verificado siempre entra. | `auth.ts` | Corregido y verificado |
| Carrera al renovar la sesión entre pestañas | La rotación del refresh deja el token anterior válido 30 s (ventana de gracia) en lugar de borrarlo; pasado ese tiempo deja de servir. | `auth.ts` | Corregido y verificado |
| CSP con `style-src 'unsafe-inline'` | CSP de estilos estricta (`'self'`): Vite emite CSS en archivos y React aplica estilos por CSSOM. Se recorrió la app compilada sin violaciones de CSP en consola. | `main.ts` | Corregido y verificado |
| Pedidos sin conexión en equipo compartido | Cada pedido pendiente guarda su usuario: solo ese usuario lo ve y lo envía. Antes, otro usuario en el mismo equipo lo habría enviado a su nombre. | `outbox.ts`, `App.tsx`, `pos.tsx` | Corregido y verificado |

## 3. Revisado sin hallazgos (comprobado en el código)

- **Contraseñas:** bcrypt costo 12. **Sesiones:** access JWT HS256 de 15 min con `sid` validado contra `RefreshSession` en cada petición (cerrar sesión revoca al instante). Refresh aleatorio de 48 bytes guardado como SHA-256, rotado en cada uso, cookie `HttpOnly`, `Secure` en producción, `SameSite=strict`, `path=/api/v1/auth`, 7 días.
- **Recuperación de contraseña:** token de 32 bytes guardado con hash, un solo uso, 30 min, respuesta idéntica exista o no la cuenta, y cierre de todas las sesiones al cambiar la clave.
- **CSRF:** la API usa `Authorization: Bearer` (no cookies). La única cookie está limitada a `/api/v1/auth` con `SameSite=strict`.
- **Control de acceso:** permisos por operación (`modulo.accion`) en cada ruta. Las rutas `admin/*` exigen Super Admin (todas verificadas). El Super Admin no puede operar en empresas. Solo OWNER y ADMIN gestionan usuarios.
- **Aislamiento multiempresa (IDOR/BOLA):** catálogo y operaciones filtran por `tenantId` o por la sucursal autorizada del usuario (`branchFor` valida que la sucursal pertenezca al usuario y a su empresa). Los IDs foráneos (cliente, mesa, ingrediente, proveedor, modificador, domiciliario, categoría) se validan contra la empresa. La prueba de integración existente cruza dos empresas.
- **Inyección SQL:** solo Prisma con consultas parametrizadas; no hay `$queryRaw`/`$executeRaw`.
- **Inyección de comandos / SSRF / carga de archivos:** la API no ejecuta procesos, no hace peticiones a URLs del usuario y no recibe archivos (las importaciones CSV/Excel se procesan en el navegador y llegan como JSON validado).
- **XSS:** React escapa la salida; no hay `dangerouslySetInnerHTML`, `innerHTML` ni `eval`. La CSP de Helmet limita los scripts a `'self'`.
- **Mass assignment:** Zod descarta campos no declarados; permisos y empresa se fijan en el servidor.
- **Lógica de negocio:** precios, impuestos, totales y descuentos se calculan en el servidor (los descuentos exigen permiso). Pagos idempotentes por clave, rondas por `requestKey` y pedidos por `requestKey` con índice único. Las mesas se toman con un `updateMany` atómico condicionado a `LIBRE`. Stock, pago y caja se confirman en la misma transacción.
- **Errores:** respuestas genéricas sin trazas; el detalle solo va al log del servidor (código 500).
- **Secretos:** no hay secretos en el código ni en el historial de Git (se revisaron todos los commits; solo aparece la contraseña de la base efímera del CI y ejemplos). `.env` está en `.gitignore`. El frontend no recibe secretos. El arranque falla si `JWT_SECRET` tiene menos de 32 caracteres.
- **Dependencias de producción:** `npm audit --omit=dev` → 0 vulnerabilidades.

## 4. Pruebas realizadas y resultados

| Prueba | Resultado |
|---|---|
| `npm test` + integración (`RUN_INTEGRATION=true`, API compilada contra MySQL), igual que el CI | **12/12 pasan**, 0 omitidas |
| `apps/api/test/security.test.ts` (nueva): regla de 72 bytes; correo inexistente tarda como uno real (>50 ms); 8 fallos bloquean la cuenta aun con la contraseña correcta; 8 `LOGIN_FAILED` auditados; otra cuenta no se afecta y su `LOGIN` guarda la IP; ADMIN no puede modificar al OWNER y su rol/contraseña quedan intactos | Pasa |
| Límite por IP sin `TRUST_PROXY`, cambiando `X-Forwarded-For` en cada intento (build de producción) | 429 a partir del intento 21: **no se puede evadir** |
| Con `TRUST_PROXY=1`, 22 clientes distintos | Ningún 429: cada cliente tiene su propio límite |
| Límite general: 632 peticiones en un minuto | 32 respuestas 429 (exactamente lo que excede 600) |
| `/.env`, `/.git/config`, rutas con `%2e%2e`, `/package.json`, código fuente | 404, sin contenido sensible. `/`, `/app/pos`, `/legal` siguen en 200 |
| Cabeceras en producción | CSP, HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` presentes |
| Compilación API y web; `npm run build:hostinger` | OK |
| `security.test.ts` (segunda fase): dispositivo nuevo pide código y no entrega tokens; código incorrecto rechazado y auditado; código correcto autoriza y deja cookie; el código no se reutiliza; dispositivo autorizado entra sin código; 8 fallos bloquean (en la base) a otros dispositivos pero no al autorizado; dos renovaciones simultáneas funcionan y el token vence al acabar la gracia | Pasa |
| Navegador, build compilado con CSP estricta: login → «Verifica este dispositivo» → código → entra; cerrar sesión y volver a entrar en el mismo navegador **no pide código**; sin violaciones de CSP | OK |
| `outbox.test.ts`: los pedidos de otro usuario en el mismo equipo no se envían | Pasa |

## 5. Problemas que no se solucionaron

- **`picomatch` ≤ 4.0.7 (ReDoS, alta según npm), vía Vite.** Solo afecta a la compilación, no al servidor en producción, y no es explotable porque los patrones son del proyecto. No existe versión corregida (4.0.7 es la última) y la «solución» de npm sería bajar Vite de versión mayor. Revisar cuando se publique un parche.
- **Enumeración por registro.** Registrarse con un correo existente responde «El registro ya existe». Es habitual en SaaS y está limitado por la tasa de `/auth`; ocultarlo exigiría verificación por correo al registrarse.

## 6. Acciones manuales pendientes (requieren tu autorización o acceso)

1. **En Hostinger, configurar `TRUST_PROXY=1`.** Sin esta variable, la corrección #2 no tiene efecto.
2. **Secretos nuevos para producción:** `JWT_SECRET` aleatorio de 32 caracteres o más, distinto al de desarrollo. `JWT_REFRESH_SECRET` no se usa hoy (está reservado).
3. **Usuario MySQL exclusivo** para GPOS con permisos solo sobre su base (`SELECT, INSERT, UPDATE, DELETE` y, para migraciones, `CREATE, ALTER, INDEX, REFERENCES`), contraseña robusta y acceso de red restringido.
4. **Copias de seguridad automáticas** de la base y una prueba de restauración en otra base.
5. **Reparar GitHub Actions:** los jobs fallan al arrancar por la cuenta o la facturación, así que hoy ningún cambio se prueba automáticamente.
6. **HTTPS obligatorio:** la cookie de sesión es `Secure` en producción y no funciona sin HTTPS.
7. **Monitoreo:** alertas sobre el log de la API (errores 500) y revisión periódica de `LOGIN_FAILED` en la auditoría.

## 7. Riesgos residuales

- **La verificación por correo depende del buzón.** Si el correo de la cuenta está comprometido, el segundo factor también lo está; es más débil que una app autenticadora o una llave física. En producción sin `SMTP_PASSWORD` la verificación queda desactivada (se documenta en `docs/DESPLIEGUE.md`).
- Una cookie de dispositivo robada (por ejemplo, de un equipo infectado) evita el código durante su vigencia, aunque sigue haciendo falta la contraseña. Cambiar la contraseña la revoca.
- Dentro de la ventana de gracia de 30 s, un refresh ya rotado todavía sirve una vez más.
- El bloqueo por cuenta todavía puede impedir el acceso **desde dispositivos nuevos** durante 15 minutos a quien conozca un correo; los dispositivos ya autorizados no se ven afectados.
- Los pedidos sin conexión siguen guardándose en `localStorage` del dispositivo (productos, cliente y dirección, sin datos de pago) hasta que se envían.
- `picomatch` (dependencia de compilación) sigue sin parche publicado.
- No se hizo un pentest externo ni pruebas de carga.

## 8. Recomendaciones para producción

1. Desplegar con las variables de `docs/DESPLIEGUE.md`, incluida `TRUST_PROXY=1`, y verificar `/api/v1/health` por HTTPS.
2. Crear el Super Admin con `npm run admin:create` y una contraseña larga y única, y configurar `SMTP_PASSWORD` antes de abrir el acceso para que la verificación de dispositivos esté activa.
3. Programar `npm run maintenance` a diario (limpia sesiones vencidas y suspende pruebas vencidas).
4. No ejecutar en producción las pruebas de integración (`RUN_INTEGRATION`), porque crean empresas QA.
5. Revisar dependencias en cada versión (`npm audit --omit=dev`) y volver a esta auditoría ante cambios de autenticación o permisos.
