alter table public.sprints
add column if not exists capacity_points integer default 0 not null;
