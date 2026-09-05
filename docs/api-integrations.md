# API 연동 현황

## 행정안전부 이재민 임시주거시설

- 로컬 파일: `api가이드파일/행정안전부_이재민임시주거시설정보_20250901.csv`
- 데이터 성격: 시도별 임시주거시설 집계. 컬럼은 `지역`, `시설구분`, `개소`, `면적(제곱미터)`, `수용능력`이다.
- 생성 명령: `pnpm run shelters:sync` 또는 `pnpm run shelters:summary`
- 생성 결과: `public/data/temporary-housing-regions.json`
- 앱 조회 위치: `src/lib/shelters/shelterApi.ts`

### 적용 원칙

침수 대피 추천에서는 민방위대피시설을 목적지 데이터로 사용하지 않는다. 민방위대피시설은 지하 시설 비중이 높아 침수 상황에서 직접 추천하면 위험하다.

현재 CSV는 시설별 주소, 위도, 경도가 없다. 따라서 `shelter_operations`에 직접 적재하지 않는다. 이 파일은 지역별 수용능력 근거와 서비스 설명 자료로만 사용한다.

위치 기반 대피소 추천을 운영하려면 `행정안전부_이재민 임시주거시설 정보 조회 서비스`처럼 시설별 주소와 좌표를 제공하는 상세 API 또는 지자체별 시설 현황 파일이 추가로 필요하다.

### CSV 매핑

| 원본 필드        | 내부 요약 필드     |
| ---------------- | ------------------ |
| `순번`           | `sequence`         |
| `자료시점`       | `dataDate`         |
| `지역`           | `region`           |
| `시설구분`       | `facilityType`     |
| `개소`           | `facilityCount`    |
| `면적(제곱미터)` | `areaSquareMeters` |
| `수용능력`       | `capacity`         |

### 침수 추천 필터

`src/lib/shelters/shelterApi.ts`는 침수 추천 후보에서 `민방위` 유형, `EXCLUDED` 상태, 지하 시설을 제외한다. DB에 현재 위치 기준 후보가 없거나 조회가 실패하면 브라우저에서 `public/data/shelters.json`의 좌표 보유 대피시설을 현재 위치 기준 거리순으로 필터링해 fallback으로 사용한다. 5km 안의 후보를 우선 사용하되, 5km 안 후보가 없으면 화면이 비지 않도록 가장 가까운 후보를 거리순으로 표시한다. 이 fallback도 지하·제외 후보는 표시하지 않는다. 서울 강남 demo 데이터 fallback은 demo 기준점 근처에서만 허용해, 지방 현재 위치에서 서울 대피소가 추천되는 상태를 방지한다.

## TMAP 보행자 경로

- API: `POST https://apis.openapi.sk.com/tmap/routes/pedestrian`
- Edge Function: `supabase/functions/tmap-pedestrian`
- 공통 요청 모듈: `supabase/functions/_shared/tmapPedestrian.ts`
- 프론트 호출: `src/lib/api/naverDirections.ts`, `src/hooks/useRoutes.ts`

일반 보행 경로는 `searchOption=0`을 사용한다. 이동약자 모드에서는 클라이언트가
`avoidStairs: true`를 보내고 Edge Function이 TMAP 공식 옵션인 `searchOption=30`(계단 제외
최단 경로)을 사용한다. 옵션 30 요청이 실패하면 일반 옵션 0으로 한 번 재시도해 경로 자체는
유지하되, 경로 근거에 `계단 정보 없음`을 표시한다.

TMAP이 반환한 `totalTime`은 일반 모드에서 그대로 사용한다. 이동약자 모드의 도보 예상시간은
경로 거리와 `45m/분`을 기준으로 다시 계산하며, upstream 예상시간보다 짧아지지 않게 한다.

- 공식 문서: <https://tmap-skopenapi.readme.io/reference/%EB%B3%B4%ED%96%89%EC%9E%90-%EA%B2%BD%EB%A1%9C%EC%95%88%EB%82%B4>

## 국토교통부 ITS 돌발상황정보

- 데이터명: `ITS 돌발상황정보`
- API path: `/eventInfo`
- 기본 호출 URL: `https://openapi.its.go.kr:9443/eventInfo`
- Edge Function: `supabase/functions/traffic-events`
- 프론트 훅: `src/hooks/useTrafficEvents.ts`
- 지도 표시 위치: `src/components/map/NaverMap.tsx`
- 경로 반영 위치: `src/lib/risk/routeRanking.ts`

