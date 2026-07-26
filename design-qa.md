# Member Card Design QA

## Comparison target

- Source visual truth:
  - `C:\Users\Marion\Desktop\IMG 005.png` — 847 × 414 px, annotated card-input target
  - `C:\Users\Marion\Desktop\IMG_0205.PNG` — 1170 × 2532 px, company organization-card reference
- Implementation screenshot:
  - `C:\Users\Marion\.codex\visualizations\2026\07\25\019f9a55-5e02-7860-9dcc-0d30e495f524\ngplan-card-audit\01-refined-member-cards.png`
  - 1405 × 1405 px full-page browser capture
- Combined comparison:
  - `C:\Users\Marion\.codex\visualizations\2026\07\25\019f9a55-5e02-7860-9dcc-0d30e495f524\ngplan-card-audit\02-source-implementation-comparison.png`
  - 1942 × 835 px; source and implementation tree region placed in one image
- Browser viewport: 1280 × 720 CSS px
- Browser device pixel ratio: 1.25
- Captured document: approximately 1406 × 1406 CSS px
- State: Sandra uses marker 2; Jacob has one connected-child slot and one self slot; tree scale 90%
- Density normalization: the browser capture is approximately one output pixel per captured document CSS pixel. The 847 × 414 source was retained at native size and centered next to the 971 × 835 implementation crop.

## Full-view comparison evidence

The revised cards retain the compact organization-tree density while moving closer to the company reference: thin flat borders, no panel shadow, underlined member names, compact metadata, and small status badges. The tree hierarchy and connector positions remain intact.

## Focused region comparison evidence

A focused comparison was required because the requested changes concern the marker surface and the two slot controls. In the combined comparison:

- Sandra's green marker now fills the complete name, ID, target, and opening-value summary area.
- Jacob's connected and self slots have identical outer dimensions.
- Both slot actions render as equal 42 × 42 CSS px buttons before tree scaling, with a 4 px radius.

## Required fidelity surfaces

- Fonts and typography: existing application font stack retained; member names use a compact bold weight and underline like the company cards. Metadata and opening values remain readable at the current tree scale.
- Spacing and layout rhythm: card padding is divided into a summary block, equal slot grid, and footer. Slot labels and buttons share fixed rows, eliminating mixed-state misalignment.
- Colors and visual tokens: existing marker colors remain unchanged, but card markers now color the entire summary block. Success, danger, and selection colors retain their existing semantic meaning.
- Image quality and asset fidelity: the reference contains no raster assets that belong inside this component. No replacement imagery or generated assets were required.
- Copy and content: existing member names, IDs, targets, opening values, `스스로`, plus/minus actions, completion states, and collapse controls are preserved.

## Findings

No actionable P0, P1, or P2 visual differences remain for the requested scope.

## Interaction and browser checks

- Selected a member card and changed its marker to `2 · 연두색`.
- Added a child to create the mixed connected/self slot state.
- Confirmed both slot containers and both action buttons have matching geometry.
- Confirmed the marker summary background is `rgb(217, 234, 211)`.
- Confirmed browser console warnings/errors: none.

## Comparison history

### Initial findings

- P1: the marker color covered only the text-selection button, leaving the opening-value row outside the intended colored header.
- P2: self and connected slots had different row structures, so their action controls did not read as one consistent pair.
- P2: wide rectangular controls and panel shadows drifted from the flat, compact company-card reference.

### Fixes made

- Grouped identity, target, status, and opening values into one marker-colored summary block.
- Gave every slot the same two-row layout and reserved label row.
- Set every slot action to 42 × 42 CSS px with a 4 px radius.
- Removed the member-card shadow, reduced the card radius, tightened typography, and underlined member names.

### Post-fix evidence

- `02-source-implementation-comparison.png` shows the full green Sandra summary and equal square Jacob controls.
- Browser geometry confirmed equal slot and button dimensions in the mixed state.

## Follow-up polish

- P3: fixture data uses `확인` rather than `완료`; this is validation-state content, not a component-style mismatch.

## Latest requested refinement

- Source visual truth: `C:\Users\Marion\Desktop\IMG 006.png` (687 x 535 px).
- Browser implementation capture: `C:\Users\Marion\.codex\visualizations\2026\07\25\019f9a55-5e02-7860-9dcc-0d30e495f524\ngplan-card-audit\04-refined-card-actions-viewport.png` (491 x 822 px).
- Combined comparison: `C:\Users\Marion\.codex\visualizations\2026\07\25\019f9a55-5e02-7860-9dcc-0d30e495f524\ngplan-card-audit\05-actions-source-comparison.png` (1178 x 822 px).
- Browser state: 506 x 848 CSS px viewport, 90% tree scale, Sandra selected, mixed connected/self slots present.
- Selected-card evidence: 3 px border on all four sides; no inset line and no box shadow.
- Action-color evidence: connected-member removal uses filled danger red; self/add uses filled action blue; both use white foreground text.
- Slot-container evidence: no border and transparent background.
- Collapse-control evidence: gray text, 2 x 6 px padding, and approximately 24 CSS px unscaled minimum height.
- Status-badge evidence: horizontal `확인`, `white-space: nowrap`, and 999 px radius.
- Console warnings/errors: none.
- Required fidelity surfaces remain satisfied: compact typography, reduced spacing, semantic colors, no image assets, and unchanged application copy.
- Comparison history: the source showed a left-only selected line, outline-only actions, dotted slot boxes, oversized collapse controls, and a vertical status badge. The post-fix combined comparison shows each requested correction.
- Findings: no actionable P0, P1, or P2 differences remain for this refinement.

