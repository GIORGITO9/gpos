# GPOS · SaaS POS para restaurantes y tiendas

GPOS funciona en dos modos, que el Super Admin elige por empresa: **Restaurante** (mesas, cocina y recetas) y **Tienda** de productos o servicios (venta en mostrador, inventario por producto, servicios sin stock, despachos de domicilios y mesas opcionales). Los pedidos enviados a cocina sin conexión se guardan en el dispositivo y se envían solos al volver la red.

Aplicación web funcional con React + TypeScript + Vite, API NestJS, Prisma y MySQL 8. La interfaz sigue la guía `appledesing.md`: tipografía del sistema, superficies claras, navegación translúcida, feedback inmediato y movimiento reducido.

## Abrir la instalación local

```sh
npm run dev
```

Aplicación: http://127.0.0.1:5173 · API: http://127.0.0.1:3000/api/v1

En este equipo se preparó una base MySQL aislada del proyecto en el puerto **3307**, con datos ficticios:

- Correo: `demo@gpos.local`
- Contraseña local: la que se configuró en `DEMO_PASSWORD` al crear la cuenta.
- Empresa: **La Buena Mesa · Demo**

Es una cuenta de demostración, no una credencial de producción. La contraseña del seed se toma de `DEMO_PASSWORD`; no se instala una cuenta demo a menos que `SEED_DEMO=true`.

Si el MySQL local está detenido, en otra terminal:

```sh
sh scripts/local-mysql.sh start
```

La configuración y los archivos de MySQL están en `.env` y `.local/`, ambos excluidos del repositorio. Este MySQL local usa root sin contraseña y escucha **solo en loopback**; no debe reutilizarse en producción.

## Impresión directa de comprobantes en macOS

1. Agrega la impresora térmica en **Ajustes del Sistema → Impresoras y escáneres** y selecciona en su controlador el tamaño del rollo instalado. Puedes conservar la impresora predeterminada que ya usas.
2. Con el servidor local en marcha, abre la caja desde la carpeta de GPOS:

   ```sh
   npm run pos:print
   ```

3. En el POS abre **Configurar impresión**, elige la **Impresora térmica** y el ancho de **58 mm** u **80 mm**, activa la impresión automática y guarda. La ventana de caja recuerda estas preferencias en su perfil de Chrome.
4. Confirma el cobro. Al quedar saldado el pedido, GPOS envía el comprobante directamente a la impresora elegida. Si la impresora deja de estar disponible, puedes elegir otra y reimprimir desde el pedido cerrado.

Mantén abierta la terminal donde ejecutaste `npm run pos:print` mientras uses esta ventana.

Para volver a la impresión con diálogo, abre el POS en tu navegador habitual. Si cambias de rollo, ajusta tanto el controlador como el ancho guardado en el POS.

## Instalación limpia

1. Usa Node.js 22 o superior y MySQL 8. Se incluye `compose.yaml` como alternativa local.
2. Copia `.env.example` a `.env`. Configura `DATABASE_URL` y un `JWT_SECRET` aleatorio de al menos 32 caracteres.
3. Crea la base `saas_pos` con `utf8mb4` y asigna un usuario exclusivo de aplicación.
4. Ejecuta:

```sh
npm ci
npm run db:generate
npm run db:setup
npm run dev
```

`db:setup` aplica migraciones y crea planes. Sin `SEED_DEMO=true`, no crea negocios ni ventas ficticias. El registro público crea una empresa aislada, una sucursal, una caja y un propietario.

Los precios comerciales de los planes empiezan en cero como **configuración pendiente**, no como oferta de servicio gratuito. El administrador debe definirlos antes de comercializar.

## Flujo operativo

1. Registra tu negocio o entra con la cuenta demo.
2. Crea categorías y productos. Configura variantes, adicionales, precios por servicio y recetas desde el icono de configuración de cada producto.
3. Si controlas inventario, crea ingredientes y registra existencias. Activa «Descontar receta al vender» en el producto.
4. Abre caja e indica la base inicial.
5. En el POS selecciona mesa, domicilio, recoger o llevar; agrega productos y envía a cocina.
6. Cocina avanza el pedido: nuevo → preparación → listo → entregado. Los domicilios permiten asignar un conductor y marcar en camino.
7. Cobra cuando el pedido esté entregado. Los pagos mixtos deben sumar el total exacto.
8. El pago cierra la venta, libera la mesa, descuenta la receta, mueve caja y registra auditoría en una transacción.
9. Revisa reportes, imprime el comprobante y cierra el turno con el efectivo contado.

Las ventas deben entregarse antes de cobrarse en esta implementación. No hay pago anticipado con preparación pendiente.

## Funciones implementadas

- Registro, login, sesión JWT en memoria y renovación mediante cookie HttpOnly con rotación. Logout invalida la sesión.
- Empresas aisladas, sucursales autorizadas, roles y permisos comprobados por servidor.
- Catálogo, categorías, variantes, modificadores, precios por servicio, clientes y direcciones guardadas.
- POS, mesas y zonas, cuentas de mesa con rondas adicionales, edición antes de preparar, notas, cocina con estaciones y polling, domicilios y recogidas.
- Traslado de cuentas a mesas libres y cobro por partes desde el detalle de una mesa. Cada parte registra su medio de pago y el saldo se conserva hasta el cierre.
- Caja por usuario y registro; apertura, movimientos, cobros mixtos, arqueo y cierre.
- Idempotencia de pago y transacciones serializables con reintentos ante conflictos.
- Devoluciones parciales/completas y auditoría. No se repone comida preparada automáticamente.
- Ingredientes, recetas, existencias por sucursal, entradas, ajustes, mermas y traslados.
- Proveedores, órdenes de compra, recepción única, saldo por pagar y registro de abonos externos.
- Reportes por período, productos, medios de pago, usuario, cliente, categoría y sucursal. CSV, Excel y salida PDF mediante impresión.
- Importación CSV/XLSX de productos, clientes e ingredientes con revisión y errores por fila.
- Dashboard, notificaciones internas, configuración fiscal porcentual, onboarding y landing.
- Super Admin: empresas, planes, estados de suscripción, límites y métricas MRR/ARR. Sin acceso operativo implícito.
- Cron de mantenimiento para expiración de pruebas y limpieza de sesiones.

## Administración de plataforma

Configura `ADMIN_EMAIL` y `ADMIN_PASSWORD` (12 caracteres mínimo), luego ejecuta:

```sh
npm run admin:create
```

Inicia sesión con ese usuario. La aplicación abre `/admin`. No crea un administrador global con contraseña predeterminada.

## Comprobaciones

```sh
npm run build
npm test
# Requiere API local iniciada y MySQL de pruebas:
npm run test:integration
npm audit
```

La prueba integral crea **empresas QA ficticias nuevas**; no borra registros existentes. Cubre autorización, aislamiento entre empresas y sucursales, manipulación de precios, mesa ocupada, transiciones, cobro sin caja, totales inválidos, dos pagos simultáneos con una misma clave, devolución, arqueo, stock insuficiente con rollback, descuento de receta, recepción de compra y logout. No ejecutarla contra producción.

## Entrega y límites

Consulta [docs/ALCANCE.md](docs/ALCANCE.md) para diferenciar lo implementado, los límites actuales y las fases pendientes. La integración real con WhatsApp, DIAN/proveedor fiscal, pasarelas y email **no está implementada ni activada**. Seleccionar un origen en el POS solo registra el canal manualmente.

La preparación para Hostinger está en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md). No se ha desplegado en una cuenta de hosting ni configurado un dominio público.