### Upstream timeout handling

`traffic-events`는 ITS `eventInfo`를 선택적인 경로 위험 근거로 취급한다. Supabase Edge Runtime에서 `https://openapi.its.go.kr:9443/eventInfo`를 15초 안에 호출하지 못하거나 upstream 5xx 오류가 발생하면 1회 재시도한다. 재시도 후에도 실패하면 함수는 HTTP 500 대신 다음 HTTP 200 응답을 반환한다.

```json
{
  "events": [],
  "source": "ITS eventInfo",
  "status": "PENDING_ACCESS",
  "message": "ITS eventInfo request timed out"
}
```

이 동작은 선택 데이터 수집 실패가 Supabase `EDGE_FUNCTION_ERROR` 로그나 대피소/경로 추천 차단으로 이어지지 않게 하기 위한 것이다.

### 인증과 설정

서버 전용 환경변수:

```text
ITS_API_KEY=
```

Runtime behavior:

- `traffic-events` reads the upstream ITS `apiKey` only from the Supabase Edge Function secret `ITS_API_KEY`.
- The browser never receives or sends the ITS key.
- There is no source-code fallback API key. If `ITS_API_KEY` is missing or blank, the function returns HTTP 200 with `status: "PENDING_ACCESS"` and `message: "ITS_API_KEY is not configured"`.
- The frontend maps `status: "PENDING_ACCESS"` to `FALLBACK` and keeps the last successful traffic events on the map instead of treating the response as an empty OK result.

돌발상황정보와 CCTV 화상자료가 같은 ITS 인증키로 승인된 경우 `ITS_API_KEY`와 `ITS_CCTV_API_KEY`에 같은 값을 등록한다. `ITS_API_KEY`가 없으면 Edge Function은 `PENDING_ACCESS`와 빈 이벤트 목록을 반환한다. 경로 API와 대피소 추천은 중단하지 않는다.

### 요청 매핑

| API 필드                       | 현재 매핑                              |
| ------------------------------ | -------------------------------------- |
| `apiKey`                       | `ITS_API_KEY`                          |
| `type`                         | `all`                                  |
| `eventType`                    | `all`                                  |
| `minX`, `maxX`, `minY`, `maxY` | 사용자 위치 기준 반경 5km bounding box |
| `getType`                      | `json`                                 |

### 응답 매핑

ITS 성공 응답의 `resultCode`는 환경에 따라 숫자 `0`, 문자열 `0`, 문자열 `00`으로 올 수 있으므로 모두 성공으로 처리한다.

| 원본 필드         | 내부 필드         |
| ----------------- | ----------------- |
| `type`            | `type`            |
| `eventType`       | `eventType`       |
| `eventDetailType` | `eventDetailType` |
| `coordX`          | `position.lng`    |
| `coordY`          | `position.lat`    |
| `linkId`          | `linkId`          |
| `roadName`        | `roadName`        |
| `roadNo`          | `roadNo`          |
| `roadDrcType`     | `roadDirection`   |
| `lanesBlockType`  | `lanesBlockType`  |
| `lanesBlocked`    | `lanesBlocked`    |
| `message`         | `message`         |
| `startDate`       | `startedAt`       |
| `endDate`         | `endedAt`         |

### 화면 표시와 경로 반영

홈 지도와 `/routes` 지도는 `trafficEvents`를 전달받아 사고, 공사, 기상, 재난, 기타 돌발 마커를 표시한다. 마커 클릭 시 하단 상세 패널은 심각도, 이벤트 유형, 도로명과 거리, 원문 메시지, 차단 유형, 차단 차로, 발생/종료 시각, 출처를 구역별로 분리해 보여준다.

경로 polyline에서 120m 이내에 `침수`, `통제`, `차단`, `재난`, `호우`, `홍수`, `수위`, `유실` 키워드를 포함한 이벤트가 있으면 해당 경로를 `REJECTED`로 처리한다. 같은 반경 안의 일반 `사고`, `공사`, `기상`, `돌발`, `정체`, `서행` 이벤트는 경로를 제외하지 않고 안전점수만 감점한다.

## 국토교통부 전국 지하차도

