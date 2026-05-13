// api.js
import { store, tfSec } from "./store.js";

// --- 📡 API Fetch 로직 ---
export async function loadSymbols() {
  try {
    const res = await fetch("/api/market-map");
    const data = await res.json();

    // 🚀 [핵심] 모든 엔진이 공통으로 쓰는 '장부'에 데이터를 꽂아넣으세요!
    store.marketDataMap = data;
    store.allSymbols = data.all_assets;

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

// 🚀 [추가] 백엔드 정규식 이식: 1000XEC, 1MBABYDOGE 등 단위 배수 추출기
function getMultiplier(sym) {
  if (!sym) return 1;
  const match = sym.match(/^(10+|1[MB])(?=[A-Z])/i);
  if (!match) return 1;
  const p = match[1].toUpperCase();
  if (p === "1M") return 1000000;
  if (p === "1B") return 1000000000;
  return parseInt(p, 10);
}

// 🚀 [추가] 순수 코인명(Base Asset) 추출기 (1000XEC -> XEC)
function getPureBase(sym) {
  if (!sym) return "";
  return sym.replace(/^(10+|1[MB])(?=[A-Z])/i, "").toUpperCase();
}

// 검색창 비우기 (X 버튼용)
export function clearSearch() {
  const input = document.getElementById("symbol-input");
  input.value = "";
  input.focus();
  searchSymbols("");
}

// 검색 리스트 (티커 + 태그 유지 버전)
export function searchSymbols(v) {
  const resDiv = document.getElementById("search-results");
  if (!resDiv) return;

  if (!v || v.trim() === "") {
    resDiv.style.display = "none";
    return;
  }

  // 🚀 [핵심] 검색어가 있든 없든, 필터링해서 보여줌
  const query = v.toUpperCase();
  const filtered = store.currentTableData
    .filter(
      (r) =>
        r.DisplayTicker.toUpperCase().includes(query) ||
        r.Name.toUpperCase().includes(query) ||
        r.Symbol.toUpperCase().includes(query),
    )
    .slice(0, 20);

  if (filtered.length === 0) {
    resDiv.style.display = "none";
    return;
  }

  resDiv.innerHTML = filtered
    .map((r) => {
      const s = r.DisplayTicker;
      const isUpbit = r.Upbit === "O";
      const isBinanceSpot = r.Listed_Exchanges?.includes("BINANCE");
      const isBinanceFutures = r.Listed_Exchanges?.includes("BINANCE_FUTURES");
      const isBithumb = r.Listed_Exchanges?.includes("BITHUMB");

      // 거래소 버튼 (분기 유지)
      let upbitBtn = isUpbit
        ? `<button class="bg-[#093687] text-white text-[9px] px-2 py-1 rounded font-bold mr-1 hover:brightness-125" 
                 onclick="event.stopPropagation(); selectSymbol('${s}', 'UPBIT')">UPBIT</button>`
        : "";
      let bithumbBtn = isBithumb
        ? `<button class="bg-[#ff8b00] text-white text-[9px] px-2 py-1 rounded font-bold mr-1 hover:brightness-125" 
                 onclick="event.stopPropagation(); selectSymbol('${s}', 'BITHUMB')">BITHUMB</button>`
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
          ${r.Logo || ""}
          <div class="flex flex-col">
            <b class="w-auto text-theme-text">${s}</b>
            <span class="text-[10px] text-theme-text opacity-60">${r.Name || ""}</span>
          </div>
        </div>
          <div class="flex gap-1">${upbitBtn}${bithumbBtn}${binanceBtn}</div>
      </div>`;
    })
    .join("");

  resDiv.style.display = "block";
}

// 선택 로직 (티커명 검색창 전송 + 이름 유지)
export async function selectSymbol(s, forceMarket = null) {
  store.currentAsset = s;
  store.currentSelectedSymbol = s; // 🚀 전역 선택자 동기화

  // [중요] 검색창에 티커명 즉시 반영 (기존 기능 유지)
  const symInput = document.getElementById("symbol-input");
  if (symInput) symInput.value = s;

  const searchRes = document.getElementById("search-results");
  if (searchRes) searchRes.style.display = "none";

  const rowInfo = store.currentTableData.find((c) => c.DisplayTicker === s);

  // 마켓 우선순위 결정 (기본: 선물 > 현물 > 업비트)
  if (forceMarket) {
    store.currentMarket = forceMarket;
  } else {
    // 🚀 [수정] 중괄호로 감싸고 "문자열"임을 명확히 선언!
    if (rowInfo && rowInfo.Listed_Exchanges) {
      if (rowInfo.Listed_Exchanges.includes("BINANCE_FUTURES")) {
        store.currentMarket = "FUTURES";
      } else if (rowInfo.Listed_Exchanges.includes("BINANCE")) {
        store.currentMarket = "SPOT";
      } else if (rowInfo.Listed_Exchanges.includes("UPBIT")) {
        store.currentMarket = "UPBIT";
      } else if (rowInfo.Listed_Exchanges.includes("BITHUMB")) {
        store.currentMarket = "BITHUMB";
      }
    }
  }
  // 🚀 [수정] 헤더 텍스트 초기화 및 이름(Name) 즉시 덮어쓰기 (예: ZRO (LayerZero))
  const headAssetName = document.getElementById("head-asset-name");
  if (headAssetName) {
    if (rowInfo && rowInfo.Name) {
      headAssetName.innerText = `${rowInfo.Symbol} (${rowInfo.Name})`;
    } else {
      headAssetName.innerText = s;
    }
  }

  // 🚀 헤더 정보 업데이트 (M.Cap, 볼륨 등)
  if (rowInfo) {
    const headMcap = document.getElementById("head-mcap");
    const headVolB = document.getElementById("head-vol-binance");
    const headVolU = document.getElementById("head-vol-upbit");

    if (headMcap) headMcap.innerText = rowInfo.MarketCap_Formatted || "-";
    if (headVolB) headVolB.innerText = rowInfo.Binance_Vol_Formatted || "-";
    if (headVolU) headVolU.innerText = rowInfo.Upbit_Vol_Formatted || "-";
  }

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

  // 🚀 [추가] 검색해서 선택했으면 왼쪽 테이블도 해당 코인 위치로 멱살 잡고 끌고 옴
  setTimeout(() => {
    store.currentSelectedSymbol = s; // 선택자 동기화
    const targetRow = document.querySelector(`#table-body tr[data-sym="${s}"]`);
    if (targetRow) {
      targetRow.scrollIntoView({ block: "center", behavior: "smooth" });
      if (typeof applySelectedHighlight === "function")
        applySelectedHighlight();
    }
  }, 100); // 렌더링 대기 후 이동

  // 🚀 [추가] 검색한 코인이 현재 테이블 렌더링 범위(50개) 밖에 있을 경우 대응
  const sortedList = store.currentTableData;
  const targetIdx = sortedList.findIndex((item) => item.DisplayTicker === s);

  if (targetIdx !== -1) {
    // 1. 만약 현재 렌더링 한도보다 뒤에 있다면 한도를 늘리고 재렌더링
    if (targetIdx >= store.currentRenderLimit) {
      store.currentRenderLimit = targetIdx + 1;
      if (typeof renderTable === "function") renderTable();
    }

    // 2. 해당 행으로 스크롤 이동 및 하이라이트
    setTimeout(() => {
      const targetRow = document.querySelector(
        `#table-body tr[data-sym="${s}"]`,
      );
      if (targetRow) {
        targetRow.scrollIntoView({ block: "center", behavior: "smooth" });
        if (typeof applySelectedHighlight === "function")
          applySelectedHighlight();
      }
    }, 100);
  }

  // 🚀 [버그 픽스] 중복 호출 제거 및 파라미터(isTfChange) 오류 수정
  fetchHistory(s);
}

// 배지 UI 업데이트 헬퍼
export function updateExchangeBadges(s) {
  const rowInfo = store.currentTableData.find((c) => c.DisplayTicker === s);
  let badges = "";
  if (rowInfo && rowInfo.Listed_Exchanges) {
    if (rowInfo.Listed_Exchanges.includes("UPBIT"))
      badges += `<span class="bg-[#093687] text-white text-[10px] px-1.5 py-0.5 rounded">UPBIT</span>`;
    if (rowInfo.Listed_Exchanges.includes("BINANCE_FUTURES"))
      badges += `<span class="bg-[#f0b90b] text-black text-[10px] px-1.5 py-0.5 rounded ml-1">B-FUT</span>`;
    if (rowInfo.Listed_Exchanges.includes("BINANCE"))
      badges += `<span class="bg-[#444] text-white text-[10px] px-1.5 py-0.5 rounded ml-1">B-SPOT</span>`;
    if (rowInfo.Listed_Exchanges.includes("BITHUMB"))
      badges += `<span class="bg-[#ff8b00] text-white text-[10px] px-1.5 py-0.5 rounded ml-1">BITHUMB</span>`;
  }

  const badgeContainer = document.getElementById("exchange-badges");
  if (badgeContainer) badgeContainer.innerHTML = badges;
}

// executeSetTF나 코인 클릭 함수(selectSymbol) 등 마켓이 바뀌는 모든 시점에 이 '세척기'를 돌려야 합니다.
export function clearChartData(isTfChange = false) {
  if (isTfChange) {
    // 🚀 타임프레임 변경: 기존 캔들과 김프 데이터를 모두 유지하여 눈의 피로(깜빡임)를 제거합니다.
    // (새로운 데이터를 받아오는 순간 한 방에 덮어씌움)
    if (store.countdownPriceLine && store.candleSeries) {
      store.candleSeries.removePriceLine(store.countdownPriceLine);
      store.countdownPriceLine = null;
    }
    console.log("🧹 타임프레임 변경: 기존 차트 잔상 유지 (깜빡임 방지)");
  } else {
    // 🚀 전역 데이터 장부 완전 소각
    store.mainData = [];
    store.volumeData = [];
    store.kimchiData = [];

    // 🚨 [핵심] 차트 시리즈 데이터 즉시 비우기
    if (store.candleSeries) store.candleSeries.setData([]);
    if (store.previewSeries) store.previewSeries.setData([]);
    if (store.volumeSeries) store.volumeSeries.setData([]);
    if (store.kimchiSeries) store.kimchiSeries.setData([]);

    if (store.chart) {
      store.chart.priceScale("right").applyOptions({ autoScale: true });
      if (typeof window.resetPriceScaleWidthSync === "function") {
        window.resetPriceScaleWidthSync();
      }
    }

    if (store.countdownPriceLine && store.candleSeries) {
      store.candleSeries.removePriceLine(store.countdownPriceLine);
      store.countdownPriceLine = null;
    }
    console.log("🧹 차트 찌꺼기 청소 및 잔상 제거 준비 완료! (장대봉 방지)");
  }
}

export async function fetchHistory(symbol, isTfChange = false) {
  const now = Date.now();
  if (now - store.lastFetchTime < 10) return;
  store.lastFetchTime = now;

  store.isFetchingChart = true;
  window.isFetchingChart = true; // 🚨 웹소켓 차단 동기화
  clearChartData(isTfChange);

  const displayName = symbol || store.currentAsset;
  const rawSymbol = displayName.split("(")[0].trim().toUpperCase();
  store.currentAsset = displayName;

  // 🚀 2. 여기서 전역 변수(currentMarket)를 기준으로 마켓을 직접 판별하게 복구!
  const isFutures = store.currentMarket === "FUTURES";
  const isSpot = store.currentMarket === "SPOT";
  const isUpbit = store.currentMarket === "UPBIT";
  const isBithumb = store.currentMarket === "BITHUMB";

  // 🚀 [UID 기반 핀포인트 방어] EDGE처럼 이름이 겹쳐도, 현재 선택된 마켓에 맞는 진짜 장부만 가져옵니다!
  let rowInfo = store.currentTableData.find((c) => {
    if (c.DisplayTicker !== displayName) return false; // 🚀 [수정] 완벽한 고유 명찰로 검색
    if (store.currentMarket === "UPBIT" && c.Upbit === "O") return true;
    if (
      store.currentMarket === "FUTURES" &&
      c.Listed_Exchanges?.includes("BINANCE_FUTURES")
    )
      return true;
    if (
      store.currentMarket === "SPOT" &&
      c.Listed_Exchanges?.includes("BINANCE")
    )
      return true;
    if (
      store.currentMarket === "BITHUMB" &&
      c.Listed_Exchanges?.includes("BITHUMB")
    )
      return true;
    return false;
  });
  if (!rowInfo)
    rowInfo = store.currentTableData.find(
      (c) => c.DisplayTicker === displayName,
    ); // 🚀 [수정]

  // 🚀 [핵심] 백엔드가 장부에 심어준 "정확한 티커명(1000XEC 등)"을 100% 신뢰하여 즉시 추출!
  const exactSpot =
    rowInfo && rowInfo.Exact_Spot ? rowInfo.Exact_Spot : rawSymbol;
  const exactFutures =
    rowInfo && rowInfo.Exact_Futures ? rowInfo.Exact_Futures : rawSymbol;
  const exactUpbit =
    rowInfo && rowInfo.Upbit_Symbol ? rowInfo.Upbit_Symbol : rawSymbol;
  const exactBithumb = getPureBase(rawSymbol); // 빗썸은 순수 티커명 사용

  // 현재 마켓의 정확한 심볼 지정
  let mainTickerStr = rawSymbol;
  if (isFutures) mainTickerStr = exactFutures;
  else if (isSpot) mainTickerStr = exactSpot;
  else if (isUpbit) mainTickerStr = exactUpbit;
  else if (isBithumb) mainTickerStr = exactBithumb;

  const mainMulti = getMultiplier(mainTickerStr);

  // API 호출용 Ticker 규격 맞추기
  const binanceTicker = isFutures ? `${exactFutures}USDT` : `${exactSpot}USDT`;
  const krwTicker =
    store.currentMarket === "BITHUMB"
      ? `${exactBithumb}_KRW`
      : `KRW-${exactUpbit}`;

  // 🚀 임시 환율 (백엔드 장부에 krw_usd_rate를 담아주면 더 좋습니다!)
  const exchangeRate = store.marketDataMap.krw_usd_rate || 1480.0;

  const loadingModal = document.getElementById("chart-loading-modal");
  if (loadingModal && !isTfChange) loadingModal.classList.remove("hidden");

  // 🚀 [추가] 차트 영역에 로딩 클래스 부여 (어둡고 축소 시작)
  const wrapper = document.getElementById("chart-wrapper");
  if (wrapper && !isTfChange) wrapper.classList.add("chart-loading");

  try {
    const snapshotAsset = store.currentAsset;
    const snapshotTF = store.currentTF;

    let newMainData = [];
    let newVolumeData = [];

    const style = getComputedStyle(document.body);
    const upColorVol =
      (style.getPropertyValue("--up").trim() || "#26a69a") + "80";
    const downColorVol =
      (style.getPropertyValue("--down").trim() || "#ef5350") + "80";

    // ==========================================
    // 1️⃣ 메인 차트 최우선 수집 및 즉시 조립
    // ==========================================
    let rawMain = [];
    let mainStep = 1;

    if (isFutures || isSpot) {
      const exchange = isFutures ? "binance_futures" : "binance_spot";
      const res = await fetch(
        `/api/candles?exchange=${exchange}&symbol=${binanceTicker}&interval=${store.currentTF}&limit=500`,
      );
      const raw = await res.json();
      if (Array.isArray(raw) && !raw.error) {
        rawMain = raw
          .map((d) => ({
            time: Number(d[0]) / 1000 || 0,
            open: Number(d[1]) || 0,
            high: Number(d[2]) || 0,
            low: Number(d[3]) || 0,
            close: Number(d[4]) || 0,
            vol: Number(d[5]) || 0,
          }))
          .filter((d) => d.time > 0 && d.open > 0);
      }
    } else {
      const supportedMin = [1, 3, 5, 10, 15, 30, 60, 240];
      const totalSec = tfSec[store.currentTF] || 60;
      let fetchInterval;

      const u = store.currentTF.replace(/[0-9]/g, "");
      if (u === "d" || u === "w" || u === "M") {
        fetchInterval = u === "w" ? "weeks" : u === "M" ? "months" : "days";
        mainStep = store.currentTF === "3d" ? 3 : 1;
      } else {
        const targetMin = totalSec / 60;
        const baseMin =
          supportedMin.reverse().find((m) => targetMin % m === 0) || 1;
        fetchInterval = `minutes/${baseMin}`;
        mainStep = targetMin / baseMin;
      }

      const krwExchange =
        store.currentMarket === "BITHUMB" ? "bithumb" : "upbit";

      if (krwExchange === "bithumb") {
        const bMap = {
          "1m": "1m",
          "3m": "3m",
          "5m": "5m",
          "15m": "10m",
          "30m": "30m",
          "1h": "1h",
          "2h": "1h",
          "4h": "1h",
          "12h": "12h",
          "1d": "24h",
          "3d": "24h",
          "1w": "24h",
          "1M": "24h",
        };
        let bFetchInt = bMap[store.currentTF] || "24h";

        if (["15m", "2h", "4h", "3d", "1w", "1M"].includes(store.currentTF)) {
          if (store.currentTF === "15m") {
            bFetchInt = "1m";
            mainStep = 15;
          }
          if (store.currentTF === "2h") {
            bFetchInt = "1h";
            mainStep = 2;
          }
          if (store.currentTF === "4h") {
            bFetchInt = "1h";
            mainStep = 4;
          }
          if (store.currentTF === "3d") {
            bFetchInt = "24h";
            mainStep = 3;
          }
          if (store.currentTF === "1w") {
            bFetchInt = "24h";
            mainStep = 7;
          }
          if (store.currentTF === "1M") {
            bFetchInt = "24h";
            mainStep = 30;
          }
        } else {
          mainStep = 1;
        }

        const res = await fetch(
          `/api/candles?exchange=bithumb&symbol=${krwTicker}&interval=${bFetchInt}&limit=2000`,
        );
        const bData = await res.json();
        if (bData && bData.data && Array.isArray(bData.data)) {
          rawMain = bData.data
            .map((d) => ({
              time: Number(d[0]) / 1000,
              open: Number(d[1]),
              close: Number(d[2]),
              high: Number(d[3]),
              low: Number(d[4]),
              vol: Number(d[5]),
            }))
            .filter((d) => d.time > 0 && d.open > 0);
        }
      } else {
        const fetchLimit = 500 * mainStep;
        const raw = await fetchPaginated(
          krwExchange,
          krwTicker,
          fetchInterval,
          fetchLimit,
        );
        if (Array.isArray(raw) && !raw.error) {
          rawMain = raw
            .reverse()
            .map((d) => ({
              time:
                Math.floor(Date.parse(d.candle_date_time_utc + "Z") / 1000) ||
                0,
              open: Number(d.opening_price) || 0,
              high: Number(d.high_price) || 0,
              low: Number(d.low_price) || 0,
              close: Number(d.trade_price) || 0,
              vol: Number(d.candle_acc_trade_volume) || 0,
            }))
            .filter((d) => d.time > 0 && d.open > 0);
        }
      }
    }

    if (isFutures || isSpot) {
      rawMain.forEach((d) => {
        newVolumeData.push({
          time: d.time,
          value: d.vol,
          color: d.close >= d.open ? upColorVol : downColorVol,
        });
        newMainData.push({
          time: d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        });
      });
    } else {
      for (let i = 0; i < rawMain.length; i += mainStep) {
        const chunk = rawMain.slice(i, i + mainStep);
        if (chunk.length > 0) {
          const time = chunk[0].time;
          const open = chunk[0].open;
          const close = chunk[chunk.length - 1].close;
          const high = Math.max(...chunk.map((c) => c.high));
          const low = Math.min(...chunk.map((c) => c.low));
          const totalVol = chunk.reduce((sum, c) => sum + (c.vol || 0), 0);
          newMainData.push({ time, open, high, low, close });
          newVolumeData.push({
            time,
            value: totalVol,
            color: close >= open ? upColorVol : downColorVol,
          });
        }
      }
    }

    // ==========================================
    // 2️⃣ 메인 차트 초고속 즉시 렌더링 & 로딩 해제 (Lazy의 시작)
    // ==========================================
    if (store.currentAsset !== snapshotAsset || store.currentTF !== snapshotTF)
      return;

    store.mainData = newMainData;
    store.volumeData = newVolumeData;

    const isDayUnit = !(store.currentTF || "1h").match(/[hm]/);
    const mapTime = (d) => {
      if (!isDayUnit) return d;
      const dt = new Date(d.time * 1000);
      return {
        ...d,
        time: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`,
      };
    };

    if (store.mainData.length > 0 && store.candleSeries) {
      const row = store.currentTableData.find(
        (c) => c.DisplayTicker === displayName,
      );
      const p = row && row.precision !== undefined ? Number(row.precision) : 2;

      store.candleSeries.applyOptions({
        priceFormat: {
          type: "custom",
          precision: p,
          minMove: p > 0 ? Number((1 / Math.pow(10, p)).toFixed(p)) : 1,
          formatter: (price) => formatSmartPrice(price, p),
        },
      });

      // 메인 시리즈 세팅 및 자동 스케일 (Lazy를 위해 김프는 아직 빈칸!)
      store.candleSeries.setData(store.mainData.map(mapTime));
      if (store.volumeSeries && store.volumeData.length > 0)
        store.volumeSeries.setData(store.volumeData.map(mapTime));
      else if (store.volumeSeries) store.volumeSeries.setData([]);

      if (store.kimchiSeries) store.kimchiSeries.setData([]); // 🚀 과거 김프 잔재 초기화
      store.kimchiData = [];

      if (typeof applyChartLayout === "function") applyChartLayout();
      if (typeof autoFit === "function") autoFit();
      if (typeof updateStatus === "function") updateStatus();

      if (typeof startRealtimeCandle === "function") {
        startRealtimeCandle(
          mainTickerStr,
          store.currentTF,
          isFutures,
          isSpot,
          isUpbit,
          isBithumb,
        );
      }
    }

    // 🚀 [로딩 해제] 이제 사용자는 기다림 없이 차트를 바로 조작 가능합니다.
    if (loadingModal) loadingModal.classList.add("hidden");
    if (wrapper) wrapper.classList.remove("chart-loading");
    window.isFetchingChart = false;
    store.isFetchingChart = false;

    // ==========================================
    // 3️⃣ 김프 데이터 Lazy 렌더링 (백그라운드 비동기)
    // ==========================================
    (async () => {
      try {
        let subExchange = null;
        let subSymbol = null;
        let subMulti = 1;
        let missingTarget = "";
        let availableSubs = [];

        const listedEx = rowInfo ? rowInfo.Listed_Exchanges || [] : [];

        if (
          store.currentMarket === "UPBIT" ||
          store.currentMarket === "BITHUMB"
        ) {
          if (listedEx.includes("BINANCE"))
            availableSubs.push({
              id: "binance_spot",
              name: "B-SPOT",
              bg: "#444",
              text: "#fff",
              sym: `${exactSpot}USDT`,
              pureSym: exactSpot,
            });
          if (listedEx.includes("BINANCE_FUTURES"))
            availableSubs.push({
              id: "binance_futures",
              name: "B-FUT",
              bg: "#f0b90b",
              text: "#000",
              sym: `${exactFutures}USDT`,
              pureSym: exactFutures,
            });
          if (listedEx.includes("BYBIT"))
            availableSubs.push({
              id: "bybit_spot",
              name: "BYBIT",
              bg: "#f7a600",
              text: "#fff",
              sym: `${exactSpot}USDT`,
              pureSym: exactSpot,
            });
          if (availableSubs.length === 0)
            missingTarget = "글로벌 거래소(바이낸스/바이비트)";
        } else {
          if (listedEx.includes("UPBIT"))
            availableSubs.push({
              id: "upbit",
              name: "UPBIT",
              bg: "#093687",
              text: "#fff",
              sym: `KRW-${exactUpbit}`,
              pureSym: exactUpbit,
            });
          if (listedEx.includes("BITHUMB"))
            availableSubs.push({
              id: "bithumb",
              name: "BITHUMB",
              bg: "#ff8b00",
              text: "#fff",
              sym: `${exactBithumb}_KRW`,
              pureSym: exactBithumb,
            });
          if (availableSubs.length === 0)
            missingTarget = "국내 원화 거래소(업비트/빗썸)";
        }

        if (availableSubs.length > 0) {
          const preferred = availableSubs.find(
            (s) => s.id === store.preferredKimchiSub,
          );
          const selected = preferred || availableSubs[0];
          subExchange = selected.id;
          subSymbol = selected.sym;
          subMulti = getMultiplier(selected.pureSym);
          store.preferredKimchiSub = subExchange;

          // 🚀 [추가] 김프 로딩 메시지 UI 동적 렌더링
          let loadingMessageContainer = document.getElementById(
            "kimchi-loading-message",
          );
          if (!loadingMessageContainer) {
            loadingMessageContainer = document.createElement("div");
            loadingMessageContainer.id = "kimchi-loading-message";
            loadingMessageContainer.className =
              "absolute right-3 z-[110] flex gap-1.5 transition-all duration-300 pointer-events-none";
            if (wrapper) wrapper.appendChild(loadingMessageContainer);
          }
          loadingMessageContainer.innerHTML = `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded opacity-60 bg-theme-panel text-theme-text">불러오는중...</span>`;
          loadingMessageContainer.style.display = "flex"; // Show loading message

          let switcherContainer = document.getElementById("kimchi-switcher");
          if (!switcherContainer) {
            switcherContainer = document.createElement("div");
            switcherContainer.id = "kimchi-switcher";
            switcherContainer.className =
              "absolute right-3 z-[110] flex gap-1.5 transition-all duration-300 pointer-events-auto";
            if (wrapper) wrapper.appendChild(switcherContainer);
          }

          if (availableSubs.length > 1) {
            switcherContainer.innerHTML = availableSubs
              .map((s) => {
                const isActive = s.id === subExchange;
                const opacity = isActive
                  ? "opacity-100 ring-2 ring-white/50 scale-105"
                  : "opacity-40 hover:opacity-80";
                return `<button class="text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm transition-all ${opacity}" style="background-color: ${s.bg}; color: ${s.text};" onclick="switchKimchiSub('${s.id}')">${s.name}</button>`;
              })
              .join("");
            switcherContainer.style.display = "flex";
          } else {
            const s = availableSubs[0];
            switcherContainer.innerHTML = `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded opacity-60 pointer-events-none" style="background-color: ${s.bg}; color: ${s.text};">vs ${s.name}</span>`;
            switcherContainer.style.display = "flex";
          }

          store.paneConfig.kimchi = true;
          const noDataMsg = document.getElementById("kimchi-no-data");
          if (noDataMsg) noDataMsg.classList.add("hidden");
          if (typeof applyChartLayout === "function") applyChartLayout();

          // 🚀 김프 데이터 Fetch (Lazy Load)
          const u = store.currentTF.replace(/[0-9]/g, "");
          const totalSec = tfSec[store.currentTF] || 60;
          let upbitInterval = "minutes/1";
          if (u === "d" || u === "w" || u === "M") {
            upbitInterval = u === "w" ? "weeks" : u === "M" ? "months" : "days";
          } else {
            const baseMin =
              [1, 3, 5, 10, 15, 30, 60, 240]
                .reverse()
                .find((m) => (totalSec / 60) % m === 0) || 1;
            upbitInterval = `minutes/${baseMin}`;
          }

          let subRaw = [];
          if (subExchange === "upbit") {
            subRaw = await fetchPaginated(
              subExchange,
              subSymbol,
              upbitInterval,
              500,
            );
          } else if (subExchange === "bithumb") {
            const bMap = {
              "1m": "1m",
              "3m": "3m",
              "5m": "5m",
              "15m": "10m",
              "30m": "30m",
              "1h": "1h",
              "2h": "1h",
              "4h": "1h",
              "12h": "12h",
              "1d": "24h",
              "3d": "24h",
              "1w": "24h",
              "1M": "24h",
            };
            const res = await fetch(
              `/api/candles?exchange=bithumb&symbol=${subSymbol}&interval=${bMap[store.currentTF] || "24h"}&limit=1000`,
            );
            const r = await res.json();
            subRaw = r.data || [];
          } else {
            const res = await fetch(
              `/api/candles?exchange=${subExchange}&symbol=${subSymbol}&interval=${store.currentTF}&limit=500`,
            );
            subRaw = await res.json();
          }

          // 🚀 [하이브리드 환율 맵] 테더 상장(24.06.07) 이전은 FX_IDC:USDKRW, 이후는 KRW-USDT를 합성
          const rateCacheKey = `${store.currentTF}_${upbitInterval}`;
          if (!store.hybridRateCache) store.hybridRateCache = {};
          
          if (!store.hybridRateCache[rateCacheKey]) {
            const results = await Promise.allSettled([
              fetch("/api/usdkrw").then((res) => res.json()),
              fetchPaginated("upbit", "KRW-USDT", upbitInterval, 500),
            ]);
            
            const usdkrwRaw = results[0].status === "fulfilled" ? results[0].value : {};
            const usdtRaw = results[1].status === "fulfilled" ? results[1].value : [];
            
            let hybridTimeline = [];
            // 1. 야후 파이낸스 과거 법정환율 추가
            if (usdkrwRaw && !usdkrwRaw.error) {
              for (let [ts, price] of Object.entries(usdkrwRaw)) {
                hybridTimeline.push({ time: Number(ts), price: price, source: "fiat" });
              }
            }
            // 2. 테더 상장일(1717718400) 이후 테더 환율 덮어쓰기
            if (Array.isArray(usdtRaw) && !usdtRaw.error) {
              usdtRaw.forEach((d) => {
                const t = Math.floor(Date.parse(d.candle_date_time_utc + "Z") / 1000);
                if (t >= 1717718400) {
                  hybridTimeline.push({ time: t, price: Number(d.trade_price), source: "tether" });
                }
              });
            }
            hybridTimeline.sort((a, b) => a.time - b.time);
            store.hybridRateCache[rateCacheKey] = hybridTimeline;
          }
          
          const hybridRateMap = store.hybridRateCache[rateCacheKey];
          const currentFiatRate = store.marketDataMap.krw_usd_rate || 1450.0;

          // 🚀 JS 고속 김프 연산
          let newKimchiData = [];
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
            let rateIndex = 0;
            let lastKnownSubClose = null;

            store.mainData.forEach((candle, index) => {
              // 환율 맵 슬라이딩 윈도우 동기화
              let lastKnownRate = currentFiatRate;
              while (rateIndex < hybridRateMap.length && hybridRateMap[rateIndex].time <= candle.time) {
                lastKnownRate = hybridRateMap[rateIndex].price;
                rateIndex++;
              }

              while (subIndex < subRaw.length) {
                const subItem = subRaw[subIndex];
                const subTime =
                  subExchange === "upbit"
                    ? Math.floor(
                      Date.parse(subItem.candle_date_time_utc + "Z") / 1000,
                    )
                    : Number(subItem[0]) / 1000;

                // 🚀 [조립형 캔들 왜곡 방지] 실제 다음 캔들의 정확한 시작 시간을 기준으로 탐색
                const nextCandle = store.mainData[index + 1];
                let nextCandleTime;
                if (nextCandle) {
                  nextCandleTime = nextCandle.time;
                } else {
                  // 하드코딩 제거: currentTF(예: "15m", "4h", "1d", "1w", "1M")를 파싱하여 동적으로 시간 연산
                  const tf = store.currentTF || "1h";
                  const val = parseInt(tf) || 1;
                  const unit = tf.replace(/[0-9]/g, "");
                  const d = new Date(candle.time * 1000);

                  if (unit === "M") d.setUTCMonth(d.getUTCMonth() + val);
                  else if (unit === "w") d.setUTCDate(d.getUTCDate() + val * 7);
                  else if (unit === "d") d.setUTCDate(d.getUTCDate() + val);
                  else if (unit === "h") d.setUTCHours(d.getUTCHours() + val);
                  else if (unit === "m") d.setUTCMinutes(d.getUTCMinutes() + val);
                  else d.setTime(d.getTime() + (tfSec[tf] || 60) * 1000);

                  nextCandleTime = d.getTime() / 1000;
                }

                if (subTime < nextCandleTime) {
                  lastKnownSubClose =
                    subExchange === "upbit"
                      ? subItem.trade_price
                      : subExchange === "bithumb"
                        ? Number(subItem[2])
                        : Number(subItem[4]);
                  subIndex++;
                } else break;
              }

              if (lastKnownSubClose !== null) {
                const isKor = ["UPBIT", "BITHUMB"].includes(
                  store.currentMarket,
                );
                const rawKorPrice = isKor ? candle.close : lastKnownSubClose;
                const rawGlbPrice = isKor ? lastKnownSubClose : candle.close;
                const unitKorPrice =
                  rawKorPrice / (isKor ? mainMulti : subMulti);
                const unitGlbPrice =
                  rawGlbPrice / (isKor ? subMulti : mainMulti);

                if (unitGlbPrice > 0 && lastKnownRate > 0) {
                  const kimchiPct =
                    (unitKorPrice / (unitGlbPrice * lastKnownRate) - 1) * 100;
                  if (
                    isFinite(kimchiPct) &&
                    kimchiPct >= -50 &&
                    kimchiPct <= 100
                  ) {
                    newKimchiData.push({
                      time: candle.time,
                      value: kimchiPct,
                      color:
                        typeof window.getKimchiColor === "function"
                          ? window.getKimchiColor(kimchiPct)
                          : "#57a4fc",
                    });
                  }
                }
              }
            });
          }

          if (
            store.currentAsset !== snapshotAsset ||
            store.currentTF !== snapshotTF
          )
            return;

          // 🚀 [무반동 방어막] 김프를 그리기 전 현재 X축(시간) 스케일을 캡처하고, 덮어쓰자마자 동기적으로 복구!
          store.kimchiData = newKimchiData;
          if (store.kimchiSeries && newKimchiData.length > 0) {
            const currentRange = store.chart
              .timeScale()
              .getVisibleLogicalRange(); // 1. 현재 화면 캡처
            store.kimchiSeries.setData(store.kimchiData.map(mapTime)); // 2. 김프 데이터 꽂기
            if (currentRange)
              store.chart.timeScale().setVisibleLogicalRange(currentRange); // 3. 미동 없이 복구!
          }
          if (typeof applyChartLayout === "function") applyChartLayout(); // 패널 크기 부드럽게 조정
        } else {
          // No available subs, so hide loading message if it was shown
          store.paneConfig.kimchi = false;
          const noDataMsg = document.getElementById("kimchi-no-data");
          if (noDataMsg) {
            noDataMsg.classList.remove("hidden");
            const pTag = noDataMsg.querySelector("p");
            // if (pTag)
            //   pTag.innerHTML = `⚠️ 해당하는 ${missingTarget} 데이터가 없어 김프 차트를 표시할 수 없습니다.`;
          }
          let loadingMessageContainer = document.getElementById(
            "kimchi-loading-message",
          );
          if (loadingMessageContainer)
            loadingMessageContainer.style.display = "none";
          if (typeof applyChartLayout === "function") applyChartLayout();
        }
      } catch (err) {
        console.error("김프 백그라운드 렌더링 실패:", err);
        // Hide loading message on error
        let loadingMessageContainer = document.getElementById(
          "kimchi-loading-message",
        );
        if (loadingMessageContainer)
          loadingMessageContainer.style.display = "none";
      }
    })();
  } catch (e) {
    console.error("차트 로드 실패:", e);
  } finally {
    if (loadingModal) loadingModal.classList.add("hidden");
    if (wrapper) wrapper.classList.remove("chart-loading");
    window.isFetchingChart = false;
    store.isFetchingChart = false;
  }
}

