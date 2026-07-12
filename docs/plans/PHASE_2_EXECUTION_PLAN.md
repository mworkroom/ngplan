# Phase 2 Execution Plan — Project and Organization Setup

Date: 2026-07-11  
Status: Approved for implementation

This document turns **Phase 2 — Project and Organization Setup** from `ROADMAP.md` into an implementation plan. It is based on `TECHNICAL_DESIGN.md`, `pyramid-app-requirements-v2.md`, the completed Phase 1 public contracts, and the product decisions confirmed after the first Korean draft.

This English version is the canonical Phase 2 execution plan. Korean labels may be used in the product UI, but implementation contracts and topology terminology in this document must not be translated into ambiguous alternatives.

## 1. Purpose

Phase 2 creates the first usable application screen. It allows the operator to define:

- the target half-month project;
- the active members for that project;
- the binary left/right organization topology;
- each member's directly selected PVP target and optional sheet marker;
- each member's four independent opening values.

The editing UI must allow incomplete intermediate states. Phase 1 calculation types do not. Therefore Phase 2 must keep these two layers separate:

1. an editable in-memory draft that may be incomplete or temporarily disconnected;
2. an immutable, validated setup bundle that Phase 3 can consume.

The Phase 2 output is a `ProjectSetupBundle` containing an in-memory `PlanProject` and a Phase 1-compatible `OrganizationSnapshotInput`. Phase 3 will add normalized date-by-member allocation cells. Phase 2 must not fabricate zero allocation cells or call `calculatePlan` merely to decide whether organization setup is complete.

## 2. Success Criteria

Phase 2 is successful when all of the following are true:

- A user can create a first-half or second-half project for a selected year and month.
- A default project title is derived from the selected period and remains editable.
- The in-memory project has status `IN_PROGRESS` and references the current organization snapshot ID.
- A root member and additional members can be created from explicit left/right add buttons.
- Every member card shows member ID, marker-prefixed name, selected PVP target, and completion state.
- Every member card has two explicit child slots: left and right.
- An empty child slot is displayed as `SELF` and offers a `+` action.
- An occupied child slot is displayed as `CHILD` and points to exactly one direct child.
- Drag-and-drop is not required for adding, moving, or reconnecting members.
- All four opening values default to numeric zero.
- A separate confirmation state records whether the operator checked those defaulted values against the company system.
- A member can be excluded from the active project without deleting descendant member data.
- When an intermediate member is excluded, its direct child subtrees are preserved and can be reattached.
- A one-child removal can promote that child into the vacated slot with one explicit action.
- A two-child removal never chooses a replacement automatically; both surviving subtrees remain available for guided reassignment.
- The derived `SELF/CHILD` state updates after every successful topology change.
- Invalid or incomplete topology cannot produce an active `ProjectSetupBundle`.
- Validation `ERROR` items block completion; `WARNING` items remain visible but do not block completion.
- Any draft mutation after completion immediately invalidates the active setup bundle and requires revalidation.
- Creating a new project never copies members, topology, or opening values from a previous project.
- The UI clearly states that Phase 2 has no persistent storage and a browser refresh discards the draft.
- All Phase 1 regression tests and coverage gates continue to pass.
- Type checking, automated tests, coverage, production build, and distribution smoke checks pass.

## 3. Approved Decisions and Terminology

### 3.1 No Technical Decision Is Required from the User

The implementation team owns framework, type, test, and architecture decisions. The user only needs to override behavior when the recommended behavior conflicts with the real workflow.

The following defaults are approved and do not require another confirmation step.

| Decision | Approved behavior | Rationale |
|---|---|---|
| UI framework | React + React DOM | The organization tree, form state, Phase 3 planning table, and later revision views benefit from component-based state management. |
| Component tests | Vitest + a DOM environment + Testing Library | User-visible behavior can be tested without moving Phase 1 calculation tests out of Node. |
| Organization editing | Free editing while the in-memory project is `IN_PROGRESS` | Phase 2 has no confirmed or actual plan revision yet. |
| Opening value defaults | Initialize all four fields to `0` | Zero is common and pre-filling it reduces repetitive typing. |
| Opening value safety | Keep a separate per-member `openingStateConfirmed` flag | A pre-filled zero must not silently mean that the company-system value was checked. |
| Member placement | Use left/right `+` buttons and explicit selectors | This matches the requested card-based workflow and avoids drag-and-drop complexity. |
| Intermediate member departure | Exclude the member and preserve surviving descendant subtrees for reassignment | Removing one person must not force the operator to re-enter every lower-level member. |
| Automatic promotion | Offer it only when there is exactly one direct child | With two direct children, the correct replacement depends on the business topology and cannot be inferred safely. |
| Project title | Update the derived title while untouched; preserve a manually edited title | Period changes must not overwrite deliberate user text. |
| Project lifecycle | Implement `IN_PROGRESS` only in Phase 2 | `CLOSED`, read-only history, and persistent snapshots belong to Phase 6. |
| Visual theme | Reuse the ngcatalogue/Atomy-inspired color system defined in section 3.3 | The related applications should feel like one family. |