- 데이터명: `국토교통부 전국도로터널정보표준데이터`
- 공식 표준데이터: <https://www.data.go.kr/data/15025445/standard.do>
- 원본 파일 페이지: <https://www.data.go.kr/data/15081955/fileData.do>
- 기준일자: `2025-12-31`
- 원본 검증 결과: 도로터널 3,840건 중 `터널종류=지하차도` 969건
- 앱 데이터: `src/data/underpasses.generated.ts`
- 공개 원본 정규화본: `public/data/underpasses.json`
- DB 테이블: `public.underpasses`

표준데이터는 자동차 통행을 목적으로 설치된 도로 터널을 대상으로 하며, 지하차도의 시작점과
종료점 WGS84 위·경도를 제공한다. 동기화 시 두 좌표가 모두 유효한 `지하차도` 행만 남기고,
경로 판정점은 시작·종료점의 중점으로 계산한다. 현재 원본의 지하차도 969건은 모두 두 좌표가
있었고 국내 위·경도 범위를 벗어난 행은 없었다.

### 동기화와 적재

기본 명령은 공공데이터포털의 현재 CSV를 내려받아 정적 파일 두 개를 갱신한다. 재현 가능한
로컬 원본이 있으면 경로나 URL을 첫 번째 인자로 전달한다.

```powershell
pnpm run underpasses:sync
node scripts/sync-underpasses.js "tmp/national-road-tunnels.csv"
```

`SUPABASE_URL`(또는 `VITE_SUPABASE_URL`)과 `SUPABASE_SERVICE_ROLE_KEY`가 모두 설정된 환경에서는
정적 파일 생성 뒤 `public.underpasses`에도 400건 단위로 upsert한다. 둘 다 없으면 원격 적재만
건너뛰며, 하나만 있으면 잘못된 배포를 막기 위해 실패한다. 좌표가 없거나 시설 종류가 다른 행은
DB와 앱 데이터 모두에서 제외한다.

### 위험 판정과 커버리지

- 경로 polyline과 지하차도 중점의 최단거리가 50m 이하면 차량 경로가 지하차도를 통과한다고 본다.
- 현재 위치 500m 안에 등록 지하차도가 있으면 위험도 입력 `hasUnderpass`를 `true`로 전달해 5점을 반영한다.
- 시간당 강우 30mm 이상 또는 침수 관련 경보(`CRITICAL`)면 해당 차량 경로를 제외한다.
- 시간당 강우 15mm 이상 또는 주의보(`WARNING`)면 30점, 그 외에는 10점을 감점한다.
- 도보 경로에는 지하차도 차량 규칙을 적용하지 않는다.
- 모든 차량 후보가 지하차도 때문에 제외될 때는 안전점수가 가장 높은 1개를 경고와 함께 남긴다.
  ITS 통제나 `CRITICAL` 위험구역으로 제외된 경로는 이 예외로 되살리지 않는다.

화면의 커버리지는 “전국 등록 지하차도”로 표기한다. 이는 전국의 모든 구조물을 완전 수록한다는
뜻이 아니라 국토교통부 현황정보시스템에 등록된 시설 범위다. 국내 범위 밖 위치에서는
`hasUnderpass: false`로 처리하고 경로 화면에 데이터 범위 밖임을 명시한다.

## 행정안전부 긴급재난문자

- 데이터명: `행정안전부_긴급재난문자`
- API path: `/V2/api/DSSP-IF-00247`
- 기본 호출 URL: `https://www.safetydata.go.kr/V2/api/DSSP-IF-00247`
- Edge Function: `supabase/functions/disaster-messages`
- 프론트 훅: `src/hooks/useDisasterMessages.ts`

### 인증과 설정

서버 전용 환경변수:

```text
DISASTER_MSG_SERVICE_KEY=
DISASTER_MSG_API_URL=
```

`DISASTER_MSG_API_URL`은 공유플랫폼 이용가이드의 base URL이 변경되거나 기관별 전용 게이트웨이가 제공될 때만 설정한다. 미설정 시 기본값은 `https://www.safetydata.go.kr/V2/api/DSSP-IF-00247`이다.

### 요청 매핑

| API 필드     | 현재 매핑                     |
| ------------ | ----------------------------- |
| `serviceKey` | `DISASTER_MSG_SERVICE_KEY`    |
| `numOfRows`  | 기본 `20`                     |
| `pageNo`     | 기본 `1`                      |
| `returnType` | `json` 고정                   |
| `crtDt`      | `YYYYMMDD`, 기본 오늘 날짜    |
| `rgnNm`      | 선택 위치의 역지오코딩 지역명 |

