
# SaaS POS — Sistema de Punto de Venta Multiempresa

**Versión:** 1.0  
**Arquitectura:** SaaS Multi-Tenant  
**Backend:** Node.js + TypeScript + NestJS  
**Frontend:** React + TypeScript + Vite  
**Base de datos:** MySQL 8  
**ORM:** Prisma  
**Hosting inicial:** Hostinger  
**Diseño:** Premium, minimalista, moderno, inspirado en principios de diseño tipo Apple  
**Mercado inicial:** Colombia  
**Moneda inicial:** COP

---

# 1. VISIÓN DEL PRODUCTO

Construir una plataforma SaaS de punto de venta especializada en restaurantes, cafeterías, comidas rápidas, panaderías, bares y negocios de alimentos.

El sistema permitirá que **muchas empresas utilicen la misma plataforma**, manteniendo completamente aislados sus datos.

Ejemplo:

```text
                    PLATAFORMA SaaS
                           │
          ┌────────────────┼────────────────┐
          │                │                │
       EMPRESA A        EMPRESA B        EMPRESA C
          │                │                │
      ┌───┴───┐          SUCURSAL 1      SUCURSAL 1
      │       │
   SUC. 1  SUC. 2
```

Cada empresa tendrá:

- Sus usuarios
- Sus sucursales
- Sus productos
- Sus clientes
- Sus pedidos
- Sus ventas
- Sus mesas
- Sus domicilios
- Su inventario
- Sus proveedores
- Sus cajas
- Sus reportes
- Su configuración
- Su suscripción

Ninguna empresa podrá consultar información de otra empresa.

---

# 2. OBJETIVO

El sistema debe permitir administrar todo el ciclo de operación de un negocio de comidas:

```text
CLIENTE
   ↓
PEDIDO
   ↓
PREPARACIÓN
   ↓
ENTREGA / SERVICIO
   ↓
PAGO
   ↓
CAJA
   ↓
INVENTARIO
   ↓
REPORTES
```

El sistema debe soportar simultáneamente:

1. Comer en mesa
2. Para llevar
3. Para recoger
4. Domicilios
5. Pedidos por WhatsApp
6. Pedidos desde página web
7. Pedidos telefónicos
8. Pedidos desde POS
9. Múltiples sucursales
10. Múltiples cajas
11. Múltiples usuarios
12. Inventario
13. Compras
14. Cocina
15. Reportes
16. Suscripciones SaaS

---

# 3. PRINCIPIO FUNDAMENTAL

El sistema NO debe funcionar como un ERP viejo lleno de botones.

Debe sentirse como un producto moderno.

Principio:

> "Mostrar al usuario lo que necesita hacer ahora."

Ejemplo:

```text
┌──────────────────────────────────────────────┐
│ Buenos días, Carlos                         │
│ Sucursal Centro                             │
│                                              │
│ Ventas de hoy       $2.850.000              │
│ Pedidos             87                       │
│ Mesas ocupadas      12                       │
│ Domicilios          19                       │
│                                              │
│        + NUEVA VENTA                         │
│                                              │
│ Pedidos activos                              │
│ ───────────────────────────────────────────  │
│ #1045   Mesa 8       En preparación         │
│ #1046   Domicilio    Listo                  │
│ #1047   Recoger      Esperando              │
└──────────────────────────────────────────────┘
```

---

# 4. ARQUITECTURA GENERAL

```text
                         INTERNET
                             │
                             ▼
                     ┌───────────────┐
                     │   HOSTINGER   │
                     └───────┬───────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        React/Vite       NestJS API      MySQL
        Frontend         Backend         Database
              │              │              │
              └──────────────┼──────────────┘
                             │
                    Servicios externos
                             │
              ┌──────────────┼──────────────┐
              │              │              │
           WhatsApp       Pagos          Email
```

---

# 5. STACK TECNOLÓGICO

## Frontend

```text
React
TypeScript
Vite
React Router
TanStack Query
Zustand
Tailwind CSS
Lucide Icons
React Hook Form
Zod
```

## Backend

```text
Node.js
TypeScript
NestJS
Prisma
JWT
bcrypt
Zod / class-validator
```

## Base de datos

```text
MySQL 8
```

## Infraestructura

```text
Hostinger
GitHub
SSL
Cron Jobs
```

---

# 6. MYSQL

La base de datos principal será:

```text
MySQL 8
```

Nombre inicial:

```text
saas_pos
```

Charset:

```text
utf8mb4
```

Collation recomendada:

```text
utf8mb4_unicode_ci
```

Todas las tablas utilizarán:

```text
InnoDB
```

---

# 7. MULTI-TENANCY

El sistema será **multi-tenant**.

El tenant será la empresa.

Ejemplo:

```text
Empresa A
empresa_id = 1

Empresa B
empresa_id = 2
```

Nunca se debe permitir:

```text
Empresa A → consultar pedidos Empresa B
```

---

# 8. REGLA DE SEGURIDAD MULTI-TENANT

El frontend nunca tendrá autoridad para decidir la empresa.

Incorrecto:

```http
GET /api/orders?empresa_id=5
```

si el usuario pertenece a empresa 3.

Correcto:

```text
JWT
 ↓
usuario
 ↓
empresa
 ↓
sucursales autorizadas
 ↓
consulta filtrada
```

El backend debe obtener:

```text
empresa_id
```

