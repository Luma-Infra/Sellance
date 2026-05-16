// stream.js
// --- 🌊 실시간 웹소켓 엔진 ---
import { store, tfSec, CONFIG } from "./_store.js";
import { getMultiplier, getPureBase } from "./chart_utils.js";



// 🚀 [신규] 렌더링 과부하 방지용 쓰로틀 메모리
const lastRenderMap = new Map();

// ⚡ [HTS 핵심] 개별 행 정밀 렌더링 엔진 (웹소켓 전용)
function renderRealtimeRow(tId, data) {
  const now = Date.now();
  const lastRender = lastRenderMap.get(tId) || 0;

  // 🚀 [해결] PEPE vs 1000PEPE, XRP vs XRPDOWN 등 심볼 헷갈림 방지 (널뛰기 버그 컷)
  const dataSym = (data.s || tId).toUpperCase();
  
  // 1. 최우선: Ticker(BTCUSDT, BTCKRW 등)가 완벽히 일치하는 행 찾기
  let row = store.currentTableData.find((r) => r.Ticker === dataSym);

  // 2. [수정] 차선: 업비트 규격 변환 매칭 (KRW-BTC -> BTCKRW)
  if (!row && dataSym.includes("KRW-")) {
    const upbitTicker = dataSym.replace("KRW-", "") + "KRW";
    row = store.currentTableData.find((r) => r.Ticker === upbitTicker);
  }
  
  if (!row) return;

  // 🚨 [최종 수문장] PEPE vs 1000PEPE 등 배수 기호가 다르면 다른 코인임 (오염 차단)
  if (getMultiplier(dataSym) !== getMultiplier(row.Ticker)) return;

  // 1. [데이터 전수 업데이트] 500등 코인도 1등이 될 수 있게 메모리 장부부터 즉시 갱신
  // 화면 노출 여부와 상관없이 모든 실시간 값을 장부(row)에 기입합니다.
  const newPrice = parseFloat(data.c || data.p);
  if (isNaN(newPrice)) return;

  row.Price_Raw = newPrice;
  if (data.P !== undefined) {
    row.Change_24h_Raw = parseFloat(data.P);
  }
  if (row.utc0_open_Raw) {
    const openPrice = parseFloat(row.utc0_open_Raw);
    if (openPrice > 0) {
      row.Change_Today_Raw = ((newPrice - openPrice) / openPrice) * 100;
    }
  }

  // 2. [UI 렌더링 격리] 여기서부터는 성능을 위해 가시성 체크 및 쓰로틀링 적용
  // 🚀 [핵심] 화면에 안 보이는 코인은 DOM 연산을 1절 하지 않음 (성능 최적화)
  if (!store.visibleSymbols.has(row.Ticker)) return;

  if (now - lastRender < 800) return;
  lastRenderMap.set(tId, now);

  const priceCell = document.getElementById(`price-${row.Ticker}`);
  if (!priceCell) return;

  const p = row.precision || 2;
  const oldPrice = parseFloat(priceCell.getAttribute("data-raw-price")) || 0;

  // 가격 및 반짝이 효과
  if (newPrice !== oldPrice) {
    priceCell.setAttribute("data-raw-price", newPrice);
    const formattedPrice = window.formatSmartPrice(newPrice, p);
    
    // KRW 변환 가격 (있을 경우만)
    const krwDisplay = row.Price_KRW 
      ? `<span class="text-[12px] text-theme-text opacity-70 ml-1"> ( ${Number(row.Price_KRW).toLocaleString()} 원 )</span>` 
      : "";
    
    priceCell.innerHTML = `${formattedPrice} ${krwDisplay}`;
    
    if (typeof window.applyPriceFlash === "function") {
      window.applyPriceFlash(priceCell, newPrice, oldPrice);
    }
  }

  // 24시간 등락률 UI
  const changeCell = document.getElementById(`change-${row.Ticker}`);
  if (changeCell) {
    const change24h = row.Change_24h_Raw || 0;
    const isFocus = store.currentSortCol !== "Change_Today";
    const themeClass = change24h > 0 ? "text-theme-up" : change24h < 0 ? "text-theme-down" : "text-theme-text opacity-50";
    changeCell.innerHTML = `<span class="${themeClass} font-bold ${isFocus ? "opacity-100" : "opacity-40"}">${change24h > 0 ? "+" : ""}${change24h.toFixed(2)}%</span>`;
  }

  // 당일 등락률 UI
  const todayCell = document.getElementById(`today-${row.Ticker}`);
  if (todayCell && row.Change_Today_Raw !== undefined) {
    const todayChange = row.Change_Today_Raw;
    const isFocus = store.currentSortCol === "Change_Today";
    const tThemeClass = todayChange > 0 ? "text-theme-up" : todayChange < 0 ? "text-theme-down" : "text-theme-text opacity-50";
    const safeChange = todayChange < -99.9 ? -99.9 : todayChange;
    todayCell.innerHTML = `<span class="${tThemeClass} font-bold ${isFocus ? "opacity-100" : "opacity-40"}">${safeChange > 0 ? "+" : ""}${safeChange.toFixed(2)}%</span>`;
  }

  // 거래량 UI
  const binanceVolCell = document.getElementById(`vol-binance-${row.Ticker}`);
  if (binanceVolCell && data.q) {
    binanceVolCell.innerText = `B: ${window.formatVolumeDollar(parseFloat(data.q))}`;
  }
}

