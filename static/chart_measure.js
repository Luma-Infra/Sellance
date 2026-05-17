// chart_measure.js
import { store, tfSec, measureDOM } from "./_store.js";

// 🚀 [Lightweight Charts v5 네이티브 캔버스 플러그인 클래스 정의]
class MeasurePrimitive {
  constructor() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneViews = [new MeasurePaneView(this)];
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
    return store.isMeasuring || store.measureStart ? this._paneViews : [];
  }
  updateAll() {
    if (this._requestUpdate) this._requestUpdate();
  }
}

class MeasurePaneView {
  constructor(source) {
    this._source = source;
  }
  renderer() {
    return new MeasurePaneRenderer(this._source);
  }
}

class MeasurePaneRenderer {
  constructor(source) {
    this._source = source;
  }
  draw(target) {
    if (!store.measureStart || !store._measurePrimitive?._series) return;
    const series = store._measurePrimitive._series;
    const chart = store._measurePrimitive._chart;

    // 🚀 Lightweight Charts v5.2 호환 캔버스 컨텍스트 추출 (Media Coordinate Space 활용)
    const renderFn = (scope) => {
      const ctx = scope.context || scope.ctx || scope;
      ctx.save();

      // 1. 시작 좌표 실시간 변환 (스크롤/줌 완벽 연동)
      let startX = store.measureStart.x;
      if (
        store.measureStart.logical !== null &&
        typeof chart.timeScale().logicalToCoordinate === "function"
      ) {
        const lx = chart
          .timeScale()
          .logicalToCoordinate(store.measureStart.logical);
        if (lx !== null) startX = lx;
      }
      let startY = series.priceToCoordinate(store.measureStart.price);
      if (startY === null) startY = store.measureStart.y;

      // 2. 끝 좌표 실시간 변환
      let endX = startX;
      let endY = startY;
      let curPrice = store.measureStart.price;
      let curLogical = store.measureStart.logical;

      if (store.measureEnd) {
        curPrice = store.measureEnd.price;
        const ey = series.priceToCoordinate(curPrice);
        if (ey !== null) endY = ey;

        if (
          store.measureEnd.logical !== undefined &&
          store.measureEnd.logical !== null &&
          typeof chart.timeScale().logicalToCoordinate === "function"
        ) {
          curLogical = store.measureEnd.logical;
          const ex = chart.timeScale().logicalToCoordinate(curLogical);
          if (ex !== null) endX = ex;
        } else {
          endX = store.measureEnd.x !== undefined ? store.measureEnd.x : startX;
        }
      }

      const priceDiff = curPrice - store.measureStart.price;
      const percentDiff = (priceDiff / store.measureStart.price) * 100;
      const isUp = priceDiff >= 0;
      const tColor = isUp ? "#26a69a" : "#ef5350";
      const tBg = isUp ? "rgba(38,166,154,0.15)" : "rgba(239,83,80,0.15)";

      const leftX = Math.min(startX, endX);
      const topY = Math.min(startY, endY);
      const widthX = Math.max(1, Math.abs(endX - startX));
      const heightY = Math.max(1, Math.abs(endY - startY));

      // 🚀 [캔버스 박스 네이티브 렌더링]
      ctx.fillStyle = tBg;
      ctx.fillRect(leftX, topY, widthX, heightY);
      ctx.strokeStyle = tColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(leftX, topY, widthX, heightY);

      // 🚀 [캔버스 텍스트 네이티브 렌더링]
      let barsDiff = 0;
      if (store.measureStart.logical !== null && curLogical !== null) {
        barsDiff = Math.abs(
          Math.round(curLogical - store.measureStart.logical),
        );
      }
      const p = store.getPrecision(store.currentAsset);
      const formattedDiff =
        typeof window.formatSmartPrice === "function"
          ? window.formatSmartPrice(priceDiff, p)
          : priceDiff.toFixed(p || 2);
      const text1 = `${barsDiff} bars`;
      const text2 = formattedDiff;
      const text3 = `(${isUp ? "+" : ""}${percentDiff.toFixed(2)}%)`;

      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = tColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const centerX = leftX + widthX / 2;
      const centerY = topY + heightY / 2;

      ctx.fillText(text1, centerX, centerY - 14);
      ctx.fillText(text2, centerX, centerY);
      ctx.fillText(text3, centerX, centerY + 14);

      ctx.restore();
      // (DOM 조작 코드는 라이브러리 네이티브 createPriceLine으로 대체되었으므로 완벽 삭제)
    };

    if (typeof target.useMediaCoordinateSpace === "function") {
      target.useMediaCoordinateSpace(renderFn);
    } else {
      renderFn(target);
    }
  }
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

