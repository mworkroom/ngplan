# 피라미드앱 기술 설계

> 기준 요구사항: `docs/requirements/pyramid-app-requirements-v2.md`  
> 작성일: 2026-07-11  
> 최종 갱신일: 2026-07-12
> 문서 상태: Phase 4 자동 계획 확정 계약 반영 — 규칙·엔진 `3.0.0`, 정책·목적함수 `2.0.0`
> Phase 1 결정 확정일: 2026-07-11
> Phase 4 Q-SIM-01~06 확정일: 2026-07-12

## 1. 목적과 범위

이 문서는 피라미드앱의 권위 있는 데이터, 파생 데이터, 조직 실적 전파, 일일 장부, 보름 장부, 자동 계획, 부분 재시뮬레이션의 경계를 정의한다.

현재 단계에서는 실행 코드를 정의하지 않는다. 기술과 무관하게 지켜야 할 도메인 계약을 먼저 정하고, 기술 스택과 저장 방식은 해당 계약의 어댑터로 취급한다.

## 2. 핵심 설계 원칙

1. **원본과 파생값을 분리한다.** 사용자가 입력하거나 시뮬레이터가 배정한 값만 권위 있는 원본이다. 조직 합산, 잔액, 단계, 목표 상태는 언제든 다시 계산할 수 있는 파생값이다.
2. **두 장부를 분리한다.** 일일 장부의 초기화가 보름 장부의 날짜별 원본을 바꾸지 않는다.
3. **계산 코어를 순수하게 유지한다.** 저장소, 화면, 네트워크, 현재 시각을 계산 함수 안에서 읽지 않는다.
4. **PV는 정수로 계산한다.** 모든 PV는 1 PV 단위의 0 이상 정수이며 부동소수점으로 다루지 않는다.
5. **입력은 불변으로 취급한다.** 계산은 입력을 수정하지 않고 새 결과를 반환한다.
6. **결과를 재현할 수 있어야 한다.** 같은 정규화 입력, 데이터 스키마 버전, 규칙 버전, 엔진 버전은 같은 결과를 만든다.
7. **모든 중간값을 감사할 수 있어야 한다.** 원본 실적에서 상위 전파, PVP 적용, 단계 판정, 이월, 보름 판정까지 연결해서 볼 수 있어야 한다.
8. **최적화 결과를 계산 코어로 재검증한다.** 자동 계획기는 정답 판정기가 아니며 후보를 만드는 역할만 맡는다.
9. **과거 기록을 조용히 재해석하지 않는다.** 종료 스냅샷에는 당시 입력, 결과, 규칙·엔진 버전을 함께 보존한다.
10. **증명 상태를 과장하지 않는다.** 검증된 후보와 수학적으로 증명된 최적해를 구분하고, `OPTIMAL/INFEASIBLE`은 일치하는 모델 인증서와 완전한 증명이 있을 때만 반환한다.
11. **비즈니스 날짜와 조직 순서는 환경과 UI에서 독립적이다.** 날짜는 ISO date-only Gregorian 값으로 다루고, 회원 순서는 루트부터 LEFT 후 RIGHT로 순회한 안정적인 토폴로지 순서를 사용한다.

## 3. 논리 아키텍처

| 계층 | 책임 | 의존 가능 대상 |
|---|---|---|
| 도메인 규칙 | 타입, 상수, 불변조건, 반월 달력 | 없음 |
| 계산 코어 | 조직 전파, 일일 정산, 보름 평가 | 도메인 규칙 |
| 최적화 코어 | 계획 후보 생성, 정확한 목적함수 비교, 모델 인증과 후보 검증 | 도메인 규칙, 계산 코어 |
| 애플리케이션 | 프로젝트 상태 전이, 리비전, 명령 조합 | 도메인·계산·최적화 코어, 저장 포트 |
| 저장 어댑터 | 자동 저장, 불러오기, 마이그레이션, 종료 스냅샷 | 애플리케이션이 정의한 저장 계약 |
| UI | 입력, 표, 조직 그림, 결과와 오류 표시 | 애플리케이션 공개 API |

의존 방향은 항상 아래 계층에서 위 표의 앞쪽 계층으로만 향한다. 계산 코어가 UI 형식이나 특정 데이터베이스 형식을 알게 하지 않는다.

### 3.1 Phase 2 프로젝트 설정 경계

Phase 2는 아직 완전하지 않은 문자열과 임시로 연결이 끊긴 서브트리를 허용하는 `ProjectSetupDraft`를 애플리케이션 계층에 둔다. 이 초안을 Phase 1의 `PeriodInput` 또는 `OrganizationSnapshotInput`으로 강제 변환하지 않는다.

- UI는 공개된 프로젝트 설정 명령만 호출하고 조직 불변조건이나 계산 규칙을 다시 구현하지 않는다.
- 연결의 권위 원천은 활성 회원의 `parentMemberKey + sideAtParent` 하나다. 자식 인덱스, `SELF/CHILD`, 순회 순서와 재배치 대기열은 매번 파생한다.
- 회원 제외는 해당 회원만 활성 조직에서 제외한다. 직계 자식과 그 아래의 내부 연결은 보존하고, 한 자식 승격은 명시적으로 선택한 경우에만 수행한다. 두 자식 또는 루트 제외에서는 앱이 새 위치를 자동으로 고르지 않는다.
- 검증 오류가 없고 모든 활성 회원의 회사 시스템 시작값 확인이 끝났을 때만 불변 `ProjectSetupBundle`을 게시한다. 이 묶음은 `PlanProject + OrganizationSnapshotInput`이며 날짜별 배정 셀을 포함하지 않는다.
- 초안의 기간, 제목, 회원, 시작값 또는 토폴로지가 바뀌면 활성 묶음을 즉시 해제한다. 카드 선택 같은 화면 탐색 상태는 계산 원본 변경으로 보지 않는다.
- Phase 2는 `IN_PROGRESS` 인메모리 편집만 맡는다. 계획표가 생긴 뒤 조직 변경과 재계산은 Phase 5, 저장·복구·`CLOSED`와 읽기 전용 기록은 Phase 6에서 정의한다.

## 4. 용어와 값의 출처

### 4.1 권위 있는 원본

- 프로젝트 대상 연·월과 상반기/하반기
- 프로젝트 시작 당시의 조직과 회원 정보
- 회원별 누적 qualification PVP 시작값
- 회원별 보름 PVP 시작값
- 회원별 일일 PVP·좌·우 시작 잔액
- 날짜별 계획·확정·실제의 직접 신규 PVP
- 날짜별 `스스로` 좌·우 신규 PV
- 사용자가 확정한 상태 전이와 잠금 정보

### 4.2 파생값

- 각 방향이 `CHILD`인지 `SELF`인지 여부
- 날짜별 연결 방향의 조직 실적
- 회원별 서브트리 총 실적
- 일일 정산 전·후 잔액
- PVP 적용 방향과 판정 좌·우
- 기계적 정산 단계, qualification-valid full commission 여부와 below-300 경고
- 날짜별 inclusive 누적 qualification PVP
- Phase 4에서 확정한 일일 초과 소멸량
- 보름 누적 PVP·좌·우
- 개인 PVP 목표 잔여량
- 보름 좌·우 최종 판정과 달성 여부
- PVP 목표 700 대상 회원의 커미션 발생일 수
- 계획과 실제 또는 재시뮬레이션 사이의 차이

Phase 4 자동 계획은 정규화된 설정 묶음, 세 PVP opening 의미, canonical 날짜 집합과 skip 집합, canonical 회원 순서, ruleset·objective·calendar·schema version으로 `problemFingerprint`를 만든다. Policy seed, 제품 deadline, run ID, 경과 시간, candidate sequence, warm start와 UI 상태는 문제 정의가 아니므로 fingerprint에서 제외한다. fingerprint는 무결성·동일성 확인 수단일 뿐 입력 자체를 재현하지 못하므로 전체 입력 스냅샷을 별도로 보존해야 한다.

## 5. 도메인 데이터 구조

아래 구조는 개념 모델이다. 실제 TypeScript 이름이나 저장 형식은 Phase 1 착수 시 이 계약을 보존하는 범위에서 정한다.

### 5.1 RuleSet

| 필드 | 의미 |
|---|---|
| `rulesetVersion` | qualification-aware 현재 규칙 버전 `3.0.0` |
| `commissionTiers` | 오름차순 `[300, 700, 1500, 2400, 6000, 20000, 60000]` |
| `allowedPvpTargets` | 회원별 선택 가능 목표 `[2400, 1500, 700]` |
| `fortnightSideTarget` | 좌·우 각각 `2500` |
| `businessCalendarPolicy` | canonical Gregorian date-only 일요일 `SKIP_NO_INPUT`, 토요일·공휴일 정상 영업 |
| `pvpTiePolicy` | 좌·우 동률이면 `LEFT`에 전량 적용하고 `동률 → 좌 적용`으로 표시 |
| `fortnightPvpSourcePolicy` | 보름 PVP 시작값과 이번 보름 신규 PVP 전액. 일일 PVP 시작잔액은 제외 |
| `qualificationPolicy` | opening qualification PVP와 당일까지의 직접 신규 PVP를 inclusive 누적하며 300 이상부터 full commission으로 인정 |
| `belowQualificationSettlementPolicy` | 300 미만의 단계 도달도 실제 초기화는 수행하되 usable full commission으로 세지 않고 blocking planning warning을 남김 |
| `target700CommissionPreference` | PVP 목표 700 회원에게 약 8일 권장. 하드 제약이나 추가 PV 사유가 아님 |

확정 상수를 코드 여러 곳에 복제하지 않고 버전이 있는 규칙 집합으로 계산 함수에 전달한다.

Phase 4 호환성 식별자는 다음 값으로 고정한다.