### 응답 매핑

| 원본 필드      | 내부 필드        |
| -------------- | ---------------- |
| `SN`           | `id`             |
| `CRT_DT`       | `issuedAt`       |
| `MSG_CN`       | `body`           |
| `RCPTN_RGN_NM` | `region`         |
| `EMRG_STEP_NM` | `emergencyLevel` |
| `DST_SE_NM`    | `disasterType`   |
| `REG_YMD`      | `registeredDate` |
| `MDFCN_YMD`    | `modifiedDate`   |

선택 위치의 지역명이 비어 있으면 API를 호출하지 않는다. 호출 실패, 파싱 실패, 서비스키 누락 시
앱은 `status: "FALLBACK"`과 **빈 목록**을 반환한다. 다른 지역의 과거 재난문자를 demo 데이터로
대체하지 않는다.

## PWA·Web Push 위험 알림

Vite PWA 서비스워커는 앱 셸과 정적 JSON을 캐시하고, 새 버전은 사용자가 갱신 배너를 누를 때만
적용한다. React Query에서 허용한 대피소·위험도 데이터만 최대 24시간 보관하며, 만료된 재난
정보는 오프라인 화면에 다시 표시하지 않는다.

알림 권한은 사용자가 동의 카드의 버튼을 누른 뒤에만 요청한다. 브라우저 구독은
`push-subscribe`가 `push_subscriptions`에 저장하고, 좌표는 DB 트리거에서 소수점 셋째 자리로
반올림한다. 백그라운드 위치 추적은 사용하지 않는다. `push-notify`는 표준 VAPID Web Push로
발송하며 만료된 구독은 제거하고 실패 횟수를 기록한다.

`risk-monitor`는 pg_cron이 5분마다 호출한다. 구독 좌표를 0.01도 격자로 묶어 기상·센서 위험을
계산하고, 각 사용자의 `WATCH`·`WARNING`·`CRITICAL` 임계값 이상일 때만 발송한다. 등급 상승은
즉시 알리고 같은 등급은 1시간 쿨다운 뒤에만 다시 알리며, 두 데이터 소스가 모두 실패한
`UNKNOWN` 상태에서는 발송하지 않는다.

### Web Push 환경변수와 cron 인증

| 구분   | 환경변수                   | 용도                            |
| ------ | -------------------------- | ------------------------------- |
| 프론트 | `VITE_VAPID_PUBLIC_KEY`    | 브라우저 Push 구독 생성         |
| Edge   | `VAPID_PUBLIC_KEY`         | Web Push 공개키                 |
| Edge   | `VAPID_PRIVATE_KEY`        | Web Push 개인키                 |
| Edge   | `VAPID_SUBJECT`            | `mailto:` 형식 운영 연락처      |
| Edge   | `RISK_MONITOR_CRON_SECRET` | `risk-monitor` 전용 Bearer 인증 |

`RISK_MONITOR_CRON_SECRET`은 충분히 긴 무작위 값을 생성해 `.env`와 Supabase Edge secret에
같은 값으로 등록한다. 이어서 Supabase Dashboard SQL Editor에서 같은 값을 Vault의
`risk_monitor_cron_secret` 이름으로 한 번 저장한다. 실제 값은 코드·문서·커밋에 남기지 않는다.

```sql
select vault.create_secret(
  '여기에 .env의 RISK_MONITOR_CRON_SECRET 값',
  'risk_monitor_cron_secret'
);
```

마이그레이션의 `public.invoke_risk_monitor()`는 Vault에서 이 값만 읽어 Authorization 헤더를
만들며 `public`, `anon`, `authenticated` 역할에는 실행 권한을 주지 않는다.

## SafeMap 침수흔적도 WMS

- 데이터명: 침수흔적도
- WMS URL: `https://www.safemap.go.kr/openapi2/IF_0092_WMS`
- 레이어명: `A2SM_FLUDMARKS`
- 범례 URL: `https://www.safemap.go.kr/openapi2/lgdInfo?serviceKey=...&intId=IF_0092`
- 프론트 설정: `VITE_SAFEMAP_SERVICE_KEY`
- 서버 설정: `SAFEMAP_SERVICE_KEY`

### 요청 매핑