## Muted action-color refinement

- Source visual truth: `C:\Users\Marion\Desktop\IMG 004.png`.
- Browser implementation capture: `C:\Users\Marion\.codex\visualizations\2026\07\25\019f9a55-5e02-7860-9dcc-0d30e495f524\ngplan-card-audit\06-muted-card-actions.png`.
- Combined comparison: `C:\Users\Marion\.codex\visualizations\2026\07\25\019f9a55-5e02-7860-9dcc-0d30e495f524\ngplan-card-audit\07-muted-actions-source-comparison.png`.
- The Atomy blue remains on the selected-card outline and is no longer used by add controls.
- Add-control background and the SVG tree connector share `rgb(174, 188, 204)`.
- Remove controls use the warning palette: `rgb(255, 246, 245)` background with `rgb(166, 43, 34)` border and glyph.
- Cards without a collapse control retain approximately 10 CSS px of space below the slot grid.
- Selected-card emphasis remains a full 3 px blue border.
- Findings: no actionable P0, P1, or P2 differences remain for the requested muted-color and spacing scope.

## Previous final result

The member-card scope passed.

# Same-row Control Alignment QA

## Comparison target

- Source visual truth: `C:\Users\Marion\Desktop\IMG 001.png` (2048 × 861 px).
- Implementation screenshot: `C:\Users\Marion\.codex\visualizations\2026\07\26\019f9f51-d43d-7e40-aac7-8ecebf987328\ngplan-button-alignment\01-button-alignment-implementation.png` (2048 × 862 px).
- Combined focused comparison: `C:\Users\Marion\.codex\visualizations\2026\07\26\019f9f51-d43d-7e40-aac7-8ecebf987328\ngplan-button-alignment\02-source-implementation-comparison.png` (1824 × 530 px).
- Browser viewport: 2048 × 861 CSS px requested; Chrome reported 2048 × 862 CSS px.
- Density normalization: source and implementation were captured at the same 2048 px width. The comparison uses focused crops scaled within equal-width source and implementation columns.
- State: signed-in planning controls reproduced with the production CSS and the same component class structure. The authenticated data screen itself was unavailable on the local origin, so no project data or login state was changed.

## Full-view comparison evidence

The implementation screenshot shows all three requested control groups in their desktop positions. The toolbar, page-header actions, and organization controls retain their existing hierarchy, colors, borders, and compact density.

## Focused region comparison evidence

Focused comparison was required because the requested differences were only a few pixels:

- Toolbar button and save status share a 40 px computed height and a 4 px radius.
- `새 계획`, `수동 플랜 열기`, and `자동 플랜 만들기` share a 40 px authored height. Inside the 90% compact workspace zoom, all three render at 36 px with the same top coordinate.
- Participation status, four organization zoom buttons, and the current-scale output share a 34 px authored height. Inside the 90% compact workspace zoom, all six render at 30.6 px with the same top coordinate.
- At a 700 × 900 px responsive viewport, the three groups retain uniform 40 px, 40 px, and 34 px heights respectively.

## Required fidelity surfaces

- Fonts and typography: the existing Noto Sans KR stack, weights, label sizes, and compact hierarchy were preserved. Status labels remain visually quieter than action buttons.
- Spacing and layout rhythm: control heights, vertical centering, padding, and 4 px radii now align within each row. Existing inter-control gaps were preserved.
- Colors and visual tokens: primary, secondary, saved-state, border, and muted-output tokens remain unchanged.
- Image quality and asset fidelity: the target contains no component image assets. No image generation or replacement assets were needed.
- Copy and content: all existing Korean button and status labels are unchanged.

## Findings

No actionable P0, P1, or P2 visual differences remain for the requested same-row alignment scope.

## Interaction and browser checks

- Verified computed geometry at desktop and 700 px responsive widths.
- Confirmed no browser console warnings or errors on the focused verification screen.
- Confirmed status elements remain non-buttons while matching adjacent control geometry.

## Comparison history

### Initial findings

- P2: the saved-state label was shorter than the adjacent toolbar button.
- P2: the participation badge was shorter than the organization zoom controls.
- P3: compact-workspace scaling could expose one-pixel rounding differences unless the header buttons shared one explicit height.

### Fixes made

- Applied a 40 px row height and shared vertical centering to toolbar controls.
- Applied a 40 px explicit height to the three page-header action buttons.
- Applied a 34 px row height to participation, zoom, and scale controls.

### Post-fix evidence

- The combined focused comparison shows matching top and bottom edges in each row.
- Browser geometry confirmed equal computed heights for every item in each group.

## Final result

final result: passed
