// chart.js
import { store, tfSec, measureDOM } from "./store.js";
import { fetchHistory } from "./api.js";

// 🚀 김프 다채로운 색상 적용 엔진
window.getKimchiColor = function (val) {
  if (val < -4) return "#4B0082"; // 인디고
  if (val < -2) return "#1E3A8A"; // 딥 블루
  if (val < 0) return "#2E8B57"; // 씨그린
  if (val < 2) return "#57a4fc"; // 하늘색
  if (val < 4) return "#FF69B4"; // 핫핑크
  if (val < 6) return "#B22222"; // 파이어브릭
  if (val < 8) return "#FF4500"; // 오렌지레드
  return "#8B0000"; // 다크레드
};

// 🚀 [추가] 차트 패널 (볼륨, 김프) 토글 관리자
function togglePane(paneName) {
  store.paneConfig[paneName] = !store.paneConfig[paneName];
  applyChartLayout();
}

let isDraggingResizer = null;

// 🚀 1. 마진 레이아웃 & 선 위치 업데이트
function applyChartLayout() {
  if (!store.chart || !store.candleSeries) return;

  const v = store.paneConfig.volume;
  const k = store.paneConfig.kimchi;

  const rVol = document.getElementById("resizer-vol");
  const rKim = document.getElementById("resizer-kimchi");

  // 🚀 [하드코딩 제거] 레이아웃 조절용 수치 설정 변수 모음
  const RESIZER_GAP = 0.01; // 구역을 나누는 뼈대 슬림 마진 (조절바 두께 확보)

  // 1️⃣ 메인 차트(캔들) 위아래 여백
  const MAIN_PAD_TOP = 0.05; // 천장 여백
  const MAIN_PAD_BOTTOM = 0.02; // 바닥 여백 (조절바 침범 방지)

  // 2️⃣ 거래량 차트 위아래 여백
  const VOL_PAD_TOP = 0.08; // 천장 여백 (막대그래프 천장 부딪힘 방지)
  const VOL_PAD_BOTTOM = 0.0; // 바닥 여백

  // 3️⃣ 김프 차트 위아래 여백
  const KIMCHI_PAD_TOP = 0.08; // 천장 여백 (김프가 더 많이 튀므로 4% 배정)
  const KIMCHI_PAD_BOTTOM = 0.01; // 바닥 여백 (마이너스 김프 바닥 뚫음 방지)

  let mainBottom = 0;
  let volTop = 1,
    volBottom = 0;
  let kimchiTop = 1,
    kimchiBottom = 0;

  if (v && k) {
    rVol.style.display = "block";
    rKim.style.display = "block";
    rVol.style.top = store.chartSplits.s1 * 100 + "%";
    rKim.style.top = store.chartSplits.s2 * 100 + "%";

    // 🚀 완벽한 3단 샌드위치 분할 (숫자가 위아래로 섞이지 않음)
    mainBottom = 1 - store.chartSplits.s1 + RESIZER_GAP + MAIN_PAD_BOTTOM;
    volTop = store.chartSplits.s1 + RESIZER_GAP + VOL_PAD_TOP;
    volBottom = 1 - store.chartSplits.s2 + RESIZER_GAP + VOL_PAD_BOTTOM;
    kimchiTop = store.chartSplits.s2 + RESIZER_GAP + KIMCHI_PAD_TOP;
    kimchiBottom = KIMCHI_PAD_BOTTOM;
  } else if (v && !k) {
    rVol.style.display = "block";
    rKim.style.display = "none";
    rVol.style.top = store.chartSplits.s1 * 100 + "%";

    mainBottom = 1 - store.chartSplits.s1 + RESIZER_GAP + MAIN_PAD_BOTTOM;
    volTop = store.chartSplits.s1 + RESIZER_GAP + VOL_PAD_TOP;
    volBottom = VOL_PAD_BOTTOM;
  } else if (!v && k) {
    rVol.style.display = "none";
    rKim.style.display = "block";
    rKim.style.top = store.chartSplits.s2 * 100 + "%";

    mainBottom = 1 - store.chartSplits.s2 + RESIZER_GAP + MAIN_PAD_BOTTOM;
    kimchiTop = store.chartSplits.s2 + RESIZER_GAP + KIMCHI_PAD_TOP;
    kimchiBottom = KIMCHI_PAD_BOTTOM;
  } else {
    rVol.style.display = "none";
    rKim.style.display = "none";
    mainBottom = MAIN_PAD_BOTTOM;
  }

  // 🚀 마진 즉시 적용 (하나의 십자선 유지)
  // 🚀 마진 적용 및 우측 Y축(숫자) 색상 분리!
  const style = getComputedStyle(document.body);
  const textColor = style.getPropertyValue("--text").trim() || "#d1d4dc";
  const upColor = style.getPropertyValue("--up").trim() || "#26a69a";

  store.chart.priceScale("right").applyOptions({
    scaleMargins: { top: MAIN_PAD_TOP, bottom: mainBottom },
    textColor: textColor,
  });

  if (store.volumeSeries) {
    store.volumeSeries.applyOptions({ visible: v });
    // 🚀 거래량도 우측(volScale)으로 모아서 완벽한 3단 정렬!
    store.chart.priceScale("volScale").applyOptions({
      visible: v,
      scaleMargins: { top: volTop, bottom: volBottom },
      textColor: upColor + "CC",
      borderColor: "transparent",
    });
  }
  if (store.kimchiSeries) {
    store.kimchiSeries.applyOptions({ visible: k });
    store.chart.priceScale("kimchiScale").applyOptions({
      visible: k, // 🚀 김프 축 숫자도 우측에 등장!
      scaleMargins: { top: kimchiTop, bottom: kimchiBottom },
      textColor: "#57a4fc", // 🚀 김프 축은 파란색
      borderColor: "transparent",
    });
  }

  // 🚀 김프 비교군 스위처 위치 연동 (패널 높이에 따라 자동으로 위아래 이동)
  const kimchiSwitcher = document.getElementById("kimchi-switcher");
  if (kimchiSwitcher) {
    if (k && store.paneConfig.kimchi) {
      kimchiSwitcher.style.display = "flex";
      kimchiSwitcher.style.top = `calc(${kimchiTop * 100}% + 8px)`;
    } else {
      kimchiSwitcher.style.display = "none";
    }
  }
}