desde la sesión/token/autorización del usuario.

---

# 9. ROLES

Roles iniciales:

```text
SUPER_ADMIN
OWNER
ADMIN
GERENTE
SUPERVISOR
CAJERO
MESERO
COCINA
DOMICILIARIO
INVENTARIO
```

Pero el sistema debe utilizar **permisos**, no depender únicamente del nombre del rol.

---

# 10. PERMISOS

Ejemplos:

```text
ventas.ver
ventas.crear
ventas.editar
ventas.cancelar
ventas.devolver

pedidos.ver
pedidos.crear
pedidos.editar
pedidos.cancelar
pedidos.cerrar

mesas.ver
mesas.editar

caja.ver
caja.abrir
caja.cerrar
caja.retirar
caja.ingreso

productos.ver
productos.crear
productos.editar
productos.eliminar

inventario.ver
inventario.ajustar
inventario.trasladar

compras.ver
compras.crear

clientes.ver
clientes.crear
clientes.editar

reportes.ver

usuarios.ver
usuarios.crear
usuarios.editar
usuarios.eliminar

configuracion.ver
configuracion.editar
```

---

# 11. SUPER ADMIN

El Super Admin administra la plataforma SaaS.

Puede consultar:

```text
Empresas
Usuarios
Planes
Suscripciones
Pagos SaaS
Pruebas gratuitas
Ingresos
MRR
Churn
Clientes nuevos
Empresas suspendidas
Actividad de la plataforma
```

El Super Admin no debe acceder automáticamente a la operación de una empresa.

El acceso operativo debe quedar registrado en auditoría.

---

# 12. PLANES SaaS

Los planes deben ser configurables.

Ejemplo:

## STARTER

```text
1 sucursal
5 usuarios
1 caja
500 productos
POS
Mesas
Pedidos
Caja
Reportes básicos
```

## PROFESSIONAL

```text
3 sucursales
20 usuarios
5 cajas
Productos ilimitados
Inventario
Compras
Recetas
Domicilios
WhatsApp
Reportes avanzados
```

## BUSINESS

```text
Sucursales ilimitadas
Usuarios ilimitados
Cajas ilimitadas
Inventario avanzado
Multi-bodega
API
Integraciones
Reportes avanzados
Automatizaciones
```

No utilizar:

```typescript
if (plan === "PRO")
```

La plataforma debe utilizar:

```text
features
plan_features
```

---

# 13. SUSCRIPCIONES

Estados:

```text
TRIAL
ACTIVA
PAST_DUE
SUSPENDIDA
CANCELADA
```

Campos principales:

```text
id
empresa_id
plan_id
estado
fecha_inicio
fecha_renovacion
fecha_cancelacion
```

El período de prueba debe ser configurable.

Ejemplo:

```text
14 días
```

---

# 14. EMPRESA

Entidad:

```text
tenants
```

Campos:

```text
id
nombre
razon_social
nit
telefono
email
logo
direccion
ciudad
pais
zona_horaria
moneda
estado
plan_id
created_at
updated_at
```

---

# 15. SUCURSALES

Una empresa puede tener:

```text
Empresa
 ├── Sucursal Centro
 ├── Sucursal Norte
 └── Sucursal Sur
```

Tabla:

```text
branches
```

Campos:

```text
id
empresa_id
nombre
codigo
direccion
telefono
ciudad
zona_horaria
activo
created_at
updated_at
```

---

# 16. USUARIOS

Tabla:

```text
users
```

Campos:

```text
id
empresa_id
nombre
apellido
email
password_hash
telefono
avatar
activo
ultimo_login
created_at
updated_at
```

Un usuario puede tener acceso a una o varias sucursales.

---

# 17. RELACIÓN USUARIO-SUCURSAL

Tabla:

```text
user_branches
```

Permite:

```text
Carlos
 ├── Sucursal Centro
 └── Sucursal Norte
```

---

# 18. PRODUCTOS

Tabla:

```text
products
```

Campos:

```text
id
empresa_id
categoria_id
nombre
descripcion
sku
codigo_barras
imagen
precio
costo
activo
controla_inventario
created_at
updated_at
```

---

# 19. CATEGORÍAS

Ejemplo:

```text
Hamburguesas
Perros
Pizzas
Bebidas
Combos
Postres
Adicionales
```

Tabla:

```text
categories
```

---

# 20. VARIANTES

Un producto puede tener:

```text
Coca Cola
 ├── 250ml
 ├── 400ml
 └── 1.5L
```

Tabla:

```text
product_variants
```

---

# 21. MODIFICADORES

Ejemplo:

```text
Hamburguesa
 ├── Extra queso +$3.000
 ├── Extra carne +$7.000
 ├── Tocineta +$4.000
 ├── Sin cebolla
 └── Sin tomate
```

Tablas:

```text
modifiers
product_modifiers
```

---

# 22. LISTAS DE PRECIOS

El sistema debe permitir diferentes precios.

Ejemplo:

```text
Precio salón
Precio domicilio
Precio recoger
Precio marketplace
Precio mayorista
```

Esto evita duplicar productos.

---

# 23. MESAS

Estructura:

```text
Sucursal
   ↓
Zona
   ↓
Mesa
```

Ejemplo:

```text
SALÓN PRINCIPAL

Mesa 1
Mesa 2
Mesa 3

TERRAZA

Mesa 10
Mesa 11
Mesa 12
```

