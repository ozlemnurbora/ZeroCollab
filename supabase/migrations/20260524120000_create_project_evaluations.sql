-- Project-scoped evaluations shared across all project members.

create table if not exists public.project_evaluations (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  author_user_id text not null,
  author_name text,
  package_type text,
  total integer not null default 0,
  max integer not null default 100,
  percentage integer not null default 0,
  overall_feedback text default '',
  criteria jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_evaluations_project_idx
  on public.project_evaluations(project_id);

create index if not exists project_evaluations_created_at_idx
  on public.project_evaluations(created_at);

alter table public.project_evaluations enable row level security;

drop policy if exists "project_evaluations_select_project_members" on public.project_evaluations;
create policy "project_evaluations_select_project_members"
on public.project_evaluations
for select
to authenticated
using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = project_evaluations.project_id
    and pm.user_id = auth.uid()
  )
);

drop policy if exists "project_evaluations_insert_project_members" on public.project_evaluations;
create policy "project_evaluations_insert_project_members"
on public.project_evaluations
for insert
to authenticated
with check (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = project_evaluations.project_id
    and pm.user_id = auth.uid()
  )
  and coalesce(author_user_id, '') = auth.uid()::text
);

drop policy if exists "project_evaluations_delete_own" on public.project_evaluations;
create policy "project_evaluations_delete_own"
on public.project_evaluations
for delete
to authenticated
using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = project_evaluations.project_id
    and pm.user_id = auth.uid()
  )
  and coalesce(author_user_id, '') = auth.uid()::text
);