| 계약 | 버전 |
|---|---|
| 규칙·계산 엔진 | `3.0.0` |
| 자동 계획 policy | `2.0.0` |
| 자동 계획 objective | `2.0.0` |
| calendar contract | `1.0.0` |
| problem fingerprint | `1.0.0` |
| incumbent checkpoint | `1.0.0` |
| exact model certificate | `1.0.0` |

지원하지 않거나 본문이 일치하지 않는 버전은 계산·복원·증명 전에 명시적으로 거부한다. 버전 문자열만 같고 본문이나 인증 대상 구현이 다른 상태를 호환으로 취급하지 않는다.

### 5.2 PlanProject

| 필드 | 의미 |
|---|---|
| `projectId` | 내부 불변 식별자 |
| `title` | `2026년 7월 상반기 직급 플랜` 같은 표시 이름 |
| `period` | 권위 입력인 대상 연·월과 `FIRST_HALF/SECOND_HALF` |
| `timezone` | 기본 `Asia/Seoul` |
| `projectStatus` | `IN_PROGRESS` 또는 `CLOSED` |
| `organizationSnapshotId` | 현재 조직·시작값 스냅샷 |
| `draftRevisionId` | 현재 계획 중 리비전, 없을 수 있음 |
| `confirmedRevisionId` | 전달하기로 확정한 계획 리비전, 없을 수 있음 |
| `actualRevisionId` | 현재 실제값 리비전, 없을 수 있음 |
| `schemaVersion` | 저장 데이터 구조 버전 |
| `createdAt`, `updatedAt` | 애플리케이션 계층의 기록 시각 |

`계획 중`, `확정 계획`, `실제 결과`는 서로 하나만 선택하는 프로젝트 상태가 아니라 서로 다른 데이터 채널이다. 프로젝트의 쓰기 가능 여부는 `IN_PROGRESS/CLOSED`로 별도 관리한다.

`startDate/endDate`는 저장 원천이 아니다. `period`와 RuleSet에서 매번 파생하며, 외부 데이터에 함께 들어오면 파생값과 일치하는지 검증한 뒤 버린다.

### 5.3 MemberSnapshot과 Placement

| 필드 | 의미 |
|---|---|
| `memberKey` | 프로젝트 안에서 참조하는 내부 불변 키 |
| `memberId` | 회사 시스템의 회원 ID |
| `name` | 당시 회원 이름 |
| `pvpTarget` | 사용자가 시작값 화면에서 선택한 `2400 | 1500 | 700` |
| `sheetMarker` | 계산과 무관한 찾기용 표지판 `NONE | PINK_1 | GREEN_2 | BLUE_3 | PURPLE_4` |
| `parentMemberKey` | 루트이면 `null`, 아니면 상위 회원 키 |
| `sideAtParent` | 루트이면 `null`, 아니면 `LEFT` 또는 `RIGHT` |

정규 저장의 유일한 연결 원천은 하위 회원의 `parentMemberKey + sideAtParent`로 둔다. 부모의 `leftChild/rightChild`를 별도로 권위 저장하지 않는다.

- 해당 방향에 자식이 있으면 방향 종류는 파생된 `CHILD`다.
- 자식이 없으면 방향 종류는 파생된 `SELF`다.
- 이름은 중복될 수 있다. `memberKey`는 항상 유일하고, 선택 입력한 `memberId`는 프로젝트 안에서 유일해야 한다.
- 찾기용 표지판은 조직 깊이와 별개이며 위치를 바꿔도 사용자가 선택한 값이 유지된다.
- PVP 목표와 찾기용 표지판은 어떤 계산에서도 서로를 파생하지 않는다.

루트 회원은 `parentMemberKey`와 `sideAtParent`가 모두 `null`이어야 한다. 비루트 회원은 두 값이 모두 존재해야 하며 한쪽만 있는 상태를 허용하지 않는다.

### 5.4 OrganizationSnapshot

조직과 계산 시작값은 프로젝트 계산의 한 불변 스냅샷으로 묶는다.

| 필드 | 의미 |
|---|---|
| `snapshotId` | 불변 스냅샷 식별자 |
| `members` | 모든 `MemberSnapshot`의 완전한 집합 |
| `openingStateByMember` | 각 회원 키에 정확히 하나씩 대응하는 `OpeningState` |
| `createdAt` | 애플리케이션 계층의 생성 시각 |

모든 회원은 비어 있지 않은 이름, 2,400·1,500·700 중 하나의 PVP 목표, 유효한 찾기용 표지판과 OpeningState를 가져야 한다. 회원 ID는 선택 입력이며 입력할 경우 숫자 문자열로 받는다. 조직 또는 시작값을 바꾸는 작업은 기존 객체를 부분 수정하지 않고 새 스냅샷을 만든다. Phase 2의 `IN_PROGRESS` 설정 단계에서는 자유롭게 편집할 수 있지만, 성공한 변경은 현재 활성 설정 묶음을 즉시 무효화하고 다시 검증한다. 계획·확정·실제 리비전이 생긴 뒤 새 스냅샷과 기존 리비전을 연결하는 방식은 Phase 5의 **Q-PRODUCT-02**에서 결정한다.

### 5.5 OpeningState

회원마다 다음 다섯 값을 서로 다른 필드로 저장한다.

| 필드 | 계산 용도 |
|---|---|
| `openingQualificationPvp` | 계획 첫 날짜 직전의 비초기화 누적 qualification PVP. 당일까지의 직접 신규 PVP와 합산해 300 gate를 판정 |
| `fortnightPvpOpeningCredit` | 보름 개인 PVP 목표와 보름 마감 작은 쪽 적용에 사용. 상위 조직에는 재전파하지 않음 |
| `dailyCarryPvp` | 첫 계산일의 일일 PVP 잔액 |
| `dailyCarryLeft` | 첫 계산일의 일일 좌 잔액 |
| `dailyCarryRight` | 첫 계산일의 일일 우 잔액 |

엔진의 다섯 값은 역할이 다르므로 계산 과정에서는 합치거나 서로 대신 사용하지 않는다. 다만 제품 설정 UI는 사용자가 확인할 PVP 시작값을 하나로 단순화했으므로 Phase 2 정규화 어댑터가 그 값을 `openingQualificationPvp`, `fortnightPvpOpeningCredit`, `dailyCarryPvp`의 공통 최초값으로 기록한다. 이후 보름 작은 쪽 적용량에는 `fortnightPvpOpeningCredit`과 이번 보름 신규 PVP만 포함하며 `dailyCarryPvp`와 `openingQualificationPvp`는 포함하지 않는다.

### 5.6 NormalizedAllocationCell

날짜·회원별로 직접 배정할 수 있는 원본값이다.

| 필드 | 의미 |
|---|---|
| `date` | 검증된 canonical ISO `YYYY-MM-DD` business date-only 값 |
| `memberKey` | 실적을 직접 만드는 회원 |
| `pvp` | 해당 회원의 신규 PVP |
| `selfLeft` | 왼쪽이 `SELF`일 때만 존재 가능한 신규 PV |
| `selfRight` | 오른쪽이 `SELF`일 때만 존재 가능한 신규 PV |

계산 코어는 `null`이 없는 완전한 정규 입력만 받는다.

- 모든 회원·날짜의 `pvp`는 0을 포함한 정수로 존재한다.
- `SELF` 방향의 값도 미입력이 아니라 0을 포함한 정수로 존재한다.
- `CHILD` 방향의 `selfLeft/selfRight` 필드는 구조적으로 존재하지 않는다.
- 연결 방향에 직접 필드가 있으면 값이 0이어도 구조 오류로 거부한다.
- 소수, 문자열, `NaN`, 무한대, unsafe integer, 음수와 negative zero를 거부한다.

UI의 빈 계획 셀과 실제값 `null`을 어떻게 정규화할지는 애플리케이션 계층의 정책이다. 초안 빈칸을 0으로 볼 수 있지만, 완료 실제값은 **Q-RESIM-02**가 정한 완전성 검사를 통과해야 한다.

### 5.7 AllocationRevision

이 구조는 Phase 5 애플리케이션 계층의 모델이며 Phase 1 계산 코어의 입력 타입이 아니다. 계산 코어에는 리비전 종류를 제거한 `NormalizedAllocationCell` 집합만 전달한다.

| 필드 | 의미 |
|---|---|
| `revisionId` | 불변 리비전 식별자 |
| `organizationSnapshotId` | 이 원본을 해석할 조직·시작값 스냅샷 |
| `kind` | `DRAFT`, `CONFIRMED`, `ACTUAL`, `RESIMULATED` |
| `basedOnRevisionId` | 복사·재시뮬레이션의 기준 리비전 |
| `allocations` | 정규화된 날짜별 직접 원본값 |
| `fixedBoundary` | 실제값 등으로 고정된 날짜 또는 셀 경계 |
| `reason` | 생성·확정·재계산 사유 |
| `createdAt` | 리비전 생성 시각 |

원본 리비전은 덮어쓰지 않는다. 수정은 새 리비전을 만들고 프로젝트가 현재 리비전을 가리키게 한다.

### 5.8 날짜별 조직 원본 결과

회원 `m`, 날짜 `d`마다 다음 값을 만든다.

| 필드 | 의미 |
|---|---|
| `directPvp` | 해당 회원에게 직접 배정된 신규 PVP |
| `organizationLeft` | 직접 `SELF` 값 또는 왼쪽 자식 서브트리 합계 |
| `organizationRight` | 직접 `SELF` 값 또는 오른쪽 자식 서브트리 합계 |
| `subtreeTotal` | `directPvp + organizationLeft + organizationRight` |

이 결과는 일일 장부와 보름 장부가 공유하는 **날짜별 원본 조직 실적**이다.