Estados:

```text
LIBRE
OCUPADA
RESERVADA
FUERA_SERVICIO
```

---

# 24. TIPOS DE SERVICIO

El pedido debe tener:

```text
MESA
DOMICILIO
RECOGER
PARA_LLEVAR
```

---

# 25. ORIGEN DEL PEDIDO

```text
POS
WHATSAPP
WEB
TELEFONO
APP
API
```

Todos deben utilizar el mismo motor de pedidos.

No crear un sistema separado para WhatsApp.

---

# 26. PEDIDOS

Tabla:

```text
orders
```

Campos principales:

```text
id
empresa_id
sucursal_id
usuario_id
cliente_id
mesa_id
tipo_servicio
origen
estado
subtotal
descuento
impuestos
propina
costo_domicilio
total
notas
created_at
updated_at
```

---

# 27. ESTADOS DEL PEDIDO

```text
BORRADOR
CONFIRMADO
EN_PREPARACION
LISTO
EN_CAMINO
ENTREGADO
PAGADO
CERRADO
CANCELADO
```

No todos los servicios necesitan todos los estados.

---

# 28. DETALLE DEL PEDIDO

Tabla:

```text
order_items
```

Campos:

```text
id
order_id
producto_id
nombre_producto
cantidad
precio_unitario
descuento
impuesto
subtotal
total
notas
```

Guardar el nombre y precio utilizado en la venta permite conservar el histórico aunque posteriormente cambie el producto.

---

# 29. MODIFICADORES DEL PEDIDO

Tabla:

```text
order_item_modifiers
```

Ejemplo:

```text
Hamburguesa
Cantidad: 1
Precio: $18.000

+ Extra queso $3.000
+ Tocineta $4.000
```

---

# 30. FLUJO DE MESA

```text
Seleccionar mesa
       ↓
Nueva orden
       ↓
Agregar productos
       ↓
Agregar modificadores
       ↓
Enviar a cocina
       ↓
Preparación
       ↓
Listo
       ↓
Servir
       ↓
Solicitar cuenta
       ↓
Pago
       ↓
Cerrar pedido
       ↓
Liberar mesa
```

---

# 31. FLUJO DOMICILIO

```text
Cliente
   ↓
Dirección
   ↓
Productos
   ↓
Costo domicilio
   ↓
Confirmar
   ↓
Cocina
   ↓
Pedido listo
   ↓
Asignar domiciliario
   ↓
En camino
   ↓
Entregado
   ↓
Pago
   ↓
Cerrar
```

---

# 32. FLUJO PARA RECOGER

```text
Cliente
   ↓
Productos
   ↓
Hora estimada
   ↓
Confirmar
   ↓
Cocina
   ↓
Listo
   ↓
Cliente llega
   ↓
Entrega
   ↓
Pago
   ↓
Cerrar
```

---

# 33. WHATSAPP

Arquitectura:

```text
WhatsApp
    ↓
Webhook/API
    ↓
Backend
    ↓
Cliente
    ↓
Pedido
    ↓
Cocina
    ↓
POS
```

El pedido de WhatsApp debe aparecer en el mismo panel que los demás pedidos.

Ejemplo:

```text
PEDIDOS

#1045  POS        Mesa 4
#1046  WHATSAPP   Domicilio
#1047  WEB        Recoger
#1048  TELEFONO   Domicilio
```

---

# 34. COCINA

Sistema KDS:

```text
NUEVOS
   ↓
EN PREPARACIÓN
   ↓
LISTOS
```

Puede existir más de una estación:

```text
Cocina
Bar
Parrilla
Postres
Pizzería
```

Cada producto puede estar asociado a una estación de producción.

---

# 35. INVENTARIO

El inventario debe manejarse por sucursal/bodega.

Ejemplo:

```text
Sucursal Centro
 ├── Carne: 50 kg
 ├── Pan: 100 unidades
 └── Queso: 30 kg
```

Movimientos:

```text
ENTRADA
SALIDA
MERMA
AJUSTE
TRASLADO
DEVOLUCION
```

---

# 36. INGREDIENTES

Tabla:

```text
ingredients
```

Ejemplo:

```text
Carne
Pan
Queso
Tomate
Cebolla
Papa
Aceite
```

---

# 37. RECETAS

Una hamburguesa puede tener:

```text
1 pan
150 g carne
30 g queso
20 g tomate
10 g cebolla
```

Cuando se vende:

```text
Venta
 ↓
Receta
 ↓
Descuento inventario
```

Esto permitirá calcular costos y consumo real.

---

# 38. COMPRAS

Flujo:

```text
Proveedor
   ↓
Orden de compra
   ↓
Recepción
   ↓
Inventario
   ↓
Cuenta por pagar
```

Tablas:

```text
suppliers
purchases
purchase_items
```

---

# 39. DOMICILIOS

Entidades:

```text
deliveries
delivery_drivers
customer_addresses
```

Estados:

```text
PENDIENTE
ASIGNADO
EN_CAMINO
ENTREGADO
CANCELADO
```

---

# 40. CLIENTES

Tabla:

```text
customers
```

Campos:

```text
id
empresa_id
nombre
telefono
email
documento
notas
created_at
updated_at
```

Un cliente pertenece a una empresa.

---

# 41. DIRECCIONES

Un cliente puede tener múltiples direcciones:

```text
Casa
Trabajo
Oficina
```

Tabla:

