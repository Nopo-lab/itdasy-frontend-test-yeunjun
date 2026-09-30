# GPT 에 붙여넣는 프롬프트 — 누끼 키 주입·실측 비교·백엔드 #107 검증·Supabase 이름 정리

> 만든 곳: Claude 세션(2026-09-30). Claude 는 이 클라우드 환경에서 fal·Replicate·Cloud Run 접속이 막혀 있고
> GCP·fal 계정 권한이 없어서, 권한 있는 쪽(GPT·연준님 로컬)이 하도록 넘긴다.
> 아래 ``` 안을 통째로 복사해서 붙여넣는다.

```
너는 잇데이(itdasy) 백엔드 운영 작업자다. 아래를 순서대로 하고, 단계마다 "실행한 명령 요약 + 실측 결과"를 남겨라.
추측으로 "됐다"고 쓰지 마라. 확인 못 한 건 "미확인 + 이유"로 적어라.

## 절대 규칙
- 키·비밀번호·토큰 값은 채팅·로그·커밋·PR 어디에도 쓰지 마라. Secret Manager 에만 넣는다.
- 실제 손님 사진 금지. 누끼 비교는 합성 사진이나 동의받은 샘플만(외부 업체로 전송된다).
- 운영 DB(Supabase 프로젝트 ref hsxxqomfbdernepykils)에 쓰기·삭제 금지. 조회도 필요한 최소만.
- 운영 서비스(itdasy-backend-prod) 변경은 7단계에서만, 테스트가 전부 초록일 때만.
- 변경 전 현재 값(리비전 이름, env 목록)을 기록해 두고, 문제가 생기면 그걸로 되돌려라.

## 배경 (이미 된 것)
- 백엔드 레포 Nopo-lab/itdasy_backend-test PR #107 이 main 에 머지됨(머지 커밋 1c43617). 내용:
  · 누끼 순서: 1순위 Replicate cjwbw/rembg(약 5원) → 2순위 fal BiRefNet v2(약 1~2원, FAL_KEY 있을 때만)
    → 3순위 Remove.bg(장당 250~1,780원, **기본 꺼짐**: REMOVEBG_FALLBACK_DAILY_MAX 미설정=0)
  · 폴백 원가를 실단가로 기록(ApiUsageLog endpoint: remove-bg-fal 3원, remove-bg-fallback 300원)
  · 인젝션처럼 보이는 손님 DM 은 자동발송하지 않고 원장 확인으로(dm_safety prompt_injection)
