# Phase 3 Execution Plan — Manual Planning Worksheet

Date: 2026-07-11  
Status: Implemented — automated delivery gates passed; full manual browser case pending

This document turns **Phase 3 — Manual Planning Worksheet** from `ROADMAP.md` into an implementation-ready plan. It operationalizes the business requirements, technical design, calculation cases, completed Phase 1 engine contracts, and the immutable Phase 2 setup handoff.

This English document is the canonical Phase 3 execution plan. Product labels remain Korean and must use plain operator-facing language, but code names and calculation contracts must keep the canonical English terminology defined by the source documents.

## 0. Mandatory Reading and Authority Rules

Before changing code, the implementing Codex agent must:

1. Read this execution plan completely.
2. Read every source-of-truth document below completely. Do not rely on summaries, excerpts, prior chat context, or another agent's interpretation.
3. Inspect the current public contracts and tests listed below before designing new types.
4. Stop and reconcile any material conflict before implementation. Do not silently choose a convenient interpretation.

### 0.1 Source-of-Truth Documents

Read these files in full:

- `docs/ROADMAP.md`
- `docs/requirements/pyramid-app-requirements-v2.md`
- `docs/TECHNICAL_DESIGN.md`
- `docs/CALCULATION_CASES.md`
- `docs/plans/PHASE_2_EXECUTION_PLAN.md`

Authority is topic-specific:

| Topic | Authority |
|---|---|
| Phase boundaries and delivery order | `ROADMAP.md` |
| Business intent and required user-visible information | `pyramid-app-requirements-v2.md` |
| Data ownership, ledger separation, and architecture | `TECHNICAL_DESIGN.md` |
| Exact arithmetic and expected examples | `CALCULATION_CASES.md` plus the tested Phase 1 public contract |
| Phase 2 editing behavior and Phase 3 handoff | `PHASE_2_EXECUTION_PLAN.md` plus the current `ProjectSetupBundle` contract |
| Phase 3 implementation sequence and approved interaction defaults | This document |

If a prose phrase conflicts with an exact finalized calculation case or the tested Phase 1 contract, do not rewrite the formula in Phase 3. Record the conflict, update the authoritative documentation deliberately, and keep Phase 1 as the sole calculation implementation.

### 0.2 Current Contracts to Inspect

At minimum, inspect:

- `src/application/project-setup/types.ts`
- `src/application/project-setup/normalize-project-setup.ts`
- `src/application/project-setup/index.ts`
- `src/domain/types.ts`
- `src/domain/period.ts`
- `src/domain/pv.ts`
- `src/domain/validation.ts`
- `src/engine/index.ts`
- `src/engine/calculate-period.ts`
- all existing Phase 1 and Phase 2 tests
- `src/ui/App.tsx`, the current UI components, styles, and UI tests
- `package.json` and `vitest.config.ts`

The implementation must consume current contracts rather than recreating production types from test fixtures. Never import `src/**/__tests__/fixtures.ts` into production code.

### 0.3 Repository Workflow

- Work on the existing `main` branch. Do not create a task or feature branch unless J explicitly changes this preference.
- Preserve unrelated local changes.
- Follow `AGENTS.md`, including the Korean development log requirement after every actual change.
- Do not commit or push merely because a work package is complete; follow the active user request.

## 1. Purpose

Phase 3 adds the first full half-month simulation workspace. The operator starts from a validated Phase 2 setup bundle, enters planned direct PV by date and member, and immediately sees the authoritative Phase 1 calculation results.

The screen is an Excel-like planning worksheet, not an optimizer and not a persisted business record. It must make the relationship between direct input, organization propagation, daily settlement, carry, and half-month goals inspectable without exposing implementation jargon.

Phase 3 has three layers:

1. an editable in-memory `ManualPlanDraft` that stores user-entered strings;
2. a pure application layer that normalizes a complete date-by-member input and calls `calculatePlan`;
3. a worksheet and result views that render application view models without reproducing business formulas.

## 2. Success Criteria

Phase 3 is successful when all of the following are true:

- A valid immutable `ProjectSetupBundle` can open a manual planning workspace.
- The worksheet contains every half-month date and every active member exactly once.
- Dates are rows, and each member has a grouped `PVP / Left / Right` column set.
- Direct PVP and every derived `SELF` direction accept non-negative integer PV in 1 PV units on settlement days.
- A connected direction is read-only and shows the organization aggregate calculated by Phase 1.
- Sunday rows remain visible, accept no nonzero input, calculate as `SKIPPED`, and preserve carry.
- Current-rule daily and half-month PVP apply wholly to the smaller side; Phase 3 exposes the engine result and no historical-rule selector.
- A manually entered settlement below qualification PVP 300 preserves the engine's mechanical reset trace, is not counted as a usable full commission, and produces a blocking planning warning.
- Period-end carry follows the authoritative engine closing result and is not silently erased or labeled waste.
- Blank editable draft values normalize to zero without using implicit JavaScript number coercion.
- Invalid nonblank input identifies the exact date, member, side, and field and blocks current results.
- No stale result appears as if it reflects an invalid draft.
- Every valid edit recalculates the complete period through `calculatePlan`.
- A selected date/member exposes the complete daily audit trail.
- Each member exposes running half-month progress and a final half-month assessment.
- Unmet PVP or side targets are shown as valid planning outcomes, not validation errors.
- Duplicate names and optional company IDs remain distinguishable in the worksheet.
- Large tables support sticky headers, a sticky date column, horizontal scrolling, member navigation, keyboard entry, and error focus.
- The current compact/comfortable display-density preference continues to work, including common 15-inch laptop and Windows 125% display-scaling use.
- Phase 1 and Phase 2 behavior remains unchanged.
- Type checking, tests, coverage, production build, and `/ngplan/` distribution smoke checks pass.

## 3. Approved Phase 3 Decisions

These defaults are part of the implementation contract and do not require another technical decision from J unless they conflict with the real workflow.