### 3.2 Canonical Topology Terms

| Term | Definition |
|---|---|
| `root member` | The single active member with no parent in a valid organization snapshot. |
| `direct child` | A member connected immediately below a parent in either the left or right slot. |
| `descendant` | Any active member below another member at any depth. |
| `descendant subtree` | A direct child and every active descendant below that child. Internal connections inside the subtree are preserved when its root is detached. |
| `empty child slot` | A parent's left or right slot with no direct child. Its derived business direction is `SELF`. |
| `occupied child slot` | A parent's left or right slot containing exactly one direct child. Its derived business direction is `CHILD`. |
| `exclude member` | Remove one member from the active project organization without destructively deleting surviving descendant data. |
| `detach subtree` | Remove only the connection between a subtree root and its former parent while preserving the subtree's internal connections. |
| `reassignment queue` | A derived UI list of active subtree roots that are temporarily disconnected and must be attached before completion. |
| `promote child` | Attach the only direct child of an excluded member to the excluded member's former parent and former side. |
| `active setup bundle` | The most recent validated `ProjectSetupBundle` that Phase 3 is allowed to consume. |

Avoid vague implementation terms such as "delete the lower levels." Commands must say exactly whether they exclude one member, detach one subtree, or remove an accidental empty draft record.

### 3.3 Approved UI Theme

Use the clean, work-oriented layout of the global Atomy site and the existing ngcatalogue palette. Do not reproduce shopping banners, promotional carousels, or dense commerce navigation.

Create one theme source, preferably `src/ui/theme.css`, with these tokens:

```css
:root {
  --color-accent: #25b7e8;
  --color-accent-strong: #0aa5dc;
  --color-accent-action: #087ea4;
  --color-accent-soft: #e8f8fd;
  --color-text: #111827;
  --color-muted: #606b78;
  --color-background: #f4f5f7;
  --color-panel: #ffffff;
  --color-line: #d9dde3;
  --color-danger: #9b2c2c;
  --color-danger-soft: #fff5f5;
  --color-success: #1f7a3b;
  --color-success-soft: #f0fff4;
  --radius-control: 8px;
  --shadow-panel: 0 4px 16px rgba(17, 24, 39, 0.06);
}
```

Usage rules:

- Use `--color-accent` for decorative highlights, selected outlines, and larger icons.
- Use `--color-accent-action` for primary button backgrounds and small cyan text that must be readable on white.
- Use white panels over the light gray application background.
- Use dark text for primary information and muted gray only for secondary descriptions.
- Never communicate error, warning, selection, or completion state by color alone.
- Keep controls simple: 8 px radius, thin borders, restrained shadows, and generous spacing.
- Use a Korean-readable system font stack or Noto Sans KR when available without adding a blocking font dependency.

## 4. In Scope

### 4.1 Project Draft

- Target year and month.
- `FIRST_HALF` or `SECOND_HALF`.
- Derived default title and manual-title state.
- Fixed timezone `Asia/Seoul`.
- Stable in-session `projectId`.
- `IN_PROGRESS` project state.
- Derived UI state: `EDITING` or `READY`.
- Explicit reset/new-project action with a warning before replacing a non-empty draft.

### 4.2 Member Draft Data

- Stable in-session `memberKey` that is not derived from array order, name, or company member ID.
- Company member ID, member name, selected PVP target (`2400 | 1500 | 700`), and optional sheet marker (`NONE | PINK_1 | GREEN_2 | BLUE_3 | PURPLE_4`).
- Active or excluded project participation state.
- Parent member key and `LEFT/RIGHT` placement for active placed members.
- Four independent opening value strings and per-member confirmation state.

