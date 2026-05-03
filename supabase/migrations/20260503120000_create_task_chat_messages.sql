-- Durable task-scoped chat for project members (backfill when offline).

create table if not exists public.task_chat_messages (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  sender_user_id text,
  sender_name text,
  text text not null,
  created_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists task_chat_messages_project_task_idx
  on public.task_chat_messages(project_id, task_id);

create index if not exists task_chat_messages_created_at_idx
  on public.task_chat_messages(created_at);

alter table public.task_chat_messages enable row level security;

drop policy if exists "task_chat_messages_select_project_members" on public.task_chat_messages;
create policy "task_chat_messages_select_project_members"
on public.task_chat_messages
for select
to authenticated
using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = task_chat_messages.project_id
    and pm.user_id = auth.uid()
  )
);

drop policy if exists "task_chat_messages_insert_project_members" on public.task_chat_messages;
create policy "task_chat_messages_insert_project_members"
on public.task_chat_messages
for insert
to authenticated
with check (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = task_chat_messages.project_id
    and pm.user_id = auth.uid()
  )
  and coalesce(sender_user_id, '') = auth.uid()::text
);

drop policy if exists "task_chat_messages_update_own" on public.task_chat_messages;
create policy "task_chat_messages_update_own"
on public.task_chat_messages
for update
to authenticated
using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = task_chat_messages.project_id
    and pm.user_id = auth.uid()
  )
  and coalesce(sender_user_id, '') = auth.uid()::text
)
with check (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = task_chat_messages.project_id
    and pm.user_id = auth.uid()
  )
  and coalesce(sender_user_id, '') = auth.uid()::text
);

drop policy if exists "task_chat_messages_delete_own" on public.task_chat_messages;
create policy "task_chat_messages_delete_own"
on public.task_chat_messages
for delete
to authenticated
using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = task_chat_messages.project_id
    and pm.user_id = auth.uid()
  )
  and coalesce(sender_user_id, '') = auth.uid()::text
);
