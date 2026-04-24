// app.js
// --- 📡 API Fetch 로직 ---
async function loadSymbols() {
  try {
    const res = await fetch("/api/market-map");
    const data = await res.json();

    // 🚀 [핵심] 모든 엔진이 공통으로 쓰는 '장부'에 데이터를 꽂아넣으세요!
    marketDataMap = data;
    allSymbols = data.all_assets;

    // 만약 table.js의 currentTableData를 여기서 관리한다면?
    // 백엔드에서 주는 전체 리스트를 장부에 복사!
    // if (data.table_data) {
    //   currentTableData = JSON.parse(JSON.stringify(data.table_data));
    //   originalTableData = JSON.parse(JSON.stringify(data.table_data));
    // }

    console.log("✅ [데이터센터] 장부 로드 완료!");
  } catch (e) {
    console.error("🚨 마켓 데이터 로드 실패", e);
  }
}

// 검색창 비우기 (X 버튼용)
function clearSearch() {
  const input = document.getElementById("symbol-input");
  input.value = "";
  input.focus();
  searchSymbols("");
}

// 검색 리스트 (티커 + 태그 유지 버전)
function searchSymbols(v) {
  const resDiv = document.getElementById("search-results");
  if (!resDiv) return;

  if (!v || v.trim() === "") {
    resDiv.style.display = "none";
    return;
  }

  // 🚀 [핵심] 검색어가 있든 없든, 필터링해서 보여줌
  const query = v.toUpperCase();
  const filtered = query
    ? allSymbols.filter((s) => s.includes(query)).slice(0, 15)
    : allSymbols.slice(0, 15); // 빈 값이면 상위 15개 그냥 노출

  if (filtered.length === 0) {
    resDiv.style.display = "none";
    return;
  }

  resDiv.innerHTML = filtered.map((s) => {
    const isUpbit = marketDataMap.upbit.includes(s);
    const isBinanceSpot = marketDataMap.spot.includes(s);
    const isBinanceFutures = marketDataMap.futures.includes(s);

    // 거래소 버튼 (분기 유지)
    let upbitBtn = isUpbit
      ? `<button class="bg-[#093687] text-white text-[9px] px-2 py-1 rounded font-bold mr-1 hover:brightness-125" 
                 onclick="event.stopPropagation(); selectSymbol('${s}', 'UPBIT')">UPBIT</button>`
      : "";
    let binanceBtn = isBinanceFutures
      ? `<button class="bg-[#f0b90b] text-black text-[9px] px-2 py-1 rounded font-bold hover:brightness-110" 
                 onclick="event.stopPropagation(); selectSymbol('${s}', 'FUTURES')">B-FUT</button>`
      : (isBinanceSpot ? `<button class="bg-[#333] text-white text-[9px] px-2 py-1 rounded font-bold border border-[#555]" 
                                   onclick="event.stopPropagation(); selectSymbol('${s}', 'SPOT')">B-SPOT</button>` : "");

    return `
      <div class="flex items-center justify-between p-2 cursor-pointer border-b border-theme-border text-[13px] hover:bg-white/5" 
           onclick="selectSymbol('${s}')">
        <div class="flex items-center gap-2">
          <b class="w-[50px]">${s}</b>
          <div class="flex gap-1">${upbitBtn}${binanceBtn}</div>
        </div>
      </div>`;
  }).join("");

  resDiv.style.display = "block";
}

// 선택 로직 (티커명 검색창 전송 + 이름 유지)
async function selectSymbol(s, forceMarket = null) {
  currentAsset = s;

  // [중요] 검색창에 티커명 즉시 반영 (기존 기능 유지)
  const symInput = document.getElementById("symbol-input");
  if (symInput) symInput.value = s;

  const searchRes = document.getElementById("search-results");
  if (searchRes) searchRes.style.display = "none";

  // 마켓 우선순위 결정 (기본: 선물 > 현물 > 업비트)
  if (forceMarket) {
    currentMarket = forceMarket;
  } else {
    // 🚀 [수정] 중괄호로 감싸고 "문자열"임을 명확히 선언!
    if (marketDataMap.futures && marketDataMap.futures.includes(s)) {
      currentMarket = "FUTURES";
    } else if (marketDataMap.spot && marketDataMap.spot.includes(s)) {
      currentMarket = "SPOT";
    } else if (marketDataMap.upbit && marketDataMap.upbit.includes(s)) {
      currentMarket = "UPBIT";
    }
  }
  // 헤더 텍스트 초기화
  const headAssetName = document.getElementById("head-asset-name");
  if (headAssetName) headAssetName.innerText = s;

  // 배지 업데이트
  updateExchangeBadges(s);

  // 🚀 [핵심] 코인 이름 가져와서 "티커 (이름)" 형태로 덮어쓰기
  try {
    const infoRes = await fetch(`/api/coin-info/${s}`);
    const infoData = await infoRes.json();
    if (headAssetName && infoData.name) {
      headAssetName.innerText = `${s} (${infoData.name})`;
    }
  } catch (e) {
    console.error("이름 로드 실패", e);
  }

  // 차트 호출
  const isFutures = (currentMarket === "FUTURES");
  const isSpot = (currentMarket === "SPOT");
  fetchHistory(s, isFutures, isSpot);
}

