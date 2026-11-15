---
name: GPOS
description: Sistema visual de la aplicación operativa para negocios de comidas.
colors:
  primary: "#006bd6"
  primary-hover: "#005bb8"
  graphite: "#1d1d1f"
  print-ink: "#000000"
  control-text: "#333336"
  muted: "#646469"
  muted-strong: "#4c5666"
  porcelain: "#f5f5f7"
  surface: "#ffffff"
  surface-subtle: "#fafbfd"
  control-hover: "#f0f1f4"
  line: "#e9e9ed"
  control-border: "#d2d2d7"
  contrast-border: "#9ba4b2"
  navigation-selected: "#dfe8fb"
  navigation-selected-text: "#185cce"
  confirmed-bg: "#edf2fc"
  confirmed-text: "#315b9b"
  pending-bg: "#fff4e5"
  pending-text: "#855c20"
  ready-bg: "#eaf5ef"
  ready-text: "#286b50"
  occupied-bg: "#edf0fc"
  occupied-text: "#505993"
  closed-bg: "#eff2f5"
  closed-text: "#4c6073"
  cancelled-bg: "#faeeee"
  cancelled-text: "#963f3f"
  danger: "#bd3535"
  danger-border: "#ecdada"
  selection-bg: "#cfe0ff"
  selection-text: "#113772"
  interactive-border: "#8fb1f1"
  chart-fill: "#6c9bed"
  toast-success: "#273c35"
  toast-error: "#803e3b"
  toast-action: "#d4dfda"
  art-neutral-bg: "#f1eee8"
  art-neutral-ink: "#a58e6d"
  art-sand-bg: "#f4ede5"
  art-sand-ink: "#a8865c"
  art-clay-bg: "#f7eee8"
  art-clay-ink: "#b58a69"
  art-olive-bg: "#eff2e7"
  art-olive-ink: "#899c66"
  art-sky-bg: "#e9f0f5"
  art-sky-ink: "#7298af"
  art-rose-bg: "#f3eaf0"
  art-rose-ink: "#ac809b"
  focus-ring: "#006bd6"
  focus-halo: "#006bd611"
  sidebar-material: "#f0f1f4d9"
  toolbar-material: "#f8f8facf"
  bottom-material: "#fafbfded"
  modal-scrim: "#18203452"
  drawer-scrim: "#18243565"
  contrast-scrim: "#18203490"
  art-overlay: "#ffffffc9"
  inverse-border: "#ffffff50"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: 1.17
    letterSpacing: "-0.035em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  button:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 550
    lineHeight: 1.5
  metric:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  micro:
    fontSize: "0.6875rem"
  label:
    fontSize: "0.75rem"
  body-large:
    fontSize: "1rem"
  title-large:
    fontSize: "1.25rem"
  heading:
    fontSize: "1.5rem"
  display-small:
    fontSize: "2.25rem"
  display:
    fontSize: "2.625rem"
  hero-mobile:
    fontSize: "3rem"
  fluid-title:
    fontSize: "clamp(1.125rem, 6vw, 1.75rem)"
  fluid-hero:
    fontSize: "clamp(2.8125rem, 6.5vw, 5.25rem)"
rounded:
  detail: "4px"
  chip: "6px"
  compact: "8px"
  feedback: "12px"
  badge: "5px"
  input: "11px"
  button: "9999px"
  metric: "13px"
  panel: "14px"
  service: "16px"
  modal: "18px"
spacing:
  control-gap: "9px"
  compact-gap: "12px"
  metric-gap: "18px"
  panel-gap: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "9px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.control-text}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "9px 16px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.button}"
    padding: "9px 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "9px 16px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.control-text}"
    rounded: "{rounded.input}"
    typography: "{typography.button}"
    height: "44px"
    padding: "8px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
  badge-ready:
    backgroundColor: "{colors.ready-bg}"
    textColor: "{colors.ready-text}"
    rounded: "{rounded.badge}"
    padding: "4px 7px"
---

# Design System: GPOS

## Overview

**Creative North Star: "Operación visible"**

La interfaz operativa usa gris porcelana, blanco, grafito y azul funcional. La tipografía del sistema y los materiales translúcidos de navegación mantienen la atención en pedidos, importes y acciones. La densidad es compacta; las superficies se separan principalmente por tono y bordes suaves.

Este documento describe el código terminado, no una propuesta. La guía original `appledesing.md` y la referencia visual `apple.DESIGN.md` aportan jerarquía, tipografía de sistema, controles en cápsula, foco nítido y superficies neutras. GPOS conserva la densidad de una herramienta de trabajo y el color de estados operativos, acompañado siempre por texto. El nombre descriptivo anterior resume el contrato existente en `docs/surface.md`, sin introducir una nueva identidad.

