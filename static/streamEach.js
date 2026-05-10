// streamEach.js
import { store, CONFIG } from "./store.js";

// 🎯 개별 스트림 스나이퍼 소켓 초기화
function initSniperSocket() {
  if (store.sniperWs && store.sniperWs.readyState === WebSocket.OPEN) return;

  // 바이낸스 선물 복합 스트림 (개별 티커 전용)
  store.sniperWs = new WebSocket("wss://fstream.binance.com/market/ws");
  store.sniperWs.onopen = () => {
    console.log("🎯 스나이퍼 엔진 가동: 보이는 놈들 정밀 타격 시작");
    syncSniperSubscriptions(); // 연결되자마자 현재 보이는 놈들 구독
  };

  store.sniperWs.onmessage = (e) => {
    const data = JSON.parse(e.data);
    // 개별 티커 데이터(24hrTicker)가 오면 즉시 DOM 업데이트
    if (data.e === "24hrTicker") {
      renderSniperPrice(data);
    }
    // if (data.e === "aggTrade") {
    //   renderSniperPrice(data);
    // }
  };

  store.sniperWs.onclose = () => {
    console.log(
      `🎯 스나이퍼 엔진 중단... ${CONFIG.UI_UPDATE_INTERVAL / 1000}초 후 재연결`,
    );
    setTimeout(initSniperSocket, CONFIG.UI_UPDATE_INTERVAL);
  };
}

// 🔄 [핵심] visibleSymbols와 연동하여 구독 리스트 동기화
function syncSniperSubscriptions() {
  if (!store.sniperWs || store.sniperWs.readyState !== WebSocket.OPEN) return;
  if (!store.visibleSymbols) return;

  // 🚀 [수정] 아까 우리가 만든 가장 안전한 ID 발급기로 교체!
  const getNextId = () => Math.floor(Date.now() + Math.random() * 1000);

  const currentVisible = Array.from(store.visibleSymbols).map(
    (s) => `${s.toLowerCase()}usdt@ticker`,
  );

  // const currentVisible = Array.from(visibleSymbols).map(
  //   (s) => `${s.toLowerCase()}usdt@aggTrade`,
  // );

  const toSub = currentVisible.filter((s) => !store.activeSubs.has(s));
  if (toSub.length > 0) {
    store.sniperWs.send(
      JSON.stringify({ method: "SUBSCRIBE", params: toSub, id: getNextId() }),
    );
    toSub.forEach((s) => store.activeSubs.add(s));
  }

  const toUnsub = Array.from(store.activeSubs).filter(
    (s) => !currentVisible.includes(s),
  );
  if (toUnsub.length > 0) {
    store.sniperWs.send(
      JSON.stringify({
        method: "UNSUBSCRIBE",
        params: toUnsub,
        id: getNextId(),
      }),
    );
    toUnsub.forEach((s) => store.activeSubs.delete(s));
  }
}

// let lastProcessedTime = 0; // 전역 또는 상위에 선언

// function renderSniperPrice(data) {
//   // 🚀 [추가] 이벤트 타임(E) 비교로 최신 데이터만 처리 (병렬/고속 수신 방어)
//   if (data.E <= lastProcessedTime) return;
//   lastProcessedTime = data.E;

//   const symbol = data.s.replace("USDT", "");
//   const priceCell = document.getElementById(`price-${symbol}`);
//   if (!priceCell) return;

//   const row = currentTableData.find(r => r.Symbol === symbol);
//   if (!row) return;
//   const p = row.precision || 2;

//   // 🚀 aggTrade에서는 가격이 'p' 필드에 담겨 옵니다. (ticker는 'c')
//   const newPrice = parseFloat(data.p);
//   const oldPrice = parseFloat((priceCell.innerText || "").replace(/[^0-9.-]+/g, "")) || 0;

//   if (newPrice !== oldPrice) {
//     priceCell.innerText = `${formatSmartPrice(newPrice, p)}`;
//     applyPriceFlash(priceCell, newPrice, oldPrice);

//     // 🚀 [등락률 계산] aggTrade는 등락률을 안 주므로 시가(utc0_open_Raw) 기준으로 직접 계산
//     const todayCell = document.getElementById(`today-${symbol}`);
//     if (todayCell && row.utc0_open_Raw) {
//       const openPrice = parseFloat(row.utc0_open_Raw);
//       const todayChange = ((newPrice - openPrice) / openPrice) * 100;
//       const tThemeClass = todayChange > 0 ? "text-theme-up" : todayChange < 0 ? "text-theme-down" : "text-theme-text opacity-50";
//       todayCell.innerHTML = `<span class="${tThemeClass} font-bold">${todayChange > 0 ? "+" : ""}${todayChange.toFixed(2)}%</span>`;
//     }
//   }
// }

// ⚡ 정밀 렌더링 시작하기
function renderSniperPrice(data) {
  const tId = data.s; // 🚀 완벽한 고유 식별자 (예: EDGEUSDT)

  const row = store.currentTableData.find((r) => r.Ticker === tId);
  if (!row) return;

  const priceCell = document.getElementById(`price-${tId}`);
  if (!priceCell) return;

  const p = row.precision || 2;
  const newPrice = parseFloat(data.c);
  const oldPrice =
    parseFloat((priceCell.innerText || "").replace(/[^0-9.-]+/g, "")) || 0;

  if (newPrice !== oldPrice) {
    priceCell.innerText = `${formatSmartPrice(newPrice, p)}`;
    applyPriceFlash(priceCell, newPrice, oldPrice);
  }

  // 24시간 등락률
  const changeCell = document.getElementById(`change-${tId}`);
  if (changeCell) {
    const change24h = parseFloat(data.P);
    const themeClass =
      change24h > 0
        ? "text-theme-up"
        : change24h < 0
          ? "text-theme-down"
          : "text-theme-text opacity-50";
    changeCell.innerHTML = `<span class="${themeClass} font-bold">${change24h > 0 ? "+" : ""}${change24h.toFixed(2)}%</span>`;
  }

  // 거래량 업데이트
  const binanceVolCell = document.getElementById(`vol-binance-${tId}`);
  if (binanceVolCell && data.q) {
    const vol = parseFloat(data.q);
    row.Binance_Vol_Futures = vol; // 정렬 데이터 갱신
    binanceVolCell.innerText = `B: ${window.formatVolumeDollar(vol)}`;
  }

  // 당일 등락률
  const todayCell = document.getElementById(`today-${tId}`);
  if (todayCell && row.utc0_open_Raw) {
    const openPrice = parseFloat(row.utc0_open_Raw);
    const todayChange = ((newPrice - openPrice) / openPrice) * 100;
    const tThemeClass =
      todayChange > 0
        ? "text-theme-up"
        : todayChange < 0
          ? "text-theme-down"
          : "text-theme-text opacity-50";
    todayCell.innerHTML = `<span class="${tThemeClass} font-bold">${todayChange > 0 ? "+" : ""}${todayChange.toFixed(2)}%</span>`;
  }
}

// 🚀 모든 뷰 변화의 종착역
function refreshSniperTarget() {
  if (typeof updateVisibleSymbols === "function") updateVisibleSymbols();
  if (typeof syncSniperSubscriptions === "function") syncSniperSubscriptions();
}

window.initSniperSocket = initSniperSocket;
window.syncSniperSubscriptions = syncSniperSubscriptions;
window.refreshSniperTarget = refreshSniperTarget;
