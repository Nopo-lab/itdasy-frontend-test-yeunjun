# Tickets Index

> 모든 티켓은 `T-NNN` ID 를 가짐. 각 파일은 한 티켓의 전체 수명주기 포함.
> 티켓 내부 세부(plan·self-review·diff)는 `T-NNN/` 하위 폴더 생성 가능.

## Phase 1 (2026-04-20 주)

| ID | 제목 | 담당 | 상태 | 의존 |
|----|------|------|------|------|
| [T-001](./T-001.md) | AGENTS.md + 모듈별 CLAUDE.md 배치 | T2 | pending | - |
| [T-002](./T-002.md) | ESLint + husky + lint-staged 설치 | T2 | pending | T-001 |
| [T-003](./T-003.md) | app-push.js 토큰 키 버그 픽스 | 오케스트레이터 | in progress | - |
| [T-004](./T-004.md) | 백엔드 에러 응답 포맷 표준화 | T3 | pending | - |
| [T-005](./T-005.md) | 주간 GC 스크립트 + Actions | T4 | pending | T-002 |

## Phase 2 (예정, 2~3주차)

| ID | 제목 | 담당 |
|----|------|------|
| T-010 | app-caption.js → js/caption/ 분할 | T2 |
| T-011 | app-portfolio.js → js/portfolio/ 분할 | T2 |
| T-012 | app-gallery.js → app-gallery-index.js 리네임 + inline onclick 제거 | T2 |
| T-013 | 백엔드 API 엔드포인트 스펙 확정 + ENDPOINTS 동기화 | T3 |
| T-014 | app-core.js 에 STORAGE_KEYS/ENDPOINTS 도입 + 전면 치환 | T2 |

## Phase 3 (예정, 4주차, 런칭 준비)

| ID | 제목 | 담당 |
|----|------|------|
| T-020 | 스테이징 → 운영 승격 PR (사용자 승인 필수) | 오케스트레이터 |
| T-021 | Android release 빌드 | T2 |
| T-022 | 앱스토어 제출 체크리스트 | T1 |
| T-023 | 최종 보안 리뷰 | T1 |
| T-024 | CLAUDE.md 전 레포 동기화 | T4 |

---

## 티켓 ID 부여 규칙

- `T-0NN` — Phase 1 (1주차)
- `T-1NN` — Phase 2 (2~3주차)
- `T-2NN` — Phase 3 (4주차)
- `T-9NN` — 긴급 hotfix

## 티켓 라이프사이클

```
pending → planning → self-review → coding → review → merging → done
                ↓
             blocked (ESCALATION 에 명시 후 대기)
```
