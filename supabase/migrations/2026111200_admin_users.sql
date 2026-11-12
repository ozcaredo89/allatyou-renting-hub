-- Issue #49: usuarios personales del panel admin (reemplazan el Basic Auth genérico).
-- Login con correo+contraseña o Google, sesiones opacas y recuperación de contraseña.
-- Solo el API (service-role) accede a estas tablas: RLS activo y sin políticas.

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  password_hash text,
  google_sub text,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_via text not null default 'legacy_wizard', -- legacy_wizard | invite | google
  created_by uuid references public.admin_users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_users_email_uq on public.admin_users (lower(email));
create unique index if not exists admin_users_google_sub_uq on public.admin_users (google_sub) where google_sub is not null;

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists admin_sessions_user_idx on public.admin_sessions (user_id);

create table if not exists public.admin_password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_password_resets_user_idx on public.admin_password_resets (user_id);

alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_password_resets enable row level security;