### 5.9 DailySettlement

회원·날짜별 감사 결과에 최소 다음 값을 보존한다.

- `date`와 `settlementStatus`: 날짜와 `SETTLED/SKIPPED`
- `carryIn`: 전일 정산 후 또는 시작 `PVP/LEFT/RIGHT`
- `rawPerformance`: 그 날짜의 `directPvp/organizationLeft/organizationRight`
- `preSettlement`: 두 값을 항목별로 더한 `PVP/LEFT/RIGHT`
- `pvpAppliedSide`: `LEFT`, `RIGHT`, 또는 `SKIPPED`일 때 `null`. 동률도 값은 `LEFT`이며 별도 사유로 `동률 → 좌 적용`을 표시
- `assessedLeft`, `assessedRight`: PVP 가상 적용 후 판정값, `SKIPPED`일 때 `null`
- `qualificationPvp`: `openingQualificationPvp + 해당 날짜까지의 directPvp 누계`이며 그 날짜 PVP를 먼저 포함한 값
- `commissionTier`: 양쪽 단계 미달이면 `null`, 기계적 정산 단계가 생기면 공식 단계 하나
- `settlementKind`: `SKIPPED`, `NO_COMMISSION`, `BELOW_QUALIFICATION_SETTLEMENT`, `FULL_COMMISSION` 중 하나
- `commissionOccurred`: qualification PVP가 300 이상인 `FULL_COMMISSION` 하루 1회 여부
- `belowQualificationWarning`: 300 미만에서 단계가 발생해 실제 초기화된 경우의 blocking planning warning, 아니면 `null`
- `carryOut`: 다음 영업일로 넘길 `PVP/LEFT/RIGHT`

300 미만이어도 양쪽이 공식 단계에 도달하면 회사 정산 결과와 같은 실제 초기화를 수행한다. 이를 full commission으로 표시하거나 목표 700의 커미션 일수로 세지 않는다. 자동 계획 후보에 이 사건이 있으면 verifier가 후보를 거부하며, 수동 계획은 계산 결과와 reset trace를 보존한 채 경고한다.

`discardedExcessPv`는 qualification-valid `FULL_COMMISSION`에서만 Phase 4 목적함수 평가값으로 계산한다.

### 5.10 RunningFortnightState와 FortnightAssessment

각 날짜가 끝날 때 회원별 `RunningFortnightState`를 만들어 그날까지의 원본 PVP·좌·우 누계, 개인 PVP 잔여량과 inclusive qualification PVP를 표시할 수 있게 한다. 마지막 날짜의 누계로 `FortnightAssessment`를 만들며 최소 다음 결과를 포함한다.

- 날짜별 원본 신규 PVP 합계
- 날짜별 원본 조직 좌·우 합계
- 보름 개인 PVP 판정 총량과 직접 선택한 목표
- 추가로 필요한 PVP
- 보름 PVP 적용 방향과 적용량
- 적용 전·후 좌·우
- 좌·우 각각의 2,500 달성 여부
- 전체 보름 목표 달성 여부
- qualification-valid full commission 발생일 수와 단계별 내역
- below-300 실제 정산과 blocking warning 내역
- PVP 목표 700의 약 8일 권장 상태

적용 후 값은 판정을 위한 파생값이며 원본 누적 좌·우를 변경하지 않는다.

### 5.11 CalculationResult

성공한 전체 계산 결과는 다음 묶음이다.

| 필드 | 의미 |
|---|---|
| `period` | 권위 입력에서 파생한 시작일·종료일·날짜 목록 |
| `rulesetVersion` | 결과를 계산한 규칙 버전 |
| `engineVersion` | 계산 코어 릴리스 버전 |
| `rawPerformanceByDateAndMember` | 날짜·회원별 `P/L/R/T` 원본 조직 결과 |
| `dailySettlementByDateAndMember` | 날짜·회원별 일일 정산 추적값 |
| `runningFortnightByDateAndMember` | 날짜 종료 시점별 보름 누계와 잔여량 |
| `finalAssessmentByMember` | 회원별 최종 보름 평가 |
| `closingDailyCarryByMember` | 마지막 canonical 날짜의 authoritative `carryOut`; 만료 사건이 없으면 그대로 보존 |
| `warnings` | 계산을 막지 않은 위치 정보 포함 경고 |

검증 실패는 불완전한 `CalculationResult`를 만들지 않는다. 공개 결과는 `SUCCESS + CalculationResult` 또는 `FAILURE + ValidationReport`인 배타적 형태로 반환한다.

## 6. 데이터 불변조건과 검증

### 6.1 조직

- 한 회원은 최대 한 명의 부모만 가진다.
- 한 부모의 같은 방향에는 최대 한 명의 자식만 들어간다.
- 같은 회원을 여러 부모 또는 한 부모의 양쪽에 공유하지 않는다.
- 순환 연결을 허용하지 않는다.
- 존재하지 않는 회원을 참조하지 않는다.
- 루트는 정확히 한 명이어야 하며 모든 회원은 해당 루트에 연결되어야 한다. 루트 없음, 복수 루트, 고아 회원은 오류다.
- canonical 회원 순서는 루트부터 시작해 각 노드의 LEFT 서브트리를 RIGHT 서브트리보다 먼저 방문하는 전위 토폴로지 순서다. UI 정렬, 이름, locale collation, draft 배열 삽입 순서를 사용하지 않는다.
- 부모·위치가 다른 새 스냅샷을 계산하면 모든 파생 결과를 처음부터 다시 만든다. Phase 2에서는 활성 설정 묶음만 즉시 해제하며, 기존 확정·실제 리비전의 무효화·복제·재계산 정책은 Phase 5의 **Q-PRODUCT-02**에서 정한다.

### 6.2 숫자와 날짜

- PV는 0 이상이며 1단위 정수다.
- 소수, 음수, negative zero, `NaN`, 무한대, 안전한 정수 범위를 넘는 값은 거부한다.
- 개별 입력이 안전해도 조직 합계, 일일 이월 합계, 보름 누계가 범위를 넘을 수 있으므로 모든 덧셈과 합산 뒤 안전한 정수 여부를 다시 확인한다. 넘으면 `PV_AGGREGATE_OUT_OF_RANGE`로 전체 계산을 실패시킨다.
- Phase 1의 모든 엔진은 같은 `checkedAdd/checkedSum` 도메인 연산을 사용하고 일반 `+` 누적을 각 엔진에 복제하지 않는다.
- 입력 날짜는 프로젝트의 반월 범위 안에 있는 검증된 ISO `YYYY-MM-DD` date-only 값이어야 한다.
- 요일은 proleptic Gregorian 달력으로 date-only 구성 요소에서 계산한다. browser-local `new Date(year, month, day)`, unzoned timestamp parse, 현재 locale·UTC offset을 사용하지 않는다.
- 같은 canonical 날짜 집합은 서울, 브라질, UTC와 DST 전환 환경에서 같은 일요일·skip 집합을 만든다.
- 외부 편집 데이터에서 `null`은 미입력이고 숫자 `0`은 명시적인 0이다. 계산 코어에 전달되는 정규 직접 입력에는 `null`이 없어야 한다.
- 일요일의 자동·수동 계획과 실제 신규 입력은 모두 거부한다. 토요일과 일요일 외 공휴일 입력은 정상 허용한다.

### 6.3 편집 권한

- 모든 회원의 PVP는 직접 입력할 수 있다.
- 자식이 없는 `SELF` 방향만 직접 입력할 수 있다.
- 연결 방향, 조직 합계, 정산값, 누적값은 직접 수정할 수 없다.
- 종료된 프로젝트에 대한 쓰기 명령은 애플리케이션 계층에서 거부한다.

### 6.4 오류 형식

검증 결과는 단순 문자열이 아니라 다음 정보를 가진다.

- 안정적인 오류 코드
- 심각도 `ERROR` 또는 `WARNING`
- 프로젝트, 날짜, 회원, 방향, 필드 위치
- 사람이 이해할 수 있는 한국어 설명
- 가능한 경우 수정 방법

오류가 하나라도 있으면 부분 계산 결과를 저장하지 않는다. 경고는 계산을 허용하되 결과에 함께 반환한다.

## 7. 조직 실적 전파 엔진

### 7.1 날짜별 공식

날짜 `d`의 회원 `m`에 대해 다음을 계산한다.

- `P(m,d) = m의 날짜별 직접 신규 PVP`
- 왼쪽 자식이 있으면 `L(m,d) = T(leftChild,d)`, 없으면 `L(m,d) = selfLeft(m,d)`
- 오른쪽 자식이 있으면 `R(m,d) = T(rightChild,d)`, 없으면 `R(m,d) = selfRight(m,d)`
- `T(m,d) = P(m,d) + L(m,d) + R(m,d)`

잎 회원부터 루트로 올라가는 후위 순서로 한 번 계산한다. 같은 날짜의 같은 서브트리를 여러 번 합산하지 않도록 회원별 `T`를 한 번만 만든다.

### 7.2 전파 경계

PVP 원천을 다음 다섯 종류로 구분한다.

