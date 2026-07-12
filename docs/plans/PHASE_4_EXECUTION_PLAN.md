# Phase 4 Execution Plan — Automatic Plan Optimization

Date: 2026-07-12  
Status: Implementation-ready with confirmed Q-SIM-01 through Q-SIM-06 policies; synchronize them into authoritative documents in PRE-WP0

This document turns **Phase 4 — Automatic Plan Optimization** from `ROADMAP.md` into an implementation-ready plan. It first extends the deterministic calculation engine with the newly confirmed PVP qualification rule, then builds optimization on that tested engine and the completed manual worksheet without creating a second source of truth for business calculations.

This English document is the canonical Phase 4 execution plan. Product labels remain Korean and must use plain operator-facing language. Optimization, solver, and proof terminology may remain technical in code and engineering documentation but must be translated in the UI.

## 0. Mandatory Reading and Authority Rules

Before changing production code, the implementing Codex agent must:

1. Read this execution plan completely.
2. Read every source-of-truth document below completely. Do not rely on summaries, excerpts, prior chat context, or another agent's interpretation.
3. Inspect the current public contracts and tests listed below before designing optimizer types.
4. Re-check whether a later operator message overrides any confirmed Q-SIM-01 through Q-SIM-06 decision.
5. Stop and reconcile any material conflict before implementation. Do not silently choose a solver-friendly interpretation.

### 0.1 Source-of-Truth Documents

Read these files in full:

- `docs/ROADMAP.md`
- `docs/requirements/pyramid-app-requirements-v2.md`
- `docs/TECHNICAL_DESIGN.md`
- `docs/CALCULATION_CASES.md`
- `docs/plans/PHASE_2_EXECUTION_PLAN.md`
- `docs/plans/PHASE_3_EXECUTION_PLAN.md`

Authority is topic-specific:

| Topic | Authority |
|---|---|
| Phase boundaries and delivery order | `ROADMAP.md` |
| Business intent, required goals, and operator-facing behavior | `pyramid-app-requirements-v2.md` |
| Data ownership, ledger separation, optimizer status, and architecture | `TECHNICAL_DESIGN.md` |
| Exact arithmetic, target cases, and objective dominance | `CALCULATION_CASES.md` plus tested Phase 1 contracts |
| Setup bundle and stable organization identity | `PHASE_2_EXECUTION_PLAN.md` plus current project-setup code |
| Manual draft, worksheet, screen transition, and current-tab continuity | `PHASE_3_EXECUTION_PLAN.md` plus current manual-plan code |
| Phase 4 execution sequence and approved implementation defaults | This document |

If this plan conflicts with a finalized calculation case or the tested Phase 1 engine, the engine is not to be patched for convenience. Reconcile the authoritative documents and add or update the exact calculation case first.

### 0.2 Current Contracts to Inspect

At minimum, inspect:

- `src/domain/types.ts`, `constants.ts`, `pv.ts`, `period.ts`, and `validation.ts`
- `src/engine/index.ts`
- `src/engine/calculate-period.ts`
- `src/engine/organization.ts`
- `src/engine/daily-ledger.ts`
- `src/engine/half-month-ledger.ts`
- all Phase 1 engine and domain tests
- `src/application/project-setup/types.ts` and its normalization/public index
- all files and tests under `src/application/manual-plan/`
- `src/ui/App.tsx`
- `src/ui/workspace-session-storage.ts`
- `src/ui/components/manual-plan/` and their tests
- `package.json`, `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`

Production code must consume current contracts. Never import test fixtures into production code.

### 0.3 Repository Workflow

- Work on the existing `main` branch unless J explicitly requests otherwise.
- Preserve unrelated local changes.
- Link the implementation commit to a dedicated Phase 4 GitHub Issue.
- Follow `AGENTS.md`, including a Korean development log after every actual change.
- Do not commit or push unless the active user request asks for it.

## 1. Purpose

Phase 4 creates an automatic half-month plan from one validated `ProjectSetupBundle`. It must assign direct PVP and editable `SELF` left/right PV so that every member meets the required half-month targets while the lexicographic objective is optimized.

The optimizer is not a replacement for Phase 1. It proposes a complete allocation matrix. WP1 first versions and tests the qualification-aware Phase 1 `calculatePlan` contract; that contract then independently validates and recalculates every candidate before the candidate may be shown or applied.

The automatic result is a preview, not a persisted revision:

1. the operator requests an automatic plan from the active setup bundle;
2. the optimizer reports progress and the best verified candidate found so far;
3. the operator may stop and use a verified candidate or continue searching;
4. applying the candidate replaces the current manual worksheet draft only after explicit confirmation when manual entries exist;
5. the operator may inspect and edit the applied values in the existing Phase 3 worksheet.

## 2. Success Criteria

Phase 4 is successful when all of the following are true:

- A valid Phase 2 bundle can start automatic planning without requiring a pre-filled manual plan.
- The optimizer can handle organizations up to 50 active members functionally.
- Every produced candidate contains exactly the canonical editable fields for every member/date.
- Every Sunday allocation is zero.
- Every candidate shown to the operator has passed the updated, independently tested Phase 1 calculation engine.
- Every member's selected PVP target and both 2,500 side targets are hard constraints.
- A member may not trigger any planned commission before cumulative qualification PVP reaches 300; PVP added on the same date counts before that date's gate is checked.
- Starting PVP and date-by-date new PVP form a non-resetting qualification total that is distinct from the resettable daily PVP balance.
- Total direct new PV is the first optimization objective and is never worsened for any lower objective.
- Daily discarded excess uses the approved Phase 4 metric and is minimized only after total PV is fixed.
- For target-700 members, more commission days are preferred when higher objectives are tied; no extra PV may be added merely to increase days.
- A 1-PV-exact plan beats a rounded plan whenever rounding increases total PV.
- When every higher objective ties, direct PVP cells of exactly 100 are preferred over concentrating the same PVP into 200 or 300 cells.
- When all higher objectives tie, plans with fewer non-zero values outside 100-PV multiples are preferred.
- Identical input and policy produce an identical selected plan and objective vector.
- The product distinguishes a proven optimum from a verified but unproven best candidate.
- The default operator run may search for up to 30 minutes; an explicit extended run may search for up to 3 hours.
- The UI remains responsive while optimization runs.
- Loss of internet after the static app is loaded does not stop browser-local computation.
- Refresh/cancellation/time-limit never corrupts the setup or current manual draft.
- Phase 1–3 behavior and quality gates remain intact.

## 3. Approved and Provisional Phase 4 Decisions

### 3.1 Scale and Time Policy — Q-SIM-01