```text
customer_addresses
```

---

# 42. CAJAS

Una sucursal puede tener:

```text
Caja 1
Caja 2
Caja 3
```

Tabla:

```text
cash_registers
```

---

# 43. TURNO DE CAJA

Flujo:

```text
APERTURA
   ↓
VENTAS
   ↓
INGRESOS
   ↓
RETIROS
   ↓
GASTOS
   ↓
DEVOLUCIONES
   ↓
CIERRE
```

Tabla:

```text
cash_sessions
```

---

# 44. MOVIMIENTOS DE CAJA

Tabla:

```text
cash_movements
```

Tipos:

```text
VENTA
INGRESO
RETIRO
GASTO
DEVOLUCION
AJUSTE
```

---

# 45. MÉTODOS DE PAGO

Inicialmente:

```text
EFECTIVO
TARJETA
TRANSFERENCIA
NEQUI
DAVIPLATA
QR
OTRO
```

Debe existir soporte para pago mixto.

Ejemplo:

```text
Total: $100.000

Efectivo: $40.000
Nequi:   $60.000
```

---

# 46. IDEMPOTENCIA DE PAGOS

Cada operación de pago debe poder recibir una clave:

```text
idempotency_key
```

Esto evita:

```text
usuario pulsa pagar
↓
internet falla
↓
pulsa otra vez
↓
se registra dos veces
```

El backend debe detectar la operación existente.

---

# 47. DEVOLUCIONES

El sistema debe soportar:

```text
Devolución completa
Devolución parcial
```

Registrar:

```text
usuario
motivo
pedido
productos
cantidad
valor
fecha
```

Todo debe quedar en auditoría.

---

# 48. REPORTES

## Ventas

```text
Ventas del día
Ventas por período
Ventas por producto
Ventas por categoría
Ventas por usuario
Ventas por sucursal
```

## Métodos de pago

```text
Efectivo
Tarjeta
Transferencia
Nequi
Daviplata
```

## Operación

```text
Pedidos
Domicilios
Mesas
Productos más vendidos
Horas pico
```

## Inventario

```text
Stock actual
Stock bajo
Movimientos
Mermas
Costo de inventario
```

---

# 49. DASHBOARD

El dashboard debe adaptarse a cada usuario.

Ejemplo:

```text
BUENOS DÍAS

Ventas
$3.850.000

Pedidos
124

Domicilios
37

Mesas ocupadas
14/30
```

Y abajo:

```text
Pedidos activos

#1080 Mesa 5       EN PREPARACIÓN
#1081 Domicilio    LISTO
#1082 Recoger      NUEVO
```

---

# 50. DISEÑO UX/UI

Inspiración:

```text
Minimalismo
Jerarquía visual
Espacios amplios
Tipografía limpia
Animaciones suaves
Componentes consistentes
```

No copiar la identidad visual de Apple.

Debe ser un diseño propio con una sensación:

```text
Premium
Simple
Rápido
Elegante
Profesional
```

---

# 51. RESPONSIVE

## Desktop

```text
Sidebar
Header
Contenido
```

## Tablet

```text
Sidebar reducido
Contenido amplio
```

## Móvil

```text
Inicio
Ventas
Pedidos
Más
```

El POS debe estar especialmente optimizado para tablets.

---

# 52. NAVEGACIÓN

```text
Inicio

Ventas
 ├── POS
 ├── Pedidos
 ├── Mesas
 ├── Domicilios
 └── Para recoger

Operación
 ├── Cocina
 ├── Inventario
 ├── Compras
 └── Proveedores

Clientes

Productos
 ├── Productos
 ├── Categorías
 ├── Modificadores
 └── Recetas

Caja

Reportes

Configuración
```

---

# 53. ATAJOS DE TECLADO

```text
F1 → Nueva venta
F2 → Buscar producto
F3 → Buscar cliente
F4 → Pedidos
F5 → Mesas
F6 → Caja
ESC → Cerrar modal
```

---

# 54. AUTENTICACIÓN

Login:

```text
Email
Password
```

Backend:

```text
POST /auth/login
```

Respuesta:

```text
access_token
refresh_token
user
permissions
branches
```

Passwords:

```text
bcrypt
```

Nunca guardar contraseñas directamente.

---

# 55. JWT

El token debe identificar al usuario.

No confiar en:

```text
empresa_id enviado por frontend
```

La autorización debe resolver:

```text
JWT
 ↓
Usuario
 ↓
Empresa
 ↓
Sucursales
 ↓
Permisos
```

---

# 56. ESTRUCTURA DEL PROYECTO

```text
saas-pos/
│
├── apps/
│   │
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── layouts/
│   │   │   ├── pages/
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── pos/
│   │   │   │   ├── orders/
│   │   │   │   ├── tables/
│   │   │   │   ├── products/
│   │   │   │   ├── inventory/
│   │   │   │   ├── customers/
│   │   │   │   ├── cash/
│   │   │   │   └── reports/
│   │   │   ├── hooks/
│   │   │   ├── stores/
│   │   │   ├── services/
│   │   │   ├── types/
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── api/
│       ├── src/
│       │   ├── auth/
│       │   ├── users/
│       │   ├── tenants/
│       │   ├── plans/
│       │   ├── subscriptions/
│       │   ├── branches/
│       │   ├── products/
│       │   ├── categories/
│       │   ├── modifiers/
│       │   ├── orders/
│       │   ├── tables/
│       │   ├── kitchen/
│       │   ├── delivery/
│       │   ├── customers/
│       │   ├── inventory/
│       │   ├── purchases/
│       │   ├── suppliers/
│       │   ├── payments/
│       │   ├── cash/
│       │   ├── reports/
│       │   ├── notifications/
│       │   ├── audit/
│       │   ├── database/
│       │   └── common/
│       └── package.json
│
├── packages/
│   ├── shared/
│   ├── types/
│   └── validation/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── docs/
│
├── scripts/
│
├── package.json
└── README.md
```

