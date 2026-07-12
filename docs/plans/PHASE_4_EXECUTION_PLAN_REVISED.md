# Phase 4 Execution Plan — Automatic Plan Optimization

Date: 2026-07-12  
Status: Implementation-ready after operator revision; synchronize the revised Q-SIM-01 through Q-SIM-06 contracts and the additional proof/calendar/state safeguards in PRE-WP0

This document turns **Phase 4 — Automatic Plan Optimization** from `ROADMAP.md` into an implementation-ready plan. It first extends the deterministic calculation engine with the confirmed current PVP qualification and smaller-side application rules, then builds optimization on that tested engine and the completed manual worksheet without creating a second source of truth for business calculations.

This English document is the canonical Phase 4 execution plan. Product labels remain Korean and must use plain operator-facing language. Optimization, solver, and proof terminology may remain technical in code and engineering documentation but must be translated in the UI.

## 0. Mandatory Reading and Authority Rules

Before changing production code, the implementing Codex agent must:

1. Read this execution plan completely.
2. Read every source-of-truth document below completely. Do not rely on summaries, excerpts, prior chat context, or another agent's interpretation.
3. Inspect the current public contracts and tests listed below before designing optimizer types.
4. Re-check whether a later operator message overrides any revised Q-SIM-01 through Q-SIM-06 decision.
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

If this plan conflicts with a finalized calculation case or the tested Phase 1 engine, the engine is not to be patched for optimizer convenience. Reconcile the authoritative documents and add or update the exact calculation case first.

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

Phase 4 creates an automatic half-month plan from one validated `ProjectSetupBundle`. It assigns direct PVP and editable `SELF` left/right PV so that every member meets the required half-month targets while one exact lexicographic objective order is optimized.

The optimizer is not a replacement for Phase 1. It proposes a complete allocation matrix. WP1 first versions and tests the qualification-aware Phase 1 `calculatePlan` contract; that contract then independently normalizes, validates, and recalculates every candidate before the candidate may be shown or applied.

The automatic result is a preview, not a persisted revision:

1. the operator requests an automatic plan from the active setup bundle;
2. the optimizer reports progress and publishes each improved, independently verified candidate;
3. the operator may keep the run active, stop it, or pin and use a specific verified candidate;
4. applying the pinned candidate replaces the current manual worksheet draft only after explicit confirmation when manual entries exist;
5. applying a candidate ends the active run and releases the worker;
6. the operator may inspect and edit the applied values in the existing Phase 3 worksheet.

## 2. Success Criteria

Phase 4 is successful when all of the following are true:

- A valid Phase 2 bundle can start automatic planning without requiring a pre-filled manual plan.
- The optimizer can handle organizations up to 50 active members functionally.
- Every produced candidate contains exactly the canonical editable fields for every canonical member/date pair, with no duplicates, unknown identities, or missing coordinates.
- Business dates are canonical date-only values; Sunday classification never depends on the browser, device, UTC offset, or current locale.
- Every Sunday allocation is zero.
- Every candidate shown to the operator has passed the updated, independently tested Phase 1 calculation engine.
- Every member's selected half-month PVP target is met or exceeded, and both assessed side targets are at least 2,500.
- A member may not trigger any planned commission before cumulative qualification PVP reaches 300; PVP added on the same date counts before that date's gate is checked.
- Qualification PVP, resettable daily PVP balance, and half-month assessed opening PVP are separate semantic ledgers, even when the current setup happens to initialize them with the same number.
- Total direct new PV is the first optimization objective and is never worsened for any lower objective.
- Daily discarded excess uses the approved Phase 4 metric and is minimized only after total PV is fixed.
- For target-700 members, the confirmed 8-day threshold and ascending-vector fairness rules are applied exactly; no extra PV may be added merely to increase days.
- A 1-PV-exact plan beats a rounded plan whenever rounding increases total PV or worsens any higher objective.
- Exact PVP value 100 is **not** an independent optimization preference. PVP 100 is selected only when its actual placement improves or ties the higher business objectives and later general readability/concentration rules choose it.
- When all business objectives tie, plans with fewer non-zero direct values outside 100-PV multiples are preferred, followed by a smaller maximum direct PVP cell.
- The canonical tie-break uses stable business dates and stable Phase 2 member identity/order, never the current UI render order.
- A proven optimum for the same normalized problem, ruleset, objective version, and canonical order is byte-for-byte deterministic.
- A wall-clock-limited or cancelled run always returns only verified candidates but is not promised to return the same incumbent on every execution.
- The product distinguishes a proven optimum from a verified but unproven best candidate.
- `OPTIMAL` and `INFEASIBLE` are available only after model soundness, completeness, objective preservation, exact arithmetic, and solver proof requirements are satisfied.
- The only product run limit is 30 minutes. No 3-hour run mode, hidden extension, or background-computation promise is part of Phase 4.
- A verified feasible candidate should preferably appear within 5 minutes on the approved 50-member benchmark; the 30-minute limit is the end of the search, not the intended first-result time.
- The UI remains responsive while optimization runs on a typical office laptop.
- Loss of internet after the static app, worker, solver module, and any WASM assets are fully loaded does not stop browser-local computation.
- Refresh, cancellation, deadline, storage-quota failure, and worker failure never corrupt the setup or current manual draft.
- A preview remains bound to the exact candidate the operator saw, even if a newer candidate arrives before apply.
- Phase 1–3 behavior and quality gates remain intact.

## 3. Approved Phase 4 Decisions

### 3.1 Scale and Time Policy — Revised Q-SIM-01

| Item | Phase 4 policy |
|---|---|
| Functional maximum | 50 active members across a full 13–16 date half-month |
| Product run limit | One fixed maximum of 30 minutes |
| Longer product mode | None; no 3-hour UI, policy type, warning flow, or checkpoint compatibility branch |
| Optimization goal | Seek a mathematically proven lexicographic optimum within the fixed run |
| Time-limit behavior | Return the best independently verified candidate found so far and label it as unproven |
| No candidate at time limit | Return `TIME_LIMIT` with no plan and an actionable explanation |
| Useful candidate | Canonical shape, all hard constraints met, Phase 1 success, no below-300 automatic commission, and objective values independently recomputed |
| First useful candidate target | Preferably within 5 minutes for the 50-member benchmark; measure before treating this as a release promise |

The system must not make the operator stare at an empty screen while proof continues. It publishes improved verified incumbents as they are found. `OPTIMAL` is reserved for a complete proof; a good candidate is not renamed “optimal” merely because the 30-minute budget ended.

The 30-minute value is a product maximum, not a statement that the operator normally waits 30 minutes before seeing anything. If the selected browser-local design cannot produce a useful verified candidate early enough on an ordinary office laptop, WP2 stops the browser implementation for architecture review. A longer spinner is not an accepted workaround.

A developer may perform an ad hoc local experiment by changing a benchmark invocation, but no longer duration is represented in production types, UI, persistence compatibility, or acceptance criteria.

### 3.2 Local Execution, Device Limits, and Checkpoint Scope

Phase 4 starts with browser-local optimization in a dedicated Web Worker.

- The worker keeps CPU-heavy work off the React/UI thread.
- Internet loss does not interrupt a run only after the app shell, worker chunk, solver JavaScript, and any WASM/data assets have all loaded successfully.
- Refresh, tab closure, browser suspension, device sleep, process termination, thermal throttling, or memory pressure can interrupt the worker.
- Phase 4 does not promise operating-system background execution.
- The main thread checkpoints only the latest verified incumbent and minimal compatibility metadata to the existing versioned `sessionStorage` workspace.
- A checkpoint is not a complete solver-state snapshot. After refresh, it may warm-start a new 30-minute run from the incumbent, but proof/search frontier state restarts unless a future solver explicitly supports and verifies full frontier restoration.
- Checkpoint serialization or quota failure disables checkpointing for that run but does not invalidate the run, candidate, setup, or manual draft.
- Do not introduce Supabase, authentication, permanent server jobs, cross-device recovery, or remote background execution in Phase 4.

WP2 contains a mandatory performance/feasibility gate. If a 50-member case cannot produce a useful verified candidate within the approved workflow, or the selected exact solver cannot run safely in the target browser/laptop class, stop before product integration and write a server-job architecture decision. Do not hide a failing browser design behind a longer run mode.

### 3.3 Qualification and Opening-PVP Ledger Semantics — Q-SIM-05

The current planning rule uses three explicit semantic values:

```text
qualificationPvp(member, date) =
  openingQualificationPvp(member)
  + sum(direct new PVP allocated to that member through date, inclusive)

openingDailyPvpBalance(member) =
  the resettable PVP ledger balance entering the first plan date

fortnightAssessedPvp(member) =
  openingFortnightPvp(member)
  + sum(direct new PVP allocated to that member across the half-month)
```

- `qualificationPvp` is cumulative and does not reset when the daily PVP/left/right ledger settles.
- `openingDailyPvpBalance` participates only in the authoritative daily carry/reset calculation.
- `fortnightAssessedPvp` must be greater than or equal to the member's selected PVP target.
- The normalized automatic-plan request must carry all three semantic opening values.
- If the current Phase 2 contract stores one `openingPvp` number and the authoritative business rule guarantees that all three meanings are equal at a half-month boundary, request normalization may copy that one value into all three fields. That equality must be documented and tested; code must not rely on the field name alone.
- If the three meanings can differ, the domain/setup contract must be extended before optimizer implementation rather than silently reusing one value.
- If `qualificationPvp < 300`, the automatic plan must not trigger a commission event for that member on that date.
- PVP allocated on the date is included before eligibility is checked. A member starting at 33 who receives 267 that date reaches 300 and may receive a full commission that same date.
- A member whose `openingQualificationPvp` is already at least 300 is eligible from the first active date.
- “Do not create left/right sales” means “do not allow both assessed daily sides to reach a commission tier while the member is below 300.” One-sided performance and carry are allowed when they do not trigger a commission.
- The company may technically settle a reduced 30% payment below 300, but the product does not optimize, recommend, or count that as a usable commission. Automatic candidates containing such an event are invalid.
- The calculation engine must still preserve the company's actual reset/carry consequence for a manually entered below-300 settlement and expose a blocking planning warning. It must not pretend that balances survived merely because the product rejects the reduced payment.