| Decision | Approved behavior | Rationale |
|---|---|---|
| Setup input | Consume only the active immutable `ProjectSetupBundle` | The planning screen must not observe mutable Phase 2 draft state. |
| Draft value type | Store editable PV as strings | Blank and temporarily invalid UI states must not be cast into Phase 1 types. |
| Blank planning cells | Display blank initially and normalize blank to `0` | This reduces visual noise in the manual worksheet. This rule applies only to the Phase 3 plan draft, not later actual-value semantics. |
| Calculation strategy | Recalculate the full period after every valid edit | Phase 1 is deterministic and already owns all propagation and ledger rules. Partial formula patches would create a second calculation engine. |
| Invalid draft | Remove the current-result state and show localized errors | A previous result must never look current after an invalid edit. |
| PVP input | Editable for every member on every non-Sunday date | PVP is always direct member input. |
| Left/right input | Editable only when the direction is `SELF` | Connected directions come from child organization totals. |
| Connected allocation shape | Omit `selfLeft` or `selfRight` structurally | Supplying a connected direction as numeric zero violates the canonical input contract. |
| Sundays | Show the row, lock inputs to zero, and render `SKIPPED` | Sunday is part of the period and carry sequence even though it accepts no new PV. |
| Table implementation | Native semantic table in one horizontal scroll container | The period has only 13–16 rows; accessibility and sticky behavior matter more than a grid dependency. |
| Virtualization | Do not add it in Phase 3 | There is no measured need yet, and virtualization complicates sticky headers and keyboard/accessibility behavior. |
| Primary navigation | Member jump control plus native Tab order | This makes a wide sheet usable without inventing spreadsheet behavior. |
| Enter behavior | Enter moves to the next editable cell below; Shift+Enter moves to the previous one | This supports repeated daily entry while skipping read-only and Sunday cells. |
| Arrow keys | Preserve native input behavior | Do not hijack cursor movement without a complete spreadsheet interaction model. |
| Bulk operations | No multi-cell paste, fill handle, undo stack, import, or export | These are useful future enhancements but are not Phase 3 exit requirements. |
| Result layout | Compact grid plus selected-cell audit panel plus member summary | Putting every result in every cell would make the worksheet unreadable. |
| Member display order | Recursively use inorder on the root's left branch and mirrored inorder on its right branch, with the root between them | This is a presentation choice only. Phase 4 business identity uses a separate root-first, `LEFT`-before-`RIGHT` canonical order. |
| Return to setup | Retain the manual draft in the current-tab workspace and reconcile matching member/date/field cells after setup is validated again | Operators must be able to correct setup without losing manual work; Phase 5 revision semantics are still not introduced. |
| Storage | Store one versioned current-work snapshot in `sessionStorage` | Same-tab screen changes and refresh are protected, while durable records, cross-tab/device recovery, and export remain Phase 6 work. |
| Routing and global state | Keep the current top-level React screen state; add no router or global state library | Two in-memory screens do not justify new infrastructure. |
| UI terminology | Use plain Korean business labels and hide technical topology names | Operators should not need to understand `root`, `parent`, `child`, `subtree`, or `memberKey`. |

## 4. Phase Boundary

### 4.1 In Scope

- Transition from a ready Phase 2 setup to a manual planning workspace.
- In-memory manual plan draft creation and editing.
- Complete date-by-member allocation normalization.
- Direct PVP input.
- Direct left/right input only for `SELF` directions.
- Read-only connected-direction organization totals.
- Whole-period Phase 1 calculation after every valid edit.
- Daily raw performance, settlement, PVP application, commission, and carry display.
- Running half-month progress.
- Final member assessment, target remaining amounts, target status, commission days, and recommendation status.
- Sunday lock and skipped-settlement presentation.
- Localized validation, summary navigation, focus management, and no-stale-result behavior.
- Wide-table navigation and existing display-density support.
- Automated and manual verification against finalized calculation cases.

### 4.2 Explicitly Out of Scope

- Phase 4 automatic plan generation or optimization.
- Minimum-PV search, lexicographic objective scoring, optimality status, or infeasibility explanation.
- Plan confirmation, `AllocationRevision`, version history, or approval workflow.
- Actual values, completed-date locking, plan-versus-actual differences, or partial resimulation.
- Editing organization topology or opening values inside an active manual plan.
- Persistent project storage, cross-tab/device recovery, closed projects, or read-only history. A single current-work snapshot may use `sessionStorage` only to preserve setup and manual inputs while the same browser tab moves between the two Phase 3 screens or refreshes; it is not a Phase 6 project store.
- Excel/CSV/PDF/image export or import.
- Member favorites or reusable member address books.
- Multi-user editing, authentication, authorization, or server APIs.
- Formal large-organization performance certification; that belongs to Phase 7 after real scale is known.
- Mobile-first redesign. The screen must remain safe at narrower widths, but Phase 3 is PC-first.

Requirements that mention actual-value differences or changed resimulation cells are assigned to Phase 5 by the roadmap and must not be partially implemented here.

### 4.3 Phase 4 Handoff Constraints

Phase 3 does not implement optimization, but its bundle, manual draft, result selectors, and current-tab workspace are the Phase 4 handoff. The following Phase 4 contracts must not be contradicted by Phase 3 maintenance:

- The functional organization maximum is 50 active members. The product exposes one fixed maximum 30-minute automatic run and no 3-hour, custom-duration, hidden-extension, or background mode.
- Phase 2 supplies five opening values: qualification PVP, half-month PVP, daily PVP, daily left, and daily right. The three PVP meanings remain separate.
- `qualificationPvp` is opening qualification PVP plus inclusive cumulative direct PVP through the current date. Same-date PVP counts before the 300 gate.
- A below-300 mechanical settlement keeps the real reset/carry trace. It is forbidden in an automatic candidate and shown as a blocking warning in manual planning.
- Only the current smaller-side PVP rule is authoritative for daily and half-month calculation.
- The exact automatic objective order is total new PV, discarded excess, target-700 at-least-eight count plus complete ascending day vector, non-100-multiple direct-cell count, maximum direct PVP, then the canonical allocation tie-break.
- Target-700 total commission days are display-only. Exact PVP value 100 has no standalone preference.
- The canonical business member order is root-first and recursively `LEFT` before `RIGHT`; it is independent of this worksheet's inorder display.
- Period-end carry is preserved according to Phase 1 and receives no invented terminal penalty.
- The current-tab workspace may add only a minimal verified-incumbent checkpoint. It does not persist solver frontier/proof progress or become durable/cross-device storage.

## 5. Canonical Data Flow

```text
Phase 2 ProjectSetupBundle
        |
        v
createManualPlanDraft(bundle)
        |
        v
ManualPlanDraft (strings, may be invalid)
        |
        v
normalizeManualPlanDraft(bundle, draft)
        |
        +---- INVALID ---> localized draft issues ---> no current result
        |
        v
CalculatePlanInput (complete canonical matrix)
        |
        v
calculatePlan(input)
        |
        +---- FAILURE ---> mapped engine issues ---> no current result
        |
        v
CalculationResult
        |
        v
pure view selectors ---> worksheet / daily details / member summary
```

No UI component may calculate subtree totals, PVP application, commission tiers, carry, half-month totals, target shortages, or recommendations.

## 6. Application Contracts

Create a dedicated `src/application/manual-plan/` module. Keep all parsing, schema derivation, normalization, calculation orchestration, validation mapping, and result lookup outside React components.

### 6.1 Draft Types

The exact syntax may evolve during implementation, but it must preserve these semantics:

```ts
type ManualPlanField = 'pvp' | 'selfLeft' | 'selfRight';

interface ManualPlanCellDraft {
  readonly date: string;
  readonly memberKey: string;
  readonly pvp: string;
  readonly selfLeft?: string;
  readonly selfRight?: string;
}

interface ManualPlanDraft {
  readonly cells: readonly ManualPlanCellDraft[];
}
```

Rules:

- There is exactly one draft cell for every derived period date and active member.
- A settlement-day editable field starts as `''`.
- A Sunday field is represented as locked zero in a deterministic form and cannot be changed to nonzero through application commands.
- `selfLeft` exists only when the member's left direction is `SELF`.
- `selfRight` exists only when the member's right direction is `SELF`.
- Connected directions have no draft value; the read-only display comes from `RawPerformance.organizationLeft` or `organizationRight`.
- All draft edit commands are pure and atomic.
- Lookups must safely support arbitrary stable member keys, including keys such as `__proto__`; do not use unsafe plain-object indexing.

### 6.2 Worksheet Schema

Derive one immutable schema from the setup bundle:

- `period.dates` from `derivePeriod` supplies row order.
- Worksheet member order is deterministic and recursively root-centered: render the root's left branch as `LEFT subtree → member → RIGHT subtree`, render the root, then render the root's right branch as `RIGHT subtree → member → LEFT subtree`. Every member remains beside and between its own children while the right half mirrors the left half.
- The worksheet inorder is UI-only. Phase 4 separately derives the canonical business sequence as root-first preorder with every `LEFT` subtree before `RIGHT`; optimizer fingerprints, objectives, checkpoints, and tie-breaks must never reuse the worksheet order.
- The current engine `orderedMemberKeys` is a stable member-key sort used by calculation output; it is neither the worksheet inorder nor the Phase 4 canonical business preorder. Derive both topology orders explicitly from the root and child relationships and lock their separation with application tests.
- Each member descriptor contains its stable key, display label, selected PVP target, optional sheet marker, optional company ID, all five opening values, and left/right `SELF | CHILD` modes.
- Each date descriptor contains its ISO date, Korean display label, and settlement mode.
- Re-export or consume the existing `settlementModeForDate`/`isSunday` domain helper. Do not duplicate Sunday detection in the application or UI.

Phase 3 treats `MemberSnapshot.memberId` as an opaque optional display string. It does not edit or revalidate member IDs. The Phase 2 product UI accepts digits when an ID is entered, but the Phase 1/domain contract and existing engine fixtures intentionally support arbitrary strings; Phase 3 must not tighten that lower-level contract. Header labels use:

1. member name as the primary text;
2. company ID as secondary text when present;
3. a deterministic Korean `동명이인 1`, `동명이인 2`, ... suffix when the visible name/ID combination is not unique.

Never expose `memberKey` merely to distinguish duplicate names.

### 6.3 PV Parsing and Normalization

Use the existing explicit PV parser or a thin application wrapper around it.

- `''` normalizes to numeric zero only for an editable Phase 3 planning cell.
- `0` and every safe non-negative integer are valid.
- `1` PV is valid.
- Negative values, fractions, exponent notation, signs, whitespace-only nonempty values, text, `NaN`, `Infinity`, and unsafe integers are invalid.
- Never use `Number(value)` as the only validation step, because `Number('') === 0` and permissive syntax can hide invalid input.
- Normalization is all-or-nothing. One invalid field produces no `CalculatePlanInput`.
- Canonical output contains exactly one `NormalizedAllocationCell` per date/member pair.
- Canonical output always includes `pvp`.
- Canonical output includes every `SELF` field even when its value is zero.
- Canonical output omits every connected-side field, including zero.
- Every Sunday canonical cell is zero.
- The returned input reuses the immutable setup bundle's period and organization values without mutation.

### 6.4 Calculation State

Use an explicit discriminated union so stale data cannot accidentally render:

```ts
type ManualPlanCalculationState =
  | {
      readonly status: 'CURRENT';
      readonly input: CalculatePlanInput;
      readonly result: CalculationResult;
      readonly warnings: readonly ManualPlanIssue[];
    }
  | {
      readonly status: 'BLOCKED';
      readonly issues: readonly ManualPlanIssue[];
    };
```

