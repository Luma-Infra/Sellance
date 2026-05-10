// stream.js
// --- 🌊 실시간 웹소켓 엔진 ---
import { store, tfSec, CONFIG } from "./store.js";

// 타이틀만 광속으로 업데이트하는 함수 분리
const updateTabTitle = (price, sym, prec) => {
  const formatted = formatSmartPrice(price, prec || 2);
  // 렌더링 엔진과 별개로 실행되어 딜레이가 사라짐
  document.title = `${formatted} ${sym.toUpperCase()} | Xsellance`;
};

function startRealtimeCandle(
  symbol,
  interval,
  isFutures,
  isSpot,
  isUpbit,
  isBithumb,
) {
  const streamName = `${symbol.toLowerCase()}usdt@kline_${interval}`;
  const wsBase = isFutures
    ? "wss://fstream.binance.com/market/ws"
    : "wss://stream.binance.com:9443/ws";

  // 🚀 [광클 방어 1선] 이미 똑같은 차트(코인+시간)를 보고 있으면 즉시 컷! (부하 0%)
  if (
    (isFutures || isSpot) &&
    store.currentKlineStream === streamName &&
    store.binanceChartWs &&
    store.binanceChartWs.readyState === WebSocket.OPEN
  ) {
    console.log(
      `😎 [스킵] 이미 ${streamName} 채널 시청 중입니다. (서버 부하 방지)`,
    );
    return;
  }

  // 🚀 [해결책] 고유 ID 생성기 (바이낸스가 헷갈리지 않게 매번 다른 번호표 발급)
  const getWsId = () => Math.floor(Date.now() + Math.random() * 1000);

  // ---------------------------------------------------------
  // 📌 1. 렌더링 헬퍼 함수
  // ---------------------------------------------------------

  // 🚀 [해결] 핸들러를 별도 함수로 빼서 신규 연결/채널 교체시 모두 재사용해야 함!
  const handleBinanceMessage = (e) => {
    if (store.isFetchingChart || window.isFetchingChart) return;
    const res = JSON.parse(e.data);
    if (res.e !== "kline") return;
    if (res.k.i !== store.currentTF) return; // 🚨 [철벽 방어] 이전 타임프레임의 찌꺼기 메시지 버림!

    const tickSymbol = res.k.s.toUpperCase();
    const currentAssetClean = store.currentAsset
      .split("(")[0]
      .trim()
      .toUpperCase();
    if (tickSymbol !== `${symbol}USDT`.toUpperCase()) return; // 🚀 철벽 방어 (1000XEC 등 오인식 완벽 차단)

    const k = res.k;
    const liveData = {
      time: Math.floor(k.t / 1000) || 0,
      open: Number(k.o) || 0,
      high: Number(k.h) || 0,
      low: Number(k.l) || 0,
      close: Number(k.c) || 0,
    };

    if (!liveData.time || !liveData.open) return; // 🚨 비정상 캔들은 무시

    // 🚀 테마 색상 (볼륨 차트용)
    const style = getComputedStyle(document.body);
    const upColorVol =
      (style.getPropertyValue("--up").trim() || "#26a69a") + "80";
    const downColorVol =
      (style.getPropertyValue("--down").trim() || "#ef5350") + "80";

    const volData = {
      time: liveData.time,
      value: Number(k.v) || 0, // 🚀 찐빠 교정 완료: k.q(달러 대금)가 아닌 k.v(코인 개수)를 사용해야 스케일이 안 깨집니다!
      color: liveData.close >= liveData.open ? upColorVol : downColorVol,
    };

    // 🚨 [차트 썰림 2차 방어] 웹소켓 지연으로 인해 과거의 찌꺼기 데이터가 뒤늦게 도착하면 무시!
    if (
      store.mainData.length > 0 &&
      liveData.time < store.mainData[store.mainData.length - 1].time
    ) {
      return; // 과거 시간축으로 회귀하여 캔들을 썰어버리는 현상 원천 차단
    }

    // 🚨 [핵심 패치] 500개 배열을 무식하게 통째로 덮어쓰던 행위 금지!
    // 오직 LightweightCharts 전용 update() 로 1:1 핀포인트 초고속 렌더링.
    try {
      const isDayUnit = !(store.currentTF || "1h").match(/[hm]/);
      const chartTime = isDayUnit
        ? (() => {
            const dt = new Date(liveData.time * 1000);
            return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
          })()
        : liveData.time;

      if (store.candleSeries)
        store.candleSeries.update({ ...liveData, time: chartTime });
      if (store.volumeSeries && volData.value > 0)
        store.volumeSeries.update({ ...volData, time: chartTime });

      // 장부(mainData)도 꼬리물기로 최신화
      if (store.mainData.length > 0) {
        const lastIdx = store.mainData.length - 1;
        if (store.mainData[lastIdx].time === liveData.time) {
          store.mainData[lastIdx] = liveData;
        } else if (liveData.time > store.mainData[lastIdx].time) {
          store.mainData.push(liveData);
        }
      }
    } catch (err) {
      console.warn("🚨 실시간 차트 업데이트 꼬임 방어:", err);
    }

    if (typeof updateRealtimeCountdown === "function")
      updateRealtimeCountdown(res.E);

    // 🚀 [광속 타이틀] res.k.s(실시간 심볼)와 테이블 정밀도 사용
    const currentP =
      store.currentTableData.find((c) => c.DisplayTicker === store.currentAsset) // 🚀 [수정]
        ?.precision || 2;
    updateTabTitle(+k.c, symbol, currentP); // symbol은 인자값

    if (typeof updateStatus === "function") updateStatus(liveData);
  };

  // ---------------------------------------------------------
  // 📌 2. 이전 업비트 소켓 무조건 청소 (충돌 방지)
  // ---------------------------------------------------------
  if (store.upbitChartWs) {
    store.upbitChartWs.onmessage = null; // 핸들러 먼저 죽여야 안전!
    store.upbitChartWs.close();
    store.upbitChartWs = null;
  }
  if (store.bithumbChartWs) {
    store.bithumbChartWs.onmessage = null;
    store.bithumbChartWs.close();
    store.bithumbChartWs = null;
  }

  // ---------------------------------------------------------
  // 📌 3. 바이낸스 타격 (선물 or 현물)
  // ---------------------------------------------------------
  if (isFutures || isSpot) {
    // 🚀 [버그 픽스] 현재 소켓이 '선물'용인지 '현물'용인지 식별 (url에 fstream이 있는지 확인)
    const isCurrentlyFuturesWs =
      store.binanceChartWs && store.binanceChartWs.url.includes("fstream");

    if (
      !store.binanceChartWs ||
      store.binanceChartWs.readyState !== WebSocket.OPEN ||
      isCurrentlyFuturesWs !== isFutures
    ) {
      if (store.binanceChartWs) {
        store.binanceChartWs.onmessage = null;
        store.binanceChartWs.close();
      }
      store.binanceChartWs = new WebSocket(wsBase);
      store.binanceChartWs.onopen = () => {
        store.binanceChartWs.send(
          JSON.stringify({
            method: "SUBSCRIBE",
            params: [streamName],
            id: getWsId(),
          }),
        );
        store.currentKlineStream = streamName;
      };
      store.binanceChartWs.onmessage = handleBinanceMessage; // ✅ 신규 연결시 등록
    } else {
      if (store.currentKlineStream && store.currentKlineStream !== streamName) {
        store.binanceChartWs.send(
          JSON.stringify({
            method: "UNSUBSCRIBE",
            params: [store.currentKlineStream],
            id: getWsId(),
          }),
        );
      }
      store.binanceChartWs.send(
        JSON.stringify({
          method: "SUBSCRIBE",
          params: [streamName],
          id: getWsId(),
        }),
      );
      store.binanceChartWs.onmessage = handleBinanceMessage; // ✅ [중요] 채널 교체시에도 핸들러 갱신 (심볼 고정 해결)
      store.currentKlineStream = streamName;
    }
  }

  // ---------------------------------------------------------
  // 📌 4. 업비트 타격
  // ---------------------------------------------------------
  else if (isUpbit) {
    // 🚀 바이낸스 보던 게 있다면 데이터 안 섞이게 매너 해지!
    if (
      store.binanceChartWs &&
      store.binanceChartWs.readyState === WebSocket.OPEN &&
      store.currentKlineStream
    ) {
      store.binanceChartWs.send(
        JSON.stringify({
          method: "UNSUBSCRIBE",
          params: [store.currentKlineStream],
          id: getWsId(),
        }),
      );
      store.currentKlineStream = null;
    }

    const upbitTicker = `KRW-${symbol}`;
    store.upbitChartWs = new WebSocket("wss://api.upbit.com/websocket/v1");

    store.upbitChartWs.onopen = () => {
      const msg = [
        { ticket: "UNIQUE_TICKET" },
        { type: "ticker", codes: [upbitTicker] },
      ];
      store.upbitChartWs.send(JSON.stringify(msg));
      document.getElementById("status-dot").style.background = "#1261c4";
      document.getElementById("status-text").innerText = "Upbit LIVE";
    };

    store.upbitChartWs.onmessage = async (e) => {
      if (store.isFetchingChart || window.isFetchingChart) return;

      // 데이터 파싱 (Blob/Text 대응)
      let res;
      try {
        const text = typeof e.data === "string" ? e.data : await e.data.text();
        res = JSON.parse(text);
      } catch (err) {
        return;
      }

      // 🚨 [핵심] 업비트 전용 방어막 설치
      // 업비트는 티커가 'KRW-BTC' 형식으로 옵니다.
      const tickSymbol = res.code ? res.code.toUpperCase() : "";
      const currentAssetClean = store.currentAsset
        .split("(")[0]
        .trim()
        .toUpperCase();

      // 🚀 업비트 규격(KRW-BTC)과 완전히 일치하는지 확인!
      if (tickSymbol !== upbitTicker.toUpperCase()) return;

      // 서버 시간 및 캔들 시작 시간 계산
      const serverMs = res.timestamp;
      const candleStartTime = getUpbitCandleStartTime(
        serverMs,
        store.currentTF,
      );

      if (store.candleSeries && store.mainData.length > 0) {
        const p = store.currentTableData.find(
          (c) => c.DisplayTicker === store.currentAsset, // 🚀 [수정]
        )?.precision;
        const liveData = {
          time: candleStartTime,
          open: Number(res.trade_price) || 0,
          high: Number(res.trade_price) || 0,
          low: Number(res.trade_price) || 0,
          close: Number(res.trade_price) || 0,
        };

        if (!liveData.time || !liveData.open) return; // 🚨 안전장치

        const lastIdx = store.mainData.length - 1;
        const lastCandle = store.mainData[lastIdx];

        // ✅ 🚀 [수정] 유령봉 방어 로직 (시간 차이가 타임프레임 기준보다 작으면 강제로 덮어쓰기)
        if (liveData.time === lastCandle.time) {
          liveData.open = lastCandle.open;
          liveData.high = Math.max(lastCandle.high, liveData.high);
          liveData.low = Math.min(lastCandle.low, liveData.low);
          store.mainData[lastIdx] = liveData;
        } else if (liveData.time > lastCandle.time) {
          store.mainData.push(liveData);
        } else {
          return; // 과거 찌꺼기 무시
        }

        try {
          const isDayUnit = !(store.currentTF || "1h").match(/[hm]/);
          const chartTime = isDayUnit
            ? (() => {
                const dt = new Date(liveData.time * 1000);
                return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
              })()
            : liveData.time;

          if (store.candleSeries)
            store.candleSeries.update({ ...liveData, time: chartTime });
        } catch (err) {
          console.warn("🚨 업비트 차트 업데이트 꼬임 방어:", err);
        }

        const displayPrice = formatSmartPrice(liveData.close, p);
        document.title = `2 ${displayPrice} ${symbol} | sellance 🚀`;

        // 🚀 [광속 타이틀] 업비트도 통합 함수로 교체! (오타 '2' 제거)
        const upbitP =
          store.currentTableData.find(
            (c) => c.DisplayTicker === store.currentAsset,
          )?.precision || 2; // 🚀 [수정]
        updateTabTitle(liveData.close, symbol, upbitP);

        if (typeof updateRealtimeCountdown === "function") {
          updateRealtimeCountdown(serverMs);
        }

        if (typeof updateStatus === "function") updateStatus(liveData);
      }
    };
    // store.upbitChartWs.onclose = () => {
    //   document.getElementById("status-dot").style.background = "#ef5350";
    //   document.getElementById("status-text").innerText = "OFFLINE";
    // };
  }
  // ---------------------------------------------------------
  // 📌 5. 빗썸 타격 (신규 엔진)
  // ---------------------------------------------------------
  else if (isBithumb) {
    // 🚀 바이낸스 보던 게 있다면 데이터 안 섞이게 매너 해지!
    if (
      store.binanceChartWs &&
      store.binanceChartWs.readyState === WebSocket.OPEN &&
      store.currentKlineStream
    ) {
      store.binanceChartWs.send(
        JSON.stringify({
          method: "UNSUBSCRIBE",
          params: [store.currentKlineStream],
          id: getWsId(),
        }),
      );
      store.currentKlineStream = null;
    }

    const bithumbTicker = `${symbol}_KRW`;
    store.bithumbChartWs = new WebSocket("wss://pubwss.bithumb.com/pub/ws");

    store.bithumbChartWs.onopen = () => {
      const msg = {
        type: "ticker",
        symbols: [bithumbTicker],
        tickTypes: ["MID"],
      };
      store.bithumbChartWs.send(JSON.stringify(msg));
      document.getElementById("status-dot").style.background = "#ff8b00";
      document.getElementById("status-text").innerText = "Bithumb LIVE";
    };

    store.bithumbChartWs.onmessage = (e) => {
      if (store.isFetchingChart || window.isFetchingChart) return;
      const res = JSON.parse(e.data);

      if (res.type !== "ticker" || !res.content) return;

      const tick = res.content;
      const serverMs = Date.now(); // 빗썸은 타임스탬프 대신 date/time 문자열을 주므로 현재 시간 활용
      const candleStartTime = getUpbitCandleStartTime(
        serverMs,
        store.currentTF,
      );

      if (store.candleSeries && store.mainData.length > 0) {
        const p =
          store.currentTableData.find(
            (c) => c.DisplayTicker === store.currentAsset,
          )?.precision || 2; // 🚀 [수정]

        const liveData = {
          time: candleStartTime,
          open: Number(tick.openPrice) || 0,
          high: Number(tick.highPrice) || 0,
          low: Number(tick.lowPrice) || 0,
          close: Number(tick.closePrice) || 0,
        };

        if (!liveData.time || !liveData.open) return;

        const lastIdx = store.mainData.length - 1;
        const lastCandle = store.mainData[lastIdx];

        // 유령봉 방어 (기존 차트 시간과 대조하여 병합 처리)
        if (liveData.time === lastCandle.time) {
          liveData.open = lastCandle.open;
          liveData.high = Math.max(lastCandle.high, liveData.high);
          liveData.low = Math.min(lastCandle.low, liveData.low);
          store.mainData[lastIdx] = liveData;
        } else if (liveData.time > lastCandle.time) {
          store.mainData.push(liveData);
        } else {
          return;
        }

        try {
          const isDayUnit = !(store.currentTF || "1h").match(/[hm]/);
          const chartTime = isDayUnit
            ? (() => {
                const dt = new Date(liveData.time * 1000);
                return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
              })()
            : liveData.time;

          if (store.candleSeries)
            store.candleSeries.update({ ...liveData, time: chartTime });
        } catch (err) {}

        // 🚀 [궁극의 김프 실시간 1초컷 연동 엔진]
        if (store.kimchiSeries && store.paneConfig.kimchi) {
          const rate = store.marketDataMap?.krw_usd_rate || 1450.0;
          const pureSymbol = symbol
            .replace(/^(10+|1[MB])(?=[A-Z])/i, "")
            .toUpperCase();

          let multi = 1;
          const multiMatch = symbol.match(/^(10+|1[MB])(?=[A-Z])/i);
          if (multiMatch) {
            const pMatch = multiMatch[1].toUpperCase();
            multi =
              pMatch === "1M"
                ? 1000000
                : pMatch === "1B"
                  ? 1000000000
                  : parseInt(pMatch, 10);
          }

          // 빗썸 차트이므로, 글로벌 가격(Binance)을 실시간 레이더 버퍼에서 훔쳐옴!
          let glbPrice = store.tickerBuffer[`${symbol}USDT`]?.c;
          if (!glbPrice) {
            const row = store.currentTableData.find(
              (c) => c.Symbol === pureSymbol,
            );
            if (row && row.Price_Raw) glbPrice = row.Price_Raw * multi;
          }

          if (glbPrice && liveData.close > 0) {
            const unitKorPrice = liveData.close;
            const unitGlbPrice = parseFloat(glbPrice) / multi;
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
              if (store.kimchiData && store.kimchiData.length > 0) {
                const kLastIdx = store.kimchiData.length - 1;
                if (store.kimchiData[kLastIdx].time === liveData.time) {
                  store.kimchiData[kLastIdx].value = kimchiPct;
                } else if (liveData.time > store.kimchiData[kLastIdx].time) {
                  store.kimchiData.push({
                    time: liveData.time,
                    value: kimchiPct,
                  });
                }
              }
            }
          }
        }

        updateTabTitle(liveData.close, symbol, p);
        if (typeof updateRealtimeCountdown === "function")
          updateRealtimeCountdown(serverMs);
        if (typeof updateStatus === "function") updateStatus(liveData);
      }
    };
  }
}

