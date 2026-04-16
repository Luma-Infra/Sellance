// _main.js

// --- 🚀 초기화 (Init) ---
window.onload = () => {
  initChart();
  initMeasureEvents();
  initInfiniteScroll(); // 🚀 무한 스크롤 센서 가동!
  initSniperSocket(); // 🚀 스나이퍼 센서 가동

  if (typeof startGlobalMarketRadar === "function") startGlobalMarketRadar();
  if (typeof loadSymbols === "function") loadSymbols();
  // if (typeof selectSymbol === "function") selectSymbol("BTC");

  // 슬라이더 이벤트 바인딩
  ["body", "top", "bottom"].forEach((id) => {
    const inputEl = document.getElementById("input-" + id);
    if (inputEl) {
      inputEl.oninput = () => {
        const val = inputEl.value;
        document.getElementById("val-" + id).innerText = val + "%";
        if (id === "body") {
          if (curDir === "bull") bullBody = val;
          else bearBody = val;
        }
        updateStatus();
        if (isHover && typeof updatePreview === "function") updatePreview();
      };
    }
  });

  const genBtn = document.getElementById("btn-generate");
  if (genBtn) {
    genBtn.onmouseenter = () => {
      isHover = true;
      if (typeof updatePreview === "function") updatePreview();
    };
    genBtn.onmouseleave = () => {
      isHover = false;
      previewSeries.setData([]);
    };
  }
};

// --- 🎨 차트 렌더링 및 UI ---
// ⚙️ 차트 설정 전역 변수 (여기만 수정하면 전체 적용됨)
const CHART_CONFIG = {
  GHOST_COUNT: 500, // 미래 유령 캔들 개수
  VISIBLE_COUNT: 100, // 화면에 보여줄 과거 캔들 개수
  RIGHT_PADDING: 10, // 우측 여백 칸 수
};
// ⚙️ 2. 시간 변환 통합 헬퍼 (전역으로 이동!)
// 이제 initChart와 startRealtimeCandle 양쪽에서 모두 사용 가능합니다.
const getUnixSeconds = (t) => {
  if (typeof t === "object" && t !== null)
    return new Date(t.year, t.month - 1, t.day).getTime() / 1000;
  if (typeof t === "string") return new Date(t).getTime() / 1000;
  return t;
};
function initChart() {
  const container = document.getElementById("chart-container");
  if (chart) chart.remove();

  const isDark = currentTheme === "binance" || currentTheme === "upbit-dark";
  const upColor = currentTheme === "binance" ? "#26a69a" : "#c84a31";
  const downColor = currentTheme === "binance" ? "#ef5350" : "#1261c4";

  chart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: {
        color: getComputedStyle(document.body).getPropertyValue("--bg").trim(),
      },
      textColor: getComputedStyle(document.body)
        .getPropertyValue("--text")
        .trim(),
    },
    grid: {
      vertLines: { color: isDark ? "#2a2e39" : "#f1f1f4" },
      horzLines: { color: isDark ? "#2a2e39" : "#f1f1f4" },
    },
    timeScale: {
      borderColor: isDark ? "#2a2e39" : "#d5d6dc",
      timeVisible: true,
      secondsVisible: false,
      fixRightEdge: false,
      tickMarkFormatter: (time, tickMarkType) => {
        const d = new Date(getUnixSeconds(time) * 1000);
        if (isNaN(d.getTime())) return "";

        // 🚀 핵심: tickMarkType이 'Year'(0)이면 연도를 최우선으로 반환
        // LightweightCharts.TickMarkType.Year 값은 보통 0입니다.
        if (tickMarkType === 0) {
          return `${d.getFullYear()}년`;
        }

        const isDayUnit = !(currentTF || "1h").match(/[hm]/);

        if (isDayUnit) {
          // 일봉 이상: 연도 첫날이 아니면 '월/일' 표시
          return `${d.getMonth() + 1}/${d.getDate()}`;
        } else {
          // 분/시간봉: '시:분' 표시
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

        // 🚀 십자선(Crosshair) 라벨도 동일한 규칙 적용
        if ((currentTF || "1h").match(/[hm]/)) {
          return `${y}-${m}-${date} ${h}:${min}`;
        } else {
          return `${y}-${m}-${date}`;
        }
      },
    },
    rightPriceScale: {
      visible: true,
      borderColor: isDark ? "#2a2e39" : "#d5d6dc",
      mode: isLogMode ? 1 : 0,
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
  });

  // 🚀 1. 공통 커스텀 가격 포맷 설정 (함수 추가 없이 기존 formatSmartPrice 재활용!)
  const customPriceFormat = {
    type: "custom",
    minMove: 0.00000001, // 동전주(최대 소수점 8자리)까지 눈금을 허용하도록 족쇄 해제
    formatter: (price) => formatSmartPrice(price), // Y축 숫자를 그릴 때마다 기존 함수 통과
  };

  candleSeries = chart.addCandlestickSeries({
    upColor,
    downColor,
    borderUpColor: upColor,
    borderDownColor: downColor,
    wickUpColor: upColor,
    wickDownColor: downColor,
    priceFormat: customPriceFormat, // 👈 여기 추가
  });

  previewSeries = chart.addCandlestickSeries({
    upColor: upColor + "4D",
    downColor: downColor + "4D",
    borderVisible: false,
    wickVisible: false,
    priceFormat: customPriceFormat, // 👈 여기 추가
  });

  chart.subscribeCrosshairMove((p) => {
    if (p.time) {
      const d = p.seriesData.get(candleSeries);
      if (d) updateLegend(d);
    } else if (mainData.length) {
      updateLegend(mainData[mainData.length - 1]);
    }
  });

  // 🚀 설정 변수를 활용한 유령 데이터 렌더링
  if (mainData.length > 1) {
    const lastTime = getUnixSeconds(mainData[mainData.length - 1].time);
    const interval =
      lastTime - getUnixSeconds(mainData[mainData.length - 2].time);

    // 🚀 전역 변수 적용
    const ghostData = Array.from(
      { length: CHART_CONFIG.GHOST_COUNT },
      (_, i) => ({
        time: lastTime + interval * (i + 1),
      }),
    );

    candleSeries.setData([...mainData, ...ghostData]);

    // VISIBLE_COUNT, RIGHT_PADDING 변수 사용
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, mainData.length - CHART_CONFIG.VISIBLE_COUNT),
      to: mainData.length + CHART_CONFIG.RIGHT_PADDING,
    });
  } else if (mainData.length === 1) {
    candleSeries.setData(mainData);
    autoFit();
  }

  updateStatus();

  // 측정 도구 세팅
  setTimeout(setupMeasureTool, 0);

  // 🚀 [여기에 추가!!!] 차트 그려진 직후에 카운트다운 DOM 세팅!
  setTimeout(setupCountdownDOM, 0);

  // 리사이즈 옵저버 디바운스
  if (window.chartResizeObserver) window.chartResizeObserver.disconnect();

  let resizeTimeout;
  window.chartResizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (!width || !height) return;

    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => chart?.resize(width, height), 10);
  });
  window.chartResizeObserver.observe(container);
}

