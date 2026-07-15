import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createManualPlanDraft,
  deriveManualPlanSchema,
  editManualPlanField,
  type ManualPlanDraft,
} from '../../application/manual-plan';
import {
  activateProjectSetupBundle,
  addRootMember,
  createProjectDraft,
  editMemberIdentity,
  editOpeningState,
  normalizeProjectSetup,
  type ProjectSetupBundle,
  type ProjectSetupDraft,
} from '../../application/project-setup';
import {
  AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
  createAutomaticPlanCandidateId,
  createAutomaticPlanCheckpointSnapshot,
  createAutomaticPlanRequest,
  type AutomaticPlanWorkerLike,
  type AutomaticPlanWorkerRequest,
  type AutomaticPlanWorkerResponse,
} from '../../application/automatic-plan';
import {
  buildConstructiveCandidate,
  verifyAutomaticPlanCandidate,
  type AutomaticPlanProofProgress,
  type AutomaticPlanRequest,
  type RawAutomaticPlanCandidate,
  type VerifiedAutomaticPlanCandidate,
} from '../../optimizer';
import { App } from '../App';
import {
  WORKSPACE_SESSION_VERSION,
  writeWorkspaceSession,
} from '../workspace-session-storage';

const PROOF: AutomaticPlanProofProgress = Object.freeze({
  stage: 'TOTAL_NEW_PV',
  provenScalarObjectiveCount: 0,
  provenVectorPrefix: null,
  primaryLowerBound: null,
});

class FakeAutomaticPlanWorker implements AutomaticPlanWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly sent: AutomaticPlanWorkerRequest[] = [];
  terminated = false;

  postMessage(message: AutomaticPlanWorkerRequest): void {
    this.sent.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: AutomaticPlanWorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }

  startMessage(): Extract<AutomaticPlanWorkerRequest, { type: 'START' }> {
    const message = this.sent.find(
      (candidate): candidate is Extract<AutomaticPlanWorkerRequest, { type: 'START' }> =>
        candidate.type === 'START',
    );
    if (message === undefined) throw new Error('worker START message missing');
    return message;
  }
}

class FakeAutomaticPlanWorkerFactory {
  readonly workers: FakeAutomaticPlanWorker[] = [];
  readonly create = (): FakeAutomaticPlanWorker => {
    const worker = new FakeAutomaticPlanWorker();
    this.workers.push(worker);
    return worker;
  };
}

interface ReadyWorkspace {
  readonly draft: ProjectSetupDraft;
  readonly bundle: ProjectSetupBundle;
  readonly manualDraft: ManualPlanDraft;
}

function readyWorkspace(modifiedPvp: string | null = '123'): ReadyWorkspace {
  let draft = createProjectDraft({
    year: 2026,
    month: 7,
    half: 'FIRST_HALF',
    generateId: (kind) => `automatic-flow-${kind.toLowerCase()}`,
  });
  const added = addRootMember(draft, 'root');
  if (added.status !== 'SUCCESS') throw new Error(added.error.message);
  draft = editMemberIdentity(added.draft, 'root', {
    memberId: '',
    name: 'Root',
    pvpTarget: '700',
  });
  draft = editOpeningState(draft, 'root', {
    openingStateConfirmed: true,
  });
  const normalized = normalizeProjectSetup(draft);
  if (normalized.status !== 'SUCCESS') {
    throw new Error(normalized.errors.map((issue) => issue.message).join(', '));
  }
  draft = activateProjectSetupBundle(draft, normalized.bundle);
  const schema = deriveManualPlanSchema(normalized.bundle);
  let manualDraft = createManualPlanDraft(normalized.bundle);
  if (modifiedPvp !== null) {
    const activeDate = schema.dates.find(
      (date) => date.settlementMode === 'SETTLE',
    )!.date;
    const edited = editManualPlanField(schema, manualDraft, {
      date: activeDate,
      memberKey: 'root',
      field: 'pvp',
      value: modifiedPvp,
    });
    if (edited.status !== 'SUCCESS') throw new Error(edited.message);
    manualDraft = edited.draft;
  }
  return { draft, bundle: normalized.bundle, manualDraft };
}

function seedWorkspace(
  workspace: ReadyWorkspace,
  checkpoint: Readonly<Record<string, unknown>> | null = null,
): void {
  writeWorkspaceSession({
    version: WORKSPACE_SESSION_VERSION,
    draft: workspace.draft,
    manualPlanDraft: workspace.manualDraft,
    screen: 'MANUAL_PLAN',
    organizationScale: 1,
    automaticPlanCheckpoint: checkpoint,
  });
}

function buildConstructive(request: AutomaticPlanRequest): RawAutomaticPlanCandidate {
  const built = buildConstructiveCandidate(request);
  if (built.status !== 'SUCCESS') throw new Error(built.error.message);
  return built.candidate;
}