function startBinanceMarketRadar() {
  // 🚀 안전하게 기존 소켓 닫기
  if (store.binanceRadarWs) {
    store.binanceRadarWs.onmessage = null;
    store.binanceRadarWs.close();
  }

  store.binanceRadarWs = new WebSocket(
    "wss://fstream.binance.com/market/ws/!ticker@arr",
  );

  store.binanceRadarWs.onopen = () => {
    // console.log("✅ [전체소켓] 바이낸스 선물 스트림 연결 성공!");
    // document.getElementById("status-dot").style.background = "#26a69a";
  };

  store.binanceRadarWs.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // 🚀 데이터가 들어오는지 딱 한 번만 확인
    // console.log("데이터 수신 중...", data.length);

    data.forEach((ticker) => {
      const pureSymbol = ticker.s.replace("USDT", "");
      store.tickerBuffer[ticker.s] = ticker; // 🚀 [수정] 전체 티커(예: EDGEUSDT)를 키로 사용
    });
  };

  store.binanceRadarWs.onclose = (e) => {
    console.log(
      `❌ [전체소켓] 연결 끊김! ${CONFIG.UI_UPDATE_INTERVAL / 1000}초 후 재시도...`,
      e.reason,
    );
    setTimeout(startBinanceMarketRadar, CONFIG.UI_UPDATE_INTERVAL); // 🚀 자동 재연결!
  };

  store.binanceRadarWs.onerror = (err) => {
    console.error("🚨 [전체소켓] 에러 발생:", err);
  };
}

