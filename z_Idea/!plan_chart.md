<!-- 오전 11:18 2026-05-13 -->
# chart.js 경량화 및 모듈 분리 계획

현재 `chart.js` 파일은 1,040줄에 달하며, 차트 엔진 초기화뿐만 아니라 패널 레이아웃 조절, 측정 도구, 시뮬레이터 미리보기, UI 버튼 이벤트 등이 혼재되어 있습니다. 역할에 맞게 모듈을 세분화하여 유지보수성을 극대화하겠습니다.
(사용자님의 요청에 따라 기존 `// function initChart()` 주석은 참고용으로 그대로 유지합니다.)

## User Review Required
> [!IMPORTANT]
> 아래의 파일 분리 계획을 확인하시고, 괜찮으시다면 승인(ㄱㄱ)해주세요. 즉시 작업을 시작하여 안전하게 마이그레이션하겠습니다.

## Proposed Changes

### 1. `static/chart.js` (순수 차트 엔진 코어)
차트 생성과 테마 변경이라는 본연의 핵심 기능만 남겨 가장 무거운 코드를 경량화합니다.
- 유지: `initChart()`
- 유지: `updateChartTheme()`
- 유지: 하단 주석 백업본

### 2. `static/chart_layout.js` (신규 파일: 차트 레이아웃)
메인/볼륨/김프 차트 간의 크기 비율 조절 및 리사이저 드래그 이벤트를 전담합니다.
- 이동: `togglePane()`
- 이동: `applyChartLayout()`
- 이동: `initResizers()`
- 이동: `resetPriceScaleWidthSync()` (전역 리셋 함수)

### 3. `static/chart_measure.js` (신규 파일: 측정 도구)
차트 내부에서 Shift+클릭으로 사용하는 자(Measure) 도구 로직을 전담합니다.
- 이동: `setupMeasureTool()`
- 이동: `initMeasureEvents()`
- 이동: `stopMeasuring()`

### 4. `static/sim_engine.js` (기존 파일 확장: 시뮬레이터)
시뮬레이터 로직이 있는 파일에 미리보기 그리기 기능도 통합합니다.
- 이동: `updatePreview()`

### 5. `static/ui_control.js` (기존 파일 확장: UI 컨트롤)
타임프레임 스위치 및 로그 스케일 변경 등 버튼 UI 동작을 처리합니다.
- 이동: `setTF()`, `executeSetTF()`
- 이동: `toggleLogScale()`

### 6. `static/chart_utils.js` (기존 파일 확장: 유틸리티 & 오버레이)
단순한 색상 매핑과 실시간 카운트다운 오버레이 등 보조 도구를 담당합니다.
- 이동: `getKimchiColor()`
- 이동: `toggleCountdown()`, `updateRealtimeCountdown()`

## Verification Plan
1. 차트 레이아웃 쪼개기(드래그) 및 패널 숨기기가 정상 작동하는지 확인
2. Shift+드래그(측정 도구) 기능 정상 작동 확인
3. 타임프레임 버튼 및 카운트다운 시계 오버레이 정상 렌더링 확인
4. 에러 콘솔 체크 및 import/export 맵핑 오류 점검
