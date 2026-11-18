# GPOS
<!-- impeccable:product-schema 1 -->
## Platform
web
## Stack
React, TypeScript, Vite, NestJS, Prisma, MySQL. Despliegue previsto en Hostinger según especificación proporcionada.
## Users
Dueños, administradores, cajeros, meseros, cocina, inventario y domiciliarios de restaurantes y de tiendas de productos o servicios en Colombia. El Super Admin define por empresa el modo Restaurante o Tienda.
## Product Purpose
Conectar pedido, preparación, entrega, pago, caja e inventario con aislamiento por empresa y autorización por sucursal.
## Capabilities and Constraints
COP; conexión requerida salvo para enviar pedidos a cocina, que se encolan en el dispositivo sin red y se envían al reconectar (con clave anti-duplicados); el cobro exige conexión; KDS con polling; transacciones y precios calculados por servidor; permisos y auditoría. Integraciones externas requieren proveedores y secretos reales. Service worker (abrir la app sin red), Redis y apps nativas son fases posteriores.
## Brand Commitments
Guía appledesing.md: tipografía del sistema, jerarquía, materiales funcionales, respuesta inmediata, movimiento reducido y controles familiares. Nombre provisional GPOS tomado de la carpeta del proyecto.
## Evidence on Hand
Los dos documentos originales son el alcance y referencia. Los datos de prueba se identificarán como demostración.