**Key Characteristics:**
- Tipografía del sistema y cifras tabulares en tablas e indicadores.
- Azul funcional para acciones y selección; estados semánticos contenidos.
- Navegación translúcida, contenido blanco y esquinas suavizadas.
- Respuesta breve a la pulsación y alternativas para preferencias de accesibilidad.

## Colors

### Primary

Azul funcional identifica acciones principales, enlaces, caret y selección. Su variante más oscura corresponde al hover del botón principal. La selección de navegación usa una base azul pálida con texto azul propio.

### Neutral

Porcelana sostiene el fondo, blanco define el contenido y grafito corresponde al texto principal. `control-text` se usa en controles y texto operativo con énfasis. `muted` cubre metadatos, etiquetas secundarias y texto de ejemplo. `muted-strong` refuerza el texto secundario con preferencia de contraste alto. Los separadores usan `line`, los controles usan `control-border` y el modo de contraste alto usa `contrast-border`.

La paleta se aplica mediante variables en [style.css](apps/web/src/style.css). Los nombres del frontmatter coinciden con las variables CSS, salvo `primary` y `primary-hover`, que corresponden a `--blue` y `--blue-hover`. Las ilustraciones del catálogo conservan sus pares `art-*` y el gráfico usa `chart-fill`. Las variables de material y foco centralizan los colores de navegación y estados interactivos. La flecha del selector nativo reproduce el color `muted` en el recurso SVG compartido.

Los estados tienen pares de texto/fondo: confirmado y trial azules; pendiente, preparación y reserva ámbar; listo, activo, libre y recibido verdes; ocupado y en camino violetas; cerrado y entregado grises; cancelado, suspendido y fuera de servicio rojos. Se leen mediante etiqueta escrita, además del color. Rojo sólido identifica acciones destructivas.

## Typography

La pila de sistema se aplica a toda la aplicación, incluidos controles nativos. No hay una fuente web personalizada. El peso real depende del sistema anfitrión.

La raíz respeta el tamaño de fuente del navegador. Los tamaños de la tabla se expresan en píxeles equivalentes con la raíz predeterminada de 16 px. En CSS se implementan en `rem` con el prefijo `--text-`.

| Uso | Tamaños | Variables |
|---|---|---|
| Metadatos, estados y etiquetas | 11, 12 px | `micro`, `label` |
| Controles y texto general | 14, 16 px | `control`, `body`, `body-large` |
| Títulos de panel, diálogo y sección | 18, 20, 24 px | `title`, `title-large`, `heading` |
| Importes destacados y títulos de página | 28, 32 px | `metric`, `headline` |
| Titulares editoriales | 36, 42, 48 px | `display-small`, `display`, `hero-mobile` |

`fluid-title` escala entre 18 y 28 px. `fluid-hero` escala entre 45 y 84 px en la portada y cede a `hero-mobile` en pantallas estrechas. Las métricas, los importes y las cantidades usan cifras tabulares.

## Layout

La estructura desktop tiene sidebar fija de 224px, cabecera sticky de 72px y contenido de hasta 1700px con padding 28px 38px 50px. El resumen usa cuatro columnas de métricas; la variante de tres métricas usa tres. El dashboard divide su zona principal en `minmax(0, 1.65fr) minmax(270px, 1fr)` con separación 24px. El POS a pantalla completa separa el catálogo de la cuenta fija a la derecha. Cobrar ocupa el ancho de la cuenta y permanece visible al desplazar el catálogo. En teléfonos el catálogo y el detalle del ticket alternan, con el acceso al pedido y el cobro al alcance. Hasta 420 px, el selector de servicio pasa a una segunda fila para dar espacio al título.

- Desde 1500px: padding de contenido 38px 48px, catálogo de cuatro columnas y gráfico de 220px.
- Hasta 1200px: sidebar de 200px, padding 24px, cuenta de 305px y catálogo de dos columnas.
- Hasta 1000px: sidebar de iconos de 76px; se ocultan etiquetas, selector de espacio y pie lateral.
- Hasta 767px: navegación inferior y cajón lateral. La cabecera y la navegación dejan espacio para las áreas seguras. Dashboard y POS pasan a una columna, con acceso fijo durante el recorrido del catálogo para llegar al pedido. Las métricas, el catálogo y las mesas conservan dos columnas cuando caben. Los formularios generales pasan a una columna.
- Cocina muestra cuatro estados en fila en escritorio ancho, dos por fila hasta 1200px y uno por fila hasta 520px. En tablet el ticket se mantiene junto al catálogo cuando hay ancho suficiente.

Las tablas con columnas fuera de la vista muestran una pista de desplazamiento y admiten foco de teclado. El desplazamiento se mantiene dentro de la tabla. En móvil se simplifican el contexto de cabecera y el mensaje de demostración, conservando su indicación. La autenticación pierde su panel editorial y la landing apila características y planes. Impresión oculta navegación y controles y elimina sombras; el modal de comprobante puede ocupar toda la página.

## Elevation & Depth

