import type { User } from '@supabase/supabase-js';
import type { WorkspaceSessionSnapshot } from '../ui/workspace-session-storage';
import type { CloudPlanDocumentV1 } from './cloud-plan-document';

export interface CloudWorkspace {
  readonly id: string;
  readonly name: 'ngplan';
}

export interface CloudProjectSummary {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly periodYear: number | null;
  readonly periodMonth: number | null;
  readonly periodHalf: 'FIRST_HALF' | 'SECOND_HALF';
  readonly revision: number;
  readonly hiddenAt: string | null;
  readonly updatedAt: string;
  readonly lastSavedAt: string;
  readonly localOnly: boolean;
  readonly pendingRemote: boolean;
}

export interface CloudProjectRecord extends CloudProjectSummary {
  readonly document: CloudPlanDocumentV1;
}

export interface SaveProjectResult {
  readonly revision: number;
  readonly updatedAt: string;
  readonly lastSavedAt: string;
}

export interface PlanRepository {
  findWorkspace(): Promise<CloudWorkspace>;
  listProjects(
    workspaceId: string,
    visibility: 'VISIBLE' | 'HIDDEN',
  ): Promise<readonly CloudProjectSummary[]>;
  loadProject(
    workspaceId: string,
    projectId: string,
  ): Promise<CloudProjectRecord>;
  saveProject(
    workspaceId: string,
    document: CloudPlanDocumentV1,
  ): Promise<SaveProjectResult>;
  setProjectHidden(
    workspaceId: string,
    projectId: string,
    hidden: boolean,
  ): Promise<void>;
}

export interface CachedPlanRecord {
  readonly cacheKey: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly verifiedUserIds: readonly string[];
  readonly document: CloudPlanDocumentV1;
  readonly workspaceSession: WorkspaceSessionSnapshot;
  readonly pendingRemote: boolean;
  readonly remoteRevision: number | null;
  readonly remoteUpdatedAt: string | null;
  readonly remoteLastSavedAt: string | null;
  readonly hiddenAt: string | null;
  readonly localUpdatedAt: string;
  readonly lastAttemptAt: string | null;
  readonly lastError: string | null;
}

export interface PlanCache {
  findWorkspaceId(verifiedUserId: string): Promise<string | null>;
  authorizeUser(workspaceId: string, userId: string): Promise<void>;
  get(
    workspaceId: string,
    projectId: string,
    verifiedUserId: string,
  ): Promise<CachedPlanRecord | null>;
  list(
    workspaceId: string,
    verifiedUserId: string,
  ): Promise<readonly CachedPlanRecord[]>;
  put(record: CachedPlanRecord): Promise<void>;
}

export type CloudSaveState = 'SAVING' | 'SAVED' | 'OFFLINE' | 'FAILED';

export interface CloudSaveStatus {
  readonly state: CloudSaveState;
  readonly lastSavedAt: string | null;
  readonly message: string;
}

export interface AuthenticatedCloudUser {
  readonly user: User;
  readonly email: string;
}