The `BLOCKED` variant must not contain a renderable current result. A component must exhaustively switch on this state rather than checking unrelated nullable values.

The Phase 4 qualification-aware engine extension adds one exceptional audited-blocking path for a manual below-300 mechanical settlement. Its exact current-draft settlement/reset trace must remain available for audit, but the state must remain structurally distinct from `CURRENT`, carry a blocking issue, and never be usable as an automatic candidate or normal commission result. A stale result from an earlier draft is never an acceptable substitute for that trace.

After each edit:

1. apply the pure draft edit;
2. normalize the whole draft;
3. if normalization fails, publish `BLOCKED`;
4. otherwise call `calculatePlan` once with the complete input;
5. map an engine failure to `BLOCKED`;
6. publish `CURRENT` only for a successful result derived from that exact draft.

Do not incrementally patch a previous `CalculationResult`.

### 6.5 Stable Locations and Issues

Define a Phase 3 issue model that can represent:

- draft parse errors;
- prohibited Sunday input;
- canonical normalization errors;
- Phase 1 validation errors and warnings;
- a global calculation failure when no more specific location exists.

Every location should carry the available date, member key, side, and field. Build collision-safe DOM IDs from an encoded tuple, not naive string concatenation. Map engine `ValidationLocation` values to the same stable cells and summary links.

Errors block current results. Warnings remain visible and do not block successful calculation. Goal shortages are neither errors nor warnings; they are normal result values.

### 6.6 Result Selectors

Create pure selectors/view-model builders for:

- one worksheet display cell;
- one selected date/member daily audit;
- one selected date/member running half-month state;
- one member's final assessment;
- all-member summary rows;
- member jump options;
- validation summary items.

Selectors may format or relabel an engine result, but they must not recompute business values. Centralize date/member lookups and handle missing keys explicitly.

When `DailySettlement.preSettlement.pvp === 0`, the product-facing message should be `적용할 PVP 없음` rather than implying that a meaningful left-side tie decision occurred. Do not base this message on the selected day's direct PVP cell: direct PVP can be zero while carried PVP is genuinely applied. Keep the underlying engine reason unchanged for audit/debug purposes; this is a presentation rule only.

## 7. UI and Interaction Contract

### 7.1 Screen Transition

Add an explicit top-level screen union in `App.tsx` or a small application shell:

- `SETUP`: the existing Phase 2 project/organization editor;
- `MANUAL_PLAN`: a session created from the active frozen `ProjectSetupBundle`.

The Phase 2 ready state gains a primary `수동 계획표 열기` action. The action is enabled only while the exact active bundle remains valid.

The manual-plan screen keeps its own reference to that frozen bundle while it is open. It must not read changing values from the setup form. Returning to setup retains the manual draft in the current-tab workspace. After setup is validated again, reopening reconciles cells by stable member key and date: matching editable fields keep their strings, new cells use blank/zero defaults, and cells or direction fields no longer present are dropped.

Do not add in-place member, topology, PVP-target, sheet-marker, or opening-value editing to the planning screen.

### 7.2 Workspace Header

Show:

- project title;
- first/second-half date range;
- `설정으로 돌아가기` action;
- current-tab warning explaining that setup and manual inputs survive screen changes and refresh through `sessionStorage`, but closing the tab removes them;
- current calculation status: `계산 완료` or `입력 확인 필요` with text/icon, not color alone.

Do not show internal project IDs, organization snapshot IDs, member keys, engine versions, or ruleset versions in the normal operator UI.

### 7.3 Worksheet Layout

Use one semantic `<table>` inside one dedicated scroll container.

- First column: date and weekday.
- Two sticky header rows: member group, then `PVP / 좌 / 우`.
- Sticky first date column.
- Member groups follow the deterministic worksheet inorder. This display order is not the Phase 4 canonical business order.
- Each member header shows the optional numbered color marker, display label, selected PVP target, optional company ID, and relevant opening PVP/left/right values above the corresponding columns. Qualification, half-month, and daily opening PVP remain distinct in data and audit views even when the compact header cannot show all three at once.
- Editable cells use a compact text input with `inputMode="numeric"` and an exact accessible name containing date, member display label, and field.
- Read-only connected directions show the current organization aggregate and a concise `조직 합계` cue or tooltip.
- Sunday rows have a visible `일요일 · 정산 제외` cue and no enabled edit control.
- The selected date/member group has a non-color-only visual state and drives the detail panel.
- Use tabular numerals and right-aligned PV values.
- Preserve zeros in results where zero is meaningful; use an em dash only when a result is unavailable because calculation is blocked.

The table must not freeze one column per member; only the date column and headers are sticky. Freezing many columns would consume the viewport and conflict with horizontal navigation.

### 7.4 Navigation

- A member jump control scrolls the selected member group into view and moves focus to its first editable visible cell.
- Native Tab/Shift+Tab traverses enabled editable controls in DOM order.
- Enter moves vertically to the next editable date for the same member/field.
- Shift+Enter moves vertically to the previous editable date for the same member/field.
- Navigation skips Sundays and read-only connected directions.
- Arrow keys retain native text-input cursor behavior.
- The summary's `첫 오류로 이동` action focuses the exact invalid input when possible.
- Focus remains visible in both compact and comfortable density modes.

### 7.5 Validation Presentation

Use three levels, consistent with the Phase 2 usability decision:

1. a thin error summary immediately above the worksheet;
2. a selected date/member issue summary near the detail panel;
3. a field-level message tied to the exact input.

Do not repeat a long global issue list in every member group. Announce the error count through a restrained `aria-live="polite"` region; do not announce every recalculated numeric result after each keystroke.

If calculation is blocked, derived connected values and result panels must show an explicit unavailable state. Do not leave old numbers visible without a prominent stale label; the preferred implementation is to remove them from the current view entirely.

### 7.6 Daily Audit Panel