Los paneles de trabajo son blancos con borde fino, sin sombra ambiental. Sidebar y cabecera usan fondos translúcidos y blur de 22px; navegación inferior usa 20px. El diálogo se distingue por el fondo de oscurecimiento `#18203452`. Las notificaciones y la vista previa de la portada usan contraste entre superficies.

La preferencia de transparencia reducida quita el blur y vuelve opaca la navegación; mayor contraste también elimina su transparencia.

## Shapes

Esquinas suaves distinguen escalas: etiquetas pequeñas, controles intermedios, paneles mayores y modal más redondeado, según el frontmatter. Los avatares y puntos de estado son círculos. Los límites se trazan generalmente con un borde de 1px. No existe un único radio global aplicado a todos los componentes ni una escala de espaciado de múltiplos estrictos.

## Components

### Buttons

Botones de forma cápsula y mínimo 44 px, separación interna 9px y borde 1px. Primario azul con texto blanco; secundario blanco con borde gris; quiet transparente azul; peligro rojo sólido; peligro discreto blanco con borde rosado y texto rojo. La variante grande mide al menos 49px y usa padding 12px 20px. Los botones de icono son de al menos 34px. Deshabilitados tienen opacidad 0.45 y cursor de indisponibilidad.

La pulsación responde en 120 ms con color y escala de 0.98. El diálogo entra en 220 ms con una traslación de 8 px. Las notificaciones y la confirmación del cobro aparecen en 180 ms, con énfasis breve en el icono de pago. La preferencia de movimiento reducido elimina desplazamiento, escala y giro, y conserva el cambio de color u opacidad y el mensaje de estado. Las animaciones del diálogo y del comprobante se limitan a pantalla.

### Inputs / Fields

Etiqueta de 12px, separación 7px y margen inferior 18px. Campos y búsquedas usan borde `control-border`, mínimo 44 px y radio de control. En pantallas táctiles tienen mínimo 44 px y texto de 16 px. Textarea admite redimensionado vertical y mínimo 85px. Búsqueda tiene ancho máximo de 380 px excepto catálogo; foco interno colorea el borde y añade halo azul suave. Errores de formulario usan mensaje rojo sobre fondo rosa claro.

### Chips

Los estados son etiquetas no interactivas de 11px y peso 500, sin borde, con pares semánticos del frontmatter. El chip contextual neutro usa borde y radio 6px; no es equivalente a un estado.

### Cards / Containers

Paneles con borde de línea, radio de panel y overflow oculto; encabezado con padding 23px 24px. Métricas con radio propio y padding 20px 22px. La cuenta del POS reutiliza la forma de panel. Las tarjetas de elección de servicio tienen radio 16px, mínimo 250px y padding 27px, con hover de borde azul suave y fondo casi blanco.

### Navigation

Enlaces laterales con icono y texto de 13px, padding 9px 12px, mínimo 39px, radio 8px. Hover gris claro; selección azul pálido y peso 600. En escritorio ancho suben a mínimo 42px. Navegación inferior presenta icono y etiqueta de 10px, con ancho mínimo 48px por destino. El cajón móvil incluye botón de cierre, Escape, confinamiento y restauración de foco.

### Dialogs and feedback

Modal blanco de hasta 490px (720px en variante amplia), máximo 90dvh, padding 27px y desplazamiento interno. Móvil reduce padding a 22px, radio a 16px y máximo a 88dvh. Incluye semántica de diálogo, título y descripción vinculados, foco inicial, confinamiento de Tab, Escape y restauración de foco. La navegación permite saltar al contenido principal con el teclado. Notificaciones usan `status` o `alert` según error y cierre etiquetado; en móvil aparecen debajo de la cabecera.

Los elementos interactivos comparten foco visible de 2 px en azul sólido y offset 4px. Existe texto solo para lectores de pantalla. Preferencias de contraste ajustan bordes y varios textos; transparencia y movimiento reducidos tienen reglas explícitas. Con puntero táctil, los botones principales, iconos, pestañas y controles de cantidad tienen objetivos de al menos 44px en su eje principal. Los campos de texto usan 16px. Esta captura se basa en CSS y componentes, sin afirmar una auditoría exhaustiva de contraste ni tecnologías asistivas.

## Do's and Don'ts

### Do:
- Do conservar la jerarquía de títulos, datos y metadatos del sistema.
- Do acompañar los estados con texto y mantener los importes alineados con cifras tabulares.
- Do mantener foco visible, etiquetas accesibles y las alternativas de movimiento y transparencia reducidos.
- Do adaptar navegación y columnas a los puntos de ruptura existentes.

### Don't:
- Don't convertir las superficies de trabajo en vidrio translúcido: el material está en la navegación y el fondo modal.
- Don't presentar resortes, gestos o animaciones físicas como capacidades implementadas: la versión actual usa transiciones CSS breves.
- Don't asumir que todos los controles alcanzan 44px ni declarar conformidad de accesibilidad sin una auditoría específica.
