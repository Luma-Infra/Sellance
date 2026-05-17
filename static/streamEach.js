// streamEach.js
import { store, CONFIG, tfSec } from "./_store.js";
import { getMultiplier, getPureBase, formatSmartPrice } from "./chart_utils.js";

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
    // 24hrTicker 또는 aggTrade 데이터가 오면 즉시 DOM 업데이트
    if (data.e === "24hrTicker" || data.e === "aggTrade") {
      renderSniperPrice(data);
    }
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

  // 🚀 [해결] visibleSymbols에는 업비트 전용 코인도 섞여있음. 바이낸스에서 스나이핑 가능한 놈만 골라내야 함!
  const currentVisible = [];
  const allSource = store.originalTableData || store.currentTableData || [];
  store.visibleSymbols.forEach((sym) => {
    const row = allSource.find(
      (r) => r.Ticker === sym || r.DisplayTicker === sym || r.Symbol === sym,
    );
    if (!row) return;

    // 1. 선물 티커가 있으면 최우선 (HTS의 꽃은 선물 실시간)
    let bTicker =
      row.Exact_Futures ||
      (row.Ticker && !row.Ticker.endsWith("KRW")
        ? row.Ticker.replace("USDT", "")
        : null);

    // 2. 선물은 없지만 현물이 바이낸스에 있다면 현물이라도 스나이핑
    if (!bTicker && row.Exact_Spot) bTicker = row.Exact_Spot;

    if (bTicker) {
      currentVisible.push(`${bTicker.toLowerCase()}usdt@aggTrade`);
    }
  });

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
  if (typeof window.renderRealtimeRow === "function") {
    window.renderRealtimeRow(data.s, data);
  }
}

// 🚀 모든 뷰 변화의 종착역
function refreshSniperTarget() {
  if (typeof updateVisibleSymbols === "function") updateVisibleSymbols();
  if (typeof syncSniperSubscriptions === "function") syncSniperSubscriptions();
}

// 🚀 실시간 김프 1초컷 업데이트 엔진 (모든 마켓 공통 적용)
function updateRealtimeKimchi(liveData, symbol, chartTime) {
  if (!store.kimchiSeries || !store.paneConfig.kimchi) return;

  const usdtPrice =
    store.tickerBuffer["KRW-USDT"]?.c || store.tickerBuffer["USDT_KRW"]?.c;
  const rate = usdtPrice || store.marketDataMap?.krw_usd_rate || 0;

  if (rate === 0) return;

  const pureSymbol = getPureBase(symbol);
  const mainMulti = getMultiplier(symbol);

  const isKor = ["UPBIT", "BITHUMB"].includes(store.currentMarket);
  let subPrice = null;
  let subMulti = 1;

  const row = store.currentTableData.find((c) => c.Symbol === pureSymbol);

  if (isKor) {
    let glbSym = row && row.Exact_Spot ? row.Exact_Spot : pureSymbol;
    if (store.currentMarket === "FUTURES" && row && row.Exact_Futures)
      glbSym = row.Exact_Futures;

    let glbPrice = null;
    const hasBinance = row?.Listed_Exchanges?.some((ex) =>
      ex.includes("BINANCE"),
    );
    if (hasBinance) {
      glbPrice = store.tickerBuffer[`${glbSym}USDT`]?.c;
    }
    if (!glbPrice && row && row.Price_Raw) glbPrice = row.Price_Raw * mainMulti;

    if (glbPrice) {
      subPrice = glbPrice;
      subMulti = getMultiplier(glbSym);
    }
  } else {
    let korSym = row && row.Upbit_Symbol ? row.Upbit_Symbol : pureSymbol;
    let korPrice = store.tickerBuffer[`KRW-${korSym}`]?.c;
    if (!korPrice) korPrice = store.tickerBuffer[`${pureSymbol}_KRW`]?.c;
    if (!korPrice && row && row.Price_KRW) korPrice = row.Price_KRW * mainMulti;

    if (korPrice) {
      subPrice = korPrice;
      subMulti = getMultiplier(korSym);
    }
  }

  if (subPrice && liveData.close > 0) {
    const rawKorPrice = isKor ? liveData.close : parseFloat(subPrice);
    const rawGlbPrice = isKor ? parseFloat(subPrice) : liveData.close;
    const unitKorPrice = rawKorPrice / (isKor ? mainMulti : subMulti);
    const unitGlbPrice = rawGlbPrice / (isKor ? subMulti : mainMulti);
    const kimchiPct = (unitKorPrice / (unitGlbPrice * rate) - 1) * 100;

    if (isFinite(kimchiPct) && kimchiPct >= -50 && kimchiPct <= 100) {
      store.kimchiSeries.update({
        time: chartTime,
        value: kimchiPct,
        color:
          typeof window.getKimchiColor === "function"
            ? window.getKimchiColor(kimchiPct)
            : "#57a4fc",
      });
    }
  }
}