  // 🚀 [추가] 라이브러리 네이티브 커스텀 가격선 완벽 리셋(제거)
  if (store.candleSeries) {
    if (store.measureStartPriceLine) {
      store.candleSeries.removePriceLine(store.measureStartPriceLine);
      store.measureStartPriceLine = null;
    }
    if (store.measureEndPriceLine) {
      store.candleSeries.removePriceLine(store.measureEndPriceLine);
      store.measureEndPriceLine = null;
    }
  }

  if (store._measurePrimitive) {
    store._measurePrimitive.updateAll();
  }
}

export function setupMeasureTool() {
  const container = document.getElementById("pane-main");
  if (!container) return;
  store.cachedChartTd = container.querySelector("td:nth-child(2)");
  store.cachedPriceTd = container.querySelector("td:nth-child(3)");

  if (!store.cachedChartTd || !store.cachedPriceTd) return;

  store.cachedChartTd.style.position = "relative";
  store.cachedPriceTd.style.position = "relative";
  // 기존 DOM 요소는 라이브러리 네이티브 기능으로 대체되므로 DOM 트리에 넣지 않음

  if (store.candleSeries && !store._measurePrimitive) {
    store._measurePrimitive = new MeasurePrimitive();
    store.candleSeries.attachPrimitive(store._measurePrimitive);
  }
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

      if (!store._measurePrimitive) {
        store._measurePrimitive = new MeasurePrimitive();
        store.candleSeries.attachPrimitive(store._measurePrimitive);
      }

      const chartRect = store.cachedChartTd.getBoundingClientRect();
      const sX = e.clientX - chartRect.left;
      const sY = e.clientY - chartRect.top;
      const price = store.candleSeries.coordinateToPrice(sY);
      const rawTime = store.chart.timeScale().coordinateToTime(sX);
      const logical =
        typeof store.chart.timeScale().coordinateToLogical === "function"
          ? store.chart.timeScale().coordinateToLogical(sX)
          : null;

      if (price === null) {
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
        logical: logical,
      };

      // 🚀 [핵심] 라이브러리 네이티브 커스텀 가격선(createPriceLine)으로 시작/끝 가격표 완벽 대체!
      const lineOpts = {
        price: price,
        color: "#26a69a",
        lineWidth: 1,
        lineStyle: window.LightweightCharts
          ? window.LightweightCharts.LineStyle.Dashed
          : 2,
        axisLabelVisible: true,
        axisLabelColor: "#26a69a",
        axisLabelTextColor: "#ffffff",
      };

      if (!store.measureStartPriceLine) {
        store.measureStartPriceLine =
          store.candleSeries.createPriceLine(lineOpts);
      } else {
        store.measureStartPriceLine.applyOptions(lineOpts);
      }
      if (!store.measureEndPriceLine) {
        store.measureEndPriceLine =
          store.candleSeries.createPriceLine(lineOpts);
      } else {
        store.measureEndPriceLine.applyOptions(lineOpts);
      }

      store._measurePrimitive.updateAll();
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
    const curLogical =
      typeof store.chart.timeScale().coordinateToLogical === "function"
        ? store.chart.timeScale().coordinateToLogical(curX)
        : null;

    if (curPrice === null) return;

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

    store.measureEnd = {
      price: curPrice,
      time: curTimeRaw,
      logical: curLogical,
      x: curX,
      y: curY,
    };

    // 🚀 [핵심] 드래그 중 실시간으로 끝 가격선(price) 및 양/음봉 색상(color) 60fps 네이티브 갱신!
    const isUp = curPrice >= store.measureStart.price;
    const tColor = isUp ? "#26a69a" : "#ef5350";

    if (store.measureStartPriceLine) {
      store.measureStartPriceLine.applyOptions({
        color: tColor,
        axisLabelColor: tColor,
      });
    }
    if (store.measureEndPriceLine) {
      store.measureEndPriceLine.applyOptions({
        price: curPrice,
        color: tColor,
        axisLabelColor: tColor,
      });
    }

    if (store._measurePrimitive) {
      store._measurePrimitive.updateAll();
    }
  });

  container.addEventListener("contextmenu", (e) => {
    if (store.measureStart) {
      e.preventDefault();
      stopMeasuring();
    }
  });
}

window.stopMeasuring = stopMeasuring;
window.setupMeasureTool = setupMeasureTool;
window.initMeasureEvents = initMeasureEvents;