// 🚀 2. 드래그 엔진 초기화
function initResizers() {
  const wrapper = document.getElementById("chart-wrapper");
  const rVol = document.getElementById("resizer-vol");
  const rKim = document.getElementById("resizer-kimchi");

  const startDrag = (e, target) => {
    isDraggingResizer = target;
    document.body.style.cursor = "row-resize";
  };

  if (rVol) rVol.addEventListener("mousedown", (e) => startDrag(e, "vol"));
  if (rKim) rKim.addEventListener("mousedown", (e) => startDrag(e, "kimchi"));

  window.addEventListener("mousemove", (e) => {
    if (!isDraggingResizer) return;
    const rect = wrapper.getBoundingClientRect();
    let pct = (e.clientY - rect.top) / rect.height;

    // 선끼리 교차하거나 영역 밖으로 나가지 못하게 제한!
    if (isDraggingResizer === "vol") {
      if (pct < 0.2) pct = 0.2;
      if (pct > store.chartSplits.s2 - 0.1) pct = store.chartSplits.s2 - 0.1;
      store.chartSplits.s1 = pct;
    } else {
      if (pct < store.chartSplits.s1 + 0.1) pct = store.chartSplits.s1 + 0.1;
      if (pct > 0.9) pct = 0.9;
      store.chartSplits.s2 = pct;
    }
    applyChartLayout();
  });

  window.addEventListener("mouseup", () => {
    if (isDraggingResizer) {
      isDraggingResizer = null;
      document.body.style.cursor = "default";
    }
  });
}

// ⚙️ 시간 변환 헬퍼 (Lightweight Charts 포맷팅용)
const getUnixSeconds = (t) => {
  if (typeof t === "object" && t !== null)
    return new Date(t.year, t.month - 1, t.day).getTime() / 1000;
  if (typeof t === "string") return new Date(t).getTime() / 1000;
  return t;
};

