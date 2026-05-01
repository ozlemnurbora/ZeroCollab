alter table public.sprints
  add column if not exists planning_status text default 'draft' not null,
  add column if not exists planning_completed_at timestamptz null,
  add column if not exists planning_completed_by uuid null references auth.users(id) on delete set null;

alter table public.sprints
  drop constraint if exists sprints_planning_status_check;

alter table public.sprints
  add constraint sprints_planning_status_check
  check (planning_status in ('draft', 'completed'));