| API 필드      | 현재 매핑                  |
| ------------- | -------------------------- |
| `serviceKey`  | `VITE_SAFEMAP_SERVICE_KEY` |
| `service`     | `WMS`                      |
| `request`     | `GetMap`                   |
| `version`     | `1.1.1`                    |
| `layers`      | `A2SM_FLUDMARKS`           |
| `styles`      | 빈 문자열                  |
| `srs`         | `EPSG:4326`                |
| `bbox`        | 현재 네이버 지도 bounds    |
| `format`      | `image/png`                |
| `width`       | 지도 컨테이너 px 너비      |
| `height`      | 지도 컨테이너 px 높이      |
| `transparent` | `TRUE`                     |

네이버 지도에서는 SafeMap WMS 이미지를 `GroundOverlay`로 올린다. OpenLayers 예제와 달리 WMS 표준 파라미터를 라이브러리가 자동으로 붙여주지 않으므로 URL 생성 단계에서 `service=WMS`, `request=GetMap`, `version=1.1.1`을 명시한다.

## SafeMap 하천범람지도(국가하천) WMS

- 데이터명: 하천범람지도(국가하천)
- WMS URL: `https://www.safemap.go.kr/openapi2/IF_0089_WMS`
- 레이어명: `A2SM_FLOODFOVRRISK1`
- 범례 URL: `https://www.safemap.go.kr/openapi2/lgdInfo?serviceKey=...&intId=IF_0089`
- 프론트 설정: `VITE_SAFEMAP_SERVICE_KEY`
- 서버 설정: `SAFEMAP_SERVICE_KEY`

### 요청 매핑

| API 필드      | 현재 매핑                  |
| ------------- | -------------------------- |
| `serviceKey`  | `VITE_SAFEMAP_SERVICE_KEY` |
| `service`     | `WMS`                      |
| `request`     | `GetMap`                   |
| `version`     | `1.1.1`                    |
| `layers`      | `A2SM_FLOODFOVRRISK1`      |
| `styles`      | 빈 문자열                  |
| `srs`         | `EPSG:4326`                |
| `bbox`        | 현재 네이버 지도 bounds    |
| `format`      | `image/png`                |
| `width`       | 지도 컨테이너 px 너비      |
| `height`      | 지도 컨테이너 px 높이      |
| `transparent` | `TRUE`                     |

침수흔적도와 동일한 SafeMap 서비스키를 사용한다. 현재 홈 지도에서는 침수흔적도와 하천범람지도 이미지를 순서대로 `GroundOverlay`에 올린다.

## Gemini / Vertex AI

현재 Edge Function은 `VERTEX_AI_PROJECT_ID`가 설정되어 있으면 Vertex AI Gemini를 우선 사용하고, 없으면 기존 AI Studio Gemini API 키 방식으로 fallback한다.

`gemini-chat`은 시민 홈 화면의 행동 추천 설명, `/routes` 경로 카드별 추천·대안·제외 사유 설명, `/help` 빠른 질문 답변에 사용한다. 홈 화면의 Gemini 입력은 `/routes`와 같은 TMAP/Naver 경로 분석 결과에서 나온 실제 route id, mode, status, safety score, `riskReasons`, shelter id를 사용하며 mock route generator를 사용하지 않는다. Gemini 출력은 설명 텍스트로만 사용하며 위험도, 경로 순위, 대피소 선택은 서버/클라이언트의 기존 계산값을 기준으로 한다.

`gemini-notice`는 운영 화면의 주민 안내문 초안 생성에 사용한다.

클라이언트는 `gemini-chat` 응답을 최대 25초까지 기다린다. 배포 환경에서 Vertex AI 경로가 약 18초 걸린 사례가 있어, 15초 이하 timeout은 정상 응답 전에 rule-based fallback을 유발할 수 있다.

### Vertex AI 설정

| 환경변수                      | 설명                                                    |
| ----------------------------- | ------------------------------------------------------- |
| `VERTEX_AI_PROJECT_ID`        | Vertex AI를 사용할 Google Cloud 프로젝트 ID             |
| `VERTEX_AI_LOCATION`          | 기본 `us-central1`                                      |
| `VERTEX_AI_MODEL`             | 기본 `gemini-2.5-flash`                                 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Vertex AI 호출 권한이 있는 서비스 계정 JSON 전체 문자열 |
| `CCTV_ANALYSIS_DAILY_LIMIT`   | CCTV 멀티모달 판독의 일일 호출 상한, 기본 `100`         |

