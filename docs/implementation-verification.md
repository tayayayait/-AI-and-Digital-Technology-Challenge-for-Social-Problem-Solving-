# 구현 및 검증 현황

이 문서는 `구현계획.md`의 의존 순서대로 반영한 구현 범위와 검증 기준을 요약한다.
2026-09-05 기준 로컬 구현과 원격 적용 결과를 함께 정리한다.

전국 CCTV 조회와 영상 판독 기능은 로컬 코드·라우트·배포 목록에서 제거했다. 하단 탭은
기상청 초단기예보 기반 6시간 위험 전망으로 교체했으며, 현재 위험도와 예상 위험도를 분리한다.

| 단계    | 완료한 구현                                                                              | 핵심 검증                                                                         |
| ------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Phase 1 | 실제 API 기준시각·신선도, ITS 통제 위험 배선, 필수 CI, pnpm 단일 락파일과 probe 정리     | 기준시각·위험 판정 단위 테스트, CI 계약 테스트                                    |
| Phase 2 | 매니페스트·서비스워커·갱신 배너, 허용 데이터 오프라인 캐시와 만료 정책                   | PWA 설정·캐시 직렬화·온라인 상태 테스트, 프로덕션 빌드                            |
| Phase 3 | Web Push 구독 테이블과 RLS, VAPID 발송, 5분 위험 모니터와 중복 발송 방지                 | 구독·서명·위험 임계값·cron 보안 계약 테스트                                       |
| Phase 4 | CRITICAL 긴급 화면, 단일 행동 CTA, Web Speech 음성 안내와 정리                           | 긴급 상태 전환·음성 지원/실패/중단 테스트                                         |
| Phase 5 | 도움말·운영 위험구역·API 상태의 목데이터 제거, 실제 조회 결과와 빈 상태 연결             | 비서울 위치·동적 위험구역·API 실측 상태 테스트                                    |
| Phase 6 | 전국 등록 지하차도 969건과 경로 위험 반영                                              | 지하차도 거리·강우 임계값·데이터 동기화 테스트                                   |
| Phase 7 | 이동약자 큰 글씨·고대비, TMAP 계단 회피와 45m/분 ETA, 지역 중립 fallback, 문서·CI 마무리 | 360px 레이아웃·axe 접근성·비서울 전 화면 리허설, 전체 테스트·타입·린트·빌드       |

## 최종 로컬 검증 명령

```powershell
pnpm install --frozen-lockfile
pnpm exec vitest run --reporter=dot
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
```

화면 리허설은 부산 좌표를 저장한 뒤 시민·운영 라우트를 순회해 특정 서울 시연 지명이 섞이지
않는지, 가로 스크롤과 브라우저 예외가 없는지 확인한다. 이동약자 화면은 360px에서 on/off 상태를
비교하고 axe-core 위반이 없는지 함께 확인한다.

## 원격 Supabase 적용 결과

- 프로젝트 `qlaeegqbopzwqdcbjbxc`에 DB migration 9개를 적용하고 버전 기록을 정리했다.
- Data API 권한을 최소화하고 RLS를 유지했으며, `touch_updated_at`의 `search_path`를 고정했다.
- `weather`, `naver-directions`, `tmap-pedestrian`, `weather-warning`, `disaster-messages`,
  `gemini-chat`, `gemini-notice`, `sensors`, `safemap-feature-info`, `traffic-events`,
  `push-subscribe`, `push-notify`, `risk-monitor`, `naver-local-search`를
  ACTIVE 상태로 배포했다.
- Web Push VAPID 설정을 Edge secret으로 등록했고,
  `risk_monitor_cron_secret`은 Vault에 저장해 `risk-monitor` 전용 인증에 사용한다.
- 변경된 `weather`와 `risk-monitor`를 각각 버전 5와 6으로 재배포했으며 두 함수 모두
  `verify_jwt=false`, ACTIVE 상태를 확인했다.
- 이전 `cctv-info` 원격 함수를 삭제했고 `cctv-analyze`도 원격에 존재하지 않음을 확인했다.
- 실제 브라우저에서 `weather` 호출 200 응답과 6개 시간대 위험 전망 렌더링을 확인했다.
- 지하차도 경로 판정은 번들된 `src/data/underpasses.generated.ts`를 사용하므로 현재 화면은
  동작한다. 선택적인 `public.underpasses` 원격 테이블 적재는 별도 동기화 작업으로 남겨 두었다.

## 별도 권한이 필요한 검증

- 이후 migration·Edge Function·secret 변경은 해당 프로젝트 owner/admin 권한과 DB 비밀번호가
  있는 환경에서 `pnpm run supabase:deploy`로 수행한다.
- `RISK_MONITOR_CRON_SECRET`과 Vault의 `risk_monitor_cron_secret`에는 동일한 값을 별도로
  등록해야 실제 5분 알림 작업이 인증된다.