- `openingQualificationPvp`: 해당 회원의 비초기화 누적 qualification 시작값이다. 매일 그날까지의 직접 신규 PVP와 inclusive 합산하지만 일일 정산 reset, 조직 전파, 반월 작은 쪽 적용에는 사용하지 않는다.
- `fortnightPvpOpeningCredit`: 개인 PVP 목표와 본인의 보름 작은 쪽 적용에만 사용한다. 상위 회원의 이번 보름 좌·우에는 신규 실적으로 전파하지 않는다.
- 프로젝트 시작 입력인 `dailyCarryPvp/Left/Right`: 해당 회원의 첫 일일 장부에만 넣고 부모의 신규 원본이나 보름 원본에 다시 전파하지 않는다.
- 이번 보름 날짜별 신규 `P(m,d)`: 그 날짜 자식 `T`에 포함하여 모든 상위 경로에 한 번 전파하고, 본인의 `newPvpTotal`에도 날짜 원본으로 한 번 합산한다.
- 신규 PVP가 커미션 미발생으로 이후 날짜의 `carryOutPvp`가 된 상태: 해당 회원의 다음 일일 장부에는 남지만 부모에게 신규 실적으로 재전파하거나 보름 PVP에 다시 합산하지 않는다. 원래 발생일의 `P(m,d)`는 보름 누계에 계속 한 번 남는다.
- 자식의 PVP 가상 적용 방향, 커미션 발생, 정산 후 값은 부모의 그 날짜 신규 원본을 바꾸지 않는다.
- 모든 원본 전파를 끝낸 뒤 회원별 일일 장부를 정산한다.

## 8. 일일 장부 엔진

### 8.1 정산 전 잔액

날짜순으로 회원별 상태를 이어간다.

- `prePvp = carryInPvp + P(m,d)`
- `preLeft = carryInLeft + L(m,d)`
- `preRight = carryInRight + R(m,d)`

첫 정산일의 `carryIn`은 회원의 `dailyCarryPvp/Left/Right`다.

일일 reset과 별도로 qualification PVP를 다음처럼 누적한다.

`qualificationPvp(m,d) = openingQualificationPvp(m) + Σ directPvp(m,t), t <= d`

그날 직접 신규 PVP를 먼저 더한 뒤 300 gate를 판정한다. 따라서 33에서 시작해 그날 267을 받으면 300으로 full commission이 가능하고, 266이면 299라서 불가능하다. 이 값은 일일 정산으로 초기화되지 않는다.

정산 실행 여부의 유일한 원천은 `RuleSet.businessCalendarPolicy`다. 호출자가 별도 boolean을 전달해 규칙과 충돌하게 하지 않는다. `settleDaily`는 날짜를 받아 RuleSet으로 그날의 모드를 판정한다.

- `SETTLE`: 아래 PVP 적용과 단계 판정을 정상 실행한다.
- `SKIP_NO_INPUT`: 해당 날짜 원본이 모두 0인지 검증하고, `carryOut = carryIn`, PVP 적용 방향·판정 좌우·단계는 `null`, 상태는 `SKIPPED`로 반환한다.

일요일에는 자동·수동 계획과 실제 신규 입력을 모두 금지한다. 토요일과 공휴일은 별도 휴무일 목록 없이 정상 영업일로 처리한다.

### 8.2 PVP 가상 적용

1. `preLeft`와 `preRight` 중 작은 쪽을 고른다.
2. `prePvp` 전량을 그 방향에 한 번만 더해 판정 좌·우를 만든다.
3. 원본 `prePvp/preLeft/preRight`는 변경하지 않는다.
4. 좌·우가 같으면 왼쪽을 선택하고 `동률 → 좌 적용`으로 표시한다.

PVP가 적용된 뒤 해당 방향이 다른 방향보다 커져도 다시 나누거나 옮기지 않는다.

### 8.3 단계 판정

`min(assessedLeft, assessedRight)` 이하인 공식 단계 중 가장 높은 값을 고른다.

- 300 미만이면 미발생이다.
- 정확히 경계값이면 해당 단계다.
- 59,999면 20,000, 60,000이면 60,000이다.
- 60,000을 초과해도 단계는 60,000이 최대다.
- 한 날짜에는 가장 높은 단계 한 건만 기록한다.

단계 도달과 usable full commission은 별도 판정이다.

- `qualificationPvp >= 300`이고 단계가 있으면 `FULL_COMMISSION`이다.
- `qualificationPvp < 300`인데 단계가 있으면 `BELOW_QUALIFICATION_SETTLEMENT`다. 회사의 실제 reset 결과를 보존하지만 자동 계획이 추천하거나 목표 700 일수로 세는 usable commission은 아니다.
- qualification 300 미만의 한쪽 실적과 carry는 단계가 발생하지 않는 한 허용한다.
- opening qualification이 이미 300 이상이면 첫 영업일부터 full commission 자격이 있다.

### 8.4 초기화와 이월

- `FULL_COMMISSION` 또는 `BELOW_QUALIFICATION_SETTLEMENT`: `carryOutPvp = carryOutLeft = carryOutRight = 0`
- 단계 미발생: `carryOut = preSettlement`의 원래 세 항목

Below-300 정산을 제품이 usable commission으로 인정하지 않는다는 이유로 실제 reset을 취소하지 않는다. 수동 계획에는 위치가 있는 blocking warning을 남기고 자동 계획 verifier는 해당 후보를 거부한다. 단계 미발생 시 PVP는 좌·우로 옮겨 저장하지 않는다. 다음 날 다시 그날의 작은 쪽에 가상 적용할 수 있도록 PVP 잔액으로 유지한다.

### 8.5 초과 소멸량

이 절은 Phase 4 목적함수의 확정 지표이며 Phase 1 일일 장부 원본 필드를 변경하지 않는다.

Qualification-valid `FULL_COMMISSION` 날의 수식은 다음과 같다.

`discardedExcessPv = prePvp + preLeft + preRight - 2 × commissionTier`

PVP는 한쪽에 한 번만 적용되므로 가상 적용 전 세 항목의 합과 적용 후 두 방향의 합은 같다. 단계가 발생하면 두 판정 방향이 모두 단계 이상이어서 이 값은 0 이상이다.

비커미션, skipped, below-300 settlement 날의 `discardedExcessPv`는 0이다. 이 값은 회사가 실제로 구분해 지급한 금액이 아니라, qualification-valid 단계 판정 뒤 초기화되어 다음 날 쓸 수 없게 된 PV 중 최소 단계 요구량을 넘는 양을 비교하기 위한 최적화 지표다. 모든 연산은 checked integer 연산을 사용한다.

### 8.6 기간 말 carry

마지막 canonical 날짜의 `carryOut`은 Phase 1의 authoritative closing state다. 현재 규칙에는 이를 기간 경계에서 만료하거나 소멸시키는 사건이 없다. 따라서 Phase 4는 terminal carry를 표시할 수는 있지만 discarded excess나 별도 penalty로 계산하지 않는다. 향후 실제 만료 규칙이 생기면 먼저 버전이 있는 Phase 1 사건과 계산 사례를 추가해야 한다.

## 9. 보름 장부 엔진

### 9.1 원본 누적

회원별로 대상 반월의 날짜별 원본을 세로 합산한다.

- `newPvpTotal = Σ P(m,d)`
- `rawLeftTotal = Σ L(m,d)`
- `rawRightTotal = Σ R(m,d)`

일일 장부에서 커미션이 발생해도 이 합계는 바뀌지 않는다. 프로젝트 시작 `dailyCarryPvp/Left/Right`는 이번 보름 원본이 아니므로 합계에서 제외한다. 이번 보름에 발생한 `P(m,d)`가 이후 일일 PVP 잔액으로 이월되더라도 원래 발생일의 `P(m,d)`는 `newPvpTotal`에 정확히 한 번 남는다.

### 9.2 개인 PVP 목표

요구사항에서 직접 확인되는 공식은 다음과 같다.

- `personalPvpTotal = fortnightPvpOpeningCredit + newPvpTotal`
- `remainingPvp = MAX(0, selectedPvpTarget - personalPvpTotal)`

하위 조직 실적은 회원 본인의 PVP 목표를 채우지 않는다. `P(m,d)`와 해당 회원의 시작 PVP만 사용한다.

### 9.3 마감 PVP의 작은 쪽 적용

확정 공식은 다음과 같다.

- `periodPvpForSide = fortnightPvpOpeningCredit + newPvpTotal`
- 원본 누적 좌·우 중 작은 쪽에 `periodPvpForSide` 전량을 한 번 적용
- 원본 누적 좌·우가 같으면 왼쪽을 선택
- 적용 후 좌·우가 각각 2,500 이상인지 판정

적용량에는 보름 PVP 시작값과 이번 보름 신규 PVP 전액을 포함한다. 선택한 목표를 초과한 양도 자르지 않는다. 프로젝트 시작 `dailyCarryPvp`는 제외하며, 신규 PVP에서 파생된 일일 이월 상태는 별도 PV로 재합산하지 않는다. 보름 PVP 시작값은 해당 회원 본인의 판정에만 사용하고 상위 조직에 신규 실적으로 재전파하지 않는다.

PVP 적용은 최종 판정용 파생값이며 원본 누적 좌·우를 변경하거나 다음 프로젝트 시작값을 자동 생성하지 않는다.

### 9.4 Qualification trace와 커미션 일수

`RunningFortnightState`는 반월 PVP 평가와 별도로 날짜별 `qualificationPvp`를 보존한다. `FortnightAssessment.commissionOccurrences`와 `commissionDays`에는 `settlementKind === FULL_COMMISSION`인 날짜만 포함한다. Below-300 settlement, skipped day와 단계 미발생일은 0일이며, 700보다 높은 공식 full tier도 해당 날짜에 1일로만 센다.

PVP 목표 700 회원의 counted day는 다음 조건을 모두 만족한다.

```text
member.pvpTarget === 700
&& settlementKind === FULL_COMMISSION
&& qualificationPvp >= 300
```

PVP 목표 1,500과 2,400 회원은 Phase 4의 target-700 일수 목적에서 제외한다.

## 10. 전체 기간 계산 순서