This is a hard feasibility rule, not a soft objective that can be traded for lower PV, more days, or rounder numbers. If opening balances would force a first-date settlement while qualification PVP is below 300, the optimizer must allocate enough same-date PVP to qualify or prove the request infeasible.

Only the current rule—PVP applies to the smaller side according to the authoritative daily and half-month engines—is normative for Phase 4. Earlier historical rules are not modeled, selected by date, or exposed as an optimizer option.

### 3.4 Hard Constraints and Explicit Capacity Assumptions

The optimizer must enforce:

1. `fortnightAssessedPvp(member) >= selectedPvpTarget(member)` for every member;
2. every member's assessed left and right half-month values are each at least 2,500;
3. zero new allocation on every `SKIP_NO_INPUT` date, including every canonical Sunday;
4. no direct value for a connected `CHILD` direction;
5. non-negative exact integer PV in 1-PV units, rejecting decimals, `NaN`, infinities, unsafe integers, overflow, and negative zero at the boundary;
6. canonical organization propagation, daily ledger, carry, reset, PVP-side application, tie-left behavior, tier selection, and half-month rules from Phase 1;
7. the section 3.3 qualification gate for every member/date;
8. exact safe-integer/range bounds for every model value and objective total;
9. exactly one canonical allocation coordinate per date/member/field, with no unknown member/date IDs or duplicates;
10. the canonical Phase 2 topology and member activity semantics, including any structural node that Phase 1 uses for propagation;
11. period-end carry behavior exactly as Phase 1 records it.

Phase 4 assumes no additional daily, member-level, or per-cell allocation capacity beyond the validated safe-integer bounds and existing authoritative rules. If a real operational maximum exists, it must be added as a hard business constraint and calculation case before implementation; it must not be invented as a solver shortcut or UI preference.

Phase 4 has no per-cell locks, confirmed plan, actual values, fixed past boundary, or cross-period rotation fairness. Those belong to later phases or a separately approved rule change.

### 3.5 Lexicographic Objective Order

Objectives are solved sequentially. A lower objective may be optimized only while every higher objective remains fixed at its already-proven best value.

1. **Minimize total direct new PV.** Count each direct PVP and each editable `SELF` left/right allocation exactly once. Never count propagated organization totals again.
2. **Minimize total daily discarded excess.** Sum the metric in section 3.6 across valid full-commission days and members.
3. **Improve target-700 commission-day distribution.** Use the exact two-part fairness order in section 3.7. Only qualification-valid full commission days count.
4. **Prefer communication-friendly 100-PV multiples.** Minimize the number of non-zero direct editable cells whose value is not divisible by 100.
5. **Avoid unnecessary direct-PVP concentration.** Minimize the maximum direct PVP cell after objectives 1–4 are fixed.
6. **Choose one deterministic complete tie-break plan.** Use section 3.8.

Do not combine these objectives into one floating-point weighted sum. Exact sequential optimization or an exactly equivalent lexicographic solver contract is required.

There is no objective that rewards an exact PVP value of 100, maximizes the number of PVP-100 cells, or declares `100 + 100` inherently better than `200`. A PVP 100 entry may still be selected because it is the true missing amount, helps personal PVP/qualification, creates useful propagated organization value, avoids discarded excess, preserves 100-multiple readability, or reduces the maximum PVP cell. Those are actual modeled consequences, not a historical habit encoded as a universal preference.

Shared descendant contribution remains primarily a search/modeling principle for objective 1, not a separate reward after all targets are met. A deeper allocation that satisfies its owner and several ancestors should win when it lowers total required PV. Direct cost is counted once at the entered cell; propagation derives its effects at ancestors.

The optimizer must compare the placement of PVP 100 globally. For example:

```text
Plan A:
  child PVP 100, left 300, right 300
  child subtree total 700 reaches the parent's side

Plan B:
  child PVP 0, left 300, right 300  -> subtree total 600
  parent direct PVP 100 applies to the parent's smaller 600 side -> 700
```

When both plans use the same total direct PV and produce the same required commissions/targets, but Plan A erases 100 as child-level discarded excess and Plan B erases 0, Plan B must win at objective 2. Conversely, if the child itself needs that PVP 100 for its selected target or qualification and child placement reduces total PV, Plan A may win at objective 1. The model must calculate the whole tree rather than fixing PVP 100 at a customary location.

### 3.6 Discarded Excess — Q-SIM-02

For a qualification-valid full commission day:

```text
discardedExcessPv =
  preSettlement.pvp
  + preSettlement.left
  + preSettlement.right
  - 2 × commissionTier
```

For a non-commission or skipped day, discarded excess is zero.

This counts only PV above the minimum amount required for the achieved commission tier that the authoritative daily settlement actually erases. The PV required to earn that commission is not treated as waste. All arithmetic must use checked integer operations.

The confirmed example is `PVP 500 / left 0 / right 300`: PVP applies to the smaller left side, the member earns the 300 tier, total pre-settlement PV is 800, required tier PV is 600, and discarded excess is 200. The optimizer should avoid that loss through placement, timing, or a higher tier when possible; if the global plan cannot avoid it, 200 is the accepted measured loss.

Qualification surplus is different. Opening qualification PVP 33 plus new PVP 300 creates qualification PVP 333, but the extra 33 is not discarded by a daily settlement: it remains part of the cumulative qualification trace and, according to the separate opening contract, may also remain in the half-month assessment.

Period-end carry is not automatically treated as discarded excess. It follows the Phase 1 closing semantics. If an authoritative rule actually expires or erases carry at the boundary, Phase 1 must expose that explicit event and PRE-WP0 must add a calculation case before the optimizer assigns it a cost. Phase 4 must not invent a terminal-carry penalty merely to make a plan look tidy.

### 3.7 Target-700 Commission Days — Q-SIM-03

Commission days never outrank total PV or discarded excess.

A counted day is defined exactly as:

```text
isTarget700CountedDay(member, date) =
  member.selectedPvpTarget === 700
  && settlement.kind === FULL_COMMISSION
  && qualificationPvp(member, date) >= 300
```

An official higher tier still counts as one day, not multiple days. A reduced below-300 settlement, skipped day, or non-commission day counts as zero.

Among candidates tied on objectives 1 and 2:

1. maximize the number of target-700 members reaching at least 8 counted commission days;
2. sort all target-700 members' counted-day totals in ascending order and lexicographically maximize that complete vector.

There is no third “maximize total target-700 commission days” objective. Once the complete sorted vector is equal, its sum is necessarily equal, so a separate sum stage cannot distinguish any candidates. `target700TotalCommissionDays` may remain as a derived preview/reporting statistic only; it is not part of the canonical comparator or proof stages.

There is no cap at 8. With all higher objectives tied, a vector containing 9 can beat the corresponding vector containing 8. The optimizer must never add PV merely to turn 8 into 9 or 6 into 8. Members with selected PVP targets 1,500 or 2,400 are not part of this objective.

The first threshold rule is intentionally stronger than general balance. For example, `[0, 8, 8]` beats `[7, 7, 7]` because two members reach the confirmed 8-day threshold while none do in the second plan. PRE-WP0 must lock this potentially surprising priority with an explicit calculation case rather than relying on the informal word “fairness.”

The sorted vector deliberately ignores which specific member receives an extra tied day. When identities are otherwise indistinguishable under all business objectives, section 3.8's canonical allocation tie-break chooses one plan. Cross-period rotation or historical “who got the extra day last time” fairness is out of Phase 4 scope.

### 3.8 Exact PV, 100-Multiple Readability, PVP Concentration, and Deterministic Tie-Break — Revised Q-SIM-04/Q-SIM-06

The readability and concentration preferences apply only after total PV, discarded excess, and the complete target-700 fairness objective are fixed.

```text
nonHundredCellCount = count(
  direct editable cells where value > 0 and value % 100 !== 0
)
```

Minimize `nonHundredCellCount`. This keeps easy-to-communicate 100-PV blocks when they are genuinely tied with exact alternatives, without making them legal-value restrictions.

Then minimize:

```text
maxDirectPvp = maximum direct PVP cell value,
               or 0 when every direct PVP cell is 0
```

This is a soft concentration guard, not a daily cap. It prevents a plan from choosing one unnecessarily huge PVP remainder when an otherwise identical lower-maximum placement exists. It does not assign special meaning to exact value 100 and does not override any higher objective.

A 39-PV plan still beats a 100-PV plan when it saves 61 total PV or improves any higher objective. PVP 67, 100, 200, 300, or another exact integer is allowed whenever the full calculation requires or prefers it. Real worksheets may therefore contain 1-PV or 10-PV corrections even though 100-PV multiples are easier to communicate.

For a complete tie, flatten direct editable cells in this stable order:

1. canonical business date ascending;
2. canonical Phase 2 member sequence derived from stable organization identity/topology, never current table sort or React render order;
3. field order `PVP`, `SELF_LEFT`, `SELF_RIGHT`;
4. at the first differing coordinate, prefer the plan with the larger value on the earlier coordinate.

The final rule selects exactly one earlier-action plan after every business objective ties. It must not be described as a cost, commission, fairness, or operational-quality improvement.

The complete allocation-vector tie-break is itself an exact objective stage. Merely configuring solver variable order is not proof that the selected solution is the lexicographic winner. The implementation must either solve each required coordinate exactly or provide an equivalent proven method.

### 3.9 Canonical Calendar, Sunday, Member Order, and Input Identity

Phase 4 operates on canonical business dates, not timestamps.

- A plan date is a validated ISO `YYYY-MM-DD` date-only value representing the business calendar date.
- Day-of-week is calculated from that date-only value using one shared calendar utility and the proleptic Gregorian calendar.
- The optimizer must never construct a plan date with browser-local `new Date(year, month, day)`, parse an unzoned timestamp, or determine Sunday from the device's current offset.
- If an upstream timestamp must be converted into a business date, that conversion occurs before Phase 4 under the authoritative business-time-zone rule. The normalized request records the resulting date set and a calendar/rules version in its fingerprint.
- The same normalized request must identify the same Sundays in Seoul, Brazil, UTC, daylight-saving transitions, and CI containers.
- `SKIP_NO_INPUT` and Sunday zero-allocation behavior are properties of the canonical date set, not dynamic properties of the computer clock.

Member order is also canonical input data:

- use stable Phase 2 member IDs and the documented canonical topology traversal/order;
- never use display name, current UI sorting, insertion order of an unnormalized object, or localized collation;
- include the canonical member sequence in the problem fingerprint and deterministic tie-break contract.