// 🚀 3. 차트 생성
export function initChart() {
  if (store.chart) {
    store.chart.remove();
    store.chart = null;
    store.candleSeries = null;
    store.volumeSeries = null;
    store.kimchiSeries = null;
    store.previewSeries = null;
  }
  const elMain = document.getElementById("pane-main");

  // 🚀 CSS에 정의된 다크/라이트 모드 테마 변수 가져오기
  const style = getComputedStyle(document.body);
  const textColor = style.getPropertyValue("--text").trim() || "#d1d4dc";
  const gridColor = style.getPropertyValue("--border").trim() || "#2a2a22";
  const upColor = style.getPropertyValue("--up").trim() || "#26a69a";
  const downColor = style.getPropertyValue("--down").trim() || "#ef5350";

  store.chart = window.LightweightCharts.createChart(elMain, {
    autoSize: true, // 🚀 v5 핵심 기능: 창 크기에 맞춰 자동 리사이징!
    layout: { background: { color: "transparent" }, textColor: textColor },
    grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
    crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal },
    // 🚀 Y축 가격 드래그 및 모바일 터치 드래그 완벽 부활!
    handleScale: { axisPressedMouseMove: { time: true, price: true } },
    handleScroll: { vertTouchDrag: true },
    timeScale: {
      borderColor: gridColor,
      timeVisible: true,
      secondsVisible: false,
      fixRightEdge: false,
      tickMarkFormatter: (time, tickMarkType) => {
        const d = new Date(getUnixSeconds(time) * 1000);
        if (isNaN(d.getTime())) return "";

        // 🚀 연도, 날짜, 시간 단위별 스마트 표시
        if (tickMarkType === 0) return `${d.getFullYear()}년`;

        const isDayUnit = !(store.currentTF || "1h").match(/[hm]/);
        if (isDayUnit) {
          return `${d.getMonth() + 1}/${d.getDate()}`;
        } else {
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
      },
    },
    localization: {
      locale: navigator.language,
      timeFormatter: (tick) => {
        const d = new Date(getUnixSeconds(tick) * 1000);
        if (isNaN(d.getTime())) return "";
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const date = String(d.getDate()).padStart(2, "0");
        const h = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");

        if ((store.currentTF || "1h").match(/[hm]/)) {
          return `${y}-${m}-${date} ${h}:${min}`;
        } else {
          return `${y}-${m}-${date}`;
        }
      },
    },
    rightPriceScale: {
      autoScale: true,
      visible: true,
      borderColor: gridColor,
      mode: store.isLogMode ? 1 : 0,
    },
  });

  store.candleSeries = store.chart.addSeries(
    window.LightweightCharts.CandlestickSeries,
    {
      upColor: upColor,
      downColor: downColor,
      borderVisible: false,
      wickUpColor: upColor,
      wickDownColor: downColor,
    },
  );

  // 💡 [추가] _main.js에 있던 시뮬레이터용 캔들 시리즈 할당 복구
  store.previewSeries = store.chart.addSeries(
    window.LightweightCharts.CandlestickSeries,
    {
      upColor: upColor + "4D",
      downColor: downColor + "4D",
      borderVisible: false,
      wickVisible: false,
    },
  );

  store.volumeSeries = store.chart.addSeries(
    window.LightweightCharts.HistogramSeries,
    {
      color: "#26a69a",
      priceFormat: { type: "volume" },
      priceScaleId: "volScale", // 🚀 거래량 우측 분리 스케일
    },
  );
  store.chart.priceScale("volScale").applyOptions({
    autoScale: true,
    borderColor: "transparent",
    visible: true,
  });

  // 🚀 김프를 히스토그램으로 업그레이드 (다채로운 색상 적용)
  store.kimchiSeries = store.chart.addSeries(
    window.LightweightCharts.HistogramSeries,
    {
      priceFormat: {
        type: "custom",
        formatter: (p) => (p > 0 ? "+" : "") + p.toFixed(2) + "%",
      },
      priceScaleId: "kimchiScale",
    },
  );
  store.chart.priceScale("kimchiScale").applyOptions({
    autoScale: true,
    borderColor: "transparent",
    visible: true,
  }); // 🚀 visible: true 로 숫자 띄우기

  // 🚀 십자선(크로스헤어) 전광판 연동 엔진
  store.chart.subscribeCrosshairMove((p) => {
    if (p && p.time) {
      store.isCrosshairActive = true; // 🚀 마우스가 차트 위에 있음 (실시간 덮어쓰기 금지)
      // 1. 마우스가 차트 위에 있을 때: 해당 캔들 정보 출력
      const d = p.seriesData.get(store.candleSeries);
      const v = store.volumeSeries
        ? p.seriesData.get(store.volumeSeries)
        : null;
      const k = store.kimchiSeries
        ? p.seriesData.get(store.kimchiSeries)
        : null;
      if (d && typeof window.updateLegend === "function") {
        window.updateLegend(d, v, k); // 🚀 전광판에 볼륨과 김프 데이터 전달
      }
    } else {
      store.isCrosshairActive = false; // 🚀 마우스가 차트를 벗어남 (실시간 동기화 허용)
      // 2. 마우스가 차트를 벗어났을 때: 실시간 최신 캔들로 복구
      if (store.mainData && store.mainData.length > 0) {
        if (typeof window.updateLegend === "function") {
          const lastIdx = store.mainData.length - 1;
          const v =
            store.volumeData && store.volumeData.length > 0
              ? store.volumeData[lastIdx]
              : null;
          const k =
            store.kimchiData && store.kimchiData.length > 0
              ? store.kimchiData[lastIdx]
              : null;
          window.updateLegend(store.mainData[lastIdx], v, k);
        }
      }
    }
  });

  initResizers();
  applyChartLayout();

  // 🚀 자 대고 그리는 측정 도구(Measure Tool) 부착
  setTimeout(() => {
    if (typeof window.setupMeasureTool === "function")
      window.setupMeasureTool();
  }, 50);
}

