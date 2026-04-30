// stream.js
// --- 🌊 실시간 웹소켓 엔진 ---
function startRealtimeCandle(symbol, interval, isFutures, isSpot) {
  const streamName = `${symbol.toLowerCase()}usdt@kline_${interval}`;
  const wsBase = isFutures ? "wss://fstream.binance.com/market/ws" : "wss://stream.binance.com:9443/ws";

  // 🚀 [광클 방어 1선] 이미 똑같은 차트(코인+시간)를 보고 있으면 즉시 컷! (부하 0%)
  if ((isFutures || isSpot) && currentKlineStream === streamName && binanceChartWs && binanceChartWs.readyState === WebSocket.OPEN) {
    console.log(`😎 [스킵] 이미 ${streamName} 채널 시청 중입니다. (서버 부하 방지)`);
    return;
  }

  // 🚀 [해결책] 고유 ID 생성기 (바이낸스가 헷갈리지 않게 매번 다른 번호표 발급)
  const getWsId = () => Math.floor(Date.now() + Math.random() * 1000);

  // ---------------------------------------------------------
  // 📌 1. 렌더링 헬퍼 함수
  // ---------------------------------------------------------
  const renderWithGhosts = () => {
    if (!candleSeries || mainData.length < 2) {
      if (candleSeries) candleSeries.setData(mainData);
      return;
    }

    const lastTime = getUnixSeconds(mainData[mainData.length - 1].time);
    const intervalVal = (mainData.length >= 2)
      ? (lastTime - getUnixSeconds(mainData[mainData.length - 2].time))
      : 60;

    const ghostData = Array.from(
      { length: CHART_CONFIG.GHOST_COUNT },
      (_, i) => ({
        time: lastTime + intervalVal * (i + 1),
      })
    );

    candleSeries.setData([...mainData, ...ghostData]);

    const lastPrice = mainData[mainData.length - 1].close;
    const p = currentTableData.find(c => c.Symbol === symbol.toUpperCase)?.precision || 2;
    document.title = `${formatSmartPrice(lastPrice, p)} ${symbol} | ?sellance 🚀`;
  };

  // ---------------------------------------------------------
  // 📌 2. 이전 업비트 소켓 무조건 청소 (충돌 방지)
  // ---------------------------------------------------------
  if (upbitChartWs) {
    upbitChartWs.onmessage = null; // 핸들러 먼저 죽여야 안전!
    upbitChartWs.close();
    upbitChartWs = null;
  }

  // ---------------------------------------------------------
  // 📌 3. 바이낸스 타격 (선물 or 현물)
  // ---------------------------------------------------------
  if (isFutures || isSpot) {
    // 1️⃣ 소켓이 없거나 닫혔으면 새로 생성
    if (!binanceChartWs || binanceChartWs.readyState !== WebSocket.OPEN) {
      binanceChartWs = new WebSocket(wsBase);
      binanceChartWs.onopen = () => {
        binanceChartWs.send(JSON.stringify({ method: "SUBSCRIBE", params: [streamName], id: getWsId() }));
        currentKlineStream = streamName;
        console.log(`✅ [차트소켓] 신규 연결 및 구독 완료: ${streamName}`);
        document.getElementById("status-dot").style.background = "#26a69a";
        document.getElementById("status-text").innerText = "Binance LIVE";
      };

      binanceChartWs.onmessage = (e) => {
        // 🚀 [방어막] 차트 로딩 중이면 기존 코인의 틱 데이터는 가차 없이 씹는다!
        if (window.isFetchingChart) return;

        const res = JSON.parse(e.data);
        if (res.e !== "kline") return; // 캔들 아니면 무시

        // 🚀 [가장 중요] 다른 코인 데이터 새치기 방어
        const tickSymbol = res.k.s.toUpperCase();
        const currentAssetClean = currentAsset.split('(')[0].trim().toUpperCase();

        if (!tickSymbol.includes(currentAssetClean)) return; // 👈 튀는 현상 막아주는 1등 공신

        const k = res.k;
        const liveData = { time: k.t / 1000, open: +k.o, high: +k.h, low: +k.l, close: +k.c };

        if (mainData.length > 0) {
          const lastIdx = mainData.length - 1;
          if (mainData[lastIdx].time === liveData.time) mainData[lastIdx] = liveData;
          else if (liveData.time > mainData[lastIdx].time) mainData.push(liveData);
        }

        // 🚀 [결정적 수리] 바낸도 카운트다운 엔진에 '서버 시간(res.E)'을 먹여준다!
        if (typeof updateRealtimeCountdown === "function") {
          // res.E 는 바이낸스가 밀리초 단위로 쏴주는 정확한 서버 현재 시간입니다.
          updateRealtimeCountdown(res.E);
        }

        updateStatus(liveData);
        renderWithGhosts();
      };
    }
    // 2️⃣ 이미 열려있으면 채널만 교체 (구독/해지)
    else {
      if (currentKlineStream && currentKlineStream !== streamName) {
        binanceChartWs.send(JSON.stringify({ method: "UNSUBSCRIBE", params: [currentKlineStream], id: getWsId() }));
      }
      binanceChartWs.send(JSON.stringify({ method: "SUBSCRIBE", params: [streamName], id: getWsId() }));
      currentKlineStream = streamName;
      console.log(`🎯 [타겟교체] ${streamName}`);
    }
  }

  // ---------------------------------------------------------
  // 📌 4. 업비트 타격
  // ---------------------------------------------------------
  else {
    // 🚀 바이낸스 보던 게 있다면 데이터 안 섞이게 매너 해지!
    if (binanceChartWs && binanceChartWs.readyState === WebSocket.OPEN && currentKlineStream) {
      binanceChartWs.send(JSON.stringify({ method: "UNSUBSCRIBE", params: [currentKlineStream], id: getWsId() }));
      currentKlineStream = null;
    }

    const upbitTicker = `KRW-${symbol}`;
    upbitChartWs = new WebSocket("wss://api.upbit.com/websocket/v1");

    upbitChartWs.onopen = () => {
      const msg = [
        { ticket: "UNIQUE_TICKET" },
        { type: "ticker", codes: [upbitTicker] },
      ];
      upbitChartWs.send(JSON.stringify(msg));
      document.getElementById("status-dot").style.background = "#1261c4";
      document.getElementById("status-text").innerText = "Upbit LIVE";
    };

    upbitChartWs.onmessage = async (e) => {
      if (window.isFetchingChart) return;

      // 데이터 파싱 (Blob/Text 대응)
      let res;
      try {
        const text = (typeof e.data === 'string') ? e.data : await e.data.text();
        res = JSON.parse(text);
      } catch (err) { return; }

      // 🚨 [핵심] 업비트 전용 방어막 설치
      // 업비트는 티커가 'KRW-BTC' 형식으로 옵니다.
      const tickSymbol = res.code ? res.code.toUpperCase() : "";
      const currentAssetClean = currentAsset.split('(')[0].trim().toUpperCase();

      // 🚀 업비트 규격(KRW-BTC)에 내 코인 이름(BTC)이 포함되어 있는지 확인!
      if (!tickSymbol.includes(currentAssetClean)) return;

      // 서버 시간 및 캔들 시작 시간 계산
      const serverMs = res.timestamp;
      const candleStartTime = getUpbitCandleStartTime(serverMs, currentTF);

      if (candleSeries && mainData.length > 0) {
        const p = currentTableData.find(c => c.Symbol === currentAsset)?.precision;
        const liveData = {
          time: candleStartTime,
          open: +res.trade_price,
          high: +res.trade_price,
          low: +res.trade_price,
          close: +res.trade_price,
        };

        const lastIdx = mainData.length - 1;

        if (mainData[lastIdx].time === liveData.time) {
          liveData.open = mainData[lastIdx].open;
          liveData.high = Math.max(mainData[lastIdx].high, liveData.high);
          liveData.low = Math.min(mainData[lastIdx].low, liveData.low);
          mainData[lastIdx] = liveData;
        } else if (liveData.time > mainData[lastIdx].time) {
          mainData.push(liveData);
        }

        const displayPrice = formatSmartPrice(liveData.close, p);
        document.title = `2 ${displayPrice} ${symbol} | sellance 🚀`;

        if (typeof updateRealtimeCountdown === "function") {
          updateRealtimeCountdown(serverMs);
        }

        updateStatus(liveData);
        renderWithGhosts();
      }
    };
    // upbitChartWs.onclose = () => {
    //   document.getElementById("status-dot").style.background = "#ef5350";
    //   document.getElementById("status-text").innerText = "OFFLINE";
    // };
  }
}

