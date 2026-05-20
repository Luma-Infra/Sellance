export const store = {
  marketDataMap: { upbit: [], spot: [], futures: [], krw_usd_rate: 0.0 },
  allSymbols: [],
  originalTableData: [],
  currentTableData: [],
  tickerBuffer: {},
  visibleSymbols: new Set(),
  btcRateCache: {}, // 🚀 합성 환율 전용 메모리 캐시 엔진 추가
  tickerRowMap: new Map(), // 🚀 [단일 진실 공급원] 전역 테이블 행 O(1) 광속 탐색 맵

  currentAsset: null,
  currentSelectedSymbol: null,
  isScrolling: false, // 🚀 스크롤 중 여부 플래그
  isEngineStarted: false, // 🚀 최초 코인 선택 시 소켓 및 차트 점화 여부 플래그
  mcapMin: 0, // 🚀 시총 최소값 (기본 0)
  mcapMax: 10000000000, // 🚀 시총 최대값 (기본 10B)
  useFlip: true, // 🚀 플립 애니메이션 사용 여부
  hideSmallCap: false, // 🚀 시총 1M 미만 숨기기 여부
  lang: "KR", // 🚀 한/영 토글 (KR, EN)
  filterMode: "ALL", // 🚀 [추가] ALL, BINANCE, UPBIT, FUTURES, SPOT
  currencyMode: "USD", // 🚀 [추가] USD, KRW 토글 모드
  viewMode: "DETAILED",
  settings: {
    CMC_API_KEY: "",
  },
  currentTF: "1d",

  chart: null,
  candleSeries: null,
  previewSeries: null,
  volumeSeries: null,
  kimchiSeries: null,
  chartVol: null,
  chartKimchi: null,
  kimchiData: null,
  mainData: [],
  countdownPriceLine: null,
  paneConfig: { volume: true, kimchi: true },
  chartSplits: { s1: 0.65, s2: 0.85 },

  isFetchingChart: false,
  lastFetchTime: 0,
  isLogMode: false,
  showCountdown: true,
  currentRenderLimit: 1000,

  curDir: "bull",
  bullBody: 10,
  bearBody: 5,
  isHover: false,

  binanceChartWs: null,
  upbitChartWs: null,
  currentKlineStream: null,
  binanceRadarWs: null,
  upbitRadarWs: null,
  sniperWs: null,
  activeSubs: new Set(),
  radarIntervalId: null,

  currentTheme: "binance",
  isCollapsed: false,
  isSidebarOpen: true,
  countdownTimerId: null,
  countdownOverlay: null,
  localTimeAtUpdate: 0,
  lastServerMs: 0,
  displayTime: "Wait...",
  currentSortCol: "",
  sortState: "",
  tableObserver: null,
  isCrosshairActive: false, // 🚀 십자선(크로스헤어) 활성화 상태 추적용

  isMeasuring: false,
  measureStart: null,
  measureEnd: null,
  cachedChartTd: null,
  cachedPriceTd: null,

  // 🚀 [단일 진실 공급원] 조건식 떡칠 제거용 전역 정밀도 캐시 맵 및 헬퍼
  precisionMap: new Map(),
  getPrecision: function (sym) {
    if (!sym) return store.currentPrecision || 2;
    const key = String(sym).toUpperCase();

    if (store.precisionMap.has(key)) {
      return store.precisionMap.get(key);
    }

    let row = store.tickerRowMap.get(key);
    if (!row) {
      const allSource = store.originalTableData || store.currentTableData || [];
      row = allSource.find(
        (r) =>
          (r.Ticker || "").toUpperCase() === key ||
          (r.DisplayTicker || "").toUpperCase() === key ||
          (r.Symbol || "").toUpperCase() === key,
      );
    }

    const p =
      row && row.precision !== undefined
        ? Number(row.precision)
        : store.currentPrecision || 2;

    if (row) {
      if (row.Ticker) store.precisionMap.set(row.Ticker.toUpperCase(), p);
      if (row.DisplayTicker)
        store.precisionMap.set(row.DisplayTicker.toUpperCase(), p);
      if (row.Symbol) store.precisionMap.set(row.Symbol.toUpperCase(), p);
    } else {
      store.precisionMap.set(key, p);
    }

    store.currentPrecision = p;
    return p;
  },
};

export const CONFIG = {
  SCREEN_WIDTH: 768,
  UI_UPDATE_INTERVAL: 1500,
  RENDER_CHUNK: 50,
  CHART_CONFIG: { GHOST_COUNT: 500, VISIBLE_COUNT: 200, RIGHT_PADDING: 10 },
};

export const tfSec = {
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "10m": 600,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "6h": 21600,
  "8h": 28800,
  "12h": 43200,
  "1d": 86400,
  "3d": 259200,
  "1w": 604800,
  "1M": 2592000,
  "1y": 31104000,
};

export const measureDOM = {
  box: document.createElement("div"),
  startLabel: document.createElement("div"),
  endLabel: document.createElement("div"),
  rangeBar: document.createElement("div"),
};

measureDOM.box.style.cssText = `position: absolute; z-index: 50; pointer-events: none; display: none; border: 1px solid; transition: background-color 0.2s, border-color 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; text-align: center; line-height: 1.4;`;
measureDOM.startLabel.style.cssText = `position: absolute; left: 0; width: 100%; box-sizing: border-box; z-index: 98; pointer-events: none; display: none; padding: 2px 6px; font-size: 10px; font-weight: bold; color: white; text-align: center; opacity: 1; white-space: nowrap;`;
measureDOM.endLabel.style.cssText = `position: absolute; left: 0; width: 100%; box-sizing: border-box; z-index: 100; pointer-events: none; display: none; padding: 2px 6px; font-size: 10px; font-weight: bold; color: white; text-align: center; opacity: 1; white-space: nowrap; transition: background-color 0.2s;`;
measureDOM.rangeBar.style.cssText = `position: absolute; left: 0; width: 100%; z-index: 90; pointer-events: none; display: none; transition: background-color 0.2s; background-color: var(--bg-chart, #131722); opacity: 0.3;`;
