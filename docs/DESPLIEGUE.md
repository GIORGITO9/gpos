# Despliegue de GPOS

Se requiere un entorno que ejecute procesos Node.js y permita conectar con MySQL 8. El código no convierte un hosting estático en un servidor Node. Confirma los recursos disponibles en tu cuenta de Hostinger; para control del proceso, proxy y cron, también puede utilizarse un VPS.

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