// 배지 UI 업데이트 헬퍼
function updateExchangeBadges(s) {
  let badges = "";
  if (marketDataMap.upbit?.includes(s)) badges += `<span class="bg-[#093687] text-white text-[10px] px-1.5 py-0.5 rounded">UPBIT</span>`;
  if (marketDataMap.futures?.includes(s)) badges += `<span class="bg-[#f0b90b] text-black text-[10px] px-1.5 py-0.5 rounded ml-1">B-FUTURES</span>`;
  if (marketDataMap.spot?.includes(s)) badges += `<span class="bg-[#444] text-white text-[10px] px-1.5 py-0.5 rounded ml-1">B-SPOT</span>`;

  const badgeContainer = document.getElementById("exchange-badges");
  if (badgeContainer) badgeContainer.innerHTML = badges;
}

async function fetchHistory(symbol) {
  const now = Date.now();
  if (now - lastFetchTime < 50) return;
  lastFetchTime = now;

  const displayName = symbol || currentAsset;
  const rawSymbol = displayName.split('(')[0].trim().toUpperCase();

  currentAsset = displayName;

  const isFutures = (currentMarket === "FUTURES");
  const isSpot = (currentMarket === "SPOT");
  const isUpbit = (currentMarket === "UPBIT");

  // 티커 규격 맞추기
  const binanceTicker = `${rawSymbol}USDT`;
  const upbitTicker = `KRW-${rawSymbol}`;

  const loadingModal = document.getElementById("chart-loading-modal");
  if (loadingModal) loadingModal.classList.remove("hidden");

  try {
    mainData = [];
    let raw = [];

    // 🚀 [구조화] 바이낸스 vs 업비트 분기
    if (isFutures || isSpot) {
      const exchange = isFutures ? "binance_futures" : "binance_spot";
      const res = await fetch(`/api/candles?exchange=${exchange}&symbol=${binanceTicker}&interval=${currentTF}&limit=500`);
      raw = await res.json();

      if (Array.isArray(raw) && !raw.error) {
        mainData = raw.map(d => ({
          time: Number(d[0]) / 1000,
          open: Number(d[1]), high: Number(d[2]), low: Number(d[3]), close: Number(d[4])
        }));
      }
    } else {
      // [개선] 재료 고르기 (업비트 지원 목록)
      const supportedMin = [1, 3, 5, 10, 15, 30, 60, 240];
      const v = parseInt(currentTF);
      const u = currentTF.replace(/[0-9]/g, '');
      const totalSec = tfSec[currentTF] || 60;

      let fetchInterval, step = 1;

      if (u === 'd' || u === 'w' || u === 'M') {
        // 일/주/월 단위: 3d면 'days' 가져와서 3개 합치기
        fetchInterval = (u === 'w') ? 'weeks' : (u === 'M') ? 'months' : 'days';
        step = (currentTF === '3d') ? 3 : 1;
      } else {
        // 분/시간 단위: 120분(2h)이면 60분봉 가져와서 2개 합치기
        const targetMin = totalSec / 60;
        // 나눌 수 있는 가장 큰 지원 분봉 찾기
        const baseMin = supportedMin.reverse().find(m => targetMin % m === 0) || 1;
        fetchInterval = `minutes/${baseMin}`;
        step = targetMin / baseMin;
      }

      // 2. 데이터 가져오기 (압축을 위해 limit 넉넉히)
      const fetchLimit = Math.min(200 * step, 600);
      const res = await fetch(`/api/candles?exchange=upbit&symbol=${upbitTicker}&interval=${fetchInterval}&limit=${fetchLimit}`);
      raw = await res.json();

      if (Array.isArray(raw) && !raw.error) {
        let baseData = raw.reverse().map(d => ({
          time: Math.floor(Date.parse(d.candle_date_time_utc + "Z") / 1000),
          open: d.opening_price, high: d.high_price, low: d.low_price, close: d.trade_price
        }));

        // 🚀 3. 무지성 합치기 (step이 1이면 그냥 통과, 아니면 압축)
        mainData = [];
        for (let i = 0; i < baseData.length; i += step) {
          const chunk = baseData.slice(i, i + step);
          if (chunk.length > 0) {
            mainData.push({
              time: chunk[0].time,
              open: chunk[0].open,
              high: Math.max(...chunk.map(c => c.high)),
              low: Math.min(...chunk.map(c => c.low)),
              close: chunk[chunk.length - 1].close
            });
          }
        }
      }
    }

    // 3. 차트 렌더링
    if (mainData.length > 0) {
      if (candleSeries) {
        candleSeries.setData(mainData);

        // 🚀 [보정] 데이터가 셋팅되고 '실제로 화면에 그려질 시간' 약간 주기
        requestAnimationFrame(() => {
          // setupCountdownDOM();
          updateStatus();
          autoFit();
        });
      }
      // 실시간 캔들 시작
      if (typeof startRealtimeCandle === "function") {
        startRealtimeCandle(rawSymbol, currentTF, isFutures, isSpot);
      }
    }
  } catch (e) {
    console.error("차트 로드 실패:", e);
  } finally {
    if (loadingModal) loadingModal.classList.add("hidden");
  }
}