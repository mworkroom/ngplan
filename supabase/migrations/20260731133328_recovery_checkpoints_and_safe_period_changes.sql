-- ngplan recovery checkpoints and destructive-change guards.
--
-- Retention is deliberately bounded:
--   * ROLLING: one immutable checkpoint per 15-minute bucket in a 7-day ring
--              (672 rows at most per project)
--   * SAFETY:  the newest 50 semantic-action checkpoints per project
--   * DAILY:   the existing one-per-Brazil-business-date archive remains intact

create table public.ngplan_recovery_backups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  workspace_id uuid not null,
  kind text not null,
  reason text not null,
  rolling_slot smallint,
  bucket_start timestamptz,
  document_schema_version integer not null,
  document jsonb not null,
  source_revision bigint not null,
  captured_at timestamptz not null default now(),
  captured_by uuid references auth.users(id) on delete set null,
  constraint ngplan_recovery_backups_project_workspace_fkey
    foreign key (workspace_id, project_id)
    references public.ngplan_projects(workspace_id, id)
    on delete cascade,
  constraint ngplan_recovery_backups_kind_value
    check (kind in ('ROLLING', 'SAFETY')),
  constraint ngplan_recovery_backups_reason_value
    check (
      reason in (
        'AUTO_15_MIN',
        'BEFORE_PERIOD_CHANGE',
        'BEFORE_AUTOMATIC_PLAN_APPLY',
        'BEFORE_MEMBER_EXCLUSION'
      )
    ),
  constraint ngplan_recovery_backups_retention_shape
    check (
      (
        kind = 'ROLLING'
        and reason = 'AUTO_15_MIN'
        and rolling_slot between 0 and 671
        and bucket_start is not null
      )
      or
      (
        kind = 'SAFETY'
        and reason <> 'AUTO_15_MIN'
        and rolling_slot is null
        and bucket_start is null
      )
    ),
  constraint ngplan_recovery_backups_document_schema_version
    check (document_schema_version = 1),
  constraint ngplan_recovery_backups_document_object
    check (jsonb_typeof(document) = 'object'),
  constraint ngplan_recovery_backups_document_version_matches
    check (document @> '{"version": 1}'::jsonb),
  constraint ngplan_recovery_backups_document_project_matches
    check (document #>> '{draft,projectId}' = project_id::text),
  constraint ngplan_recovery_backups_source_revision_positive
    check (source_revision >= 1)
);

create unique index ngplan_recovery_backups_rolling_slot_unique
  on public.ngplan_recovery_backups (project_id, rolling_slot)
  where kind = 'ROLLING';

create index ngplan_recovery_backups_workspace_project_captured_idx
  on public.ngplan_recovery_backups (
    workspace_id,
    project_id,
    captured_at desc
  );

create index ngplan_recovery_backups_captured_by_idx
  on public.ngplan_recovery_backups (captured_by)
  where captured_by is not null;

