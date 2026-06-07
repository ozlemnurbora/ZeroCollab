create table if not exists public.release_packages (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  name text not null,
  deploy_date text,
  epic_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists release_packages_project_id_idx on public.release_packages(project_id);
alter table public.release_packages enable row level security;

drop policy if exists "release_packages_select_project_members" on public.release_packages;
create policy "release_packages_select_project_members" on public.release_packages
for select to authenticated
using (exists (select 1 from public.project_members pm where pm.project_id = release_packages.project_id and pm.user_id = auth.uid()));

drop policy if exists "release_packages_insert_project_members" on public.release_packages;
create policy "release_packages_insert_project_members" on public.release_packages
for insert to authenticated
with check (exists (select 1 from public.project_members pm where pm.project_id = release_packages.project_id and pm.user_id = auth.uid()));

drop policy if exists "release_packages_update_project_members" on public.release_packages;
create policy "release_packages_update_project_members" on public.release_packages
for update to authenticated
using (exists (select 1 from public.project_members pm where pm.project_id = release_packages.project_id and pm.user_id = auth.uid()))
with check (exists (select 1 from public.project_members pm where pm.project_id = release_packages.project_id and pm.user_id = auth.uid()));

drop policy if exists "release_packages_delete_project_members" on public.release_packages;
create policy "release_packages_delete_project_members" on public.release_packages
for delete to authenticated
using (exists (select 1 from public.project_members pm where pm.project_id = release_packages.project_id and pm.user_id = auth.uid()));
