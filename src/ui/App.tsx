import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deriveManualPlanSchema,
  isManualPlanDraftModified,
  mapProjectSetupIssueToManualPlanIssue,
  reconcileManualPlanDraft,
  type ManualPlanDraft,
} from '../application/manual-plan';
import {
  applyVerifiedAutomaticPlanCandidate,
  createAutomaticPlanCheckpointSnapshot,
  createAutomaticPlanRequest,
  restoreAutomaticPlanCheckpointSnapshot,
  AutomaticPlanRunController,
  type AutomaticPlanWorkerFactory,
} from '../application/automatic-plan';
import {
  activateProjectSetupBundle,
  assignMemberDirectoryIdentity,
  addMemberToSlot,
  addRootMember,
  attachSubtree,
  createProjectDraft,
  deriveTopology,
  detachSubtree,
  draftHasMemberData,
  editMemberIdentity,
  editOpeningState,
  editProjectPeriod,
  editProjectTitle,
  excludeMember,
  getDescendantKeys,
  memberCardId,
  memberFieldId,
  moveSubtree,
  normalizeProjectSetup,
  queueEntryId,
  restoreDerivedProjectTitle,
  selectMember,
  setRootMember,
  topologySlotKey,
  validateProjectSetupDraft,
  validationIssueTargetId,
  type ChildSlotState,
  type ExclusionStrategy,
  type IdGenerator,
  type IdKind,
  type MemberDraft,
  type ProjectSetupBundle,
  type ProjectSetupDraft,
  type ProjectSetupIssue,
  type ProjectSetupValidation,
  type TopologyCommandOutcome,
} from '../application/project-setup';
import type {
  MemberDirectory,
  MemberDirectoryEntry,
} from '../cloud/member-directory';
import {
  AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER,
  AUTOMATIC_PLAN_PRODUCT_TIME_LIMIT_MS,
  type AutomaticPlanProofProgress,
  type AutomaticPlanRunState,
  type VerifiedAutomaticPlanCandidate,
} from '../optimizer';
import { ExcludeMemberDialog } from './components/ExcludeMemberDialog';
import { MemberForm } from './components/MemberForm';
import { OpeningStateForm } from './components/OpeningStateForm';
import { OrganizationTree } from './components/OrganizationTree';
import { ProjectPeriodForm } from './components/ProjectPeriodForm';
import { ReassignmentQueue } from './components/ReassignmentQueue';
import { ManualPlanWorkspace } from './components/manual-plan/ManualPlanWorkspace';
import { ApplyAutomaticPlanDialog } from './components/automatic-plan/ApplyAutomaticPlanDialog';
import { AutomaticPlanPanel } from './components/automatic-plan/AutomaticPlanPanel';
import type { AutomaticPlanPreviewMetrics } from './components/automatic-plan/AutomaticPlanPreview';
import type { AutomaticPlanUiStatus } from './components/automatic-plan/AutomaticPlanProgress';
import {
  clearWorkspaceSession,
  readWorkspaceSession,
  WORKSPACE_SESSION_VERSION,
  writeWorkspaceSession,
  type WorkspaceSessionSnapshot,
} from './workspace-session-storage';

type Side = ChildSlotState['side'];
type AppScreen = 'SETUP' | 'MANUAL_PLAN';

const EMPTY_AUTOMATIC_PLAN_PROOF: AutomaticPlanProofProgress = Object.freeze({
  stage: AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER[0],
  provenScalarObjectiveCount: 0,
  provenVectorPrefix: null,
  primaryLowerBound: null,
});

const defaultAutomaticPlanWorkerFactory: AutomaticPlanWorkerFactory = () =>
  new Worker(new URL('../workers/automatic-plan.worker.ts', import.meta.url), {
    type: 'module',
    name: 'ngplan-automatic-plan',
  });

function automaticPlanPhaseLabel(state: AutomaticPlanRunState | null): string {
  if (state === null) return '계산 전';
  switch (state.messageCode) {
    case 'BUILDING_VERIFIED_INCUMBENT':
    case 'FINDING_USABLE_PLAN':
      return '사용 가능한 계획 찾는 중';
    case 'VERIFIED_PLAN_FOUND':
      return '더 적은 값을 찾는 중';
    case 'EXACT_PROOF_BACKEND_UNAVAILABLE':
      return '최소값 확인만 중단됨';
    case 'CANCELLED_BY_OPERATOR':
      return '계산을 중지함';
    default:
      return state.status === 'OPTIMAL'
        ? '최소값 확인 완료'
        : state.status === 'RUNNING'
          ? '최소값인지 확인 중'
          : '계산 종료';
  }
}