// function initChart() {
//   const container = document.getElementById("chart-container");
//   // 🚀 과거와의 작별 (이게 메모리 아끼는 핵심!)
//   if (chart) {
//     chart.remove(); // 엔진 내부 메모리 해제
//     chart = null;
//     candleSeries = null;
//     countdownPriceLine = null; // 👈 유령 방지
//   }

//   const isDark = currentTheme === "binance" || currentTheme === "upbit-dark";
//   const upColor = currentTheme === "binance" ? "#26a69a" : "#c84a31";
//   const downColor = currentTheme === "binance" ? "#ef5350" : "#1261c4";

//   chart = LightweightCharts.createChart(container, {
//     width: container.clientWidth,
//     height: container.clientHeight,
//     layout: {
//       background: {
//         color: getComputedStyle(document.body).getPropertyValue("--bg").trim(),
//       },
//       textColor: getComputedStyle(document.body)
//         .getPropertyValue("--text")
//         .trim(),
//     },
//     grid: {
//       vertLines: { color: isDark ? "#2a2a22" : "#f1f1f11f" },
//       horzLines: { color: isDark ? "#2a2a22" : "#f1f1f11f" },
//     },
//     timeScale: {
//       borderColor: isDark ? "#2a2a22" : "#f1f1f11f",
//       timeVisible: true,
//       secondsVisible: false,
//       fixRightEdge: false,
//       tickMarkFormatter: (time, tickMarkType) => {
//         const d = new Date(getUnixSeconds(time) * 1000);
//         if (isNaN(d.getTime())) return "";

//         // 🚀 핵심: tickMarkType이 'Year'(0)이면 연도를 최우선으로 반환
//         // LightweightCharts.TickMarkType.Year 값은 보통 0입니다.
//         if (tickMarkType === 0) {
//           return `${d.getFullYear()}년`;
//         }

//         const isDayUnit = !(currentTF || "1h").match(/[hm]/);

//         if (isDayUnit) {
//           // 일봉 이상: 연도 첫날이 아니면 '월/일' 표시
//           return `${d.getMonth() + 1}/${d.getDate()}`;
//         } else {
//           // 분/시간봉: '시:분' 표시
//           return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
//         }
//       },
//     },
//     localization: {
//       locale: navigator.language,
//       timeFormatter: (tick) => {
//         const d = new Date(getUnixSeconds(tick) * 1000);
//         if (isNaN(d.getTime())) return "";

//         const y = d.getFullYear();
//         const m = String(d.getMonth() + 1).padStart(2, "0");
//         const date = String(d.getDate()).padStart(2, "0");
//         const h = String(d.getHours()).padStart(2, "0");
//         const min = String(d.getMinutes()).padStart(2, "0");

//         // 🚀 십자선(Crosshair) 라벨도 동일한 규칙 적용
//         if ((currentTF || "1h").match(/[hm]/)) {
//           return `${y}-${m}-${date} ${h}:${min}`;
//         } else {
//           return `${y}-${m}-${date}`;
//         }
//       },
//     },
//     rightPriceScale: {
//       autoScale: true,
//       visible: true,
//       entireTextOnly: false,
//       borderColor: isDark ? "#2a2a22" : "#f1f1f11f",
//       mode: isLogMode ? 1 : 0,
//     },
//     crosshair: {
//       mode: LightweightCharts.CrosshairMode.Normal,
//     },
//   });

//   // 🚀 공통 커스텀 가격 포맷 설정 (함수 추가 없이 기존 formatSmartPrice 재활용!)
//   // 🚀 p 값을 무조건 '순수 숫자(Number)'로 강제 변환! (문자열 방어)
//   const row = currentTableData.find((c) => c.Symbol === currentAsset);
//   const p = row && row.precision !== undefined ? Number(row.precision) : 2;

