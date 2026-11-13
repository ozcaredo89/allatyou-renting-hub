# SPEC File — Arquitectura, Repositorios y Tecnologías

**Proyecto:** AllAtYou Renting Hub  
**Versión:** 2.0 (Consolidada)  
**Estado:** Producción Activa 🟢  
**Fecha de Actualización:** Febrero 2026  

---

## 1. Visión General

AllAtYou Renting Hub es una plataforma de gestión de renting vehicular P2P y administración de flota. El sistema opera bajo una arquitectura **JAMStack desacoplada**, diseñada para separar completamente la lógica de presentación (Frontend) de la lógica de negocio y datos (Backend + DB).

### Principios Rectores

- **Frontend Desacoplado:** La UI es estática y se despliega independientemente.  
- **Backend Delgado (Thin API):** La API gestiona la orquestación, validación y seguridad, pero delega el almacenamiento y la integridad de datos a la base de datos.  
- **Base de Datos como Fuente de Verdad:** Se prioriza el SQL directo y Triggers sobre la lógica en código para garantizar integridad.  
- **Monorepo:** Backend y Frontend conviven en el mismo repositorio para facilitar la coherencia en tipos y despliegues.  

---

## 2. Stack Tecnológico

### 🎨 Frontend (Cliente)

- **Core:** React 18 + Vite  
- **Lenguaje:** TypeScript  
- **Estilos:** TailwindCSS v4  
- **Routing:** React Router DOM (con lógica basada en subdominios)  
- **Despliegue:** Vercel (CI/CD automático)  
- **HTTP Client:** Fetch API nativo (sin librerías externas como Axios)  

### 🧠 Backend (Servidor API)

- **Runtime:** Node.js  
- **Framework:** Express.js  
- **Lenguaje:** TypeScript  
- **Base de Datos (Cliente):** Supabase JS SDK (usando `SERVICE_ROLE_KEY`)  

**Servicios Externos:**
- **Email:** Resend API  
- **WhatsApp:** Twilio SDK  

**Despliegue:** Railway  

### 🗄️ Datos y Almacenamiento

- **Base de Datos:** PostgreSQL (vía Supabase)  
- **Storage:** Supabase Storage (Buckets S3-compatible)  

**Configuración Bucket `proofs`:**
- Acceso Público: Activado  
- Límite de tamaño: 5MB por archivo  
- Tipos permitidos:  
  - image/jpeg  
  - image/png  
  - image/webp  
  - image/heic  
  *(Restricción estricta)*  

---

## 3. Estructura del Monorepo

El proyecto reside en un único repositorio `allatyou-renting-hub/` dividido en dos contextos claros:

### 3.1 Estructura de Directorios

```plaintext
allatyou-renting-hub/
├── src/                      # 🧠 BACKEND (API Express)
│   ├── index.ts              # Entry Point (Puerto 3000)
│   ├── lib/                  # Clientes de servicios (Supabase, Resend, Twilio)
│   ├── middleware/           # Auth Admin, Logger
│   └── routes/               # Endpoints REST (Lógica de negocio por módulo)
│
├── web/                      # 🎨 FRONTEND (React Vite)
│   ├── src/
│   │   ├── main.tsx          # Entry Point
│   │   ├── App.tsx           # Router inteligente (Landing vs App Interna)
│   │   ├── components/       # UI Reutilizable (Simuladores, Forms, Modales)
│   │   └── pages/            # Vistas completas (Landing, Admin Dashboard)
│   ├── public/               # Assets estáticos (Favicons, Imágenes base)
│   └── vite.config.ts        # Configuración de Build
│
└── package.json              # Dependencias Raíz (Backend)
```

---

## 4. Frontera entre Repositorios y Regla de Alcance

Este repositorio (`allatyou-renting-hub`) **no** contiene todos los productos del ecosistema AllAtYou. Antes de ejecutar una tarea, análisis o reporte, verifica que el dominio pertenezca realmente a este repositorio:

- **`allatyou-renting-hub` (este repo):** Renting/Leasing, flota propia, conductores, pagos diarios, gastos, anticipos operativos, utilidades/ledger, cobranza, inspecciones, inventario de renting, marketplace, recordatorios y telemetría GPS (Oráculo).
- **`allatyou-taller` / TallerPro (repositorio y servicio externo):** Órdenes de taller, mecánicos/operarios, tiempos/horas trabajadas, bitácora operativa de taller y facturación de taller. `allatyou-renting-hub` solo consulta estadías por placa en modo lectura (`src/lib/taller.ts` → `GET /v1/vehiculos/{placa}/historial`) y recibe gastos de reparación vía `POST /expenses`.

### Regla obligatoria para Agentes IA
1. **Validar alcance antes de actuar:** Si el usuario pide un reporte, consulta o cambio sobre datos/funcionalidades que viven en otro repositorio (ej. horas de mecánicos, órdenes de taller o módulos de `allatyou-taller`), **detenerse y advertir al usuario** que está pidiendo algo de otro repositorio y que puede ser un error de contexto.
2. **No improvisar en el repo equivocado:** No crear tablas, endpoints, scripts ni workarounds en `allatyou-renting-hub` para simular o reemplazar funcionalidad que pertenece a otro repositorio, salvo que el usuario confirme explícitamente que desea construir una integración nueva aquí.