function startBinanceMarketRadar() {
  // 🚀 안전하게 기존 소켓 닫기
  if (binanceRadarWs) {
    binanceRadarWs.onmessage = null;
    binanceRadarWs.close();
  }

  binanceRadarWs = new WebSocket("wss://fstream.binance.com/market/ws/!ticker@arr");

  binanceRadarWs.onopen = () => {
    // console.log("✅ [전체소켓] 바이낸스 선물 스트림 연결 성공!");
    // document.getElementById("status-dot").style.background = "#26a69a";
  };

  binanceRadarWs.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // 🚀 데이터가 들어오는지 딱 한 번만 확인
    // console.log("데이터 수신 중...", data.length); 

    data.forEach((ticker) => {
      const pureSymbol = ticker.s.replace("USDT", "");
      tickerBuffer[pureSymbol] = ticker;
    });
  };

  binanceRadarWs.onclose = (e) => {
    console.log(`❌ [전체소켓] 연결 끊김! ${UI_UPDATE_INTERVAL / 1000}초 후 재시도...`, e.reason);
    setTimeout(startBinanceMarketRadar, UI_UPDATE_INTERVAL); // 🚀 자동 재연결!
  };

  binanceRadarWs.onerror = (err) => {
    console.error("🚨 [전체소켓] 에러 발생:", err);
  };
}