//   // 🚀 minMove도 안전하게 계산
//   const safeMinMove = p > 0 ? Number((1 / Math.pow(10, p)).toFixed(p)) : 1;
//   const customPriceFormat = {
//     type: "price",
//     precision: p,
//     minMove: safeMinMove,
//     formatter: (price) => {
//       if (price === null || price === undefined || isNaN(price)) return "";
//       // 💡 formatSmartPrice가 똑똑하게 소수점을 찍어줄 겁니다.
//       return formatSmartPrice(price, p);
//     },
//   };

//   candleSeries = chart.addCandlestickSeries({
//     upColor,
//     downColor,
//     borderUpColor: upColor,
//     borderDownColor: downColor,
//     wickUpColor: upColor,
//     wickDownColor: downColor,
//     priceFormat: customPriceFormat, // 👈 여기 추가
//     lastValueVisible: false,
//   });

//   previewSeries = chart.addCandlestickSeries({
//     upColor: upColor + "4D",
//     downColor: downColor + "4D",
//     borderVisible: false,
//     wickVisible: false,
//     priceFormat: customPriceFormat, // 👈 여기 추가
//   });

//   chart.subscribeCrosshairMove((p) => {
//     // 1. 마우스가 차트 위에 있고 데이터가 존재할 때 (탐색 모드)
//     if (p && p.time) {
//       const d = p.seriesData.get(candleSeries);
//       if (d) {
//         updateLegend(d);
//       }
//     }
//     // 2. 마우스가 차트를 벗어났을 때 (실시간 추적 모드)
//     else if (mainData && mainData.length > 0) {
//       // 가장 최근 봉(현재가) 데이터를 전광판에 고정!
//       updateLegend(mainData[mainData.length - 1]);
//     }
//   });

//   // 🚀 설정 변수를 활용한 유령 데이터 렌더링
//   if (mainData.length > 1) {
//     const lastTime = getUnixSeconds(mainData[mainData.length - 1].time);
//     const interval =
//       lastTime - getUnixSeconds(mainData[mainData.length - 2].time);

//     // 🚀 전역 변수 적용
//     const ghostData = Array.from(
//       { length: CHART_CONFIG.GHOST_COUNT },
//       (_, i) => ({
//         time: lastTime + interval * (i + 1),
//       }),
//     );

//     candleSeries.setData([...mainData, ...ghostData]);

//     // VISIBLE_COUNT, RIGHT_PADDING 변수 사용
//     chart.timeScale().setVisibleLogicalRange({
//       from: Math.max(0, mainData.length - CHART_CONFIG.VISIBLE_COUNT),
//       to: mainData.length + CHART_CONFIG.RIGHT_PADDING,
//     });
//   } else if (mainData.length === 1) {
//     candleSeries.setData(mainData);
//     autoFit();
//   }

//   // 측정 도구 세팅
//   setTimeout(setupMeasureTool, 50);

//   // 리사이즈 옵저버 디바운스
//   if (window.chartResizeObserver) window.chartResizeObserver.disconnect();

//   let resizeTimeout;
//   window.chartResizeObserver = new ResizeObserver(([entry]) => {
//     // 1. 부모 컨테이너 크기 실시간 감지
//     const { width, height } = entry.contentRect;

//     // 2. 0달러 방지 (크기가 0일 땐 패스)
//     if (!width || !height) return;

//     // 3. 디바운스 (너무 자주 그리면 렉 걸리니까 잠시 대기)
//     clearTimeout(resizeTimeout);
//     resizeTimeout = setTimeout(() => {
//       if (chart) {
//         chart.resize(width, height);
//         // 🚀 리사이즈 직후 차트 범위를 다시 맞춰야 안 찌그러짐
//         // chart.timeScale().fitContent();
//         // console.log(`📏 리사이즈 완료: ${width}x${height}`);
//       }

//       // 🚀 모바일 오버레이 방어 (아까 그 기준 적용!)
//       if (width >= SCREEN_WIDTH) {
//         const overlay = document.getElementById("mobile-chart-overlay");
//         if (overlay && !overlay.classList.contains("hidden")) {
//           closeMobileChart();
//         }
//       }
//     }, 50);
//   });
//   // 🎯 차트 컨테이너 감시 시작!
//   const chartContainer = document.getElementById("chart-container");
//   if (chartContainer) {
//     window.chartResizeObserver.observe(chartContainer);
//   }
// }