| Item | Phase 4 policy |
|---|---|
| Functional maximum | 50 active members across a full 13–16 date half-month |
| Default operator run | Up to 30 minutes |
| Extended engineering/J run | Up to 3 hours, explicitly selected |
| Optimization goal | Seek a mathematically proven lexicographic optimum |
| Time-limit behavior | Return the best independently verified candidate found so far and label it as unproven |
| No candidate at time limit | Return `TIME_LIMIT` with no plan and an actionable explanation |
| First useful candidate target | Preferably within 5 minutes for the 50-member benchmark; measure before treating this as a release promise |

The system must not make the operator stare at an empty screen while proof continues. It should publish improved verified incumbents as they are found. `OPTIMAL` is reserved for a complete proof; a good candidate is not renamed “optimal” merely because the time budget ended.

### 3.2 Local Execution First

Phase 4 starts with browser-local optimization in a dedicated Web Worker.

- The worker keeps CPU-heavy work off the React/UI thread.
- Internet loss does not interrupt an already loaded local worker.
- Refresh, tab closure, browser suspension, device sleep, or process failure can interrupt the worker.
- The main thread checkpoints only the latest verified incumbent to the existing versioned `sessionStorage` workspace.
- A checkpoint is not a complete solver-state snapshot. After refresh, it may warm-start a new search from the incumbent, but proof/search frontier state may restart.
- Do not introduce Supabase, authentication, permanent server jobs, or cross-device recovery in Phase 4.

WP2 contains a mandatory performance/feasibility gate. If a 50-member case cannot produce a useful candidate within the normal run or the selected exact solver cannot run safely in a browser, stop before product integration and write a server-job architecture decision. Do not hide a failing browser design behind a longer spinner.

### 3.3 Full-Commission PVP Qualification Gate — Q-SIM-05

The operator confirmed this planning rule:

```text
qualificationPvp(member, date) =
  openingPvp(member)
  + sum(direct new PVP allocated to that member through date, inclusive)
```

- If `qualificationPvp < 300`, the automatic plan must not trigger a commission event for that member on that date.
- PVP allocated on the date is included before eligibility is checked. A member starting at 33 who receives 267 that date reaches 300 and may receive a full commission that same date.
- The qualification total is cumulative and does not reset when the daily PVP/left/right ledger resets.
- A member whose opening PVP is already at least 300 is eligible from the first active date.
- “Do not create left/right sales” means “do not allow both assessed daily sides to reach a commission tier while the member is below 300.” One-sided performance and carry are allowed when they do not trigger a commission.
- The company may technically settle a reduced 30% payment below 300, but the product does not optimize, recommend, or count that as a usable commission. Automatic candidates containing such an event are invalid.
- The calculation engine must still preserve the company's actual reset/carry consequence for a manually entered below-300 settlement and expose a blocking planning warning. It must not pretend that balances survived merely because the product rejects the reduced payment.

This is a hard feasibility rule, not a soft objective that can be traded for lower PV, more days, or rounder numbers. If opening balances would force a first-date commission while qualification PVP is below 300, the optimizer must allocate enough same-date PVP to qualify or prove the request infeasible.

### 3.4 Hard Constraints

The optimizer must enforce:

1. every member's selected half-month PVP target;
2. every member's assessed left and right half-month values at or above 2,500;
3. zero new allocation on every `SKIP_NO_INPUT` date;
4. no direct value for a connected `CHILD` direction;
5. non-negative integer PV in exact 1-PV units;
6. the canonical organization propagation, daily ledger, carry, reset, PVP-side application, and half-month rules;
7. the section 3.3 qualification gate for every member/date;
8. exact safe-integer/range bounds for every model value and objective total.

Phase 4 has no per-cell locks, confirmed plan, actual values, or fixed past boundary. Those belong to Phase 5.

### 3.5 Lexicographic Objective Order

Objectives are solved sequentially. A lower objective may be optimized only while every higher objective remains fixed at its already-proven best value.

1. **Minimize total direct new PV.** Count each direct PVP and each editable `SELF` left/right allocation exactly once. Never count propagated organization totals again.
2. **Minimize total daily discarded excess.** Sum the metric in section 3.6 across valid full-commission days and members.
3. **Improve target-700 commission-day distribution.** Use the fairness order in section 3.7. Only commission days permitted by the qualification gate count.
4. **Prefer direct PVP entries of exactly 100.** Minimize the number of non-zero direct PVP cells whose value is not exactly 100.
5. **Prefer communication-friendly 100-PV multiples.** Minimize the number of non-zero direct cells whose value is not divisible by 100.
6. **Prefer smaller non-100 PVP concentrations.** Minimize the maximum direct PVP cell after objectives 1–5 are fixed.
7. **Choose one deterministic complete tie-break plan.** Use section 3.8.

Do not combine these objectives into one floating-point weighted sum. Exact sequential optimization or an equivalent exact lexicographic solver contract is required.

The requirement to exploit shared descendant contribution is primarily a search/modeling principle for objective 1, not a separate reward after all targets are met. A deeper allocation that satisfies its owner and several ancestors should win when it lowers total required PV.

The confirmed motivating pattern is:

```text
descendant direct PVP 100 + descendant left 300 + descendant right 300
= descendant subtree total 700
= 700 organization PV delivered to the corresponding side of every ancestor
```

The same direct PVP 100 can advance the descendant's personal PVP target and qualification total while the complete subtree total helps an ancestor reach a 700 side tier. This is not double-counting direct cost: objective 1 counts the PVP 100 once, while organization propagation derives its effects at every ancestor. Conversely, do not reward useless ancestor surplus merely because it travels through a deep node. PRE-WP0 must reconcile the older standalone “shared contribution score” wording in `TECHNICAL_DESIGN.md` and `CALCULATION_CASES.md`.

### 3.6 Discarded Excess — Confirmed Q-SIM-02 Policy

For a commission day:

```text
discardedExcessPv =
  preSettlement.pvp
  + preSettlement.left
  + preSettlement.right
  - 2 × commissionTier
```

For a non-commission or skipped day, discarded excess is zero.

This counts only PV above the minimum amount required for the achieved commission tier. The PV required to earn that commission is not treated as waste. All arithmetic must use checked integer operations.

The operator confirmed this metric using the `PVP 500 / left 0 / right 300` example. PVP applies to the smaller left side, the member earns the 300 tier, total pre-settlement PV is 800, required tier PV is 600, and discarded excess is 200. The optimizer should avoid that loss through timing or a higher tier when possible; if the global plan cannot avoid it, 200 is the accepted measured loss.

Qualification surplus is different. Opening PVP 33 plus new PVP 300 creates qualification PVP 333, but the extra 33 is not discarded by a daily settlement: it remains part of the cumulative qualification and half-month PVP totals. Q-SIM-02 counts only PV actually erased above an achieved daily tier.

### 3.7 Target-700 Commission Days — Q-SIM-03

Commission days never outrank total PV or discarded excess.

Among candidates tied on objectives 1 and 2:

1. maximize the number of target-700 members reaching at least 8 commission days;
2. compare target-700 members' qualification-valid commission-day counts in ascending order and lexicographically maximize that vector, so balanced improvement beats sacrificing one member for another;
3. if still tied, maximize the total commission days across target-700 members.

There is no cap at 8. With all higher objectives tied, 9 days beats 8 days. The optimizer must never add PV merely to turn 8 into 9 or 6 into 8. Members with PVP targets 1,500 or 2,400 are not part of this objective.

### 3.8 Exact PV, PVP-100 Preference, Round-Number Preference, and Deterministic Tie-Break — Confirmed Q-SIM-04/Q-SIM-06 Policies

The PVP-value-100 and 100-PV-multiple preferences apply only after total PV, discarded excess, and target-700 commission-day objectives are fixed.

```text
nonPreferredPvpCellCount = count(
  direct PVP cells where value > 0 and value !== 100
)
```

Minimize `nonPreferredPvpCellCount` first. With every higher objective tied, `PVP 100 + PVP 100` therefore beats one `PVP 200` entry, and three PVP 100 entries beat one PVP 300 entry. This is a soft workflow preference, not a daily cap or allowed-values list.

```text
nonHundredCellCount = count(
  direct editable cells where value > 0 and value % 100 !== 0
)
```

After the PVP-100 count is fixed, minimize `nonHundredCellCount`. Then minimize `maxDirectPvp`, defined as the largest direct PVP cell or zero when all are zero. This makes PVP 200 preferable to PVP 300 when all earlier metrics tie, without making either illegal.

A 39-PV plan still beats a 100-PV plan when it saves 61 total PV or improves any higher objective. A PVP 67, 200, or 300 entry is allowed whenever it improves qualification timing, total PV, discarded excess, commission outcomes, or another higher objective. Values remain exact 1-PV integers in the final worksheet.

This deliberately permits a small 1- or 10-PV correction where it solves a real global problem, while allowing the rest of the plan to remain in easy-to-communicate 100-PV blocks. For example, one exact correction plus several 100-PV cells may beat multiple irregular cells when every higher objective is identical. The operator confirmed that real worksheets contain many 10-PV values even though 100-PV values are cleaner.

Do not infer an unsupported daily PVP maximum or require every target-700 member to receive exactly seven 100-PVP entries. A descendant PVP 100 is often useful because it completes a 700 subtree package for ancestors, but exact date and amount must be chosen from the whole-tree calculation.

For a complete tie, flatten direct editable cells in this stable order:

1. date ascending;
2. manual-plan in-order member sequence;
3. field order `PVP`, `SELF_LEFT`, `SELF_RIGHT`;
4. at the first differing coordinate, prefer the plan with the larger value on the earlier coordinate.

The final rule gives a deterministic, earlier-action plan after every business objective is tied. It must not be described as a cost or commission improvement.

The soft PVP-100 and 100-PV-multiple preferences are confirmed. PRE-WP0 must record both exact metrics in the authoritative documents and add dominance cases proving that qualification, feasibility, total PV, discarded excess, and commission-day objectives always outrank them.

## 4. Phase Boundary

### 4.1 In Scope

- Automatic generation from one active immutable `ProjectSetupBundle`.
- A versioned Phase 1 engine extension for cumulative PVP qualification, below-300 settlement detection, and full-commission counting.
- Complete direct-allocation candidate matrices.
- Hard target constraints and exact lexicographic objectives.
- Constructive initial feasible candidate generation.
- Exact search/solver adapter and truthful optimality states.
- Bounded tiny-case exhaustive oracle.
- Web Worker execution, progress, cancellation, time limit, and incumbent reporting.
- Current-tab incumbent checkpoint and warm start.
- Candidate preview, objective explanation, independent Phase 1 verification, and apply-to-manual-worksheet action.
- 1-, 10-, 20-, and 50-member performance measurements.
- Automated regression, coverage, production build, and browser verification.

### 4.2 Explicitly Out of Scope

- Confirmed plans, approval, immutable revisions, or version history.
- Actual values, completed-date locks, plan differences, or partial resimulation.
- Editing setup/topology/opening values while an optimizer run is active.
- Per-cell manual locks or “optimize around these cells.”
- Product selection, Korean won cost, inventory, or item combinations.
- Persistent projects, cross-tab/device recovery, closed records, or export.
- Supabase, Google login, authorization, RLS, or remote job infrastructure.
- Hiding or licensing the client-side optimizer code.
- Multiple simultaneous optimization jobs.
- Automatic reuse of a prior project's result or opening values.
- Formal production SLA certification; Phase 4 records engineering measurements and Phase 7 certifies supported environments.

## 5. Canonical Data Flow

```text
Active ProjectSetupBundle
        |
        v
createAutomaticPlanRequest(bundle, policy)
        |
        v
Optimizer Web Worker
        |
        +---- progress / bounds / no candidate yet
        |
        +---- incumbent allocation candidate
        |               |
        |               v
        |       normalize candidate shape
        |               |
        |               v
        |       qualification-aware calculatePlan(candidate)
        |               |
        |               +---- FAILURE ---> reject candidate / optimizer error
        |               |
        |               +---- below-300 commission event ---> reject candidate
        |               |
        |               v
        |       objective evaluation from CalculationResult
        |               |
        |               v
        |       verified incumbent checkpoint + UI preview
        |
        +---- OPTIMAL / TIME_LIMIT / CANCELLED / FAILED

Verified candidate
        |
        +---- operator declines ---> existing manual draft unchanged
        |
        v
explicit apply
        |
        v
ManualPlanDraft strings ---> existing Phase 3 worksheet and results
```

The solver/model may use redundant derived variables for performance, but those values are never authoritative. Only a candidate that passes the qualification-aware `calculatePlan`, contains no below-300 commission event, and passes objective re-evaluation may cross the application boundary.

## 6. Application and Optimizer Contracts

### 6.1 Request and Policy

Use explicit versioned types equivalent to:

```ts
type AutomaticPlanRunMode = 'STANDARD_30_MIN' | 'EXTENDED_3_HOUR';

interface AutomaticPlanPolicy {
  readonly policyVersion: '1.0.0';
  readonly runMode: AutomaticPlanRunMode;
  readonly timeLimitMs: 1_800_000 | 10_800_000;
  readonly deterministicSeed: number;
}

interface AutomaticPlanRequest {
  readonly bundle: ProjectSetupBundle;
  readonly rulesetVersion: RuleSetVersion;
  readonly policy: AutomaticPlanPolicy;
  readonly warmStart?: NormalizedAllocationCell[];
}
```

PRE-WP0 must assign and document a new ruleset version for the qualification-aware engine; do not continue to label changed semantics as `2.0.0`. Do not allow arbitrary UI milliseconds in the core contract. Tests may inject a clock/deadline abstraction or test-only small budget without broadening the product policy type.

