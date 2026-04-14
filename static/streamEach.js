// streamEach.js

let sniperWs = null;
let activeSubs = new Set(); // 현재 바이낸스에 구독 신청한 코인들

/**
 * 🎯 스나이퍼 소켓 초기화
 */
function initSniperSocket() {
  if (sniperWs && sniperWs.readyState === WebSocket.OPEN) return;

  // 바이낸스 선물 복합 스트림 (개별 티커 전용)
  sniperWs = new WebSocket("wss://fstream.binance.com/ws");
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
    console.log("🎯 스나이퍼 엔진 중단... 3초 후 재연결");
    setTimeout(initSniperSocket, 3000);
  };
}

/**
 * 🔄 [핵심] visibleSymbols와 연동하여 구독 리스트 동기화
 */
function syncSniperSubscriptions() {
  if (!sniperWs || sniperWs.readyState !== WebSocket.OPEN) return;
  if (typeof visibleSymbols === "undefined") return;

  const currentVisible = Array.from(visibleSymbols).map(
    (s) => `${s.toLowerCase()}usdt@ticker`,
  );

  // 1. 새로 들어온 놈들 -> SUBSCRIBE
  const toSub = currentVisible.filter((s) => !activeSubs.has(s));
  if (toSub.length > 0) {
    sniperWs.send(
      JSON.stringify({
        method: "SUBSCRIBE",
        params: toSub,
        id: Date.now(),
      }),
    );
    toSub.forEach((s) => activeSubs.add(s));
  }

  // 2. 나간 놈들 -> UNSUBSCRIBE (바이낸스 형님들 부하 방지)
  const toUnsub = Array.from(activeSubs).filter(
    (s) => !currentVisible.includes(s),
  );
  if (toUnsub.length > 0) {
    sniperWs.send(
      JSON.stringify({
        method: "UNSUBSCRIBE",
        params: toUnsub,
        id: Date.now() + 1,
      }),
    );
    toUnsub.forEach((s) => activeSubs.delete(s));
  }
}

/**
 * ⚡ 0.1초 정밀 렌더링 (깜빡이 속도 극대화)
 */
// streamEach.js

function renderSniperPrice(data) {
  const symbol = data.s.replace("USDT", "");
  const priceCell = document.getElementById(`price-${symbol}`);
  const changeCell = document.getElementById(`change-${symbol}`);
  const todayCell = document.getElementById(`today-${symbol}`);

  if (!priceCell) return;

  const newPrice = parseFloat(data.c);
  const oldPrice = parseFloat(priceCell.innerText.replace(/[^0-9.-]+/g, ""));

  // 1. 가격 업데이트 (기존 로직)
  if (newPrice !== oldPrice) {
    priceCell.innerText = `$ ${formatSmartPrice(newPrice)}`;
    const flashClass = newPrice > oldPrice ? "flash-up" : "flash-down";
    priceCell.classList.add(flashClass);
    setTimeout(() => priceCell.classList.remove(flashClass), 100);
  }

  // ✅ [수정 완료] 2. 24시간 등락률 업데이트
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

  // ✅ [수정 완료] 3. 당일(Today) 등락률 업데이트
  if (todayCell && typeof currentTableData !== "undefined") {
    const targetRow = currentTableData.find(
      (r) => (r.Symbol || r.symbol) === symbol,
    );
    if (targetRow && targetRow.utc0_open) {
      const openPrice = parseFloat(targetRow.utc0_open);
      const todayChange = ((newPrice - openPrice) / openPrice) * 100;

      // 🚀 하드코딩 색상(#26a69a) 대신 테마 클래스로 교체!
      const tThemeClass =
        todayChange > 0
          ? "text-theme-up"
          : todayChange < 0
            ? "text-theme-down"
            : "text-theme-text opacity-50";

      todayCell.innerHTML = `<span class="${tThemeClass} font-bold">${todayChange > 0 ? "+" : ""}${todayChange.toFixed(2)}%</span>`;
    }
  }
}

// 🚀 모든 뷰 변화의 종착역
function refreshSniperTarget() {
  if (typeof updateVisibleSymbols === "function") updateVisibleSymbols();
  if (typeof syncSniperSubscriptions === "function") syncSniperSubscriptions();
}