function setTF(tf) {
  const isSimMode = document
    .getElementById("tab-btn-sim")
    .classList.contains("active");
  if (isSimMode) {
    Swal.fire({
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

function executeSetTF(tf) {
  currentTF = tf;
  document.querySelectorAll(".tf-btn").forEach((b) => {
    const onClickAttr = b.getAttribute("onclick") || "";
    // 1. 현재 버튼이 클릭된 타임프레임(tf)과 일치하는지 확인
    const isMatch = onClickAttr.includes(`'${tf}'`);

    // 2. active 클래스 토글
    b.classList.toggle("active", isMatch);

    // 3. 투명도 조절 (Tailwind 기준) - 반드시 루프 안에서 실행!
    b.classList.toggle("opacity-100", isMatch);
    b.classList.toggle("opacity-50", !isMatch);
  });

  // 4. 차트 데이터 갱신 함수 호출
  if (typeof fetchHistory === "function") fetchHistory();
}

function toggleLogScale() {
  isLogMode = !isLogMode;
  const btn = document.getElementById("log-btn");
  if (btn) {
    btn.innerText = isLogMode ? "Log ON" : "Log Off";
    btn.classList.toggle("active", isLogMode);
  }
  chart.priceScale("right").applyOptions({ mode: isLogMode ? 1 : 0 });
}

function updatePreview() {
  if (mainData.length && isHover && typeof getNext === "function")
    previewSeries.setData([getNext()]);
}

function stopMeasuring() {
  isMeasuring = false;
  measureStart = null;
  measureEnd = null;
  [measureBox, startPriceLabel, endPriceLabel, priceRangeBar].forEach((el) => {
    el.style.display = "none";
    el.innerText = "";
  });
}

// --- 🚀 2. 렌더링 시 DOM만 다시 붙여주는 함수 (initChart 내부에서 호출) ---
function setupMeasureTool() {
  const container = document.getElementById("chart-container");
  cachedChartTd = container.querySelector("td:nth-child(2)");
  cachedPriceTd = container.querySelector("td:nth-child(3)");

  if (!cachedChartTd || !cachedPriceTd) return;

  cachedChartTd.style.position = "relative";
  cachedPriceTd.style.position = "relative";
  cachedChartTd.appendChild(measureBox);
  cachedPriceTd.appendChild(priceRangeBar);
  cachedPriceTd.appendChild(startPriceLabel);
  cachedPriceTd.appendChild(endPriceLabel);
}

// --- ⚡ 3. 마우스 이벤트 (단 한 번만 실행되도록 분리) ---
function initMeasureEvents() {
  const container = document.getElementById("chart-container");

  container.addEventListener("mousedown", (e) => {
    // 🚀 매번 찾지 않고 캐싱된 DOM 사용
    if (!cachedChartTd || !cachedPriceTd || !chart || !candleSeries) return;

    const rect = container.getBoundingClientRect();
    if (e.clientX - rect.left > rect.width - (cachedPriceTd.clientWidth || 60))
      return;

    if (e.shiftKey && e.button === 0) {
      stopMeasuring();
      isMeasuring = true;

      const chartRect = cachedChartTd.getBoundingClientRect();
      const sX = e.clientX - chartRect.left;
      const sY = e.clientY - chartRect.top;
      const price = candleSeries.coordinateToPrice(sY);

      measureStart = {
        x: sX,
        y: sY,
        price: price,
        time: chart.timeScale().coordinateToTime(sX),
      };

      // 초기화 및 노출
      measureBox.style.cssText += `left: ${sX}px; top: ${sY}px; width: 0px; height: 0px; display: flex;`;
      priceRangeBar.style.cssText += `top: ${sY}px; height: 0px; display: block;`;
      startPriceLabel.style.cssText += `top: ${sY - 10}px; display: block;`;
      endPriceLabel.style.cssText += `top: ${sY - 10}px; display: block;`;

      measureBox.innerText = "";
      startPriceLabel.innerText = formatSmartPrice(price);
      endPriceLabel.innerText = formatSmartPrice(price);
      e.preventDefault();
    } else if (e.button === 0 && isMeasuring) {
      isMeasuring = false;
    } else if (!e.shiftKey && !isMeasuring && measureStart) {
      stopMeasuring();
    }
  });

  container.addEventListener("mousemove", (e) => {
    if (!isMeasuring || !measureStart || !cachedChartTd || !candleSeries)
      return;

    const chartRect = cachedChartTd.getBoundingClientRect();
    const curX = e.clientX - chartRect.left;
    const curY = e.clientY - chartRect.top;

    const curPrice = candleSeries.coordinateToPrice(curY);
    const curTime = chart.timeScale().coordinateToTime(curX);
    if (curPrice === null || curTime === null) return;

    measureEnd = { price: curPrice, time: curTime };

    // 🚀 실시간 좌표 역산
    const startX = chart.timeScale().timeToCoordinate(measureStart.time);
    const startY = candleSeries.priceToCoordinate(measureStart.price);
    if (startX === null || startY === null) return;

    const priceDiff = curPrice - measureStart.price;
    const percentDiff = (priceDiff / measureStart.price) * 100;
    const isUp = priceDiff >= 0;
    const tColor = isUp ? "var(--up, #26a69a)" : "var(--down, #ef5350)";
    const tBg = isUp ? "rgba(38,166,154,0.15)" : "rgba(239,83,80,0.15)";

    const topY = Math.min(startY, curY),
      heightY = Math.max(0.5, Math.abs(curY - startY));
    const leftX = Math.min(startX, curX),
      widthX = Math.abs(curX - startX);

    measureBox.style.cssText += `left: ${leftX}px; top: ${topY}px; width: ${widthX}px; height: ${heightY}px; border-color: ${tColor}; background-color: ${tBg}; color: ${tColor};`;
    priceRangeBar.style.cssText += `top: ${topY}px; height: ${heightY}px; background-color: ${tBg};`;
    startPriceLabel.style.cssText += `top: ${startY - 10}px; background-color: ${tColor};`;
    endPriceLabel.style.cssText += `top: ${curY - 10}px; background-color: ${tColor};`;
    endPriceLabel.innerText = formatSmartPrice(curPrice);

    const barsDiff = Math.abs(
      Math.round((curTime - measureStart.time) / (tfSec[currentTF] || 86400)),
    );
    measureBox.innerText = `${barsDiff} bars\n${formatSmartPrice(priceDiff)}\n(${isUp ? "+" : ""}${percentDiff.toFixed(2)}%)`;
  });

  container.addEventListener("contextmenu", (e) => {
    if (measureStart) {
      e.preventDefault();
      stopMeasuring();
    }
  });
}

function toggleCountdown(isChecked) {
  showCountdown = isChecked;
  const knob = document.getElementById("countdown-knob");

  // UI 토글 애니메이션
  if (isChecked) {
    knob.style.transform = "translateX(10px)";
    knob.parentElement.classList.add("bg-theme-accent");
    if (countdownOverlay) countdownOverlay.style.display = "block";
  } else {
    knob.style.transform = "translateX(0)";
    knob.parentElement.classList.remove("bg-theme-accent");
    if (countdownOverlay) countdownOverlay.style.display = "none";
  }
}

// _main.js 빈 곳에 추가 (기존 updateCountdownPosition이 있다면 덮어쓰기)
function updateRealtimeCountdown(serverMs) {
  if (
    !showCountdown ||
    !countdownOverlay ||
    !candleSeries ||
    mainData.length === 0
  ) {
    if (countdownOverlay) countdownOverlay.style.opacity = "0";
    return;
  }

  // 1. 서버 시간 기반으로 남은 시간 텍스트 계산
  const timeText = calculateTimeRemaining(currentTF, serverMs);
  if (!timeText) {
    countdownOverlay.style.opacity = "0";
    return;
  }

  // 2. 현재 봉 상태 가져오기
  const lastCandle = mainData[mainData.length - 1];
  const { open, close } = lastCandle;

  // 3. 색상 및 위치 계산
  const bgCol = close < open ? "var(--down)" : "var(--up)";
  const yCoordinate = candleSeries.priceToCoordinate(close);

  // 4. DOM 업데이트 (단 한 번의 Reflow만 발생)
  if (yCoordinate !== null) {
    countdownOverlay.innerText = timeText;
    countdownOverlay.style.backgroundColor = bgCol;
    countdownOverlay.style.color = "white";
    countdownOverlay.style.borderRadius = "2px";
    countdownOverlay.style.transform = `translateY(${yCoordinate + 15}px)`;
    countdownOverlay.style.opacity = "1";
  } else {
    countdownOverlay.style.opacity = "0";
  }
}

function setupCountdownDOM() {
  const container = document.getElementById("chart-container");
  // 🚀 형님이 찾으신 명당 자리 (우측 가격 축)
  const priceScaleTd = container.querySelector(
    "div.tv-lightweight-charts table tr:nth-child(1) td:nth-child(3)",
  );

  if (!priceScaleTd) {
    // 차트가 아직 안 그려졌으면 50ms 뒤에 재시도
    setTimeout(setupCountdownDOM, 50);
    return;
  }

  priceScaleTd.style.position = "relative";

  if (!countdownOverlay) {
    countdownOverlay = document.createElement("div");
  }

  // 🚀 [핵심] 스타일 재설정: top: 0과 z-index가 생명입니다.
  countdownOverlay.style.cssText = `
    position: absolute;
    top: 0;                /* 🚨 절대 경로 기준점 */
    left: 0;
    width: 100%;
    text-align: center;
    color: white;          /* 글자는 화이트 */
    background-color: var(--up); /* 초기값 up색 */
    padding: 2px 0;
    font-size: 12px;
    font-family: monospace;
    font-weight: bold;
    z-index: 10000;        /* 🚨 최상단 레이어 보장 */
    pointer-events: none;
    opacity: 0;            /* 데이터 오기 전까지 대기 */
    transition: transform 0.1s ease-out;
    font-variant-numeric: tabular-nums;
    border-radius: 10px;
  `;

  priceScaleTd.appendChild(countdownOverlay);
}