---

# 57. ESTRUCTURA DE MÓDULOS BACKEND

```text
auth
users
tenants
plans
subscriptions
branches
products
categories
modifiers
orders
tables
kitchen
delivery
customers
inventory
purchases
suppliers
payments
cash
reports
notifications
audit
```

Cada módulo debe separar:

```text
controller
service
repository/data access
dto
entities/types
```

Prisma será la capa de acceso a MySQL.

---

# 58. API REST

Base:

```text
/api/v1
```

Ejemplos:

```text
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout

GET    /tenants/me
GET    /branches
POST   /branches

GET    /products
POST   /products
PUT    /products/:id
DELETE /products/:id

GET    /orders
POST   /orders
GET    /orders/:id
PUT    /orders/:id
POST   /orders/:id/confirm
POST   /orders/:id/cancel

POST   /orders/:id/payment

GET    /tables
PUT    /tables/:id

GET    /inventory
POST   /inventory/adjustment

POST   /cash/open
POST   /cash/close
GET    /cash/current

GET    /reports/sales
GET    /reports/products
GET    /reports/cash
```

---

# 59. BASE DE DATOS

Entidades SaaS:

```text
tenants
tenant_settings
plans
features
plan_features
subscriptions
subscription_events
saas_payments
```

Usuarios:

```text
users
roles
permissions
role_permissions
user_roles
user_branches
```

Operación:

```text
branches
customers
customer_addresses
categories
products
product_variants
modifiers
product_modifiers
tables
table_zones
orders
order_items
order_item_modifiers
```

Cocina:

```text
kitchens
production_areas
kitchen_tickets
```

Caja:

```text
cash_registers
cash_sessions
cash_movements
```

Inventario:

```text
warehouses
ingredients
inventory
inventory_movements
recipes
recipe_items
```

Compras:

```text
suppliers
purchases
purchase_items
```

Domicilios:

```text
deliveries
delivery_drivers
```

Pagos:

```text
payments
refunds
refund_items
```

Sistema:

```text
notifications
audit_logs
```

---

# 60. REGLAS DE BASE DE DATOS

Las relaciones deben utilizar claves foráneas.

Ejemplo:

```text
products.empresa_id
       ↓
tenants.id
```

Y:

```text
products.categoria_id
       ↓
categories.id
```

Además:

```text
orders.empresa_id
orders.sucursal_id
```

Esto permite reforzar el aislamiento.

---

# 61. ÍNDICES

Crear índices especialmente para:

```text
empresa_id
sucursal_id
estado
created_at
cliente_id
usuario_id
producto_id
```

Ejemplo conceptual:

```text
INDEX idx_orders_tenant_date
(empresa_id, created_at)
```

Y:

```text
INDEX idx_orders_branch_status
(sucursal_id, estado)
```

---

# 62. SCHEMA PRISMA

La configuración será:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

Ejemplo:

```prisma
model Tenant {
  id        Int      @id @default(autoincrement())
  nombre    String
  email     String?
  estado    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  branches  Branch[]
  users     User[]

  @@map("tenants")
}
```

---

# 63. VARIABLE DE ENTORNO

```env
DATABASE_URL="mysql://USUARIO:PASSWORD@HOST:3306/saas_pos"
```

Nunca colocar credenciales directamente en el código.

---

# 64. TRANSACCIONES

Las operaciones críticas deben ser transaccionales.

Ejemplo venta:

```text
BEGIN

Crear pedido
Crear items
Registrar pago
Registrar movimiento caja
Descontar inventario
Registrar auditoría

COMMIT
```

Si algo falla:

```text
ROLLBACK
```

Nunca dejar una venta parcialmente registrada.

---

# 65. EJEMPLO DE VENTA

```text
Usuario:
CAJERO

Sucursal:
Centro

Servicio:
MESA

Mesa:
8

Productos:

Hamburguesa x2
Papas x2
Coca Cola x2

Subtotal:
$60.000

Impuesto:
$0 / según configuración

Total:
$60.000

Pago:
Nequi

Estado:
CERRADO
```

La operación debe actualizar:

```text
orders
order_items
payments
cash_movements
inventory_movements
audit_logs
```

---

# 66. AUDITORÍA

Tabla:

```text
audit_logs
```

Registrar:

```text
empresa_id
usuario_id
accion
modulo
registro_id
ip
metadata
created_at
```

Acciones:

```text
LOGIN
LOGOUT
CREATE
UPDATE
DELETE
CANCEL
REFUND
PAY
OPEN_CASH
CLOSE_CASH
CHANGE_PLAN
SUSPEND_TENANT
```

---

# 67. NOTIFICACIONES

Sistema centralizado.

Tipos:

```text
PEDIDO_LISTO
PAGO_RECIBIDO
CAJA_POR_CERRAR
STOCK_BAJO
SUSCRIPCION_POR_VENCER
PAGO_SAAS_FALLIDO
```

