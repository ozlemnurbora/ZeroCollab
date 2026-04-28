create table if not exists public.sprints (
  id text primary key,
  project_id text not null,
  sprint_number integer not null,
  duration_weeks integer not null,
  start_date date not null,
  end_date date not null,
  sprint_goal text,
  status text not null default 'active',
  created_by uuid,
  created_at timestamptz default now()
);

alter table public.sprints
  drop constraint if exists sprints_status_check;

alter table public.sprints
  add constraint sprints_status_check
  check (status in ('active', 'completed'));

create unique index if not exists idx_sprints_project_sprint_number
on public.sprints(project_id, sprint_number);

create index if not exists idx_sprints_project_status
on public.sprints(project_id, status);

alter table public.sprints enable row level security;

drop policy if exists "sprints_select_authenticated" on public.sprints;
create policy "sprints_select_authenticated"
on public.sprints
for select
to authenticated
using (true);

drop policy if exists "sprints_insert_authenticated" on public.sprints;
create policy "sprints_insert_authenticated"
on public.sprints
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "sprints_update_authenticated" on public.sprints;
create policy "sprints_update_authenticated"
on public.sprints
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);
