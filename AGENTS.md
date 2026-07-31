## Primary User and UI/UX Rules

### Primary User

The primary user of this application is a Korean woman in her 70s who:

- is not familiar with computers or technical terminology;
- may have difficulty processing many choices or instructions at once;
- has ADHD and should not be required to remember information from previous screens;
- needs large, explicit controls and predictable step-by-step flows.

Treat these characteristics as primary product requirements, not optional
accessibility enhancements.

Never display labels such as "컴맹", "노인", or "ADHD" in the user-facing UI.

### General UI Language

All user-facing text must be written in plain, conversational Korean.

- Use short sentences.
- Put only one main idea in each sentence.
- Prefer familiar everyday words over technical or administrative terms.
- Describe what the user can do and what will happen next.
- Do not explain the internal implementation unless that information changes
  the user's decision.
- Use one consistent term for the same concept throughout the application.
- Do not make the user interpret the difference between multiple technical
  terms that lead to the same action.
- A screen title and its primary button should be understandable without
  reading the rest of the screen.
- Button labels must describe the result of pressing the button, not the name
  of the internal function.
- Do not expose database terminology, retention algorithms, internal IDs,
  time-zone rules, revision numbers, or storage limits unless the user must
  act on that information.

Avoid user-facing terms such as:

- 스냅샷
- 체크포인트
- 리비전
- 순환 보관
- 워크스페이스
- 데이터베이스
- 최대 보관 개수
- 내부 시간대

If a technical term is unavoidable, explain it immediately in plain Korean.

### Project Title Is the Source of Truth

The stored project title is the canonical display title.

- Display the exact stored project title consistently on:
  - the project list;
  - the member input/setup screen;
  - the manual plan screen;
  - the automatic plan screen;
  - recovery and backup screens.
- Do not independently reconstruct a page heading from the year, month, or
  half-period fields when the project title is available.
- Do not replace or expand an established project title with a friendlier
  date description.
- `202608A 민경욱` must remain `202608A 민경욱`.
- Do not change it to `2026년 8월 상반기`.
- A human-readable period such as `2026년 8월 상반기` may be shown only as
  secondary information when it is genuinely useful.
- When the project title changes, every screen that displays the title must
  use the same updated value.

### Screen Structure

- Ask the user to make only one main decision per screen whenever possible.
- Show only one visually dominant primary action.
- Do not require the user to remember information from a previous screen.
- Hide empty sections and sections with zero items unless the empty state
  requires an action.
- Hide technical retention and storage details from the default view.
- Do not divide the UI into separate categories only because the backend uses
  different storage mechanisms.
- Present items according to the decision the user needs to make.
- Put advanced or administrative details behind an optional secondary view.

### Action and Confirmation Copy

Before an important action, explain:

1. what will remain unchanged;
2. what new result will be created;
3. whether the action can be reversed.

Use explicit result-oriented labels.

Bad:

- `사본으로 열기`
- `복구 실행`
- `15분 간격의 순환 보관본입니다. 계획마다 최대 672개를 유지합니다.`

Better:

- `이때 내용으로 새 계획 만들기`
- `7월 31일 내용으로 돌아가기`
- `작업하는 동안 15분마다 자동으로 저장한 내용입니다.`

For non-destructive recovery, prefer wording such as:

- `현재 계획은 지워지지 않습니다.`
- `원하는 시간을 고르면 그때 내용으로 새 계획이 만들어집니다.`

### UI Copy Acceptance Check

Before completing any UI change, review every visible user-facing string.

The change is not complete unless all of the following are true:

1. A Korean user in her 70s with low digital literacy can understand the text
   on the first reading.
2. The title makes the purpose of the screen clear.
3. The primary button makes its result predictable.
4. The user is not required to understand implementation details.
5. The same concept uses the same word throughout the flow.
6. The user is not required to remember, calculate, or compare unnecessary
   information.
7. The stored project title is displayed consistently across all screens.
8. Empty or non-actionable technical information has been removed from the
   default view.

Existing tests that assert unclear or inconsistent UI text are not a reason
to preserve that text. Update those tests when improving the user-facing copy.