### 6.2 Objective Vector

```ts
interface AutomaticPlanObjectiveVector {
  readonly totalNewPv: number;
  readonly discardedExcessPv: number;
  readonly target700MembersAtLeastEight: number;
  readonly target700AscendingDayVector: readonly number[];
  readonly target700TotalCommissionDays: number;
  readonly nonPreferredPvpCellCount: number;
  readonly nonHundredCellCount: number;
  readonly maxDirectPvp: number;
  readonly deterministicAllocationVector: readonly number[];
}
```

Provide one pure comparator. Every solver, incumbent update, UI summary, test oracle, and checkpoint must use that comparator rather than reimplementing objective order.

### 6.3 Result and Progress States

Separate run state from candidate verification:

```ts
type AutomaticPlanRunStatus =
  | 'RUNNING'
  | 'OPTIMAL'
  | 'TIME_LIMIT'
  | 'CANCELLED'
  | 'INFEASIBLE'
  | 'FAILED';

interface VerifiedAutomaticPlanCandidate {
  readonly allocations: readonly NormalizedAllocationCell[];
  readonly calculation: CalculationResult;
  readonly objective: AutomaticPlanObjectiveVector;
  readonly foundAtElapsedMs: number;
}

interface AutomaticPlanProgress {
  readonly status: AutomaticPlanRunStatus;
  readonly elapsedMs: number;
  readonly bestCandidate: VerifiedAutomaticPlanCandidate | null;
  readonly primaryLowerBound: number | null;
  readonly primaryOptimalityProven: boolean;
  readonly completedObjectiveStage: number;
  readonly messageCode: string;
}
```

`TIME_LIMIT` and `CANCELLED` may contain a verified candidate. `FAILED` must not present an unverified solver vector as usable. `INFEASIBLE` requires proof; “no solution found yet” is not infeasibility.

### 6.4 Candidate Shape and Verification

- Candidate allocations contain one cell per date/member.
- PVP always exists.
- `SELF` directions exist, including zero.
- `CHILD` directions are structurally absent.
- Sunday cells are zero.
- Candidate PV is safe, non-negative integer data before calling Phase 1.
- `calculatePlan` must succeed.
- Every date/member qualification trace must equal opening PVP plus inclusive cumulative direct new PVP.
- No candidate may contain a commission-triggering settlement while that trace is below 300.
- Every final `FortnightAssessment.allTargetsMet` must be true.
- Recompute objective values from the candidate and Phase 1 result; never trust solver-reported objective values without comparison.
- Reject and record an internal model-consistency failure if solver and verifier disagree.

### 6.5 Exact Arithmetic and Bounds

- Build a constructive feasible incumbent before exact search when possible.
- Use that incumbent's total PV as a finite upper bound for model variables and big-M/conditional constraints.
- Use checked integer operations for derived bounds and objective totals.
- Verify the chosen solver's exact integer range before model creation.
- Return `OPTIMIZATION_SCORE_OUT_OF_RANGE` rather than rounding, saturating, or using unsafe floating-point weights.
- Solve objectives sequentially instead of encoding lexicographic order in a huge weighted sum.

### 6.6 Solver Adapter

Define a solver-neutral boundary so Phase 4 is not coupled to an unproven package:

```ts
interface AutomaticPlanSolver {
  solve(
    model: AutomaticPlanModel,
    control: AutomaticPlanSolveControl,
    onProgress: (progress: SolverProgress) => void,
  ): Promise<SolverOutcome>;
}
```

WP2 evaluates candidate implementations against the same model fixtures. Candidate categories may include browser-compatible CP-SAT/MILP WASM or a tailored deterministic branch-and-bound implementation. No dependency is approved merely by popularity; it must pass the bundle-size, worker, CSP, exact-integer, cancellation, determinism, and 50-member spike gates.

### 6.7 Model Semantics

The selected exact model must represent, or conservatively generate and verify, all of the following:

- integer direct variables for non-Sunday PVP and `SELF` directions;
- linear organization propagation from descendants to every ancestor path;
- non-resetting cumulative personal qualification PVP from opening PVP plus inclusive date-by-date direct PVP;
- same-date qualification before the commission-eligibility gate;
- prohibition of any automatic commission-triggering settlement while qualification PVP is below 300;
- personal PVP target constraints;
- half-month smaller-side PVP application, including tie-left behavior;
- daily PVP smaller-side application;
- official tier selection and at-most-one commission per day;
- reset-to-zero on a commission day and exact carry otherwise;
- Sunday skip and carry preservation;
- target-700 full-commission-day counts after qualification;
- discarded excess from the achieved tier;
- direct-PVP-value-100 preference, general 100-PV-multiple preference, and maximum direct PVP;
- exact sequential fixing of each objective optimum.

Any model shortcut must be proven equivalent on bounded exhaustive cases. Phase 1 verification catches invalid candidates but cannot prove that a solver omitted a better valid candidate.

## 7. Worker, Cancellation, and Current-Tab Continuity

### 7.1 Worker Protocol

Use a Vite module worker, not the React main thread. Messages must be versioned and structured-clone-safe:

- `START(request)`
- `CANCEL(runId)`
- `PROGRESS(runId, elapsed, bounds, stage)`
- `INCUMBENT(runId, candidate)`
- `COMPLETE(runId, outcome)`
- `ERROR(runId, safeError)`

Ignore stale messages from an older `runId`. Terminating a worker is the final cancellation fallback, but prefer cooperative cancellation at bounded solver checkpoints.

### 7.2 Checkpoint Policy

- Checkpoint only a Phase 1-verified incumbent and its exact request snapshot/policy version.
- Throttle writes; do not serialize on every solver node.
- Restore only when the current active bundle and policy are deeply equivalent to the checkpoint request.
- A setup edit invalidates the candidate and cancels the active run.
- A new project clears optimizer checkpoints with the existing manual/setup session.
- Refresh may restart search with the candidate as a warm start.
- Never claim that proof resumed unless the solver frontier/proof state was actually restored.

### 7.3 Interruption Semantics

- Internet disconnect after the app and worker assets load: computation continues locally.
- User presses stop: preserve the latest verified candidate and return `CANCELLED`.
- Default deadline: preserve the latest verified candidate and return `TIME_LIMIT` unless optimality is already proven.
- Browser refresh/crash/sleep: computation may stop; restore the latest checkpoint and offer restart.
- Tab closure: current `sessionStorage` data may disappear, matching the Phase 3 current-tab contract.

## 8. UI and Interaction Contract

### 8.1 Entry and Replacement Safety

