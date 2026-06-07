create table if not exists public.activity_logs (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  action text not null,
  category text default 'system',
  severity text default 'info',
  message text,
  entity_type text,
  entity_id text,
  entity_name text,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists activity_logs_project_id_idx on public.activity_logs(project_id);
create index if not exists activity_logs_created_at_idx on public.activity_logs(created_at);

alter table public.activity_logs enable row level security;

drop policy if exists "activity_logs_select_project_members" on public.activity_logs;
create policy "activity_logs_select_project_members" on public.activity_logs
for select to authenticated
using (exists (select 1 from public.project_members pm where pm.project_id = activity_logs.project_id and pm.user_id = auth.uid()));

drop policy if exists "activity_logs_insert_project_members" on public.activity_logs;
create policy "activity_logs_insert_project_members" on public.activity_logs
for insert to authenticated
with check (exists (select 1 from public.project_members pm where pm.project_id = activity_logs.project_id and pm.user_id = auth.uid()));

drop policy if exists "activity_logs_delete_project_members" on public.activity_logs;
create policy "activity_logs_delete_project_members" on public.activity_logs
for delete to authenticated
using (exists (select 1 from public.project_members pm where pm.project_id = activity_logs.project_id and pm.user_id = auth.uid()));