For the selected date/member, show the authoritative Phase 1 values in calculation order:

1. carry-in PVP, left, and right;
2. direct PVP and organization left/right raw performance;
3. pre-settlement PVP, left, and right;
4. PVP applied side and product-facing reason;
5. assessed left and right;
6. commission tier and whether commission occurred;
7. carry-out PVP, left, and right;
8. running personal PVP, remaining PVP, raw left/right totals, and personal-PVP target state through that date.

Under the qualification-aware ruleset, the audit also shows or can explain opening qualification PVP, inclusive cumulative qualification PVP for the selected date, and whether a mechanical settlement was a qualification-valid full commission. If the value is below 300, preserve the engine's real reset trace, do not count it as a usable commission, and show a plain blocking warning.

`RunningFortnightState` does not expose running left/right target booleans. Show running raw left/right totals without inventing side-target comparisons in the UI. Left/right target status is shown only from the final `FortnightAssessment`.

For Sunday, show `정산 제외`, no commission occurrence, and clearly show that carry-out equals carry-in.

The first-date daily carry PVP is one of Phase 2's five explicit opening inputs. After calculation begins, each following day's carry PVP is derived from the prior settlement and must not become another editable planning field.

### 7.7 Member Half-Month Summary

For the selected member, and in a compact all-member overview where space permits, show:

- directly selected PVP target and optional sheet marker;
- current/opening PVP credit;
- opening and current qualification PVP when the qualification-aware ruleset is active;
- new PVP total;
- personal PVP total;
- personal PVP target;
- additional/remaining PVP;
- raw left and right totals;
- half-month PVP applied side;
- assessed left and right;
- left/right target status;
- all-target status;
- commission days and occurrences;
- target-700 recommendation status and recommended days when applicable.

Only qualification-valid full commission occurrences count. Target-700 total days may be shown as a display metric, but Phase 3 selectors must not imply that the total is a separate Phase 4 objective.

Use the `RuleSet`/engine result as authority. The approved contract has no business-level field: each member directly selects `2400 | 1500 | 700`; target 700 is subject to the soft approximately-eight-day recommendation; the optional sheet marker is display-only.

### 7.8 Accessibility and Density

- Preserve semantic table headers and associate each input with both its member and date context.
- Do not rely on placeholder text as a label.
- Error, warning, selected, read-only, skipped, success, and target states require text/icon cues in addition to color.
- Maintain visible keyboard focus and adequate control hit targets.
- Keep the existing `작게` default and `편안하게` alternative.
- Verify sticky positioning and horizontal scrolling in both density modes; avoid adding nested transforms that break sticky behavior.
- At narrow widths, allow the worksheet container to scroll rather than shrinking numeric inputs below usability.

## 8. Target File Structure

The exact split may be adjusted when a file would remain trivial, but the responsibilities must stay separated.

### 8.1 New Application Files

```text
src/application/manual-plan/
  types.ts
  create-manual-plan-draft.ts
  derive-manual-plan-schema.ts
  edit-manual-plan.ts
  normalize-manual-plan.ts
  calculate-manual-plan.ts
  map-manual-plan-issues.ts
  derive-manual-plan-view.ts
  index.ts
  __tests__/
```

### 8.2 New UI Files

```text
src/ui/components/manual-plan/
  ManualPlanWorkspace.tsx
  ManualPlanTable.tsx
  ManualPlanCell.tsx
  ManualPlanValidationSummary.tsx
  DailyResultDetails.tsx
  MemberFortnightSummary.tsx
  DiscardManualPlanDialog.tsx
  __tests__/
```

### 8.3 Existing Files Likely to Change

- `src/domain/period.ts` only if an existing helper requires a public-contract adjustment; do not duplicate its logic.
- `src/engine/index.ts` to export the existing settlement-calendar helper if the application needs a stable public import.
- `src/ui/App.tsx` for the screen boundary and setup handoff.
- `src/ui/styles.css` and, only when a new reusable token is necessary, `src/ui/theme.css`.
- existing UI tests and `vitest.config.ts` only if the new file layout requires a coverage include adjustment.
- source-of-truth documentation when implementation exposes a real contract mismatch.
- `docs/devlog/YYYY-MM-DD.md` after actual changes.

Avoid turning `App.tsx` into a combined setup, grid, validation, and result component. It should coordinate screens while dedicated components own presentation.

## 9. Work Packages

Complete work packages in order. A later package may begin only when the preceding package's contract tests pass.

### PRE-WP0 — Contract Synchronization

Tasks:

- Perform the mandatory reading in section 0.
- Confirm the current Phase 2 bundle is immutable and becomes inactive after setup edits.
- Record the Phase 3 operational resolutions already established by completed work:
  - company member ID is optional; Phase 2's user input is digit-only when present, while the canonical domain field remains an opaque string that Phase 3 does not revalidate;
  - duplicate names are legal and use stable internal keys;
  - actual differences and resimulation highlighting belong to Phase 5;
  - storage and export belong to Phase 6;
  - PVP targets come directly from the member snapshot and must be one of the tested `RuleSet.allowedPvpTargets` values.
- If the authoritative documents still contradict these completed decisions, update the relevant source documents before production code and explain the reconciliation in the Korean devlog.

Exit gate:

- No unresolved Phase 3 calculation or phase-boundary question remains.
- Any documentation correction is explicit and reviewable.

### WP1 — Draft and Worksheet Schema

Tasks:

- Add manual-plan types.
- Derive the full date list and deterministic member order.
- Derive each member direction's `SELF | CHILD` editability.
- Create collision-safe cell keys, DOM IDs, and lookup structures.
- Create a complete blank/zero draft from `ProjectSetupBundle`.
- Add pure one-field edit commands that reject edits to connected directions and Sundays.
- Add duplicate-name display-label derivation.

Exit gate:

- First- and second-half fixtures create exactly `dateCount × memberCount` cells.
- Field presence matches the organization shape.
- Creation and edit commands do not mutate the bundle or prior draft.

