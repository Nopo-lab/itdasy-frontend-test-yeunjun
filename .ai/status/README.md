# .ai/status/ — 터미널별 상태 파일 (충돌 방지용)

## 목적

4개 터미널이 `.ai/BOARD.md` 를 동시에 수정하면 git 충돌 발생. 해결책:
- 각 터미널은 **자기 파일만** 씀 (예: T1 은 `T1.md`)
- 오케스트레이터(cowork 세션) 가 주기적으로 합쳐 `.ai/BOARD.md` 갱신

## 파일

- `T1.md` — T1 Architect 가 작성
- `T2.md` — T2 FE Coder 가 작성
- `T3.md` — T3 BE Coder 가 작성
- `T4.md` — T4 Ops 가 작성

## 포맷 (각 터미널이 따름)

```markdown
# T{N} 상태

- 마지막 업데이트: YYYY-MM-DD HH:MM
- 현재 티켓: T-NNN
- 단계: (bootstrap / plan / implement / self-review / task-review / done / idle)
- 다음 할 일: ...
- 블로커: 없음 / 설명
- 최근 커밋: (해당 시)
```

## 규칙

- 자기 파일만 수정
- 5분 이상 같은 단계 머물면 블로커 명시
- 완료 시 `.ai/tickets/T-NNN/self-review.md` 링크 포함