1. 규칙 버전, 프로젝트 기간, 회원, 조직, 시작값, 정규화 직접 입력 집합을 검증한다.
2. 조직을 후위 계산 순서로 정렬한다.
3. 대상 반월의 달력 날짜를 순서대로 만든다.
4. 이미 정규화된 직접 입력을 날짜·회원별로 그룹화한다.
5. 해당 날짜의 전체 회원 원본 조직 실적 `P/L/R/T`를 계산한다.
6. 각 회원의 qualification PVP에 오늘 direct PVP를 먼저 더해 inclusive trace를 만든다.
7. 각 회원의 전일 `carryOut`과 오늘 `P/L/R`, 오늘 qualification PVP로 일일 장부를 정산하고 full/below-300 상태를 구분한다.
8. 같은 오늘 `P/L/R`를 보름 원본 누계에 더하고 날짜 종료 시점의 `RunningFortnightState`를 만든다.
9. 모든 날짜가 끝나면 개인 PVP와 보름 좌·우를 판정한다.
10. 회원·날짜별 추적값, 진행 누계, 최종 평가, closing carry, 경고, 규칙·엔진 버전을 반환한다.

일요일도 날짜 행에는 포함하되 `SKIP_NO_INPUT`으로 처리한다. 신규 입력은 0이어야 하고 정산을 건너뛰며 `carryOut=carryIn`, PVP 적용 방향·판정 좌우·단계는 `null`이다.

## 11. 계산 코어 공개 계약

다음 기능 단위를 외부 계약으로 둔다. 이름은 개념 이름이며 실제 언어 문법이 아니다.

| 계약 | 입력 | 출력 |
|---|---|---|
| `validatePlan` | 조직·기간·시작값·정규 직접 입력·규칙 | 위치 정보가 있는 오류·경고 목록 |
| `deriveRawPerformance` | 조직과 하루 직접 배정값 | 회원별 날짜 원본 `P/L/R/T` |
| `settleDaily` | 날짜, 한 회원의 `carryIn`, 하루 원본, inclusive qualification PVP, 규칙 | 실제 reset과 full/below-300 상태를 구분한 완전한 결과 |
| `evaluateFortnight` | 회원·시작값·원본 누계·규칙 | `FortnightAssessment` |
| `calculatePlan` | 기간·조직 스냅샷·정규 직접 입력 집합·규칙 | 전체 `CalculationResult` 또는 검증 실패 |
| `simulatePlan` | 정규 자동 계획 요청·policy `2.0.0`·solve control | verified candidate, proof progress와 `RUNNING/OPTIMAL/TIME_LIMIT/CANCELLED/INFEASIBLE/FAILED` 상태 |
| `resimulateFuture` | 실제 스냅샷·고정 경계·미래 기준안·규칙 | 미래 후보, 차이, 검증 결과 |

앞의 다섯 계약은 qualification-aware ruleset·engine `3.0.0`의 계산 권위다. Phase 4 자동 계획은 이를 독립 verifier로 호출하며, 부분 재시뮬레이션은 이후 Phase에서 같은 계산 코어를 호출한다.

## 12. 자동 계획 엔진

### 12.1 버전, 요청과 canonical identity

Phase 4 자동 계획은 불변 `ProjectSetupBundle` 하나에서 시작하며 다음 호환성 계약을 사용한다.

- ruleset·engine `3.0.0`
- automatic-plan policy·objective `2.0.0`
- calendar·problem fingerprint·checkpoint·model certificate `1.0.0`
- 제품 실행 제한 상수 `AUTOMATIC_PLAN_PRODUCT_TIME_LIMIT_MS = 1_800_000`

정규 요청은 canonical date-only 날짜 목록과 skip 집합, 루트부터 LEFT 후 RIGHT로 순회한 canonical 회원 키 목록, 회원별 세 PVP opening 의미, 문제 fingerprint를 명시한다. Policy `2.1.0`은 고정된 `deterministicSeed`와 최대 8개 영업일에 분산하는 constructive warm start를 가지되 실행 시간 선택값은 갖지 않는다. Warm start는 검색 속도만 바꾸며 exact 문제 정의에는 영향을 주지 않지만, 구형 첫날 집중 후보 재사용을 막기 위해 policy version은 fingerprint에 포함한다. 제품 정책에는 `runMode`, 사용자 선택 `timeLimitMs`, 3시간·custom duration을 두지 않는다.

### 12.2 결정 변수와 candidate shape

자동 배정 가능한 각 영업일·회원에 대해 다음만 1 PV 단위의 0 이상 안전 정수 변수로 둔다.

- 신규 PVP
- 왼쪽이 `SELF`일 때의 신규 좌 PV
- 오른쪽이 `SELF`일 때의 신규 우 PV

연결 방향은 변수가 아니다. 해당 값은 하위 서브트리 변수의 합으로 계산한다. Candidate는 모든 canonical 날짜·회원 쌍에 정확히 한 셀을 가지며 PVP와 모든 editable SELF 필드를 0까지 포함한다. CHILD 필드는 구조적으로 없어야 한다. 중복, 누락, unknown identity·field, 비정규 순서, 문자열, 소수, `NaN`, 무한대, unsafe integer, overflow, 음수와 negative zero는 Phase 1 호출 전에 거부한다.

### 12.3 하드 제약

- 모든 회원의 `fortnightPvpOpeningCredit + newPvpTotal`이 직접 선택한 PVP 목표 이상이어야 한다.
- 모든 회원의 보름 assessed LEFT와 RIGHT가 각각 2,500 이상이어야 한다.
- 모든 canonical Sunday와 `SKIP_NO_INPUT` 날짜의 신규 배정은 0이다.
- 연결된 CHILD 방향에는 직접 배정하지 않는다.
- 조직 전파, 일일 smaller-side PVP 적용, tie-left, 최고 tier 하나, carry, 실제 reset과 보름 장부를 ruleset `3.0.0` 그대로 적용한다.
- `openingQualificationPvp + 당일까지의 inclusive directPvp 누계`가 300 미만인 날짜에는 자동 계획이 정산 단계를 만들 수 없다. 한쪽 실적과 carry는 단계가 발생하지 않는 한 허용한다.
- 세 opening PVP 의미와 daily LEFT/RIGHT opening을 서로 대신 사용하지 않는다.
- 모든 입력·중간값·목적함수·bound는 exact safe integer 범위 안이어야 한다.
- canonical Phase 2 topology와 활성 회원 의미를 보존한다.
- 기간 말 carry는 Phase 1 closing 결과를 그대로 보존한다.

현재 규칙에는 safe-integer 범위 외의 일일·회원·셀별 운영 capacity가 없다. 모델 성능을 위해 임의 cap을 만들지 않는다. 실제 운영 최대가 확인되면 먼저 RuleSet과 계산 사례의 하드 규칙으로 추가한다. Phase 4에는 수동 셀 잠금, 실제값, 확정 계획, fixed past boundary와 cross-period fairness가 없다.

Opening balance 때문에 qualification 300 미만에서 첫 영업일 정산이 강제될 경우, 같은 날짜 direct PVP로 300을 채우거나 certified infeasibility를 증명해야 한다. 목표를 낮추거나 below-300 reset을 없던 것으로 계산하지 않는다.

### 12.4 정확한 사전식 목적함수

목적은 아래 순서로 정확히 하나씩 최적화하고 앞 단계의 증명된 최적값을 고정한 뒤 다음 단계로 간다. 부동소수점 가중합을 사용하지 않는다.

1. **총 직접 신규 PV 최소화.** PVP와 editable SELF LEFT/RIGHT 직접 셀을 각각 한 번만 센다. 전파된 조직 합계를 다시 세지 않는다.
2. **qualification-valid full commission의 일일 discarded excess 총합 최소화.** `prePvp + preLeft + preRight - 2 × commissionTier`를 합산한다.
3. **목표 700 회원의 일수 분포 개선.** 먼저 counted day가 8일 이상인 회원 수를 최대화하고, 이어 모든 목표 700 회원 일수를 오름차순 정렬한 전체 vector를 사전식 최대화한다.
4. **100-PV 배수 가독성.** 0이 아닌 직접 editable 셀 중 100으로 나누어떨어지지 않는 셀 수를 최소화한다.
5. **PVP 집중 완화.** 단일 direct PVP 셀의 최댓값을 최소화한다. 모든 PVP가 0이면 0이다.
6. **완전한 결정적 allocation vector.** business date 오름차순, canonical root/LEFT/RIGHT 회원 순서, `PVP`, `SELF_LEFT`, `SELF_RIGHT` 순서로 펼치고 첫 차이에서 앞 coordinate의 값이 큰 계획을 선택한다.

공동 하위 기여는 독립 목적이 아니다. 더 깊은 직접 입력이 소유 회원과 여러 상위 목표를 함께 채워 총 PV를 줄이면 1번 목적에서 자연스럽게 이긴다. Exact PVP 100 자체를 보상하거나 PVP-100 셀 수를 최대화하지 않는다. `target700TotalCommissionDays`도 display metric일 뿐 비교·증명 단계가 아니다. 1 PV 또는 10 PV 정확 보정이 높은 목적을 개선하면 100 배수 계획보다 우선한다. `[0,8,8]`은 8일 도달 회원 수가 더 많으므로 `[7,7,7]`보다 우선하며, 높은 목적이 모두 같으면 9일은 대응하는 8일보다 vector에서 우선한다. 어떤 일수 개선도 총 PV나 discarded excess를 늘릴 수 없다.

하나의 pure canonical comparator를 solver stage, incumbent 교체, verifier, tiny oracle, checkpoint 재검증과 테스트에서 공유하거나 그 결과와 정확히 같음을 검증한다.

### 12.5 독립 candidate 검증

Solver가 보고한 파생값은 권위가 없다. 모든 raw candidate는 다음 경계를 통과한 뒤에만 immutable `VerifiedAutomaticPlanCandidate`가 된다.

