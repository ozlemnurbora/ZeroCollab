alter table public.team_members
add column if not exists role text default 'team_member';

update public.team_members tm
set role = 'team_admin'
from public.teams t
where tm.team_id = t.id
  and tm.user_id = t.owner_id
  and (tm.role is null or tm.role = '' or tm.role = 'member');

update public.team_members
set role = 'team_member'
where role is null or role = '' or role = 'member';

create table if not exists public.role_audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  target_user_id uuid,
  changed_by uuid,
  old_role text,
  new_role text,
  created_at timestamptz default now()
);

alter table public.role_audit_logs enable row level security;

create policy if not exists "role_audit_logs_select_authenticated"
on public.role_audit_logs
for select
to authenticated
using (true);

create policy if not exists "role_audit_logs_insert_authenticated"
on public.role_audit_logs
for insert
to authenticated
with check (auth.uid() is not null and changed_by = auth.uid());
