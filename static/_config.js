// _config.js
// 🌐 전역 변수 (Global State)
let chart, candleSeries, previewSeries;
let mainData = [];
let curDir = "bull",
  currentTheme = "upbit";
let currentWs = null,
  currentMarket = "SPOT",
  currentTF = "1d";
let isCollapsed = false,
  allSymbols = [],
  isHover = false,
  isLogMode = false;
let marketDataMap = {};
let globalWs = null,
  tickerBuffer = {},
  radarIntervalId = null;
const SCREEN_WIDTH = 768;
const UI_UPDATE_INTERVAL = 3000;
const tfSec = {
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "6h": 21600,
  "12h": 43200,
  "1d": 86400,
  "3d": 259200,
  "1w": 604800,
  "1M": 2592000,   // 30일 기준
  "1Y": 31536000,  // 365일 기준
};
let currentAsset = "BTC"
// BTC
let bullBody = 10,
  bearBody = 5;
let showCountdown = true;
let countdownTimerId = null;
let countdownOverlay = null; // 차트 위에 떠다닐 DOM
let currentSelectedSymbol = null;

// --- 🎨 차트 렌더링 및 UI ---
// ⚙️ 차트 설정 전역 변수 (여기만 수정하면 전체 적용됨)
const CHART_CONFIG = {
  GHOST_COUNT: 500, // 미래 유령 캔들 개수
  VISIBLE_COUNT: 100, // 화면에 보여줄 과거 캔들 개수
  RIGHT_PADDING: 10, // 우측 여백 칸 수
};

let originalTableData = []; // ⭐️ 원본 백업용 변수 추가
let currentTableData = [];
let currentSortCol = "";
let sortState = ""; // 'desc'(내림) -> 'asc'(오름) -> ''(제자리)
let currentRenderLimit = 50;
// 초기 로딩은 가장 가볍게 50개로 시작
const RENDER_CHUNK = 50; // 스크롤 바닥 칠 때마다 50개씩 추가

// ⭐️ 파일 위쪽 전역 변수 모여있는 곳에 2줄 추가
let tableObserver = null;
let visibleSymbols = new Set();

// 웹 소캣
let sniperWs = null;
let activeSubs = new Set();
let isSidebarOpen = true;

// --- 📏 1. 전역 상태 및 DOM 요소 (간소화) ---
let isMeasuring = false,
  measureStart = null,
  measureEnd = null;
let cachedChartTd = null,
  cachedPriceTd = null; // 🚀 DOM 캐싱용 변수

// 요소 생성 (스타일은 CSS 파일로 빼는 것을 강력 추천하지만, 일단 유지)
let measureBox = document.createElement("div");
let startPriceLabel = document.createElement("div");
let endPriceLabel = document.createElement("div");
let priceRangeBar = document.createElement("div");

measureBox.style.cssText = `position: absolute; z-index: 50; pointer-events: none; display: none; border: 1px solid; transition: background-color 0.2s, border-color 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; text-align: center; line-height: 1.4;`;
startPriceLabel.style.cssText = `position: absolute; left: 0; z-index: 98; pointer-events: none; display: none; padding: 2px 6px; font-size: 10px; font-weight: bold; color: white; border-radius: 2px 0 0 2px; white-space: nowrap;`;
endPriceLabel.style.cssText = `position: absolute; left: 0; z-index: 100; pointer-events: none; display: none; padding: 2px 6px; font-size: 10px; font-weight: bold; color: white; border-radius: 2px 0 0 2px; white-space: nowrap; transition: background-color 0.2s;`;
priceRangeBar.style.cssText = `position: absolute; left: 0; width: 100%; z-index: 90; pointer-events: none; display: none; transition: background-color 0.2s; background-color: var(--bg-chart, #131722); opacity: 0.3;`;
