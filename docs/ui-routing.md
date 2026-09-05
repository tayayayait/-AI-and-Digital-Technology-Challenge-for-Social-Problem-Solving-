# UI Routing Notes

## Citizen App Shell

- Citizen pages run inside a fixed-height `100dvh` shell.
- The fixed bottom navigation reserves `64px + env(safe-area-inset-bottom)`.
- Page content scrolls inside the shell, not behind the bottom navigation.
- Ops pages keep the existing full-page layout and do not use the citizen bottom navigation.
- The citizen bottom navigation exposes Home, Shelter, Field, and Help only. It must not include a direct Route tab.
- The header shows the active disaster state as static status text. It does not expose a normal-time scenario selector.
- In citizen pages, clicking the `침수퇴로 AI` logo area resets location selection to `PROMPT` and returns to the home address setup screen.

## Route Mode State

- `/routes` accepts `mode=WALK` or `mode=DRIVE` as search state.
- `/routes` requires `locationStatus=GRANTED`. If a location has not been selected on Home, the screen redirects to Home instead of rendering route comparison content.
- The expected in-app entry points for `/routes` are the Home action card's route preview and vehicle route buttons.
- The route mode segmented control must update the search parameter, not only local component state.
- The route mode segmented control must show the requested search mode as selected, even if route content falls back to another available mode.
- The visible route mode can still fall back to the available API result when the requested mode has no route data.
- If every candidate for the visible mode is `REJECTED`, the screen must show an explicit `안전 경로 없음` advisory before listing excluded candidates.
- Each visible route card shows an `AI 경로 설명` block. It uses the existing Gemini chat path to explain why the route is recommended, alternative, or rejected, while route status and safety score remain computed by the route-ranking logic.
- If Gemini is delayed or unavailable, route cards keep a rule-based explanation using the route status, safety score, shelter, and `riskReasons`.

## Address Fallback

- The address form submit button is labeled `주소 검색` because submit returns candidate locations first.
- Route recalculation completes only after the user selects one returned address candidate.
- 입력 예시는 특정 지역을 전제로 하지 않는 `시청, 중앙대로 100`을 사용한다.
- 역지오코딩 실패 시 다른 도시의 주소를 대신 표시하지 않고 `선택 위치 위도, 경도` 형식으로 표시한다.

## Map Interaction

- The `/routes` map must display only the shelter targeted by the currently displayed recommended route, not the full nearby shelter list.
- Shelter markers are interactive controls. Selecting a marker must open a visible shelter detail panel with name, address, distance, status, and capacity.
- Naver Maps HTML marker buttons use `data-shelter-id` so direct DOM clicks and SDK marker events both select the same shelter.
- Closing a shelter detail panel must hide that panel without changing the active shelter selection, and it must not reopen solely because shelter or route data refreshes with the same selected shelter id.
- ITS 돌발상황 마커는 `data-traffic-event-id`를 사용한다. 직접 DOM 클릭과 SDK marker event 모두 같은 돌발상황 상세 패널을 열어야 한다.
- The home screen must let citizens reselect the active evacuation facility. A marker click or the home shelter selector changes the recommended shelter and recalculates the displayed route target.
- The home map exposes a `내 위치` control that requests the device location again, updates the current origin when available, and does not directly change the selected evacuation facility.
- The home and `/routes` maps must show nearby ITS traffic events when available. Blocking flood/control events near a route affect route rejection; non-blocking accident/construction/weather events are visible context and route score penalties only.

## Location Permission Prompt

- The initial location permission request is a non-modal prompt, not a full-screen blocking dialog.
- The bottom navigation must remain reachable while the prompt is visible.
- The home screen must not render the map, shelter picker, route recommendation, or SafeMap evidence panels until `locationStatus` is `GRANTED`.
- Initial, denied, and error location states show the manual address fallback. The map appears only after a geocoding candidate is selected or device geolocation succeeds.

## Help Answers

- Rule-based AI fallback answers must be specific to the selected quick question.
- Family-share and official-report questions use dedicated labels and response text instead of reusing generic route-risk reasons.

## 이동약자 모드

- `/help` 설정 카드에서 이동약자 모드를 켜고 끌 수 있으며 선택값은
  `chimsu-accessibility` localStorage에 보존한다.
- 활성화되면 루트 요소에 `data-a11y="large-contrast"`를 적용한다. 본문 글자는 1.25배로
  확대하되 64px 하단 내비게이션의 높이와 아이콘 크기는 유지한다.
- 배경·본문·주요 버튼은 WCAG AA 일반 텍스트 기준 4.5:1 이상의 대비를 사용한다. 지도 마커는
  크기와 테두리를 함께 키우며 긴 텍스트에는 `min-width: 0`과 줄바꿈을 적용한다.
- 도보 경로는 TMAP 계단 제외 옵션을 요청한다. 해당 옵션을 사용할 수 없으면 일반 경로를
  유지하면서 `계단 정보 없음`을 명시한다.
- 도보 도착 예상시간은 일반 67m/분 대신 이동약자 기준 `45m/분`으로 재계산한다. 차량 경로와
  일반 모드의 예상시간은 변경하지 않는다.

## 지역 중립 표시

- 대피소·경로·재난문자·AI 안내는 사용자가 선택한 현재 위치를 기준으로 조회한다.
- 외부 API 실패 시 서울 또는 강남의 demo 데이터로 대체하지 않는다. 재난문자는 빈 목록,
  주소는 선택 좌표, 경로는 현재 위치 기준 오류 안내를 사용한다.
- 전국 현황 화면의 지역 필터처럼 데이터 범위를 나타내는 지명은 유지하지만, 시민 화면의
  추천 문구와 AI 허용 고유명사는 현재 주소와 실제 대피소명에서만 만든다.

## Home AI Guidance

- The home action card may request Gemini guidance only after an evacuation facility and route candidate are available.
- The home action card must use the same `useRoutes` route-analysis path as `/routes`; it must not call `buildRoutes` or any mock route generator.
- Before location permission or manual geocoding is completed, home must keep route loading disabled so TMAP/Naver route APIs are not called for the default origin.
- If the user selects a specific evacuation facility on the home screen, the home route request must target that selected facility only.
- The Gemini input must include route `riskReasons`, risk-score reasons, and SafeMap WMS overlap evidence when present.
- Gemini input must also include the actual route id, route name, route mode, route status, safety score, shelter id, shelter name, and route API timestamp.
- Gemini only explains the recommended action and route rationale. It must not override the computed risk level, shelter selection, route status, safety score, or official-control priority.