function automaticPlanPreviewMetrics(
  candidate: VerifiedAutomaticPlanCandidate,
  runState: AutomaticPlanRunState | null,
): AutomaticPlanPreviewMetrics {
  const memberByKey = new Map(
    candidate.calculation.inputSnapshot.organization.members.map(
      (member) => [member.memberKey, member] as const,
    ),
  );
  const optimalityProven =
    runState?.status === 'OPTIMAL' &&
    runState.bestCandidate.candidateId === candidate.candidateId;
  const runStatusLabel = optimalityProven
    ? '최소값 확인 완료'
    : runState === null
      ? '복원된 검증 계획 · 새 계산 전'
      : runState.status === 'RUNNING'
        ? '최적성 확인 중'
        : runState.status === 'TIME_LIMIT'
          ? '시간 종료 · 최소값 미증명'
          : runState.status === 'CANCELLED'
            ? '계산 중지 · 최소값 미증명'
            : runState.status === 'FAILED'
              ? '검증 계획 · 최소값 확인만 중단'
               : '최소값 미증명';
  return Object.freeze({
    candidateId: candidate.candidateId,
    foundAtElapsedMs: candidate.foundAtElapsedMs,
    totalNewPv: candidate.objective.totalNewPv,
    confirmedPayoutWon: candidate.objective.confirmedPayoutWon,
    optimalityProven,
    runStatusLabel,
    discardedExcessPv: candidate.objective.discardedExcessPv,
    rootCommissionGoal: Object.freeze({
      ...candidate.display.rootCommissionGoal,
      rootMemberLabel:
        memberByKey.get(candidate.display.rootCommissionGoal.rootMemberKey)?.name ??
        candidate.display.rootCommissionGoal.rootMemberKey,
    }),
    highTargetMemberEquivalentUnitCounts: Object.freeze(
      candidate.display.highTargetMemberEquivalentUnitCounts.map((item) =>
        Object.freeze({
          memberKey: item.memberKey,
          memberLabel: memberByKey.get(item.memberKey)?.name ?? item.memberKey,
          pvpTarget: item.pvpTarget,
          commissionDays:
            candidate.calculation.finalAssessmentByMember[item.memberKey]
              ?.commissionDays ?? 0,
          equivalentUnits: item.commissionEquivalentUnits,
          attainableEquivalentUnits: item.attainableEquivalentUnits,
          equivalentUnitShortfall: item.equivalentUnitShortfall,
        }),
      ),
    ),
    target700MembersAtLeastEightEquivalentUnits:
      candidate.display.target700MembersAtLeastEightEquivalentUnits,
    target700TotalCommissionEquivalentUnits:
      candidate.display.target700TotalCommissionEquivalentUnits,
    target700MemberEquivalentUnitCounts: Object.freeze(
      candidate.display.target700MemberEquivalentUnitCounts.map((item) =>
        Object.freeze({
          memberKey: item.memberKey,
          memberLabel: memberByKey.get(item.memberKey)?.name ?? item.memberKey,
          commissionDays:
            candidate.calculation.finalAssessmentByMember[item.memberKey]
              ?.commissionDays ?? 0,
          equivalentUnits: item.commissionEquivalentUnits,
          attainableEquivalentUnits: item.attainableEquivalentUnits,
          equivalentUnitShortfall: item.equivalentUnitShortfall,
        }),
      ),
    ),
    futureCumulativePvpInvestmentPv:
      candidate.objective.futureCumulativePvpInvestmentPv,
    nonHundredCellCount: candidate.objective.nonHundredCellCount,
    maxDirectPvp: candidate.objective.maxDirectPvp,
    terminalCarryTotal: candidate.display.terminalCarrySummary.totalCarryPv,
  });
}

let sessionSequence = 0;

export function createSessionIdGenerator(
  requestedSessionName?: string,
): IdGenerator {
  const sessionName = (
    requestedSessionName ?? `session-${++sessionSequence}`
  ).replace(/[^a-zA-Z0-9_-]/g, '_');
  const counters: Record<IdKind, number> = {
    PROJECT: 0,
    ORGANIZATION_SNAPSHOT: 0,
    MEMBER: 0,
  };
  return (kind) => {
    counters[kind] += 1;
    return `${kind.toLowerCase().replaceAll('_', '-')}-${sessionName}-${counters[kind]}`;
  };
}

export interface AppProps {
  readonly generateId?: IdGenerator;
  readonly initialDate?: Date;
  readonly memberDirectory?: MemberDirectory | null;
  readonly createAutomaticPlanWorker?: AutomaticPlanWorkerFactory;
  readonly initialWorkspaceSession?: WorkspaceSessionSnapshot | null;
  readonly onWorkspaceSessionChange?: (
    snapshot: WorkspaceSessionSnapshot,
  ) => void;
  readonly onCreateNewPlan?: () => void;
}

interface SlotAction {
  readonly parentMemberKey: string;
  readonly side: Side;
}

function createInitialDraft(generateId: IdGenerator, date: Date): ProjectSetupDraft {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = readPart('year');
  const month = readPart('month');
  const day = readPart('day');
  return createProjectDraft({
    year,
    month,
    half: day <= 15 ? 'FIRST_HALF' : 'SECOND_HALF',
    generateId,
  });
}