---

# 68. REPORTES SaaS

El Super Admin podrá visualizar:

```text
Empresas activas
Empresas en prueba
Empresas suspendidas
Nuevas empresas
Suscripciones
Ingresos SaaS
MRR
ARR
Churn
ARPU
Conversión de trial
```

---

# 69. REPORTES DEL NEGOCIO

Cada empresa verá únicamente su información.

Ejemplo:

```text
Ventas hoy
Ventas semana
Ventas mes

Producto más vendido
Categoría más vendida
Método de pago
Ventas por empleado
Ventas por sucursal
```

---

# 70. CONFIGURACIÓN POR EMPRESA

Cada empresa podrá configurar:

```text
Nombre
Logo
Dirección
Teléfono
NIT
Moneda
Zona horaria
Impuestos
Propinas
Métodos de pago
Numeración
Configuración de mesas
Configuración de cocina
Configuración de domicilios
```

---

# 71. COLOMBIA

El sistema debe prepararse para:

```text
COP
NIT
IVA
Impuestos
Facturación electrónica
DIAN
```

Pero no se deben colocar reglas tributarias directamente dentro del código.

Debe existir una capa de configuración fiscal.

---

# 72. FACTURACIÓN

Separar:

```text
Venta POS
```

de:

```text
Documento fiscal electrónico
```

La arquitectura debe permitir integrar posteriormente:

```text
Proveedor de facturación
DIAN
```

sin reescribir el POS.

---

# 73. LANDING PAGE

Dominio:

```text
tudominio.com
```

Secciones:

```text
Hero
Beneficios
POS
Mesas
Domicilios
WhatsApp
Inventario
Reportes
Planes
Preguntas frecuentes
CTA
Footer
```

Hero:

```text
El POS que pone todo tu negocio
en un solo lugar.

Vende.
Controla.
Crece.

[Probar gratis]
```

---

# 74. REGISTRO

Flujo:

```text
Crear cuenta
      ↓
Nombre
Email
Password
      ↓
Nombre del negocio
Tipo de negocio
      ↓
Crear empresa
      ↓
Crear sucursal
      ↓
Configuración inicial
      ↓
Dashboard
```

---

# 75. ONBOARDING

Primera entrada:

```text
1. Información del negocio
2. Crear sucursal
3. Agregar productos
4. Crear categorías
5. Configurar mesas
6. Métodos de pago
7. Abrir caja
8. Listo
```

Debe existir:

```text
Saltar por ahora
```

para no obligar a completar todo.

---

# 76. IMPORTACIÓN

Permitir importar:

```text
Productos
Clientes
Inventario
```

desde:

```text
CSV
Excel
```

---

# 77. EXPORTACIÓN

Permitir:

```text
Excel
CSV
PDF
```

para reportes.

---

# 78. OFFLINE

El modo offline completo se considera una fase posterior.

En el MVP:

```text
Conexión requerida
```

Después:

```text
PWA
IndexedDB
Sincronización
Cola de operaciones
```

---

# 79. TIEMPO REAL

En Hostinger Web/Cloud, la arquitectura inicial no debe depender obligatoriamente de WebSockets.

Para el MVP:

```text
Polling
```

Ejemplo:

```text
KDS consulta nuevos pedidos cada 3-5 segundos
```

Cuando el proyecto pase a infraestructura más avanzada:

```text
WebSockets
Redis
Workers
```

podrán incorporarse.

---

# 80. CRON JOBS

Utilizar tareas programadas para:

```text
Verificar suscripciones
Enviar recordatorios
Procesar tareas pendientes
Limpiar sesiones
Generar reportes
Verificar pagos SaaS
```

No depender de un proceso Node secundario permanentemente activo en el hosting compartido.

---

# 81. DOMINIOS

Arquitectura recomendada:

```text
tudominio.com
```

Landing.

```text
app.tudominio.com
```

Aplicación de clientes.

```text
admin.tudominio.com
```

Panel Super Admin.

```text
api.tudominio.com
```

Backend.

---

# 82. HOSTINGER

El proyecto debe diseñarse pensando en despliegue sencillo.

Inicialmente:

```text
Hostinger
 ├── Node.js
 ├── MySQL
 ├── SSL
 └── GitHub
```

El código debe estar preparado para posteriormente migrar a:

```text
Hostinger VPS
```

sin cambiar la arquitectura fundamental.

---

# 83. VARIABLES DE ENTORNO

Backend:

```env
NODE_ENV=production

PORT=3000

DATABASE_URL=mysql://...

JWT_SECRET=...

JWT_REFRESH_SECRET=...

FRONTEND_URL=https://app.tudominio.com

API_URL=https://api.tudominio.com
```

Nunca subir:

```text
.env
```

al repositorio.

---

# 84. SEGURIDAD

Implementar:

```text
HTTPS
JWT
Refresh tokens
bcrypt
Rate limiting
CORS
Helmet
Validación de DTO
Sanitización
Control de permisos
Auditoría
Protección SQL injection mediante Prisma
```

Nunca confiar en:

```text
empresa_id
sucursal_id
usuario_id
precio
total
```

enviados directamente desde el frontend.

Los valores críticos deben validarse/recalcularse en backend.

---

# 85. PRECIO

Nunca aceptar:

```json
{
  "total": 1000
}
```