### 3.10 Model Correctness and Truthful Proof Claims

Phase 1 verification proves that one submitted candidate is valid. It does **not** prove that the optimizer represented every valid candidate or that no better candidate was omitted.

Before the product may emit `OPTIMAL` or `INFEASIBLE`, the selected model/backend must satisfy and document all three conditions:

1. **Soundness:** every model solution decoded as a candidate passes the same Phase 1 rules and hard constraints.
2. **Completeness:** every allocation permitted by the normalized Phase 1/domain rules and bounds is representable by the model; no valid class of plan is silently excluded by a shortcut, candidate generator, rounding domain, date omission, topology simplification, or fixed placement assumption.
3. **Objective preservation:** every canonical objective value and comparison computed in the model is exactly equal to the independently recomputed Phase 1/objective result for the decoded candidate.

The evidence package must include:

- a written mapping from each authoritative rule/objective to model variables and constraints;
- bounded exhaustive equality tests on tiny organizations, short date sets, and small PV domains;
- randomized seeded oracle comparisons;
- direct boundary cases for every tier, qualification threshold, reset, carry, Sunday, and objective;
- exact-integer range analysis;
- if MILP or another tolerance-based backend is used, documented integrality/feasibility/optimality tolerances and a proof that they cannot change any accepted integer result or objective comparison;
- a release-time model-certificate/version identifier tied to the ruleset and objective version.

Tiny exhaustive tests are required evidence but are not, by themselves, a mathematical proof for all 50-member inputs. They supplement the explicit soundness/completeness/objective-preservation design argument and review.

Constructive algorithms and heuristics may produce warm starts and verified incumbents. They may never claim `OPTIMAL` or `INFEASIBLE`. If the exact model is not certified or the exact solver proof is incomplete, the product may only present a verified unproven candidate.

`OPTIMAL` requires all objective stages—including vector stages and the deterministic allocation tie-break—to be proven. `INFEASIBLE` requires a complete certified proof that no valid candidate exists. “No candidate found yet,” solver failure, model-build failure, and deadline exhaustion are not infeasibility.

## 4. Phase Boundary

### 4.1 In Scope

- Automatic generation from one active immutable `ProjectSetupBundle`.
- A versioned Phase 1 engine extension for explicit opening-PVP ledgers, cumulative qualification, below-300 settlement detection, and full-commission counting.
- Canonical date-only calendar and Sunday normalization.
- Complete direct-allocation candidate matrices.
- Hard target constraints and exact lexicographic objectives.
- Constructive initial feasible candidate generation.
- Exact search/solver adapter, model certification, and truthful optimality states.
- Bounded tiny-case exhaustive oracle.
- Web Worker execution, progress, cancellation, the fixed 30-minute limit, and incumbent reporting.
- Current-tab verified-incumbent checkpoint and warm start.
- Candidate identity/sequence, pinned preview, and race-safe apply-to-manual-worksheet behavior.
- 1-, 10-, 20-, and 50-member performance measurements on documented hardware.
- Automated regression, coverage, production build, and browser verification.

### 4.2 Explicitly Out of Scope

- A 3-hour product mode, hidden extended mode, or supported arbitrary run duration.
- Background execution while the browser/device is suspended or closed.
- Historical pre-current-rule PVP calculation modes or date-switchable legacy rules.
- Confirmed plans, approval, immutable revisions, or version history.
- Actual values, completed-date locks, plan differences, or partial resimulation.
- Editing setup/topology/opening values while an optimizer run is active.
- Per-cell manual locks or “optimize around these cells.”
- Cross-period fairness rotation or use of prior periods to decide who receives extra tied commission days.
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
normalize business dates, opening ledgers, topology, member order
        |
        v
createAutomaticPlanRequest(bundle, policy)
        |
        +---- problemFingerprint
        v
Optimizer Web Worker
        |
        +---- progress / bounds / no candidate yet
        |
        +---- incumbent(runId, candidateSequence, raw allocation)
        |               |
        |               v
        |       canonical shape + numeric validation
        |               |
        |               v
        |       qualification-aware calculatePlan(candidate)
        |               |
        |               +---- FAILURE ---> reject raw vector / internal model error
        |               |
        |               +---- below-300 automatic settlement ---> reject candidate
        |               |
        |               v
        |       canonical objective recomputation
        |               |
        |               +---- mismatch ---> model-consistency failure
        |               |
        |               v
        |       VerifiedAutomaticPlanCandidate
        |       (candidateId + sequence + fingerprint)
        |               |
        |               +---- minimal checkpoint
        |               +---- latest-incumbent UI notification
        |
        +---- OPTIMAL / TIME_LIMIT / CANCELLED / INFEASIBLE / FAILED

Operator opens preview
        |
        v
pin exact candidateId/sequence snapshot
        |
        +---- newer candidate arrives ---> show notice; pinned preview does not mutate
        |
        +---- operator declines ---> existing manual draft unchanged
        |
        v
explicit apply pinned candidate
        |
        +---- re-check fingerprint and verified snapshot
        +---- cancel/terminate active worker
        v
atomic conversion to ManualPlanDraft strings
        |
        v
existing Phase 3 worksheet and results
```

The solver/model may use redundant derived variables for performance, but those values are never authoritative. Only a candidate that passes canonical input validation, the qualification-aware `calculatePlan`, the no-below-300 automatic rule, all hard targets, and objective re-evaluation may cross the application boundary.

A worker or model failure after a verified candidate was already published does not retroactively make that candidate invalid. The UI may retain and clearly label the last verified candidate as usable, while making no optimality claim and separately reporting that further calculation stopped with an error.

## 6. Application and Optimizer Contracts

### 6.1 Request, Fixed Product Deadline, and Fingerprint

Use explicit versioned types equivalent to:

```ts
const AUTOMATIC_PLAN_PRODUCT_TIME_LIMIT_MS = 1_800_000 as const;

interface AutomaticPlanPolicy {
  readonly policyVersion: '2.0.0';
  readonly objectiveVersion: '2.0.0';
  readonly deterministicSeed: number;
}

interface NormalizedAutomaticPlanCalendar {
  readonly calendarVersion: string;
  readonly dates: readonly BusinessDate[];
  readonly skipDateSet: ReadonlySet<BusinessDate>;
}

interface NormalizedOpeningPvpState {
  readonly openingQualificationPvp: number;
  readonly openingDailyPvpBalance: number;
  readonly openingFortnightPvp: number;
}

interface AutomaticPlanRequest {
  readonly bundle: ProjectSetupBundle;
  readonly rulesetVersion: RuleSetVersion;
  readonly policy: AutomaticPlanPolicy;
  readonly calendar: NormalizedAutomaticPlanCalendar;
  readonly canonicalMemberIds: readonly MemberId[];
  readonly openingPvpByMember: ReadonlyMap<MemberId, NormalizedOpeningPvpState>;
  readonly problemFingerprint: string;
  readonly warmStart?: readonly NormalizedAllocationCell[];
}
```

Product code always uses `AUTOMATIC_PLAN_PRODUCT_TIME_LIMIT_MS`. The deadline is execution control, not a user-selected business policy, and is not duplicated as a mutable `runMode`/`timeLimitMs` pair.

Tests may inject a fake clock, deterministic work/node budget, or test-only short deadline through an internal solve-control interface. That interface must not broaden the product UI or persisted policy contract.

The `problemFingerprint` includes the normalized bundle/business inputs, ruleset version, objective version, calendar version/date set, canonical member sequence, and relevant schema versions. It excludes elapsed time, run ID, candidate sequence, warm start, and transient UI state. A warm start may change search speed but must not change the definition of the problem or the proven optimum.

PRE-WP0 must assign a new ruleset version for the qualification-aware/current-rule engine and a new objective version for the revised objective order. Do not continue to label changed semantics as the prior version.

### 6.2 Objective Vector and Display Metrics

```ts
interface AutomaticPlanObjectiveVector {
  readonly totalNewPv: number;
  readonly discardedExcessPv: number;
  readonly target700MembersAtLeastEight: number;
  readonly target700AscendingDayVector: readonly number[];
  readonly nonHundredCellCount: number;
  readonly maxDirectPvp: number;
  readonly deterministicAllocationVector: readonly number[];
}

interface AutomaticPlanDisplayMetrics {
  readonly target700TotalCommissionDays: number;
  readonly target700MemberDayCounts: readonly Target700MemberDayCount[];
  readonly terminalCarrySummary: TerminalCarrySummary;
}
```

`target700TotalCommissionDays` is display-only and must never be compared as an optimization stage.

Provide one pure canonical comparator. Every solver objective transition, incumbent update, UI ordering decision, tiny oracle, checkpoint validation, and test must use or validate against that comparator rather than reimplementing objective order.

The comparator must have property tests for antisymmetry, transitivity, equality consistency, totality over valid vectors, empty target-700 vectors, and exact behavior at every stage.

### 6.3 Candidate Identity, Proof Progress, and Discriminated Run States

Use discriminated unions so contradictory states are not representable:

```ts
type AutomaticPlanObjectiveStage =
  | 'TOTAL_NEW_PV'
  | 'DISCARDED_EXCESS'
  | 'TARGET_700_AT_LEAST_EIGHT'
  | 'TARGET_700_ASCENDING_VECTOR'
  | 'NON_HUNDRED_CELLS'
  | 'MAX_DIRECT_PVP'
  | 'DETERMINISTIC_ALLOCATION_VECTOR'
  | 'COMPLETE';

interface AutomaticPlanProofProgress {
  readonly stage: AutomaticPlanObjectiveStage;
  readonly provenScalarObjectiveCount: number;
  readonly provenVectorPrefix:
    | {
        readonly objective:
          | 'TARGET_700_ASCENDING_VECTOR'
          | 'DETERMINISTIC_ALLOCATION_VECTOR';
        readonly length: number;
      }
    | null;
  readonly primaryLowerBound: number | null;
}

interface VerifiedAutomaticPlanCandidate {
  readonly candidateId: string;
  readonly sequence: number;
  readonly problemFingerprint: string;
  readonly allocations: readonly NormalizedAllocationCell[];
  readonly calculation: CalculationResult;
  readonly objective: AutomaticPlanObjectiveVector;
  readonly display: AutomaticPlanDisplayMetrics;
  readonly foundAtElapsedMs: number;
}