### 4.3 Card-Based Organization Editing

- One visible card per active member.
- Two explicit child-slot controls below each card.
- `+ Add left` and `+ Add right` actions for empty slots.
- Each `+` action can create a new member or attach a subtree root from the reassignment queue.
- Selecting a card opens its detail form.
- Moving an existing subtree uses parent/side controls or an attach action, not drag-and-drop.
- Empty slots derive `SELF`; occupied slots derive `CHILD`.
- The tree viewport supports horizontal scrolling.
- Completed branches can be collapsed and expanded.
- A fit-to-view or compact overview may be added only if it does not replace accessible card controls.

### 4.4 Opening Values

Every newly created member starts with:

```ts
{
  fortnightPvpOpeningCredit: '0',
  dailyCarryPvp: '0',
  dailyCarryLeft: '0',
  dailyCarryRight: '0',
  openingStateConfirmed: false,
}
```

The four numeric fields remain independent. Editing one field must not change another. The operator confirms the set once per member with a control such as `Company-system opening values checked`.

All four values may legitimately remain zero. Completion depends on confirmation, not on requiring a non-zero value.

### 4.5 Non-Destructive Member Exclusion and Reassignment

The active organization may change because a member leaves after the structure was initially prepared. Phase 2 models this as a topology edit, not destructive recursive deletion.

Required behavior:

- Excluding a member removes only that member from the active organization.
- The excluded member's parent connection is removed.
- Each direct child's descendant subtree remains intact.
- Any surviving subtree root that is not immediately promoted becomes unplaced and appears in the reassignment queue.
- The former parent slot becomes empty and derives `SELF` until another subtree is attached.
- Excluded members are omitted from normalized `OrganizationSnapshotInput`.
- All active members must be connected to exactly one root before completion.

| Excluded member topology | Required UI behavior |
|---|---|
| No direct children | Exclude the member and free the former parent slot. |
| Exactly one direct child | Offer `Promote child to this slot` and `Move subtree to reassignment queue`. Promotion is explicit, not silent. |
| Two direct children | Do not choose automatically. Detach both descendant subtrees and show both roots in the reassignment queue. |
| Excluded member is the root | Detach every direct-child subtree and require the user to choose or create a new root. |

An accidentally created member record with no meaningful data and no direct children may have a separate `Discard empty draft member` action. This action is not used for normal business departures.

### 4.6 Validation and Normalization

- Draft-level required-field and parsing feedback.
- Atomic add, attach, move, exclude, detach, and promote commands.
- Public Phase 1-compatible `validatePeriod` and `validateOrganizationSnapshot` contracts.
- Explicit string-to-number parsing that never relies on `Number('') === 0`.
- Validation severity, code, location, message, and suggestion preservation.
- Failure with no partial bundle when any `ERROR` remains.
- Success with preserved warnings when no `ERROR` remains.
- Immutable `ProjectSetupBundle` creation.
- Immediate active-bundle invalidation after any successful draft mutation.

### 4.7 Baseline Usability

- Explicit labels and help text.
- Keyboard access to project creation, card selection, left/right add actions, reassignment, and member forms.
- Error summary linked to the corresponding field or member card.
- Visible focus styles.
- Narrow-screen stacking of form and organization viewport.
- Safe horizontal scrolling for wide trees.
- `/ngplan/` static deployment path compatibility.

Phase 2 includes functional baseline accessibility. Formal browser, performance, and accessibility certification remains Phase 7 work.

## 5. Out of Scope

- Date-by-date PVP, left, or right plan allocation entry.
- The spreadsheet-like planning table and calculation result presentation.
- Automatic PV allocation, optimization, or candidate comparison.
- Confirmed-plan, actual-value, or re-simulation revisions.
- Applying organization changes to an already confirmed or actual plan.
- Persistent project history and revision invalidation rules.
- `CLOSED` transition and read-only archive behavior.
- `localStorage`, `sessionStorage`, IndexedDB, file/server storage, accounts, synchronization, autosave, or refresh recovery.
- Copying opening values from a previous project.
- Import, export, PDF, spreadsheet, or print output.
- Drag-and-drop member placement.
- Multiple-project search or dashboards.
- Custom domain setup and production operations.
- Formal accessibility and supported-browser certification.

Changing the organization after a spreadsheet-like plan exists is a required future workflow, but its revision and recalculation behavior belongs to Phase 5. Phase 2 preserves stable member keys and descendant subtree data so Phase 5 can create a new organization snapshot and recalculate instead of forcing manual formula edits.