로컬 검증에서는 gcloud OAuth 토큰으로 `gen-lang-client-0563653718`, `us-central1`, `gemini-2.5-flash` 조합의 `generateContent` 호출이 성공했다. Supabase Edge Function 배포 환경에서는 gcloud가 없으므로 서비스 계정 JSON을 secret으로 등록해야 한다.

### CCTV 멀티모달 판독 비용

`cctv-analyze`는 담당자가 카메라별로 명시적으로 요청할 때 브라우저에서 JPEG 프레임 한 장을
캡처해 `gemini-2.5-flash`에 보낸다. 성공 결과는 카메라별 10분 캐시를 사용하며 신뢰도 0.7
미만은 저장하거나 위험도에 반영하지 않는다. 요청은 25초에 중단되고, 분류 작업의 비용 편차를
막기 위해 `thinkingBudget: 0`, `maxOutputTokens: 256`을 적용한다.

2026-09-03 공식 요금 기준 표준 호출 단가는 입력 US$0.30/백만 토큰, 출력 US$2.50/백만
토큰이다. 최대 캡처 크기 1280×720은 공식 이미지 타일 계산식으로 약 6타일 × 258 = 1,548
토큰이다. 시스템 지시문·스키마까지 포함한 입력을 보수적으로 2,500토큰, 출력을 최대 256토큰으로
계산하면 캐시 미적중 100회의 예상 모델 비용은 다음과 같다.

```text
100 × ((2,500 × $0.30 / 1,000,000) + (256 × $2.50 / 1,000,000))
= 약 US$0.139
```

따라서 기본 일일 상한 100회의 예상 모델 비용은 약 **US$0.14/일**이다. 실제 청구액은 프레임
해상도와 응답 토큰에 따라 낮아질 수 있으며 DB 저장·네트워크 비용은 이 계산에 포함하지 않았다.

- 요금: <https://cloud.google.com/vertex-ai/generative-ai/pricing>
- 이미지 토큰 계산: <https://ai.google.dev/gemini-api/docs/image-understanding>
- Gemini 2.5 Flash 추론 예산: <https://ai.google.dev/gemini-api/docs/thinking>

### Supabase CLI 업로드

프로젝트에는 로컬 Supabase CLI와 전체 업로드 스크립트를 둔다.

```powershell
pnpm supabase --version
pnpm supabase login
pnpm run supabase:deploy
```

`pnpm run supabase:deploy`는 Supabase project ref `qlaeegqbopzwqdcbjbxc`에 대해 DB migration push, Edge Function 배포, Edge Function secret 등록을 순서대로 실행한다.

배포 대상 Edge Functions:

- `naver-directions`
- `tmap-pedestrian`
- `weather`
- `disaster-messages`
- `gemini-chat`
- `gemini-notice`
- `sensors`
- `safemap-feature-info`
- `traffic-events`
- `cctv-info`
- `cctv-analyze`
- `weather-warning`
- `push-subscribe`
- `push-notify`
- `risk-monitor`

secret만 다시 등록할 때는 아래 명령을 사용한다.

```powershell
pnpm run supabase:secrets
```

