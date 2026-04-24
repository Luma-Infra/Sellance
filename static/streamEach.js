// streamEach.js
// 🎯 개별 스트림 스나이퍼 소켓 초기화
function initSniperSocket() {
  if (sniperWs && sniperWs.readyState === WebSocket.OPEN) return;

  // 바이낸스 선물 복합 스트림 (개별 티커 전용)
  sniperWs = new WebSocket("wss://fstream.binance.com/market/ws");
  sniperWs.onopen = () => {
    console.log("🎯 스나이퍼 엔진 가동: 보이는 놈들 정밀 타격 시작");
    syncSniperSubscriptions(); // 연결되자마자 현재 보이는 놈들 구독
  };

  sniperWs.onmessage = (e) => {
    const data = JSON.parse(e.data);
    // 개별 티커 데이터(24hrTicker)가 오면 즉시 DOM 업데이트
    if (data.e === "24hrTicker") {
      renderSniperPrice(data);
    }
  };

  sniperWs.onclose = () => {
    console.log(`🎯 스나이퍼 엔진 중단... ${UI_UPDATE_INTERVAL / 1000}초 후 재연결`);
    setTimeout(initSniperSocket, UI_UPDATE_INTERVAL);
  };
}

// 🔄 [핵심] visibleSymbols와 연동하여 구독 리스트 동기화
function syncSniperSubscriptions() {
  if (!sniperWs || sniperWs.readyState !== WebSocket.OPEN) return;
  if (typeof visibleSymbols === "undefined") return;

  // 🚀 [수정] 아까 우리가 만든 가장 안전한 ID 발급기로 교체!
  const getNextId = () => Math.floor(Date.now() + Math.random() * 1000);

  const currentVisible = Array.from(visibleSymbols).map(
    (s) => `${s.toLowerCase()}usdt@ticker`,
  );

  const toSub = currentVisible.filter((s) => !activeSubs.has(s));
  if (toSub.length > 0) {
    sniperWs.send(JSON.stringify({ method: "SUBSCRIBE", params: toSub, id: getNextId() }));
    toSub.forEach((s) => activeSubs.add(s));
  }

  const toUnsub = Array.from(activeSubs).filter((s) => !currentVisible.includes(s));
  if (toUnsub.length > 0) {
    sniperWs.send(JSON.stringify({ method: "UNSUBSCRIBE", params: toUnsub, id: getNextId() }));
    toUnsub.forEach((s) => activeSubs.delete(s));
  }
}

// ⚡ 정밀 렌더링 시작하기
function renderSniperPrice(data) {
  const symbol = data.s.replace("USDT", "");
  const priceCell = document.getElementById(`price-${symbol}`);
  if (!priceCell) return;

  // 🚀 족보(p)와 시가(open) 한 번에 찾기 (최적화)
  const row = currentTableData.find(r => r.Symbol === symbol);
  if (!row) return;
  const p = row.precision || 2;

  const newPrice = parseFloat(data.c);
  // 🚀 에러 방어: 텍스트가 없어도 뻗지 않게!
  const oldPrice = parseFloat((priceCell.innerText || "").replace(/[^0-9.-]+/g, "")) || 0;

  if (newPrice !== oldPrice) {
    priceCell.innerText = `${formatSmartPrice(newPrice, p)}`;
    // 🚀 공용 함수 호출로 통일!
    applyPriceFlash(priceCell, newPrice, oldPrice);
  }

  // 24시간 등락률 (기존 동일)
  const changeCell = document.getElementById(`change-${symbol}`);
  if (changeCell) {
    const change24h = parseFloat(data.P);
    const themeClass = change24h > 0 ? "text-theme-up" : change24h < 0 ? "text-theme-down" : "text-theme-text opacity-50";
    changeCell.innerHTML = `<span class="${themeClass} font-bold">${change24h > 0 ? "+" : ""}${change24h.toFixed(2)}%</span>`;
  }

  // 당일 등락률 (row.utc0_open_Raw 활용)
  const todayCell = document.getElementById(`today-${symbol}`);
  if (todayCell && row.utc0_open_Raw) {
    const openPrice = parseFloat(row.utc0_open_Raw);
    const todayChange = ((newPrice - openPrice) / openPrice) * 100;
    const tThemeClass = todayChange > 0 ? "text-theme-up" : todayChange < 0 ? "text-theme-down" : "text-theme-text opacity-50";
    todayCell.innerHTML = `<span class="${tThemeClass} font-bold">${todayChange > 0 ? "+" : ""}${todayChange.toFixed(2)}%</span>`;
  }
}

// 🚀 모든 뷰 변화의 종착역
function refreshSniperTarget() {
  if (typeof updateVisibleSymbols === "function") updateVisibleSymbols();
  if (typeof syncSniperSubscriptions === "function") syncSniperSubscriptions();
}