export function App({
  generateId: injectedGenerateId,
  initialDate,
  memberDirectory = null,
  createAutomaticPlanWorker = defaultAutomaticPlanWorkerFactory,
  initialWorkspaceSession,
  onWorkspaceSessionChange,
  onCreateNewPlan,
}: AppProps = {}) {
  const generateIdRef = useRef<IdGenerator | null>(null);
  if (generateIdRef.current === null) {
    generateIdRef.current = injectedGenerateId ?? createSessionIdGenerator();
  }
  const generateId = generateIdRef.current;
  const initialDateRef = useRef(initialDate ?? new Date());
  const restoredSessionRef = useRef<WorkspaceSessionSnapshot | null | undefined>(undefined);
  if (restoredSessionRef.current === undefined) {
    restoredSessionRef.current =
      initialWorkspaceSession === undefined
        ? readWorkspaceSession()
        : initialWorkspaceSession;
  }
  const restoredSession = restoredSessionRef.current;
  const cloudStorageEnabled = onWorkspaceSessionChange !== undefined;
  const [draft, setDraft] = useState<ProjectSetupDraft>(() =>
    restoredSession?.draft ?? createInitialDraft(generateId, initialDateRef.current),
  );
  const [manualPlanDraft, setManualPlanDraft] = useState<ManualPlanDraft | null>(() => {
    const restoredManualPlanDraft = restoredSession?.manualPlanDraft ?? null;
    const restoredBundle = restoredSession?.draft.activeBundle ?? null;
    return restoredManualPlanDraft !== null && restoredBundle !== null
      ? reconcileManualPlanDraft(restoredBundle, restoredManualPlanDraft)
      : restoredManualPlanDraft;
  });
  const [submittedValidation, setSubmittedValidation] =
    useState<ProjectSetupValidation | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [slotAction, setSlotAction] = useState<SlotAction | null>(null);
  const [collapsedMemberKeys, setCollapsedMemberKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [excludedMemberKey, setExcludedMemberKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [screenState, setScreenState] = useState<AppScreen>(() =>
    restoredSession?.screen === 'MANUAL_PLAN' &&
    restoredSession.draft.activeBundle !== null &&
    restoredSession.manualPlanDraft !== null
      ? 'MANUAL_PLAN'
      : 'SETUP',
  );
  const [organizationScale, setOrganizationScale] = useState(
    restoredSession?.organizationScale ?? 1,
  );
  const [automaticPlanState, setAutomaticPlanState] =
    useState<AutomaticPlanRunState | null>(null);
  const [checkpointCandidate, setCheckpointCandidate] =
    useState<VerifiedAutomaticPlanCandidate | null>(null);
  const [workspaceAutomaticPlanCheckpoint, setWorkspaceAutomaticPlanCheckpoint] =
    useState<Readonly<Record<string, unknown>> | null>(
      restoredSession?.automaticPlanCheckpoint ?? null,
    );
  const [pinnedCandidate, setPinnedCandidate] =
    useState<VerifiedAutomaticPlanCandidate | null>(null);
  const [applyAutomaticPlanRequested, setApplyAutomaticPlanRequested] =
    useState(false);
  const [automaticPlanActionError, setAutomaticPlanActionError] =
    useState<string | null>(null);
  const automaticPlanControllerRef = useRef<AutomaticPlanRunController | null>(null);
  const restoredCheckpointFingerprintRef = useRef<string | null>(null);
  const slotFirstActionRef = useRef<HTMLButtonElement>(null);
  const excludeTriggerRef = useRef<HTMLElement | null>(null);
  const previousScreenRef = useRef<AppScreen>(screenState);

  const topology = useMemo(() => deriveTopology(draft), [draft]);
  const liveValidation = useMemo(() => validateProjectSetupDraft(draft), [draft]);
  const displayedValidation = submittedValidation ?? liveValidation;
  const selectedMember =
    draft.selectedMemberKey === null
      ? undefined
      : topology.memberByKey.get(draft.selectedMemberKey);
  const selectedMemberIssues = selectedMember === undefined
    ? []
    : displayedValidation.issues.filter(
        (issue) => issue.location.memberKey === selectedMember.memberKey,
      );
  const memberPendingExclusion =
    excludedMemberKey === null
      ? undefined
      : topology.memberByKey.get(excludedMemberKey);
  const directChildrenPendingExclusion =
    memberPendingExclusion === undefined
      ? []
      : (topology.childrenByParent.get(memberPendingExclusion.memberKey) ?? [])
          .map((memberKey) => topology.memberByKey.get(memberKey))
          .filter((member): member is MemberDraft => member !== undefined);
  const latestAutomaticPlanCandidate =
    automaticPlanState?.bestCandidate ?? checkpointCandidate;
  const manualPlanIsModified = useMemo(() => {
    if (draft.activeBundle === null || manualPlanDraft === null) return false;
    return isManualPlanDraftModified(
      deriveManualPlanSchema(draft.activeBundle),
      manualPlanDraft,
    );
  }, [draft.activeBundle, manualPlanDraft]);

  useEffect(() => {
    slotFirstActionRef.current?.focus();
  }, [slotAction]);

  useEffect(() => {
    const previousScreen = previousScreenRef.current;
    previousScreenRef.current = screenState;
    if (previousScreen === screenState) return;

    const titleId =
      screenState === 'MANUAL_PLAN' ? 'manual-plan-title' : 'project-setup-title';
    document.getElementById(titleId)?.focus();
  }, [screenState]);

  useEffect(() => {
    const snapshot: WorkspaceSessionSnapshot = {
      version: WORKSPACE_SESSION_VERSION,
      draft,
      manualPlanDraft,
      screen: screenState,
      organizationScale,
      automaticPlanCheckpoint: workspaceAutomaticPlanCheckpoint,
    };
    if (onWorkspaceSessionChange === undefined) {
      writeWorkspaceSession(snapshot);
    } else {
      onWorkspaceSessionChange(snapshot);
    }
  }, [
    draft,
    manualPlanDraft,
    onWorkspaceSessionChange,
    organizationScale,
    screenState,
    workspaceAutomaticPlanCheckpoint,
  ]);

  useEffect(() => {
    if (checkpointCandidate === null) return;
    const timer = window.setTimeout(() => {
      setWorkspaceAutomaticPlanCheckpoint(
        createAutomaticPlanCheckpointSnapshot(checkpointCandidate),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [checkpointCandidate]);

  useEffect(
    () => () => automaticPlanControllerRef.current?.dispose(),
    [],
  );

  useEffect(() => {
    const bundle = draft.activeBundle;
    if (bundle === null) return;
    const normalized = createAutomaticPlanRequest(bundle);
    if (
      normalized.status === 'FAILURE' ||
      restoredCheckpointFingerprintRef.current ===
        normalized.request.problemFingerprint
    ) {
      return;
    }
    restoredCheckpointFingerprintRef.current = normalized.request.problemFingerprint;
    if (workspaceAutomaticPlanCheckpoint === null) return;
    const restored = restoreAutomaticPlanCheckpointSnapshot(
      normalized.request,
      workspaceAutomaticPlanCheckpoint,
    );
    if (restored.status === 'RESTORED') {
      setCheckpointCandidate(restored.candidate);
      setAnnouncement('새로고침 전에 찾은 검증 계획을 다시 확인했습니다. 새 계산은 별도의 30분으로 시작합니다.');
    }
  }, [draft.activeBundle, workspaceAutomaticPlanCheckpoint]);

  const generateUniqueMemberKey = (): string => {
    const usedKeys = new Set(draft.members.map((member) => member.memberKey));
    let candidate = generateId('MEMBER');
    while (usedKeys.has(candidate)) {
      candidate = generateId('MEMBER');
    }
    return candidate;
  };

  const focusTopologyMember = (memberKey: string | null): void => {
    window.setTimeout(() => {
      const target =
        memberKey === null
          ? document.getElementById('project-rootMemberKey')
          : document.getElementById(memberCardId(memberKey)) ??
            document.getElementById(queueEntryId(memberKey));
      target?.focus();
      target?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    }, 0);
  };

  const focusMemberName = (memberKey: string | null): void => {
    if (memberKey === null) {
      return;
    }
    window.setTimeout(() => {
      const target = document.getElementById(memberFieldId(memberKey, 'name'));
      target?.focus();
      target?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    }, 0);
  };

  const invalidateAutomaticPlan = (): void => {
    automaticPlanControllerRef.current?.cancel();
    automaticPlanControllerRef.current?.dispose();
    automaticPlanControllerRef.current = null;
    setAutomaticPlanState(null);
    setCheckpointCandidate(null);
    setWorkspaceAutomaticPlanCheckpoint(null);
    setPinnedCandidate(null);
    setApplyAutomaticPlanRequested(false);
    setAutomaticPlanActionError(null);
    restoredCheckpointFingerprintRef.current = null;
  };

  const commitDraft = (nextDraft: ProjectSetupDraft, message?: string): void => {
    if (nextDraft !== draft) invalidateAutomaticPlan();
    setDraft(nextDraft);
    setSubmittedValidation(null);
    setCommandError(null);
    if (message !== undefined) {
      setAnnouncement(message);
    }
  };

  const applyTopologyOutcome = (
    outcome: TopologyCommandOutcome,
    message: string,
  ): boolean => {
    if (outcome.status === 'FAILURE') {
      setCommandError(outcome.error.message);
      setAnnouncement(`조직 변경 실패: ${outcome.error.message}`);
      return false;
    }
    commitDraft(outcome.draft, message);
    setSlotAction(null);
    focusTopologyMember(outcome.draft.selectedMemberKey);
    return true;
  };

  const focusIssue = (issue: ProjectSetupIssue): void => {
    if (
      issue.location.memberKey !== undefined &&
      issue.location.area !== 'QUEUE'
    ) {
      setDraft((current) => selectMember(current, issue.location.memberKey ?? null));
    }
    const targetId = validationIssueTargetId(issue);
    window.setTimeout(() => {
      const fallbackId =
        issue.location.memberKey === undefined
          ? 'project-setup'
          : memberCardId(issue.location.memberKey);
      const target = document.getElementById(targetId) ?? document.getElementById(fallbackId);
      target?.focus();
      target?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    }, 0);
  };

  const handleNewProject = (): void => {
    if (
      draftHasMemberData(draft) &&
      !window.confirm(
        onCreateNewPlan === undefined
          ? '지금까지 입력한 회원과 숫자를 모두 지우고 새로 시작할까요?'
          : '현재 계획은 그대로 저장한 채 새 계획을 만들까요?',
      )
    ) {
      return;
    }
    if (onCreateNewPlan !== undefined) {
      onCreateNewPlan();
      return;
    }
    invalidateAutomaticPlan();
    const next = createProjectDraft({
      year: draft.year,
      month: draft.month,
      half: draft.half,
      generateId,
    });
    setDraft(next);
    setSubmittedValidation(null);
    setCommandError(null);
    setSlotAction(null);
    setCollapsedMemberKeys(new Set());
    setExcludedMemberKey(null);
    setManualPlanDraft(null);
    setScreenState('SETUP');
    clearWorkspaceSession();
    setAnnouncement('새 플랜을 시작했습니다. 이전에 입력한 회원 정보는 가져오지 않았습니다.');
  };

  const handleAddRoot = (): void => {
    const outcome = addRootMember(draft, generateUniqueMemberKey());
    if (applyTopologyOutcome(
      outcome,
      '최상위 회원을 만들었습니다.',
    )) {
      focusMemberName(outcome.draft.selectedMemberKey);
    }
  };

  const handleAddMemberToOpenSlot = (): void => {
    if (slotAction === null) {
      return;
    }
    const outcome = addMemberToSlot(
      draft,
      slotAction.parentMemberKey,
      slotAction.side,
      generateUniqueMemberKey(),
    );
    const succeeded = applyTopologyOutcome(
      outcome,
      `${slotAction.side === 'LEFT' ? '왼쪽' : '오른쪽'} 자리에 새 회원을 추가했습니다.`,
    );
    if (succeeded) {
      setSlotAction(null);
      focusMemberName(outcome.draft.selectedMemberKey);
    }
  };

  const handleOpenSlot = (parentMemberKey: string, side: Side): void => {
    setCommandError(null);
    if (topology.reassignmentQueue.length === 0) {
      const outcome = addMemberToSlot(
        draft,
        parentMemberKey,
        side,
        generateUniqueMemberKey(),
      );
      if (applyTopologyOutcome(
        outcome,
        `${side === 'LEFT' ? '왼쪽' : '오른쪽'} 자리에 새 회원을 추가했습니다.`,
      )) {
        focusMemberName(outcome.draft.selectedMemberKey);
      }
      return;
    }
    setSlotAction({ parentMemberKey, side });
  };

  const handleRequestExclude = (memberKey: string): void => {
    excludeTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraft(selectMember(draft, memberKey));
    setExcludedMemberKey(memberKey);
  };

  const handleAttachQueuedSubtree = (memberKey: string): void => {
    if (slotAction === null) {
      return;
    }
    const succeeded = applyTopologyOutcome(
      attachSubtree(
        draft,
        memberKey,
        slotAction.parentMemberKey,
        slotAction.side,
      ),
      '기다리던 회원들을 빈 자리에 다시 연결했습니다.',
    );
    if (succeeded) {
      setSlotAction(null);
    }
  };

  const preparePlan = (): ProjectSetupBundle | null => {
    if (draft.activeBundle !== null) {
      return draft.activeBundle;
    }
    const outcome = normalizeProjectSetup(draft);
    setSubmittedValidation(outcome.validation);
    if (outcome.status === 'FAILURE') {
      setAnnouncement(`설정을 완료하지 못했습니다. 오류 ${outcome.errors.length}개를 확인해 주세요.`);
      const firstError = outcome.errors[0];
      if (firstError !== undefined) {
        focusIssue(firstError);
      }
      return null;
    }
    invalidateAutomaticPlan();
    setDraft(activateProjectSetupBundle(draft, outcome.bundle));
    setCommandError(null);
    return outcome.bundle;
  };

  const handleOpenManualPlan = (): void => {
    const activeBundle = preparePlan();
    if (activeBundle === null) return;
    setManualPlanDraft(reconcileManualPlanDraft(activeBundle, manualPlanDraft));
    setAnnouncement('입력을 확인하고 수동 플랜을 열었습니다.');
    setScreenState('MANUAL_PLAN');
  };

  const startAutomaticPlanForBundle = (activeBundle: ProjectSetupBundle): void => {
    const baseRequest = createAutomaticPlanRequest(activeBundle);
    if (baseRequest.status === 'FAILURE') {
      setAutomaticPlanActionError(baseRequest.error.message);
      return;
    }
    const compatibleWarmStart =
      latestAutomaticPlanCandidate?.problemFingerprint ===
      baseRequest.request.problemFingerprint
        ? latestAutomaticPlanCandidate.allocations
        : undefined;
    const requestOutcome = createAutomaticPlanRequest(
      activeBundle,
      compatibleWarmStart,
    );
    if (requestOutcome.status === 'FAILURE') {
      setAutomaticPlanActionError(requestOutcome.error.message);
      return;
    }
    automaticPlanControllerRef.current?.dispose();
    const controller = new AutomaticPlanRunController({
      createWorker: createAutomaticPlanWorker,
      onStateChange: setAutomaticPlanState,
      onVerifiedCandidate: (candidate) => {
        setCheckpointCandidate(candidate);
      },
    });
    automaticPlanControllerRef.current = controller;
    setAutomaticPlanActionError(null);
    try {
      controller.start(requestOutcome.request);
    } catch {
      controller.dispose();
      automaticPlanControllerRef.current = null;
      setAutomaticPlanState(Object.freeze({
        status: 'FAILED',
        elapsedMs: 0,
        bestCandidate: latestAutomaticPlanCandidate,
        proof: EMPTY_AUTOMATIC_PLAN_PROOF,
        error: Object.freeze({
          code: 'AUTOMATIC_PLAN_INTERNAL_ERROR',
          message: '자동 계획 작업 파일을 불러오지 못했습니다. 연결 상태를 확인해 주세요.',
        }),
        messageCode: 'WORKER_ASSET_LOAD_FAILED',
      }));
    }
  };

  const startAutomaticPlan = (): void => {
    if (draft.activeBundle === null) return;
    startAutomaticPlanForBundle(draft.activeBundle);
  };

  const handleStartAutomaticPlanFromSetup = (): void => {
    const activeBundle = preparePlan();
    if (activeBundle === null) return;
    setManualPlanDraft(reconcileManualPlanDraft(activeBundle, manualPlanDraft));
    setAnnouncement('입력을 확인하고 자동 플랜 만들기를 시작했습니다.');
    setScreenState('MANUAL_PLAN');
    startAutomaticPlanForBundle(activeBundle);
  };

  const handleOpenAutomaticPlanPreview = (): void => {
    if (latestAutomaticPlanCandidate !== null) {
      setPinnedCandidate(latestAutomaticPlanCandidate);
    }
  };

  const handleApplyPinnedCandidate = (): void => {
    if (pinnedCandidate === null || manualPlanDraft === null) return;
    setApplyAutomaticPlanRequested(true);
  };

  const confirmApplyPinnedCandidate = (): void => {
    const activeBundle = draft.activeBundle;
    if (
      activeBundle === null ||
      manualPlanDraft === null ||
      pinnedCandidate === null
    ) {
      setApplyAutomaticPlanRequested(false);
      return;
    }
    const applied = applyVerifiedAutomaticPlanCandidate(
      activeBundle,
      manualPlanDraft,
      pinnedCandidate,
    );
    if (applied.status === 'FAILURE') {
      setAutomaticPlanActionError(applied.message);
      setApplyAutomaticPlanRequested(false);
      return;
    }
    setManualPlanDraft(applied.draft);
    setCheckpointCandidate(applied.candidate);
    setPinnedCandidate(null);
    setApplyAutomaticPlanRequested(false);
    setAutomaticPlanActionError(null);
    automaticPlanControllerRef.current?.cancel();
    automaticPlanControllerRef.current?.dispose();
    automaticPlanControllerRef.current = null;
    setAnnouncement('선택한 자동 계획을 계획표에 적용했습니다. 이제 각 값을 직접 수정할 수 있습니다.');
  };

  const candidateParents = useMemo(() => {
    if (selectedMember === undefined) {
      return [];
    }
    const descendants = getDescendantKeys(topology, selectedMember.memberKey);
    return topology.activeMembers.filter(
      (candidate) =>
        candidate.memberKey !== selectedMember.memberKey &&
        !descendants.has(candidate.memberKey),
    );
  }, [selectedMember, topology]);

  const slotPanelParent =
    slotAction === null
      ? undefined
      : topology.memberByKey.get(slotAction.parentMemberKey);
  const automaticPlanUiStatus: AutomaticPlanUiStatus =
    automaticPlanState?.status ?? 'IDLE';
  const latestAutomaticPlanMetrics = useMemo(
    () =>
      latestAutomaticPlanCandidate === null
        ? null
        : automaticPlanPreviewMetrics(
            latestAutomaticPlanCandidate,
            automaticPlanState,
          ),
    [automaticPlanState, latestAutomaticPlanCandidate],
  );
  const pinnedAutomaticPlanMetrics = useMemo(
    () =>
      pinnedCandidate === null
        ? null
        : automaticPlanPreviewMetrics(
            pinnedCandidate,
            automaticPlanState,
          ),
    [automaticPlanState, pinnedCandidate],
  );
  const automaticPlanErrorMessage =
    automaticPlanActionError ??
    (automaticPlanState?.status === 'FAILED'
      ? automaticPlanState.error.message
      : null);

  if (
    screenState === 'MANUAL_PLAN' &&
    draft.activeBundle !== null &&
    manualPlanDraft !== null
  ) {
    return (
      <>
        <ManualPlanWorkspace
          bundle={draft.activeBundle}
          draft={manualPlanDraft}
          setupWarnings={Object.freeze(
            liveValidation.warnings.map(mapProjectSetupIssueToManualPlanIssue),
          )}
          onDraftChange={setManualPlanDraft}
          onReturnToSetup={() => setScreenState('SETUP')}
          announcement={announcement}
          storageMode={cloudStorageEnabled ? 'CLOUD' : 'LOCAL'}
          automaticPlanPanel={(
            <AutomaticPlanPanel
              status={automaticPlanUiStatus}
              elapsedMs={automaticPlanState?.elapsedMs ?? 0}
              maximumMs={AUTOMATIC_PLAN_PRODUCT_TIME_LIMIT_MS}
              phaseLabel={automaticPlanPhaseLabel(automaticPlanState)}
              latestCandidate={latestAutomaticPlanMetrics}
              pinnedCandidate={pinnedAutomaticPlanMetrics}
              errorMessage={automaticPlanErrorMessage}
              proofOnlyFailure={
                automaticPlanState?.status === 'FAILED' &&
                automaticPlanState.messageCode ===
                  'EXACT_PROOF_BACKEND_UNAVAILABLE' &&
                automaticPlanState.bestCandidate !== null
              }
              onStart={startAutomaticPlan}
              onStop={() => automaticPlanControllerRef.current?.cancel()}
              onOpenPreview={handleOpenAutomaticPlanPreview}
              onSwitchToLatest={() => {
                if (latestAutomaticPlanCandidate !== null) {
                  setPinnedCandidate(latestAutomaticPlanCandidate);
                }
              }}
              onApplyPinned={handleApplyPinnedCandidate}
              onClosePreview={() => setPinnedCandidate(null)}
            />
          )}
        />
        {applyAutomaticPlanRequested ? (
          <ApplyAutomaticPlanDialog
            manualDraftModified={manualPlanIsModified}
            onConfirm={confirmApplyPinnedCandidate}
            onCancel={() => setApplyAutomaticPlanRequested(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <main
      id="project-setup"
      className="app-shell"
      data-density="compact"
      tabIndex={-1}
    >
      <header className="app-header">
        <div className="app-header__copy">
          <p className="app-header__eyebrow">애터미 수당 계획표</p>
          <h1 id="project-setup-title" tabIndex={-1}>
            애터미 직급 플랜 설정
          </h1>
          <p className="app-header__description">기간과 회원 정보를 차례대로 입력해 주세요.</p>
        </div>
        <div className="app-header__actions">
          <button type="button" className="secondary-button" onClick={handleNewProject}>
            {cloudStorageEnabled ? '새 계획' : '초기화'}
          </button>
          <button type="button" className="primary-button" onClick={handleOpenManualPlan}>
            수동 플랜 열기
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleStartAutomaticPlanFromSetup}
          >
            자동 플랜 만들기
          </button>
        </div>
      </header>

      <aside className="storage-notice" aria-label="저장 안내">
        <span aria-hidden="true">ⓘ</span>
        <div>
          {cloudStorageEnabled ? (
            <>
              <strong>클라우드와 이 기기에 자동으로 저장됩니다.</strong>
              <div>인터넷이 잠시 끊겨도 이 기기에 보관한 뒤 자동으로 다시 저장합니다.</div>
            </>
          ) : (
            <>
              <strong>이 브라우저에 자동으로 저장됩니다.</strong>
              <div>
                브라우저를 닫아도 입력 내용이 유지됩니다. 사이트 데이터를 삭제하면 저장 자료도 삭제됩니다.
              </div>
            </>
          )}
        </div>
      </aside>

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {commandError === null ? null : (
        <section className="validation-summary validation-summary--error" role="alert">
          <h2 className="validation-summary__title">위치를 바꾸지 못했습니다.</h2>
          <p>{commandError}</p>
        </section>
      )}

      <div className="project-period-row">
        <ProjectPeriodForm
          draft={draft}
          issues={displayedValidation.issues}
          onPeriodChange={(patch) => commitDraft(editProjectPeriod(draft, patch))}
          onTitleChange={(title) => commitDraft(editProjectTitle(draft, title))}
          onRestoreDerivedTitle={() => commitDraft(restoreDerivedProjectTitle(draft))}
        />
      </div>

      <div className="workspace-grid">

        <div className="workspace-grid__tree">
          <OrganizationTree
            draft={draft}
            topology={topology}
            issues={displayedValidation.issues}
            collapsedMemberKeys={collapsedMemberKeys}
            scale={organizationScale}
            onAddRoot={handleAddRoot}
            onSelectMember={(memberKey) => setDraft(selectMember(draft, memberKey))}
            onToggleCollapsed={(memberKey) =>
              setCollapsedMemberKeys((current) => {
                const next = new Set(current);
                if (next.has(memberKey)) {
                  next.delete(memberKey);
                } else {
                  next.add(memberKey);
                }
                return next;
              })
            }
            onScaleChange={setOrganizationScale}
            onOpenSlot={handleOpenSlot}
            onNavigateIssue={focusIssue}
            onRemoveMember={handleRequestExclude}
          />

          {topology.reassignmentQueue.length === 0 ? null : (
            <ReassignmentQueue
              entries={topology.reassignmentQueue}
              rootMissing={draft.rootMemberKey === null}
              onSelect={(memberKey) => setDraft(selectMember(draft, memberKey))}
              onSetRoot={(memberKey) =>
                applyTopologyOutcome(
                  setRootMember(draft, memberKey),
                  '선택한 회원을 최상위 회원으로 정했습니다.',
                )
              }
            />
          )}
        </div>

        <aside className="workspace-grid__sidebar" aria-label="선택한 회원 편집">
          {slotAction === null || slotPanelParent === undefined ? null : (
            <section className="slot-action-panel" aria-labelledby="slot-action-title">
              <div>
                <h3 id="slot-action-title">
                  {slotPanelParent.name.trim() || slotPanelParent.memberKey} ·{' '}
                  {slotAction.side === 'LEFT' ? '왼쪽' : '오른쪽'} 빈 자리
                </h3>
                <p className="help-text">새 회원을 만들거나 위치를 기다리는 회원을 연결합니다.</p>
              </div>
              <div className="button-row">
                <button ref={slotFirstActionRef} type="button" className="primary-button" onClick={handleAddMemberToOpenSlot}>
                  새 회원 만들기
                </button>
                {topology.reassignmentQueue.map((entry) => (
                  <button type="button" className="secondary-button" key={entry.memberKey} onClick={() => handleAttachQueuedSubtree(entry.memberKey)}>
                    {entry.memberName.trim() || entry.memberKey}님과 하위 회원 연결
                  </button>
                ))}
                <button type="button" className="text-button" onClick={() => setSlotAction(null)}>
                  취소
                </button>
              </div>
            </section>
          )}
          {selectedMemberIssues.length === 0 ? null : (
            <section className="member-error-summary" aria-label="현재 회원 입력 확인 결과" role="alert">
              <strong>현재 회원: 수정할 항목 {selectedMemberIssues.length}개</strong>
              <button type="button" className="text-button" onClick={() => focusIssue(selectedMemberIssues[0]!)}>
                첫 항목으로 이동
              </button>
            </section>
          )}
          {selectedMember === undefined ? (
            <section className="panel empty-state">
              <p>회원 카드를 클릭하면 상세 내용을 편집할 수 있습니다.</p>
            </section>
          ) : (
            <section className="panel">
              <MemberForm
                member={selectedMember}
                memberDirectory={memberDirectory}
                planMembers={draft.members}
                issues={displayedValidation.issues}
                isRoot={draft.rootMemberKey === selectedMember.memberKey}
                candidateParents={candidateParents}
                isSlotAvailable={(parentMemberKey, side) => {
                  const occupant = topology.childBySlot.get(
                    topologySlotKey(parentMemberKey, side),
                  );
                  return occupant === undefined || occupant === selectedMember.memberKey;
                }}
                onIdentityChange={(patch) =>
                  commitDraft(editMemberIdentity(draft, selectedMember.memberKey, patch))
                }
                onDirectoryAssign={(
                  entry: MemberDirectoryEntry,
                  displayName: string,
                ) => {
                  const outcome = assignMemberDirectoryIdentity(
                    draft,
                    selectedMember.memberKey,
                    {
                      sourceMemberId: entry.sourceMemberId,
                      memberId: entry.memberId,
                      displayName,
                    },
                  );
                  if (outcome.status === 'FAILURE') {
                    setCommandError(outcome.message);
                    setAnnouncement(`회원 추가 실패: ${outcome.message}`);
                    return { status: 'FAILURE', message: outcome.message };
                  }
                  commitDraft(
                    outcome.draft,
                    `${displayName.trim()} 회원 정보를 DB에서 불러왔습니다.`,
                  );
                  return { status: 'SUCCESS' };
                }}
                onMove={(parentMemberKey, side) =>
                  applyTopologyOutcome(
                    moveSubtree(
                      draft,
                      selectedMember.memberKey,
                      parentMemberKey,
                      side,
                    ),
                    '선택한 회원과 하위 회원들을 새 자리로 옮겼습니다.',
                  )
                }
                onDetach={() =>
                  applyTopologyOutcome(
                    detachSubtree(draft, selectedMember.memberKey),
                    '현재 위치에서 뺐습니다. 새 위치를 정해 주세요.',
                  )
                }
                onExclude={() => handleRequestExclude(selectedMember.memberKey)}
              />
              <OpeningStateForm
                member={selectedMember}
                issues={displayedValidation.issues}
                onChange={(patch) =>
                  commitDraft(editOpeningState(draft, selectedMember.memberKey, patch))
                }
                onPvpTargetChange={(pvpTarget) =>
                  commitDraft(
                    editMemberIdentity(draft, selectedMember.memberKey, { pvpTarget }),
                  )
                }
              />
            </section>
          )}
        </aside>
      </div>

      {memberPendingExclusion === undefined ? null : (
        <ExcludeMemberDialog
          member={memberPendingExclusion}
          directChildren={directChildrenPendingExclusion}
          isRoot={draft.rootMemberKey === memberPendingExclusion.memberKey}
          onCancel={() => {
            setExcludedMemberKey(null);
            window.setTimeout(() => excludeTriggerRef.current?.focus(), 0);
          }}
          onConfirm={(strategy: ExclusionStrategy) => {
            const outcome = excludeMember(
              draft,
              memberPendingExclusion.memberKey,
              strategy,
            );
            const succeeded = applyTopologyOutcome(
              outcome,
              '선택한 회원을 삭제했습니다. 필요한 하위 회원의 새 위치를 정해 주세요.',
            );
            if (succeeded) {
              setExcludedMemberKey(null);
            }
          }}
        />
      )}
    </main>
  );
}
