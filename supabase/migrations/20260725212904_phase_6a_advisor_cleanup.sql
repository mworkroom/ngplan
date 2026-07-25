-- Follow-up from the post-apply Supabase advisors.

create index if not exists ngplan_daily_backups_workspace_project_idx
  on public.ngplan_daily_backups (workspace_id, project_id);

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspaces'
      and cmd = 'SELECT'
      and policyname <> 'ngplan_workspaces_select_member'
  ) then
    drop policy if exists ngplan_workspaces_select_member
      on public.workspaces;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_members'
      and cmd = 'SELECT'
      and policyname <> 'ngplan_workspace_members_select_self'
  ) then
    drop policy if exists ngplan_workspace_members_select_self
      on public.workspace_members;
  end if;
end
$$;