- Add `자동 계획 만들기` to the ready setup/manual-plan flow.
- Automatic generation always uses the current active immutable bundle.
- Existing manual values are not solver locks in Phase 4.
- Starting a run does not erase the current manual draft.
- Applying a candidate to a modified manual draft requires a plain-language confirmation.
- Declining or closing the preview leaves every manual value unchanged.

### 8.2 Progress Panel

Show only operator-meaningful information:

- elapsed time;
- current phase such as `사용 가능한 계획 찾는 중` or `가장 적은 값인지 확인 중`;
- best total new PV when a verified candidate exists;
- `최소값 확인 완료` only for `OPTIMAL`;
- `현재까지 찾은 가장 좋은 계획` for an unproven candidate;
- default 30-minute limit;
- `현재 계획 사용`, `계속 계산`, and `계산 중지` where applicable.

Do not expose `MIP gap`, branch nodes, incumbent, big-M, constraint, or solver names in the normal UI.

### 8.3 Candidate Preview

Before applying, show:

- total new PV;
- whether minimum total PV is proven;
- total discarded excess;
- target-700 commission-day summary;
- count of non-zero direct PVP cells that are not exactly 100;
- count of non-100 direct cells;
- maximum direct PVP cell;
- confirmation that every planned commission occurs at qualification PVP 300 or above;
- all-member target status from Phase 1;
- calculation duration and result status.

The preview may reuse the Phase 3 worksheet/result selectors in read-only form. Do not create a separate formula renderer.

### 8.4 Run Modes

- Default button starts the 30-minute mode.
- Extended 3-hour mode is a secondary advanced action intended for J or engineering comparison.
- If a verified result appears early, the operator may use it immediately while proof would otherwise continue.
- The 3-hour mode must warn that the tab and device must remain awake.

## 9. Target File Structure

Exact filenames may change when a split would be trivial, but layer responsibilities must remain:

```text
src/optimizer/
  types.ts
  objective.ts
  discarded-excess.ts
  candidate-verifier.ts
  constructive-candidate.ts
  model.ts
  solver.ts
  exhaustive-oracle.ts
  index.ts
  __tests__/

src/application/automatic-plan/
  types.ts
  create-request.ts
  run-automatic-plan.ts
  worker-protocol.ts
  checkpoint.ts
  apply-candidate.ts
  index.ts
  __tests__/

src/workers/
  automatic-plan.worker.ts

src/ui/components/automatic-plan/
  AutomaticPlanControls.tsx
  AutomaticPlanProgress.tsx
  AutomaticPlanPreview.tsx
  ApplyAutomaticPlanDialog.tsx
  __tests__/
```

Existing files likely to change:

- `src/domain/types.ts` and the versioned ruleset contract for qualification status and any stable calculation result required by both manual and automatic plans.
- `src/engine/daily-ledger.ts`, `half-month-ledger.ts`, and/or a focused qualification module to calculate inclusive cumulative PVP, distinguish settlement from full-commission eligibility, and preserve actual reset behavior.
- `src/engine/index.ts` to publish the qualification-aware calculation contract used by manual and automatic plans.
- `src/application/manual-plan/` to convert a verified candidate to manual draft strings without duplicating schema rules.
- `src/ui/App.tsx` for run lifecycle and candidate application.
- `src/ui/workspace-session-storage.ts` for a versioned optional incumbent checkpoint and migration/fallback.
- `src/ui/components/manual-plan/ManualPlanWorkspace.tsx` for automatic-plan entry/preview integration.
- `src/ui/styles.css` for progress and preview presentation.
- `package.json`, lockfile, Vite/worker configuration, and license notices only after WP2 approves a dependency.
- source documents and Korean development log as required by PRE-WP0 and delivery.

## 10. Work Packages

Complete work packages in order. A later package may begin only when the preceding package's exit gate passes.

### PRE-WP0 — Contract Synchronization

Tasks:

- Perform section 0 mandatory reading.
- Re-check that no later operator message overrides a confirmed decision.
- Record Q-SIM-01 through Q-SIM-06 decisions in `TECHNICAL_DESIGN.md` and the requirements document, keeping Q-SIM-06's direct-PVP-value-100 preference distinct from Q-SIM-04's general 100-PV-multiple preference.
- Add the PVP 300 qualification counter, inclusive same-date eligibility, automatic pre-qualification commission prohibition, and manual below-300 reset/warning semantics to `CALCULATION_CASES.md`.
- Assign a new ruleset version for the qualification-aware engine and define migration/unsupported-version behavior.
- Convert `OPT-P01`, `OPT-005`, `OPT-P02`, `OPT-P03`, and `OPT-P05` from pending to one finalized expected result.
- Reconcile `OPT-P04`: shared descendant contribution is enforced by minimum total PV/model structure, not rewarded as uncapped surplus. Include the `PVP 100 + left 300 + right 300 = subtree 700` ancestor case.
- Add any missing exact case for target-700 fairness across multiple members.
- Create/link a Phase 4 GitHub Issue.

Exit gate:

- No unresolved Phase 4 business rule remains.
- Every Phase 4 objective has one exact comparator and at least one calculation case.
- Qualification and below-300 settlement behavior have exact calculation cases and a versioned engine contract.
- Source documents and this plan agree before production optimizer code.

### WP1 — Qualification-Aware Engine, Objective Evaluator, Verifier, and Tiny Oracle

Tasks:

- Extend the Phase 1 engine with the non-resetting cumulative qualification-PVP trace.
- Apply same-date direct PVP before checking the 300 gate.
- Preserve actual daily reset/carry behavior for a manually entered below-300 settlement, while marking it unusable and warning-worthy.
- Count only qualification-valid full commission days toward the recommendation.
- Bump and test the calculation ruleset version before optimizer integration.
- Define request, candidate, objective, outcome, and error types.
- Implement candidate shape validation.
- Implement Phase 1 independent verification.
- Implement discarded excess and the one canonical objective comparator.
- Implement `nonPreferredPvpCellCount`, `nonHundredCellCount`, and `maxDirectPvp` in the canonical comparator.
- Implement a bounded exhaustive oracle for tiny organizations, short synthetic date sets, and small PV domains.
- Add objective dominance and deterministic tie tests before integrating a solver.

Exit gate:

- Invalid candidates never become verified candidates.
- `calculatePlan` identifies every below-300 settlement deterministically and no automatic candidate containing one is verified.
- Starting PVP 33 plus same-date PVP 267 qualifies that date; 266 does not.
- The comparator reproduces every finalized Phase 4 case.
- The exhaustive oracle returns a deterministic global optimum for bounded fixtures.

### WP2 — Constructive Candidate and Solver Feasibility Spike

Tasks:

