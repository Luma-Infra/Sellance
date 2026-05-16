// chart_measure.js
import { store, tfSec, measureDOM } from './_store.js';

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

window.stopMeasuring = stopMeasuring;
window.setupMeasureTool = setupMeasureTool;
window.initMeasureEvents = initMeasureEvents;