// 🚀 테마 변경 시 차트를 부수지 않고 색상만 즉각적으로 갈아끼우는 함수
export function updateChartTheme() {
  if (!store.chart) return;

  const style = getComputedStyle(document.body);
  const textColor = style.getPropertyValue("--text").trim() || "#d1d4dc";
  const gridColor = style.getPropertyValue("--border").trim() || "#2a2a22";
  const upColor = style.getPropertyValue("--up").trim() || "#26a69a";
  const downColor = style.getPropertyValue("--down").trim() || "#ef5350";

  // 1. 차트 배경 및 그리드 색상 업데이트
  store.chart.applyOptions({
    layout: { textColor: textColor },
    grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
    rightPriceScale: { borderColor: gridColor },
  });

  // 2. 캔들 시리즈 색상 업데이트
  if (store.candleSeries) {
    store.candleSeries.applyOptions({
      upColor,
      downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });
  }
  if (store.previewSeries) {
    store.previewSeries.applyOptions({
      upColor: upColor + "4D",
      downColor: downColor + "4D",
    });
  }

  // 🚀 3. 볼륨 시리즈 및 막대그래프 색상 업데이트
  if (store.volumeSeries && store.volumeData && store.mainData) {
    const upColorVol = upColor + "80"; // 50% 투명도
    const downColorVol = downColor + "80";

    store.volumeSeries.applyOptions({ color: upColorVol });

    store.volumeData.forEach((volItem, index) => {
      const candle = store.mainData[index];
      if (candle) {
        volItem.color = candle.close >= candle.open ? upColorVol : downColorVol;
      }
    });
    store.volumeSeries.setData(store.volumeData);
  }

  applyChartLayout();
}

window.togglePane = togglePane;
window.applyChartLayout = applyChartLayout;

// --- _main.js에서 옮겨온 함수들 ---

export function setTF(tf) {
  const btnSim = document.getElementById("tab-btn-sim");
  const isSimMode = btnSim ? btnSim.classList.contains("active") : false;

  if (isSimMode) {
    window.Swal.fire({
      title: "초기화 경고!",
      text: "타임프레임을 변경하면 현재 그려둔 가상 차트가 모두 날아갑니다. 바꿀까요?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "var(--up)",
      cancelButtonColor: "var(--border)",
      confirmButtonText: "네, 변경할게요 🚀",
      cancelButtonText: "아니요, 취소",
      background: "var(--panel)",
      color: "var(--text)",
    }).then((result) => {
      if (result.isConfirmed) executeSetTF(tf);
    });
  } else {
    executeSetTF(tf);
  }
}

export function executeSetTF(tf) {
  store.currentTF = tf;
  document.querySelectorAll(".tf-btn").forEach((b) => {
    const onClickAttr = b.getAttribute("onclick") || "";
    const isMatch = onClickAttr.includes(`'${tf}'`);

    b.classList.toggle("active", isMatch);
    b.classList.toggle("opacity-100", isMatch);
    b.classList.toggle("opacity-50", !isMatch);
  });

  if (typeof window.renderTimeframeButtons === "function") {
    window.renderTimeframeButtons(tf);
  }

  // 4. 차트 데이터 갱신 함수 호출 (타임프레임 변경임을 명시: true)
  if (typeof fetchHistory === "function")
    fetchHistory(store.currentAsset, true);
}

export function toggleLogScale() {
  store.isLogMode = !store.isLogMode;
  const btn = document.getElementById("log-btn");
  if (btn) {
    btn.innerText = store.isLogMode ? "Log ON" : "Log Off";
    btn.classList.toggle("active", store.isLogMode);
  }
  if (store.chart) {
    store.chart
      .priceScale("right")
      .applyOptions({ mode: store.isLogMode ? 1 : 0 });
  }
}

export function updatePreview() {
  if (
    store.mainData.length &&
    store.isHover &&
    typeof window.getNext === "function"
  )
    store.previewSeries.setData([window.getNext()]);
}

export function stopMeasuring() {
  store.isMeasuring = false;
  store.measureStart = null;
  store.measureEnd = null;
  [
    measureDOM.box,
    measureDOM.startLabel,
    measureDOM.endLabel,
    measureDOM.rangeBar,
  ].forEach((el) => {
    el.style.display = "none";
    el.innerText = "";
  });
}

export function setupMeasureTool() {
  const container = document.getElementById("pane-main");
  if (!container) return;
  store.cachedChartTd = container.querySelector("td:nth-child(2)");
  store.cachedPriceTd = container.querySelector("td:nth-child(3)");

  if (!store.cachedChartTd || !store.cachedPriceTd) return;

  store.cachedChartTd.style.position = "relative";
  store.cachedPriceTd.style.position = "relative";
  store.cachedChartTd.appendChild(measureDOM.box);
  store.cachedPriceTd.appendChild(measureDOM.rangeBar);
  store.cachedPriceTd.appendChild(measureDOM.startLabel);
  store.cachedPriceTd.appendChild(measureDOM.endLabel);
}