// 🚀 거래소(업비트/빗썸) 제한 돌파용 무한 펌프기 (중복 및 포맷 에러 방어)
async function fetchPaginated(exchange, symbol, interval, totalLimit) {
  let result = [];
  let lastTo = "";
  let remaining = totalLimit;
  let retryCount = 0; // 🚀 429 에러 재시도 카운트

  while (remaining > 0) {
    const count = Math.min(remaining, 200);
    let url = `/api/candles?exchange=${exchange}&symbol=${symbol}&interval=${interval}&limit=${count}`;
    if (lastTo) url += `&to=${encodeURIComponent(lastTo.replace("T", " "))}`;

    const res = await fetch(url);

    // 🚨 [429 철벽 방어막] 너무 많이 찔러서 혼났다면, 반성하고 기다렸다가 다시 찌르기!
    if (res.status === 429) {
      if (retryCount < 3) {
        retryCount++;
        console.warn(
          `🚨 [429 API 제한] ${symbol} 과호출 감지! ${retryCount * 0.5}초 대기 후 재시도...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 500 * retryCount)); // 0.5초, 1.0초, 1.5초 늘려가며 대기
        continue;
      } else {
        console.error(
          `❌ [429 API 제한] ${symbol} 재시도 횟수 초과. 가져오기 중단.`,
        );
        break;
      }
    }

    retryCount = 0; // 성공하면 재시도 카운트 리셋!

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    result = result.concat(data);
    remaining -= data.length;
    lastTo = data[data.length - 1].candle_date_time_utc;

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100)); // 🚀 429 예방을 위해 30ms -> 100ms로 안전거리 확보
    }
  }
  return result;
}

// 🚀 [합성 환율 제거] 30초 백그라운드 합성 환율 무한 갱신 엔진 삭제 (수학적 오류 방지 및 무의미한 API 호출 근절)

// 🚀 김프 비교군 스위칭 전역 함수 노출
window.switchKimchiSub = function (newSubId) {
  store.preferredKimchiSub = newSubId;
  if (typeof fetchHistory === "function") {
    fetchHistory(store.currentAsset);
  }
};