window.renderRealtimeRow = renderRealtimeRow;



export function startBinanceMarketRadar() {
  if (store.binanceRadarWs) store.binanceRadarWs.close();
  store.binanceRadarWs = new WebSocket("wss://fstream.binance.com/market/ws/!ticker@arr");
  store.binanceRadarWs.onmessage = (event) => {
    const data = JSON.parse(event.data);
    data.forEach((ticker) => {
      const pureSymbol = ticker.s.replace("USDT", "");
      store.tickerBuffer[ticker.s] = ticker;
      if (store.visibleSymbols && (store.visibleSymbols.has(pureSymbol) || store.visibleSymbols.has(ticker.s))) {
        requestAnimationFrame(() => renderRealtimeRow(ticker.s, ticker));
      }
    });
  };
  store.binanceRadarWs.onclose = () => setTimeout(startBinanceMarketRadar, 3000);
}

export function startUpbitMarketRadar() {
  if (store.upbitRadarWs) store.upbitRadarWs.close();
  store.upbitRadarWs = new WebSocket("wss://api.upbit.com/websocket/v1");
  store.upbitRadarWs.binaryType = "arraybuffer";
  store.upbitRadarWs.onopen = () => {
    const allUpbitCodes = store.currentTableData.filter((row) => row.Upbit === "O" && row.Symbol).map((row) => `KRW-${row.Symbol}`);
    if (!allUpbitCodes.includes("KRW-USDT")) allUpbitCodes.push("KRW-USDT");
    if (allUpbitCodes.length === 0) return;
    store.upbitRadarWs.send(JSON.stringify([{ ticket: "UNIQUE_TICKET" }, { type: "ticker", codes: allUpbitCodes }]));
  };
  const decoder = new TextDecoder("utf-8");
  store.upbitRadarWs.onmessage = (event) => {
    const ticker = JSON.parse(decoder.decode(event.data));
    const pureSym = ticker.code.replace("KRW-", "");
    const normalizedTicker = { s: pureSym, c: ticker.trade_price, P: ticker.signed_change_rate * 100, q_upbit: ticker.acc_trade_price_24h };
    store.tickerBuffer[ticker.code] = normalizedTicker;
    if (store.visibleSymbols && store.visibleSymbols.has(pureSym)) {
      requestAnimationFrame(() => renderRealtimeRow(ticker.code, normalizedTicker));
    }
  };
  store.upbitRadarWs.onclose = () => setTimeout(startUpbitMarketRadar, 3000);
}

export function getUpbitCandleStartTime(serverMs, tf) {
  const d = new Date(serverMs);
  const sec = tfSec[tf] || 60;
  if (tf.includes("d") || tf.includes("w") || tf.includes("M")) {
    d.setUTCHours(0, 0, 0, 0);
    if (tf === "1w") {
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1));
    } else if (tf === "1M") d.setUTCDate(1);
  } else {
    const timestamp = Math.floor(serverMs / 1000);
    return Math.floor(timestamp / sec) * sec;
  }
  return Math.floor(d.getTime() / 1000);
}

if (store.radarIntervalId) clearInterval(store.radarIntervalId);
store.radarIntervalId = setInterval(() => {
  if (Object.keys(store.tickerBuffer).length === 0) return;
  const snapshot = { ...store.tickerBuffer };
  store.tickerBuffer = {};

  let dataUpdated = false;
  store.currentTableData.forEach((row) => {
    // 🚀 [수정] 업비트 규격 대응 (BTCKRW -> KRW-BTC)
    const ticker = snapshot[row.Ticker] || (row.Ticker.endsWith("KRW") ? snapshot[`KRW-${row.Ticker.replace("KRW", "")}`] : null);
    if (!ticker) return;

    if (row.Ticker.endsWith("KRW")) {
      const rate = store.marketDataMap?.krw_usd_rate || 1450.0;
      row.Price_KRW = parseFloat(ticker.c);
      row.Price_Raw = row.Price_KRW / rate;
    } else {
      row.Price_Raw = parseFloat(ticker.c);
    }
    row.Change_24h_Raw = parseFloat(ticker.P);
    if (ticker.q) row.Binance_Vol_Futures = parseFloat(ticker.q);
    if (ticker.q_upbit) row.Upbit_Vol_KRW = parseFloat(ticker.q_upbit);

    if (row.utc0_open_Raw) {
      const open = parseFloat(row.utc0_open_Raw);
      if (open > 0) row.Change_Today_Raw = ((row.Price_Raw - open) / open) * 100;
    }
    dataUpdated = true;
  });
}, 10000);

window.startBinanceMarketRadar = startBinanceMarketRadar;
window.startUpbitMarketRadar = startUpbitMarketRadar;