- Build a deterministic constructive candidate that first avoids pre-qualification commissions, then prioritizes remaining personal PVP and bottom-up `SELF` side deficits.
- Verify the constructive result through Phase 1.
- Define the solver-neutral model/adapter.
- Spike candidate exact solver approaches in a Web Worker.
- Measure model build, first feasible candidate, improvement, proof, memory, bundle size, cancellation, and determinism on 1/10/20/50-member fixtures.
- Record dependency license, maintenance, browser/WASM/CSP compatibility, exact-integer range, and worker behavior.
- Select one backend or stop with a server-job architecture decision if no browser backend is safe.

Exit gate:

- A useful verified candidate is produced reliably for all benchmark shapes.
- The chosen backend runs outside the UI thread and supports bounded cancellation/progress.
- Exact integer semantics and model equivalence are credible and tested.
- The 50-member result supports proceeding with the 30-minute product mode; otherwise implementation pauses for explicit architecture review.

### WP3 — Primary Exact Optimization

Tasks:

- Implement integer direct variables and finite safe bounds.
- Implement organization propagation and hard final target constraints.
- Implement cumulative qualification PVP and the no-commission-below-300 feasibility constraint.
- Implement calendar and connected-direction restrictions.
- Minimize total direct new PV.
- Use the constructive candidate as an incumbent/warm start where supported.
- Compare primary optima against the exhaustive oracle and `OPT-001`/`OPT-002` lower bounds.

Exit gate:

- Small fixtures exactly match exhaustive minimum total PV.
- All shown candidates satisfy every hard target through Phase 1.
- Every shown commission day is qualification-valid, including same-date threshold crossings.
- The descendant 700 package can satisfy its owner's PVP need and deliver 700 organization PV upward without counting direct cost twice.
- 6,000+ commission tiers never motivate extra PV (`OPT-003`).
- A 39-PV exact improvement beats 100-PV rounding (`OPT-004`).

### WP4 — Daily Ledger Model and Secondary Objectives

Tasks:

- Encode or exactly search daily PVP application, qualification gate, carry, tiers, reset, and Sunday skip.
- Preserve settlement/reset consequences in engine verification, but reject any automatic plan that triggers settlement below qualification PVP 300.
- Add discarded-excess minimization after fixing minimum total PV.
- Add target-700 fairness/day maximization after fixing both higher objectives.
- Add exact-PVP-100-cell minimization.
- Add non-100-cell minimization, followed by maximum-direct-PVP minimization.
- Add the deterministic allocation tie-break.
- Solve stages sequentially and emit completed-stage/proof progress.

Exit gate:

- All finalized `OPT-P01` through `OPT-P06` expectations pass.
- No lower objective worsens a higher objective.
- Exact 1- or 10-PV corrections remain available when they improve a higher objective; otherwise more PVP-100 cells win before general 100-PV multiples and smaller PVP concentration are compared.
- 9 days beats 8 only when higher objectives are identical.
- Identical requests return byte-for-byte equivalent allocations/objective vectors.

### WP5 — Worker Lifecycle and Checkpointing

Tasks:

- Implement versioned worker messages and stale-run protection.
- Implement progress throttling and incumbent verification on the application boundary.
- Implement cooperative cancellation and hard worker termination fallback.
- Extend the current workspace snapshot with an optional verified candidate checkpoint.
- Restore/warm-start only against an exactly matching request.
- Cancel/invalidate on setup edits or new project.

Exit gate:

- The UI thread remains responsive during benchmark runs.
- Stop/time-limit preserves the latest verified candidate.
- Refresh restores the candidate without falsely restoring proof state.
- Malformed or stale checkpoints are ignored safely.

### WP6 — Product UI and Manual Worksheet Handoff

Tasks:

- Add automatic-plan entry controls.
- Add standard and extended run modes.
- Add progress, status, stop/use/continue actions, and plain Korean copy.
- Add candidate preview backed by Phase 1 result selectors.
- Add explicit replacement confirmation for a modified manual plan.
- Convert and apply a candidate through the existing manual-plan schema.
- Preserve the candidate and prior manual draft until application succeeds.

Exit gate:

- The operator can generate, inspect, apply, and then manually edit an automatic plan.
- No candidate overwrites manual work without confirmation.
- `OPTIMAL` and unproven best-plan wording are never confused.
- Core flow works by keyboard and does not expose solver jargon.

### WP7 — Scale, Regression, Documentation, and Delivery

Tasks:

- Run the complete Phase 1–4 test and coverage suite.
- Run deterministic benchmarks for 1, 10, 20, and 50 members in production mode.
- Record first candidate, best candidate, proof/time-limit, memory, bundle, and UI responsiveness.
- Exercise standard stop/use and extended-mode behavior in a real browser.
- Test offline continuation after assets have loaded.
- Build and run `/ngplan/` smoke checks.
- Update authoritative documents where implementation finalized a contract.
- Update the Korean development log with decisions, failed solver spikes, measurements, limitations, and deferred server/auth/storage work.

Exit gate:

- All quality gates pass without threshold reduction.
- A 50-member run produces a verified usable candidate within the approved standard workflow or Phase 4 is explicitly blocked pending server architecture.
- No Phase 5/6 feature was introduced accidentally.

## 11. Test Plan

### 11.1 Required Commands

```powershell
npm run typecheck
npm test -- --run
npm run test:coverage
npm run build
npm run smoke:dist
```

Keep existing coverage gates:

- domain, engine, optimizer, and application: at least 95% branches, functions, lines, and statements;
- UI: at least 85% branches and 90% functions, lines, and statements.

Do not lower a threshold to make Phase 4 pass. Add optimizer paths to the coverage configuration deliberately.

### 11.2 Required Automated Cases