function startUpbitMarketRadar() {
  if (upbitRadarWs) {
    upbitRadarWs.onmessage = null;
    upbitRadarWs.close();
  }

  upbitRadarWs = new WebSocket("wss://api.upbit.com/websocket/v1");
  upbitRadarWs.binaryType = 'arraybuffer';

  upbitRadarWs.onopen = () => {
    // 🚀 [핵심 최적화] 
    // Upbit 상장('O') 되어 있어야 함
    // 바이낸스 티커가 없거나, Note에 'Upbit Only'라고 명시된 놈들만 필터링
    // Ticker가 '...USDT'면 바이낸스에 있는 놈이니 제외 대상!)
    const upbitOnlyCodes = currentTableData
      .filter(row => {
        const isUpbit = row.Upbit === 'O';
        // 바이낸스 티커(Ticker)가 없거나 'null'인 경우만 업비트 소켓으로 구독
        const isNotOnBinance = !row.Ticker || row.Ticker === "" || row.Note === "Upbit Only";
        return isUpbit && isNotOnBinance;
      })
      .map(row => `KRW-${row.Symbol}`);

    if (upbitOnlyCodes.length === 0) {
      console.log("✅ 모든 코인이 바이낸스 스트림에 포함되어 업비트 개별 소켓을 열지 않습니다.");
      return;
    }

    const msg = [
      { ticket: "UNIQUE_TICKET" },
      { type: "ticker", codes: upbitOnlyCodes }
    ];
    upbitRadarWs.send(JSON.stringify(msg));
    console.log(`🎯 [업비트 전용] ${upbitOnlyCodes.length}개 국내산 코인들 타격 시작!`);
  };

  const decoder = new TextDecoder('utf-8');
  upbitRadarWs.onmessage = (event) => {

    const ticker = JSON.parse(decoder.decode(event.data));
    const pureSymbol = ticker.code.replace("KRW-", "");

    // 🚀 업비트 전용 코인들의 데이터를 버퍼에 저장
    tickerBuffer[pureSymbol] = {
      s: pureSymbol,
      c: ticker.trade_price,
      P: ticker.signed_change_rate * 100,
    };
  };

  upbitRadarWs.onclose = () => setTimeout(startUpbitMarketRadar, UI_UPDATE_INTERVAL);
}

// ✅ 업비트 시간 계산기 (어떤 TF가 와도 0.1초 컷)
function getUpbitCandleStartTime(serverMs, tf) {
  const d = new Date(serverMs);
  const sec = tfSec[tf] || 60; // _config.js에 선언한 tfSec 활용!

  if (tf.includes('d') || tf.includes('w') || tf.includes('M')) {
    // 일, 주, 월봉은 시간/분/초를 0으로 셋팅
    d.setUTCHours(0, 0, 0, 0);
    if (tf === '1w') {
      // 주봉은 해당 주의 월요일(또는 일요일)로 맞춤
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1));
    } else if (tf === '1M') {
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
if (radarIntervalId) clearInterval(radarIntervalId);
radarIntervalId = setInterval(() => {
  // 🚀 1. 쌀먹 핵심: 버퍼가 비어있으면 CPU도 쉰다!
  if (Object.keys(tickerBuffer).length === 0) return;

  // 🚀 화면을 안 보고 있으면 DOM 업데이트(반짝이 등)는 싹 무시하고 장부만 업데이트!
  const isHidden = document.hidden;

  // 🚀 2. 데이터 안전 복사 (Snapshot) 후 원본 즉시 비우기
  // 이렇게 해야 비우는 찰나에 들어오는 데이터 유실이 없습니다.
  const snapshot = { ...tickerBuffer };
  for (let key in tickerBuffer) delete tickerBuffer[key];

  let dataUpdated = false;

  Object.keys(snapshot).forEach((pureSymbol) => {
    const ticker = snapshot[pureSymbol];
    const row = currentTableData.find(r => r.Symbol === pureSymbol);
    if (!row) return;

    row.Price_Raw = parseFloat(ticker.c);
    row.Change_24h_Raw = parseFloat(ticker.P);
    dataUpdated = true;

    // 🚀 3. 화면에 보이는 놈만 DOM 터치
    // !isHidden &&
    if (typeof visibleSymbols !== "undefined" && visibleSymbols.has(pureSymbol)) {
      const priceCell = document.getElementById(`price-${pureSymbol}`);
      if (priceCell) {
        const oldPrice = parseFloat(priceCell.innerText.replace(/[^0-9.-]+/g, "")) || 0;
        const newPrice = row.Price_Raw;

        // priceCell.innerText = formatSmartPrice(newPrice, row.precision ?? 2);

        // 🚀 전체 레이더 업데이트 시에도 반짝이 발사!
        // 개별 웹소캣으로 역할 넘겨주자
        // applyPriceFlash(priceCell, newPrice, oldPrice);
      }
    }
  });
  // !isHidden &&
  if (dataUpdated && typeof applyRealtimeSort === "function") {
    applyRealtimeSort();
  }
}, UI_UPDATE_INTERVAL);