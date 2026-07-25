import { describe, expect, it } from 'vitest';
import {
  createProjectDraft,
  type IdGenerator,
} from '../../application/project-setup';
import {
  cloudDocumentFromWorkspaceSession,
  normalizeCloudPlanDocument,
  workspaceSessionFromCloudDocument,
} from '../cloud-plan-document';
import {
  WORKSPACE_SESSION_VERSION,
  type WorkspaceSessionSnapshot,
} from '../../ui/workspace-session-storage';

function createSnapshot(): WorkspaceSessionSnapshot {
  const ids = {
    PROJECT: '11111111-1111-4111-8111-111111111111',
    ORGANIZATION_SNAPSHOT: '22222222-2222-4222-8222-222222222222',
    MEMBER: '33333333-3333-4333-8333-333333333333',
  } as const;
  const generateId: IdGenerator = (kind) => ids[kind];
  return {
    version: WORKSPACE_SESSION_VERSION,
    draft: createProjectDraft({
      year: 2026,
      month: 7,
      half: 'SECOND_HALF',
      generateId,
    }),
    manualPlanDraft: null,
    screen: 'SETUP',
    organizationScale: 0.8,
    automaticPlanCheckpoint: { candidate: 'local-only' },
  };
}

describe('CloudPlanDocumentV1', () => {
  it('stores only the shared planning source and leaves UI/checkpoint state local', () => {
    const snapshot = createSnapshot();
    const document = cloudDocumentFromWorkspaceSession(snapshot);

    expect(document).toEqual({
      version: 1,
      draft: snapshot.draft,
      manualPlanDraft: null,
    });
    expect(document).not.toHaveProperty('screen');
    expect(document).not.toHaveProperty('organizationScale');
    expect(document).not.toHaveProperty('automaticPlanCheckpoint');
    expect(normalizeCloudPlanDocument(document)).toEqual(document);
  });

  it('rejects malformed versions and the former Seoul-time document shape', () => {
    const document = cloudDocumentFromWorkspaceSession(createSnapshot());

    expect(normalizeCloudPlanDocument({ ...document, version: 2 })).toBeNull();
    expect(
      normalizeCloudPlanDocument({
        ...document,
        draft: { ...document.draft, timezone: 'Asia/Seoul' },
      }),
    ).toBeNull();
    expect(normalizeCloudPlanDocument({ version: 1, draft: null })).toBeNull();
  });

  it('restores matching local-only view state without putting it in the cloud document', () => {
    const snapshot = createSnapshot();
    const document = cloudDocumentFromWorkspaceSession(snapshot);
    const restored = workspaceSessionFromCloudDocument(document, snapshot);

    expect(restored.organizationScale).toBe(0.8);
    expect(restored.automaticPlanCheckpoint).toEqual({
      candidate: 'local-only',
    });
    expect(restored.draft.timezone).toBe('America/Sao_Paulo');
  });
});
