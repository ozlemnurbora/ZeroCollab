alter table public.project_members
add column if not exists custom_role text;

alter table public.team_members
add column if not exists custom_role text;