- 테스트 서비스 배포는 GitHub Actions "Deploy Backend to Cloud Run" run 36729412752 로 진행 중이었다.
- 배포 워크플로는 --update-env-vars 로 env 를 "덧붙이기"만 한다 → 서비스에 직접 넣은 시크릿은 다음 배포에도 유지된다.
- 런타임 서비스계정: itdasy-backend-runtime@itdasy-495513.iam.gserviceaccount.com (프로젝트 itdasy-495513, 리전 asia-northeast3)
- 비교 스크립트: 프론트 레포 Nopo-lab/itdasy-frontend-test-yeunjun 의 scripts/nukki-benchmark.py (브랜치 ccr-481d8ac1-2ctwd8, PR #70)

## 1. 테스트 배포 확인
- run 36729412752 결과 확인. 실패면 로그 원인부터 보고하고 멈춰라.
- 트래픽 100% 받는 리비전의 GIT_SHA 가 1c43617(또는 그 뒤 커밋)인지 확인:
  gcloud run services describe itdasy-backend-test --region=asia-northeast3 --project=itdasy-495513 \
    --format='value(status.traffic[].revisionName,status.traffic[].percent)'
  (최신 리비전 ≠ 트래픽 받는 리비전일 수 있다. 트래픽 쪽을 믿어라)
- /health 200, wiring.git_sha, wiring.schema_parity=ok 확인.

## 2. fal 키 발급 → 테스트 서비스에 주입
- fal.ai 대시보드 → API Keys → 새 키 생성(이름: itdasy-test-nukki). 가능하면 사용량 한도/알림 설정.
- Secret Manager 에 저장(값은 파일/stdin 으로, 명령줄 인자로 넘기지 마라):
  gcloud secrets create fal-key --replication-policy=automatic --project=itdasy-495513   # 이미 있으면 versions add
  printf '%s' "$FAL" | gcloud secrets versions add fal-key --data-file=- --project=itdasy-495513
- 런타임 SA 에 이 시크릿 읽기 권한만:
  gcloud secrets add-iam-policy-binding fal-key --member=serviceAccount:itdasy-backend-runtime@itdasy-495513.iam.gserviceaccount.com \
    --role=roles/secretmanager.secretAccessor --project=itdasy-495513
- 테스트 서비스에 연결:
  gcloud run services update itdasy-backend-test --region=asia-northeast3 --project=itdasy-495513 \
    --update-secrets=FAL_KEY=fal-key:latest
- 같은 방식으로 REPLICATE_API_TOKEN 이 테스트 서비스에 있는지 확인(없으면 보고만, 새로 만들지 말 것).
- REMOVEBG_FALLBACK_DAILY_MAX 가 테스트 서비스 env 에 **없는지** 확인(있으면 값 보고).

## 3. 누끼 실측 — 서버 경로
- 테스트 계정(cbt 계열, 운영 계정 금지)으로 POST {테스트 URL}/image/remove-bg 를 합성 사진 5장 × 3회.
  응답 200·PNG·시간 기록. 같은 사진 두 번째는 캐시(X-Cache: HIT)일 수 있으니 사진마다 조금씩 다르게.
- Cloud Logging 에서 [NUKKI] 로그로 어느 경로를 탔는지 확인:
  gcloud logging read 'resource.labels.service_name="itdasy-backend-test" AND textPayload:"[NUKKI]"' \
    --project=itdasy-495513 --freshness=30m --limit=50 --format='value(timestamp,textPayload)'

## 4. 강제 폴백 검증 (테스트 서비스에서만, 끝나면 반드시 원복)
- 현재 REPLICATE_BG_MODEL 값 기록 → 존재하지 않는 모델로 잠깐 바꿔 1순위를 일부러 실패시킨다:
  gcloud run services update itdasy-backend-test ... --update-env-vars=REPLICATE_BG_MODEL=itdasy/does-not-exist
- 누끼 3회 → 기대: 200 이고 로그에 "[NUKKI] Replicate 실패, 다음 경로로" 다음 "[NUKKI] fal BiRefNet 성공".
  Remove.bg 는 불리면 안 된다(로그에 Remove.bg 가 찍히면 실패로 보고).
- FAL_KEY 도 잠깐 빼고(--remove-secrets=FAL_KEY) 1회 → 기대: 503("잠시 후 다시"), Remove.bg 호출 0.
- 원복: REPLICATE_BG_MODEL 원래 값(없었으면 --remove-env-vars), FAL_KEY 다시 --update-secrets. 원복 후 누끼 1회 200 확인.
- 테스트 DB(Supabase itdasy-test, ref pgsvvcjrifbidwpwfdst)에서 조회만:
  SELECT endpoint, count(*) FROM api_usage_logs WHERE used_at > now() - interval '1 hour'
    AND endpoint IN ('remove-bg','remove-bg-fal','remove-bg-fallback') GROUP BY 1;
  기대: remove-bg-fal 이 fal 성공 횟수만큼, remove-bg-fallback 0.

## 5. 업체별 속도·원가·품질 비교
- 로컬에서(키는 환경변수로, 셸 히스토리에 안 남게):
  REPLICATE_API_TOKEN=... FAL_KEY=... python3 scripts/nukki-benchmark.py --images <합성사진폴더> --runs 3 --out ./nukki-bench
  서버 경로도 재려면 ITDASY_API=<테스트URL> ITDASY_TEST_EMAIL=... ITDASY_TEST_PASSWORD=... 추가.
- 요약 표(성공률·p50·p95·원/장)를 그대로 붙이고, nukki-bench/index.html 을 눈으로 보고
  손가락·손톱 경계·머리카락이 어떤 경로에서 더 깔끔한지 사진별로 한 줄씩 적어라.
- 결론: 1순위를 Replicate 851-labs(약 0.6원)로 바꿔도 되는지 "품질 근거"와 함께 추천(바꾸는 건 하지 마라).

## 6. Supabase 이름 정리 (코드 변경 없음, 대시보드 작업)
- Supabase 대시보드: 프로젝트 itdasy-staging(ref hsxxq…) → 이름을 itdasy-prod 로. beauty-platform → itdasy-old-archive. itdasy-test 는 그대로.
  (ref·URL·접속 문자열은 안 바뀐다. 이름만 바뀐다)
- GitHub 레포 Nopo-lab/itdasy-frontend-test-yeunjun → Settings → Secrets → Actions:
  SUPABASE_LIVE_DB_URL = 기존 SUPABASE_STAGING_DB_URL 과 같은 값, SUPABASE_ARCHIVE_DB_URL = 기존 SUPABASE_PROD_DB_URL 과 같은 값.
  (이 새 이름을 읽는 워크플로는 PR #70 브랜치에 있다. PR #70 이 main 에 머지된 뒤에 Actions → Supabase Daily Backup → Run workflow)
- 로그에 "LIVE 주소 출처: SUPABASE_LIVE_DB_URL (운영 ref 일치)" 가 보이면 옛 시크릿 2개 삭제. 안 보이면 삭제하지 마라.
- Supabase 대시보드 → Settings → Add-ons 에서 PITR 켜져 있는지, Billing 에서 Spend cap 켜짐/꺼짐 보고.

## 7. 운영 반영 (1~5 전부 초록일 때만)
- 운영 서비스 itdasy-backend-prod 의 현재 트래픽 리비전·env 기록(롤백용).
- 운영에도 fal-key 연결(--update-secrets=FAL_KEY=fal-key:latest), REMOVEBG_FALLBACK_DAILY_MAX 없는지 확인.
- 운영 배포 방식(수동)으로 1c43617 이후 커밋 반영. 배포 후 /health·git_sha 확인, 운영 테스트 계정으로 누끼 1회.
- 5분간 [NUKKI]·5xx 로그 확인. 이상하면 기록해 둔 리비전으로 트래픽 100% 되돌리고 보고.

## 8. 정리
- 옛 Remove.bg 키는 과거 git 이력에 노출된 적이 있다(T-904). 기본 꺼짐이 됐으니 remove.bg 대시보드에서 폐기하고,
  서비스 env 의 REMOVEBG_API_KEY 도 제거할지 원영님께 물어라(제거하면 비상시 켤 수 없다).
- 최종 보고: 단계별 ✅/❌/미확인 표 + 비교 표 + 추천 + 되돌린 것 목록.
```
