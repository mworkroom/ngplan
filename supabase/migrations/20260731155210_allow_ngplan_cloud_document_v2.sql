-- Keep existing version 1 documents readable while accepting the version 2
-- documents produced by the current application.
alter table public.ngplan_projects
  drop constraint if exists ngplan_projects_document_schema_version,
  drop constraint if exists ngplan_projects_document_version_matches;

alter table public.ngplan_projects
  add constraint ngplan_projects_document_schema_version
    check (document_schema_version in (1, 2)),
  add constraint ngplan_projects_document_version_matches
    check (
      (document_schema_version = 1 and current_document @> '{"version": 1}'::jsonb)
      or
      (document_schema_version = 2 and current_document @> '{"version": 2}'::jsonb)
    );

alter table public.ngplan_daily_backups
  drop constraint if exists ngplan_daily_backups_document_schema_version,
  drop constraint if exists ngplan_daily_backups_document_version_matches;

alter table public.ngplan_daily_backups
  add constraint ngplan_daily_backups_document_schema_version
    check (document_schema_version in (1, 2)),
  add constraint ngplan_daily_backups_document_version_matches
    check (
      (document_schema_version = 1 and document @> '{"version": 1}'::jsonb)
      or
      (document_schema_version = 2 and document @> '{"version": 2}'::jsonb)
    );

alter table public.ngplan_recovery_backups
  drop constraint if exists ngplan_recovery_backups_document_schema_version,
  drop constraint if exists ngplan_recovery_backups_document_version_matches;

alter table public.ngplan_recovery_backups
  add constraint ngplan_recovery_backups_document_schema_version
    check (document_schema_version in (1, 2)),
  add constraint ngplan_recovery_backups_document_version_matches
    check (
      (document_schema_version = 1 and document @> '{"version": 1}'::jsonb)
      or
      (document_schema_version = 2 and document @> '{"version": 2}'::jsonb)
    );