create function private.ngplan_trim_safety_backups(target_project_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.ngplan_recovery_backups as backup
  where backup.id in (
    select candidate.id
    from public.ngplan_recovery_backups as candidate
    where candidate.project_id = target_project_id
      and candidate.kind = 'SAFETY'
    order by candidate.captured_at desc, candidate.id desc
    offset 50
  )
$$;

create function private.ngplan_store_recovery_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  checkpoint_time timestamptz := now();
  checkpoint_epoch bigint;
  checkpoint_slot smallint;
  checkpoint_document jsonb;
  checkpoint_revision bigint;
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

  if tg_op = 'UPDATE'
    and (
      new.period_year is distinct from old.period_year
      or new.period_month is distinct from old.period_month
      or new.period_half is distinct from old.period_half
    )
  then
    insert into public.ngplan_recovery_backups (
      project_id,
      workspace_id,
      kind,
      reason,
      document_schema_version,
      document,
      source_revision,
      captured_at,
      captured_by
    )
    values (
      old.id,
      old.workspace_id,
      'SAFETY',
      'BEFORE_PERIOD_CHANGE',
      old.document_schema_version,
      old.current_document,
      old.revision,
      checkpoint_time,
      caller_id
    );
    perform private.ngplan_trim_safety_backups(old.id);
  end if;

  if tg_op = 'INSERT' or new.current_document is distinct from old.current_document then
    checkpoint_epoch := floor(extract(epoch from checkpoint_time) / 900)::bigint * 900;
    checkpoint_slot := mod(checkpoint_epoch / 900, 672)::smallint;
    checkpoint_document := case
      when tg_op = 'INSERT' then new.current_document
      else old.current_document
    end;
    checkpoint_revision := case
      when tg_op = 'INSERT' then new.revision
      else old.revision
    end;

    insert into public.ngplan_recovery_backups (
      project_id,
      workspace_id,
      kind,
      reason,
      rolling_slot,
      bucket_start,
      document_schema_version,
      document,
      source_revision,
      captured_at,
      captured_by
    )
    values (
      new.id,
      new.workspace_id,
      'ROLLING',
      'AUTO_15_MIN',
      checkpoint_slot,
      to_timestamp(checkpoint_epoch),
      new.document_schema_version,
      checkpoint_document,
      checkpoint_revision,
      checkpoint_time,
      caller_id
    )
    on conflict (project_id, rolling_slot) where kind = 'ROLLING'
    do update set
      workspace_id = excluded.workspace_id,
      reason = excluded.reason,
      bucket_start = excluded.bucket_start,
      document_schema_version = excluded.document_schema_version,
      document = excluded.document,
      source_revision = excluded.source_revision,
      captured_at = excluded.captured_at,
      captured_by = excluded.captured_by
    where public.ngplan_recovery_backups.bucket_start < excluded.bucket_start;
  end if;

  return new;
end
$$;

create function public.ngplan_create_safety_backup(
  target_workspace_id uuid,
  target_project_id uuid,
  target_reason text,
  expected_source_revision bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  project_row public.ngplan_projects%rowtype;
  backup_id uuid;
begin
  if expected_source_revision is null or expected_source_revision < 1 then
    raise exception 'invalid expected ngplan source revision'
      using errcode = '22023';
  end if;

  if target_reason not in (
    'BEFORE_PERIOD_CHANGE',
    'BEFORE_AUTOMATIC_PLAN_APPLY',
    'BEFORE_MEMBER_EXCLUSION'
  ) then
    raise exception 'unsupported ngplan safety backup reason'
      using errcode = '22023';
  end if;

  if caller_id is null or not exists (
    select 1
    from public.workspace_members as wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = caller_id
  ) then
    raise exception 'ngplan workspace membership is required'
      using errcode = '42501';
  end if;

  select project.*
  into project_row
  from public.ngplan_projects as project
  where project.workspace_id = target_workspace_id
    and project.id = target_project_id
  for update;

  if not found then
    raise exception 'ngplan project not found'
      using errcode = 'P0002';
  end if;

  if project_row.revision <> expected_source_revision then
    raise exception 'ngplan project changed before safety backup'
      using errcode = '40001';
  end if;

  insert into public.ngplan_recovery_backups (
    project_id,
    workspace_id,
    kind,
    reason,
    document_schema_version,
    document,
    source_revision,
    captured_at,
    captured_by
  )
  values (
    project_row.id,
    project_row.workspace_id,
    'SAFETY',
    target_reason,
    project_row.document_schema_version,
    project_row.current_document,
    project_row.revision,
    now(),
    caller_id
  )
  returning id into backup_id;

  perform private.ngplan_trim_safety_backups(project_row.id);
  return backup_id;
end
$$;

revoke execute on function private.ngplan_trim_safety_backups(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.ngplan_store_recovery_checkpoint()
  from public, anon, authenticated, service_role;
revoke execute on function public.ngplan_create_safety_backup(uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.ngplan_create_safety_backup(uuid, uuid, text, bigint)
  to authenticated;

create trigger ngplan_projects_store_recovery_checkpoint
after insert or update on public.ngplan_projects
for each row
execute function private.ngplan_store_recovery_checkpoint();

alter table public.ngplan_recovery_backups enable row level security;

create policy ngplan_recovery_backups_select_workspace_member
  on public.ngplan_recovery_backups
  for select
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

revoke all on table public.ngplan_recovery_backups
  from public, anon, authenticated;
grant select on table public.ngplan_recovery_backups
  to authenticated;
