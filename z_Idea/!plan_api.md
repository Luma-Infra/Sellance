<!-- 오전 11:04 2026-05-13 -->
# api.js 분리 및 리팩토링 계획

현재 `api.js`는 이름과 달리 순수 API 호출 외에도 DOM 조작(검색, 뱃지 업데이트), 차트 데이터 처리 및 조립(fetchHistory) 등 UI와 데이터 로직이 과도하게 섞여 있어 1,000줄이 넘는 비대해진 상태입니다. 역할에 맞게 파일들을 분리하여 유지보수를 용이하게 만들고자 합니다.

## User Review Required
> [!IMPORTANT]
> 아래의 파일 분리 계획을 확인하시고, 괜찮으시다면 승인해주세요. 즉시 작업을 시작하여 안전하게 마이그레이션하겠습니다.

## Proposed Changes

### 1. `static/api.js` (순수 API 역할 유지)
외부 서버에서 데이터를 가져오는 순수 통신 모듈로 축소합니다.
- 유지: `loadSymbols()`
- 유지: `fetchPaginated()`
- 그 외 차트/UI 로직 전부 타 파일로 이관

### 2. `static/chart_data.js` (신규 파일: 차트 데이터 조립기)
`fetchHistory`처럼 데이터를 가져와서 합성(김프 등)하고 Lightweight Charts에 주입하는 가장 무거운 로직을 전담합니다.
- 이동: `fetchHistory()` (api.js에서 이동)
- 이동: `clearChartData()` (api.js에서 이동)
- 이동: `window.switchKimchiSub` (김프 옵션 스위치 기능)

### 3. `static/ui_control.js` (기존 파일 확장: UI 컨트롤)
검색창, 사이드바, 코인 리스트 클릭 등의 사용자 인터페이스 이벤트를 전담합니다.
- 이동: `searchSymbols(v)`
- 이동: `clearSearch()`
- 이동: `selectSymbol(s, forceMarket)`
- 이동: `updateExchangeBadges(s)`

### 4. `static/chart_utils.js` (기존 파일 확장: 유틸리티)
차트나 데이터 처리 시 반복되는 단순 연산/문자열 조작 함수를 담습니다.
- 이동: `getMultiplier(sym)` (1000XEC -> 1000 추출 등)
- 이동: `getPureBase(sym)` (1000XEC -> XEC 추출 등)

### 5. `static/_main.js` 및 기타 의존성 수정
- 파일들이 재배치됨에 따라 `import` 구문들을 새 구조에 맞게 완벽하게 갱신합니다.

## Verification Plan
1. 브라우저에서 차트를 열어 코인 검색 및 클릭(`selectSymbol`)이 정상 작동하는지 확인
2. 타임프레임 전환 시 김프 차트 및 메인 차트(`fetchHistory`)가 정상 합성/렌더링 되는지 확인
3. 브라우저 콘솔 창에 `Import` 관련 에러가 발생하지 않는지 확인