## 6. Architecture and Target Files

### 6.1 Layer Responsibilities

| Layer | Responsibility | Must not do |
|---|---|---|
| UI | Render forms, cards, slots, queue, status, and validation feedback | Reimplement topology or calculation rules |
| Application draft | Hold incomplete strings, member state, selection, and atomic commands | Pretend incomplete data is a Phase 1 canonical input |
| Topology operations | Add, attach, move, exclude, detach, and promote without partial mutation | Delete surviving descendant subtrees |
| Normalization | Parse strings, select active members, build candidates, publish success/failure | Convert blank strings to zero implicitly |
| Phase 1 domain | Own period, PV, and canonical organization validation | Depend on React or DOM state |
| Phase 1 engine | Calculate only after Phase 3 supplies complete allocation cells | Receive fake Phase 2 allocation cells |

UI components import application APIs. They do not import private validation helpers or calculation internals.

### 6.2 Core Contracts

| Contract | Required content |
|---|---|
| `ProjectSetupDraft` | Project fields, title source state, members, selected member, root key, active bundle reference |
| `MemberDraft` | Stable key, active/excluded state, identity fields, PVP-target string, sheet marker, placement, opening draft |
| `OpeningStateDraft` | Four numeric strings defaulted to `'0'` plus `openingStateConfirmed` |
| `PlacementDraft` | Parent key and side; a temporary unplaced state is allowed only in the draft |
| `ReassignmentQueueEntry` | Active disconnected subtree root and context explaining why reassignment is required |
| `TopologyCommandOutcome` | Success with new immutable draft/change summary, or failure with original draft unchanged |
| `OrganizationChangeSummary` | Excluded key, detached subtree roots, promoted key if any, vacated parent and side |
| `ProjectSetupValidation` | Errors, warnings, field locations, reassignment requirements, readiness |
| `NormalizeProjectSetupOutcome` | Success bundle/warnings, or errors/warnings with no bundle |
| `PlanProject` | ID, title, period, timezone, `IN_PROGRESS`, organization snapshot ID |
| `ProjectSetupBundle` | `PlanProject` plus Phase 1 `OrganizationSnapshotInput`; not a persisted archive model |

The reassignment queue is derived from active members that are not the selected root and currently have no parent after a structural edit. It is not a second authoritative organization representation.

### 6.3 Phase 1 Public Contract Extensions

Extract reusable public validation without changing calculation semantics:

- `validatePeriod(input: unknown): ValidationReport`
- `validateOrganizationSnapshot(input: unknown): ValidationReport`

`validatePlan` calls the same internal implementations so Phase 2 and Phase 1 cannot disagree. Both public functions validate runtime structure before reading nested properties. Existing validation codes, ordering, locations, and Phase 1 results remain stable.

### 6.4 Expected File Changes

#### Foundation

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | Add React and DOM-test dependencies plus `preview` and `smoke:dist` scripts. |
| `tsconfig.json` | Enable JSX while preserving strict options. |
| `vitest.config.ts` | Add `.test.tsx`, separate Node/DOM environments, and per-layer coverage gates. |
| `src/main.tsx` | Mount React and import the theme. |
| `index.html` | Update product title and entry path. |
| `scripts/check-dist.mjs` | Check `/ngplan/` asset URLs and referenced artifacts. |

Do not add a router in Phase 2.

#### Application

| File | Change |
|---|---|
| `src/application/project-setup/types.ts` | Define drafts, topology states, outcomes, summaries, project core, and bundle. |
| `src/application/project-setup/create-project-draft.ts` | Create fresh projects with zeroed/unconfirmed openings and no previous input. |
| `src/application/project-setup/edit-member.ts` | Edit identity, PVP target, sheet marker, opening values, and confirmation. |
| `src/application/project-setup/edit-topology.ts` | Atomic add, attach, move, exclude, detach, and promote commands. |
| `src/application/project-setup/derive-topology.ts` | Derive child indexes, `SELF/CHILD`, traversal, and reassignment queue. |
| `src/application/project-setup/validate-draft.ts` | Validate incomplete strings, confirmations, and queue readiness. |
| `src/application/project-setup/normalize-project-setup.ts` | Build and validate period, organization input, project, and bundle. |
| `src/application/project-setup/map-validation-issues.ts` | Map locations to forms, cards, slots, and queue entries. |

