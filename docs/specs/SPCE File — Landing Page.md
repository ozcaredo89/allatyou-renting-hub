SPEC FILE: AllAtYou Landing Page & Ecosystem
Versión: 2.0 (Growth & Service Expansion) Estado: Producción Dominio: www.allatyou.com

1. Propósito y Estrategia
La Landing Page ha evolucionado de un simple folleto informativo a un Ecosistema de Servicios. Cumple tres funciones estratégicas:

Conversión Core (Renting): Captar propietarios (inversionistas) y conductores para el modelo operativo.

Growth Hacking (SEO & Utilidades): Atraer tráfico masivo mediante herramientas gratuitas de alto valor (Pico y Placa, Recordatorios) ubicadas en la "Zona de Acción" del Hero.

Upselling (Asistencia): Vender el nuevo servicio de "Asistencia Vehicular" como un producto independiente o complementario.

2. Arquitectura y Enrutamiento
2.1 Dominios
www.allatyou.com (Público): Landing Page, Asistencia, Utilidades.

web.allatyou.com (Operativo): Aplicación de gestión interna (redirige a /pay o login).

2.2 Router (web/src/App.tsx)
El enrutamiento público se maneja bajo el PublicLayout (Header blanco/transparente).

Ruta	Componente	Descripción
/	Landing.tsx	Página principal con Hero, Utilidades y Formularios.
/assistance	Assistance.tsx	(NUEVO) Landing de venta del servicio de Asistencia ($180k/mes).
/pay	Pay.tsx	Pasarela de pagos para clientes operativos.
3. Estructura de la Landing Page (/)
El diseño sigue un flujo de "Embudo de Confianza".

3.1 Navbar (Sticky)
Logo: AllAtYou Renting Hub.

Links: Inicio, Asistencia (NUEVO), Pagos (solo visible en subdominio operativo).

Acciones: WhatsApp (Soporte).

3.2 Hero Section ("La Zona de Acción")
Copy: "Pon tu carro a producir sin manejarlo."

Grid de Acciones (Jerarquía Visual):

Negocio (Fila Superior): Botones grandes para "Simular Ganancias" (CTA Principal - Verde) y "Cómo funciona".

Ganchos SEO (Fila Inferior): Tarjetas tipo "App" con fondo oscuro (bg-[#0f172a]) para:

Pico y Placa Hoy: Abre Modal.

Recordatorios (SOAT/Tecno): Abre Modal.

Responsive Fix: En móvil es 1 columna (grid-cols-1), en escritorio 2 columnas.

3.3 Componentes Visuales Clave
ModelOverview.tsx (Responsive):

Muestra el ciclo: Filtro → Contrato → Control → Ingreso.

Móvil: Diseño vertical (flex-col) con flechas hacia abajo (↓) y línea conectora de fondo.

Desktop: Diseño horizontal (flex-row) con flechas a la derecha (→).

IncomeSimulator.tsx: Calculadora de rentabilidad proyectada.

3.4 Secciones de Contenido
Cómo funciona: Pasos para propietarios.

AssistanceBanner.tsx (NUEVO):

Ubicación: Entre "Cómo funciona" y "Flujo de dinero".

Función: Upselling. Banner visualmente destacado (gradiente oscuro/esmeralda) que lleva a /assistance.

Flujo del dinero: Explicación de transparencia financiera.

Formularios:

DriverApplicationForm (Conductores).

VehicleApplicationForm (Propietarios).

3.5 Trust Section (Cierre de Venta)
Componente: TrustSection.tsx (NUEVO).

Ubicación: Estratégica, antes de las FAQ.

Contenido: "Por qué esto no es un salto al vacío". 3 pilares de seguridad (Selección, Contratos, Reportes) para reducir la fricción final.

4. Nueva Página: Asistencia (/assistance)
Una Landing Page dedicada para vender el servicio de protección vehicular.

Hero: "Cuando tu carro falla, AllAtYou se hace cargo".

Grid de Servicios: Asistencia en carretera, Gestión de talleres, Peritaje, Legal.

Pricing Card: Precio claro ($180.000/mes) y lista de inclusiones/exclusiones.

CTA: Botón directo a WhatsApp con mensaje pre-configurado para ventas.

5. Funcionalidad de Utilidades (SEO Técnico)
Las utilidades ya no son secciones in-page, son Modales (UtilitiesModals.tsx) para limpiar la interfaz, pero mantienen su poder SEO mediante parámetros de URL.

5.1 Lógica de Modales
Pico y Placa: Input de placa → Consulta reglas locales (hardcoded en front + métrica en back).

Recordatorios: Formulario para suscribir email/WhatsApp a alertas de vencimiento (SOAT/Tecno).

5.2 SEO Hooks (Parámetros URL)
El useEffect de Landing.tsx escucha query params para abrir modales automáticamente al compartir enlaces:

allatyou.com/?tool=pico-placa → Abre modal de Pico y Placa.

allatyou.com/?tool=recordatorios → Abre modal de Recordatorios.

allatyou.com/?plate=ABC1234 → Abre recordatorios y pre-llena la placa.

6. Stack Técnico & Backend
Frontend: React 18 + Vite + TypeScript + TailwindCSS.

Iconografía: lucide-react (Reemplazo de SVGs manuales para consistencia).

Endpoints Backend (Node.js/Express):

POST /metrics/landing-view: Conteo de visitas.

POST /metrics/pico-placa-use: Conteo de uso de herramienta.

POST /reminders: Guardar suscripción de recordatorios.

GET /metrics/summary: Mostrar contador social (opcional).

7. Reglas de Diseño (Actualizadas)
Paleta de Colores:

Fondo Principal: bg-[#0b1220] (Azul muy oscuro/Negro).

Tarjetas Secundarias: bg-[#0f172a] (Slate-900).

Acento/Éxito: emerald-500 / emerald-400 (Texto brillante).

Texto Muted: slate-400.

Tipografía: Sans-serif (Inter/System fonts).

Responsividad: Mobile-First.

Botones de Hero: Full width en móvil.

Tablas/Grid: Stack vertical en móvil.

Notas de Despliegue: Al desplegar esta versión, asegurar que las variables de entorno (VITE_API_URL) apunten al backend de producción correcto para que el registro de recordatorios y métricas funcione.