// chart.js
// 🚀 [추가] 차트 패널 (볼륨, 김프) 토글 관리자
window.paneConfig = { volume: true, kimchi: true };

function togglePane(paneName) {
  window.paneConfig[paneName] = !window.paneConfig[paneName];
  applyChartLayout();
}

function applyChartLayout() {
  if (!chart || !chartVol || !chartKimchi) return;

  const v = window.paneConfig.volume;
  // kimchiData가 전역 변수인지 확인하세요!
  const k =
    window.paneConfig.kimchi &&
    window.kimchiData &&
    window.kimchiData.length > 0;

  const elVol = document.getElementById("pane-vol");
  const elKimchi = document.getElementById("pane-kimchi");

  // 1. HTML 엘리먼트 노출 제어 (hidden 클래스 제거 및 display 설정)
  if (elVol) {
    elVol.classList.remove("hidden");
    elVol.style.display = v ? "block" : "none";
  }
  if (elKimchi) {
    elKimchi.classList.remove("hidden");
    elKimchi.style.display = k ? "block" : "none";
  }

  // 2. [가장 중요] 각 차트 엔진에 리사이즈 명령 하달[cite: 2, 3]
  // 부모(pane-main 등)의 크기가 flex-grow에 의해 변했으므로 이를 차트에 알려줘야 합니다.
  requestAnimationFrame(() => {
    const mainRect = document
      .getElementById("pane-main")
      .getBoundingClientRect();
    chart.resize(mainRect.width, mainRect.height);

    if (v) {
      const volRect = elVol.getBoundingClientRect();
      chartVol.resize(volRect.width, volRect.height);
    }
    if (k) {
      const kimchiRect = elKimchi.getBoundingClientRect();
      chartKimchi.resize(kimchiRect.width, kimchiRect.height);
    }
  });
}

function initChart() {
  // 1. 기존 메모리 해제 (쌀먹의 기본)
  if (chart) {
    chart.remove();
    chart = null;
  }
  if (chartVol) {
    chartVol.remove();
    chartVol = null;
  }
  if (chartKimchi) {
    chartKimchi.remove();
    chartKimchi = null;
  }

  // 2. 3개의 분리된 DOM 가져오기
  const elMain = document.getElementById("pane-main");
  const elVol = document.getElementById("pane-vol");
  const elKimchi = document.getElementById("pane-kimchi");

  const isDark = currentTheme === "binance" || currentTheme === "upbit-dark";
  const upColor = currentTheme === "binance" ? "#26a69a" : "#c84a31";
  const downColor = currentTheme === "binance" ? "#ef5350" : "#1261c4";

  // 공통 옵션 (배경, 그리드)
  const commonOptions = {
    layout: {
      background: {
        color: getComputedStyle(document.body).getPropertyValue("--bg").trim(),
      },
      textColor: getComputedStyle(document.body)
        .getPropertyValue("--text")
        .trim(),
    },
    grid: {
      vertLines: { color: isDark ? "#2a2a22" : "#f1f1f11f" },
      horzLines: { color: isDark ? "#2a2a22" : "#f1f1f11f" },
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  };

  // 🚀 [1단] 메인 캔들 차트 생성
  chart = LightweightCharts.createChart(elMain, {
    ...commonOptions,
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: {
      autoScale: true,
      borderColor: isDark ? "#2a2a22" : "#f1f1f11f",
    },
  });
  candleSeries = chart.addCandlestickSeries({
    upColor,
    downColor,
    borderUpColor: upColor,
    borderDownColor: downColor,
    wickUpColor: upColor,
    wickDownColor: downColor,
  });

  // 🚀 [2단] 거래량 차트 생성
  chartVol = LightweightCharts.createChart(elVol, {
    ...commonOptions,
    timeScale: { visible: false }, // 💡 라벨 숨김! 공간 절약
    rightPriceScale: {
      autoScale: true,
      scaleMargins: { top: 0.1, bottom: 0 },
      borderColor: isDark ? "#2a2a22" : "#f1f1f11f",
    },
  });
  volumeSeries = chartVol.addHistogramSeries({
    color: "#26a69a",
    priceFormat: { type: "volume" },
  });

  // 🚀 [3단] 김프 차트 생성
  chartKimchi = LightweightCharts.createChart(elKimchi, {
    ...commonOptions,
    timeScale: { visible: false }, // 💡 라벨 숨김! 공간 절약
    rightPriceScale: {
      autoScale: true,
      scaleMargins: { top: 0.1, bottom: 0.1 },
      borderColor: isDark ? "#2a2a22" : "#f1f1f11f",
    },
  });
  kimchiSeries = chartKimchi.addLineSeries({
    lineWidth: 2,
    crosshairMarkerVisible: false,
    priceFormat: {
      type: "custom",
      formatter: (price) => (price > 0 ? "+" : "") + price.toFixed(2) + "%",
    },
  });

  // 🔥 [핵심 기술] 세 차트의 X축(시간)을 톱니바퀴처럼 물리게 동기화!
  const syncTimeScales = (source, target1, target2) => {
    source.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        target1.timeScale().setVisibleLogicalRange(range);
        target2.timeScale().setVisibleLogicalRange(range);
      }
    });
  };
  syncTimeScales(chart, chartVol, chartKimchi);
  syncTimeScales(chartVol, chart, chartKimchi);
  syncTimeScales(chartKimchi, chart, chartVol);

  // 리사이즈 옵저버 (3마리 동시에 크기 조절)
  if (window.chartResizeObserver) window.chartResizeObserver.disconnect();
  window.chartResizeObserver = new ResizeObserver(() => {
    applyChartLayout(); // 창 크기가 변하면 레이아웃 매니저 호출
  });
  window.chartResizeObserver.observe(document.getElementById("chart-wrapper"));
}
