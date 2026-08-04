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
  AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER,
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
  stage: AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER[0],
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
    screen: 'AUTOMATIC_PLAN',
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
  extraPvp = 1,
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
    .getByRole('heading', { name: '자동 계산 결과' })
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
  it('opens automatic planning directly with the keyboard and focuses the plan title', async () => {
    const workspace = readyWorkspace(null);
    writeWorkspaceSession({
      version: WORKSPACE_SESSION_VERSION,
      draft: workspace.draft,
      manualPlanDraft: workspace.manualDraft,
      screen: 'SETUP',
      organizationScale: 1,
      automaticPlanCheckpoint: null,
    });
    const factory = new FakeAutomaticPlanWorkerFactory();
    const user = userEvent.setup();
    render(<App createAutomaticPlanWorker={factory.create} />);

    const automaticButton = screen.getByRole('button', {
      name: '다음 단계',
    });
    automaticButton.focus();
    expect(document.activeElement).toBe(automaticButton);
    await user.keyboard('{Enter}');

    expect(factory.workers).toHaveLength(1);
    const planTitle = await screen.findByRole('heading', { name: '202607A' });
    await waitFor(() => expect(document.activeElement).toBe(planTitle));
    expect(screen.getByRole('heading', { name: '계획표 만드는 중' })).toBeDefined();
    expect(screen.getByRole('heading', { name: '자동 계획표' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: '수동 계획표' })).toBeNull();
    expect(
      screen.getByText('입력을 확인하고 자동 플랜 만들기를 시작했습니다.'),
    ).toBeDefined();
  });

  it('P4-PREVIEW-001/002 and P4-APPLY-002 keeps a pinned verified plan through proof failure and a newer incumbent', async () => {
    const workspace = readyWorkspace('123');
    seedWorkspace(workspace);
    const factory = new FakeAutomaticPlanWorkerFactory();
    const user = userEvent.setup();
    render(<App createAutomaticPlanWorker={factory.create} />);

    expect(pvpInput().value).toBe('123');
    await user.click(screen.getByRole('button', { name: '자동으로 계산하기' }));
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
    const pinnedVerification = verifyAutomaticPlanCandidate(
      firstWorker.startMessage().request,
      pinnedRaw,
      {
        candidateId: pinnedCandidateId,
        sequence: 1,
        foundAtElapsedMs: 1_000,
      },
    );
    if (pinnedVerification.status === 'FAILURE') {
      throw new Error(pinnedVerification.error.message);
    }
    const pinnedRootGoal = pinnedVerification.candidate.display.rootCommissionGoal;

    act(() => emitIncumbent(firstWorker, pinnedRaw, 1, 1_000));
    await screen.findByText(
      '계획표가 준비되었습니다. 조금 더 정리하고 있습니다.',
    );
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

    expect(
      await screen.findByText(
        '계산이 멈췄습니다. 지금까지 찾은 결과를 사용할 수 있습니다.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(firstWorker.terminated).toBe(true);
    expect(screen.queryByText(/아래 계획표와 확인 안내는 아직 기존 입력 기준/)).toBeNull();
    await user.click(screen.getByRole('button', { name: '완성된 계획표 보기' }));
    expect(within(previewRegion()).getByText(`후보 ID ${pinnedCandidateId}`)).toBeDefined();
    expect(
      within(previewRegion()).getByText(formatPv(pinnedTotalNewPv)),
    ).toBeDefined();
    const rootGoalMetric = within(previewRegion())
      .getByText('맨 위 회원 수당')
      .closest('div');
    expect(rootGoalMetric).not.toBeNull();
    expect(
      within(rootGoalMetric!).getByText(
        `${pinnedRootGoal.actualCommissionDays} / ${pinnedRootGoal.targetCommissionDays}영업일`,
      ),
    ).toBeDefined();
    expect(
      within(previewRegion()).getByText('계획 영업일').nextElementSibling?.textContent,
    ).toBe(`${pinnedRootGoal.businessDayCount}일`);

    await user.click(screen.getByRole('button', { name: '다시 계산하기' }));
    expect(factory.workers).toHaveLength(2);
    const secondWorker = factory.workers[1]!;
    const betterRaw = buildConstructive(secondWorker.startMessage().request);
    const betterTotalNewPv = directAllocationTotal(betterRaw);
    act(() => emitIncumbent(secondWorker, betterRaw, 1, 2_000));

    expect(await screen.findByText('새 계산 결과가 준비되었습니다.')).toBeDefined();
    expect(
      screen.getByText(`현재 총 신규 PV ${formatPv(betterTotalNewPv)}`),
    ).toBeDefined();
    expect(within(previewRegion()).getByText(`후보 ID ${pinnedCandidateId}`)).toBeDefined();
    expect(
      within(previewRegion()).getByText(formatPv(pinnedTotalNewPv)),
    ).toBeDefined();

    await user.click(
      within(previewRegion()).getByRole('button', {
        name: '이 결과를 계획표에 넣기',
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: '이 결과를 계획표에 넣을까요?',
    });
    expect(within(dialog).getByText(/직접 입력한 값이 자동 계산 결과로 바뀝니다/)).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: '계획표에 넣기' }));

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
    expect(screen.queryByRole('heading', { name: '자동 계산 결과' })).toBeNull();
    expect(
      screen.getByText('자동 계산 결과를 계획표에 넣었습니다. 필요한 값은 직접 수정할 수 있습니다.'),
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

    await user.click(screen.getByRole('button', { name: '자동으로 계산하기' }));
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
    await screen.findByText(
      '계획표가 준비되었습니다. 조금 더 정리하고 있습니다.',
    );

    await user.click(screen.getByRole('button', { name: '지금 내용으로 계획표 보기' }));
    expect(worker.sent.at(-1)).toMatchObject({
      type: 'CANCEL',
      runId: worker.startMessage().runId,
    });
    expect(
      screen.getByText(
        '계산을 멈췄습니다. 지금까지 찾은 결과를 사용할 수 있습니다.',
      ),
    ).toBeDefined();
    act(() => emitIncumbent(worker, constructive, 2, 200));

    expect(screen.queryByText('새 계산 결과가 준비되었습니다.')).toBeNull();
    await user.click(screen.getByRole('button', { name: '완성된 계획표 보기' }));
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

    await screen.findByRole('button', { name: '완성된 계획표 보기' });
    expect(factory.workers).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '완성된 계획표 보기' }));
    expect(
      within(previewRegion()).getByText(`후보 ID ${candidate.candidateId}`),
    ).toBeDefined();
    expect(
      within(previewRegion()).getByText(
        formatPv(candidate.objective.totalNewPv),
      ),
    ).toBeDefined();
    expect(screen.getByRole('heading', { name: '자동 계산 결과' })).toBeDefined();
  });
});