| ID | Case | Expected result |
|---|---|---|
| P4-REQ-001 | Valid setup request | Immutable request with exact bundle/rules/policy |
| P4-REQ-002 | Unsupported policy/rules version | Stable failure before solving |
| P4-SHAPE-001 | Full candidate matrix | One date/member cell; exact SELF/CHILD shape |
| P4-SHAPE-002 | Sunday candidate | All direct values zero |
| P4-VERIFY-001 | Solver claims invalid candidate | Candidate rejected by Phase 1 |
| P4-VERIFY-002 | Solver objective mismatch | Internal consistency failure; no usable candidate |
| P4-QUAL-001 | Opening PVP 33 plus same-date PVP 267, then commission | Qualification is 300; full commission is allowed that date |
| P4-QUAL-002 | Opening PVP 33 plus same-date PVP 266, then commission | Candidate is invalid because qualification is 299 |
| P4-QUAL-003 | Opening PVP 33; PVP 100 with no commission, then PVP 200 with commission | First date carries qualification 133; second date reaches 333 and is allowed |
| P4-QUAL-004 | Qualification below 300 with one-sided performance only | Allowed when no commission tier is triggered; carry remains exact |
| P4-QUAL-005 | Manual draft triggers settlement below qualification 300 | Actual reset is preserved, event is not counted as usable commission, blocking warning emitted |
| P4-QUAL-006 | Opening PVP already at least 300 | Eligible from the first active date |
| P4-OBJ-001 | Lower objective increases total PV | Candidate rejected as worse |
| P4-OBJ-002 | Same total, lower discarded excess | Lower-excess candidate wins |
| P4-OBJ-003 | Same higher objectives, 8 vs 9 days | 9-day candidate wins |
| P4-OBJ-004 | Extra PV creates more commission days | Lower-PV candidate wins |
| P4-OBJ-005 | Same higher objectives, 100/200 vs 50/250 | 100/200 candidate wins |
| P4-OBJ-006 | 39 vs 100 with different total | 39 candidate wins |
| P4-OBJ-007 | Complete tie | Stable earlier-coordinate plan wins |
| P4-OBJ-008 | One exact correction plus 100-block cells vs several irregular cells with all higher objectives tied | Fewer non-100 cells wins |
| P4-OBJ-009 | Same higher objectives and total PVP: two PVP-100 cells vs one PVP-200 cell | Two PVP-100 cells win |
| P4-OBJ-010 | PVP 200 or an exact irregular value improves a higher objective over PVP 100 | Higher-objective plan wins; PVP 100 is not forced |
| P4-OBJ-011 | Same preceding metrics: maximum direct PVP 200 vs 300 | Maximum-PVP-200 plan wins |
| P4-ORACLE-001 | Tiny bounded single member | Solver equals exhaustive optimum |
| P4-ORACLE-002 | Child has PVP 100, left 300, right 300 | Subtree is 700, ancestor receives 700 on its connected side, direct cost counts once |
| P4-ORACLE-003 | Random seeded tiny fixtures | Solver equals oracle objective and deterministic plan |
| P4-STATUS-001 | Proof completes | `OPTIMAL` with verified candidate |
| P4-STATUS-002 | Deadline after candidate | `TIME_LIMIT` with verified unproven candidate |
| P4-STATUS-003 | Deadline before candidate | `TIME_LIMIT` without usable plan |
| P4-STATUS-004 | Cancel after candidate | `CANCELLED`; candidate retained |
| P4-STATUS-005 | Search exhaustion | `INFEASIBLE` only with proof |
| P4-WORKER-001 | Progress under load | UI event loop remains responsive |
| P4-WORKER-002 | Stale run message | Ignored |
| P4-WORKER-003 | Cooperative and hard cancellation | No later candidate mutates current run |
| P4-CHECKPOINT-001 | Verified incumbent | Stored and restored for exact request |
| P4-CHECKPOINT-002 | Setup/policy mismatch | Checkpoint discarded |
| P4-APPLY-001 | Blank manual plan | Candidate converts to exact draft strings |
| P4-APPLY-002 | Modified manual plan | Explicit confirmation required |
| P4-APPLY-003 | Decline replacement | Manual draft unchanged |
| P4-REG-001 | Apply then calculate manually | Phase 3 result equals candidate calculation |
| P4-SCALE-001 | 1/10/20/50 fixtures | Metrics emitted; no crash or unsafe integer |
| P4-PAGES-001 | Production build | Worker and `/ngplan/` assets resolve correctly |

### 11.3 Calculation-Case Traceability

Tests must use or explicitly cite these canonical IDs after PRE-WP0 finalizes pending cases:

- calendar and target recommendation: `CAL-003`, `COUNT-003`, `COUNT-P01`;
- minimum PV and shared descendant contribution: `OPT-P01`, `OPT-001`, `OPT-002`;
- cumulative PVP 300 qualification, same-date threshold crossing, below-threshold settlement/reset, and full-commission counting: new finalized qualification cases created in PRE-WP0;
- objective dominance: `OPT-003`, `OPT-004`, `OPT-005`, `OPT-006`;
- PVP-value-100 soft preference, exact correction dominance, and maximum direct PVP: new finalized Q-SIM-06 cases created in PRE-WP0;
- commission days, discarded excess, and tie-break: `OPT-P02`, `OPT-P03`, `OPT-P05`;
- exact objective range: `OPT-P06`.

Read the source cases themselves. Do not derive expected results from this plan alone.

### 11.4 Performance Harness

Provide deterministic fixture generation and a non-UI benchmark command. Record at least:

- member count and date count;
- direct variable count and model size;
- model build time;
- first verified candidate time;
- best objective at 5 minutes and 30 minutes when applicable;
- proof time or final gap/bound if the solver exposes one;
- peak memory when measurable;
- worker cancellation latency;
- production worker bundle size.

Standard CI must not contain tight wall-clock assertions that become flaky across machines. Correctness and deterministic status tests use injected deadlines/clocks. Performance results are recorded engineering evidence and later become Phase 7 support criteria.

### 11.5 Manual Browser Case — P4-PAGES-002

1. Run the production preview and open `/ngplan/`.
2. Create or restore a valid multi-level organization containing target 700, 1,500, and 2,400 members, including one member with opening PVP 33.
3. Start a standard automatic plan.
4. Confirm the page stays responsive and progress copy is understandable.
5. Confirm an early verified candidate can be previewed while proof continues.
6. Stop once and confirm the candidate remains usable and is not called optimal.
7. Restart, obtain a final result, and verify all member targets in the preview.
8. Confirm the opening-PVP-33 member has no commission before its inclusive cumulative PVP reaches 300, and that a same-date crossing may commission normally.
9. Apply the candidate and confirm the Phase 3 worksheet shows identical direct values/results.
10. Manually create one below-300 settlement and confirm the reset remains accurate while a plain blocking warning appears and the event is not counted as a usable commission.
11. Edit one applied cell manually and confirm Phase 3 recalculates normally.
12. Start another automatic plan and decline replacement; confirm manual work remains.
13. Disconnect the network after the app/worker assets load and confirm a local run continues.
14. Refresh after a checkpoint and confirm the verified candidate restores while proof restarts honestly.
15. Verify Korean copy at Windows 125% scaling and on a typical 15-inch laptop.
16. Record observations and actual timings in the Korean development log.

## 12. Review Checkpoints

### A — Phase Boundary

- Automatic draft generation only; no confirmation/actual/resimulation/revision semantics.
- No Supabase/auth/server job/persistent project storage.
- No product or currency optimization.

### B — Authority and Verification

- The newly versioned, qualification-aware Phase 1 engine is the only business-calculation authority.
- Solver-derived values never bypass independent verification.
- Candidate/objective disagreement is a hard internal error.

### C — Objective Correctness

- Hard targets and the PVP 300 qualification gate are never softened.
- Total PV dominates every preference.
- Discarded excess dominates commission-day, PVP-100, and 100-PV-multiple preferences.
- More target-700 days never justify extra PV.
- Exact 1-PV savings beat round-number readability.
- Small exact corrections remain legal; PVP 100 is preferred only after every calculation objective ties.
- PVP-100 preference is evaluated before the general 100-PV-multiple preference, then maximum direct PVP is minimized.
- Tie-break is deterministic and not presented as business value.

