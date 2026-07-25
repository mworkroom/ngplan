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

## Final result

final result: passed
