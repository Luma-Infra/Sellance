// --- 📡 API Fetch 로직 ---
// app.js
async function loadSymbols() {
  try {
    const res = await fetch("/api/market-map");
    marketDataMap = await res.json();
    allSymbols = marketDataMap.all_assets;
  } catch (e) {
    console.error("마켓 데이터 로드 실패", e);
  }
}

function searchSymbols(v) {
  const resDiv = document.getElementById("search-results");
  if (!v) {
    resDiv.style.display = "none";
    return;
  }

  const filtered = allSymbols
    .filter((s) => s.includes(v.toUpperCase()))
    .slice(0, 15);
  resDiv.innerHTML = filtered
    .map((s) => {
      let tags = "";
      if (marketDataMap.upbit.includes(s))
        tags += `<span class="bg-[#093687] text-white text-[9px] px-1 py-0.5 rounded mr-1">UPBIT</span>`;
      if (marketDataMap.futures.includes(s))
        tags += `<span class="bg-[#f0b90b] text-black text-[9px] px-1 py-0.5 rounded mr-1">FUTURES</span>`;
      if (marketDataMap.spot.includes(s) && !marketDataMap.futures.includes(s))
        tags += `<span class="bg-[#333] text-white text-[9px] px-1 py-0.5 rounded mr-1">SPOT</span>`;

      return `<div class="flex items-center p-2 cursor-pointer border-b border-theme-border text-[13px] hover:bg-white/5" onclick="selectSymbol('${s}')">
                    <img class="w-[18px] h-[18px] mr-2" src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s.toLowerCase()}.png" onerror="this.src='https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/generic.png'">
                    <b class="w-[60px]">${s}</b> ${tags}
                </div>`;
    })
    .join("");
  resDiv.style.display = filtered.length ? "block" : "none";
}

async function selectSymbol(s) {
  currentAsset = s;

  const symInput = document.getElementById("symbol-input");
  if (symInput) symInput.value = s;
  const searchRes = document.getElementById("search-results");
  if (searchRes) searchRes.style.display = "none";

  const headAssetName = document.getElementById("head-asset-name");
  if (headAssetName) headAssetName.innerText = s;
  ["head-mcap", "head-price", "head-volume", "head-target"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = "조회 중...";
  });

  let badges = "";
  if (marketDataMap.upbit && marketDataMap.upbit.includes(s))
    badges += `<span class="bg-[#093687] text-white text-[10px] px-1.5 py-0.5 rounded">UPBIT</span>`;
  if (marketDataMap.futures && marketDataMap.futures.includes(s))
    badges += `<span class="bg-[#f0b90b] text-black text-[10px] px-1.5 py-0.5 rounded">B-FUTURES</span>`;
  if (marketDataMap.spot && marketDataMap.spot.includes(s))
    badges += `<span class="bg-[#444] text-white text-[10px] px-1.5 py-0.5 rounded">B-SPOT</span>`;

  const badgeContainer = document.getElementById("exchange-badges");
  if (badgeContainer) badgeContainer.innerHTML = badges;

  try {
    const infoRes = await fetch(`/api/coin-info/${s}`);
    const infoData = await infoRes.json();
    // if (headMcap) headMcap.innerText = infoData.market_cap;
    if (headAssetName) headAssetName.innerText = infoData.name + ` (${s})`;
  } catch (e) {
    // if (headMcap) headMcap.innerText = "조회 실패";
  }

  fetchHistory(s);
}

async function fetchHistory(symbol, rawTicker) {
  if (!symbol) symbol = currentAsset;

  const pureSymbol = symbol.replace(/USDT$/i, "").toUpperCase();
  currentAsset = pureSymbol;

  const isUpbitOnly = (marketDataMap.upbit || []).includes(pureSymbol);

  const binanceTicker = rawTicker || `${pureSymbol}USDT`;
  const upbitTicker = rawTicker || `KRW-${pureSymbol}`;

  const loadingModal = document.getElementById("chart-loading-modal");
  if (loadingModal) loadingModal.classList.remove("hidden"); // Tailwind 대응

  const isFutures = !isUpbitOnly && (marketDataMap.futures || []).includes(pureSymbol);
  const isSpot = !isUpbitOnly && (marketDataMap.spot || []).includes(pureSymbol);

  try {
    mainData = [];
    let raw = [];

    if (isFutures || isSpot) {
      const url = isFutures
        ? "https://fapi.binance.com/fapi/v1/klines"
        : "https://api.binance.com/api/v3/klines";
      const res = await fetch(
        `${url}?symbol=${binanceTicker}&interval=${currentTF}&limit=500`,
      );
      raw = await res.json();
      if (Array.isArray(raw)) {
        mainData = raw.map((d) => ({
          time: Number(d[0]) / 1000,
          open: Number(d[1]),
          high: Number(d[2]),
          low: Number(d[3]),
          close: Number(d[4]),
        }));
      }
    } else {
      // 1. tfMap에 월봉(1M) 추가
      const tfMap = {
        "1m": 1,
        "15m": 15,
        "1h": 60,
        "4h": 240,
        "1d": "days",
        "1w": "weeks",
        "1M": "months",
      };

      // 2. 핵심 수정: 숫자인지 문자인지 판별해서 경로 생성
      const tfValue = tfMap[currentTF] || 60;
      let upbitInterval =
        typeof tfValue === "number" ? `minutes/${tfValue}` : tfValue;
      const res = await fetch(
        `https://api.upbit.com/v1/candles/${upbitInterval}?market=${upbitTicker}&count=200`,
      );
      raw = await res.json();
      if (Array.isArray(raw)) {
        mainData = raw.reverse().map((d) => {
          // 🚨 핵심 패치: 시간 뒤에 'Z'를 붙여서 브라우저가 무조건 UTC(표준시)로 인식하게 강제함!
          const ts = Math.floor(
            Date.parse(d.candle_date_time_utc + "Z") / 1000,
          );
          return {
            time: ts,
            open: Number(d.opening_price),
            high: Number(d.high_price),
            low: Number(d.low_price),
            close: Number(d.trade_price),
          };
        });
      }
    }

    if (mainData.length > 0 && mainData[0].time) {
      if (candleSeries) candleSeries.setData(mainData);
      autoFit();
      updateStatus();
      if (mainData.length) updateLegend(mainData[mainData.length - 1]);
      if (typeof startRealtimeCandle === "function")
        startRealtimeCandle(pureSymbol, currentTF, isFutures, isSpot);
    }
  } catch (e) {
    console.error("차트 로드 중 예외 발생:", e);
  } finally {
    if (loadingModal) loadingModal.classList.add("hidden");
  }
}