1. canonical shape·identity·순서·숫자·Sunday zero를 검증한다.
2. 정확한 요청의 ruleset, calendar와 opening state로 qualification-aware `calculatePlan`을 실행한다.
3. 모든 final `allTargetsMet`과 날짜별 qualification trace를 확인한다.
4. `BELOW_QUALIFICATION_SETTLEMENT`가 하나라도 있으면 자동 후보를 거부한다.
5. canonical objective와 display metric을 CalculationResult에서 checked integer로 다시 계산한다.
6. Solver score와 하나라도 다르면 model-consistency failure로 처리하고 raw vector를 노출하지 않는다.

복원 checkpoint도 preview, warm start 또는 apply 전에 같은 verifier를 다시 통과한다.

### 12.6 정확 모델과 증명 계약

Phase 1 검증은 제출된 한 후보의 soundness만 확인하며 더 나은 후보의 누락 여부는 증명하지 않는다. `OPTIMAL/INFEASIBLE`을 반환하려면 exact model이 다음 세 조건을 모두 만족해야 한다.

1. **Soundness:** 모델에서 decode한 모든 후보가 Phase 1과 하드 제약을 통과한다.
2. **Completeness:** 정규 Phase 1 규칙과 sound bound가 허용하는 모든 allocation을 모델이 표현하며 rounding domain, 날짜 생략, topology 단순화, 고정 PVP 위치나 임의 cap으로 유효 후보를 배제하지 않는다.
3. **Objective preservation:** 모델의 모든 scalar/vector 목적값과 비교가 canonical verifier 결과와 정확히 같다.

Model certificate `1.0.0`은 모델 구현, ruleset·objective·calendar version, solver adapter·version, 정수 범위와 tolerance 가정, 증거 suite를 결합한다. Bounded exhaustive tiny oracle, seeded randomized 비교, tier·qualification·reset·carry·Sunday·objective 경계 테스트와 명시적인 rule-to-constraint mapping을 제공한다. MILP처럼 tolerance를 쓰는 backend는 어떤 accepted integer 결과·bound·증명도 바뀌지 않음을 입증해야 한다.

Constructive algorithm과 heuristic은 verified incumbent와 warm start를 만들 수 있지만 `OPTIMAL/INFEASIBLE`을 주장할 수 없다. 활성 request와 model certificate version이 정확히 일치하고 모든 scalar/vector 및 최종 allocation-vector 단계의 완전한 증명이 끝나야 두 증명 상태를 사용할 수 있다.

### 12.7 실행 상태와 증명 정직성

자동 계획 상태는 다음 discriminated union으로 제한한다.

- `RUNNING`: 후보가 없거나 최신 verified candidate와 구조화된 proof progress를 함께 가짐
- `OPTIMAL`: verified candidate, `COMPLETE` proof와 일치하는 model certificate를 가짐
- `TIME_LIMIT`: 30분 종료 시 최신 verified candidate 또는 `null`; 최적성 주장 없음
- `CANCELLED`: 사용자가 중지했을 때 최신 verified candidate 또는 `null` 보존
- `INFEASIBLE`: candidate는 `null`이고 certified complete proof와 model certificate를 가짐
- `FAILED`: 안전한 오류와 실패 전에 있던 verified candidate 또는 `null`을 보존

`FEASIBLE`이라는 terminal 상태는 사용하지 않는다. 검증됐지만 미증명인 후보는 `RUNNING`, `TIME_LIMIT`, `CANCELLED` 또는 `FAILED` 안의 `bestCandidate`로 표현한다. Proof progress는 현재 scalar/vector stage와 증명된 vector prefix를 구분하며 단일 모호한 숫자로 전체 단계를 완료했다고 표시하지 않는다.

동일 fingerprint의 proven optimum은 complete deterministic tie-break 때문에 byte-for-byte 동일해야 한다. Wall-clock `TIME_LIMIT/CANCELLED/FAILED` incumbent에는 같은 결과 반복을 약속하지 않으며, 결정적 중단 테스트가 필요하면 test-only work/node budget이나 fake clock을 사용한다.

### 12.8 Worker, 단일 30분 실행과 성능 gate

CPU-heavy 최적화는 React main thread가 아닌 Vite module Web Worker에서 실행한다. `START`, `CANCEL`, `PROGRESS`, `INCUMBENT`, `COMPLETE`, `ERROR` 메시지는 versioned·structured-clone-safe이며 `runId`와 증가하는 candidate sequence를 가진다. 이전 run, 중복·감소 sequence와 cancel/apply 이후 늦은 메시지는 무시한다. Cooperative cancellation을 우선하고 worker terminate를 최종 fallback으로 사용한다.

제품 실행은 최대 30분 한 종류뿐이다. Verified candidate가 일찍 나오면 증명을 계속하면서 preview·사용할 수 있고, 적용하면 실행을 끝낸다. 3시간·custom·hidden extension·OS background 실행을 제공하지 않는다. 다시 계산은 선택적인 verified warm start를 가진 새로운 30분 실행이지 이전 deadline 연장이 아니다.

Static app, worker, solver와 WASM asset이 모두 로드된 뒤에는 인터넷이 끊겨도 계산이 계속된다. 로드 전 단절은 정직한 asset-load failure다. Refresh, sleep, tab closure, browser suspension과 process 종료는 계산을 중단할 수 있다.

1·10·20·50명 benchmark를 기록하고 50명에서 preferably 5분 안에 첫 verified candidate를 제공할 수 있는지 확인한다. 대상 office laptop에서 fixed 30-minute workflow가 안전하지 않으면 더 긴 spinner를 추가하지 않고 server-job architecture review에서 중지한다.

### 12.9 Candidate pinning, checkpoint와 수동 계획 적용

Preview는 특정 `candidateId`, sequence, fingerprint와 immutable allocation snapshot에 고정한다. 새 incumbent가 와도 열린 preview를 바꾸지 않고 더 나은 후보 알림만 표시한다. 운영자가 명시적으로 새 후보로 전환할 수 있다.

실행 시작은 기존 수동 draft를 지우거나 solver lock으로 사용하지 않는다. 수동 계획 값이 있으면 교체 확인을 받은 뒤 pinned snapshot만 기존 Phase 3 manual draft string schema로 원자 변환한다. 성공 전에는 기존 draft와 candidate를 모두 보존하고, 성공하면 active worker를 cancel/terminate한다. Decline 또는 변환 실패는 수동 draft를 바꾸지 않는다.

Checkpoint `1.0.0`은 현재 탭의 기존 `sessionStorage` workspace에 최신 verified incumbent 하나와 최소 호환성 metadata만 저장한다. Problem fingerprint, ruleset·objective·calendar·checkpoint·model-certificate version, allocations, canonical objective/display summary, candidate identity·sequence와 발견 시각을 포함한다. 전체 mutable `CalculationResult`, solver frontier·node와 허구의 proof progress는 저장하지 않는다.

복원 시 exact fingerprint/version 일치와 candidate 재검증이 필수다. Refresh 후 warm-start 실행은 새 30분 budget과 새 proof search를 사용하며 proof 재개라고 표시하지 않는다. Serialization·quota·migration·malformed checkpoint 실패는 checkpoint만 비활성화하고 setup, active run과 manual draft를 손상시키지 않는다. Setup edit 또는 새 프로젝트는 active run을 취소하고 checkpoint를 무효화한다.

## 13. 실제값과 부분 재시뮬레이션

### 13.1 계산 원칙

1. 반월 시작부터 실제 완료 경계까지 완전한 실제 원본 스냅샷을 만든다.
2. 그 스냅샷으로 일일 장부와 보름 누계를 시작일부터 다시 계산한다.
3. 완료 경계 다음 날의 `carryIn`과 누적 상태를 얻는다.
4. 과거 실제값과 계산 결과를 고정하고 미래 영업일만 결정 변수로 연다.
5. 후보 미래 계획 전체를 Phase 1 계산 코어로 다시 검증한다.

### 13.2 제안 목적 순서

보름 목표와 고정 과거는 하드 제약으로 두고 그 안에서 다음을 사전식 최소화하는 안을 제안한다.

1. 미래의 편집 가능한 직접 입력 셀 변경 수
2. 변경이 생긴 회원 수
3. 기준 미래안보다 늘어난 신규 PV
4. 전체 신규 PV
5. 일일 소멸 초과분
6. 목표 700 회원의 커미션 발생일 분산 손실
7. 100단위 선호 손실

파생된 상위 좌·우 결과 변화는 변경 셀 수에 포함하지 않고 직접 입력 가능한 `PVP/SELF LEFT/SELF RIGHT`만 세는 안을 제안한다. `추가 신규 PV`를 후보 총합과 기준 총합의 순증으로 볼지, 셀별 증가분의 합으로 볼지와 기준 미래안을 최초 확정안 또는 직전 재전달안 중 무엇으로 볼지는 **Q-RESIM-03**에서 확정한다.

요구사항 17절은 목표 재확보를 네 번째 우선순위로 적어 핵심 목표보다 변경 최소화를 앞세운 것으로 읽힐 수 있다. 보름 목표의 하드 제약 해석은 **Q-RESIM-01**에서 확인한다. `일일 커미션 결과 재확보`가 같은 날짜·단계, 발생일 수, 임의 날짜의 기회 중 무엇을 뜻하는지는 **Q-RESIM-04**에서 별도로 확인한다.

### 13.3 실제값의 완전성

`null`과 0을 구분하고, 완료된 날짜에는 모든 편집 가능 셀의 실제값이 있어야 한다. 확정 계획을 복사한 뒤 달라진 셀만 고치는 방식을 쓰면 날짜 스냅샷을 완전하게 만들 수 있다.

일부 실제값만 입력했을 때 나머지를 확정 계획, 0, 미완료 중 무엇으로 볼지와 완료 경계 정정 방식은 **Q-RESIM-02**에서 확정한다.

