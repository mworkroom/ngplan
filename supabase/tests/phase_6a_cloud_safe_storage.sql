-- Phase 6A database contract checks.
-- Run against an isolated/local database after migrations. Every data change is
-- wrapped in this transaction and rolled back.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

select has_table(
  'public',
  'ngplan_projects',
  'Phase 6A project table exists'
);
select has_table(
  'public',
  'ngplan_daily_backups',
  'Phase 6A daily backup table exists'
);
select is(
  (select count(*) from public.workspaces where name = 'ngplan'),
  1::bigint,
  'Exactly one ngplan workspace exists'
);
select ok(
  not has_table_privilege('anon', 'public.ngplan_projects', 'select'),
  'anon cannot read ngplan projects'
);
select ok(
  not has_table_privilege('authenticated', 'public.ngplan_projects', 'delete'),
  'authenticated cannot delete ngplan projects'
);
select ok(
  has_table_privilege(
    'authenticated',
    'public.ngplan_projects',
    'select,insert,update'
  ),
  'authenticated project privileges are complete'
);

do $$
declare
  test_user_id constant uuid := '60000000-0000-4000-8000-000000000001';
  ngplan_workspace_id uuid;
begin
  select id
  into ngplan_workspace_id
  from public.workspaces
  where name = 'ngplan';

  if not exists (
    select 1
    from public.workspace_members
    where workspace_id = ngplan_workspace_id
  ) then
    insert into auth.users (
      id,
      aud,
      role,
      email,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      test_user_id,
      'authenticated',
      'authenticated',
      'phase6a-local-test@example.invalid',
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
    on conflict (id) do nothing;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (ngplan_workspace_id, test_user_id, 'admin')
    on conflict (workspace_id, user_id) do nothing;
  end if;
end
$$;

select set_config(
  'ngplan.test_workspace_id',
  (select id::text from public.workspaces where name = 'ngplan'),
  true
);
select set_config('ngplan.test_project_id', gen_random_uuid()::text, true);
select set_config(
  'ngplan.test_member_id',
  (
    select user_id::text
    from public.workspace_members
    where workspace_id = current_setting('ngplan.test_workspace_id')::uuid
    order by user_id
    limit 1
  ),
  true
);
select set_config(
  'request.jwt.claim.sub',
  current_setting('ngplan.test_member_id'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('ngplan.test_member_id'),
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

insert into public.ngplan_projects (
  id,
  workspace_id,
  title,
  period_year,
  period_month,
  period_half,
  current_document
)
values (
  current_setting('ngplan.test_project_id')::uuid,
  current_setting('ngplan.test_workspace_id')::uuid,
  'Phase 6A contract check',
  null,
  null,
  'FIRST_HALF',
  jsonb_build_object(
    'version', 1,
    'draft', jsonb_build_object(
      'projectId', current_setting('ngplan.test_project_id')
    ),
    'manualPlanDraft', null
  )
);

update public.ngplan_projects
set current_document = jsonb_set(
  current_document,
  '{manualPlanDraft}',
  '{"cells":[]}'::jsonb
)
where id = current_setting('ngplan.test_project_id')::uuid;

update public.ngplan_projects
set hidden_at = now()
where id = current_setting('ngplan.test_project_id')::uuid;

select set_config(
  'ngplan.test_member_visible_count',
  (
    select count(*)::text
    from public.ngplan_projects
    where id = current_setting('ngplan.test_project_id')::uuid
  ),
  true
);
select set_config(
  'ngplan.test_revision_hidden_ok',
  (
    select coalesce(
      bool_and(
        revision = 2
        and hidden_at is not null
        and hidden_by = auth.uid()
      ),
      false
    )::text
    from public.ngplan_projects
    where id = current_setting('ngplan.test_project_id')::uuid
  ),
  true
);
select set_config(
  'ngplan.test_daily_backup_ok',
  (
    select (
      count(*) = 1
      and bool_and(
        business_date =
          (now() at time zone 'America/Sao_Paulo')::date
      )
      and bool_and(source_revision = 2)
    )::text
    from public.ngplan_daily_backups
    where project_id = current_setting('ngplan.test_project_id')::uuid
  ),
  true
);

reset role;

select is(
  current_setting('ngplan.test_member_visible_count')::bigint,
  1::bigint,
  'Workspace member can read the inserted project'
);
select ok(
  current_setting('ngplan.test_revision_hidden_ok')::boolean,
  'Revision and hidden attribution are correct'
);
select ok(
  current_setting('ngplan.test_daily_backup_ok')::boolean,
  'Daily backup is one latest Sao Paulo day row'
);

set local role authenticated;

update public.ngplan_projects
set hidden_at = null
where id = current_setting('ngplan.test_project_id')::uuid;

select set_config(
  'ngplan.test_restore_ok',
  (
    select coalesce(
      bool_and(hidden_at is null and hidden_by is null),
      false
    )::text
    from public.ngplan_projects
    where id = current_setting('ngplan.test_project_id')::uuid
  ),
  true
);

reset role;

select ok(
  current_setting('ngplan.test_restore_ok')::boolean,
  'Restore clears hidden attribution'
);

select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('request.jwt.claim.sub'),
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

select set_config(
  'ngplan.test_nonmember_visible_count',
  (
    select count(*)::text
    from public.ngplan_projects
    where id = current_setting('ngplan.test_project_id')::uuid
  ),
  true
);

reset role;

select is(
  current_setting('ngplan.test_nonmember_visible_count')::bigint,
  0::bigint,
  'A non-member cannot read an ngplan project'
);

select * from finish();
rollback;