como verdad.

El backend debe calcular:

```text
producto
×
cantidad
+
modificadores
-
descuentos
+
impuestos
+
domicilio
=
total
```

El frontend solamente solicita la operación.

---

# 86. CONTROL DE STOCK

Nunca confiar en:

```text
stock enviado desde frontend
```

El backend debe consultar:

```text
inventario actual
```

y ejecutar el movimiento dentro de una transacción.

---

# 87. ESTADOS

Evitar strings dispersos por todo el código.

Utilizar enums centralizados.

Ejemplo:

```typescript
enum OrderStatus {
  BORRADOR = 'BORRADOR',
  CONFIRMADO = 'CONFIRMADO',
  EN_PREPARACION = 'EN_PREPARACION',
  LISTO = 'LISTO',
  EN_CAMINO = 'EN_CAMINO',
  ENTREGADO = 'ENTREGADO',
  PAGADO = 'PAGADO',
  CERRADO = 'CERRADO',
  CANCELADO = 'CANCELADO'
}
```

---

# 88. MANEJO DE ERRORES

API estándar:

```json
{
  "success": false,
  "message": "No tienes permiso para realizar esta operación",
  "code": "FORBIDDEN"
}
```

Éxito:

```json
{
  "success": true,
  "data": {}
}
```

---

# 89. RESPUESTA API

Formato consistente:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

---

# 90. PAGINACIÓN

Toda consulta potencialmente grande debe utilizar paginación.

Ejemplo:

```text
GET /products?page=1&limit=20
```

Nunca cargar miles de registros innecesariamente.

---

# 91. BÚSQUEDA

Productos:

```text
Nombre
SKU
Código de barras
```

Clientes:

```text
Nombre
Teléfono
Documento
```

---

# 92. DASHBOARD DE SUPER ADMIN

```text
┌─────────────────────────────────────────┐
│ SaaS Overview                           │
├─────────────────────────────────────────┤
│ Empresas       1.248                    │
│ Activas        1.112                    │
│ Trial            86                     │
│ MRR          $48.500.000                │
│                                         │
│ Nuevos clientes                         │
│ █████████████████████                   │
│                                         │
│ Suscripciones                           │
│ Starter       520                       │
│ Professional  480                       │
│ Business      112                       │
└─────────────────────────────────────────┘
```

---

# 93. DASHBOARD DEL NEGOCIO

```text
┌─────────────────────────────────────────┐
│ Buenos días                             │
│ Sucursal Centro                         │
│                                         │
│ Ventas          $2.850.000              │
│ Pedidos         87                       │
│ Domicilios      24                       │
│ Mesas            9                       │
│                                         │
│ [ + NUEVA VENTA ]                       │
│                                         │
│ Pedidos activos                         │
│                                         │
│ #1050 Mesa 4       Cocina               │
│ #1051 Domicilio    Listo                │
│ #1052 Recoger      Nuevo                │
└─────────────────────────────────────────┘
```

---

# 94. POS

El POS debe ser extremadamente rápido.

Diseño:

```text
┌──────────────────────┬────────────────────────┐
│ CATEGORÍAS           │ PEDIDO                 │
│                      │                        │
│ Hamburguesas         │ Hamburguesa x2         │
│ Perros               │ Papas x1               │
│ Pizzas               │ Coca Cola x2           │
│ Bebidas              │                        │
│ Postres              │ Subtotal $55.000       │
│                      │ Total    $55.000       │
│ [Producto]           │                        │
│ [Producto]           │ [Cobrar]               │
│ [Producto]           │                        │
└──────────────────────┴────────────────────────┘
```

---

# 95. NUEVA VENTA

Primero:

```text
¿Dónde consumirá el cliente?
```

Opciones grandes:

```text
🍽 Mesa

🚗 Domicilio

🛍 Recoger

🥡 Para llevar
```

Después se muestra el flujo correspondiente.

---

# 96. EXPERIENCIA DE MESAS

Vista visual:

```text
┌──────┐  ┌──────┐  ┌──────┐
│  01  │  │  02  │  │  03  │
│ LIBRE│  │OCUPADA│ │ LIBRE│
└──────┘  └──────┘  └──────┘

┌──────┐  ┌──────┐  ┌──────┐
│  04  │  │  05  │  │  06  │
│ LIBRE│  │ LIBRE │ │OCUPADA│
└──────┘  └──────┘  └──────┘
```

---

# 97. PEDIDOS

Vista tipo tablero:

```text
NUEVOS
────────────
#1051
Domicilio
$45.000

EN PREPARACIÓN
────────────
#1050
Mesa 4
$75.000

LISTOS
────────────
#1049
Recoger
$32.000
```

---

# 98. COCINA

KDS:

```text
NUEVOS

#1050
Mesa 4

2 Hamburguesas
1 Papas
2 Coca Cola

[ACEPTAR]
```

Después:

```text
EN PREPARACIÓN

[LISTO]
```

---

# 99. SUSCRIPCIÓN SaaS

Separar completamente:

```text
Pago del restaurante al SaaS
```

de:

```text
Pago del cliente al restaurante
```

Son dos mundos diferentes.

### Pago SaaS

```text
empresa
plan
suscripción
facturación SaaS
```

### Pago de venta

```text
cliente
pedido
venta
caja
```

---

# 100. CICLO COMPLETO DEL NEGOCIO

