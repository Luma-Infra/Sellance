// chart.js - 순수 차트 엔진 코어
import { store, tfSec, measureDOM } from './_store.js';
import { fetchHistory } from './chart_data.js';
import { getUnixSeconds } from './chart_utils.js';

// 🚀 3. 차트 생성
export function initChart() {
  if (store.chart) {
    store.chart.remove();
    store.chartVol?.remove();
    store.chart = null;
    store.chartVol = null;
    store.chartKimchi = null;
    store.candleSeries = null;
    store.volumeSeries = null;
    store.kimchiSeries = null;
    store.previewSeries = null;
    store.countdownPriceLine = null; // 🚀 카운트다운 유령선 방지
  }
  const elMain = document.getElementById("pane-main");
  const elVol = document.getElementById("pane-vol");

  // 🚀 CSS에 정의된 다크/라이트 모드 테마 변수 가져오기
  const style = getComputedStyle(document.body);
  const textColor = style.getPropertyValue("--text").trim() || "#d1d4dc";
  const gridColor = style.getPropertyValue("--border").trim() || "#2a2a22";
  const upColor = style.getPropertyValue("--up").trim() || "#26a69a";
  const downColor = style.getPropertyValue("--down").trim() || "#ef5350";

  const commonOptions = {
    autoSize: true, // 🚀 v5 핵심 기능: 창 크기에 맞춰 자동 리사이징!
    layout: {
      background: { color: "transparent" },
      textColor: textColor,
      attributionLogo: false, // 🚀 트레이딩뷰 워터마크 끄기
    },
    grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
    crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal },
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
  };

  // 1. 메인 차트
  store.chart = window.LightweightCharts.createChart(elMain, {
    ...commonOptions,
    rightPriceScale: {
      autoScale: true,
      visible: true,
      borderColor: gridColor,
      mode: store.isLogMode ? 1 : 0,
    },
    leftPriceScale: {
      autoScale: true,
      visible: true, // 🚀 시간축 동기화를 위해 보이지 않는 축 유지
      borderColor: "transparent",
    },
  });

  // 2. 볼륨 차트 (좌측 김프, 우측 거래량 스케일 동시 적용)
  store.chartVol = window.LightweightCharts.createChart(elVol, {
    ...commonOptions,
    rightPriceScale: {
      autoScale: true,
      visible: true,
      borderColor: gridColor,
      scaleMargins: { top: 0.5, bottom: 0 },
    },
    leftPriceScale: {
      autoScale: true,
      visible: true,
      borderColor: gridColor,
      scaleMargins: { top: 0.1, bottom: 0.1 },
    },
  });

  // 🚀 무한 재귀 방지용 실제 마우스 위치 추적
  elMain.addEventListener('mouseenter', () => store.activeChart = store.chart);
  elVol.addEventListener('mouseenter', () => store.activeChart = store.chartVol);

  elMain.addEventListener('mouseleave', () => { if (store.activeChart === store.chart) store.activeChart = null; });
  elVol.addEventListener('mouseleave', () => { if (store.activeChart === store.chartVol) store.activeChart = null; });

  store.candleSeries = store.chart.addSeries(
    window.LightweightCharts.CandlestickSeries,
    {
      upColor: upColor,
      downColor: downColor,
      borderVisible: false,
      wickUpColor: upColor,
      wickDownColor: downColor,
      lastValueVisible: false, // 🚀 기본 가격 라벨 숨기기
      priceLineVisible: false, // 🚀 기본 가격선 숨기기
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

  store.volumeSeries = store.chartVol.addSeries(
    window.LightweightCharts.HistogramSeries,
    {
      color: "#26a69a",
      priceFormat: { type: "volume" },
    },
  );

  // 🚀 김프를 오버레이 라인 시리즈로 업그레이드 (다채로운 색상 포기, 가독성 우선)
  store.kimchiSeries = store.chartVol.addSeries(
    window.LightweightCharts.LineSeries,
    {
      priceScaleId: "left",
      color: "#ff007a",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      priceFormat: {
        type: "custom",
        minMove: 0.01,
        formatter: (p) => (p > 0 ? "+" : "") + p.toFixed(2) + "%",
      },
    }
  );

  // 🌊 시간축 스크롤 완벽 동기화 엔진
  const syncTimeScales = (sourceChart, targetCharts) => {
    sourceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        targetCharts.forEach((target) => {
          if (target) target.timeScale().setVisibleLogicalRange(range);
        });
      }
    });
  };

  syncTimeScales(store.chart, [store.chartVol]);
  syncTimeScales(store.chartVol, [store.chart]);

  // 🎯 십자선 크로스헤어 완벽 동기화 엔진
  const syncCrosshair = (sourceChart, targetCharts) => {
    sourceChart.subscribeCrosshairMove((param) => {
      if (store.activeChart !== sourceChart) return;

      try {
        const isHover = param.point !== undefined && param.time !== undefined && param.point.x >= 0 && param.point.y >= 0;

        if (isHover) {
          if (sourceChart._horzVisible !== true) {
            sourceChart.applyOptions({ crosshair: { horzLine: { visible: true, labelVisible: true } } });
            sourceChart._horzVisible = true;
          }

          targetCharts.forEach((targetObj) => {
            const { chart: tChart, series: tSeries } = targetObj;
            if (tChart) {
              if (tChart._horzVisible !== false) {
                tChart.applyOptions({ crosshair: { horzLine: { visible: false, labelVisible: false } } });
                tChart._horzVisible = false;
              }
              let price = 0;
              if (tSeries) {
                const data = param.seriesData.get(tSeries);
                if (data) price = data.value !== undefined ? data.value : data.close;
              }
              if (typeof tChart.setCrosshairPosition === 'function' && tSeries) {
                try { tChart.setCrosshairPosition(price || 0, param.time, tSeries); } catch (e) { }
              }
            }
          });
        } else {
          targetCharts.forEach((targetObj) => {
            if (targetObj.chart) targetObj.chart.clearCrosshairPosition();
          });
        }

        if (isHover) {
          store.isCrosshairActive = true;
          const pTime = getUnixSeconds(param.time);

          let d = null;
          if (sourceChart === store.chart) d = param.seriesData.get(store.candleSeries);
          else d = store.mainData?.find(item => item.time === pTime) || null;

          const v = store.volumeData?.find(item => item.time === pTime) || null;
          const k = store.kimchiData?.find(item => item.time === pTime) || null;

          if (d && typeof window.updateLegend === "function") window.updateLegend(d, v, k);
        } else {
          store.isCrosshairActive = false;
          if (store.mainData && store.mainData.length > 0 && typeof window.updateLegend === "function") {
            const lastIdx = store.mainData.length - 1;
            const v = store.volumeData ? store.volumeData[lastIdx] : null;
            const k = store.kimchiData ? store.kimchiData[lastIdx] : null;
            window.updateLegend(store.mainData[lastIdx], v, k);
          }
        }
      } catch (err) { }
    });
  };

  syncCrosshair(store.chart, [{ chart: store.chartVol, series: store.volumeSeries }]);
  syncCrosshair(store.chartVol, [{ chart: store.chart, series: store.candleSeries }]);

  // 🚀 Y축(Price Scale) 가로폭 완벽 동기화 엔진 (좌/우측 스케일 동시 관리)
  const allCharts = [store.chart, store.chartVol].filter(Boolean);
  let maxPriceScaleWidth = 0;
  let maxLeftPriceScaleWidth = 0;
  let isSyncingWidth = false;

  const syncPriceScaleWidths = () => {
    if (isSyncingWidth) return;
    isSyncingWidth = true;

    let maxRight = 0;
    let maxLeft = 0;

    allCharts.forEach((c) => {
      if (c) {
        maxRight = Math.max(maxRight, c.priceScale("right").width());
        maxLeft = Math.max(maxLeft, c.priceScale("left").width());
      }
    });

    if (maxRight > 0 && maxRight > maxPriceScaleWidth) {
      maxPriceScaleWidth = maxRight + 12;
      allCharts.forEach((c) => {
        if (c) c.priceScale("right").applyOptions({ minimumWidth: maxPriceScaleWidth });
      });
    }

    if (maxLeft > 0 && maxLeft > maxLeftPriceScaleWidth) {
      maxLeftPriceScaleWidth = maxLeft + 12;
      allCharts.forEach((c) => {
        if (c) c.priceScale("left").applyOptions({ minimumWidth: maxLeftPriceScaleWidth });
      });
    }

    isSyncingWidth = false;
  };

  allCharts.forEach((c) => {
    if (c) {
      c.timeScale().subscribeSizeChange(syncPriceScaleWidths);
    }
  });

  // 🚀 전역 리셋 함수
  window.resetPriceScaleWidthSync = () => {
    isSyncingWidth = true;
    maxPriceScaleWidth = 0;
    maxLeftPriceScaleWidth = 0;

    allCharts.forEach((c) => {
      if (c) {
        c.priceScale("right").applyOptions({ minimumWidth: 0 });
        c.priceScale("left").applyOptions({ minimumWidth: 0 });
      }
    });

    isSyncingWidth = false;
  };

  // 최초 1회 실행
  window.resetPriceScaleWidthSync();

  initResizers();
  applyChartLayout();

  // 🚀 자 대고 그리는 측정 도구(Measure Tool) 부착
  setTimeout(() => {
    if (typeof window.setupMeasureTool === "function")
      window.setupMeasureTool();
  }, 50);
}

export function updateChartTheme() {
  // 🚀 테마 변경 시 차트를 부수지 않고 색상만 즉각적으로 갈아끼우는 함수
  if (!store.chart) return;

  const style = getComputedStyle(document.body);
  const textColor = style.getPropertyValue("--text").trim() || "#d1d4dc";
  const gridColor = style.getPropertyValue("--border").trim() || "#2a2a22";
  const upColor = style.getPropertyValue("--up").trim() || "#26a69a";
  const downColor = style.getPropertyValue("--down").trim() || "#ef5350";

  // 1. 차트 배경 및 그리드 색상 업데이트
  const commonTheme = {
    layout: { textColor: textColor },
    grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
    rightPriceScale: { borderColor: gridColor },
  };

  store.chart.applyOptions(commonTheme);
  if (store.chartVol) store.chartVol.applyOptions(commonTheme);
  if (store.chartKimchi) store.chartKimchi.applyOptions(commonTheme);

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
