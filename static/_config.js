// _config.js
// 🌐 1. 차트 & 데이터 엔진
window.binanceChartWs = null;
window.isFetchingChart = null;
let upbitChartWs = null, currentKlineStream = null;
let chart, candleSeries, previewSeries;
let mainData = [];
let curDir = "bull", currentTheme = "binance";
let currentMarket = "SPOT", currentTF = "1d";
let isCollapsed = false, allSymbols = [], isHover = false, isLogMode = false;
let marketDataMap = {};
let binanceRadarWs = null, upbitRadarWs = null;
let tickerBuffer = {}, radarIntervalId = null;
let lastFetchTime = 0;
let currentAsset = "BTC";
let bullBody = 10, bearBody = 5;

// ⏱️ 2. 보간 카운트다운 엔진
let showCountdown = true;
let countdownTimerId = null;
let countdownOverlay = null;
let currentSelectedSymbol = null;
let countdownPriceLine = null;
let localTimeAtUpdate = 0; // 🚀 보간 기준점
let lastServerMs = 0;      // 🚀 서버 진짜 시간
let displayTime = "Wait...";

// 🐎 3. 테이블 및 무한 스크롤
window.originalTableData = [];
window.currentTableData = [];
let currentSortCol = "";
let sortState = "";
let currentRenderLimit = 50;
const RENDER_CHUNK = 50;
let tableObserver = null;
let visibleSymbols = new Set();

// 📡 4. 통신 및 사이드바
window.sniperWs = null;
let activeSubs = new Set();
let isSidebarOpen = true;

// 📏 5. 측정 도구 및 DOM 캐싱
let isMeasuring = false, measureStart = null, measureEnd = null;
let cachedChartTd = null, cachedPriceTd = null;

// 거래소 로고 이미지
// const EX_LOGOS = {
//     "BINANCE": "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png",
//     "COINBASE": "https://s2.coinmarketcap.com/static/img/exchanges/64x64/89.png",
//     "UPBIT": "https://s2.coinmarketcap.com/static/img/exchanges/64x64/351.png",
//     "BITHUMB": "https://s2.coinmarketcap.com/static/img/exchanges/64x64/200.png",
//     "BITGET": "https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png",
//     "BYBIT": "https://s2.coinmarketcap.com/static/img/exchanges/64x64/521.png",
//     "GATEIO": "https://s2.coinmarketcap.com/static/img/exchanges/64x64/302.png",
//     "OKX": "https://s2.coinmarketcap.com/static/img/exchanges/64x64/294.png"
// };

// 시스템 상수
const SCREEN_WIDTH = 768;
const UI_UPDATE_INTERVAL = 1500;
const CHART_CONFIG = { GHOST_COUNT: 500, VISIBLE_COUNT: 200, RIGHT_PADDING: 10 };
const tfSec = {
    "1m": 60, "3m": 180, "5m": 300, "10m": 600, "15m": 900, "30m": 1800,
    "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "8h": 28800, "12h": 43200,
    "1d": 86400, "3d": 259200, "1w": 604800, "1M": 2592000, "1y": 31104000
};
// 측정용 DOM
let measureBox = document.createElement("div");
let startPriceLabel = document.createElement("div");
let endPriceLabel = document.createElement("div");
let priceRangeBar = document.createElement("div");
measureBox.style.cssText = `position: absolute; z-index: 50; pointer-events: none; display: none; border: 1px solid; transition: background-color 0.2s, border-color 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; text-align: center; line-height: 1.4;`;
startPriceLabel.style.cssText = `position: absolute; left: 0; z-index: 98; pointer-events: none; display: none; padding: 2px 6px; font-size: 10px; font-weight: bold; color: white; border-radius: 2px 0 0 2px; white-space: nowrap;`;
endPriceLabel.style.cssText = `position: absolute; left: 0; z-index: 100; pointer-events: none; display: none; padding: 2px 6px; font-size: 10px; font-weight: bold; color: white; border-radius: 2px 0 0 2px; white-space: nowrap; transition: background-color 0.2s;`;
priceRangeBar.style.cssText = `position: absolute; left: 0; width: 100%; z-index: 90; pointer-events: none; display: none; transition: background-color 0.2s; background-color: var(--bg-chart, #131722); opacity: 0.3;`;