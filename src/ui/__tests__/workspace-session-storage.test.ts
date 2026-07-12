import { afterEach, describe, expect, it } from 'vitest';
import { createProjectDraft } from '../../application/project-setup';
import {
  readWorkspaceSession,
  WORKSPACE_SESSION_STORAGE_KEY,
  writeWorkspaceSession,
} from '../workspace-session-storage';

afterEach(() => {
  window.sessionStorage.clear();
});

describe('workspace session storage', () => {
  it('round-trips the current tab draft and zoom level', () => {
    let sequence = 0;
    const draft = createProjectDraft({
      year: 2026,
      month: 7,
      half: 'FIRST_HALF',
      generateId: (kind) => `${kind}-${++sequence}`,
    });
    writeWorkspaceSession({
      version: 1,
      draft,
      manualPlanDraft: null,
      screen: 'SETUP',
      organizationScale: 0.8,
    });

    expect(readWorkspaceSession()).toEqual({
      version: 1,
      draft,
      manualPlanDraft: null,
      screen: 'SETUP',
      organizationScale: 0.8,
    });
  });

  it('ignores malformed or unknown session data', () => {
    window.sessionStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, '{broken');
    expect(readWorkspaceSession()).toBeNull();

    window.sessionStorage.setItem(
      WORKSPACE_SESSION_STORAGE_KEY,
      JSON.stringify({ version: 99, draft: {} }),
    );
    expect(readWorkspaceSession()).toBeNull();
  });
});