### D — Status Honesty

- `OPTIMAL` requires proof.
- `TIME_LIMIT` is not renamed success/failure when it has a verified candidate.
- `INFEASIBLE` requires proof.
- No stale or unverified candidate appears usable.

### E — Responsiveness and Interruption

- Solver runs in a worker.
- Stop and stale-run protection work.
- Internet loss does not stop loaded local computation.
- Refresh restores only the incumbent, not fictional solver progress.

### F — Manual Worksheet Integration

- Starting a run does not erase manual values.
- Applying is explicit.
- Applied candidate uses the existing manual schema and Phase 3 calculation path.
- A manually entered below-300 settlement preserves the actual reset trace, is not counted as usable commission, and receives a plain blocking warning.

### G — Scale and Delivery

- Tiny exact oracle tests pass.
- 1/10/20/50-member metrics are recorded.
- Existing quality thresholds remain intact.
- Production worker assets resolve under `/ngplan/`.

## 13. Major Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Search space grows combinatorially | Long or nonterminating runs | Constructive incumbent, exact bounds, solver spike, 30-minute default, 3-hour explicit mode |
| Browser solver cannot handle 50 members | Product unusable or tab crashes | Mandatory WP2 gate; stop and choose server-job architecture rather than shipping |
| Solver model differs from Phase 1 | Apparently optimal but wrong plan | Independent candidate verification plus tiny exhaustive equivalence tests |
| Weighted objective changes priority | Extra PV purchased for readability/commission days | Sequential lexicographic stages; one comparator; dominance tests |
| “Best found” shown as “minimum” | Operator overtrusts unproven plan | Explicit `OPTIMAL` versus `TIME_LIMIT` copy and state types |
| Daily reset/carry encoding is wrong | Secondary objectives or feasibility wrong | Exhaustive small cases and canonical daily-ledger trace comparison |
| Qualification PVP is confused with resettable daily PVP | Below-300 commission or wrong same-date eligibility | Separate non-resetting trace, same-date 33+267/266 boundaries, versioned engine tests |
| Product ignores a real below-300 settlement reset | Later balances diverge from the company | Preserve actual reset internally; reject automatic candidate and warn in manual mode |
| Big-M or objective overflows | Incorrect proof/candidate ordering | Constructive finite bounds, exact solver-range validation, checked sums |
| Target-700 maximization harms fairness | One member receives many days while another gets few | At-least-eight count and ascending-vector fairness before total days |
| 100-unit preference increases cost | Unnecessary purchases | Total PV fixed first; `OPT-004`/dominance tests |
| 100-unit preference blocks useful exact corrections | Qualification or ancestor timing becomes worse | Keep 1-PV integer variables and place roundness after all calculation objectives |
| PVP-100 preference becomes a hidden hard cap | Valid 67/200/300 placements are lost | Model exact integer PVP; test higher-objective dominance over Q-SIM-06 |
| PVP is concentrated into 200/300 despite an equivalent 100 split | Plan differs from the operator's normal workflow | Minimize non-100 PVP-cell count, then general irregular cells, then maximum direct PVP |
| Deep contribution score rewards useless surplus | Wrong tie choice | Treat shared contribution as primary-model efficiency, not uncapped lower objective |
| Descendant contribution is counted as new cost at every ancestor | Grossly inflated objective | Count direct cells once; derive and verify subtree propagation separately |
| UI freezes | Operator assumes app is broken | Web Worker, throttled progress, cancellation, responsiveness tests |
| Refresh loses hours of work | Poor confidence | Periodic verified-incumbent checkpoint and warm start; honest proof restart |
| Internet disconnect in Brazil | Remote job/result lost | Phase 4 computes locally after load; server jobs deferred unless benchmarks require them |
| Laptop sleeps or browser suspends | Local worker stops | Plain warning for extended mode; preserve latest incumbent; no promise of background execution |
| Solver dependency is abandoned/large/incompatible | Maintenance and deployment risk | WP2 license/maintenance/bundle/CSP gate and adapter isolation |
| Automatic candidate overwrites manual work | Data loss | Preview-first flow and explicit replacement confirmation |
| Phase 4 quietly becomes Phase 6 | Uncontrolled auth/storage architecture | Current-tab checkpoint only; explicit exclusions and review checkpoint |

## 14. Definition of Done

Phase 4 is complete only when:

- The mandatory source documents and current contracts were read in full before implementation.
- Q-SIM-01 through Q-SIM-06 are synchronized into authoritative documents and calculation cases are finalized.
- A new ruleset version identifies the qualification-aware calculation semantics.
- One exact objective comparator is used everywhere.
- The optimizer produces canonical integer allocation matrices for valid setup bundles.
- Every shown candidate is independently verified by the updated qualification-aware Phase 1 engine.
- All members' personal PVP and assessed left/right targets are hard constraints.
- Opening PVP plus inclusive cumulative direct PVP controls a non-resetting 300 qualification gate, and no automatic candidate commissions below it.
- Same-date threshold crossing, one-sided pre-qualification carry, manual below-300 reset/warning, and already-qualified opening cases pass.
- The descendant `100 + 300 + 300 = 700` case propagates 700 upward while direct PV is counted once.
- Minimum total new PV is proven on the exhaustive and canonical small cases.
- Discarded excess, target-700 commission days, PVP-value-100 preference, general 100-PV-multiple preference, maximum direct PVP, and deterministic tie-break obey strict priority.
- `OPTIMAL`, `TIME_LIMIT`, `CANCELLED`, `INFEASIBLE`, and `FAILED` remain semantically distinct.
- A useful candidate may be used before proof, without being mislabeled.
- Optimization runs outside the UI thread and can be cancelled.
- The latest verified incumbent survives same-tab refresh when the request still matches.
- The operator can preview and explicitly apply a result to the existing manual worksheet.
- Existing manual values are never overwritten implicitly.
- 1-, 10-, 20-, and 50-member benchmark evidence is recorded.
- Browser feasibility passes WP2 or the phase stops for an explicit server architecture decision.
- All Phase 1–4 tests, coverage gates, typecheck, build, and `/ngplan/` smoke checks pass.
- Real-browser standard-run, cancellation, apply, offline-continuation, and checkpoint cases are recorded.
- The Korean development log records decisions, measurements, failures, limitations, and deferred Phase 5/6 work.

After Phase 4, Phase 5 may treat an applied automatic plan as the draft basis for confirmation, actual-value entry, fixed historical boundaries, and minimum-change future resimulation. Phase 6 may add Supabase authentication, authorized-user storage, durable long-running jobs if benchmarks require them, closed records, and export. Phase 4 must leave those contracts unclaimed.
