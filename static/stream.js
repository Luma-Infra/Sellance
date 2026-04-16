// --- 🌊 실시간 웹소켓 엔진 ---
// stream.js
function startRealtimeCandle(symbol, interval, isFutures, isSpot) {
  if (currentWs) {
    // 🚀 귀부터 막기 (이게 없으면 닫는 와중에 메시지 와서 터짐)
    currentWs.onopen = null;
    currentWs.onmessage = null;
    currentWs.onclose = null;
    currentWs.onerror = null;

    currentWs.close();
    currentWs = null;
  }

  // 🚀 [추가] update()를 대체할 궁극의 실시간 덮어쓰기 함수
  const renderWithGhosts = () => {
    if (!candleSeries || mainData.length < 2) {
      if (candleSeries) candleSeries.setData(mainData);
      return;
    }

    // 앞서 만든 헬퍼 함수 활용 (initChart 밖에 선언해두면 좋습니다)
    const lastTime = getUnixSeconds(mainData[mainData.length - 1].time);
    const interval =
      lastTime - getUnixSeconds(mainData[mainData.length - 2].time);

    // 🚀 전역 변수 CHART_CONFIG.GHOST_COUNT 적용!
    const ghostData = Array.from(
      { length: CHART_CONFIG.GHOST_COUNT },
      (_, i) => ({
        time: lastTime + interval * (i + 1),
      }),
    );

    candleSeries.setData([...mainData, ...ghostData]);

    // stream.js 내부 renderWithGhosts 함수 하단
    if (mainData && mainData.length > 0) {
      const lastPrice = mainData[mainData.length - 1].close;

      // JS에 있는 formatSmartPrice 함수 소환!
      const displayPrice = formatSmartPrice(lastPrice);

      // 탭 제목 0.1초 컷 업데이트 🚀
      document.title = `${displayPrice} ${symbol} | sellance 🚀`;
    }
  };

  // binance
  if (isFutures || isSpot) {
    const binanceTicker = `${symbol}USDT`;
    const wsBase = isFutures
      ? "wss://fstream.binance.com/ws/"
      : "wss://stream.binance.com:9443/ws/";
    currentWs = new WebSocket(
      wsBase + `${binanceTicker.toLowerCase()}@kline_${interval}`,
    );

    currentWs.onopen = () => {
      document.getElementById("status-dot").style.background = "#26a69a";
      document.getElementById("status-text").innerText = "LIVE";
    };

    currentWs.onmessage = (e) => {
      const res = JSON.parse(e.data);
      const k = res.k;
      const serverMs = res.E;
      const liveData = {
        time: k.t / 1000,
        open: +k.o,
        high: +k.h,
        low: +k.l,
        close: +k.c,
      };

      if (mainData.length > 0) {
        const lastIdx = mainData.length - 1;
        if (mainData[lastIdx].time === liveData.time)
          mainData[lastIdx] = liveData;
        else if (liveData.time > mainData[lastIdx].time)
          mainData.push(liveData);
      }
      // 🚀 카운트다운을 웹소켓 서버 시간에 종속시킴
      if (typeof updateRealtimeCountdown === "function") {
        updateRealtimeCountdown(serverMs);
      }
      // 🚨 기존 candleSeries.update(liveData); 삭제하고 아래 함수로 교체!
      renderWithGhosts();
    };

    currentWs.onclose = () => {
      document.getElementById("status-dot").style.background = "#ef5350";
      document.getElementById("status-text").innerText = "OFFLINE";
    };
  } else {
    // upbit
    const upbitTicker = `KRW-${symbol}`;
    currentWs = new WebSocket("wss://api.upbit.com/websocket/v1");

    currentWs.onopen = () => {
      const msg = [
        { ticket: "UNIQUE_TICKET" },
        { type: "ticker", codes: [upbitTicker] },
      ];
      currentWs.send(JSON.stringify(msg));
      document.getElementById("status-dot").style.background = "#26a69a";
      document.getElementById("status-text").innerText = "LIVE";
    };

    currentWs.onmessage = async (e) => {
      if (!currentWs) return;

      const text = await e.data.text();
      const res = JSON.parse(text);
      const serverMs = res.timestamp; // 🚨 업비트가 보내준 현재 서버 시간

      if (candleSeries && mainData.length > 0) {
        const d = new Date(res.timestamp);

        if (currentTF === "1m") d.setUTCSeconds(0, 0);
        else if (currentTF === "15m") {
          d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 15) * 15, 0, 0);
        } else if (currentTF === "1h") {
          d.setUTCMinutes(0, 0, 0);
        } else if (currentTF === "4h") {
          d.setUTCHours(Math.floor(d.getUTCHours() / 4) * 4, 0, 0, 0);
        } else if (currentTF === "1d") {
          d.setUTCHours(0, 0, 0, 0);
        }

        const candleStartTime = Math.floor(d.getTime() / 1000);

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

        // 🚀 카운트다운을 웹소켓 서버 시간에 종속시킴
        if (typeof updateRealtimeCountdown === "function") {
          updateRealtimeCountdown(serverMs);
        }

        // 🚨 기존 candleSeries.update(liveData); 삭제하고 아래 함수로 교체!
        renderWithGhosts();
      }
    };

    currentWs.onclose = () => {
      document.getElementById("status-dot").style.background = "#ef5350";
      document.getElementById("status-text").innerText = "OFFLINE";
    };
  }
}