```text
CLIENTE
   │
   ▼
PEDIDO
   │
   ├──── Mesa
   ├──── Domicilio
   ├──── Recoger
   └──── Para llevar
   │
   ▼
COCINA
   │
   ▼
PEDIDO LISTO
   │
   ├──── Servido
   ├──── Entregado
   └──── Recogido
   │
   ▼
PAGO
   │
   ▼
CAJA
   │
   ▼
INVENTARIO
   │
   ▼
REPORTES
```

---

# 101. CICLO DE INVENTARIO

```text
COMPRA
  ↓
RECEPCIÓN
  ↓
INVENTARIO
  ↓
RECETA
  ↓
VENTA
  ↓
CONSUMO
  ↓
INVENTARIO
```

---

# 102. CICLO SaaS

```text
VISITANTE
   ↓
REGISTRO
   ↓
TRIAL
   ↓
ONBOARDING
   ↓
USO DEL POS
   ↓
CONVERSIÓN
   ↓
SUSCRIPCIÓN
   ↓
RENOVACIÓN
   ↓
EXPANSIÓN
```

---

# 103. FASES DE DESARROLLO

## FASE 0 — Arquitectura

```text
Repositorio
Monorepo
Node
React
NestJS
Prisma
MySQL
Variables de entorno
Docker solamente para desarrollo local si se desea
```

---

## FASE 1 — SaaS

```text
Registro
Login
Empresa
Sucursal
Usuarios
Roles
Permisos
Planes
Trial
Suscripción
```

---

## FASE 2 — POS

```text
Productos
Categorías
Modificadores
Clientes
POS
Pedidos
Mesas
Para llevar
Recoger
Domicilio
```

---

## FASE 3 — OPERACIÓN

```text
Cocina
KDS
Caja
Pagos
Métodos de pago
Domiciliarios
Reportes básicos
```

---

## FASE 4 — INVENTARIO

```text
Ingredientes
Recetas
Inventario
Movimientos
Compras
Proveedores
Mermas
Traslados
```

---

## FASE 5 — REPORTES

```text
Ventas
Productos
Clientes
Caja
Inventario
Sucursales
Usuarios
Rentabilidad
```

---

## FASE 6 — INTEGRACIONES

```text
WhatsApp
Facturación electrónica
Pasarelas de pago
Email
SMS
API
```

---

## FASE 7 — ESCALA

```text
WebSockets
Redis
Workers
API pública
App móvil
Marketplace
Automatizaciones
Multi-bodega avanzada
```

---

# 104. MVP COMERCIAL

El primer producto vendible debe incluir:

```text
✓ Registro
✓ Login
✓ Empresa
✓ Sucursal
✓ Usuarios
✓ Roles
✓ Planes
✓ Trial
✓ Productos
✓ Categorías
✓ Clientes
✓ POS
✓ Mesas
✓ Pedidos
✓ Domicilios
✓ Recoger
✓ Cocina
✓ Pagos
✓ Caja
✓ Inventario básico
✓ Reportes
✓ Suscripción
```

No intentar construir absolutamente todo antes de vender.

---

# 105. PRIORIDAD DE DESARROLLO

Orden recomendado:

```text
1. Arquitectura
2. Base de datos
3. Autenticación
4. Multi-tenancy
5. Empresas
6. Sucursales
7. Usuarios/permisos
8. Productos
9. POS
10. Pedidos
11. Mesas
12. Caja
13. Pagos
14. Cocina
15. Clientes
16. Domicilios
17. Inventario
18. Reportes
19. Suscripciones
20. WhatsApp
21. Facturación
```

---

# 106. REGLA DE ORO

Todas las operaciones importantes deben terminar en una fuente única de verdad.

Ejemplo:

```text
POS
WhatsApp
Web
App
API
```

Todos deben crear:

```text
ORDER
```

No:

```text
WhatsAppOrder
WebOrder
PosOrder
```

Debe existir:

```text
Order
```

con:

```text
origen
```

---

# 107. RESULTADO FINAL

La plataforma debe permitir que una empresa entre, configure su negocio y empiece a vender:

```text
REGISTRO
   ↓
EMPRESA
   ↓
SUCURSAL
   ↓
PRODUCTOS
   ↓
CAJA
   ↓
NUEVA VENTA
   ↓
PEDIDO
   ↓
COCINA
   ↓
PAGO
   ↓
VENTA CERRADA
```

Y que todo quede conectado:

```text
VENTA
 │
 ├── Pedido
 ├── Cliente
 ├── Producto
 ├── Inventario
 ├── Caja
 ├── Pago
 ├── Reporte
 └── Auditoría
```

---

# 108. PRINCIPIO FINAL DE ARQUITECTURA

La plataforma debe ser:

```text
MULTIEMPRESA
MULTISUCURSAL
MULTIUSUARIO
MULTICAJA
MULTICANAL
```

y tener:

```text
MySQL
Node.js
NestJS
Prisma
React
TypeScript
Hostinger
```

La arquitectura debe permitir comenzar con una infraestructura sencilla de Hostinger y crecer posteriormente a infraestructura más potente sin tener que reconstruir el producto.

**Objetivo final:**

> Crear un SaaS POS moderno para negocios de alimentos, donde una empresa pueda administrar ventas, mesas, domicilios, pedidos por WhatsApp, cocina, caja, inventario, compras, clientes y reportes desde una sola plataforma.