### WP2 — Normalization and Calculation Orchestration

Tasks:

- Implement strict draft PV parsing.
- Normalize blank editable values to zero.
- Produce a complete canonical allocation matrix.
- Export/reuse the existing Sunday settlement helper.
- Call `calculatePlan` only with successfully normalized input.
- Implement the `CURRENT | BLOCKED` state.
- Map Phase 1 validation locations into Phase 3 issues.
- Preserve nonblocking setup/calculation warnings as session display metadata where available.
- Preserve a qualification-aware manual below-300 settlement's exact reset trace while publishing a structurally blocking issue rather than a usable `CURRENT` result.

Exit gate:

- No invalid or partial input reaches the engine.
- No engine failure produces a partial/current result.
- The initial blank/zero draft immediately produces a current calculation without waiting for the first edit.
- A valid edit produces a result from the exact current draft.
- All Phase 1 calculation tests remain unchanged and passing.

### WP3 — App Boundary and Setup Handoff

Tasks:

- Add the `SETUP | MANUAL_PLAN` top-level state.
- Add the `수동 계획표 열기` action to the ready setup state.
- Freeze/retain the exact bundle consumed by the manual session.
- Reuse the existing display-density preference. Clearly describe the current-tab-only `sessionStorage` safety net and that closing the tab removes it.
- Keep the versioned workspace extensible only for Phase 4's minimal reverified incumbent checkpoint; never store solver frontier, proof progress, or durable project history.
- Implement immediate return-to-setup behavior while retaining the controlled manual draft.
- Ensure a later setup mutation cannot silently update an existing manual session.

Exit gate:

- Manual planning cannot start without an active bundle.
- The planning screen never imports mutable Phase 2 React draft values.
- Returning to setup preserves matching manual cells for the next validated bundle.
- Starting a new plan explicitly removes the current setup and manual working drafts without creating a revision.

### WP4 — Manual Planning Worksheet

Tasks:

- Build the semantic two-header-row table.
- Render date/weekday rows and member `PVP / 좌 / 우` groups.
- Render direct inputs, connected read-only aggregates, and locked Sunday cells.
- Add sticky headers, sticky date column, and one horizontal scroll container.
- Add member jump, selected-cell state, Tab order, Enter, and Shift+Enter behavior.
- Keep plain Korean labels and hide technical identifiers.
- Support compact and comfortable density modes.

Exit gate:

- The complete half-month plan can be entered using only the keyboard.
- Connected and Sunday cells cannot be modified.
- Editing a descendant immediately updates every affected ancestor aggregate after a valid recalculation.
- Wide content remains reachable without clipped controls.

### WP5 — Daily and Half-Month Results

Tasks:

- Build pure result view models.
- Add selected date/member daily audit details.
- Add running half-month progress.
- Add selected-member and all-member final summaries.
- Present target shortages as actionable result values.
- Present no-PVP application, Sunday skip, commission occurrence, and recommendation states in plain Korean.

Exit gate:

- Every result required by the roadmap can be traced to a named `CalculationResult` field.
- No component contains an independent business formula.
- Users can compare the finalized calculation cases through visible values.

### WP6 — Validation, Focus, and Accessibility

Tasks:

- Add worksheet, selected-context, and field-level error presentation.
- Add first-error focus and stable error anchors.
- Remove current derived values while blocked.
- Add accessible table/input names and header associations.
- Verify dialog focus trap/return, visible focus, non-color cues, and restrained live announcements.
- Test duplicate names, optional IDs, special member keys, and both density modes.

Exit gate:

- Every actionable issue can move focus to its source.
- No stale result is represented as current.
- Core entry, correction, navigation, and setup/plan round-trip flows work without a mouse.

### WP7 — Regression, Documentation, and Delivery Verification

Tasks:

- Add application and UI acceptance tests from section 10.
- Run the complete Phase 1–3 suite and coverage.
- Build and run `/ngplan/` distribution smoke checks.
- Perform the manual browser cases.
- Perform an engineering smoke with at least 31 members across a 16-date period. This is not a formal Phase 7 latency certification; record any visible input lag or sticky/scroll failure.
- Update source documents only where implementation finalized a contract.
- Update the Korean development log with decisions, verification, limitations, and deferred features.

Exit gate:

- All automated quality gates pass.
- Manual browser cases pass in the production preview.
- No Phase 4–6 feature was introduced accidentally.

## 10. Test Plan

### 10.1 Required Commands

Run from the repository root:

```powershell
npm run typecheck
npm test -- --run
npm run test:coverage
npm run build
npm run smoke:dist
```

Keep the existing coverage gates:

- domain, engine, and application: at least 95% branches, functions, lines, and statements;
- UI: at least 85% branches and 90% functions, lines, and statements.

Do not reduce a threshold to make Phase 3 pass.

### 10.2 Required Automated Cases