type AutomaticPlanRunState =
  | {
      readonly status: 'RUNNING';
      readonly elapsedMs: number;
      readonly bestCandidate: VerifiedAutomaticPlanCandidate | null;
      readonly proof: AutomaticPlanProofProgress;
      readonly messageCode: string;
    }
  | {
      readonly status: 'OPTIMAL';
      readonly elapsedMs: number;
      readonly bestCandidate: VerifiedAutomaticPlanCandidate;
      readonly proof: AutomaticPlanProofProgress & { readonly stage: 'COMPLETE' };
      readonly modelCertificateId: string;
      readonly messageCode: string;
    }
  | {
      readonly status: 'TIME_LIMIT' | 'CANCELLED';
      readonly elapsedMs: number;
      readonly bestCandidate: VerifiedAutomaticPlanCandidate | null;
      readonly proof: AutomaticPlanProofProgress;
      readonly messageCode: string;
    }
  | {
      readonly status: 'INFEASIBLE';
      readonly elapsedMs: number;
      readonly bestCandidate: null;
      readonly proof: AutomaticPlanProofProgress & { readonly stage: 'COMPLETE' };
      readonly modelCertificateId: string;
      readonly messageCode: string;
    }
  | {
      readonly status: 'FAILED';
      readonly elapsedMs: number;
      readonly bestCandidate: VerifiedAutomaticPlanCandidate | null;
      readonly proof: AutomaticPlanProofProgress;
      readonly error: SafeAutomaticPlanError;
      readonly messageCode: string;
    };
```

`TIME_LIMIT`, `CANCELLED`, and `FAILED` may retain a previously verified candidate. No unverified solver vector may appear usable. `INFEASIBLE` requires a certified proof and can never contain a candidate.

A vector objective may require many internal proof steps. A single unconstrained `completedObjectiveStage: number` is insufficient; progress must identify the current stage and any proven vector prefix without pretending the entire stage is complete.

### 6.4 Candidate Shape and Independent Verification

- Candidate allocations contain exactly one cell per canonical date/member.
- PVP always exists.
- Every editable `SELF` direction exists, including zero.
- Connected `CHILD` directions are structurally absent.
- Unknown members/dates/fields, duplicate coordinates, missing coordinates, unexpected ordering, or schema-version mismatch are rejected before Phase 1.
- Sunday and every other `SKIP_NO_INPUT` date contain only zero direct values.
- Candidate PV is canonical safe non-negative integer data; reject decimal values, strings at the optimizer boundary, `NaN`, infinity, unsafe integers, overflow, and negative zero.
- `calculatePlan` must succeed under the exact request ruleset/calendar/opening state.
- Every date/member qualification trace must equal `openingQualificationPvp` plus inclusive cumulative direct new PVP.
- No candidate may contain an automatic commission-triggering settlement while that trace is below 300.
- Every final `FortnightAssessment.allTargetsMet` must be true, including `fortnightAssessedPvp >= selectedPvpTarget` and both 2,500 side targets.
- Count target-700 days only with the exact section 3.7 predicate.
- Recompute objective and display values from the canonical candidate and Phase 1 result; never trust solver-reported values without exact comparison.
- Reject and record an internal model-consistency failure if solver and verifier disagree.
- A restored checkpoint candidate is re-run through the current verifier before it is shown, used as a warm start, or applied.
- Applying a candidate re-checks its `problemFingerprint`, `candidateId`, and immutable snapshot so a newer incumbent cannot silently replace the previewed plan.

### 6.5 Exact Arithmetic and Bounds

- Build a deterministic constructive feasible incumbent before exact search when possible.
- Use a verified incumbent's total PV as one finite upper bound for model variables and conditional constraints.
- Derive additional sound bounds from authoritative targets/topology; never use an arbitrary cap that can exclude a valid optimum.
- Use checked integer operations for derived bounds and objective totals.
- Verify the chosen solver's exact integer range before model creation.
- Return `OPTIMIZATION_SCORE_OUT_OF_RANGE` rather than rounding, saturating, or using unsafe floating-point objective weights.
- Solve objectives sequentially instead of encoding lexicographic order in a huge weighted sum.
- If the backend uses floating-point linear programming internally, prove that integer feasibility, bound comparison, and optimality certificates cannot be changed by configured tolerances.
- A reported zero gap is not accepted as an exact proof unless the adapter's documented certificate conditions are satisfied.

### 6.6 Solver Adapter and Determinism Contract

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

WP2 evaluates candidate implementations against the same model fixtures. Candidate categories may include browser-compatible CP-SAT/MILP WASM or a tailored deterministic branch-and-bound implementation. No dependency is approved merely by popularity; it must pass the bundle-size, worker, CSP, exact-integer, tolerance, cancellation, licensing, maintenance, and 50-member feasibility gates.

For a fully proven optimum, the canonical comparator and complete deterministic tie-break guarantee one selected plan, independent of search path. For `TIME_LIMIT`, `CANCELLED`, or `FAILED`, a fixed seed and stable search configuration improve repeatability but do not create a byte-for-byte guarantee under a wall-clock deadline.

Correctness tests use a deterministic work/node budget or fake clock where a repeatable stopping point is required. Product wall-clock results must not be tested with a false exact-repeatability promise.

### 6.7 Exact Model Semantics and Certification

The selected exact model must represent all of the following without excluding any valid allocation:

- exact integer direct variables for every non-skipped PVP and editable `SELF` coordinate;
- canonical business date/Sunday restrictions;
- canonical stable member identity/order and topology;
- linear organization propagation from descendants to every ancestor path used by Phase 1;
- separate opening qualification, daily PVP balance, and half-month PVP semantics;
- non-resetting cumulative personal qualification PVP from opening qualification PVP plus inclusive date-by-date direct PVP;
- same-date qualification before the commission-eligibility gate;
- prohibition of any automatic commission-triggering settlement while qualification PVP is below 300;
- `fortnightAssessedPvp >= selectedPvpTarget`;
- half-month smaller-side PVP application, including tie-left behavior;
- daily PVP smaller-side application;
- official tier selection and at-most-one commission per member/day;
- reset-to-zero on an authoritative settlement day and exact carry otherwise;
- Sunday/skip carry preservation;
- authoritative period-end carry behavior without an invented terminal penalty;
- exact target-700 counted-day predicate, 8-day threshold count, and complete ascending day vector;
- discarded excess from the achieved tier and actual erased values;
- general 100-PV-multiple readability metric;
- maximum direct PVP metric;
- exact sequential fixing of every scalar/vector objective and the complete deterministic allocation vector.

Any shortcut, decomposition, symmetry reduction, domain restriction, candidate template, or preselected PVP placement must have a completeness argument and bounded exhaustive evidence. Phase 1 verification catches invalid candidates but cannot prove that the optimizer omitted a better valid candidate.

A versioned `ModelCertificate` must bind the exact model implementation, ruleset version, objective version, solver adapter/version, integer/tolerance assumptions, and evidence suite. Production `OPTIMAL`/`INFEASIBLE` states are disabled if the certificate does not match the active request versions.

## 7. Worker, Cancellation, Candidate Pinning, and Current-Tab Continuity

### 7.1 Worker Protocol

Use a Vite module worker, not the React main thread. Messages must be versioned and structured-clone-safe:

- `START(runId, request)`
- `CANCEL(runId)`
- `PROGRESS(runId, elapsed, proofProgress)`
- `INCUMBENT(runId, candidateSequence, rawCandidate)`
- `COMPLETE(runId, outcome)`
- `ERROR(runId, safeError)`

Rules:

- Ignore every message from an older `runId`.
- For one run, ignore duplicate or decreasing `candidateSequence` values.
- Verify each raw incumbent on the application boundary before assigning a `candidateId` or exposing it.
- A cancellation request prevents any later raw candidate or terminal message from mutating the active UI state unless it is the acknowledged cancellation outcome for that run.
- Prefer cooperative cancellation at bounded solver checkpoints; terminating the worker is the final fallback.
- Applying a pinned candidate cancels and terminates the active run after the candidate snapshot is secured.

### 7.2 Checkpoint Policy

Checkpoint only:

- checkpoint schema version;
- problem fingerprint;
- ruleset/objective/calendar/model-certificate compatibility identifiers;
- verified candidate allocations;
- canonical objective/display summary;
- candidate ID/sequence and discovery elapsed time.

Do not persist a full mutable `CalculationResult` when it can be deterministically recomputed. Do not persist solver nodes/frontier unless a future explicitly reviewed solver-state format supports exact restoration.

Additional rules:

- Throttle writes; do not serialize on every solver node or candidate message.
- Restore only when the current normalized problem fingerprint and required versions match.
- Revalidate and recalculate the restored allocations before showing or warm-starting them.
- A setup edit invalidates the candidate and cancels the active run.
- A new project clears optimizer checkpoints with the existing manual/setup session.
- Refresh may offer a new 30-minute run warm-started from the restored candidate.
- A restarted run receives a fresh 30-minute product budget; the UI must describe it as a new run, not as resumed proof.
- Never claim that proof resumed unless the actual certified solver frontier/proof state was restored.
- `sessionStorage` quota, serialization, migration, or malformed-data failure is nonfatal: ignore/disable the checkpoint and keep the active run/manual data safe.

### 7.3 Interruption and Restart Semantics

- Internet disconnect after all required assets load: computation continues locally.
- Internet disconnect before a required worker/solver/WASM asset loads: starting or continuing the run may fail with an actionable asset-load message; do not claim offline readiness.
- User presses stop: preserve the latest verified candidate and return `CANCELLED`.
- Fixed 30-minute deadline: preserve the latest verified candidate and return `TIME_LIMIT` unless optimality is already proven.
- Browser refresh/crash/sleep/process suspension: computation may stop; restore and revalidate the latest checkpoint, then offer a new run.
- Tab closure: current `sessionStorage` data may disappear, matching the Phase 3 current-tab contract.
- `다시 계산` after stop, failure, or time limit starts a new 30-minute run and may use the verified candidate as a warm start. It is not a hidden extension of the previous deadline.
- Applying a pinned candidate ends the active calculation. There is no simultaneous “apply old candidate while continuing to optimize in the background” state in Phase 4.

## 8. UI and Interaction Contract

### 8.1 Entry, Candidate Identity, and Replacement Safety

- Add `자동 계획 만들기` to the ready setup/manual-plan flow.
- Automatic generation always uses the current active immutable normalized bundle.
- Existing manual values are not solver locks in Phase 4.
- Starting a run does not erase the current manual draft.
- Every preview is pinned to a specific verified `candidateId`/sequence and immutable allocation snapshot.
- If a newer verified candidate arrives while an older preview is open, show a plain notice such as `더 나은 새 계획을 찾았습니다`; do not mutate the open preview.
- The operator may deliberately switch the preview to the newer candidate.
- Applying a candidate to a modified manual draft requires a plain-language confirmation.
- Apply converts and replaces the draft atomically. Until success, preserve both the old manual draft and pinned candidate.
- Declining or closing the preview leaves every manual value unchanged.

### 8.2 Progress Panel

Show only operator-meaningful information:

- elapsed time and the fixed maximum of 30 minutes;
- current phase such as `사용 가능한 계획 찾는 중`, `더 적은 값을 찾는 중`, or `최소값인지 확인 중`;
- best total new PV when a verified candidate exists;
- `최소값 확인 완료` only for `OPTIMAL`;
- `현재까지 찾은 가장 좋은 검증 계획` for an unproven candidate;
- `현재 계획 사용` and `계산 중지` while running when a candidate exists;
- `다시 계산` only after a run ends, clearly starting a new 30-minute run;
- a nontechnical message when calculation stopped because the browser/device slept or the worker failed.

Do not expose `MIP gap`, branch nodes, incumbent, big-M, integrality tolerance, constraint, model certificate, or solver names in the normal UI.

### 8.3 Candidate Preview

Before applying, show:

- candidate discovery time and total run status;
- total new PV;
- whether the complete optimum is proven;
- total discarded excess;
- target-700 member day counts, members reaching at least 8, and display-only total days;
- count of non-zero direct cells outside 100-PV multiples;
- maximum direct PVP cell;
- terminal carry summary without labeling carry as waste unless Phase 1 records actual expiry;
- confirmation that every planned full commission occurs at qualification PVP 300 or above;
- all-member target status from Phase 1;
- a notice when a newer candidate exists than the pinned preview.

Do not show a count of PVP cells that are not exactly 100; exact PVP 100 is no longer an objective.

The preview may reuse the Phase 3 worksheet/result selectors in read-only form. Do not create a separate formula renderer.

### 8.4 Single Product Run

- The single primary action starts one run with a maximum of 30 minutes.
- No 3-hour or custom-duration control is shipped.
- If a verified result appears early, the operator may pin and use it immediately; applying it ends the run.
- The UI may advise keeping the tab open and preventing the laptop from sleeping, but it must not imply that internet is required after all assets load.
- At the deadline, show the best verified candidate found so far or explain that no usable candidate was found.
- A later `다시 계산` action is a fresh run with a fresh deadline and optional verified warm start.

## 9. Target File Structure

Exact filenames may change when a split would be trivial, but layer responsibilities must remain:

```text
src/optimizer/
  types.ts
  objective.ts
  discarded-excess.ts
  calendar-contract.ts
  candidate-verifier.ts
  constructive-candidate.ts
  model.ts
  model-certificate.ts
  solver.ts
  exhaustive-oracle.ts
  index.ts
  __tests__/