function withExtraFirstPvp(
  candidate: RawAutomaticPlanCandidate,
  extraPvp = 100,
): RawAutomaticPlanCandidate {
  const firstNonzero = candidate.allocations.findIndex((cell) => cell.pvp > 0);
  if (firstNonzero < 0) throw new Error('constructive PVP allocation missing');
  return Object.freeze({
    problemFingerprint: candidate.problemFingerprint,
    allocations: Object.freeze(
      candidate.allocations.map((cell, index) =>
        index === firstNonzero
          ? Object.freeze({ ...cell, pvp: cell.pvp + extraPvp })
          : cell,
      ),
    ),
  });
}

function directAllocationTotal(candidate: RawAutomaticPlanCandidate): number {
  return candidate.allocations.reduce(
    (total, cell) =>
      total + cell.pvp + (cell.selfLeft ?? 0) + (cell.selfRight ?? 0),
    0,
  );
}

function allocationAt(
  candidate: RawAutomaticPlanCandidate,
  date: string,
  memberKey: string,
) {
  const allocation = candidate.allocations.find(
    (cell) => cell.date === date && cell.memberKey === memberKey,
  );
  if (allocation === undefined) {
    throw new Error(`allocation missing for ${date}/${memberKey}`);
  }
  return allocation;
}

function formatPv(value: number): string {
  return value.toLocaleString('ko-KR');
}

function emitIncumbent(
  worker: FakeAutomaticPlanWorker,
  candidate: RawAutomaticPlanCandidate,
  candidateSequence: number,
  elapsedMs: number,
): void {
  worker.emit({
    protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
    type: 'INCUMBENT',
    runId: worker.startMessage().runId,
    elapsedMs,
    candidateSequence,
    candidate,
  });
}

function previewRegion(): HTMLElement {
  const preview = screen
    .getByRole('heading', { name: '적용 전 확인' })
    .closest('section');
  if (preview === null) throw new Error('automatic plan preview missing');
  return preview;
}

function pvpInput(): HTMLInputElement {
  const input = screen.getByRole('textbox', {
    name: /1 \(수\).*Root.*PVP 계획 PV/,
  });
  if (!(input instanceof HTMLInputElement)) throw new Error('root PVP input missing');
  return input;
}

function sideInput(side: '좌' | '우'): HTMLInputElement {
  const input = screen.getByRole('textbox', {
    name: new RegExp(`1 \\(수\\).*Root.*${side} 계획 PV`),
  });
  if (!(input instanceof HTMLInputElement)) throw new Error(`root ${side} input missing`);
  return input;
}

