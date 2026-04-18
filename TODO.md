# TODO — 진행 상황 (2026-04-18 갱신)

## 워크플로우 규칙 (2026-04-18 확정)

> **모든 프론트 변경은 이 레포(`itdasy-frontend-test-yeunjun`)에서 먼저 작업·검증한 뒤,
> 완료되면 프로덕션 레포(`itdasy-frontend`)로 푸시한다. 절대 프로덕션 레포에 직접 푸시 금지.**

검증 완료 후 프로덕션 반영 명령:

```bash
# 검증된 파일을 프로덕션 레포로 복사 → 커밋 → 푸시
cp <변경파일> ../itdasy-frontend/
cd ../itdasy-frontend && git add . && git commit -m "..." && git push
```

---

## ✅ 완료 (2026-04-18 세션)

- [x] **개인정보처리방침 (`privacy.html`) 전면 재작성** — PIPA 표준 11개 항목 모두 포함
  - 수집 항목 7종(이메일/IP/매장정보/Instagram/이미지/캡션/결제)
  - 제3자 제공/위탁 8개사(Gemini/Replicate/Remove.bg/Meta/Resend/Sentry/Supabase/Railway)
  - 보유기간(IP 90일, 결제 5년, 탈퇴 즉시 등)
  - 파기절차(15개 테이블 CASCADE + 디스크 rmtree + 토큰 삭제)
  - 정보주체 권리(앱 내 탈퇴 + Meta 콜백 24시간)
  - 안전성 확보(bcrypt, Fernet, HTTPS, Rate Limit 등)
  - 책임자 연락처(kangtaetv@gmail.com)

---

## 🔥 다음 (검증 후 프로덕션 반영)

### 검증 체크리스트 (`privacy.html` 프로덕션 푸시 전)
- [ ] 브라우저에서 페이지 렌더링 확인 (테이블 정렬, 한글 폰트)
- [ ] 모바일 화면 반응형 확인
- [ ] 모든 외부 링크/이메일 주소 동작 확인
- [ ] 원영과 내용 검토 (수집항목·위탁사 누락 없는지)
- [ ] 검토 통과 시 → `cp privacy.html ../itdasy-frontend/ && cd ../itdasy-frontend && git add privacy.html && git commit -m "docs: 개인정보처리방침 PIPA 표준 보강" && git push`

### 다른 우선순위 (진행 시 본 레포에서 작업)
- [ ] **프론트 구독 UI 실제 결제 연결** — 토스페이먼츠 SDK
- [ ] **프론트 접근성(a11y)** — aria-label, alt 속성 추가
- [ ] **Sentry 프론트엔드 JS SDK 추가**
- [ ] **TD-010 [T-3]** `app-persona.js _pPostCount` 새로고침 리셋 → GET /persona/posts로 total 재조회
- [ ] 회원탈퇴 UI에 "모든 데이터가 즉시 영구 삭제됩니다" 경고 강화