#### Phase 1 Boundary

| File | Change |
|---|---|
| `src/domain/validation.ts` | Extract period-only and organization-only validation on the existing implementation. |
| `src/engine/index.ts` | Re-export approved public validation and period contracts. |
| `src/domain/__tests__/validation.test.ts` | Add public-contract and regression-equivalence tests. |

#### UI

| File | Change |
|---|---|
| `src/ui/theme.css` | Store approved Atomy/ngcatalogue theme tokens. |
| `src/ui/styles.css` | Layout, responsive behavior, focus, tree viewport, and card states. |
| `src/ui/App.tsx` | Compose project setup flow. |
| `src/ui/components/ProjectPeriodForm.tsx` | Period and derived/manual title. |
| `src/ui/components/OrganizationTree.tsx` | Render tree from parent/side relationships. |
| `src/ui/components/MemberCard.tsx` | Marker-prefixed identity, PVP target, confirmation, errors, and two child slots. |
| `src/ui/components/ChildSlot.tsx` | `SELF/CHILD` and left/right `+` actions. |
| `src/ui/components/MemberForm.tsx` | Identity, optional sheet marker, parent, and side. |
| `src/ui/components/OpeningStateForm.tsx` | Four zero-defaulted values and confirmation. |
| `src/ui/components/ReassignmentQueue.tsx` | Detached subtree roots and attach actions. |
| `src/ui/components/ExcludeMemberDialog.tsx` | Explain exclusion consequences before mutation. |
| `src/ui/components/ValidationSummary.tsx` | Errors/warnings and navigation to sources. |

#### Tests and Documents

| File | Change |
|---|---|
| `src/application/project-setup/__tests__/*.test.ts` | Draft, topology, exclusion, queue, validation, normalization. |
| `src/ui/__tests__/*.test.tsx` | Cards, queue, confirmation, feedback, keyboard. |
| `.github/workflows/ci.yml` | Run UI tests and `smoke:dist`. |
| `docs/TECHNICAL_DESIGN.md` | Record stack, state policy, exclusion semantics, and theme. |
| `docs/ROADMAP.md` | Clarify Phase 2 setup, Phase 5 post-plan changes, and Phase 6 closure/storage. |
| `docs/devlog/YYYY-MM-DD.md` | Record actual implementation and decisions in Korean. |

## 7. Work Packages

### PRE-WP0 — Synchronize Approved Decisions

1. Record React and DOM tests in `TECHNICAL_DESIGN.md`.
2. Record zero-defaulted openings plus per-member confirmation.
3. Record non-destructive exclusion and reassignment terminology.
4. Record left/right `+` workflow and no-drag decision.
5. Record Phase 2/5/6 ownership of topology changes, revisions, closure, and persistence.
6. Record the approved theme tokens.

Completion gate:

- No Phase 2 implementation decision remains assigned to the user.
- Design documents match this plan.
- Post-plan recalculation remains assigned to Phase 5.

### WP1 — React Foundation, Theme, and App Shell

1. Install only approved UI/test dependencies.
2. Preserve strict TypeScript and Node-based Phase 1 tests.
3. Create the app shell with centralized theme tokens.
4. Show `New project` and the no-storage/refresh-loss notice.
5. Verify `/ngplan/` rendering.

Completion gate:

- The themed shell renders in development and production.
- Components do not hard-code duplicate colors.
- No unnecessary router, state library, or storage package is added.

### WP2 — Project Draft and Opening Values

1. Implement injectable ID generation.
2. Create a fresh-project factory with no previous-project input.
3. Initialize four openings to `'0'` and confirmation to `false`.
4. Parse periods through Phase 1 validation.
5. Implement derived/manual title behavior.
6. Add per-member company-system confirmation.
7. Invalidate readiness on any edit.

Completion gate:

- No previous topology or opening data is inherited.
- Zero is valid, but unconfirmed members cannot complete setup.
- Opening fields remain independent.
- Manual titles are not overwritten.

### WP3 — Member Cards and Explicit Child Slots

1. Create the root-member flow.
2. Render compact cards and two child slots per member.
3. Add new members or queued subtrees through `+` actions.
4. Derive `SELF/CHILD` from placement only.
5. Move subtrees through explicit controls, never drag-and-drop.
6. Add horizontal scrolling and branch collapse/expand.

