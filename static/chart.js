// chart.js - 순수 차트 엔진 코어
import { store, tfSec, measureDOM } from "./_store.js";
import { fetchHistory } from "./chart_data.js";
import { getUnixSeconds, formatCrosshairPrice } from "./chart_utils.js";

// 🚀 [메인 & 거래량 차트 양방향 100% 대칭 60fps 네이티브 캔버스 십자선 플러그인]
class CanvasCrosshairPrimitive {
  constructor() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._x = null;
    this._paneViews = [new CanvasCrosshairPaneView(this)];
  }
  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }
  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }
  paneViews() {
    return this._x !== null ? this._paneViews : [];
  }
  setX(x) {
    this._x = x;
    if (this._requestUpdate) this._requestUpdate();
  }
}

class CanvasCrosshairPaneView {
  constructor(source) {
    this._source = source;
  }
  renderer() {
    return new CanvasCrosshairPaneRenderer(this._source);
  }
}

class CanvasCrosshairPaneRenderer {
  constructor(source) {
    this._source = source;
  }
  draw(target) {
    if (this._source._x === null) return;
    const x = this._source._x;

    const renderFn = (scope) => {
      const ctx = scope.context || scope.ctx || scope;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#758696";
      ctx.lineCap = "butt"; // 🚀 round의 삐져나옴/뭉침 현상을 제거하고 칼각 도트로 복원!
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash([1, 2]); // 🚀 1픽셀 찍고 2픽셀 쉬는 가장 또렷하고 촘촘한 도트 비율!
      }
      ctx.beginPath();
      // 🚀 x 좌표를 픽셀 경계 중앙(+0.5)으로 강제 정렬
      const exactX = Math.round(x) + 0.5;
      // 🚀 위아래 패널 경계선(Border/Gap)의 미세한 틈새 단절을 없애기 위해 무자비하게 팽창 렌더링!!!
      ctx.moveTo(exactX, -100);
      ctx.lineTo(
        exactX,
        (scope.mediaSize ? scope.mediaSize.height : 500) + 100,
      );
      ctx.stroke();
      ctx.restore();
    };

