// chart_layout.js
import { store } from './_store.js';

// 🚀 [추가] 차트 패널 (볼륨, 김프) 토글 관리자
export function togglePane(paneName) {
  store.paneConfig[paneName] = !store.paneConfig[paneName];
  applyChartLayout();
}

let isDraggingResizer = null;

export function applyChartLayout() {
  if (!store.chart || !store.candleSeries) return;

  const v = store.paneConfig.volume;
  const k = store.paneConfig.kimchi;

  const paneMain = document.getElementById("pane-main");
  const paneVol = document.getElementById("pane-vol");
  const rVol = document.getElementById("resizer-vol");

  // 1. 시리즈 & 스케일 표시/숨김 설정 (김프가 볼륨 캔버스 안에 기생)
  if (store.volumeSeries) {
    store.volumeSeries.applyOptions({ visible: v });
    store.chartVol.priceScale("right").applyOptions({ visible: v });
  }
  
  // 🚀 [정렬 수정] 김프 데이터가 없더라도 좌측 스케일을 유지하여 상하 차트의 레이아웃 어긋남을 방지합니다.
  if (store.kimchiSeries) {
    store.kimchiSeries.applyOptions({ visible: !!k });
    // 항상 visible: true를 유지하되, k가 없을 때는 라벨만 숨기는 방식 등으로 정렬 유지
    store.chartVol.priceScale("left").applyOptions({ 
      visible: true, 
      minimumWidth: 60,
      borderColor: k ? "" : "transparent" // 데이터 없을 땐 투명 테두리
    });
    
    // 메인 차트도 동일한 너비로 맞춰서 완벽한 수직 정렬 구현
    store.chart.priceScale("left").applyOptions({
      visible: true,
      minimumWidth: 60,
    });
  }

  // 2. 패널 표시/숨김 및 플렉스 비율
  let mainFlex = 1, subFlex = 0;

  if (v || k) {
    if (paneVol) paneVol.style.display = "block";
    if (rVol) rVol.style.display = "block";
    mainFlex = store.chartSplits.s1 || 0.75;
    subFlex = 1 - mainFlex;
  } else {
    if (paneVol) paneVol.style.display = "none";
    if (rVol) rVol.style.display = "none";
    mainFlex = 1;
    subFlex = 0;
  }

  if (paneMain) paneMain.style.flex = `${mainFlex}`;
  if (paneVol) paneVol.style.flex = `${subFlex}`;

  // 🚀 X축(시간) 스케일 중복 방지
  if (store.chart) store.chart.timeScale().applyOptions({ visible: !v && !k });
  if (store.chartVol) store.chartVol.timeScale().applyOptions({ visible: v || k });

  if (store.chart && paneMain) store.chart.resize(paneMain.clientWidth, paneMain.clientHeight);
  if (store.chartVol && paneVol) store.chartVol.resize(paneVol.clientWidth, paneVol.clientHeight);

  // 🚀 김프 비교군 스위처 위치 연동
  const kimchiSwitcher = document.getElementById("kimchi-switcher");
  if (kimchiSwitcher) {
    if (k) {
      kimchiSwitcher.style.display = "flex";
      kimchiSwitcher.style.top = "auto";
      kimchiSwitcher.style.bottom = `calc(${subFlex * 100}% - 30px)`;
    } else {
      kimchiSwitcher.style.display = "none";
    }
  }
};


// 🚀 2. 드래그 엔진 초기화
export function initResizers() {
  const wrapper = document.getElementById("chart-wrapper");
  const rVol = document.getElementById("resizer-vol");

  const startDrag = (e) => {
    isDraggingResizer = true;
    document.body.style.cursor = "row-resize";
  };

  if (rVol) rVol.addEventListener("mousedown", startDrag);

  window.addEventListener("mousemove", (e) => {
    if (!isDraggingResizer) return;
    const rect = wrapper.getBoundingClientRect();
    let pct = (e.clientY - rect.top) / rect.height;

    if (pct < 0.2) pct = 0.2;
    if (pct > 0.9) pct = 0.9;
    store.chartSplits.s1 = pct;
    if (typeof window.applyChartLayout === "function") window.applyChartLayout();
  });

  window.addEventListener("mouseup", () => {
    if (isDraggingResizer) {
      isDraggingResizer = false;
      document.body.style.cursor = "default";
    }
  });
}

window.togglePane = togglePane;
window.applyChartLayout = applyChartLayout;
window.initResizers = initResizers;