const updateTabTitle = (price, sym, prec) => {
  const formatted = formatSmartPrice(price, prec || 2);
  document.title = `${formatted} ${sym.toUpperCase()} | Xsellance`;
};

export function startRealtimeCandle(
  symbol,
  interval,
  isFutures,
  isSpot,
  isUpbit,
  isBithumb,
) {
  // 🚀 [궁극의 정밀 하이브리드] 00초 마감/생성은 kline 독점, 봉 내부 파닥거림은 aggTrade 전담!
  const aggStream = `${symbol.toLowerCase()}usdt@aggTrade`;
  const klineStream = `${symbol.toLowerCase()}usdt@kline_${interval}`;
  const wsBase = isFutures
    ? "wss://fstream.binance.com/market/ws"
    : "wss://stream.binance.com:9443/ws";

  if (
    (isFutures || isSpot) &&
    store.currentKlineStream === `${aggStream}/${klineStream}` &&
    store.binanceChartWs &&
    store.binanceChartWs.readyState === WebSocket.OPEN
  )
    return;

  const getWsId = () => Math.floor(Date.now() + Math.random() * 1000);

  // 🚀 [수정] 고정 변수 삭제 (실시간 메시지 수신 시점에 동적으로 참조하여 테마 즉각 연동)

  const handleBinanceMessage = (e) => {
    if (store.isFetchingChart || window.isFetchingChart) return;
    const res = JSON.parse(e.data);

    if (!store.mainData || store.mainData.length === 0) return;
    const lastCandle = store.mainData[store.mainData.length - 1];

    let activeCandle = lastCandle;
    let chartUpdateNeeded = false;
    let livePrice = 0;

    // ⚡ 1. [aggTrade 수신] 오직 '진행 중인 봉 내부'의 초고속 파닥거림 및 실시간 거래량 누적 전담
    if (res.e === "aggTrade") {
      store.lastServerMs = res.E;
      store.localTimeAtUpdate = performance.now();

      const tickSymbol = res.s.replace("USDT", "").toUpperCase();
      if (tickSymbol !== symbol.toUpperCase()) return;

      const newPrice = parseFloat(res.p);
      const tradeQty = parseFloat(res.q) || 0;
      if (isNaN(newPrice)) return;
      livePrice = newPrice;

      const secondsPerBar = tfSec[store.currentTF] || 60;
      const nextBarTime = lastCandle.time + secondsPerBar;
      const currentUnix = Math.floor(res.E / 1000);

      // 🚀 [핵심 정밀 제어] 00초 정각을 넘어선 체결 건은 kline이 공식 새 봉을 열 때까지 개입 차단!
      if (currentUnix < nextBarTime) {
        lastCandle.close = newPrice;
        lastCandle.high = Math.max(lastCandle.high, newPrice);
        lastCandle.low = Math.min(lastCandle.low, newPrice);
        // 🚀 실시간 거래량 1달러치 체결까지 초고속 누적 반영!
        lastCandle.volume = (lastCandle.volume || 0) + tradeQty;
        activeCandle = lastCandle;
        chartUpdateNeeded = true;
      }
    }
    // 🛡️ 2. [kline 수신] 00초 정각 봉 마감 및 공식 새 봉 생성 전권 독점 (정합성 100% 수문장)
    else if (res.e === "kline" && res.k.i === store.currentTF) {
      store.lastServerMs = res.E;
      store.localTimeAtUpdate = performance.now();

      const tickSymbol = res.k.s.replace("USDT", "").toUpperCase();
      if (tickSymbol !== symbol.toUpperCase()) return;

      const k = res.k;
      const kUnix = Math.floor(k.t / 1000);
      livePrice = Number(k.c);
      const kVol = parseFloat(k.v) || 0;

      if (lastCandle.time === kUnix) {
        // 현재 봉 마감 및 동기화 (특히 res.k.x === true 일 때 완벽한 공식 마감 확정)
        lastCandle.open = Number(k.o);
        lastCandle.high = Math.max(lastCandle.high, Number(k.h));
        lastCandle.low = Math.min(lastCandle.low, Number(k.l));
        lastCandle.close = Number(k.c);
        lastCandle.volume = kVol; // 🚀 거래소 공식 거래량으로 완벽 덮어쓰기 보정!
        activeCandle = lastCandle;
      } else if (kUnix > lastCandle.time) {
        // 🚀 00초 정각, 오직 kline 공식 데이터로만 새로운 봉을 생성 (짜침/오차 원천 차단)
        activeCandle = {
          time: kUnix,
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c),
          volume: kVol,
        };
        store.mainData.push(activeCandle);
      }
      chartUpdateNeeded = true;
    }

    if (!chartUpdateNeeded) return;

    const isDayUnit = !(store.currentTF || "1h").match(/[hm]/);
    const chartTime = isDayUnit
      ? (() => {
          const dt = new Date(activeCandle.time * 1000);
          return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
        })()
      : activeCandle.time;

    if (store.candleSeries) {
      store.candleSeries.update({ ...activeCandle, time: chartTime });
      if (store.leftScaleSeries) {
        store.leftScaleSeries.update({
          time: chartTime,
          value: activeCandle.close,
        });
      }
      // 🚀 [핵심] 캔들 시리즈가 업데이트되는 즉시, 우측 스케일 카운트다운 가격표 라벨도 다이렉트로 동기화 갱신! (0.1초 늦게 따라붙는 타이머 딜레이 원천 차단)
      if (typeof window.updateRealtimeCountdown === "function") {
        window.updateRealtimeCountdown(store.lastServerMs);
      }
    }
    // 🚀 [추가] 실시간 거래량 시리즈 동기화 업데이트 및 테마 라이브 연동!
    if (store.volumeSeries && activeCandle.volume !== undefined) {
      const curStyle = getComputedStyle(document.body);
      const curUpVol =
        (curStyle.getPropertyValue("--up").trim() || "#26a69a") + "80";
      const curDownVol =
        (curStyle.getPropertyValue("--down").trim() || "#ef5350") + "80";
      const curVolColor =
        activeCandle.close >= activeCandle.open ? curUpVol : curDownVol;

      const volObj = {
        time: chartTime,
        value: activeCandle.volume,
        color: curVolColor,
      };
      store.volumeSeries.update(volObj);

      // 🚀 원본 volumeData 배열의 마지막 항목도 완벽 동기화! (테마 변경 시 덮어쓰기 방어)
      if (store.volumeData && store.volumeData.length > 0) {
        store.volumeData[store.volumeData.length - 1] = volObj;
      }
    }
    updateRealtimeKimchi(activeCandle, symbol, chartTime);

    const selectedRow = store.currentTableData.find(
      (c) => c.Ticker === store.currentSelectedSymbol,
    );
    const p = store.getPrecision(store.currentSelectedSymbol || symbol);
    if (livePrice > 0) {
      updateTabTitle(livePrice, selectedRow?.Symbol || symbol, p);
    }

    if (typeof window.updateStatus === "function") {
      window.updateStatus(activeCandle, p);
    }
  };

  if (isFutures || isSpot) {
    if (store.binanceChartWs) store.binanceChartWs.close();
    store.binanceChartWs = new WebSocket(wsBase);
    store.binanceChartWs.onopen = () => {
      store.binanceChartWs.send(
        JSON.stringify({
          method: "SUBSCRIBE",
          params: [aggStream, klineStream],
          id: getWsId(),
        }),
      );
      store.currentKlineStream = `${aggStream}/${klineStream}`;
    };
    store.binanceChartWs.onmessage = handleBinanceMessage;
  } else {
    // 🚀 [해결] 업비트/빗썸/바이비트 등 타 마켓 조회 시, 기존에 열려있던 바이낸스 웹소켓이 닫히지 않고 계속 살아있어 동명 이인(EDGE 등)의 달러 가격이 원화 차트를 침범해 수직 낙하하는 치명적 버그 완벽 차단!
    if (store.binanceChartWs) {
      store.binanceChartWs.close();
      store.binanceChartWs = null;
    }
    store.currentKlineStream = null;
  }
}

window.initSniperSocket = initSniperSocket;
window.syncSniperSubscriptions = syncSniperSubscriptions;
window.refreshSniperTarget = refreshSniperTarget;
window.startRealtimeCandle = startRealtimeCandle;
