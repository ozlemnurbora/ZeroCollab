alter table public.projects
add column if not exists goal text,
add column if not exists phase text default 'planning',
add column if not exists status text default 'active',
add column if not exists start_date date,
add column if not exists target_end_date date;

alter table public.projects
  drop constraint if exists projects_phase_check;

alter table public.projects
  add constraint projects_phase_check
  check (phase in ('planning', 'development', 'testing', 'deployment', 'completed'));

alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
  check (status in ('active', 'on_hold', 'completed'));
