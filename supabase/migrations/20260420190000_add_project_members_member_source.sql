-- Membership source for manager-controlled project access.
-- Values: 'owner' | 'direct' | 'team'

ALTER TABLE public.project_members
ADD COLUMN IF NOT EXISTS member_source text;

COMMENT ON COLUMN public.project_members.member_source IS
  'owner: project creator; direct: invited to project only; team: access via assigned team';

-- Backfill existing rows (safe defaults)
UPDATE public.project_members
SET member_source = 'owner'
WHERE role = 'owner' AND (member_source IS NULL OR member_source = '');

UPDATE public.project_members
SET member_source = 'team'
WHERE role IS DISTINCT FROM 'owner' AND (member_source IS NULL OR member_source = '');