| ID | Case | Expected result |
|---|---|---|
| P3-DRAFT-001 | First-half draft | 15 date rows × every member; one cell per pair |
| P3-DRAFT-002 | Second-half month with 31 days | 16 date rows × every member |
| P3-DRAFT-003 | SELF/CHILD schema | SELF fields present; connected fields absent |
| P3-DRAFT-004 | Edit one field | New draft returned; old draft and setup bundle unchanged |
| P3-DRAFT-005 | Optional IDs and duplicate names | Unique plain-language display labels; no member key shown |
| P3-DRAFT-006 | Special member key | Safe lookup and stable DOM location |
| P3-PV-001 | Blank editable field | Normalizes to 0 |
| P3-PV-002 | `0` and `1` | Accepted |
| P3-PV-003 | Negative, fraction, exponent, text, unsafe integer | Rejected at exact field |
| P3-NORM-001 | Complete valid draft | Exactly one normalized allocation per date/member |
| P3-NORM-002 | Connected direction | Canonical self field structurally absent, including zero |
| P3-NORM-003 | SELF direction | Canonical self field present, including zero |
| P3-NORM-004 | One invalid field | No partial `CalculatePlanInput` |
| P3-SUN-001 | Sunday row | Visible, locked, canonical zeros, `SKIPPED` |
| P3-SUN-002 | Attempt Sunday edit | Pure command rejects/no-ops without mutation |
| P3-SUN-003 | Saturday to Monday | Sunday carry-out equals carry-in; Monday receives preserved carry |
| P3-CALC-000 | Open a new valid workspace | Blank editable cells normalize to zero and a current result is available immediately |
| P3-CALC-001 | Descendant direct input | All affected connected ancestors update once |
| P3-CALC-002 | Invalid draft after success | State becomes `BLOCKED`; old result is not renderable |
| P3-CALC-003 | Repair invalid draft | Fresh `CURRENT` result matches repaired draft |
| P3-CALC-004 | Aggregate overflow/engine failure | No partial result; localized/global error shown |
| P3-RESULT-001 | Daily settlement | Carry, raw, pre, applied side, assessed sides, tier, carry-out all map exactly |
| P3-RESULT-002 | Half-month progress | PVP target, remaining, raw sides, target states map exactly |
| P3-RESULT-003 | Unmet goal | Calculation succeeds and shortage is displayed, not flagged as input error |
| P3-RESULT-004 | Zero pre-settlement PVP | Product view says no PVP to apply; direct-zero/carried-nonzero still shows real application |
| P3-QUAL-001 | Opening qualification 33 plus same-date direct PVP 267 | Qualification is 300 and that day's full commission may count |
| P3-QUAL-002 | Manual below-300 mechanical settlement | Actual reset trace preserved; result blocked with warning; occurrence not counted as usable commission |
| P3-CARRY-001 | Carry remains after the final plan date | Engine closing carry is preserved and no terminal waste is invented |
| P3-GRID-001 | Headers and order | Dates and member groups are deterministic and semantically associated |
| P3-ORDER-001 | Worksheet order versus business order | Worksheet uses organization inorder; canonical optimizer order is root-first and `LEFT` before `RIGHT` |
| P3-GRID-002 | Editability | PVP/SELF enabled; CHILD/Sunday unavailable |
| P3-GRID-003 | Keyboard flow | Tab and Enter navigation skip noneditable cells correctly |
| P3-GRID-004 | Member jump | Correct group scrolls into view and receives focus |
| P3-UI-001 | First-error action | Focus moves to exact invalid cell |
| P3-UI-002 | Density modes | Sticky headers, scroll, focus, and readable controls work in both modes |
| P3-BOUNDARY-001 | Start without bundle | Manual workspace cannot open |
| P3-BOUNDARY-002 | Setup changes after readiness | Old bundle cannot start a new session |
| P3-BOUNDARY-003 | Return after manual edit | Setup opens immediately; manual strings remain in the current-tab workspace |
| P3-BOUNDARY-004 | Revalidate and reopen | Matching member/date/field strings remain; obsolete cells/fields are dropped |
| P3-PAGES-001 | Production build | `/ngplan/` assets and smoke artifacts are valid |

### 10.3 Calculation-Case Traceability

At minimum, automated or integration tests must visibly reproduce the relevant finalized cases from `CALCULATION_CASES.md`, using their canonical case IDs in test names or comments:

- organization propagation: `ORG-001`, `ORG-002`, `ORG-006`;
- daily settlement and carry: `DAY-001`, `DAY-003`, `DAY-010`, `DAY-P03`;
- half-month accumulation and assessment: `HALF-005`, `HALF-006`, `HALF-P01`, `HALF-P03`;
- calendar behavior: `CAL-004`, `CAL-P01`;
- commission-day counting/recommendation: `COUNT-001`, `COUNT-003`.

Read the cases themselves before writing tests. Do not copy expected values from this plan or invent simplified replacements.

### 10.4 Manual Browser Case — P3-PAGES-002

1. Run the production preview and open `/ngplan/`.
2. Create a valid multi-level organization with at least one `SELF` direction and one connected direction.
3. Open the manual planning worksheet.
4. Enter 1 PV in a direct field and confirm it is accepted.
5. Enter values in a descendant and confirm connected ancestor totals update.
6. Confirm a connected direction and a Sunday row cannot be edited.
7. Introduce invalid text by paste and confirm the exact field error appears and result panels become unavailable.
8. Repair the field and confirm current results return.
9. Verify daily carry and half-month remaining targets against a finalized calculation case.
10. Navigate with Tab, Enter, Shift+Enter, member jump, and first-error focus.
11. Verify both display-density modes at browser 100%; include Windows 125% scaling when available.
12. Return to setup after entering manual values, correct setup, validate again, and confirm matching values remain after reopening.
13. Record the observed result in the Korean development log.

## 11. Review Checkpoints

### A — Phase Boundary

- Manual planning only; no optimizer, actual values, revision history, durable project storage, or export. The current tab retains one versioned working snapshot in `sessionStorage`; Phase 4 may add only a minimal reverified incumbent checkpoint.
- No organization or opening-value edits inside the planning session.

### B — Setup Handoff

- The session consumes one frozen `ProjectSetupBundle`.
- Mutable Phase 2 draft state is not a hidden dependency.
- Optional IDs and duplicate names remain safe.

### C — Draft versus Canonical Input

- Strings stay in the draft layer.
- Blank-to-zero is explicit and Phase-3-specific.
- SELF zero is present; CHILD zero is absent.
- Sunday zero cells are complete and immutable.
- One invalid value prevents all canonical output.

### D — Calculation Authority

- Every valid change calls Phase 1 for the whole period.
- UI/application selectors do not reproduce formulas.
- Raw daily values, daily carry, and half-month totals remain separate.
- Qualification PVP, daily PVP balance, and half-month PVP remain separate; same-date direct PVP is included before the 300 gate.
- A daily reset never overwrites raw performance or half-month totals.
- A below-300 mechanical settlement preserves the real reset trace but is blocked and never counted as a usable full commission.
- Period-end carry follows the engine and receives no invented terminal penalty.