function startGlobalMarketRadar() {
  globalWs = new WebSocket("wss://fstream.binance.com/ws/!ticker@arr");

  globalWs.onopen = () => {
    const dot = document.getElementById("status-dot"),
      text = document.getElementById("status-text");
    if (dot) dot.style.background = "#26a69a";
    if (text) text.innerText = `MARKET LIVE (${UI_UPDATE_INTERVAL / 1000}s)`;
  };

  // stream.js 내부 수정
  globalWs.onmessage = (event) => {
    const data = JSON.parse(event.data);

    data.forEach((ticker) => {
      const pureSymbol = ticker.s.replace("USDT", "");
      tickerBuffer[pureSymbol] = ticker; // 정렬용 버퍼는 그대로 유지

      // // 🚀 [차등화 전략 핵심] 0초 실시간 깜빡이 센서 가동
      // // 쌀먹 원칙: CCTV(visibleSymbols)에 잡힌 놈만 즉시 렌더링한다.
      // if (
      //   typeof visibleSymbols !== "undefined" &&
      //   visibleSymbols.has(pureSymbol)
      // ) {
      //   const priceCell = document.getElementById(`price-${pureSymbol}`);
      //   if (priceCell) {
      //     const newPrice = parseFloat(ticker.c);
      //     const oldPrice = parseFloat(
      //       priceCell.innerText.replace(/[^0-9.-]+/g, ""),
      //     );

      //     // 가격이 변했을 때만 즉시 DOM 조작 (웹소켓 단위)
      //     if (oldPrice !== newPrice) {
      //       priceCell.innerText = `$ ${formatSmartPrice(newPrice)}`;

      //       const flashClass = newPrice > oldPrice ? "flash-up" : "flash-down";
      //       priceCell.classList.add(flashClass);

      //       // 0.2초 뒤 클래스 제거 (다음 깜빡임을 위해)
      //       setTimeout(() => priceCell.classList.remove(flashClass), 200);
      //     }
      //   }
      // }
    });
  };

  if (radarIntervalId) clearInterval(radarIntervalId);
  radarIntervalId = setInterval(() => {
    let dataUpdated = false; // 데이터가 갱신되었는지 확인하는 플래그

    Object.keys(tickerBuffer).forEach((pureSymbol) => {
      const ticker = tickerBuffer[pureSymbol];
      const newPrice = parseFloat(ticker.c);

      // 🚨 1. 정렬을 위해 원본 배열(currentTableData) 무조건 갱신!
      // (화면에 안 보여도 데이터는 최신화해둬야 갑자기 떡상할 때 1등으로 치고 올라옵니다)
      if (typeof currentTableData !== "undefined") {
        const targetRow = currentTableData.find(
          (c) => (c.Symbol || c.symbol) === pureSymbol,
        );
        if (targetRow) {
          targetRow.Price = newPrice;
          targetRow.Change_24h = parseFloat(ticker.P);
          if (targetRow.utc0_open) {
            const openPrice = parseFloat(targetRow.utc0_open);
            targetRow.Change_Today = ((newPrice - openPrice) / openPrice) * 100;
          }
          dataUpdated = true;
        }
      }

      // 🚨 2. 화면에 안 보이는 코인이면 CPU 절약을 위해 DOM 업데이트(깜빡임 등)는 패스!
      if (
        typeof visibleSymbols !== "undefined" &&
        !visibleSymbols.has(pureSymbol)
      )
        return;

      // --- 👇 여기서부터는 기존 화면 업데이트 로직 동일 👇 ---
      const priceCell = document.getElementById(`price-${pureSymbol}`);
      const changeCell = document.getElementById(`change-${pureSymbol}`);
      const todayCell = document.getElementById(`today-${pureSymbol}`);

      // if (priceCell) {
      //   const currentPrice = parseFloat(
      //     priceCell.innerText.replace(/[^0-9.-]+/g, ""),
      //   );
      //   if (currentPrice !== newPrice) {
      //     priceCell.innerText = `$ ${formatSmartPrice(newPrice)}`;
      //     const flashClass =
      //       newPrice > currentPrice ? "flash-up" : "flash-down";
      //     priceCell.classList.add(flashClass);
      //     setTimeout(() => priceCell.classList.remove(flashClass), 200);
      //   }
      // }

      // if (changeCell) {
      //   const newChange = parseFloat(ticker.P);
      //   const formattedChange = newChange.toFixed(2); // 🚀 소수점 2자리 고정

      //   const color =
      //     newChange > 0 ? "#26a69a" : newChange < 0 ? "#ef5350" : "gray";
      //   const weight = Math.abs(newChange) >= 5.0 ? "bold" : "normal";

      //   // formattedChange를 출력에 사용
      //   changeCell.innerHTML = `<span style="color:${color}; font-weight:${weight};">${newChange > 0 ? "+" : ""}${formattedChange} %</span>`;
      // }

      // if (todayCell && typeof originalTableData !== "undefined") {
      //   const targetCoin = originalTableData.find(
      //     (c) => (c.Symbol || c.symbol) === pureSymbol,
      //   );

      //   if (targetCoin && targetCoin.utc0_open) {
      //     const openPrice = parseFloat(targetCoin.utc0_open);
      //     const newPrice = parseFloat(ticker.c);

      //     if (openPrice > 0) {
      //       // 🚀 1. 새로 계산한 등락률 (숫자형)
      //       const todayChange = ((newPrice - openPrice) / openPrice) * 100;

      //       // 🚀 2. 출력용 문자열 (소수점 2자리 고정)
      //       const finalStr = todayChange.toFixed(2);

      //       const tColor =
      //         todayChange > 0
      //           ? "#26a69a"
      //           : todayChange < 0
      //             ? "#ef5350"
      //             : "gray";
      //       const tWeight = Math.abs(todayChange) >= 5.0 ? "bold" : "normal";

      //       // 🚀 3. DOM 업데이트
      //       todayCell.innerHTML = `<span style="color:${tColor}; font-weight:${tWeight};">${todayChange > 0 ? "+" : ""}${finalStr} %</span>`;

      //       // 🚀 4. [중요] 정렬용 데이터(currentTableData)도 숫자로 업데이트
      //       const row = currentTableData.find(
      //         (r) => (r.Symbol || r.symbol) === pureSymbol,
      //       );
      //       if (row) {
      //         row.Change_Today = todayChange; // 여기는 숫자로 저장해야 나중에 정렬할 때 안 터짐
      //       }
      //     }
      //   }
      // }
    });
    tickerBuffer = {};

    // 🚀 3. 데이터가 갱신되었다면 경주마 애니메이션 출동! (3초마다 스르륵)
    if (dataUpdated && typeof applyRealtimeSort === "function") {
      applyRealtimeSort();
    }
  }, UI_UPDATE_INTERVAL);

  globalWs.onerror = () => {
    const dot = document.getElementById("status-dot"),
      text = document.getElementById("status-text");
    if (dot) dot.style.background = "#ef5350";
    if (text) text.innerText = "ERROR/DISCONNECTED";
  };
}