## 14. 저장, 버전, 종료 스냅샷

### 14.1 저장 포트

애플리케이션은 다음 기능만 요구하고 실제 저장 기술은 어댑터가 구현한다.

- 프로젝트 목록과 단일 프로젝트 불러오기
- 조직·시작값 리비전 저장
- 계획·확정·실제 리비전 저장
- 리비전 번호 기반 낙관적 충돌 검사
- 프로젝트 종료와 불변 스냅샷 저장
- 백업 내보내기와 가져오기
- 스키마 마이그레이션

### 14.2 GitHub Pages와 저장 방식

GitHub Pages는 정적 배포이므로 다음 두 제품은 아키텍처가 다르다.

- **단일 브라우저 로컬형:** IndexedDB 등 로컬 저장, 별도 계정 없음, 기기 간 자동 동기화 없음
- **계정·동기화형:** 별도 인증과 원격 저장 서비스 필요, 권한·개인정보·백업 운영 필요

어느 형태인지 **Q-DATA-01**에서 확정하기 전에는 특정 저장 제공자를 기술 설계의 필수 요소로 고정하지 않는다.

### 14.3 종료 스냅샷

종료 시 최소 다음을 하나의 논리적 스냅샷으로 보존한다.

- `schemaVersion`, `rulesetVersion`, `engineVersion`과 필요한 자동 계획 objective·policy·calendar version
- 당시 RuleSet 전체 본문
- 선택적인 전체 계산 입력 fingerprint와 자동 계획 problem fingerprint
- 당시 조직과 회원 정보
- 다섯 종류의 회원별 시작값
- 확정 계획 원본
- 실제 결과 원본
- 최종 일일 정산 결과
- 최종 보름 평가 결과
- 종료 시각과 기준 리비전

종료 기록을 열 때는 저장된 당시 결과를 기본 표시한다. 현재 엔진으로 다시 계산하는 기능이 필요하면 원본을 바꾸지 않는 별도 비교 작업으로 제공한다.

RuleSet 전체를 종료 기록에 넣거나, 버전별 RuleSet 본문을 절대 삭제하지 않는 불변 레지스트리를 운영해야 한다. 버전 문자열만 저장하고 과거 규칙 본문을 잃어버리는 방식은 허용하지 않는다.

### 14.4 Fingerprint의 역할

Phase 4의 `problemFingerprint 1.0.0`은 자동 계획 checkpoint, candidate identity와 warm-start compatibility의 필수 계약이다. 정규 bundle과 세 PVP opening 의미, canonical member sequence, canonical date/skip 집합, ruleset `3.0.0`, objective `2.0.0`, calendar `1.0.0`과 관련 schema version을 키 정렬된 canonical serialization으로 만든 뒤 고정된 hash 알고리즘을 적용한다.

Policy seed, 제품 deadline, run ID, candidate sequence, elapsed time, warm start, proof progress와 UI 상태는 제외한다. 같은 business problem은 search configuration과 warm start 유무에 무관하게 같은 fingerprint를 가져야 한다. Fingerprint는 입력 복원이나 신뢰의 근거가 아니므로 checkpoint allocations는 전체 호환성 확인 뒤 Phase 1 verifier로 다시 계산한다. Phase 6의 종료·캐시 fingerprint가 추가되면 목적과 입력 범위를 별도 schema로 구분한다.

## 15. 테스트 전략과 추적성

### 15.1 정답 기반 테스트

`CALCULATION_CASES.md`의 사례 ID를 테스트 이름과 실패 메시지에 그대로 사용한다. 규칙이 바뀌면 요구사항, 기술 설계, 계산 사례, 테스트를 같은 변경에서 갱신한다.

### 15.2 단위 테스트

- 조직의 잎, 한쪽 자식, 양쪽 자식, 다단계 전파
- 공식 단계의 직전·정확한 값·직후와 최고 단계 초과
- PVP 작은 쪽 적용, 적용 후 역전, 미발생 이월
- 커미션 발생 후 초과분을 포함한 전량 초기화
- opening qualification, same-date 267/266 경계, 비초기화 누적 trace
- below-300 실제 정산의 reset 보존, full commission 제외와 blocking warning
- 보름 PVP 목표, 원본 누적, 마감 PVP 적용
- 상·하반기, 월말, 2월, 윤년, 여러 host timezone에서 동일한 일요일
- 입력·조직 불변조건과 위치가 있는 오류

### 15.3 속성 기반 테스트

- 모든 출력 PV는 0 이상 정수다.
- 모든 중간·최종 합계는 안전한 정수이며 범위를 넘는 입력 조합은 성공 결과 대신 `PV_AGGREGATE_OUT_OF_RANGE`를 반환한다.
- 모든 날짜·회원에 `T = P + L + R`이 성립한다.
- 단계가 발생한 `FULL_COMMISSION`과 `BELOW_QUALIFICATION_SETTLEMENT`이면 `carryOut` 세 값이 모두 0이다.
- 미발생이면 `carryOut = preSettlement`이다.
- qualification PVP는 opening과 당일까지의 direct PVP 합이며 일일 reset 뒤에도 감소하지 않는다.
- `commissionOccurrences/commissionDays`에는 qualification-valid full commission만 들어간다.
- 단계는 `null` 또는 공식 단계 중 하나이며 60,000을 넘지 않는다.
- 하위 원본에 `x`를 더하면 그 경로의 모든 상위 해당 방향 원본이 정확히 `x` 증가한다.
- 자식의 일일 커미션 발생 여부는 부모가 받은 그날 원본 `T`를 바꾸지 않는다.
- 일일 초기화 여부가 보름 원본 합계를 바꾸지 않는다.
- 같은 정규 입력과 규칙 버전은 같은 결과를 낸다.

### 15.4 최적화 테스트

- 작은 조직은 제한된 범위를 전수 탐색해 최소 신규 PV와 비교한다.
- Exact model의 soundness, completeness, objective preservation을 certificate와 tiny oracle로 교차 검증한다.
- 낮은 우선순위 개선 때문에 높은 우선순위가 악화되지 않는지 확인한다.
- `[0,8,8]` 대 `[7,7,7]`, 빈 target-700 vector, 8 대 9와 higher-tier-one-day를 검증한다.
- exact 1 PV 보정, non-100 셀 수, max direct PVP와 deterministic allocation vector의 엄격한 우선순위를 검증한다.
- 공동 기여, exact PVP 100과 target-700 total days가 독립 목적 단계가 아님을 검증한다.
- same-date qualification crossing, one-sided pre-qualification carry와 below-300 후보 거부를 검증한다.
- `OPTIMAL/INFEASIBLE`은 complete certified proof에서만 나오고 time limit·cancel·failure는 verified candidate만 보존하는지 확인한다.
- proven optimum은 byte-for-byte 같고 wall-clock-limited incumbent에는 동일성 보장을 강요하지 않는다.
- stale run, 감소 sequence, pinned preview race, checkpoint 재검증과 quota failure를 검증한다.
- 부분 재시뮬레이션이 고정 과거를 바꾸지 않는지 확인한다.

## 16. 확정 기술 스택과 Phase 2 UI 정책

Phase 1과 Phase 2는 다음 최소 구성으로 확정한다.

- TypeScript: 정수·상태·방향과 원본·파생 계약을 명시적으로 표현
- Vite: `/ngplan/` 정적 웹 앱의 개발·빌드·미리보기 기반
- Vitest: Node 계산 테스트와 jsdom UI 테스트를 분리해 실행
- React + React DOM: 프로젝트 폼, 카드형 조직 트리, 회원 편집과 검증 상태 조합
- Testing Library + user-event: 실제 레이블, 키보드 순서와 사용자 동작 중심의 DOM 검증
- 최적화 실행: Phase 4는 Vite module Web Worker에서 수행하고 UI main thread와 분리

Phase 2 최초 범위에는 라우터, 전역 상태 라이브러리, 드래그앤드롭 라이브러리와 브라우저 저장소를 추가하지 않는다. Phase 3 실사용 테스트에서는 설정 화면과 수동 계획표를 오갈 때 입력이 사라지지 않도록 현재 탭의 작업 초안 하나만 `sessionStorage`에 자동 저장한다. 이는 탭을 닫으면 사라지는 안전장치이며 프로젝트 목록·리비전·기기 간 동기화·장기 복구를 제공하는 Phase 6 저장소가 아니다.

### 16.1 카드형 조직 편집

- 모든 활성 회원 카드는 왼쪽·오른쪽 자식 슬롯을 각각 하나씩 보여 준다.
- 빈 슬롯은 `SELF`, 직접 자식이 있는 슬롯은 `CHILD`로 파생한다.
- 빈 슬롯의 `+`에서 새 회원을 만들거나 재배치 대기 중인 서브트리를 연결한다.
- 기존 서브트리 이동, 분리, 루트 지정과 회원 제외는 명시적 버튼과 선택 상자로 수행한다.
- 넓은 조직은 가로 스크롤을 제공하고 각 가지는 키보드로 접고 펼칠 수 있다.

### 16.2 승인된 UI 테마 토큰

테마 값은 `src/ui/theme.css` 한 곳에서 관리한다.

| 토큰 | 값 |
|---|---|
| `--color-accent` | `#25b7e8` |
| `--color-accent-strong` | `#0aa5dc` |
| `--color-accent-action` | `#087ea4` |
| `--color-accent-soft` | `#e8f8fd` |
| `--color-text` | `#111827` |
| `--color-muted` | `#606b78` |
| `--color-background` | `#f4f5f7` |
| `--color-panel` | `#ffffff` |
| `--color-line` | `#d9dde3` |
| `--color-danger` / `--color-danger-soft` | `#9b2c2c` / `#fff5f5` |
| `--color-success` / `--color-success-soft` | `#1f7a3b` / `#f0fff4` |
| `--radius-control` | `8px` |
| `--shadow-panel` | `0 4px 16px rgba(17, 24, 39, 0.06)` |

