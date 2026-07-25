-- ngplan Phase 6A: cloud-safe whole-plan storage.
--
-- This migration is intentionally self-contained enough to replay on a fresh
-- local Supabase database while reusing the existing shared workspace tables
-- in the hosted ngapps project.

create schema if not exists private;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id);

do $$
begin
  if to_regprocedure('private.is_workspace_member(uuid)') is null then
    execute $function$
      create function private.is_workspace_member(target_workspace_id uuid)
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select exists (
          select 1
          from public.workspace_members as wm
          where wm.workspace_id = target_workspace_id
            and wm.user_id = (select auth.uid())
        )
      $body$
    $function$;
  end if;
end
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspaces'
      and policyname = 'ngplan_workspaces_select_member'
  ) then
    create policy ngplan_workspaces_select_member
      on public.workspaces
      for select
      to authenticated
      using ((select private.is_workspace_member(id)));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_members'
      and policyname = 'ngplan_workspace_members_select_self'
  ) then
    create policy ngplan_workspace_members_select_self
      on public.workspace_members
      for select
      to authenticated
      using (user_id = (select auth.uid()));
  end if;
end
$$;

create unique index if not exists workspaces_ngplan_name_unique
  on public.workspaces (name)
  where name = 'ngplan';

with inserted_workspace as (
  insert into public.workspaces (name)
  select 'ngplan'
  where not exists (
    select 1
    from public.workspaces
    where name = 'ngplan'
  )
  returning id
),
target_workspace as (
  select id
  from inserted_workspace
  union all
  select id
  from public.workspaces
  where name = 'ngplan'
  order by id
  limit 1
)
insert into public.workspace_members (workspace_id, user_id, role)
select target_workspace.id, users.id, 'admin'
from target_workspace
cross join auth.users as users
on conflict (workspace_id, user_id)
do update set role = excluded.role;

