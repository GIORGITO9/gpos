# Despliegue de GPOS

Se requiere un entorno que ejecute procesos Node.js y permita conectar con MySQL 8. El código no convierte un hosting estático en un servidor Node. Confirma los recursos disponibles en tu cuenta de Hostinger; para control del proceso, proxy y cron, también puede utilizarse un VPS.

## App web de Node.js en hPanel

1. En **Sitios web → Crear sitio → App web de Node.js**, selecciona el repositorio privado `GIORGITO9/gpos` y la rama `main`. Si Hostinger solicita acceso a GitHub, limita el acceso a ese repositorio.
2. Elige Node.js **22**, npm y la raíz **`./`**. Selecciona **NestJS** o **Other** si el panel no detecta el proyecto desde la raíz.
3. Usa **`npm run build`** con **`GPOS_HOSTINGER_BUILD=true`** en las variables del panel, o selecciona **`npm run build:hostinger`** si aparece en el desplegable. Usa **`apps/api/dist/main.js`** como punto de entrada. El despliegue debe conservar tanto `apps/api/dist` como `apps/web/dist`, porque la API sirve la web desde esa carpeta. Si el panel exige un directorio de salida para el servidor, selecciona `apps/api/dist` y comprueba que no se descarte la web compilada.
4. Añade las variables indicadas abajo en hPanel. Usa una base nueva para GPOS y conserva el puerto que asigne Hostinger. Configura `SERVE_WEB=true`, `NODE_ENV=production`, `FRONTEND_URL` con el dominio HTTPS definitivo y `NPM_CONFIG_INCLUDE=dev` para que la compilación tenga Prisma CLI, TypeScript y Vite.
5. Revisa el log de compilación y verifica `/api/v1/health`, el acceso por HTTPS y un pedido de prueba. El comando aplica las migraciones pendientes y crea los planes iniciales sin datos demo ni sobrescribir planes existentes.

## Recuperación de contraseñas

En **Sitios web → gpos.webcodecol.com → Variables de entorno**, guarda `SMTP_PASSWORD` con la contraseña del buzón `no-reply@webcodecol.com`. GPOS usa ese remitente y el servidor `smtp.hostinger.com:465` (TLS) por defecto. Para usar otro buzón o servidor, configura `SMTP_USER`, `SMTP_HOST` y `SMTP_PORT`. El primer origen de `FRONTEND_URL` debe ser el dominio público HTTPS de GPOS para construir el enlace.

Tras aplicar las variables, solicita la recuperación desde **¿Olvidaste tu contraseña?** con una cuenta de prueba que pueda recibir correo. Verifica que el mensaje llegue, que permita cambiar la contraseña y que esta funcione al iniciar sesión. El enlace vence en 30 minutos y solo puede usarse una vez. El cambio cierra las sesiones de la cuenta.

## Variables

Configura en el entorno del servidor, nunca en Git:

- `NODE_ENV=production`
- `DATABASE_URL=mysql://usuario:password@host:3306/saas_pos`
- `JWT_SECRET`: al menos 32 caracteres aleatorios, distinto al de desarrollo.
- `FRONTEND_URL=https://app.tudominio.com` (orígenes exactos separados por coma si hace falta).
- `PORT`: puerto asignado por el hosting.
- `HOST`: `127.0.0.1` detrás de un proxy local o `0.0.0.0` si el contenedor de la plataforma lo requiere.
- `SERVE_WEB=true` para servir la web compilada y la API desde el mismo proceso.
- `SEED_DEMO=false`
- `TRIAL_DAYS=14` o la duración comercial elegida.

El navegador llama a `/api/v1` en el mismo origen. La ruta recomendada es servir web y API bajo el mismo dominio/proxy; si los separas en subdominios, conserva el proxy `/api` o adapta deliberadamente la URL base y las cookies.

## Preparación

Desde la raíz del proyecto:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
```

El seed de producción crea planes, sin datos demo. Configura sus tarifas desde Super Admin. No uses `prisma migrate dev` ni `db push` para desplegar cambios sobre datos de producción.

Comando de inicio:

```sh
npm start
```

Punto de entrada equivalente: `apps/api/dist/main.js`. El hosting debe conservar también `apps/web/dist`, el cliente generado de Prisma y las dependencias necesarias.

`GET /api/v1/health` verifica que el proceso responde. Además, prueba login, creación de pedido y lectura de catálogo para verificar la base de datos.

## Proxy de ejemplo para VPS

```nginx
server {
    listen 80;
    server_name app.tudominio.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Activa TLS con el mecanismo del hosting. En producción la cookie de renovación usa `Secure`, por lo que el acceso necesita HTTPS. Configura el proceso para reinicio automático usando el supervisor disponible en tu infraestructura. Si configuras `trust proxy`, limita los saltos/proxies de confianza a tu topología para que el rate limiting no pueda evadirse con cabeceras falsas.

## Cron

Ejecuta desde la raíz una vez al día:

```sh
npm run maintenance
```

Suspende pruebas vencidas y limpia sesiones expiradas. No procesa cobros externos ni envía mensajes. Conserva los logs del cron fuera del directorio público.

## Antes de recibir ventas reales

- Crea el Super Admin con `npm run admin:create` y variables privadas `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- Define tarifas, funciones y límites de los planes.
- Usa una base y un usuario MySQL exclusivos con contraseña robusta y acceso de red restringido.
- Configura backups automáticos y prueba restaurarlos en otra base.
- Repite las pruebas en staging. La prueba integral crea empresas QA y no debe ejecutarse en producción.
- Verifica el impuesto y el flujo contable con quien lleva la operación; este sistema no emite facturas electrónicas.
- Configura monitoreo de proceso, errores y espacio de disco.

No hay un despliegue remoto realizado como parte de esta entrega.
