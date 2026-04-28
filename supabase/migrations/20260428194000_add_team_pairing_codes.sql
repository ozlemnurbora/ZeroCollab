create table if not exists team_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  code text unique not null,
  created_by uuid not null,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_team_pairing_codes_code
on team_pairing_codes(code);
