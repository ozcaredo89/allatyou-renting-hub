-- Agrega token único de edición/validación para que el postulante pueda revisar
-- o corregir sus datos antes de que la postulación sea aprobada o rechazada.
alter table public.driver_applications
  add column if not exists edit_token uuid not null default gen_random_uuid();

create unique index if not exists idx_driver_applications_edit_token
  on public.driver_applications (edit_token);
