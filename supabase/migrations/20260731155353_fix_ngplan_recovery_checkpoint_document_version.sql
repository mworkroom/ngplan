-- A rolling checkpoint stores the document from before an update, so its
-- schema version must also come from the previous row.
create or replace function private.ngplan_store_recovery_checkpoint()
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
  checkpoint_schema_version integer;
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
    checkpoint_schema_version := case
      when tg_op = 'INSERT' then new.document_schema_version
      else old.document_schema_version
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
      checkpoint_schema_version,
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