export function initMeasureEvents() {
  const container = document.getElementById("pane-main");
  if (!container) return;

  container.addEventListener("mousedown", (e) => {
    if (
      !store.cachedChartTd ||
      !store.cachedPriceTd ||
      !store.chart ||
      !store.candleSeries
    )
      return;

    const rect = container.getBoundingClientRect();
    if (
      e.clientX - rect.left >
      rect.width - (store.cachedPriceTd.clientWidth || 60)
    )
      return;

    if (e.shiftKey && e.button === 0) {
      stopMeasuring();
      store.isMeasuring = true;

      const chartRect = store.cachedChartTd.getBoundingClientRect();
      const sX = e.clientX - chartRect.left;
      const sY = e.clientY - chartRect.top;
      const price = store.candleSeries.coordinateToPrice(sY);
      const rawTime = store.chart.timeScale().coordinateToTime(sX);

      if (price === null || rawTime === null) {
        store.isMeasuring = false;
        return;
      }

      let unixTime = rawTime;
      if (typeof rawTime === "object" && rawTime !== null)
        unixTime =
          new Date(rawTime.year, rawTime.month - 1, rawTime.day).getTime() /
          1000;
      else if (typeof rawTime === "string")
        unixTime = new Date(rawTime).getTime() / 1000;

      store.measureStart = {
        x: sX,
        y: sY,
        price: price,
        rawTime: rawTime,
        unixTime: unixTime,
      };

      measureDOM.box.style.cssText += `left: ${sX}px; top: ${sY}px; width: 0px; height: 0px; display: flex;`;
      measureDOM.rangeBar.style.cssText += `top: ${sY}px; height: 0px; display: block;`;
      measureDOM.startLabel.style.cssText += `top: ${sY - 10}px; display: block;`;
      measureDOM.endLabel.style.cssText += `top: ${sY - 10}px; display: block;`;

      measureDOM.box.innerText = "";
      const formattedPrice =
        typeof window.formatSmartPrice === "function"
          ? window.formatSmartPrice(price)
          : price.toFixed(2);
      measureDOM.startLabel.innerText = formattedPrice;
      measureDOM.endLabel.innerText = formattedPrice;
      e.preventDefault();
    } else if (e.button === 0 && store.isMeasuring) {
      store.isMeasuring = false;
    } else if (!e.shiftKey && !store.isMeasuring && store.measureStart) {
      stopMeasuring();
    }
  });

  container.addEventListener("mousemove", (e) => {
    if (
      !store.isMeasuring ||
      !store.measureStart ||
      !store.cachedChartTd ||
      !store.candleSeries
    )
      return;

    const chartRect = store.cachedChartTd.getBoundingClientRect();
    const curX = e.clientX - chartRect.left;
    const curY = e.clientY - chartRect.top;

    const curPrice = store.candleSeries.coordinateToPrice(curY);
    const curTimeRaw = store.chart.timeScale().coordinateToTime(curX);
    if (curPrice === null || curTimeRaw === null) return;

    let curUnixTime = curTimeRaw;
    if (typeof curTimeRaw === "object" && curTimeRaw !== null)
      curUnixTime =
        new Date(
          curTimeRaw.year,
          curTimeRaw.month - 1,
          curTimeRaw.day,
        ).getTime() / 1000;
    else if (typeof curTimeRaw === "string")
      curUnixTime = new Date(curTimeRaw).getTime() / 1000;

    store.measureEnd = { price: curPrice, time: curTimeRaw };

    if (!store.measureStart.rawTime) return;
    const startX = store.chart
      .timeScale()
      .timeToCoordinate(store.measureStart.rawTime);
    const startY = store.candleSeries.priceToCoordinate(
      store.measureStart.price,
    );
    if (startX === null || startY === null) return;

    const priceDiff = curPrice - store.measureStart.price;
    const percentDiff = (priceDiff / store.measureStart.price) * 100;
    const isUp = priceDiff >= 0;
    const tColor = isUp ? "var(--up, #26a69a)" : "var(--down, #ef5350)";
    const tBg = isUp ? "rgba(38,166,154,0.15)" : "rgba(239,83,80,0.15)";

    const topY = Math.min(startY, curY),
      heightY = Math.max(0.5, Math.abs(curY - startY));
    const leftX = Math.min(startX, curX),
      widthX = Math.abs(curX - startX);

    measureDOM.box.style.cssText += `left: ${leftX}px; top: ${topY}px; width: ${widthX}px; height: ${heightY}px; border-color: ${tColor}; background-color: ${tBg}; color: ${tColor};`;
    measureDOM.rangeBar.style.cssText += `top: ${topY}px; height: ${heightY}px; background-color: ${tBg};`;
    measureDOM.startLabel.style.cssText += `top: ${startY - 10}px; background-color: ${tColor};`;
    measureDOM.endLabel.style.cssText += `top: ${curY - 10}px; background-color: ${tColor};`;
    measureDOM.endLabel.innerText =
      typeof window.formatSmartPrice === "function"
        ? window.formatSmartPrice(curPrice)
        : curPrice.toFixed(2);

    const barsDiff = Math.abs(
      Math.round(
        (curUnixTime - store.measureStart.unixTime) /
          (tfSec[store.currentTF] || 86400),
      ),
    );
    const formattedDiff =
      typeof window.formatSmartPrice === "function"
        ? window.formatSmartPrice(priceDiff)
        : priceDiff.toFixed(2);
    measureDOM.box.innerText = `${barsDiff} bars\n${formattedDiff}\n(${isUp ? "+" : ""}${percentDiff.toFixed(2)}%)`;
  });

  container.addEventListener("contextmenu", (e) => {
    if (store.measureStart) {
      e.preventDefault();
      stopMeasuring();
    }
  });
}

