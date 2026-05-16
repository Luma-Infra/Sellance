import { store, tfSec } from './_store.js';
import { getMultiplier, getPureBase } from './chart_utils.js';
import { fetchPaginated } from './api.js';
import { formatSmartPrice } from './chart_utils.js';
import { updateExchangeBadges } from './ui_control.js';

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
  window.isFetchingChart = true;
  clearChartData(isTfChange);

  const displayName = symbol || store.currentAsset;
  const rawSymbol = displayName.split("(")[0].trim().toUpperCase();
  store.currentAsset = displayName;

  const isFutures = store.currentMarket === "FUTURES";
  const isSpot = store.currentMarket === "SPOT";
  const isUpbit = store.currentMarket === "UPBIT";
  const isBithumb = store.currentMarket === "BITHUMB";
  const isBybit = store.currentMarket === "BYBIT";

  let rowInfo = store.currentTableData.find((c) => {
    // 🚀 [수정] DisplayTicker(BTC)와 Ticker(BTCUSDT) 둘 다 대응 가능하도록 보강
    if (c.DisplayTicker !== displayName && c.Ticker !== displayName) return false;
    if (isUpbit && (c.Listed_Exchanges?.includes("UPBIT") || c.Upbit === "O")) return true;
    if (isFutures && c.Listed_Exchanges?.includes("BINANCE_FUTURES")) return true;
    if (isSpot && c.Listed_Exchanges?.includes("BINANCE")) return true;
    if (isBithumb && c.Listed_Exchanges?.includes("BITHUMB")) return true;
    if (isBybit && c.Listed_Exchanges?.includes("BYBIT")) return true;
    return false;
  });
  if (!rowInfo) rowInfo = store.currentTableData.find((c) => c.DisplayTicker === displayName || c.Ticker === displayName);

  const pureBase = getPureBase(rawSymbol);
  const exactSpot = rowInfo?.Exact_Spot || pureBase;
  const exactFutures = rowInfo?.Exact_Futures || pureBase;
  const exactUpbit = rowInfo?.Upbit_Symbol || pureBase;
  const exactBithumb = pureBase;
  const exactBybit = rowInfo?.Bybit_Symbol || pureBase;

  const binanceTicker = isFutures ? `${exactFutures}USDT` : `${exactSpot}USDT`;
  const krwTicker = isBithumb ? `${exactBithumb}_KRW` : `KRW-${exactUpbit}`;

  // 현재 마켓의 정확한 심볼 지정 (실시간 소켓용)
  const mainTickerStr = isFutures ? exactFutures : (isSpot ? exactSpot : (isUpbit ? exactUpbit : (isBithumb ? exactBithumb : exactBybit)));

  const loadingModal = document.getElementById("chart-loading-modal");
  const wrapper = document.getElementById("chart-wrapper");
  if (loadingModal && !isTfChange) loadingModal.classList.remove("hidden");
  if (wrapper && !isTfChange) wrapper.classList.add("chart-loading");

  try {
    const snapshotAsset = store.currentAsset;
    const snapshotTF = store.currentTF;
    let rawMain = [];
    let mainStep = 1;

    const style = getComputedStyle(document.body);
    const upColorVol = (style.getPropertyValue("--up").trim() || "#26a69a") + "80";
    const downColorVol = (style.getPropertyValue("--down").trim() || "#ef5350") + "80";

    // 1️⃣ 데이터 수집
    if (isFutures || isSpot || isBybit) {
      const exchange = isFutures ? "binance_futures" : (isBybit ? "bybit" : "binance_spot");
      const ticker = isBybit ? exactBybit : binanceTicker;
      const res = await fetch(`/api/candles?exchange=${exchange}&symbol=${ticker}&interval=${store.currentTF}&limit=500`);
      const raw = await res.json();

      // 🚀 [추가] 바이낸스의 경우 중간 갭(AIA 코인 등)으로 인해 과거 데이터가 단절되는 현상을 극복하기 위해,
      // 역순 탐색 시 갭에서 막히는 DB 한계를 뚫고 아예 상장 첫날(start=0)부터 정방향으로 500개를 추가 조회하여 병합합니다! (단 1회의 추가 호출로 쌀먹 최적화)
      let combinedRaw = raw;
      if (!isBybit && Array.isArray(raw) && raw.length > 0) {
        const firstRes = await fetch(`/api/candles?exchange=${exchange}&symbol=${ticker}&interval=${store.currentTF}&limit=500&start=0`);
        const firstRaw = await firstRes.json();
        if (Array.isArray(firstRaw) && firstRaw.length > 0) {
          // 중복 캔들 제거 및 시간순 정렬 (Map을 이용한 O(N) 초고속 병합)
          const uniqueMap = new Map();
          firstRaw.forEach(d => uniqueMap.set(Number(d[0]), d));
          raw.forEach(d => uniqueMap.set(Number(d[0]), d));
          combinedRaw = Array.from(uniqueMap.values()).sort((a, b) => Number(a[0]) - Number(b[0]));
        }
      }

      if (isBybit && raw.result?.list) {
        rawMain = raw.result.list.map((d) => ({
          time: Number(d[0]) / 1000,
          open: Number(d[1]),
          high: Number(d[2]),
          low: Number(d[3]),
          close: Number(d[4]),
          vol: Number(d[5]),
        })).sort((a, b) => a.time - b.time);
      } else if (Array.isArray(combinedRaw)) {
        rawMain = combinedRaw.map((d) => ({
          time: Number(d[0]) / 1000,
          open: Number(d[1]),
          high: Number(d[2]),
          low: Number(d[3]),
          close: Number(d[4]),
          vol: Number(d[5]),
        }));
      }
    } else if (isUpbit || isBithumb) {
      if (isBithumb) {
        const bMap = { "1m":"1m", "3m":"3m", "5m":"5m", "15m":"10m", "30m":"30m", "1h":"1h", "2h":"1h", "4h":"1h", "12h":"12h", "1d":"24h" };
        const bFetchInt = bMap[store.currentTF] || "24h";
        const res = await fetch(`/api/candles?exchange=bithumb&symbol=${krwTicker}&interval=${bFetchInt}&limit=500`);
        const bData = await res.json();
        if (bData.status === "0000" && Array.isArray(bData.data)) {
          rawMain = bData.data.map((d) => ({
            time: Number(d[0]) / 1000,
            open: Number(d[1]),
            close: Number(d[2]),
            high: Number(d[3]),
            low: Number(d[4]),
            vol: Number(d[5]),
          }));
        }
      } else {
        const supportedMin = [1, 3, 5, 10, 15, 30, 60, 240];
        const totalSec = tfSec[store.currentTF] || 60;
        let fetchInterval;
        const u = store.currentTF.replace(/[0-9]/g, "");
        if (u === "d" || u === "w" || u === "M") {
          fetchInterval = u === "w" ? "weeks" : (u === "M" ? "months" : "days");
          mainStep = (store.currentTF === "3d") ? 3 : 1;
        } else {
          const targetMin = totalSec / 60;
          const baseMin = supportedMin.reverse().find((m) => targetMin % m === 0) || 1;
          fetchInterval = `minutes/${baseMin}`;
          mainStep = targetMin / baseMin;
        }
        const res = await fetch(`/api/candles?exchange=upbit&symbol=${krwTicker}&interval=${fetchInterval}&limit=500`);
        const raw = await res.json();
        if (Array.isArray(raw)) {
          rawMain = raw.map((d) => ({
            time: new Date(d.candle_date_time_utc + "Z").getTime() / 1000,
            open: d.opening_price,
            high: d.high_price,
            low: d.low_price,
            close: d.trade_price,
            vol: d.candle_acc_trade_volume,
          })).sort((a, b) => a.time - b.time);
        }
      }
    }

    if (!rawMain || rawMain.length === 0) throw new Error("No Data");

    // 2️⃣ 조립
    let newMainData = [];
    let newVolumeData = [];

    if (isFutures || isSpot || isBybit) {
      rawMain.forEach((d) => {
        newMainData.push({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.vol });
        newVolumeData.push({ time: d.time, value: d.vol, color: d.close >= d.open ? upColorVol : downColorVol });
      });
    } else {
      for (let i = 0; i < rawMain.length; i += mainStep) {
        const chunk = rawMain.slice(i, i + mainStep);
        if (chunk.length > 0) {
          const time = chunk[0].time;
          const open = chunk[0].open;
          const close = chunk[chunk.length - 1].close;
          const high = Math.max(...chunk.map(c => c.high));
          const low = Math.min(...chunk.map(c => c.low));
          const totalVol = chunk.reduce((sum, c) => sum + (c.vol || 0), 0);
          newMainData.push({ time, open, high, low, close, volume: totalVol });
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
        (c) => c.DisplayTicker === displayName || c.Ticker === displayName,
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
          if (listedEx.includes("UPBIT") || rowInfo?.Upbit === "O")
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

          // 🚀 [3단 합성 환율 맵] 타임프레임별 합성 왜곡 방지! (트뷰 과거기록 + 업비트 테더 현재가)
          const rateCacheKey = `fiat_rate_only`;
          if (!store.hybridRateCache) store.hybridRateCache = {};

          if (!store.hybridRateCache[rateCacheKey]) {
            const res = await fetch("/api/usdkrw");
            const usdkrwRaw = await res.json();

            let hybridTimeline = [];
            // 1. 1단 합성: 트레이딩뷰 과거 법정환율 추가 (모든 타임프레임에서 매끄러운 과거 김프 생성)
            if (usdkrwRaw && !usdkrwRaw.error) {
              for (let [ts, price] of Object.entries(usdkrwRaw)) {
                hybridTimeline.push({ time: Number(ts), price: price, source: "tv_fiat" });
              }
            }

            // 2. 2단 합성: 현재 시점의 업비트 USDT/KRW 단일 호출본 추가 (쌀먹 최적화)
            // (3단 합성인 실시간 웹소켓은 실시간 캔들 업데이트 시 자동으로 반영됨)
            if (store.marketDataMap && store.marketDataMap.krw_usd_rate) {
              hybridTimeline.push({
                time: Math.floor(Date.now() / 1000),
                price: store.marketDataMap.krw_usd_rate,
                source: "fastapi_tether"
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
            // 🚀 [Premium] 최신 김프 색상을 CSS 변수에 주입하여 Glow 효과 연동
            const lastK = newKimchiData[newKimchiData.length - 1];
            const wrapper = document.getElementById("chart-wrapper");
            if (wrapper) wrapper.style.setProperty('--kimchi-color', lastK.color);

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
          const wrapper = document.getElementById("chart-wrapper");
          if (wrapper) wrapper.style.setProperty('--kimchi-color', 'transparent');
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

window.switchKimchiSub = function (newSubId) {
  store.preferredKimchiSub = newSubId;
  if (typeof fetchHistory === "function") {
    fetchHistory(store.currentAsset);
  }
};
