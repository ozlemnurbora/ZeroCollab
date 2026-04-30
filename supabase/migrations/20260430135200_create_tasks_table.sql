create table if not exists public.tasks (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  assignee text,
  status text default 'todo',
  priority text default 'must',
  item_type text default 'task',
  backlog_state text default 'new',
  story_points int default 0,
  sprint_id text null,
  sprint_number int null,
  sprint_committed_at timestamptz null,
  calendar_type text default 'general',
  calendar_id text default 'general',
  team_id text null,
  owner_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists tasks_project_id_idx on public.tasks(project_id);
create index if not exists tasks_updated_at_idx on public.tasks(updated_at);

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_project_members" on public.tasks;
create policy "tasks_select_project_members"
on public.tasks
for select
to authenticated
using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = tasks.project_id
    and pm.user_id = auth.uid()
  )
);

drop policy if exists "tasks_insert_project_members" on public.tasks;
create policy "tasks_insert_project_members"
on public.tasks
for insert
to authenticated
with check (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = tasks.project_id
    and pm.user_id = auth.uid()
  )
);

drop policy if exists "tasks_update_project_members" on public.tasks;
create policy "tasks_update_project_members"
on public.tasks
for update
to authenticated
using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = tasks.project_id
    and pm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = tasks.project_id
    and pm.user_id = auth.uid()
  )
);

drop policy if exists "tasks_delete_project_members" on public.tasks;
create policy "tasks_delete_project_members"
on public.tasks
for delete
to authenticated
using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = tasks.project_id
    and pm.user_id = auth.uid()
  )
);