Completion gate:

- Multi-level topology can be built only with cards and explicit controls.
- Visible tree and derived directions always match draft topology.
- Keyboard users can select cards and activate child slots.

### WP4 — Non-Destructive Exclusion and Reassignment

1. Implement atomic `exclude member`.
2. Preserve every surviving descendant subtree.
3. Implement no-child, one-child promotion/detachment, two-child queueing, and root exclusion.
4. Show consequences before applying exclusion.
5. Keep failed commands from changing the draft.
6. Invalidate the active bundle after every successful structural edit.

Completion gate:

- Intermediate-member exclusion never deletes surviving descendant data.
- Internal subtree connections remain unchanged.
- Two-child exclusion never makes an automatic placement choice.
- Every unplaced active subtree root appears exactly once in the queue.
- Completion is blocked until the queue is empty and one valid root exists.

### WP5 — Canonical Validation and Setup Bundle

1. Extract public period and organization validators.
2. Keep `validatePlan` on the same implementation.
3. Parse draft strings explicitly.
4. Omit excluded members from the canonical candidate.
5. Reject active unplaced members and all invalid topology.
6. Publish a bundle only with no errors, empty queue, and confirmed openings.
7. Preserve warnings.
8. Never fabricate allocations or call `calculatePlan`.

Completion gate:

- Valid drafts produce exact Phase 1-compatible organization input.
- Invalid drafts produce no partial bundle.
- Existing Phase 1 validation behavior remains stable.
- Validation does not mutate drafts or published bundles.

### WP6 — Integrated Flow and Baseline Accessibility

1. Compose project form, tree, member form, queue, and validation summary.
2. Link errors to fields/cards and show warnings without blocking.
3. Block completion on errors, unconfirmed values, or queued subtrees.
4. Show a readable setup-bundle summary.
5. Clear readiness after later draft mutation.
6. Verify keyboard order, focus, labels, narrow layouts, and wide-tree scrolling.

Completion gate:

- A valid multi-level organization can be built without developer tools.
- A departing intermediate member can be excluded and descendants reconnected without re-entry.
- Errors identify the affected field, member, slot, or queue entry.
- No Phase 3+ feature appears.

### WP7 — Regression, Coverage, Build, and Documentation

1. Connect section 9 cases to tests.
2. Preserve 95% coverage gates for `src/domain/**` and `src/engine/**`.
3. Require 95% for `src/application/**`.
4. Require 85% branches and 90% functions/lines/statements for tested `src/ui/**` code.
5. Run typecheck, tests, coverage, build, and `smoke:dist` separately.
6. Run manual preview at `/ngplan/`.
7. Update Korean development log and roadmap only after verification.

## 8. State and Command Contracts

### 8.1 Draft-to-Bundle Pipeline

| Step | Operation | Output |
|---:|---|---|
| 1 | Edit UI strings or run explicit command | New immutable draft; active bundle cleared |
| 2 | Draft validation | Field issues, queue state, confirmation state |
| 3 | Explicit parsing | Period/member/opening candidates |
| 4 | Candidate construction | `PeriodInput` and `OrganizationSnapshotInput` candidate |
| 5 | Canonical validation | Phase 1 validation reports |
| 6 | Publish with no errors and all confirmations complete | Immutable bundle and preserved warnings |
| 7 | Display ready state | Phase 3-ready summary |

### 8.2 Topology Command Outcomes

| Command | Success behavior |
|---|---|
| Add member to empty slot | Create stable key, connect parent/side, default openings to zero/unconfirmed |
| Attach queued subtree | Connect subtree root to selected empty slot; preserve internal edges |
| Move placed subtree | Atomically release old slot and occupy new empty slot |
| Exclude member with no direct children | Mark excluded and free former parent slot |
| Exclude with one child and promote | Mark excluded; connect child to former parent/side |
| Exclude with one child and detach | Mark excluded; place child subtree root in queue |
| Exclude with two children | Mark excluded; place both subtree roots in queue |
| Exclude root | Mark root excluded; queue direct-child subtrees; clear root selection |

Every failed command leaves the original draft value unchanged. Every successful command clears the active setup bundle.

### 8.3 Post-Plan Topology Changes

Phase 2 does not implement changes to an existing plan revision, but it prepares for the common workflow:

- Member keys stay stable across reconnection.
- Exclusion never destroys surviving members.
- Topology commands return an `OrganizationChangeSummary`.
- Phase 5 can create a new organization snapshot from the edited draft.
- Phase 5 defines which draft/confirmed/actual revisions are invalidated, copied, or recalculated.
- Phase 5 recalculates derived left/right and `SELF/CHILD` behavior through Phase 1 instead of requiring manual formula edits.

## 9. Test Plan

### 9.1 Required Commands

1. `npm run typecheck`
2. `npm test -- --run`
3. `npm run test:coverage`
4. `npm run build`
5. `npm run smoke:dist`

Then run `npm run preview` and verify the application manually.

### 9.2 Automated Acceptance Cases

| ID | Case | Expected result |
|---|---|---|
| P2-PROJ-001 | Create July 2026 first-half project | Correct period and derived title |
| P2-PROJ-002 | Change across 28/29/30/31-day months | Phase 1 period derivation remains correct |
| P2-PROJ-003 | Start new project from non-empty draft | No member/topology/opening data copied |
| P2-PROJ-004 | Change period before/after manual title edit | Derived title updates only before manual edit |
| P2-OPEN-001 | Create new member | Four opening strings are `'0'`; confirmation false |
| P2-OPEN-002 | Keep zeros and confirm | Opening state valid |
| P2-OPEN-003 | Keep defaults unconfirmed | Completion blocked |
| P2-OPEN-004 | Negative, fractional, text, unsafe value | Stable field error |
| P2-OPEN-005 | Edit one opening field | Other fields unchanged |
| P2-MEMBER-001 | Duplicate names, unique company IDs | Allowed |
| P2-MEMBER-002 | Duplicate company ID | Completion blocked with location |
| P2-CARD-001 | Add left/right through `+` | Correct parent/side |
| P2-CARD-002 | Add to occupied slot | Failure; draft unchanged |
| P2-CARD-003 | Add child to empty slot | `SELF` becomes `CHILD` |
| P2-CARD-004 | Detach only child | `CHILD` becomes `SELF` |
| P2-MOVE-001 | Move subtree to empty slot | Entire subtree moves; internal edges unchanged |
| P2-MOVE-002 | Move under self/descendant | Cycle rejected; draft unchanged |
| P2-EXCL-001 | Exclude member with no direct children | Former parent slot becomes `SELF` |
| P2-EXCL-002 | Exclude one-child member and promote | Child occupies former slot |
| P2-EXCL-003 | Exclude one-child member and detach | Subtree root queued once |
| P2-EXCL-004 | Exclude two-child member | Both subtrees preserved/queued; no automatic promotion |
| P2-EXCL-005 | Exclude intermediate member with deep descendants | All surviving descendants and internal edges preserved |
| P2-EXCL-006 | Exclude root | Root cleared; surviving child subtrees queued |
| P2-QUEUE-001 | Attach queued subtree through `+` | Queue entry removed; topology connected |
| P2-QUEUE-002 | Queue is non-empty | Completion blocked |
| P2-NORM-001 | Valid confirmed draft | Exact project/setup bundle produced |
| P2-NORM-002 | Any error | No partial bundle |
| P2-NORM-003 | Warnings only | Bundle produced with warnings preserved |
| P2-NORM-004 | Repeated validation with injected IDs | Draft unchanged; deterministic result |
| P2-READY-001 | Edit after completion | Active bundle and ready state cleared |
| P2-REG-001 | Compare organization validator and `validatePlan` | Shared errors/locations identical |
| P2-UI-001 | Build topology with keyboard and `+` | Core flow completes without mouse/drag |
| P2-UI-002 | Complete with errors | Blocked; summary links to source |
| P2-UI-003 | Render wide topology | Viewport scrolls without clipping controls |
| P2-THEME-001 | Render primary controls/statuses | Approved tokens used; status not color-only |
| P2-PAGES-001 | Run `smoke:dist` after build | `/ngplan/` assets and artifacts valid |

### 9.3 Manual Browser Case — P2-PAGES-002

1. Start `npm run preview` and open `/ngplan/`.
2. Confirm the themed first screen renders.
3. Create a root member and add one left and one right member through `+`.
4. Confirm default zero values remain visibly unconfirmed.
5. Exclude an intermediate member and confirm surviving subtrees appear for reassignment.
6. Record the result in the Korean development log.

## 10. Review Checkpoints

### A — Phase Boundary