function verifiedConstructive(
  bundle: ProjectSetupBundle,
): VerifiedAutomaticPlanCandidate {
  const request = createAutomaticPlanRequest(bundle);
  if (request.status !== 'SUCCESS') throw new Error(request.error.message);
  const raw = buildConstructive(request.request);
  const identity = Object.freeze({
    candidateId: createAutomaticPlanCandidateId(
      request.request.problemFingerprint,
      1,
      raw.allocations,
    ),
    sequence: 1,
    foundAtElapsedMs: 25,
  });
  const verified = verifyAutomaticPlanCandidate(request.request, raw, identity);
  if (verified.status !== 'SUCCESS') throw new Error(verified.error.message);
  return verified.candidate;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('App automatic-plan integration', () => {
  it('P4-PREVIEW-001/002 and P4-APPLY-002 keeps a pinned verified plan through proof failure and a newer incumbent', async () => {
    const workspace = readyWorkspace('123');
    seedWorkspace(workspace);
    const factory = new FakeAutomaticPlanWorkerFactory();
    const user = userEvent.setup();
    render(<App createAutomaticPlanWorker={factory.create} />);

    expect(pvpInput().value).toBe('123');
    await user.click(screen.getByRole('button', { name: '자동 계획 만들기' }));
    expect(factory.workers).toHaveLength(1);
    const firstWorker = factory.workers[0]!;
    const constructive = buildConstructive(firstWorker.startMessage().request);
    const pinnedRaw = withExtraFirstPvp(constructive);
    const pinnedFirstDay = allocationAt(pinnedRaw, '2026-07-01', 'root');
    const pinnedTotalNewPv = directAllocationTotal(pinnedRaw);
    const pinnedCandidateId = createAutomaticPlanCandidateId(
      firstWorker.startMessage().request.problemFingerprint,
      1,
      pinnedRaw.allocations,
    );

    act(() => emitIncumbent(firstWorker, pinnedRaw, 1, 1_000));
    await screen.findByText('현재까지 찾은 가장 좋은 검증 계획');
    act(() => {
      firstWorker.emit({
        protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
        type: 'ERROR',
        runId: firstWorker.startMessage().runId,
        elapsedMs: 1_500,
        error: {
          code: 'AUTOMATIC_PLAN_PROOF_INCOMPLETE',
          message: '정확한 최소값 증명을 끝내지 못했습니다.',
        },
        proof: PROOF,
        messageCode: 'EXACT_PROOF_BACKEND_UNAVAILABLE',
      });
    });

    expect(await screen.findByText('계산은 멈췄지만 검증 계획은 사용 가능')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('정확한 최소값 증명');
    expect(firstWorker.terminated).toBe(true);
    expect(screen.getByText(/아래 계획표와 확인 안내는 아직 기존 입력 기준/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: '검증 계획 확인·적용' }));
    expect(within(previewRegion()).getByText(`후보 ID ${pinnedCandidateId}`)).toBeDefined();
    expect(
      within(previewRegion()).getByText(formatPv(pinnedTotalNewPv)),
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: '다시 계산' }));
    expect(factory.workers).toHaveLength(2);
    const secondWorker = factory.workers[1]!;
    const betterRaw = buildConstructive(secondWorker.startMessage().request);
    const betterTotalNewPv = directAllocationTotal(betterRaw);
    act(() => emitIncumbent(secondWorker, betterRaw, 1, 2_000));

    expect(await screen.findByText(/더 나은 새 계획을 찾았습니다/)).toBeDefined();
    expect(
      screen.getByText(`현재 총 신규 PV ${formatPv(betterTotalNewPv)}`),
    ).toBeDefined();
    expect(within(previewRegion()).getByText(`후보 ID ${pinnedCandidateId}`)).toBeDefined();
    expect(
      within(previewRegion()).getByText(formatPv(pinnedTotalNewPv)),
    ).toBeDefined();

    await user.click(
      within(previewRegion()).getByRole('button', {
        name: '이 계획을 계획표에 적용',
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: '입력한 계획을 자동 계획으로 바꿀까요?',
    });
    expect(within(dialog).getByText(/현재 수동 입력은 자동 계획 값으로 교체/)).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: '적용' }));

    await waitFor(() =>
      expect(pvpInput().value).toBe(String(pinnedFirstDay.pvp)),
    );
    expect(sideInput('좌').value).toBe(
      String(pinnedFirstDay.selfLeft ?? 0),
    );
    expect(sideInput('우').value).toBe(
      String(pinnedFirstDay.selfRight ?? 0),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('heading', { name: '적용 전 확인' })).toBeNull();
    expect(
      screen.getByText('선택한 자동 계획을 계획표에 적용했습니다. 이제 각 값을 직접 수정할 수 있습니다.'),
    ).toBeDefined();
    expect(screen.queryByText(/확인이 필요한 안내/)).toBeNull();
    expect(secondWorker.sent.at(-1)).toMatchObject({ type: 'CANCEL' });
    expect(secondWorker.terminated).toBe(true);
  });

  it('P4-WORKER-004 preserves the incumbent and ignores a late candidate after cancel', async () => {
    const workspace = readyWorkspace(null);
    seedWorkspace(workspace);
    const factory = new FakeAutomaticPlanWorkerFactory();
    const user = userEvent.setup();
    render(<App createAutomaticPlanWorker={factory.create} />);

    await user.click(screen.getByRole('button', { name: '자동 계획 만들기' }));
    const worker = factory.workers[0]!;
    const constructive = buildConstructive(worker.startMessage().request);
    const incumbent = withExtraFirstPvp(constructive);
    const incumbentTotalNewPv = directAllocationTotal(incumbent);
    const incumbentId = createAutomaticPlanCandidateId(
      worker.startMessage().request.problemFingerprint,
      1,
      incumbent.allocations,
    );
    act(() => emitIncumbent(worker, incumbent, 1, 100));
    await screen.findByText('현재까지 찾은 가장 좋은 검증 계획');

    await user.click(screen.getByRole('button', { name: '계산 중지' }));
    expect(worker.sent.at(-1)).toMatchObject({
      type: 'CANCEL',
      runId: worker.startMessage().runId,
    });
    expect(screen.getByText('중지 전까지 찾은 검증 계획')).toBeDefined();
    act(() => emitIncumbent(worker, constructive, 2, 200));

    expect(screen.queryByText(/더 나은 새 계획을 찾았습니다/)).toBeNull();
    await user.click(screen.getByRole('button', { name: '검증 계획 확인·적용' }));
    expect(within(previewRegion()).getByText(`후보 ID ${incumbentId}`)).toBeDefined();
    expect(
      within(previewRegion()).getByText(formatPv(incumbentTotalNewPv)),
    ).toBeDefined();
  });

  it('P4-CHECKPOINT-004 restores and re-verifies the v2 workspace incumbent without starting a worker', async () => {
    const workspace = readyWorkspace(null);
    const candidate = verifiedConstructive(workspace.bundle);
    const checkpoint = createAutomaticPlanCheckpointSnapshot(
      candidate,
      new Date('2026-07-13T00:00:00.000Z'),
    );
    seedWorkspace(workspace, checkpoint);
    const factory = new FakeAutomaticPlanWorkerFactory();
    const user = userEvent.setup();
    render(<App createAutomaticPlanWorker={factory.create} />);

    await screen.findByRole('button', { name: '검증 계획 확인·적용' });
    expect(factory.workers).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '검증 계획 확인·적용' }));
    expect(
      within(previewRegion()).getByText(`후보 ID ${candidate.candidateId}`),
    ).toBeDefined();
    expect(
      within(previewRegion()).getByText(
        formatPv(candidate.objective.totalNewPv),
      ),
    ).toBeDefined();
    expect(screen.getByText(/복원된 검증 계획 · 새 계산 전/)).toBeDefined();
  });
});