src/application/automatic-plan/
  types.ts
  create-request.ts
  fingerprint.ts
  run-automatic-plan.ts
  worker-protocol.ts
  candidate-identity.ts
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

- `src/domain/types.ts` and the versioned ruleset contract for explicit opening-PVP semantics, qualification status, business dates, and any stable calculation result required by both manual and automatic plans.
- `src/domain/period.ts` or the shared calendar module to expose date-only Sunday/skip behavior independent of device timezone.
- `src/engine/daily-ledger.ts`, `half-month-ledger.ts`, and/or a focused qualification module to calculate inclusive cumulative PVP, distinguish settlement from full-commission eligibility, and preserve actual reset/period-end behavior.
- `src/engine/index.ts` to publish the qualification-aware calculation contract used by manual and automatic plans.
- `src/application/project-setup/` if one current opening-PVP field cannot validly represent all three semantic openings.
- `src/application/manual-plan/` to convert a verified candidate to manual draft strings without duplicating schema rules.
- `src/ui/App.tsx` for run lifecycle, candidate pinning, and atomic application.
- `src/ui/workspace-session-storage.ts` for a versioned optional minimal incumbent checkpoint and migration/fallback.
- `src/ui/components/manual-plan/ManualPlanWorkspace.tsx` for automatic-plan entry/preview integration.
- `src/ui/styles.css` for progress and preview presentation.
- `package.json`, lockfile, Vite/worker configuration, and license notices only after WP2 approves a dependency.
- source documents and Korean development log as required by PRE-WP0 and delivery.

## 10. Work Packages

Complete work packages in order. A later package may begin only when the preceding package's exit gate passes.

### PRE-WP0 — Contract Synchronization

Tasks:

- Perform section 0 mandatory reading.
- Re-check that no later operator message overrides a revised decision.
- Record the revised Q-SIM-01 policy: one 30-minute product run, no 3-hour mode.
- Record the revised Q-SIM-06 policy: exact PVP value 100 is not an objective; retain only general 100-multiple readability and maximum-direct-PVP concentration rules after higher objectives.
- Remove all authoritative wording that says `PVP 100 + 100` inherently beats `PVP 200` or that maximizes exact-PVP-100 cells.
- Add the current-rule PVP-placement cases: child PVP 100 versus parent PVP 100 with equal total PV and different discarded excess; and the countercase where child PVP 100 reduces total PV because the child needs it.
- Add explicit opening qualification, daily PVP balance, and half-month PVP semantics. Document/test any invariant that initializes all three from one setup field.
- Add the PVP 300 qualification counter, inclusive same-date eligibility, automatic pre-qualification commission prohibition, and manual below-300 reset/warning semantics to `CALCULATION_CASES.md`.
- Assign new ruleset and objective versions and define migration/unsupported-version behavior.
- Define canonical date-only business calendar, Sunday/skip calculation, and stable member ordering. Remove any browser-time-zone-dependent path.
- Confirm/document authoritative period-end carry behavior and that Phase 4 adds no invented terminal penalty.
- Confirm the explicit “no extra daily/member capacity” assumption or add any real limit as a hard rule.
- Define the exact target-700 counted-day predicate.
- Remove the dead `target700TotalCommissionDays` comparator stage and retain the metric only for display.
- Add a calculation case proving the confirmed `[0, 8, 8]` versus `[7, 7, 7]` threshold priority.
- Convert `OPT-P01`, `OPT-005`, `OPT-P02`, `OPT-P03`, and `OPT-P05` from pending to one finalized expected result where still applicable.
- Reconcile `OPT-P04`: shared descendant contribution is enforced by minimum total PV/model structure, not rewarded as uncapped surplus.
- Write the soundness/completeness/objective-preservation model contract and the conditions for `OPTIMAL`/`INFEASIBLE`.
- Define problem fingerprint and model-certificate version inputs.
- Create/link a Phase 4 GitHub Issue.

Exit gate:

- No unresolved Phase 4 business rule remains.
- Every Phase 4 objective has one exact comparator and at least one calculation case.
- Qualification, opening ledgers, current PVP-side application, below-300 settlement, period-end carry, and date/Sunday behavior have exact versioned engine cases.
- Exact PVP 100 is absent as a standalone preference in every source document.
- The total-days fairness stage is absent from every comparator/proof contract.
- The model proof-claim contract is documented before solver selection.
- Source documents and this plan agree before production optimizer code.

### WP1 — Engine, Calendar, Objective Evaluator, Verifier, and Tiny Oracle

Tasks:

- Extend the Phase 1 engine/public result with explicit opening-PVP semantics and the non-resetting cumulative qualification-PVP trace.
- Apply same-date direct PVP before checking the 300 gate.
- Preserve actual daily reset/carry behavior for a manually entered below-300 settlement, while marking it unusable and warning-worthy.
- Expose authoritative period-end carry without inventing optimizer waste.
- Count only days matching the exact target-700 counted-day predicate.
- Implement canonical date-only parsing/validation and timezone-independent Sunday/skip classification.
- Bump and test the calculation ruleset version before optimizer integration.
- Define request, fingerprint, candidate, objective, display, proof, outcome, and error types.
- Implement candidate shape/numeric validation, including duplicate/missing/unknown/unsafe-value rejection.
- Implement Phase 1 independent verification and checkpoint re-verification.
- Implement discarded excess and the one canonical objective comparator.
- Implement `nonHundredCellCount`, `maxDirectPvp`, and the deterministic canonical allocation vector.
- Keep target-700 total days as display-only data.
- Implement a bounded exhaustive oracle for tiny organizations, short synthetic date sets, and small PV domains.
- Add comparator property tests, objective dominance, stable-order, and deterministic tie tests before integrating a solver.

Exit gate:

- Invalid candidates never become verified candidates.
- `calculatePlan` identifies every below-300 settlement deterministically and no automatic candidate containing one is verified.
- Starting qualification PVP 33 plus same-date PVP 267 qualifies that date; 266 does not.
- Date/Sunday results are identical under multiple process/browser time zones.
- The comparator reproduces every finalized Phase 4 case and contains no dead total-days or exact-PVP-100 stage.
- The exhaustive oracle returns a deterministic global optimum for bounded fixtures.

### WP2 — Constructive Candidate, Exact Model Contract, and Solver Feasibility Spike

Tasks:

- Build a deterministic constructive candidate that first avoids pre-qualification commissions, then prioritizes remaining personal PVP and bottom-up `SELF` side deficits.
- Verify the constructive result through Phase 1.
- Define the solver-neutral model/adapter and versioned model certificate.
- Write the explicit soundness, completeness, and objective-preservation mapping before accepting a backend.
- Spike candidate exact solver approaches in a Web Worker.
- Measure model build, first feasible candidate, improvement, proof, memory, bundle size, cancellation, repeated-run cleanup, and wall-clock variability on 1/10/20/50-member fixtures.
- Test on a documented typical office laptop as well as development hardware.
- Record dependency license, maintenance, browser/WASM/CSP compatibility, exact-integer/tolerance range, worker behavior, and single-thread/determinism configuration where relevant.
- Select one backend or stop with a server-job architecture decision if no browser backend is safe.

Exit gate:

- A useful verified candidate is produced reliably for all benchmark shapes.
- The chosen backend runs outside the UI thread and supports bounded cancellation/progress.
- Exact integer semantics and the model's soundness/completeness/objective preservation are credible, documented, and tested.
- Tiny solver outcomes exactly match exhaustive outcomes, including infeasible cases.
- The 50-member result supports proceeding with the fixed 30-minute product mode on the target laptop class; otherwise implementation pauses for explicit architecture review.
- No 3-hour fallback is used to pass the gate.

### WP3 — Primary Exact Optimization

Tasks:

- Implement exact integer direct variables and finite sound bounds.
- Implement canonical organization propagation and hard final target constraints.
- Implement separate opening ledgers, cumulative qualification PVP, and the no-commission-below-300 feasibility constraint.
- Implement canonical date/skip and connected-direction restrictions.
- Minimize total direct new PV.
- Use the constructive candidate as an incumbent/warm start where supported.
- Compare primary optima against the exhaustive oracle and canonical lower-bound cases.

Exit gate:

- Small fixtures exactly match exhaustive minimum total PV.
- All shown candidates satisfy every hard target through Phase 1.
- Every shown commission day is qualification-valid, including same-date threshold crossings.
- Shared descendant contribution reaches ancestors without counting direct cost more than once.
- No arbitrary capacity/domain restriction excludes an oracle solution.
- Higher commission tiers never motivate extra PV when total PV is the primary objective.
- A 39-PV exact improvement beats 100-PV rounding.

### WP4 — Daily Ledger Model and Secondary Objectives

Tasks:

- Encode or exactly search daily PVP application, qualification gate, carry, tiers, reset, Sunday skip, and period-end behavior.
- Preserve settlement/reset consequences in engine verification, but reject any automatic plan that triggers settlement below qualification PVP 300.
- Add discarded-excess minimization after fixing minimum total PV.
- Add the two-part target-700 fairness objective after fixing both higher objectives.
- Do not add a target-700 total-days objective stage.
- Add general non-100-multiple-cell minimization.
- Add maximum-direct-PVP minimization.
- Do not add exact-PVP-100-cell minimization.
- Add the complete deterministic allocation-vector tie-break using canonical member/date order.
- Solve stages sequentially and emit structured scalar/vector proof progress.
- Implement current-rule PVP placement cases that allow the 100 to move between descendant and ancestor according to the full result.

Exit gate:

- All finalized objective/calculation expectations pass.
- No lower objective worsens a higher objective.
- Exact 1- or 10-PV corrections remain available when they improve a higher objective.
- Child versus parent PVP 100 placement is chosen by total PV, discarded excess, target outcomes, and later general metrics—not a fixed exact-100 preference.
- The target-700 vector rule behaves exactly, including zero target-700 members and the `[0,8,8]` threshold case.
- A proven optimum returns byte-for-byte equivalent allocations/objective vectors for the same fingerprint.
- Time-limited wall-clock runs are verified but not falsely required to return the same incumbent.

### WP5 — Worker Lifecycle, Candidate Pinning, and Checkpointing

Tasks:

- Implement versioned worker messages, `runId`, monotonic candidate sequence, and stale/out-of-order protection.
- Implement progress throttling and incumbent verification on the application boundary.
- Assign immutable candidate IDs after verification.
- Implement cooperative cancellation and hard worker termination fallback.
- Pin preview snapshots and prevent a newer incumbent from mutating the open preview.
- Apply only the pinned candidate and end the active worker on successful apply.
- Extend the current workspace snapshot with an optional minimal verified-candidate checkpoint.
- Revalidate every restored checkpoint candidate.
- Restore/warm-start only against an exactly matching problem fingerprint/version set.
- Handle session storage quota/serialization failure as a nonfatal checkpoint-only failure.
- Cancel/invalidate on setup edits or new project.

Exit gate:

- The UI thread remains responsive during benchmark runs.
- Stop/time-limit/failure preserves the latest verified candidate where one exists.
- Refresh restores and revalidates the candidate without falsely restoring proof state.
- Malformed, stale, incompatible, or unverified checkpoints are ignored safely.
- An older preview remains byte-for-byte unchanged when a newer candidate arrives.
- Applying the older pinned preview applies exactly that candidate or fails safely; it never applies the newer one by accident.
- Late messages after cancel/apply cannot mutate the active state.

### WP6 — Product UI and Manual Worksheet Handoff

Tasks:

- Add one automatic-plan entry action with the fixed 30-minute maximum.
- Add progress, status, stop/use/restart actions, and plain Korean copy.
- Do not add a 3-hour, custom-duration, or hidden extended action.
- Add candidate-pinned preview backed by Phase 1 result selectors.
- Add the newer-candidate notice and deliberate preview-switch action.
- Add explicit replacement confirmation for a modified manual plan.
- Convert and apply a pinned candidate through the existing manual-plan schema.
- Preserve the candidate and prior manual draft until application succeeds.
- Show display-only total target-700 days, general non-100 count, and max PVP; do not show an exact-PVP-100 objective metric.

Exit gate:

- The operator can generate, inspect, stop, restart, apply, and then manually edit an automatic plan.
- No candidate overwrites manual work without confirmation.
- `OPTIMAL`, unproven best-plan, no-candidate deadline, and calculation-error wording are never confused.
- The preview/apply race is impossible by construction.
- Core flow works by keyboard and does not expose solver jargon.

### WP7 — Scale, Regression, Documentation, and Delivery

Tasks:

- Run the complete Phase 1–4 test and coverage suite.
- Run deterministic-work-budget correctness fixtures and real 30-minute wall-clock benchmarks for 1, 10, 20, and 50 members in production mode.
- Record first candidate, best candidate at 5 and 30 minutes, proof/time-limit, memory, CPU behavior, bundle size, UI responsiveness, and repeated-run cleanup.
- Exercise stop/use/restart, pinned-preview race, and failure-with-verified-candidate behavior in a real browser.
- Test date/Sunday behavior under multiple host time zones.
- Test offline continuation both after all assets load and before the solver/WASM asset has loaded.
- Test session-storage quota failure and checkpoint re-verification.
- Build and run `/ngplan/` smoke checks.
- Update authoritative documents where implementation finalized a contract.
- Update the Korean development log with decisions, failed solver spikes, measurements, laptop limitations, and deferred server/auth/storage work.

Exit gate:

- All quality gates pass without threshold reduction.
- A 50-member run produces a verified usable candidate within the approved 30-minute workflow on the documented target laptop class, or Phase 4 is explicitly blocked pending server architecture.
- No result depends on browser timezone or UI member sorting.
- No enabled or selectable 3-hour product behavior remains in code, tests, or UI.
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
| P4-REQ-001 | Valid normalized setup request | Immutable request with exact bundle/rules/objective/calendar/member order/fingerprint |
| P4-REQ-002 | Unsupported policy/rules/objective/calendar version | Stable failure before solving |
| P4-REQ-003 | Same business dates under Seoul, Brazil, and UTC host time zones | Identical canonical dates, Sundays, and fingerprint |
| P4-REQ-004 | Warm start differs but business request is identical | Same problem fingerprint; warm start excluded |
| P4-OPEN-001 | One authoritative opening value is guaranteed to initialize all three ledgers | Normalizer copies it explicitly and invariant test passes |
| P4-OPEN-002 | Three semantic opening values differ | Qualification, daily carry, and half-month assessment use the correct separate values |
| P4-SHAPE-001 | Full candidate matrix | One date/member cell; exact PVP/SELF/CHILD shape |
| P4-SHAPE-002 | Sunday/skip candidate | All direct values zero |
| P4-SHAPE-003 | Duplicate, missing, or unknown coordinate | Rejected before Phase 1 |
| P4-SHAPE-004 | Decimal, `NaN`, infinity, unsafe integer, overflow, or negative zero | Rejected deterministically |
| P4-VERIFY-001 | Solver claims invalid candidate | Candidate rejected by Phase 1 |
| P4-VERIFY-002 | Solver objective mismatch | Internal model-consistency failure; raw vector never usable |
| P4-VERIFY-003 | Restored checkpoint candidate | Recalculated and verified before preview/warm start |
| P4-VERIFY-004 | Worker fails after a verified candidate | `FAILED` retains only that verified candidate with no proof claim |
| P4-QUAL-001 | Opening qualification PVP 33 plus same-date PVP 267, then commission | Qualification is 300; full commission allowed that date |
| P4-QUAL-002 | Opening qualification PVP 33 plus same-date PVP 266, then commission | Candidate invalid because qualification is 299 |
| P4-QUAL-003 | Opening qualification PVP 33; PVP 100 with no commission, then PVP 200 with commission | Qualification trace is 133 then 333; second date allowed |
| P4-QUAL-004 | Qualification below 300 with one-sided performance only | Allowed when no commission tier is triggered; carry remains exact |
| P4-QUAL-005 | Manual draft triggers settlement below qualification 300 | Actual reset preserved, event not counted as usable commission, blocking warning emitted |
| P4-QUAL-006 | Opening qualification PVP already at least 300 | Eligible from first active date |
| P4-QUAL-007 | Daily opening PVP differs from qualification opening | Daily settlement uses daily opening; gate uses qualification opening |
| P4-TARGET-001 | Opening half-month PVP plus new direct PVP exactly reaches selected target | Hard target met |
| P4-TARGET-002 | Final assessed PVP is one below selected target | Candidate invalid |
| P4-CARRY-001 | Non-commission carry at final date | Follows Phase 1 closing result and is not automatically counted as discarded |
| P4-CARRY-002 | Authoritative rule explicitly erases boundary carry | Only the engine-exposed erasure is counted after a finalized calculation case |
| P4-OBJ-001 | Lower objective increases total PV | Lower-objective candidate loses |
| P4-OBJ-002 | Same total, lower discarded excess | Lower-excess candidate wins |
| P4-OBJ-003 | Same higher objectives, 8 versus 9 days | 9-day vector wins |
| P4-OBJ-004 | Extra PV creates more commission days | Lower-PV candidate wins |
| P4-OBJ-005 | Same higher objectives, direct cells 100/200 versus 50/250 | 100/200 wins because fewer cells are outside 100 multiples |
| P4-OBJ-006 | 39 versus 100 with different total PV | 39 wins |
| P4-OBJ-007 | Complete tie | Stable canonical earlier-coordinate plan wins |
| P4-OBJ-008 | One exact correction plus 100-block cells versus several irregular cells | Fewer non-100-multiple cells wins when all higher objectives tie |
| P4-OBJ-009 | Two PVP-100 cells versus one PVP-200 cell while another fixed PVP-300 cell makes `maxDirectPvp` equal in both plans | No exact-100 bonus; if all other metrics tie, only the deterministic tie-break decides |
| P4-OBJ-010 | PVP 200 or irregular exact value improves a higher objective over PVP 100 | Higher-objective plan wins |
| P4-OBJ-011 | Same preceding metrics: maximum direct PVP 200 versus 300 | Maximum-PVP-200 plan wins |
| P4-OBJ-012 | Child PVP 100 causes discarded 100; parent PVP 100 produces same targets with discarded 0 | Parent placement wins |
| P4-OBJ-013 | Child needs PVP 100 for its own target; parent placement requires another 100 | Child placement wins on lower total PV |
| P4-OBJ-014 | All hard targets already met by opening values | Zero-new-PV plan is optimal |
| P4-FAIR-001 | `[0,8,8]` versus `[7,7,7]` with all higher objectives tied | `[0,8,8]` wins by at-least-eight count |
| P4-FAIR-002 | Complete sorted day vectors are equal | Comparator ties; no separate total-days stage exists |
| P4-FAIR-003 | No target-700 members | Empty vector is valid and deterministic |
| P4-FAIR-004 | Target-700 member earns a higher full tier | Counts as one qualification-valid commission day |
| P4-COMP-001 | Comparator randomized valid vectors | Antisymmetry, transitivity, totality, equality consistency hold |
| P4-ORACLE-001 | Tiny bounded single member | Solver equals exhaustive optimum |
| P4-ORACLE-002 | Child/parent current-rule PVP placement fixture | Solver equals exhaustive global placement choice |
| P4-ORACLE-003 | Random seeded tiny fixtures | Solver equals oracle objective and deterministic optimal plan |
| P4-MODEL-001 | Model excludes one valid lower-PV allocation in a test double | Certification/equivalence test fails; no `OPTIMAL` allowed |
| P4-MODEL-002 | Model admits a Phase-1-invalid allocation | Soundness test fails; candidate rejected |
| P4-MODEL-003 | Model score differs from canonical comparator | Objective-preservation failure |
| P4-MODEL-004 | Constructive/heuristic search finishes without exact proof | Verified candidate only; never `OPTIMAL`/`INFEASIBLE` |
| P4-MODEL-005 | MILP/tolerance backend boundary fixture | Accepted integer/proof result is invariant under documented tolerances |
| P4-STATUS-001 | Certified proof completes | `OPTIMAL` with verified candidate and complete proof |
| P4-STATUS-002 | Deadline after candidate | `TIME_LIMIT` with verified unproven candidate |
| P4-STATUS-003 | Deadline before candidate | `TIME_LIMIT` without usable plan |
| P4-STATUS-004 | Cancel after candidate | `CANCELLED`; candidate retained |
| P4-STATUS-005 | Certified search exhaustion | `INFEASIBLE` only with complete proof and no candidate |
| P4-STATUS-006 | Same problem solved to `OPTIMAL` twice | Byte-for-byte identical candidate/objective |
| P4-STATUS-007 | Deterministic work-budget stop | Repeatable test incumbent/status |
| P4-STATUS-008 | Real wall-clock deadline repeated | Every returned candidate verified; byte equality is not asserted |
| P4-WORKER-001 | Progress under load | UI event loop remains responsive |
| P4-WORKER-002 | Stale run message | Ignored |
| P4-WORKER-003 | Duplicate/decreasing candidate sequence | Ignored |
| P4-WORKER-004 | Cooperative and hard cancellation | No later candidate mutates current run |
| P4-WORKER-005 | Repeated start/stop/terminate cycles | Worker/resources released; no unbounded memory growth |
| P4-PREVIEW-001 | Candidate A preview open, candidate B arrives | Preview remains A and shows newer-candidate notice |
| P4-PREVIEW-002 | Apply pinned A after B arrives | Exactly A is applied; active run ends |
| P4-PREVIEW-003 | Deliberately switch preview to B | B becomes the pinned immutable snapshot |
| P4-CHECKPOINT-001 | Verified incumbent | Minimal checkpoint stored and restored for exact fingerprint |
| P4-CHECKPOINT-002 | Bundle/rules/objective/calendar/member-order mismatch | Checkpoint discarded |
| P4-CHECKPOINT-003 | Storage quota or serialization failure | Run continues; checkpoint disabled; manual/setup safe |
| P4-CHECKPOINT-004 | Refresh and restart | Candidate restored/reverified; new 30-minute run; proof not claimed resumed |
| P4-APPLY-001 | Blank manual plan | Pinned candidate converts to exact draft strings |
| P4-APPLY-002 | Modified manual plan | Explicit confirmation required |
| P4-APPLY-003 | Decline replacement | Manual draft unchanged |
| P4-APPLY-004 | Conversion/application failure | Prior draft and pinned candidate preserved |
| P4-REG-001 | Apply then calculate manually | Phase 3 result equals candidate calculation |
| P4-SCALE-001 | 1/10/20/50 fixtures | Metrics emitted; no crash or unsafe integer |
| P4-ASSET-001 | Network disconnected after all assets load | Active local run continues |
| P4-ASSET-002 | Network disconnected before solver/WASM loads | Actionable load failure; no false offline claim |
| P4-PAGES-001 | Production build | Worker and `/ngplan/` assets resolve correctly |

### 11.3 Calculation-Case Traceability

Tests must use or explicitly cite canonical IDs after PRE-WP0 finalizes pending cases:

- calendar and target recommendation: existing canonical calendar/count cases plus new timezone-independent Sunday cases;
- minimum PV and shared descendant contribution: `OPT-P01`, `OPT-001`, `OPT-002` or their finalized replacements;
- cumulative PVP 300 qualification, same-date threshold crossing, separate opening ledgers, below-threshold settlement/reset, and full-commission counting: new finalized qualification/opening cases;
- current-rule PVP placement: new child-versus-parent PVP 100 cases with equal-cost/lower-waste and child-needs-PVP countercase;
- objective dominance: `OPT-003`, `OPT-004`, `OPT-005`, `OPT-006` after removing any exact-PVP-100 expectation;
- general 100-multiple readability, exact correction dominance, and maximum direct PVP: revised Q-SIM-04/Q-SIM-06 cases;
- target-700 threshold/vector fairness, discarded excess, and tie-break: finalized `OPT-P02`, `OPT-P03`, `OPT-P05` replacements as applicable;
- exact objective range: `OPT-P06`;
- model soundness/completeness/objective preservation: new model-certificate cases and oracle mappings.

Read the source cases themselves. Do not derive expected results from this plan alone.

### 11.4 Performance Harness

Provide deterministic fixture generation and a non-UI benchmark command. Record at least:

- member count and date count;
- canonical direct variable count and model size;
- model build time;
- first raw candidate and first verified candidate time;
- best objective at 5 minutes and 30 minutes when applicable;
- proof time or final certified bound/progress if exposed;
- peak memory and repeated-run memory behavior when measurable;
- CPU responsiveness/thermal observations on the documented office laptop;
- worker cancellation latency;
- production worker/solver/WASM bundle size;
- asset load completion state for offline tests;
- exact hardware, browser version, power mode, and operating-system conditions.

Standard CI must not contain tight wall-clock assertions that become flaky across machines. Correctness and deterministic stopping tests use injected work budgets/clocks. Real wall-clock performance results are recorded engineering evidence and later become Phase 7 support criteria.

There is no 3-hour benchmark requirement or product acceptance path. The key measurements are early verified-candidate time and behavior by the fixed 30-minute deadline.

### 11.5 Manual Browser Case — P4-PAGES-002

1. Run the production preview and open `/ngplan/`.
2. Create or restore a valid multi-level organization containing selected PVP targets 700, 1,500, and 2,400, including one member with opening qualification PVP 33.
3. Confirm the displayed business dates/Sundays match the canonical period when the host timezone is changed.
4. Start the single automatic-plan action and confirm the maximum shown is 30 minutes.
5. Confirm the page stays responsive and progress copy is understandable on a typical office laptop.
6. Confirm an early verified candidate can be previewed while proof continues.
7. Keep candidate A open, allow candidate B to arrive, and confirm A does not mutate.
8. Apply A once and confirm exactly A reaches the manual worksheet and the active run stops.
9. Restart, stop once, and confirm the latest verified candidate remains usable and is not called optimal.
10. Restart again and verify all member targets in the preview.
11. Confirm the opening-qualification-PVP-33 member has no commission before inclusive cumulative PVP reaches 300 and that a same-date crossing may commission normally.
12. Compare the current-rule child-versus-parent PVP 100 placement fixture and confirm the lower-total/lower-waste plan wins rather than a fixed customary location.
13. Manually create one below-300 settlement and confirm the reset remains accurate while a plain blocking warning appears and the event is not counted as a usable commission.
14. Edit one applied cell manually and confirm Phase 3 recalculates normally.
15. Start another automatic plan and decline replacement; confirm manual work remains.
16. Disconnect the network after the app, worker, solver, and WASM assets load and confirm the active local run continues.
17. Repeat with the network disconnected before solver/WASM loading and confirm an honest asset-load failure.
18. Refresh after a checkpoint and confirm the candidate is reverified/restored while proof restarts honestly under a new 30-minute run.
19. Simulate storage quota failure and confirm the run/manual draft remain usable.
20. Verify Korean copy at Windows 125% scaling and on a typical 15-inch office laptop.
21. Record observations and actual timings in the Korean development log.

## 12. Review Checkpoints

### A — Phase Boundary

- Automatic draft generation only; no confirmation/actual/resimulation/revision semantics.
- One fixed 30-minute product run; no 3-hour/custom/background mode.
- Current PVP rules only; no historical-mode selector.
- No Supabase/auth/server job/persistent project storage.
- No product or currency optimization.

### B — Authority, Calendar, and Verification

- The newly versioned qualification/current-rule Phase 1 engine is the only business-calculation authority.
- Qualification, daily PVP balance, and half-month assessed PVP openings are explicit semantic inputs.
- Canonical date-only Sunday/skip behavior is independent of host timezone.
- Solver-derived values never bypass independent verification.
- Candidate/objective disagreement is a hard internal error.
- Restored checkpoints are reverified.

