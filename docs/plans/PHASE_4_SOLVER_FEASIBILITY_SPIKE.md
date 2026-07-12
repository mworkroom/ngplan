# Phase 4 Exact Solver Feasibility Spike

> 작성일: 2026-07-12  
> 상태: 브라우저 정확 증명 백엔드 미승인 — 검증 후보 기능은 구현, `OPTIMAL/INFEASIBLE`은 비활성

## 목적

Phase 4 실행 계획의 WP2 관문에 따라 브라우저 Web Worker 안에서 최대 50명 문제를 풀고, 정수 의미·목적함수·완전 탐색 범위를 보존한 채 `OPTIMAL` 또는 `INFEASIBLE`을 증명할 수 있는 백엔드를 선택할 수 있는지 검토했다.

## 검토 결과

- Google OR-Tools CP-SAT은 정수 모델과 증명 상태를 제공하지만, 공식 프로젝트는 브라우저에서 사용할 수 있는 지원 WASM 빌드를 제공하지 않는다. 공식 논의에서도 브라우저 친화적 WASM 지원이 없다고 확인된다.
- HiGHS 본체는 MIT 라이선스의 MIP 솔버지만 공식 배포는 브라우저 TypeScript API가 아니다. 확인한 브라우저 패키지는 제3자 WASM wrapper이며, Phase 4가 요구하는 solver version 결속, tolerance 안전성, complete deterministic vector proof와 50명 Web Worker 관문을 충족했다는 증거가 없다.
- GLPK 계열 브라우저 wrapper도 부동소수점 tolerance를 사용하는 MIP 경계다. 현재 저장소의 exact safe-integer verifier만으로는 모델이 더 나은 유효 계획을 누락하지 않았다는 completeness를 증명할 수 없다.
- 따라서 새 solver/WASM 의존성을 추가하지 않았다. 라이선스, CSP, 번들 크기, cancellation, 반복 실행 정리와 exact proof를 충분히 검증하지 않은 패키지를 제품 권위로 승인하지 않는다.

참조:

- [OR-Tools CP-SAT 공식 문서](https://developers.google.com/optimization/cp/cp_solver)
- [OR-Tools 브라우저 WASM 지원 논의](https://github.com/google/or-tools/discussions/2997)
- [HiGHS 공식 저장소](https://github.com/ERGO-Code/HiGHS)
- [제3자 highs WASM wrapper](https://www.npmjs.com/package/highs)

## 구현 결정

- 결정적 constructive candidate와 bounded tiny exhaustive oracle를 구현했다.
- 모든 raw candidate는 ruleset/engine `3.0.0`으로 다시 계산하고 shape, 자격 PVP, 목표, 목적 벡터를 독립 검증한 뒤에만 사용할 수 있다.
- Web Worker는 검증 후보를 게시한 뒤 exact proof backend 부재를 `FAILED / AUTOMATIC_PLAN_PROOF_INCOMPLETE`로 종료한다. 이미 검증된 후보는 미리보기·체크포인트·수동 계획 적용에 계속 사용할 수 있다.
- 50명 정규 이진 조직의 constructive candidate 생성과 정본 엔진 재검증은 개발 환경의 격리 시험에서 26.61ms로 관측됐다. 이 값은 exact search 또는 목표 office laptop의 30분 proof benchmark가 아니며, 회귀 테스트에는 변동성 있는 시간 임계값을 두지 않았다.
- 제품은 대기만 하는 가짜 30분 탐색이나 휴리스틱 종료의 `OPTIMAL/INFEASIBLE` 표시를 하지 않는다.
- 고정 제품 상한 `1,800,000ms`, 3시간·사용자 지정 실행 금지, versioned worker protocol과 stale message 차단 계약은 유지한다.
- `OPTIMAL/INFEASIBLE` 생성 API는 matching model certificate와 complete proof 없이는 호출할 수 없도록 타입 경계에서 잠갔다.

## WP2 관문 판정

| 관문 | 결과 |
|---|---|
| Web Worker에서 UI와 분리 | 통과 |
| 검증 가능한 constructive candidate | 통과 |
| 50명 constructive 생성·독립 검증 | 통과 — 개발 환경 관측 26.61ms, 비보장 측정 |
| tiny bounded oracle와 정본 비교 | 통과 |
| exact model soundness/completeness/objective preservation 인증 | 미통과 |
| 50명 exact proof·30분 성능 측정 | 미실시 — 승인 backend 없음 |
| 브라우저 solver 의존성 승인 | 보류 |

WP2의 exact solver 관문은 통과하지 않았다. 따라서 Phase 4의 후보 생성·검증·적용 흐름은 사용할 수 있지만, 수학적 최적성·불가능 증명 기능은 architecture review 전까지 완료로 간주하지 않는다.

## 다음 검토 조건

다음 중 하나가 준비되면 exact proof 작업을 재개한다.

1. 브라우저용 backend가 model certificate `1.0.0`의 soundness, completeness, objective preservation, exact integer/tolerance 조건과 1·10·20·50명 worker benchmark를 모두 통과한다.
2. 정적 GitHub Pages 범위를 벗어난 server-job architecture를 별도 승인하고, solver version·입력 fingerprint·증명 결과·취소·재연결·비용·인증 경계를 새 실행 계획으로 확정한다.

그 전에는 검증 후보를 “최적”이라고 부르거나 candidate가 없다는 이유만으로 “불가능”이라고 표시하지 않는다.