function startUpbitMarketRadar() {
  if (store.upbitRadarWs) {
    store.upbitRadarWs.onmessage = null;
    store.upbitRadarWs.close();
  }

  store.upbitRadarWs = new WebSocket("wss://api.upbit.com/websocket/v1");
  store.upbitRadarWs.binaryType = "arraybuffer";

  store.upbitRadarWs.onopen = () => {
    // 🚀 [핵심 최적화]
    // Upbit 상장('O') 되어 있어야 함
    // 바이낸스 티커가 없거나, Note에 'Upbit Only'라고 명시된 놈들만 필터링
    // Ticker가 '...USDT'면 바이낸스에 있는 놈이니 제외 대상!)
    const upbitOnlyCodes = store.currentTableData
      .filter((row) => {
        const isUpbit = row.Upbit === "O";
        // 바이낸스 티커(Ticker)가 없거나 'null'인 경우만 업비트 소켓으로 구독
        const isNotOnBinance =
          !row.Ticker || row.Ticker === "" || row.Note === "Upbit Only";
        return isUpbit && isNotOnBinance;
      })
      .map((row) => `KRW-${row.Symbol}`);

    if (upbitOnlyCodes.length === 0) {
      console.log(
        "✅ 모든 코인이 바이낸스 스트림에 포함되어 업비트 개별 소켓을 열지 않습니다.",
      );
      return;
    }

    const msg = [
      { ticket: "UNIQUE_TICKET" },
      { type: "ticker", codes: upbitOnlyCodes },
    ];
    store.upbitRadarWs.send(JSON.stringify(msg));
    console.log(
      `🎯 [업비트 전용] ${upbitOnlyCodes.length}개 국내산 코인들 타격 시작!`,
    );
  };

  const decoder = new TextDecoder("utf-8");
  store.upbitRadarWs.onmessage = (event) => {
    const ticker = JSON.parse(decoder.decode(event.data));
    const pureSymbol = ticker.code.replace("KRW-", "");

    // 🚀 [수정] 업비트 전용 코인들의 데이터를 전체 티커(예: KRW-EDGE)를 키로 사용하여 버퍼에 저장
    store.tickerBuffer[ticker.code] = {
      s: pureSymbol,
      c: ticker.trade_price,
      P: ticker.signed_change_rate * 100,
      q_upbit: ticker.acc_trade_price_24h, // 🚀 추가: 업비트 24시간 거래대금
    };
  };

  store.upbitRadarWs.onclose = () =>
    setTimeout(startUpbitMarketRadar, CONFIG.UI_UPDATE_INTERVAL);
}

