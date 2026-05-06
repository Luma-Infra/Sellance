// api.js
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

  resDiv.innerHTML = filtered
    .map((s) => {
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
        : isBinanceSpot
          ? `<button class="bg-[#333] text-white text-[9px] px-2 py-1 rounded font-bold border border-[#555]" 
                                   onclick="event.stopPropagation(); selectSymbol('${s}', 'SPOT')">B-SPOT</button>`
          : "";

      return `
      <div class="flex items-center justify-between p-2 cursor-pointer border-b border-theme-border text-[13px] hover:bg-white/5" 
           onclick="selectSymbol('${s}')">
        <div class="flex items-center gap-2">
          <b class="w-[50px]">${s}</b>
          <div class="flex gap-1">${upbitBtn}${binanceBtn}</div>
        </div>
      </div>`;
    })
    .join("");

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
  const isFutures = currentMarket === "FUTURES";
  const isSpot = currentMarket === "SPOT";
  fetchHistory(s, isFutures, isSpot);
}

// 배지 UI 업데이트 헬퍼
function updateExchangeBadges(s) {
  let badges = "";
  if (marketDataMap.upbit?.includes(s))
    badges += `<span class="bg-[#093687] text-white text-[10px] px-1.5 py-0.5 rounded">UPBIT</span>`;
  if (marketDataMap.futures?.includes(s))
    badges += `<span class="bg-[#f0b90b] text-black text-[10px] px-1.5 py-0.5 rounded ml-1">B-FUTURES</span>`;
  if (marketDataMap.spot?.includes(s))
    badges += `<span class="bg-[#444] text-white text-[10px] px-1.5 py-0.5 rounded ml-1">B-SPOT</span>`;

  const badgeContainer = document.getElementById("exchange-badges");
  if (badgeContainer) badgeContainer.innerHTML = badges;
}

// executeSetTF나 코인 클릭 함수(selectSymbol) 등 마켓이 바뀌는 모든 시점에 이 '세척기'를 돌려야 합니다.
function clearChartData() {
  // 🚀 전역 데이터 장부 완전 소각
  mainData = [];

  // 🚀 차트 시리즈 데이터 즉시 비우기
  // if (candleSeries) candleSeries.setData([]);
  // if (previewSeries) previewSeries.setData([]);

  // 🚀 [추가] 캔들은 남겨두되, 가격축은 미리 '오토'로 풀어서
  // 새 데이터가 올 때 부드럽게 적응할 준비를 시킵니다.
  if (chart) {
    chart.priceScale("right").applyOptions({ autoScale: true });
  }

  // 🚀 카운트다운 라벨도 유령 방지를 위해 삭제
  if (countdownPriceLine && candleSeries) {
    candleSeries.removePriceLine(countdownPriceLine);
    countdownPriceLine = null;
  }
  console.log("🧹 차트 찌꺼기 청소 및 잔상 제거 준비 완료! (장대봉 방지)");
}