    if (typeof target.useMediaCoordinateSpace === "function") {
      target.useMediaCoordinateSpace(renderFn);
    } else {
      renderFn(target);
    }
  }
}

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
    crosshair: {
      mode: window.LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: "#758696",
        width: 1,
        style: window.LightweightCharts.LineStyle.Dotted, // 도트 점선 촘촘 모드
        visible: true,
        labelVisible: true,
      },
      horzLine: {
        color: "#758696",
        width: 1,
        style: window.LightweightCharts.LineStyle.Dotted, // 도트 점선 촘촘 모드
        visible: true,
        labelVisible: true,
      },
    },
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
      // entireTextOnly: true,
    },
  });

  // 2. 볼륨 차트 (좌측 김프, 우측 거래량 스케일 동시 적용)
  store.chartVol = window.LightweightCharts.createChart(elVol, {
    ...commonOptions,
    timeScale: {
      ...commonOptions.timeScale,
      borderColor: "transparent", // 🚀 [하단 테두리 박멸] 볼륨 캔버스 하단의 진한 테두리 선 투명화
    },
    rightPriceScale: {
      autoScale: true,
      visible: true,
      borderColor: gridColor,
      scaleMargins: { top: 0.5, bottom: 0 },
    },
    leftPriceScale: {
      autoScale: true,
      visible: true,
      borderColor: "transparent", // 🚀 [좌측 테두리 박멸] 메인 차트와 동일하게 좌측 테두리 선 투명화
      scaleMargins: { top: 0.1, bottom: 0.1 },
    },
  });

  // 🚀 사용자가 차트 줌/패닝을 직접 조작했음을 감지하는 이벤트 리스너 부착
  store.chart.timeScale().subscribeVisibleTimeRangeChange(() => {
    store.isUserZoomed = true;
  });

  // 🚀 DOM 이벤트 기반 activeChart 제어 제거 (라이브러리 내부 이벤트로 100% 통합 제어)

  const p = store.getPrecision(store.currentAsset);
  const customPriceFormat = {
    type: "custom",
    precision: p,
    minMove: p > 0 ? Number((1 / Math.pow(10, p)).toFixed(p)) : 1,
    formatter: (price) => formatCrosshairPrice(price, p, false),
  };
  const leftPriceFormat = {
    type: "custom",
    precision: p,
    minMove: p > 0 ? Number((1 / Math.pow(10, p)).toFixed(p)) : 1,
    formatter: (price) => formatCrosshairPrice(price, p, true),
  };

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
      priceFormat: customPriceFormat,
    },
  );

  // 🚀 좌측 스케일 전용 등락률 및 가격차이 표시 보조 시리즈
  store.leftScaleSeries = store.chart.addSeries(
    window.LightweightCharts.LineSeries,
    {
      priceScaleId: "left",
      color: "transparent",
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: leftPriceFormat,
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
      priceFormat: customPriceFormat,
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
    },
  );

  // 🚀 [메인 & 거래량 차트 양방향 대칭 십자선 플러그인 초기화 및 부착]
  if (store.candleSeries && !store._mainCrosshair) {
    store._mainCrosshair = new CanvasCrosshairPrimitive();
    store.candleSeries.attachPrimitive(store._mainCrosshair);
  }
  if (store.volumeSeries && !store._volCrosshair) {
    store._volCrosshair = new CanvasCrosshairPrimitive();
    store.volumeSeries.attachPrimitive(store._volCrosshair);
  }

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

  // 🎯 십자선 크로스헤어 완벽 동기화 엔진 (레이스 컨디션 원천 차단 무적 알고리즘)
  const syncCrosshair = (sourceChart, targetCharts) => {
    sourceChart.subscribeCrosshairMove((param) => {
      try {
        const isHover =
          param.point !== undefined && param.point.x >= 0 && param.point.y >= 0;

        if (isHover) {
          // 🚀 1. 현재 마우스가 올라간 차트를 무조건 activeChart로 강제 승격!
          store.activeChart = sourceChart;

          // 🚀 2. 내 차트(sourceChart)의 가로선(horzLine) 및 라벨은 켜되, 내장 세로선(vertLine)은 투명하게 끈다! (캔버스 플러그인이 대체)
          if (sourceChart._isSource !== true) {
            sourceChart.applyOptions({
              crosshair: {
                vertLine: {
                  visible: false, // 🚨 내장 세로선 은폐 (세로선 2개 겹침 방지!)
                  labelVisible: true, // ⏰ 하단 시간축 라벨은 유지!
                  style: window.LightweightCharts.LineStyle.Dotted,
                },
                horzLine: {
                  visible: true, // 👈 마우스가 있는 곳의 가로선은 켠다!
                  labelVisible: true,
                  style: window.LightweightCharts.LineStyle.Dotted,
                },
              },
            });
            sourceChart._isSource = true;
            sourceChart._isTarget = false;
          }

          // 🚀 3. 자석 마그넷 효과 계산 (과거 캔들 + 미래 허공 완벽 통합 스냅)
          let magnetX = param.point.x;
          if (
            param.time !== undefined &&
            typeof sourceChart.timeScale().timeToCoordinate === "function"
          ) {
            const cx = sourceChart.timeScale().timeToCoordinate(param.time);
            if (cx !== null) magnetX = cx;
          } else if (
            typeof sourceChart.timeScale().coordinateToLogical === "function" &&
            typeof sourceChart.timeScale().logicalToCoordinate === "function"
          ) {
            const logical = sourceChart
              .timeScale()
              .coordinateToLogical(param.point.x);
            if (logical !== null) {
              const snapX = sourceChart
                .timeScale()
                .logicalToCoordinate(Math.round(logical));
              if (snapX !== null) magnetX = snapX;
            }
          }

          // 🚀 4. [핵심] 원본 차트(sourceChart) 캔버스 플러그인 세로선 다이렉트 렌더링! (메인 차트 세로선 누락 원천 차단!!!)
          if (sourceChart === store.chart && store._mainCrosshair) {
            store._mainCrosshair.setX(magnetX);
          } else if (sourceChart === store.chartVol && store._volCrosshair) {
            store._volCrosshair.setX(magnetX);
          }

          // 🚀 5. 타겟 차트들 처리 (내장 세로선/가로선 은폐, 하단 시간축 라벨 유지, 캔버스 플러그인 단독 렌더링!)
          let targetTime = param.time;

          // 🚀 [원인 완벽 규명 및 해결: 미래 캔들 영역 타임스탬프 증발 방어]
          // 미래 허공(우측 여백)에 마우스를 올렸을 때 param.time은 undefined가 떨어집니다.
          // 기존에는 coordinateToTime(x)만 시도했으나, 미래 영역에서는 이것도 null을 반환합니다.
          // 이제 마우스 좌표를 논리적 인덱스(logical)로 변환한 뒤 미래 시간을 직접 역산(Extrapolation)하여 하단 라벨을 완벽히 살려냅니다!
          if (targetTime === undefined) {
            let logicalIndex = null;
            if (
              typeof sourceChart.timeScale().coordinateToLogical === "function"
            ) {
              logicalIndex = sourceChart
                .timeScale()
                .coordinateToLogical(param.point.x);
            }
            if (logicalIndex !== null) {
              const roundedLogical = Math.round(logicalIndex);
              const totalCandles = store.mainData ? store.mainData.length : 0;

              if (totalCandles > 0 && roundedLogical >= totalCandles - 1) {
                // 미래 영역: 마지막 캔들 시간 + (남은 캔들 개수 * 초 단위)
                const lastCandle = store.mainData[totalCandles - 1];
                const secondsPerBar = tfSec[store.currentTF] || 60;
                const futureBars = roundedLogical - (totalCandles - 1);
                targetTime = lastCandle.time + futureBars * secondsPerBar;
              } else if (
                typeof sourceChart.timeScale().coordinateToTime === "function"
              ) {
                // 과거/현재 영역 폴백
                targetTime = sourceChart
                  .timeScale()
                  .coordinateToTime(param.point.x);
              }
            }
          }

          targetCharts.forEach((targetObj) => {
            const { chart: tChart, series: tSeries } = targetObj;
            if (tChart) {
              if (tChart !== sourceChart && tChart._isTarget !== true) {
                tChart.applyOptions({
                  crosshair: {
                    horzLine: { visible: false, labelVisible: false }, // 타겟 차트 가로선 끔
                    vertLine: { visible: false, labelVisible: true }, // 내장 세로선 끔, 하단 시간 라벨 켬
                  },
                });
                tChart._isTarget = true;
                tChart._isSource = false;
              }

              // 🚀 1. 먼저 원격 십자선 이동 API를 호출하여 라이브러리 내부 상태 및 하단 타임스탬프 라벨 위치를 확정 짓는다!
              if (
                tChart !== sourceChart &&
                targetTime !== undefined &&
                targetTime !== null
              ) {
                try {
                  tChart.setCrosshairPosition(NaN, targetTime);
                } catch (e) {}
              }

              // 🚀 2. [핵심] 타겟 차트(tChart) 캔버스 플러그인 점선 최종 렌더링! (거래량 차트 세로선 누락 원천 차단!!!)
              if (tChart === store.chartVol && store._volCrosshair) {
                store._volCrosshair.setX(magnetX);
              } else if (tChart === store.chart && store._mainCrosshair) {
                store._mainCrosshair.setX(magnetX);
              }
            }
          });

          // 🚀 5. 레전드 업데이트 등 기존 로직 유지
          if (
            sourceChart === store.chart &&
            store.candleSeries &&
            typeof store.candleSeries.coordinateToPrice === "function"
          ) {
            store.crosshairPrice = store.candleSeries.coordinateToPrice(
              param.point.y,
            );
            if (
              store.leftScaleSeries &&
              typeof store.leftScaleSeries.coordinateToPrice === "function"
            ) {
              store.crosshairLeftPrice =
                store.leftScaleSeries.coordinateToPrice(param.point.y);
            }
          }
          store.isCrosshairActive = true;
          // 🚀 [미래 타임스탬프 완벽 연동] param.time이 undefined일 때, 위에서 역산한 targetTime(미래 시간)을 십자선 시간으로 사용!
          const activeTime = param.time !== undefined ? param.time : targetTime;
          const pTime = getUnixSeconds(activeTime);

          let d = null;
          if (sourceChart === store.chart) {
            d = param.seriesData.get(store.candleSeries);
            // 🚀 [완벽 폴백 보강] 라이브러리 내부 캔들 구조체(d)에는 volume 필드가 없으므로, 원본 메인 장부(store.mainData)에서 찾아 volume을 주입합니다!
            const mainCandle = store.mainData?.find(
              (item) => item.time === pTime,
            );
            if (d && mainCandle && mainCandle.volume !== undefined) {
              d.volume = mainCandle.volume;
            } else if (!d && mainCandle) {
              // 🚀 [미래 캔들 폴백] param.seriesData에 없어도(허공) mainData에 있으면 강제 표시!
              d = { ...mainCandle };
            }
          } else {
            d = store.mainData?.find((item) => item.time === pTime) || null;
          }
          const v =
            store.volumeData?.find((item) => item.time === pTime) || null;
          const k =
            store.kimchiData?.find((item) => item.time === pTime) || null;
          if (d && typeof window.updateLegend === "function") {
            window.updateLegend(d, v, k);
          } else if (typeof window.updateStatus === "function") {
            // 허공일 때는 현재 활성 가격(updateStatus)으로 복구!
            window.updateStatus();
          }
        } else {
          // 🚀 [핵심 방어책] isHover === false 일 때, 현재 activeChart가 내 차트(sourceChart)인 경우에만 초기화 실행!!!
          // (즉, 마우스가 다른 차트로 넘어갔을 때는 이전 차트의 else 블록이 방해하지 못하도록 원천 차단!!!)
          if (store.activeChart === sourceChart) {
            store.activeChart = null;
            if (sourceChart === store.chart) {
              store.crosshairPrice = null;
              store.crosshairLeftPrice = null;
            }
            targetCharts.forEach((targetObj) => {
              if (targetObj.chart) targetObj.chart.clearCrosshairPosition();
              if (store._volCrosshair) store._volCrosshair.setX(null);
              if (store._mainCrosshair) store._mainCrosshair.setX(null);
            });
            store.isCrosshairActive = false;
            if (
              store.mainData &&
              store.mainData.length > 0 &&
              typeof window.updateLegend === "function"
            ) {
              const lastIdx = store.mainData.length - 1;
              const v = store.volumeData ? store.volumeData[lastIdx] : null;
              const k = store.kimchiData ? store.kimchiData[lastIdx] : null;
              window.updateLegend(store.mainData[lastIdx], v, k);
            }
          }
        }
      } catch (err) {}
    });
  };

  syncCrosshair(store.chart, [
    { chart: store.chartVol, series: store.volumeSeries },
  ]);
  syncCrosshair(store.chartVol, [
    { chart: store.chart, series: store.candleSeries },
  ]);

  // 🚀 Y축(Price Scale) 가로폭 완벽 동기화 엔진 (좌/우측 스케일 동시 관리)
  let currentMaxRight = 0;
  let currentMaxLeft = 0;
  window.isResettingWidth = false; // 🚀 [레이스 컨디션 방어 락] 리셋 중 이벤트 폭주 원천 차단!

  window.syncPriceScaleWidths = () => {
    if (window.isResettingWidth) return; // 🚨 리셋 피팅(fitContent) 중에는 라이브러리 과거 너비 조회를 원천 차단!
    const charts = [store.chart, store.chartVol].filter(Boolean);
    let maxRight = 0;
    let maxLeft = 0;

    charts.forEach((c) => {
      maxRight = Math.max(maxRight, c.priceScale("right").width());
      maxLeft = Math.max(maxLeft, c.priceScale("left").width());
    });

    // 🚀 [초고속 캐시 방어벽] 너비가 이전과 동일하면 applyOptions 호출을 원천 스킵하여 60fps 렌더링 성능 100% 보장!
    if (maxRight > 0 && maxRight !== currentMaxRight) {
      currentMaxRight = maxRight;
      charts.forEach((c) =>
        c.priceScale("right").applyOptions({ minimumWidth: maxRight }),
      );
    }
    if (maxLeft > 0 && maxLeft !== currentMaxLeft) {
      currentMaxLeft = maxLeft;
      charts.forEach((c) =>
        c.priceScale("left").applyOptions({ minimumWidth: maxLeft }),
      );
    }
  };

  const allCharts = [store.chart, store.chartVol].filter(Boolean);
  allCharts.forEach((c) => {
    // 🚀 창 크기 변경뿐만 아니라, 줌인/줌아웃, 좌우 스크롤(VisibleLogicalRangeChange) 및 마우스 이동 시에도 실시간 자동 싱크!
    c.timeScale().subscribeSizeChange(() =>
      setTimeout(window.syncPriceScaleWidths, 50),
    );
    c.timeScale().subscribeVisibleLogicalRangeChange(
      window.syncPriceScaleWidths,
    );
    c.subscribeCrosshairMove(window.syncPriceScaleWidths);
  });

  // 🚀 전역 리셋 함수 (데이터 로드 전 초기화 및 로드 후 자동 싱크 보장)
  window.resetPriceScaleWidthSync = () => {
    window.isResettingWidth = true; // 🚨 락 활성화!
    currentMaxRight = 0;
    currentMaxLeft = 0;
    allCharts.forEach((c) => {
      c.priceScale("right").applyOptions({ minimumWidth: 0, autoScale: true });
      c.priceScale("left").applyOptions({ minimumWidth: 0, autoScale: true });
    });

    // 🚀 브라우저 렌더링 사이클(Repaint)이 완벽히 끝나 라이브러리 내부 width()가 순수하게 줄어든 150ms 뒤에 락 해제 및 최종 싱크!
    setTimeout(() => {
      window.isResettingWidth = false;
      window.syncPriceScaleWidths();
    }, 150);
  };

  window.resetPriceScaleWidthSync();

  // 🚀 차트 마우스 우클릭 시 전체 차트(메인+볼륨)를 병합한 고화질 캡처 이미지를 클립보드 복사 가능하도록 img 오버레이 생성
  const wrapper = document.getElementById("chart-wrapper");
  if (wrapper) {
    if (window._chartRightClickListener) {
      wrapper.removeEventListener("mousedown", window._chartRightClickListener);
    }
    
    window._chartRightClickListener = (e) => {
      if (e.button !== 2) return; // 마우스 우클릭만 처리
      if (store.isMeasuring || store.measureStart) return; // 🚀 측정 중에는 이미지 오버레이 방지 (측정 취소 로직에 양보)
      if (!store.chart) return;

      const mainCanvas = store.chart.takeScreenshot();
      const paneVol = document.getElementById("pane-vol");
      const isVolVisible = paneVol && !paneVol.classList.contains("hidden");
      const volCanvas = isVolVisible && store.chartVol ? store.chartVol.takeScreenshot() : null;

      if (!mainCanvas) return;

      const combinedCanvas = document.createElement("canvas");
      const ctx = combinedCanvas.getContext("2d");

      const width = mainCanvas.width;
      let height = mainCanvas.height;
      if (volCanvas) {
        height += volCanvas.height;
      }

      combinedCanvas.width = width;
      combinedCanvas.height = height;

      // 배경색 채우기
      const bgColor = getComputedStyle(wrapper).backgroundColor || "#131722";
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // 드로잉
      ctx.drawImage(mainCanvas, 0, 0);
      if (volCanvas) {
        ctx.drawImage(volCanvas, 0, mainCanvas.height);
      }

      // 심볼 워터마크 추가
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "bold 16px sans-serif";
      const symbolText = (store.currentSelectedSymbol || "Sellnance").toUpperCase();
      ctx.fillText(symbolText, 20, 30);

      let overlayImg = document.getElementById("chart-screenshot-overlay");
      if (!overlayImg) {
        overlayImg = document.createElement("img");
        overlayImg.id = "chart-screenshot-overlay";
        overlayImg.style.cssText = "position: absolute; left: 0; top: 0; width: 100%; height: 100%; opacity: 0.01; z-index: 999999; pointer-events: auto;";
        wrapper.appendChild(overlayImg);
      }

      overlayImg.src = combinedCanvas.toDataURL("image/png");
      overlayImg.style.pointerEvents = "auto";

      const clearOverlay = () => {
        overlayImg.style.pointerEvents = "none";
        overlayImg.removeAttribute("src");
        document.removeEventListener("mousemove", clearOverlay);
        document.removeEventListener("mousedown", clearOverlay);
      };

      setTimeout(() => {
        document.addEventListener("mousemove", clearOverlay);
        document.addEventListener("mousedown", clearOverlay);
      }, 300);
    };

    wrapper.addEventListener("mousedown", window._chartRightClickListener);
  }

  // 🚀 차트 스케일 리셋(더블클릭) 시 이전 넓이의 저주를 풀고 즉시 0으로 리셋 후 재계산 연동!
  [elMain, elVol].forEach((el) => {
    if (el) el.addEventListener("dblclick", window.resetPriceScaleWidthSync);
  });

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

  // Update caches
  store.upColorCache = upColor;
  store.downColorCache = downColor;

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

    const isDayUnit = !(store.currentTF || "1h").match(/[hm]/);
    const mapTime = (d) => {
      if (isDayUnit) {
        if (typeof d.time === "string" && d.time.includes("-")) return d;
        const numTime = Number(d.time);
        if (isNaN(numTime)) return d;
        const dt = new Date(numTime * 1000);
        return {
          ...d,
          time: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`,
        };
      } else {
        if (typeof d.time === "string" && d.time.includes("-")) {
          const parsedUnix = Math.floor(new Date(d.time).getTime() / 1000);
          return { ...d, time: isNaN(parsedUnix) ? d.time : parsedUnix };
        }
        return d;
      }
    };

    store.volumeSeries.setData(store.volumeData.map(mapTime));
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