create table public.ngplan_projects (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  title text not null,
  period_year smallint,
  period_month smallint,
  period_half text not null,
  timezone text not null default 'America/Sao_Paulo',
  document_schema_version integer not null default 1,
  current_document jsonb not null,
  revision bigint not null default 1,
  hidden_at timestamptz,
  hidden_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_saved_at timestamptz not null default now(),
  last_saved_by uuid references auth.users(id) on delete set null,
  constraint ngplan_projects_workspace_id_id_key
    unique (workspace_id, id),
  constraint ngplan_projects_title_length
    check (char_length(btrim(title)) between 1 and 200),
  constraint ngplan_projects_period_year_range
    check (period_year is null or period_year between 2000 and 2200),
  constraint ngplan_projects_period_month_range
    check (period_month is null or period_month between 1 and 12),
  constraint ngplan_projects_period_half_value
    check (period_half in ('FIRST_HALF', 'SECOND_HALF')),
  constraint ngplan_projects_timezone_value
    check (timezone = 'America/Sao_Paulo'),
  constraint ngplan_projects_document_schema_version
    check (document_schema_version = 1),
  constraint ngplan_projects_document_object
    check (jsonb_typeof(current_document) = 'object'),
  constraint ngplan_projects_document_version_matches
    check (current_document @> '{"version": 1}'::jsonb),
  constraint ngplan_projects_document_project_matches
    check (current_document #>> '{draft,projectId}' = id::text),
  constraint ngplan_projects_revision_positive
    check (revision >= 1)
);

create index ngplan_projects_workspace_id_idx
  on public.ngplan_projects (workspace_id);

create index ngplan_projects_visible_updated_idx
  on public.ngplan_projects (workspace_id, updated_at desc)
  where hidden_at is null;

create index ngplan_projects_hidden_updated_idx
  on public.ngplan_projects (workspace_id, updated_at desc)
  where hidden_at is not null;

create index ngplan_projects_created_by_idx
  on public.ngplan_projects (created_by)
  where created_by is not null;

create index ngplan_projects_hidden_by_idx
  on public.ngplan_projects (hidden_by)
  where hidden_by is not null;

create index ngplan_projects_last_saved_by_idx
  on public.ngplan_projects (last_saved_by)
  where last_saved_by is not null;

create table public.ngplan_daily_backups (
  project_id uuid not null,
  workspace_id uuid not null,
  business_date date not null,
  document_schema_version integer not null,
  document jsonb not null,
  source_revision bigint not null,
  saved_at timestamptz not null,
  saved_by uuid references auth.users(id) on delete set null,
  primary key (project_id, business_date),
  constraint ngplan_daily_backups_project_workspace_fkey
    foreign key (workspace_id, project_id)
    references public.ngplan_projects(workspace_id, id)
    on delete cascade,
  constraint ngplan_daily_backups_document_schema_version
    check (document_schema_version = 1),
  constraint ngplan_daily_backups_document_object
    check (jsonb_typeof(document) = 'object'),
  constraint ngplan_daily_backups_document_version_matches
    check (document @> '{"version": 1}'::jsonb),
  constraint ngplan_daily_backups_document_project_matches
    check (document #>> '{draft,projectId}' = project_id::text),
  constraint ngplan_daily_backups_source_revision_positive
    check (source_revision >= 1)
);

create index ngplan_daily_backups_workspace_date_idx
  on public.ngplan_daily_backups (workspace_id, business_date desc);

create index ngplan_daily_backups_saved_by_idx
  on public.ngplan_daily_backups (saved_by)
  where saved_by is not null;

create function private.ngplan_prepare_project_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.workspace_id is distinct from old.workspace_id
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by
    then
      raise exception 'ngplan project identity fields are immutable'
        using errcode = '22000';
    end if;

    new.updated_at := now();

    if new.current_document is distinct from old.current_document then
      new.revision := old.revision + 1;
      new.last_saved_at := now();
      new.last_saved_by := caller_id;
    else
      new.revision := old.revision;
      new.last_saved_at := old.last_saved_at;
      new.last_saved_by := old.last_saved_by;
    end if;

    if old.hidden_at is null and new.hidden_at is not null then
      new.hidden_at := now();
      new.hidden_by := caller_id;
    elsif old.hidden_at is not null and new.hidden_at is null then
      new.hidden_by := null;
    elsif old.hidden_at is not null then
      new.hidden_at := old.hidden_at;
      new.hidden_by := old.hidden_by;
    end if;
  else
    new.revision := 1;
    new.created_at := now();
    new.updated_at := now();
    new.last_saved_at := now();
    new.created_by := caller_id;
    new.last_saved_by := caller_id;

    if new.hidden_at is not null then
      new.hidden_at := now();
      new.hidden_by := caller_id;
    else
      new.hidden_by := null;
    end if;
  end if;

  return new;
end
$$;

create function private.ngplan_store_daily_backup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  save_business_date date :=
    (now() at time zone 'America/Sao_Paulo')::date;
begin
  if caller_id is null or not exists (
    select 1
    from public.workspace_members as wm
    where wm.workspace_id = new.workspace_id
      and wm.user_id = caller_id
  ) then
    raise exception 'ngplan workspace membership is required'
      using errcode = '42501';
  end if;

  insert into public.ngplan_daily_backups (
    project_id,
    workspace_id,
    business_date,
    document_schema_version,
    document,
    source_revision,
    saved_at,
    saved_by
  )
  values (
    new.id,
    new.workspace_id,
    save_business_date,
    new.document_schema_version,
    new.current_document,
    new.revision,
    new.last_saved_at,
    caller_id
  )
  on conflict (project_id, business_date)
  do update set
    document_schema_version = excluded.document_schema_version,
    document = excluded.document,
    source_revision = excluded.source_revision,
    saved_at = excluded.saved_at,
    saved_by = excluded.saved_by;

  return new;
end
$$;

revoke execute on function private.ngplan_prepare_project_write()
  from public, anon, authenticated, service_role;
revoke execute on function private.ngplan_store_daily_backup()
  from public, anon, authenticated, service_role;

create trigger ngplan_projects_prepare_write
before insert or update on public.ngplan_projects
for each row
execute function private.ngplan_prepare_project_write();

create trigger ngplan_projects_store_daily_backup
after insert or update of current_document on public.ngplan_projects
for each row
execute function private.ngplan_store_daily_backup();

alter table public.ngplan_projects enable row level security;
alter table public.ngplan_daily_backups enable row level security;

create policy ngplan_projects_select_workspace_member
  on public.ngplan_projects
  for select
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy ngplan_projects_insert_workspace_member
  on public.ngplan_projects
  for insert
  to authenticated
  with check ((select private.is_workspace_member(workspace_id)));

create policy ngplan_projects_update_workspace_member
  on public.ngplan_projects
  for update
  to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create policy ngplan_daily_backups_select_workspace_member
  on public.ngplan_daily_backups
  for select
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

revoke all on table public.ngplan_projects
  from public, anon, authenticated;
revoke all on table public.ngplan_daily_backups
  from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on table public.workspaces, public.workspace_members
  to authenticated;
grant select, insert, update on table public.ngplan_projects
  to authenticated;
grant select on table public.ngplan_daily_backups
  to authenticated;