밝은 청록색은 장식·선택 강조에 사용하고, 흰 배경 위의 작은 글자와 주요 버튼에는 더 진한 `--color-accent-action`을 사용한다. 오류·경고·선택·완료 상태는 색만으로 표현하지 않고 텍스트와 구조적 표지를 함께 제공한다.

## 17. 구현 전 결정 목록

Phase 1 계산 질문은 모두 확정되었다. 이후 Phase 질문은 해당 기능에 착수하기 전에 같은 방식으로 결정하고 계산 사례를 확정한다.

### 17.1 Phase 1 확정 결정

| ID | 확정 결정 | 영향 | 확정일 |
|---|---|---|---|
| **Q-CALC-01** | 보름 작은 쪽 적용량은 `보름 PVP 시작값 + 이번 보름 신규 PVP` 전액이다. 목표 초과분도 포함한다. `dailyCarryPvp`는 제외하고 보름 PVP 시작값은 상위 조직에 재전파하지 않는다. | 개인 PVP와 보름 좌·우 판정 원천 고정 | 2026-07-11 |
| **Q-CALC-02** | 날짜별 하위 신규 원본 `P/L/R`은 발생일에 모든 상위 회원에게 경로당 한 번 연쇄 반영한다. 시작·이월 잔액, PVP 적용값, 정산 결과는 신규 실적으로 재전파하지 않는다. | 중복 합산 방지. 기존 SRM 엑셀의 `PVP+좌+우` 연쇄 수식과 일치 | 2026-07-11 |
| **Q-CALC-03** | 좌·우 동률이면 왼쪽에 PVP 전액을 적용하고 `동률 → 좌 적용`으로 표시한다. | 일일·보름 결과의 결정성 확보 | 2026-07-11 |
| **Q-CALC-04** | 일요일은 `SKIP_NO_INPUT` 행이다. 자동·수동·실제 입력을 금지하고 정산을 건너뛰며 잔액을 그대로 넘긴다. 토요일·공휴일은 정상 영업일이다. | 달력·이월·입력 검증 고정 | 2026-07-11 |
| **Q-CALC-05** | 회원별 PVP 목표는 2,400·1,500·700 중 하나를 직접 선택한다. 목표 700 회원에게는 같은 PV 안에서 약 8일의 커미션 발생을 권장한다. 이름 앞 숫자와 색상은 계산과 무관한 선택적 찾기용 표지판이다. | 레벨 개념 제거, 목표·표지판·조직 위치 분리 | 2026-07-12 |
| **Q-CALC-06** | 프로젝트 하나는 루트 한 명의 연결된 비순환 트리다. 루트 없음·복수 루트·고아 회원은 오류다. | 조직 검증 계약 고정 | 2026-07-11 |
| **Q-STACK-01** | Phase 1은 TypeScript + Vite + Vitest를 사용한다. UI 프레임워크는 Phase 2 전에 결정한다. | Phase 1 파일·테스트 계획 승인 | 2026-07-11 |
| **Q-STACK-02** | Phase 2는 React + React DOM, jsdom, Testing Library를 사용한다. 라우터·전역 상태·드래그앤드롭·저장 패키지는 추가하지 않는다. | 프로젝트·조직 입력 UI와 DOM 검증 계약 고정 | 2026-07-11 |
| **Q-PRODUCT-02A** | 날짜별 계획 리비전이 없는 Phase 2 `IN_PROGRESS` 설정은 자유롭게 편집한다. 모든 원본 변경은 활성 `ProjectSetupBundle`을 즉시 해제하며, 회원 제외는 후손 서브트리를 보존한다. | Phase 2 편집·제외·재검증 계약 고정 | 2026-07-11 |

### 17.2 Phase 4 Q-SIM 확정 결정

| ID | 확정 결정 | 영향 | 확정일 |
|---|---|---|---|
| **Q-SIM-01** | 기능 최대는 활성 회원 50명이다. 제품 실행은 Web Worker의 단일 30분 제한이며 3시간·custom·background mode는 없다. Verified candidate를 가능하면 5분 안에 게시하고, 30분 종료 후보는 미증명으로 표시한다. `OPTIMAL/INFEASIBLE`은 일치하는 model certificate와 complete exact proof가 있을 때만 가능하다. | 브라우저 성능 gate, 상태·증명 정직성, worker lifecycle 고정 | 2026-07-12 |
| **Q-SIM-02** | Qualification-valid full commission의 `discardedExcessPv = prePvp + preLeft + preRight - 2 × commissionTier`를 사용한다. 비커미션·skip·below-300 정산은 0이며 terminal carry에는 만료 사건 없는 한 penalty를 주지 않는다. | 두 번째 목적함수와 period-end carry 의미 고정 | 2026-07-12 |
| **Q-SIM-03** | 높은 목적이 같은 경우 목표 700 회원 중 8일 이상인 회원 수를 먼저 최대화하고, 이어 전체 counted-day 오름차순 vector를 사전식 최대화한다. 8일 cap은 없으며 total commission days는 display-only다. | `[0,8,8] > [7,7,7]`, dead total-days stage 제거 | 2026-07-12 |
| **Q-SIM-04** | Exact 1 PV 값을 허용한다. 높은 목적이 모두 같을 때 0이 아닌 non-100-multiple 직접 셀 수를 최소화하고, 완전 동률은 date → root/LEFT/RIGHT canonical member → PVP/SELF_LEFT/SELF_RIGHT allocation vector로 결정한다. | 반올림으로 총 PV를 늘리는 오류 방지와 최적해 단일화 | 2026-07-12 |
| **Q-SIM-05** | `openingQualificationPvp`, `fortnightPvpOpeningCredit`, `dailyCarryPvp`를 별도 장부로 둔다. Qualification은 opening과 당일 포함 direct PVP 누계이며 reset되지 않는다. 300 미만 정산도 실제 reset하되 full commission으로 세지 않고 경고하며 자동 후보는 거부한다. | Ruleset·engine `3.0.0`, inclusive gate와 full-only count 고정 | 2026-07-12 |
| **Q-UI-OPEN-01** | 회원 설정은 PVP 시작값 하나만 받고 Phase 2 정규화 시 세 내부 PVP 장부의 공통 최초값으로 기록한다. 엔진 안의 장부 역할과 이후 변화는 계속 분리한다. | 실제 입력 항목 단순화와 qualification 누계 누락 방지 | 2026-07-13 |
| **Q-SIM-06** | Exact PVP 100은 독립 목적이 아니다. 공동 하위 기여도 독립 보상이 아니라 총 PV에서 반영한다. Non-100 셀 수 다음에 max direct PVP를 최소화하고, PVP 100의 자식·부모 위치는 전체 트리의 총 PV·discarded excess·후속 목적에 따라 선택한다. | 과거 관습적 PVP-100 배치 제거와 objective `2.0.0` 고정 | 2026-07-12 |

### 17.3 이후 Phase 차단 질문

| ID | 질문 | 영향 |
|---|---|---|
| **Q-RESIM-01** | 과거 실제값과 보름 목표 회복을 하드 제약으로 두고 그 안에서 변경 셀·회원·추가 PV를 최소화하는가? | 부분 재시뮬레이션 가능성·우선순위 |
| **Q-RESIM-02** | 실제 완료일은 하루 전체의 완전한 스냅샷인가? 일부 빈칸은 확정 계획 복사, 0, 미입력 중 무엇인가? 실제값 정정 시 완료 경계를 되돌릴 수 있는가? | 실제값과 고정 경계 |
| **Q-RESIM-03** | 변경 셀·회원 수에는 직접 입력만 세는가? 추가 신규 PV는 `후보 총합-기준 총합`의 양수 부분인가, 셀별 증가분 합인가? 여러 번 재계산할 때 기준 미래안은 최초 확정안인가 직전 재전달안인가? | 변경 목적함수와 기준안 |
| **Q-RESIM-04** | `일일 커미션 결과 재확보`는 같은 날짜·같은 단계 유지, 발생일 수 유지, 또는 임의 미래 날짜의 커미션 기회 재최적화 중 무엇인가? 하드 제약인가 소프트 목적인가? | 일일 결과 회복 계약 |
| **Q-DATA-01** | 한 브라우저 로컬 전용인가, 계정·여러 기기 동기화·공동 사용이 필요한가? 회원 이름·ID의 암호화, 접근 권한, 보존·삭제 정책은 무엇인가? | 저장·보안·배포 구조 |
| **Q-DATA-02** | 계획 전달과 백업에 화면, 인쇄, PDF, 스프레드시트, 공유 링크 중 무엇이 필요한가? | 출력·공유 범위 |
| **Q-PRODUCT-01** | 종료 프로젝트는 영구 잠금인가, 복제본을 새 프로젝트로 만드는 것만 허용하는가, 관리자 재개가 필요한가? | 종료 상태·감사 기록 |
| **Q-PRODUCT-02** | Phase 2 설정 묶음 이후 계획·확정·실제 리비전이 있는 상태에서 조직·PVP 목표·찾기 표지판·시작값 변경을 언제 허용하는가? 새 조직 스냅샷과 기존 리비전의 관계는 무효화, 복제, 재계산 중 무엇인가? | Phase 5의 계획 이후 조직 변경과 재계산 |

Phase 1 계산 규칙, Phase 2 설정·UI 스택과 Phase 4 Q-SIM-01~06은 모두 확정되었다. Phase 1 구현은 GitHub Issue #1에 연결해 완료했으며, 17.3의 남은 질문은 해당 기능을 포함하는 Phase 5~6 진입 전에 확정한다.