- No planning grid, result table, optimizer, actual values, persistence, or closure workflow.
- Post-plan topology change documented for Phase 5, not partially implemented in Phase 2.

### B — Draft versus Canonical Input

- Incomplete draft is never cast to Phase 1 input.
- Default zero and confirmed zero remain distinguishable.
- Errors return no bundle; warnings do not block.
- Published bundles stay immutable and become inactive after any edit.

### C — Topology Authority

- `parentMemberKey + sideAtParent` is the only canonical connection source.
- Child indexes, `SELF/CHILD`, and queue are derived.
- Failed commands never partially mutate topology.
- Exclusion never recursively deletes surviving subtrees.

### D — Reassignment

- No-child, one-child, two-child, and root exclusion are distinct.
- Promotion is explicit.
- Two-child exclusion never makes an automatic business decision.
- Queued subtrees attach through the same left/right `+` controls.
- Completion is impossible while any active subtree is unplaced.

### E — Opening Values

- Four fields default independently to zero.
- Separate confirmation prevents silent acceptance of unchecked defaults.
- New projects never import previous openings.

### F — UI and Theme

- Cards expose explicit left and right slots; no essential action depends on drag.
- Wide trees scroll safely and branches collapse.
- Tokens are centralized and match the approved palette.
- Primary actions use darker action cyan.
- State has text/icon cues in addition to color.

### G — Regression and Deployment

- Phase 1 tests and per-layer coverage remain intact.
- Node and DOM tests use separate environments.
- `smoke:dist` checks `/ngplan/`; manual preview checks real behavior.

## 11. Major Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Pre-filled zero mistaken for checked value | Incorrect opening state | Require separate per-member confirmation |
| Intermediate exclusion recursively deletes descendants | Data loss/manual re-entry | Preserve subtrees and use reassignment queue |
| App chooses between two child subtrees | Incorrect business topology | Queue both and require explicit placement |
| Queue becomes second topology store | Conflicting representations | Derive from active unplaced roots |
| Parent and child links both authoritative | Inconsistent graph after move | Store child-to-parent placement only |
| Partial mutation during command | Missing/duplicated members | Pure atomic outcomes and immutability tests |
| Identity based on array index/company ID | Broken references after edit | Stable injected internal keys |
| Old bundle remains active after edit | Phase 3 consumes stale topology | Clear bundle on every mutation |
| Fake allocations test readiness | Phase coupling | Period/organization-only validators |
| Browser persistence added for convenience | Phase 6 policy preempted | Prohibit persistence in Phase 2 |
| Tree width grows without bounds | Unreadable cards | Scroll viewport, compact cards, collapse |
| Bright cyan used for small text | Poor readability | Use `#087ea4` action cyan |
| Router ignores Pages base | Deployed white screen | No router; `/ngplan/` smoke test |

## 12. Definition of Done

Phase 2 is complete only when:

- Approved decisions are synchronized into technical design and roadmap.
- The themed React app renders at `/ngplan/`.
- A half-month `PlanProject` can be created in memory.
- A multi-level organization can be built through left/right `+` controls.
- Identity, PVP target, optional sheet marker, placement, four opening values, and confirmation are editable.
- Openings default to zero and require separate confirmation.
- `SELF/CHILD` is derived and updates after structural commands.
- No-child, one-child, two-child, and root exclusions preserve all surviving data and follow their defined reassignment behavior.
- All active members form one connected, acyclic, single-root organization before completion.
- A valid confirmed draft produces a Phase 1-compatible `ProjectSetupBundle`.
- Errors block publication; warnings are preserved.
- Any later edit invalidates the active bundle.
- Phase 1 validation is reused rather than duplicated.
- Keyboard, focus, error-link, narrow-screen, and wide-tree baseline checks pass.
- Theme tokens and contrast follow the approved Atomy/ngcatalogue palette.
- Typecheck, tests, per-layer coverage, build, and `smoke:dist` pass.
- Manual preview confirms card addition, zero confirmation, and reassignment.
- No Phase 3+ planning, optimization, revision, persistence, closure, or domain work is implemented.
- Korean development log records implementation, verification, limitations, and deferred Phase 5 behavior.

After Phase 2, Phase 3 consumes only the immutable `ProjectSetupBundle`, not React state or mutable drafts. Phase 5 later uses the same stable identities and non-destructive topology operations to rebuild a plan after a member leaves, eliminating manual spreadsheet-formula repair.