### C — Objective Correctness

- Hard targets and the PVP 300 qualification gate are never softened.
- Total PV dominates every preference.
- Discarded excess dominates commission-day and readability/concentration preferences.
- More target-700 days never justify extra PV.
- Target-700 fairness has exactly two stages; total days are display-only.
- Exact 1-PV savings beat round-number readability.
- Exact PVP 100 has no standalone reward.
- Current-rule PVP 100 placement is chosen by the whole-tree calculation.
- General 100-PV-multiple preference is followed by maximum direct PVP.
- Tie-break is deterministic, uses stable business identity/order, and is not presented as business value.

### D — Model and Status Honesty

- Soundness, completeness, and objective preservation are documented and version-certified.
- Tiny oracle tests supplement rather than replace the model argument.
- `OPTIMAL` requires certified proof of every objective and tie-break stage.
- `TIME_LIMIT`, `CANCELLED`, and `FAILED` may retain only independently verified candidates.
- `INFEASIBLE` requires certified complete proof.
- A heuristic/constructive finish is never called optimal or infeasible.
- No stale or unverified candidate appears usable.

### E — Responsiveness, Interruption, and Determinism

- Solver runs in a worker.
- Stop and stale/out-of-order message protection work.
- Product wall-clock limit is 30 minutes.
- Proven optimum is byte-for-byte deterministic.
- Time-limited incumbents are verified but not falsely promised byte-for-byte repeatable.
- Internet loss does not stop a fully loaded local run.
- Sleep/suspension may stop computation and is described honestly.
- Refresh restores only a reverified incumbent, not fictional solver progress.

### F — Preview and Manual Worksheet Integration

- Starting a run does not erase manual values.
- Preview is pinned to an immutable candidate ID/snapshot.
- New incumbents do not mutate an open preview.
- Applying is explicit, atomic, and ends the active run.
- Applied candidate uses the existing manual schema and Phase 3 calculation path.
- A manually entered below-300 settlement preserves the actual reset trace, is not counted as usable commission, and receives a plain blocking warning.

### G — Scale and Delivery

- Tiny exact oracle and model-certificate tests pass.
- 1/10/20/50-member metrics are recorded on documented hardware.
- A typical office laptop is included in feasibility evidence.
- Existing quality thresholds remain intact.
- Production worker/solver assets resolve under `/ngplan/`.
- No 3-hour product mode or acceptance path remains.

## 13. Major Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Search space grows combinatorially | Long or nonterminating runs | Constructive incumbent, sound bounds, exact solver spike, fixed 30-minute limit, early verified-candidate reporting |
| Browser solver cannot handle 50 members or office-laptop resources | Product unusable, fan/thermal issues, tab crash | Mandatory WP2 target-laptop gate; stop for server-job architecture rather than adding a longer spinner |
| Solver model differs from Phase 1 | Apparently optimal but wrong plan | Independent candidate verification, explicit soundness/completeness/objective-preservation mapping, tiny exhaustive/oracle evidence |
| Model omits a better valid plan | False `OPTIMAL` or `INFEASIBLE` | Versioned model certificate; no proof status until completeness is established |
| MILP/tolerance behavior changes an integer decision | Incorrect feasibility, bound, or proof | Exact range/tolerance analysis and boundary tests; reject backend if certificate conditions cannot be met |
| Weighted objective changes priority | Extra PV purchased for readability/commission days | Sequential lexicographic stages; one comparator; dominance tests |
| Dead fairness stage remains in one implementation path | Inconsistent comparator/proof/UI | Remove total-days objective everywhere; retain only display metric; comparator property tests |
| 8-day threshold produces a surprising distribution | Operator expects generic balance | Explicit `[0,8,8]` versus `[7,7,7]` case and plain preview member-day summary |
| Exact PVP 100 historical habit becomes a universal rule | Wrong placement, excess waste, unnecessary splitting | Remove exact-100 objective; test child-versus-parent placement under current rules |
| PVP concentrates into one large remainder | Hard-to-use plan despite tied business outcome | Minimize maximum direct PVP only after general 100-multiple readability and all higher objectives |
| PVP concentration rule over-influences real business results | More PV or worse commissions for prettier cells | Place max PVP after total, waste, fairness, and roundness; dominance tests |
| Opening PVP meanings are conflated | Wrong qualification, daily settlement, or half-month target | Three semantic opening values; copy one field only under documented tested invariant |
| Daily reset/carry encoding is wrong | Secondary objectives or feasibility wrong | Exhaustive small cases and canonical daily-ledger trace comparison |
| Terminal carry is treated as waste without a rule | Optimizer distorts final-day allocations | Follow Phase 1 closing semantics; no invented terminal penalty |
| Product ignores a real below-300 settlement reset | Later balances diverge from company result | Preserve actual reset internally; reject automatic candidate and warn in manual mode |
| Business date parsed through host timezone | Sunday moves or allocations appear on a skipped date | ISO date-only contract, shared calendar utility, multi-timezone tests |
| UI member sort changes deterministic plan | Same business input yields different plan | Stable Phase 2 identity/topology order in fingerprint and tie-break |
| Wall-clock deadline is mistaken for deterministic work | Flaky tests and false repeatability promise | Deterministic work budget for correctness tests; limit byte guarantee to proven optimum |
| Candidate changes while preview/apply is open | Operator applies a plan different from the one reviewed | Candidate ID/sequence, immutable pinned preview, atomic apply, race tests |
| Late worker message arrives after cancel/apply | State unexpectedly changes | Run ID, sequence monotonicity, cancellation barrier, worker termination fallback |
| Checkpoint is too large or quota fails | Main-thread stalls or lost recovery | Minimal checkpoint, throttled writes, nonfatal quota fallback, revalidation on restore |
| Refresh is described as proof resume | Operator overtrusts restarted search | Restore incumbent only; new 30-minute run; explicit proof restart wording |
| Internet disconnect in Brazil | Asset load or perceived result risk | Fully local computation after all assets load; separate before/after-load tests; no remote-job dependency |
| Laptop sleeps or browser suspends | Local worker stops | Plain keep-awake guidance, latest verified checkpoint, no background promise |
| Worker/solver dependency is abandoned, large, or incompatible | Maintenance/deployment risk | WP2 license/maintenance/bundle/CSP/WASM gate and adapter isolation |
| Automatic candidate overwrites manual work | Data loss | Preview-first flow, immutable pin, explicit replacement confirmation, atomic apply |
| Phase 4 quietly becomes Phase 6 | Uncontrolled auth/storage architecture | Current-tab checkpoint only; explicit exclusions and review checkpoint |

## 14. Definition of Done

Phase 4 is complete only when:

- The mandatory source documents and current contracts were read in full before implementation.
- Revised Q-SIM-01 through Q-SIM-06 decisions are synchronized into authoritative documents and calculation cases are finalized.
- Product code, UI, tests, and documentation contain one fixed 30-minute run and no 3-hour/custom mode.
- New ruleset, objective, calendar/fingerprint, checkpoint, and model-certificate versions identify the revised semantics.
- Qualification, daily PVP balance, and half-month assessed PVP opening meanings are explicit and tested.
- Canonical ISO date-only Sunday/skip behavior is independent of browser/device timezone.
- One exact objective comparator is used or independently validated everywhere.
- The comparator has no target-700 total-days stage and no exact-PVP-100 stage.
- The optimizer produces canonical safe-integer allocation matrices for valid setup bundles.
- Every shown or restored candidate is independently verified by the updated Phase 1 engine.
- All members' personal PVP and assessed left/right targets are hard constraints.
- Opening qualification PVP plus inclusive cumulative direct PVP controls the non-resetting 300 gate, and no automatic candidate commissions below it.
- Same-date threshold crossing, one-sided pre-qualification carry, manual below-300 reset/warning, already-qualified opening, and separate-opening cases pass.
- Current-rule PVP placement can move a 100 entry between descendant and ancestor according to total PV, waste, targets, and later objectives.
- Exact PVP value 100 is never rewarded merely for being 100.
- General 100-multiple readability, maximum direct PVP, and deterministic tie-break obey their strict lower priority.
- Target-700 threshold/vector fairness is exact, including `[0,8,8]` versus `[7,7,7]`, empty-member, and higher-tier-one-day cases.
- Period-end carry follows Phase 1 and is not labeled discarded without an explicit authoritative erasure.
- Soundness, completeness, and objective preservation are documented, reviewed, version-certified, and supported by exhaustive/oracle evidence.
- `OPTIMAL` and `INFEASIBLE` can be emitted only under the matching model certificate and complete exact proof.
- `OPTIMAL`, `TIME_LIMIT`, `CANCELLED`, `INFEASIBLE`, and `FAILED` remain semantically and structurally distinct.
- A useful candidate may be used before proof without being mislabeled.
- A proven optimum is byte-for-byte deterministic; wall-clock-limited incumbents carry no false repeatability guarantee.
- Optimization runs outside the UI thread, remains responsive, and can be cancelled.
- Candidate IDs/sequences prevent stale messages and preview/apply races.
- The latest verified incumbent may survive same-tab refresh when the exact problem still matches and is reverified before use.
- Checkpoint quota/serialization failure cannot damage the run, setup, or manual draft.
- The operator can preview one immutable candidate and explicitly apply exactly that candidate to the existing manual worksheet.
- Applying ends the active run; existing manual values are never overwritten implicitly.
- Offline continuation works only after all required assets load and is described honestly.
- 1-, 10-, 20-, and 50-member benchmark evidence is recorded, including a documented typical office laptop.
- Browser feasibility passes WP2 under the 30-minute workflow or the phase stops for an explicit server architecture decision.
- All Phase 1–4 tests, coverage gates, typecheck, build, and `/ngplan/` smoke checks pass.
- Real-browser stop/restart, pinned-preview race, apply, timezone, offline-before/after-load, storage-failure, cancellation, and checkpoint cases are recorded.
- The Korean development log records decisions, measurements, failures, laptop limitations, and deferred Phase 5/6 work.

After Phase 4, Phase 5 may treat an applied automatic plan as the draft basis for confirmation, actual-value entry, fixed historical boundaries, and minimum-change future resimulation. Phase 6 may add Supabase authentication, authorized-user storage, durable long-running jobs if later benchmarks require them, closed records, and export. Phase 4 leaves those contracts unclaimed.