// ✅ 업비트 시간 계산기 (어떤 TF가 와도 0.1초 컷)
export function getUpbitCandleStartTime(serverMs, tf) {
  const d = new Date(serverMs);
  const sec = tfSec[tf] || 60; // _config.js에 선언한 tfSec 활용!

  if (tf.includes("d") || tf.includes("w") || tf.includes("M")) {
    // 일, 주, 월봉은 시간/분/초를 0으로 셋팅
    d.setUTCHours(0, 0, 0, 0);
    if (tf === "1w") {
      // 주봉은 해당 주의 월요일(또는 일요일)로 맞춤
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1));
    } else if (tf === "1M") {
      // 월봉은 1일로 맞춤
      d.setUTCDate(1);
    }
  } else {
    // 분, 시간봉은 초단위로 나눠서 딱 떨어지게 만듦 (이게 핵심!)
    const timestamp = Math.floor(serverMs / 1000);
    return Math.floor(timestamp / sec) * sec;
  }
  return Math.floor(d.getTime() / 1000);
}

// ✅ UI 업데이트 인터벌 (tickerBuffer 안전하게 소모)
if (store.radarIntervalId) clearInterval(store.radarIntervalId);
store.radarIntervalId = setInterval(() => {
  // 🚀 1. 쌀먹 핵심: 버퍼가 비어있으면 CPU도 쉰다!
  if (Object.keys(store.tickerBuffer).length === 0) return;

  // 🚀 화면을 안 보고 있으면 DOM 업데이트(반짝이 등)는 싹 무시하고 장부만 업데이트!
  const isHidden = document.hidden;

  // 🚀 2. 데이터 안전 복사 (Snapshot) 후 원본 즉시 비우기
  // 이렇게 해야 비우는 찰나에 들어오는 데이터 유실이 없습니다.
  const snapshot = { ...store.tickerBuffer };
  for (let key in store.tickerBuffer) delete store.tickerBuffer[key];

  let dataUpdated = false;

  // 🚀 [수정] snapshot을 순회하는 대신, currentTableData를 순회하며 각 행에 맞는 티커 데이터를 찾습니다.
  store.currentTableData.forEach((row) => {
    const fullTicker = row.Ticker; // 예: "EDGEUSDT" 또는 "EDGEKRW"
    const ticker = snapshot[fullTicker];

    if (!ticker) {
      // 해당 행에 대한 실시간 데이터가 snapshot에 없으면 건너뜁니다.
      // 이는 해당 거래소의 레이더 스트림이 아직 데이터를 보내지 않았거나,
      // 해당 코인이 레이더 스트림의 대상이 아닐 수 있음을 의미합니다.
      return;
    }

    // 🚀 [수정] 원화 마켓(업비트) 티커일 경우, 원화 가격과 달러 환산 가격을 분리해서 저장!
    const isUpbitTicker = fullTicker.endsWith("KRW");
    if (isUpbitTicker) {
      const exchangeRate = store.marketDataMap?.krw_usd_rate || 1450.0;
      row.Price_KRW = parseFloat(ticker.c);
      row.Price_Raw = row.Price_KRW / exchangeRate; // 정렬용 USD 가격 유지
    } else {
      row.Price_Raw = parseFloat(ticker.c);
    }

    row.Change_24h_Raw = parseFloat(ticker.P);

    if (ticker.q) {
      row.Binance_Vol_Futures = parseFloat(ticker.q);
    }
    if (ticker.q_upbit) {
      row.Upbit_Vol_KRW = parseFloat(ticker.q_upbit);
    }

    dataUpdated = true;

    // 🚀 화면 업데이트
    if (store.visibleSymbols && store.visibleSymbols.has(row.DisplayTicker)) {
      const tId = row.Ticker; // 🚀 고유 식별자 장착 완료!

      // 🚀 [복구/추가] 테이블 내 가격 및 등락률 실시간 DOM 렌더링 (스나이퍼 소켓 없는 업비트 코인 등 필수!)
      const priceCell = document.getElementById(`price-${tId}`);
      if (priceCell) {
        const p = row.precision || 2;
        const newPriceRaw = row.Price_Raw;
        const oldPriceRaw =
          parseFloat(priceCell.getAttribute("data-raw-price")) || 0;

        if (newPriceRaw !== oldPriceRaw) {
          priceCell.setAttribute("data-raw-price", newPriceRaw);

          const formattedPrice = window.formatSmartPrice(newPriceRaw, p);
          const krwDisplay = row.Price_KRW
            ? `<span class="text-[12px] text-theme-text opacity-70 ml-1"> ( ${Number(row.Price_KRW).toLocaleString()} 원 )</span>`
            : "";

          priceCell.innerHTML = `${formattedPrice} ${krwDisplay}`;

          if (typeof window.applyPriceFlash === "function") {
            window.applyPriceFlash(priceCell, newPriceRaw, oldPriceRaw);
          }
        }
      }

      // 24시간 등락률
      const changeCell = document.getElementById(`change-${tId}`);
      if (changeCell) {
        const change24h = row.Change_24h_Raw || 0;
        const themeClass =
          change24h > 0
            ? "text-theme-up"
            : change24h < 0
              ? "text-theme-down"
              : "text-theme-text opacity-50";
        changeCell.innerHTML = `<span class="${themeClass} font-bold">${change24h > 0 ? "+" : ""}${change24h.toFixed(2)}%</span>`;
      }

      // 당일(Today) 등락률
      const todayCell = document.getElementById(`today-${tId}`);
      if (todayCell && row.utc0_open_Raw) {
        const openPrice = parseFloat(row.utc0_open_Raw);
        if (openPrice > 0) {
          const todayChange = ((row.Price_Raw - openPrice) / openPrice) * 100;
          row.Change_Today_Raw = todayChange;
          const tThemeClass =
            todayChange > 0
              ? "text-theme-up"
              : todayChange < 0
                ? "text-theme-down"
                : "text-theme-text opacity-50";
          todayCell.innerHTML = `<span class="${tThemeClass} font-bold">${todayChange > 0 ? "+" : ""}${todayChange.toFixed(2)}%</span>`;
        }
      }

      // 🚀 실시간 볼륨 업데이트
      if (ticker.q) {
        const binanceVolCell = document.getElementById(
          `vol-binance-${row.Symbol}`,
        );
        if (binanceVolCell)
          binanceVolCell.innerText = `B: ${window.formatVolumeDollar(parseFloat(ticker.q))}`;
      }
      if (ticker.q_upbit) {
        const upbitVolCell = document.getElementById(`vol-upbit-${row.Symbol}`);
        if (upbitVolCell)
          upbitVolCell.innerText = `U: ${window.formatVolumeKRW(parseFloat(ticker.q_upbit))}`;
      }
    }
  });
  // !isHidden &&
  if (dataUpdated && typeof applyRealtimeSort === "function") {
    applyRealtimeSort();
  }
}, CONFIG.UI_UPDATE_INTERVAL);

window.startRealtimeCandle = startRealtimeCandle;
window.startBinanceMarketRadar = startBinanceMarketRadar;
window.startUpbitMarketRadar = startUpbitMarketRadar;