async function fetchHistory(symbol) {
  const now = Date.now();
  if (now - lastFetchTime < 10) return;
  lastFetchTime = now;

  // 🚀 [셔터 내림] 지금부터 차트 공사 중! 소켓 데이터 난입 금지!
  window.isFetchingChart = true;

  clearChartData();

  const displayName = symbol || currentAsset;
  const rawSymbol = displayName.split("(")[0].trim().toUpperCase();

  currentAsset = displayName;

  const isFutures = currentMarket === "FUTURES";
  const isSpot = currentMarket === "SPOT";
  const isUpbit = currentMarket === "UPBIT";

  // 🚀 [세련된 방법] 현재 클릭한 코인의 전체 데이터(장부)를 찾습니다.
  const rowInfo = window.currentTableData.find((c) => c.Symbol === rawSymbol);

  // 🚀 장부에 Upbit_Symbol이 적혀있으면 그거 쓰고, 없으면 그냥 원본(rawSymbol) 씁니다.
  const bTicker = rawSymbol;
  const uTicker =
    rowInfo && rowInfo.Upbit_Symbol ? rowInfo.Upbit_Symbol : rawSymbol;

  // 티커 규격 맞추기 (알아서 BTTC와 BTT로 나뉘어 들어감)
  const binanceTicker = `${bTicker}USDT`;
  const upbitTicker = `KRW-${uTicker}`;

  // 🚀 [백엔드 장부 200% 활용] 김프를 계산할 수 있는 자격증명
  const hasUpbit = marketDataMap.upbit?.includes(uTicker);
  const hasBinanceSpot = marketDataMap.spot?.includes(bTicker);
  const hasBinanceFutures = marketDataMap.futures?.includes(bTicker);
  const canCalcKimchi = hasUpbit && (hasBinanceSpot || hasBinanceFutures);

  // 🚀 임시 환율 (백엔드 장부에 krw_usd_rate를 담아주면 더 좋습니다!)
  const exchangeRate = marketDataMap.krw_usd_rate || 1480.0;

  const loadingModal = document.getElementById("chart-loading-modal");
  if (loadingModal) loadingModal.classList.remove("hidden");

  try {
    mainData = [];
    let raw = [];
    let volumeData = []; // 볼륨 배열
    let kimchiData = []; // 김프 배열

    // 🚀 [구조화] 바이낸스 vs 업비트 분기
    if (isFutures || isSpot) {
      const exchange = isFutures ? "binance_futures" : "binance_spot";
      const res = await fetch(
        `/api/candles?exchange=${exchange}&symbol=${binanceTicker}&interval=${currentTF}&limit=500`,
      );
      raw = await res.json();

      if (Array.isArray(raw) && !raw.error) {
        // 🚀 d를 받아서 한 놈씩 가공 시작!
        mainData = raw.map((d) => {
          // 1. 재료 준비 (이 블록 안에서만 쓰는 변수들)
          const time = Number(d[0]) / 1000;
          const open = Number(d[1]);
          const high = Number(d[2]);
          const low = Number(d[3]);
          const close = Number(d[4]);
          const vol = Number(d[5]);

          // 2. [추가] 볼륨 장부에 기록 (매 바퀴마다 실행)
          volumeData.push({
            time: time,
            value: vol,
            color:
              close >= open
                ? "rgba(38, 166, 154, 0.5)"
                : "rgba(239, 83, 80, 0.5)",
          });

          // 3. 메인 캔들 데이터 반환 (이게 모여서 mainData 배열이 됨)
          return { time, open, high, low, close };
        });
      }
    } else {
      // [개선] 재료 고르기 (업비트 지원 목록)
      const supportedMin = [1, 3, 5, 10, 15, 30, 60, 240];
      const v = parseInt(currentTF);
      const u = currentTF.replace(/[0-9]/g, "");
      const totalSec = tfSec[currentTF] || 60;

      let fetchInterval,
        step = 1;

      if (u === "d" || u === "w" || u === "M") {
        fetchInterval = u === "w" ? "weeks" : u === "M" ? "months" : "days";
        step = currentTF === "3d" ? 3 : 1;
      } else {
        const targetMin = totalSec / 60;
        const baseMin =
          supportedMin.reverse().find((m) => targetMin % m === 0) || 1;
        fetchInterval = `minutes/${baseMin}`;
        step = targetMin / baseMin;
      }

      const fetchLimit = Math.min(200 * step, 600);
      const res = await fetch(
        `/api/candles?exchange=upbit&symbol=${upbitTicker}&interval=${fetchInterval}&limit=${fetchLimit}`,
      );
      raw = await res.json();

      if (Array.isArray(raw) && !raw.error) {
        // 🚀 [수정됨 1] 업비트 원본 데이터에서 거래량(vol) 파싱!
        let baseData = raw.reverse().map((d) => ({
          time: Math.floor(Date.parse(d.candle_date_time_utc + "Z") / 1000),
          open: d.opening_price,
          high: d.high_price,
          low: d.low_price,
          close: d.trade_price,
          vol: d.candle_acc_trade_volume, // 💡 업비트 전용 거래량 필드
        }));

        mainData = [];
        // 🚀 [수정됨 2] 캔들을 압축(chunk)할 때, 거래량도 같이 다 더해버립니다!
        for (let i = 0; i < baseData.length; i += step) {
          const chunk = baseData.slice(i, i + step);
          if (chunk.length > 0) {
            const time = chunk[0].time;
            const open = chunk[0].open;
            const close = chunk[chunk.length - 1].close;
            const high = Math.max(...chunk.map((c) => c.high));
            const low = Math.min(...chunk.map((c) => c.low));

            // 💡 15분봉 4개를 1시간봉으로 합치면, 거래량 4개도 싹 다 더해야 합니다 (reduce 사용)
            const totalVol = chunk.reduce((sum, c) => sum + (c.vol || 0), 0);

            // 1. 메인 캔들 장부 기록
            mainData.push({ time, open, high, low, close });

            // 2. 캔들과 완벽하게 똑같은 시간(time)으로 볼륨 장부 기록 (1:1 매칭 철벽 방어!)
            volumeData.push({
              time: time,
              value: totalVol,
              color:
                close >= open
                  ? "rgba(38, 166, 154, 0.5)"
                  : "rgba(239, 83, 80, 0.5)",
            });
          }
        }
      }
    }

    // (이전 업비트 압축 로직 끝나는 부분...)
    // 🚀 [여기서부터 추가!]
    // 2.5 [김프 엔진] 두 거래소에 모두 상장된 경우 상대방 데이터 훔쳐오기
    // 🚀 [수정됨] 2.5 [김프 엔진] 두 거래소에 모두 상장된 경우 크로스 비교 (확장성 고려)
    // 🚀 [해결됨] 2.5 [김프 엔진] 시간차 어긋남 및 API 에러 완벽 방어
    // kimchiData = []; // 전역 접근을 위해 초기화 보장

    if (canCalcKimchi && mainData.length > 0) {
      const isKoreanMarket = ["UPBIT", "BITHUMB"].includes(currentMarket);
      const subExchange = isKoreanMarket ? "binance_futures" : "upbit";
      const subSymbol = isKoreanMarket ? binanceTicker : upbitTicker;

      let fetchUrl = `/api/candles?exchange=${subExchange}&symbol=${subSymbol}&interval=${currentTF}&limit=500`;

      // 🚨 [핵심 1] 서브 차트가 업비트라면, 업비트가 알아듣는 시간표로 번역해서 가져옵니다! (에러 방지)
      if (subExchange === "upbit") {
        const u = currentTF.replace(/[0-9]/g, "");
        const totalSec = tfSec[currentTF] || 60;
        let subInterval = "minutes/1"; // 기본 고해상도 베이스

        if (u === "d" || u === "w" || u === "M") {
          subInterval = u === "w" ? "weeks" : u === "M" ? "months" : "days";
        } else {
          const targetMin = totalSec / 60;
          const supportedMin = [1, 3, 5, 10, 15, 30, 60, 240];
          const baseMin =
            supportedMin.reverse().find((m) => targetMin % m === 0) || 1;
          subInterval = `minutes/${baseMin}`;
        }
        // 베이스 분봉으로 넉넉히 가져와서 나중에 시간만 뽑아 먹습니다.
        fetchUrl = `/api/candles?exchange=upbit&symbol=${subSymbol}&interval=${subInterval}&limit=1000`;
      }

      const subRes = await fetch(fetchUrl);
      let subRaw = await subRes.json();

      if (Array.isArray(subRaw) && !subRaw.error) {
        subRaw.sort((a, b) => {
          const timeA =
            subExchange === "upbit"
              ? Math.floor(Date.parse(a.candle_date_time_utc + "Z") / 1000)
              : Number(a[0]) / 1000;
          const timeB =
            subExchange === "upbit"
              ? Math.floor(Date.parse(b.candle_date_time_utc + "Z") / 1000)
              : Number(b[0]) / 1000;
          return timeA - timeB;
        });

        let subIndex = 0;
        let lastKnownSubClose = null;

        // 🚨 [핵심 2] 메인 캔들 시간에 맞춰서 서브 가격을 동기화합니다.
        mainData.forEach((candle) => {
          while (subIndex < subRaw.length) {
            const subItem = subRaw[subIndex];
            const subTime =
              subExchange === "upbit"
                ? Math.floor(
                    Date.parse(subItem.candle_date_time_utc + "Z") / 1000,
                  )
                : Number(subItem[0]) / 1000;

            if (subTime <= candle.time) {
              lastKnownSubClose =
                subExchange === "upbit"
                  ? subItem.trade_price
                  : Number(subItem[4]);
              subIndex++;
            } else {
              break;
            }
          }

          if (lastKnownSubClose) {
            const korPrice = isKoreanMarket ? candle.close : lastKnownSubClose;
            const glbPrice = isKoreanMarket ? lastKnownSubClose : candle.close;
            const kimchiPct = (korPrice / (glbPrice * exchangeRate) - 1) * 100;

            let kColor =
              kimchiPct < 0 ? "#2E8B57" : kimchiPct < 4 ? "#57a4fc" : "#FF4500";
            kimchiData.push({
              time: candle.time,
              value: kimchiPct,
              color: kColor,
            });
          }
        });
      }
    }

    // 3. 차트 렌더링 (fetchHistory 마지막 부분)
    if (mainData.length > 0 && candleSeries) {
      const row = currentTableData.find((c) => c.Symbol === rawSymbol);
      const p = row ? Number(row.precision) : 2;

      candleSeries.applyOptions({
        priceFormat: {
          type: "price",
          precision: p,
          minMove: p > 0 ? Number((1 / Math.pow(10, p)).toFixed(p)) : 1,
          formatter: (price) => formatSmartPrice(price, p),
        },
      });

      // 3개 차트에 각각 데이터 발사!
      candleSeries.setData(mainData);
      if (volumeSeries && volumeData.length > 0)
        volumeSeries.setData(volumeData);
      if (kimchiSeries) kimchiSeries.setData(kimchiData);

      // 🚀 데이터가 꽂혔으니, 김프 유무에 따라 창 크기 분배!
      applyChartLayout();

      if (typeof startRealtimeCandle === "function") {
        const targetSymbol = isUpbit ? uTicker : bTicker;
        startRealtimeCandle(rawSymbol, currentTF, isFutures, isSpot);
      }

      requestAnimationFrame(() => {
        chart.timeScale().fitContent(); // X축 줌 맞추기
        updateStatus();
        if (typeof autoFit === "function") autoFit();
        window.isFetchingChart = false;
      });
    }
  } catch (e) {
    console.error("차트 로드 실패:", e);
  } finally {
    if (loadingModal) loadingModal.classList.add("hidden");
  }
}
