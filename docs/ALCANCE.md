# Estado frente a la especificación maestra

Esta entrega es una implementación operativa local del núcleo SaaS/POS. No equivale a haber completado todas las fases futuras de las 108 secciones del documento.

| Área | Implementación | Límites o trabajo pendiente |
|---|---|---|
| Autenticación | bcrypt, JWT corto, refresh opaco rotativo, cookie HttpOnly, sesión revocable, rate limiting | Recuperación por correo y MFA pendientes; `JWT_REFRESH_SECRET` se reserva para una eventual variante JWT de refresh |
| Multiempresa | Identidad del servidor, filtros por empresa, validación de sucursal y relaciones entrantes, pruebas con dos empresas | Las relaciones cruzadas se validan en servicios; no todas usan claves foráneas compuestas por tenant |
| Roles | Diez roles previstos incluyendo Super Admin; permisos persistidos y comprobados | No hay editor visual de roles/permisos personalizados; los permisos iniciales se asignan desde `domain.ts` |
| Planes | Funciones y límites configurables, trial, estados, cambio auditado, MRR/ARR | Cobro automático SaaS, pagos SaaS conciliados, churn histórico y conversión por cohortes pendientes |
| POS | Servicios, canal, clientes, productos, variantes, adicionales, precios y notas | Cobro después de entregar todos los productos. Cada ronda admite correcciones de cantidades antes de entrar en preparación |
| Pedidos | Cuentas de mesa con rondas adicionales, traslado a mesa libre y unión de dos mesas ocupadas en la misma sucursal. La mesa de destino conserva los productos, rondas y cobros de ambas | No se crean tickets separados a partir de una cuenta |
| Cocina | Estaciones por producto y polling 4 segundos | Cada ronda de mesa se prepara y entrega por separado. Los estados independientes por estación siguen pendientes |
| Caja | Multicaja, turnos, pagos mixtos, abonos por persona o monto, ingresos, retiros, gastos y arqueo | No incluye hardware de cajón, impresoras ESC/POS o datáfono |
| Devoluciones | Cantidades parciales/completas, motivo, valor y auditoría | Registro por medio de pago. La comida preparada no se repone automáticamente |
| Inventario | Existencias por sucursal, recetas, movimientos, mermas y traslados | Una existencia por ingrediente/sucursal; multi-bodega interna y lotes/vencimientos pendientes |
| Compras | Proveedores, ítems, recepción transaccional única y saldo | Abonos registran pagos externos; no producen transferencias bancarias ni egresos de caja automáticamente |
| Clientes | CRUD, editor de direcciones múltiples y selector en domicilio | Las direcciones se copian al pedido para conservar el historial |
| Reportes | Ventas por período, producto, categoría, cliente, usuario, medio y sucursal. Filtro por sucursales autorizadas y margen bruto por costo histórico | Las categorías corresponden al catálogo actual. Rentabilidad contable completa pendiente |
| Importación | CSV/XLSX: productos, clientes, ingredientes | Existencias se registran con movimientos; no importa saldos directamente. Hasta 500 filas; transacción por fila, no por archivo |
| Exportación | CSV de página y ventas, Excel de ventas, impresión/PDF | Reportes limitados a 10.000 ventas por consulta; exportación masiva en segundo plano pendiente |
| Configuración | Datos del negocio y tasa fiscal en puntos básicos | Una tasa global; no es motor tributario por categoría, régimen o documento fiscal |
| Integraciones | Canales manuales, recuperación de contraseña vía SMTP y puntos de extensión documentados | Sin webhook WhatsApp, facturación DIAN, cobro de pasarela ni SMS |
| Tiempo real | Polling sin WebSockets | WebSockets, Redis y workers corresponden a fases futuras |
| Offline | Manejo de errores de conexión | No hay cola offline, PWA sincronizada ni IndexedDB |
| Hosting | Build, migraciones, servidor web integrado opcional y guía | No desplegado; faltan cuenta, plan, dominio, secretos y verificación del entorno de producción |

## Decisiones operativas

- Los valores monetarios se guardan como enteros COP (pesos). Ingredientes y recetas admiten cantidades decimales.
- El impuesto se configura en puntos básicos: 1900 equivale al 19 %. Los comprobantes son POS, no facturas electrónicas.
- El stock de cada línea se consume una sola vez, en el primer cobro posterior a su incorporación. Si la receta no tiene existencias, se revierte todo ese cobro.
- Una cuenta con abonos conserva la mesa ocupada y admite rondas nuevas, traslados y uniones. El último pago cierra la venta y libera la mesa. Caja registra cada abono en su turno y los reportes cuentan la venta una vez, en la fecha del último pago.
- El último reembolso de todos los ítems devuelve el saldo pendiente, incluyendo redondeos, propina y domicilio.
- El cron suspende trials vencidos. La gestión de renovaciones pagas sigue siendo manual desde Super Admin.
- No se inventaron tarifas, NIT reales, proveedores externos ni credenciales comerciales.
- Los selectores operativos consultan hasta 100 registros. El catálogo administrativo y el historial de pedidos están paginados. Para catálogos grandes, se debe ampliar la búsqueda remota de selectores y paginar tableros operativos.

## Integraciones futuras

Las integraciones deben llamar al motor `createOrder` usando un usuario técnico autorizado por empresa/sucursal; no deben aceptar un `tenantId` arbitrario del cliente. Antes de activarlas se necesita elegir proveedor, validar firmas del webhook, deduplicar eventos, gestionar secretos, registrar reintentos y probar su sandbox. Los pagos externos deben verificar el importe con el proveedor antes de llamar al cierre transaccional. La factura electrónica debe ser una entidad separada de la venta POS.
