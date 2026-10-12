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