### E — Result Freshness

- `CURRENT` always identifies the exact current draft.
- `BLOCKED` contains no renderable current result.
- Goal shortage is a valid result, not a validation failure.

### F — Worksheet Usability

- Dates are rows and member PVP/left/right values are grouped columns.
- Worksheet member columns use inorder for display; optimizer identity uses a separate root-first, `LEFT`-before-`RIGHT` order.
- Sticky headers/date column and horizontal scrolling work together.
- Keyboard entry, member jump, error focus, and density settings work.
- Technical topology terms do not leak into Korean UI copy.

### G — Regression and Deployment

- Finalized calculation cases are traceable from tests.
- Existing coverage gates remain intact.
- Production build and `/ngplan/` smoke checks pass.

## 12. Major Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| UI duplicates calculation formulas | Divergent results from Phase 1 | Use pure view selectors over `CalculationResult`; ban formula logic in components |
| Connected side stored as zero | Engine input means direct SELF when it should mean organization total | Derive schema once and structurally omit connected fields |
| Blank parsed through JavaScript coercion | Invalid or accidental values silently become zero | Explicit parser with Phase-3-only blank rule |
| Previous result remains visible after invalid edit | Operator trusts values that no longer match inputs | `CURRENT | BLOCKED` union with no result in blocked state |
| Sunday rule reimplemented in several layers | UI and engine disagree | Export/reuse `settlementModeForDate`/`isSunday` |
| Wide worksheet overwhelms a laptop | Important members or controls become unreachable | Single horizontal scroll area, sticky date/header, member jump, compact density |
| Too much result data in the grid | Entry becomes unreadable | Keep grid focused on three fields; move audit detail and summaries to panels |
| Duplicate names with empty IDs | Operator edits the wrong member | Deterministic plain-language disambiguation without exposing member keys |
| Member ordering differs across views | Inputs and results appear under the wrong person | One authoritative worksheet schema and centralized lookups |
| Worksheet inorder leaks into the optimizer | A visual layout change alters the problem fingerprint or optimum | Keep UI inorder and canonical root-first, `LEFT`-before-`RIGHT` business order as named, separately tested contracts |
| Setup draft changes after manual input | Result uses mixed organization versions | Never mutate the open bundle; on validated reopen reconcile only matching member/date/editable-field strings into the new schema |
| `App.tsx` absorbs all Phase 3 logic | Fragile state coupling and low testability | Dedicated application module and manual-plan components |
| CSS density breaks sticky positioning | Headers scroll away or overlap | Avoid nested transforms; test both density modes and real preview |
| Immediate full recalculation becomes slow at unknown scale | Input lag | Keep orchestration pure, smoke-test 31×16, measure before adding debounce/worker/virtualization; formal performance in Phase 7 |
| Requirements text crosses Phase 5 boundary | Premature revision model | Follow roadmap boundary and explicitly exclude actual/diff/resimulation features |
| Current-tab continuity grows into an ad hoc project database | Phase 6 lifecycle and migration policy preempted | Store only one versioned working snapshot in `sessionStorage`; no project list, history, cross-tab sync, or durable recovery |
| Minimal candidate checkpoint is mistaken for proof resume | Operator overtrusts a restarted run | Persist only a verified incumbent and compatibility metadata, reverify it, and start a fresh fixed 30-minute run |
| Below-300 settlement is hidden to keep the plan usable | Later carry diverges from the company system | Preserve mechanical reset, block the manual plan with a plain warning, and reject the event in automatic candidates |

## 13. Definition of Done

Phase 3 is complete only when:

- The mandatory source documents were read in full before implementation.
- Any discovered source contradiction was reconciled explicitly rather than hidden in code.
- A ready Phase 2 bundle opens a separate manual planning workspace.
- The manual draft contains the full half-month date-by-member matrix.
- PVP and SELF directions accept safe non-negative integer PV in 1 PV units.
- Connected directions are read-only, structurally absent from direct input, and show engine-derived organization totals.
- Sundays are visible, locked to zero, skipped by settlement, and preserve carry.
- Blank planning values normalize explicitly to zero.
- Invalid input blocks current calculation and focuses the exact source.
- Every valid edit recalculates the entire period through the active versioned Phase 1 engine.
- Daily audit, running progress, final assessments, shortages, commission days, and recommendations are visible.
- The worksheet works with keyboard-only entry, member jump, sticky navigation, and both display-density modes.
- Duplicate names and optional IDs cannot cause identity confusion.
- Returning to setup preserves the manual working draft, and reopening after setup correction safely reconciles matching cells.
- Worksheet inorder remains presentation-only and is never reused as Phase 4's root-first, `LEFT`-before-`RIGHT` canonical business order.
- Qualification-aware manual calculation preserves below-300 mechanical reset traces while blocking their use as valid plans; final carry remains unpenalized unless the engine records an explicit erasure.
- No automatic optimizer, revision, actual-value, persistence, closure, import, or export feature is included.
- All Phase 1–3 tests pass without reducing coverage thresholds.
- Production build, `/ngplan/` smoke check, and manual preview pass.
- The Korean development log records implementation decisions, verification evidence, known limitations, and deferred Phase 4–6 work.

After Phase 3, Phase 4 may create automatic allocation candidates against the same immutable setup and verify them through the qualification-aware versioned Phase 1 engine. It uses one fixed 30-minute run, the exact revised objective order, a separate canonical business member order, and a current-tab verified-incumbent checkpoint only. Phase 5 will introduce plan confirmation, actual values, revisions, organization changes after planning, and partial resimulation. Phase 6 will define durable persistence, cross-device recovery, closed records, and spreadsheet/export formats. Phase 3 must leave those contracts unclaimed.