export function toggleCountdown(isChecked) {
  store.showCountdown = isChecked;
  const knob = document.getElementById("countdown-knob");

  if (isChecked) {
    knob.style.transform = "translateX(10px)";
    knob.parentElement.classList.add("bg-theme-accent");
  } else {
    knob.style.transform = "translateX(0)";
    knob.parentElement.classList.remove("bg-theme-accent");
    if (store.countdownOverlay) store.countdownOverlay.style.display = "none";
  }
}

export function updateRealtimeCountdown(serverMs) {
  if (!store.candleSeries || store.mainData.length === 0) {
    if (store.countdownPriceLine) {
      store.candleSeries.removePriceLine(store.countdownPriceLine);
      store.countdownPriceLine = null;
    }
    return;
  }

  let displayTime = "Wait...";
  if (serverMs && serverMs > 0) {
    if (serverMs !== store.lastServerMs) {
      store.lastServerMs = serverMs;
      store.localTimeAtUpdate = performance.now();
    }

    const interpolatedMs =
      store.lastServerMs + (performance.now() - store.localTimeAtUpdate);

    const secondsPerBar = tfSec[store.currentTF] || 60;
    const lastCandleTime = store.mainData[store.mainData.length - 1].time;
    const nextBarTimeMs = (lastCandleTime + secondsPerBar) * 1000;

    if (interpolatedMs >= nextBarTimeMs) {
      displayTime = "00:00";
    } else {
      if (typeof window.calculateTimeRemaining === "function") {
        displayTime = window.calculateTimeRemaining(
          store.currentTF,
          interpolatedMs,
        );
      }
    }
  }

  const lastCandle = store.mainData[store.mainData.length - 1];
  const isDown = lastCandle.close < lastCandle.open;
  const style = getComputedStyle(document.body);
  const varName = isDown ? "--down" : "--up";
  const rawColor =
    style.getPropertyValue(varName).trim() || (isDown ? "#ef5350" : "#26a69a");

  const lineOptions = {
    price: lastCandle.close,
    color: "transparent",
    lineWidth: 0,
    axisLabelVisible: true,
    title: store.showCountdown ? `${displayTime} ` : "",
    axisLabelColor: rawColor,
    axisLabelTextColor: "#ffffff",
  };

  if (!store.countdownPriceLine) {
    store.countdownPriceLine = store.candleSeries.createPriceLine(lineOptions);
  } else {
    store.countdownPriceLine.applyOptions(lineOptions);
  }
}

setInterval(() => {
  if (store.lastServerMs > 0) {
    updateRealtimeCountdown(store.lastServerMs);
  }
}, 50);

window.setTF = setTF;
window.executeSetTF = executeSetTF;
window.toggleLogScale = toggleLogScale;
window.updatePreview = updatePreview;
window.stopMeasuring = stopMeasuring;
window.setupMeasureTool = setupMeasureTool;
window.initMeasureEvents = initMeasureEvents;
window.toggleCountdown = toggleCountdown;