등록되는 필수 secret은 `NAVER_DIRECTIONS_CLIENT_ID`, `NAVER_DIRECTIONS_CLIENT_SECRET`,
`TMAP_APP_KEY`, `KMA_SERVICE_KEY`, `KMA_WARNING_SERVICE_KEY`, `HRFCO_SERVICE_KEY`,
`DISASTER_MSG_SERVICE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
`RISK_MONITOR_CRON_SECRET`, `CCTV_ANALYSIS_DAILY_LIMIT`, `VERTEX_AI_PROJECT_ID`,
`VERTEX_AI_LOCATION`, `VERTEX_AI_MODEL`, `GOOGLE_SERVICE_ACCOUNT_JSON`이다. 선택 secret은
`DISASTER_MSG_API_URL`, `GEMINI_API_KEY`, `SAFEMAP_SERVICE_KEY`, `ITS_API_KEY`,
`ITS_CCTV_API_KEY`, `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET`, `SENSOR_API_KEY`다.
`GOOGLE_SERVICE_ACCOUNT_JSON`은 프로젝트 루트의 `apikey.json`을 우선 사용한다.

현재 CLI 로그인 계정이 해당 프로젝트 owner/admin 권한을 갖지 않으면 Supabase API가 `necessary privileges` 오류를 반환하므로, 프로젝트가 보이는 계정으로 다시 로그인해야 한다. DB push에서 비밀번호를 요구하는 경우에는 PowerShell 세션에 `SUPABASE_DB_PASSWORD`를 설정한 뒤 재실행한다.

### 기존 AI Studio fallback

| 환경변수         | 설명                                               |
| ---------------- | -------------------------------------------------- |
| `GEMINI_API_KEY` | `generativelanguage.googleapis.com` 호출용 API key |

AI Studio Prepay 잔액이 0이면 이 방식은 `429 RESOURCE_EXHAUSTED`로 실패한다.

## 기상청 기상특보

- 데이터명: `기상청_기상특보 조회서비스`
- API명(영문): `WthrWrnInfoService`
- 기본 호출 URL: `https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus`
- Edge Function: `supabase/functions/weather-warning`
- 정규화 모듈: `supabase/functions/_shared/kmaWarning.ts`
- 프론트 훅: `src/hooks/useWeatherWarnings.ts`
- 구역 데이터: `public/data/warning-zones.json` (`node scripts/sync-warning-zones.js`로 생성)

### 도입 배경

이 연동 전까지 `_shared/kma.ts`는 강수 유무로 특보 객체를 **합성**했다. 강수가 있으면 `WATCH`,
시간당 30mm 이상이면 `WARNING` 등급의 "강수 관측" 경보를 만들어 `WeatherPanel`에 특보처럼
표시했다. 기상청이 발령한 적 없는 특보를 사용자에게 보여주는 문제였고, 위험도 계산에서도
강우량에서 유도한 값을 강우 점수와 함께 비교해 순환 참조가 됐다. 실제로 합성 경보의 24점은
강우 30점을 한 번도 넘지 못해 위험도 인자 하나가 사실상 죽어 있었다.

현재 `normalizeKmaWeather`는 항상 `alerts: []`를 반환하고, 특보는 이 연동에서만 가져온다.

### 인증과 설정

서버 전용 환경변수:

```text
KMA_WARNING_SERVICE_KEY=
```

미설정 시 `KMA_SERVICE_KEY`로 fallback한다. 두 서비스 모두 기관코드가 `1360000`이라 같은
인증키로 활용신청했다면 하나만 등록해도 동작한다. 공공데이터포털은 서비스별로 활용신청이
필요하므로 단기예보만 신청한 키로는 특보가 호출되지 않는다.

키가 없으면 함수는 HTTP 500 대신 다음 응답을 반환한다.

```json
{ "warnings": [], "alerts": [], "floodLevel": null, "status": "PENDING_ACCESS" }
```

프론트는 이를 `FALLBACK`으로 표시한다. 특보는 보조 근거이므로 수집 실패가 위험도 계산이나
대피소 추천을 막지 않는다.

### 오퍼레이션 선택 이유

`getWthrWrnList`와 `getWthrWrnMsg`는 지점코드(`stnId`)로 조회한다. 지점코드는 108(전국),
109(서울·인천·경기)처럼 10개뿐이라 시군구 단위 판정에 쓸 수 없다.

`getPwnStatus`는 파라미터 없이 전국 특보 현황을 한 번에 준다. 사용자마다 호출할 필요가 없어
Edge Function이 3분간 캐시하고 지역 필터링만 요청별로 수행한다. 개발계정 일 10,000건
한도에 여유가 크다.

### 응답 파싱

`getPwnStatus`는 구조화된 필드가 아니라 `t6`(특보발효현황 내용)에 자연어 텍스트를 담아준다.

```text
o 호우주의보 : 충청남도(태안, 서산, 보령(도서제외), 홍성서부), 경상북도(안동북부)
o 폭염주의보 : 경상남도, 제주도(제주시서부), 광주, 대구, 부산, 울산
```

파싱 시 주의할 점:

- 광역명 뒤 괄호가 세부 구역 목록이고 그 안에 `보령(도서제외)`처럼 괄호가 한 겹 더 들어간다.
  단순 `split(",")`으로는 끊을 수 없어 괄호 깊이를 세는 `splitTopLevel`을 쓴다.
- `경상남도`, `부산`처럼 괄호 없이 오면 해당 광역 전역 발효를 뜻한다.
- `tmFc`는 환경에 따라 숫자와 문자열로 모두 온다.

### 구역 매칭

| 구분       | 역지오코딩 표기  | 특보 표기    | 처리                    |
| ---------- | ---------------- | ------------ | ----------------------- |
| 광역시     | `부산광역시`     | `부산`       | 광역 접미사 제거        |
| 특별자치도 | `제주특별자치도` | `제주도`     | 서로 포함 관계로 판정   |
| 특별자치도 | `전북특별자치도` | `전북자치도` | 서로 포함 관계로 판정   |
| 시군구     | `태안군`         | `태안`       | 시·군·구 접미사 제거    |
| 서울       | `강남구`         | `서울동남권` | 자치구 → 권역 표로 변환 |

`도`는 접미사로 제거하지 않는다. 특보구역에 `흑산도.홍도`, `보령도서`처럼 행정구역 접미사가
아닌 글자로 끝나는 이름이 있어 마지막 글자를 떼면 섬 이름이 훼손된다.

서울은 자치구가 특보구역이 아니라 4개 권역(동남·동북·서남·서북)이 특보구역이므로
`kmaWarning.ts`의 `SEOUL_DISTRICT_ZONES` 표로 자치구명을 권역명으로 옮긴다.

### 위험도 반영

침수 관련 현상(`호우`, `태풍`, `홍수`, `해일`)만 위험도에 가산한다. 폭염·강풍·열대야 특보는
화면에 표시하되 침수 위험도는 올리지 않는다.

| 등급     | 기상 항목 점수 |
| -------- | -------------- |
| 경보     | 30 (최대)      |
| 주의보   | 22             |
| 예비특보 | 12             |

강우 관측 점수와 비교해 **더 높은 쪽**을 채택한다. 국지성 호우처럼 관측 지점 강우가 아직
낮은데도 경보가 나가는 상황을 잡기 위한 것이다. 특보 발령은 관측 강우량과 독립된 근거이므로
이제 두 값이 순환하지 않는다.

### 특보구역 코드 갱신

기상청이 특보구역을 개정하면 개정본 xlsx를 받아 다시 생성한다.

```bash
node scripts/sync-warning-zones.js "새_특보구역코드안내.xlsx"
```

스크립트는 xlsx(zip+XML)를 Node 내장 `zlib`으로 직접 읽으므로 별도 의존성이 없다.
`Sheet2`의 `REG_ID`/`REG_UP` 계층을 따라 각 구역의 광역 조상을 계산해 저장한다.
광역 판정은 레벨 번호가 아니라 "전국(`L1000000`)의 자식인지"로 한다. 도는 레벨 2,
광역시는 102이고 태안(113)처럼 중간 단계를 건너뛰고 도에 바로 붙는 구역이 있기 때문이다.

## 센서 Edge Function

- Edge Function: `supabase/functions/sensors`
- 클라이언트 호출 위치: `src/lib/sensors/sensorAccess.ts`
- 호출 방식: `supabase.functions.invoke("sensors", { method: "GET" })`
- 배포 대상: `supabase/config.toml`, `scripts/deploy-supabase-all.ps1`
- CORS 허용 메서드: `GET, POST, OPTIONS`

배포된 엔드포인트 `https://qlaeegqbopzwqdcbjbxc.supabase.co/functions/v1/sensors`가 `404 NOT_FOUND`를 반환하면 함수가 배포되지 않은 상태다. `pnpm run supabase:deploy`로 재배포해야 브라우저 preflight가 함수 코드의 CORS 응답까지 도달한다.

## SafeMap GetFeatureInfo 프록시

- Edge Function: `supabase/functions/safemap-feature-info`
- 클라이언트 호출 위치: `src/lib/api/wmsFeatureInfo.ts`
- 호출 방식: `supabase.functions.invoke("safemap-feature-info", { body })`
- 서버 secret: `SAFEMAP_SERVICE_KEY`
- 허용 레이어: `A2SM_FLUDMARKS`, `A2SM_FLOODFOVRRISK1`

SafeMap WMS 이미지는 브라우저에서 표시할 수 있지만 `GetFeatureInfo`를 `fetch()`로 직접 호출하면 SafeMap 응답에 `Access-Control-Allow-Origin`이 없어 CORS로 차단된다. 따라서 겹침 판정용 `GetFeatureInfo`는 Edge Function에서 서버 사이드로 호출한다. SafeMap이 400 또는 비 JSON/XML 오류를 반환하면 앱은 겹침값 `0`으로 fallback한다.
