// _main.js
// 🚀 엔진 시동 파트
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🏁 대시보드 엔진 가동 시작...");

  try {
    // 1️⃣ [데이터 로드] 마켓 구성 정보 + 실제 테이블 장부를 '순서대로' 가져온다
    if (typeof loadSymbols === "function") {
      await loadSymbols(); // 코인 맵핑 정보 로드
      console.log("✅ 1-A. 마켓 맵 로드 완료");
    }

    if (typeof loadTableData === "function") {
      // 🚨 핵심: 실시간 시세가 기록될 '진짜 장부'가 채워질 때까지 기다립니다.
      await loadTableData();
      console.log("✅ 1-B. 실시간 시세 장부(currentTableData) 입고 완료");
    }

    // 2️⃣ [엔진 준비] 이제 장부가 확실히 있으니 차트를 그린다
    if (window.currentTableData && window.currentTableData.length > 0) {
      initChart();
      initMeasureEvents();
      initInfiniteScroll();
      console.log("✅ 2. 차트 및 인터페이스 준비 완료");

      // 3️⃣ [소켓 점화] 모든 준비가 끝났을 때 비로소 소켓을 연결!
      // (장부가 꽉 차 있어서 켜지자마자 바로 구독 성공함)
      initSniperSocket();
      if (typeof startBinanceMarketRadar === "function") startBinanceMarketRadar();
      if (typeof startUpbitMarketRadar === "function") startUpbitMarketRadar();
      console.log("✅ 3. 실시간 소켓 연결 성공!");
    } else {
      throw new Error("장부 데이터가 비어있습니다.");
    }

    // 4️⃣ [UI 이벤트] 슬라이더 및 버튼 반응 설정
    setupSliderEvents();
    setupButtonEvents();

  } catch (err) {
    console.error("🚨 시동 실패:", err);
    // 보험: 2초 뒤 자동 새로고침 시도
    // setTimeout(() => location.reload(), 2000);
  }
});

// 💡 슬라이더 로직 (가독성을 위해 분리)
function setupSliderEvents() {
  ["body", "top", "bottom"].forEach((id) => {
    const inputEl = document.getElementById("input-" + id);
    if (inputEl) {
      inputEl.oninput = () => {
        const val = inputEl.value;
        document.getElementById("val-" + id).innerText = val + "%";
        if (id === "body") {
          if (curDir === "bull") bullBody = val;
          else bearBody = val;
        }
        updateStatus();
        if (isHover && typeof updatePreview === "function") updatePreview();
      };
    }
  });
}

// 💡 버튼 호버 로직
function setupButtonEvents() {
  const genBtn = document.getElementById("btn-generate");
  if (genBtn) {
    genBtn.onmouseenter = () => {
      isHover = true;
      if (typeof updatePreview === "function") updatePreview();
    };
    genBtn.onmouseleave = () => {
      isHover = false;
      previewSeries.setData([]);
    };
  }
}

// ⚙️ 2. 시간 변환 통합 헬퍼 (전역으로 이동!)
// 이제 initChart와 startRealtimeCandle 양쪽에서 모두 사용 가능합니다.
const getUnixSeconds = (t) => {
  if (typeof t === "object" && t !== null)
    return new Date(t.year, t.month - 1, t.day).getTime() / 1000;
  if (typeof t === "string") return new Date(t).getTime() / 1000;
  return t;
};

function initChart() {
  const container = document.getElementById("chart-container");
  // 🚀 과거와의 작별 (이게 메모리 아끼는 핵심!)
  if (chart) {
    chart.remove(); // 엔진 내부 메모리 해제
    chart = null;
    candleSeries = null;
    countdownPriceLine = null; // 👈 유령 방지
  }

  const isDark = currentTheme === "binance" || currentTheme === "upbit-dark";
  const upColor = currentTheme === "binance" ? "#26a69a" : "#c84a31";
  const downColor = currentTheme === "binance" ? "#ef5350" : "#1261c4";

  chart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: {
        color: getComputedStyle(document.body).getPropertyValue("--bg").trim(),
      },
      textColor: getComputedStyle(document.body)
        .getPropertyValue("--text")
        .trim(),
    },
    grid: {
      vertLines: { color: isDark ? "#2a2a22" : "#f1f1f11f" },
      horzLines: { color: isDark ? "#2a2a22" : "#f1f1f11f" },
    },
    timeScale: {
      borderColor: isDark ? "#2a2a22" : "#f1f1f11f",
      timeVisible: true,
      secondsVisible: false,
      fixRightEdge: false,
      tickMarkFormatter: (time, tickMarkType) => {
        const d = new Date(getUnixSeconds(time) * 1000);
        if (isNaN(d.getTime())) return "";

        // 🚀 핵심: tickMarkType이 'Year'(0)이면 연도를 최우선으로 반환
        // LightweightCharts.TickMarkType.Year 값은 보통 0입니다.
        if (tickMarkType === 0) {
          return `${d.getFullYear()}년`;
        }

        const isDayUnit = !(currentTF || "1h").match(/[hm]/);

        if (isDayUnit) {
          // 일봉 이상: 연도 첫날이 아니면 '월/일' 표시
          return `${d.getMonth() + 1}/${d.getDate()}`;
        } else {
          // 분/시간봉: '시:분' 표시
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
      },
    },
    localization: {
      locale: navigator.language,
      timeFormatter: (tick) => {
        const d = new Date(getUnixSeconds(tick) * 1000);
        if (isNaN(d.getTime())) return "";

        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const date = String(d.getDate()).padStart(2, "0");
        const h = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");

        // 🚀 십자선(Crosshair) 라벨도 동일한 규칙 적용
        if ((currentTF || "1h").match(/[hm]/)) {
          return `${y}-${m}-${date} ${h}:${min}`;
        } else {
          return `${y}-${m}-${date}`;
        }
      },
    },
    rightPriceScale: {
      autoScale: true,
      visible: true,
      entireTextOnly: false,
      borderColor: isDark ? "#2a2a22" : "#f1f1f11f",
      mode: isLogMode ? 1 : 0,
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
  });

  // 🚀 1. 공통 커스텀 가격 포맷 설정 (함수 추가 없이 기존 formatSmartPrice 재활용!)
  const p = currentTableData.find(c => c.Symbol === currentAsset)?.precision ?? 2;
  const safeMinMove = Number((1 / Math.pow(10, p)).toFixed(p));
  const customPriceFormat = {
    type: "custom",
    precision: p,
    minMove: safeMinMove,
    formatter: (price) => {
      if (typeof price !== 'number') return "";
      // 🚨 여기서 한 번 더 p값으로 강제 컷트!
      return formatSmartPrice(price, p);
    },
  };

  candleSeries = chart.addCandlestickSeries({
    upColor,
    downColor,
    borderUpColor: upColor,
    borderDownColor: downColor,
    wickUpColor: upColor,
    wickDownColor: downColor,
    priceFormat: customPriceFormat, // 👈 여기 추가
    lastValueVisible: false,
  });

  previewSeries = chart.addCandlestickSeries({
    upColor: upColor + "4D",
    downColor: downColor + "4D",
    borderVisible: false,
    wickVisible: false,
    priceFormat: customPriceFormat, // 👈 여기 추가
  });

  chart.subscribeCrosshairMove((p) => {
    // 1. 마우스가 차트 위에 있고 데이터가 존재할 때 (탐색 모드)
    if (p && p.time) {
      const d = p.seriesData.get(candleSeries);
      if (d) {
        updateLegend(d);
      }
    }
    // 2. 마우스가 차트를 벗어났을 때 (실시간 추적 모드)
    else if (mainData && mainData.length > 0) {
      // 가장 최근 봉(현재가) 데이터를 전광판에 고정!
      updateLegend(mainData[mainData.length - 1]);
    }
  });

  // 🚀 설정 변수를 활용한 유령 데이터 렌더링
  if (mainData.length > 1) {
    const lastTime = getUnixSeconds(mainData[mainData.length - 1].time);
    const interval =
      lastTime - getUnixSeconds(mainData[mainData.length - 2].time);

    // 🚀 전역 변수 적용
    const ghostData = Array.from(
      { length: CHART_CONFIG.GHOST_COUNT },
      (_, i) => ({
        time: lastTime + interval * (i + 1),
      }),
    );

    candleSeries.setData([...mainData, ...ghostData]);

    // VISIBLE_COUNT, RIGHT_PADDING 변수 사용
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, mainData.length - CHART_CONFIG.VISIBLE_COUNT),
      to: mainData.length + CHART_CONFIG.RIGHT_PADDING,
    });
  } else if (mainData.length === 1) {
    candleSeries.setData(mainData);
    autoFit();
  }

  // 측정 도구 세팅
  setTimeout(setupMeasureTool, 50);

  // 리사이즈 옵저버 디바운스
  if (window.chartResizeObserver) window.chartResizeObserver.disconnect();

  let resizeTimeout;
  window.chartResizeObserver = new ResizeObserver(([entry]) => {
    // 1. 부모 컨테이너 크기 실시간 감지
    const { width, height } = entry.contentRect;

    // 2. 0달러 방지 (크기가 0일 땐 패스)
    if (!width || !height) return;

    // 3. 디바운스 (너무 자주 그리면 렉 걸리니까 잠시 대기)
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (chart) {
        chart.resize(width, height);
        // 🚀 리사이즈 직후 차트 범위를 다시 맞춰야 안 찌그러짐
        // chart.timeScale().fitContent();
        // console.log(`📏 리사이즈 완료: ${width}x${height}`);
      }

      // 🚀 모바일 오버레이 방어 (아까 그 기준 적용!)
      if (width >= SCREEN_WIDTH) {
        const overlay = document.getElementById("mobile-chart-overlay");
        if (overlay && !overlay.classList.contains('hidden')) {
          closeMobileChart();
        }
      }
    }, 50);
  });
  // 🎯 차트 컨테이너 감시 시작!
  const chartContainer = document.getElementById("chart-container");
  if (chartContainer) {
    window.chartResizeObserver.observe(chartContainer);
  }
}

function setTF(tf) {
  const isSimMode = document.getElementById("tab-btn-sim").classList.contains("active");
  if (isSimMode) {
    Swal.fire({
      title: "초기화 경고!",
      text: "타임프레임을 변경하면 현재 그려둔 가상 차트가 모두 날아갑니다. 바꿀까요?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "var(--up)",
      cancelButtonColor: "var(--border)",
      confirmButtonText: "네, 변경할게요 🚀",
      cancelButtonText: "아니요, 취소",
      background: "var(--panel)",
      color: "var(--text)",
    }).then((result) => {
      if (result.isConfirmed) executeSetTF(tf);
    });
  } else {
    executeSetTF(tf);
  }
}

function executeSetTF(tf) {
  currentTF = tf;
  document.querySelectorAll(".tf-btn").forEach((b) => {
    const onClickAttr = b.getAttribute("onclick") || "";
    // 현재 버튼이 클릭된 타임프레임(tf)과 일치하는지 확인
    const isMatch = onClickAttr.includes(`'${tf}'`);

    // active 클래스 토글
    b.classList.toggle("active", isMatch);

    // 투명도 조절 (Tailwind 기준) - 반드시 루프 안에서 실행!
    b.classList.toggle("opacity-100", isMatch);
    b.classList.toggle("opacity-50", !isMatch);
  });

  // 4. 차트 데이터 갱신 함수 호출
  if (typeof fetchHistory === "function") fetchHistory(currentAsset);
}

function toggleLogScale() {
  isLogMode = !isLogMode;
  const btn = document.getElementById("log-btn");
  if (btn) {
    btn.innerText = isLogMode ? "Log ON" : "Log Off";
    btn.classList.toggle("active", isLogMode);
  }
  chart.priceScale("right").applyOptions({ mode: isLogMode ? 1 : 0 });
}

function updatePreview() {
  if (mainData.length && isHover && typeof getNext === "function")
    previewSeries.setData([getNext()]);
}

function stopMeasuring() {
  isMeasuring = false;
  measureStart = null;
  measureEnd = null;
  [measureBox, startPriceLabel, endPriceLabel, priceRangeBar].forEach((el) => {
    el.style.display = "none";
    el.innerText = "";
  });
}

// --- 🚀 2. 렌더링 시 DOM만 다시 붙여주는 함수 (initChart 내부에서 호출) ---
function setupMeasureTool() {
  const container = document.getElementById("chart-container");
  cachedChartTd = container.querySelector("td:nth-child(2)");
  cachedPriceTd = container.querySelector("td:nth-child(3)");

  if (!cachedChartTd || !cachedPriceTd) return;

  cachedChartTd.style.position = "relative";
  cachedPriceTd.style.position = "relative";
  cachedChartTd.appendChild(measureBox);
  cachedPriceTd.appendChild(priceRangeBar);
  cachedPriceTd.appendChild(startPriceLabel);
  cachedPriceTd.appendChild(endPriceLabel);
}

// --- ⚡ 3. 마우스 이벤트 (단 한 번만 실행되도록 분리) ---
function initMeasureEvents() {
  const container = document.getElementById("chart-container");

  container.addEventListener("mousedown", (e) => {
    // 🚀 매번 찾지 않고 캐싱된 DOM 사용
    if (!cachedChartTd || !cachedPriceTd || !chart || !candleSeries) return;

    const rect = container.getBoundingClientRect();
    if (e.clientX - rect.left > rect.width - (cachedPriceTd.clientWidth || 60))
      return;

    if (e.shiftKey && e.button === 0) {
      stopMeasuring();
      isMeasuring = true;

      const chartRect = cachedChartTd.getBoundingClientRect();
      const sX = e.clientX - chartRect.left;
      const sY = e.clientY - chartRect.top;
      const price = candleSeries.coordinateToPrice(sY);

      measureStart = {
        x: sX,
        y: sY,
        price: price,
        time: chart.timeScale().coordinateToTime(sX),
      };

      // 초기화 및 노출
      measureBox.style.cssText += `left: ${sX}px; top: ${sY}px; width: 0px; height: 0px; display: flex;`;
      priceRangeBar.style.cssText += `top: ${sY}px; height: 0px; display: block;`;
      startPriceLabel.style.cssText += `top: ${sY - 10}px; display: block;`;
      endPriceLabel.style.cssText += `top: ${sY - 10}px; display: block;`;

      measureBox.innerText = "";
      startPriceLabel.innerText = formatSmartPrice(price);
      endPriceLabel.innerText = formatSmartPrice(price);
      e.preventDefault();
    } else if (e.button === 0 && isMeasuring) {
      isMeasuring = false;
    } else if (!e.shiftKey && !isMeasuring && measureStart) {
      stopMeasuring();
    }
  });

  container.addEventListener("mousemove", (e) => {
    if (!isMeasuring || !measureStart || !cachedChartTd || !candleSeries)
      return;

    const chartRect = cachedChartTd.getBoundingClientRect();
    const curX = e.clientX - chartRect.left;
    const curY = e.clientY - chartRect.top;

    const curPrice = candleSeries.coordinateToPrice(curY);
    const curTime = chart.timeScale().coordinateToTime(curX);
    if (curPrice === null || curTime === null) return;

    measureEnd = { price: curPrice, time: curTime };

    // 🚀 실시간 좌표 역산
    const startX = chart.timeScale().timeToCoordinate(measureStart.time);
    const startY = candleSeries.priceToCoordinate(measureStart.price);
    if (startX === null || startY === null) return;

    const priceDiff = curPrice - measureStart.price;
    const percentDiff = (priceDiff / measureStart.price) * 100;
    const isUp = priceDiff >= 0;
    const tColor = isUp ? "var(--up, #26a69a)" : "var(--down, #ef5350)";
    const tBg = isUp ? "rgba(38,166,154,0.15)" : "rgba(239,83,80,0.15)";

    const topY = Math.min(startY, curY),
      heightY = Math.max(0.5, Math.abs(curY - startY));
    const leftX = Math.min(startX, curX),
      widthX = Math.abs(curX - startX);

    measureBox.style.cssText += `left: ${leftX}px; top: ${topY}px; width: ${widthX}px; height: ${heightY}px; border-color: ${tColor}; background-color: ${tBg}; color: ${tColor};`;
    priceRangeBar.style.cssText += `top: ${topY}px; height: ${heightY}px; background-color: ${tBg};`;
    startPriceLabel.style.cssText += `top: ${startY - 10}px; background-color: ${tColor};`;
    endPriceLabel.style.cssText += `top: ${curY - 10}px; background-color: ${tColor};`;
    endPriceLabel.innerText = formatSmartPrice(curPrice);

    const barsDiff = Math.abs(
      Math.round((curTime - measureStart.time) / (tfSec[currentTF] || 86400)),
    );
    measureBox.innerText = `${barsDiff} bars\n${formatSmartPrice(priceDiff)}\n(${isUp ? "+" : ""}${percentDiff.toFixed(2)}%)`;
  });

  container.addEventListener("contextmenu", (e) => {
    if (measureStart) {
      e.preventDefault();
      stopMeasuring();
    }
  });
}

function toggleCountdown(isChecked) {
  showCountdown = isChecked;
  const knob = document.getElementById("countdown-knob");

  // UI 토글 애니메이션
  if (isChecked) {
    knob.style.transform = "translateX(10px)";
    knob.parentElement.classList.add("bg-theme-accent");
    if (countdownOverlay) countdownOverlay.style.display = "block";
  } else {
    knob.style.transform = "translateX(0)";
    knob.parentElement.classList.remove("bg-theme-accent");
    if (countdownOverlay) countdownOverlay.style.display = "none";
  }
}

function updateRealtimeCountdown(serverMs) {
  // 1. 기본 방어 (차트 시리즈 없으면 삭제)
  if (!candleSeries || mainData.length === 0) {
    if (countdownPriceLine) {
      candleSeries.removePriceLine(countdownPriceLine);
      countdownPriceLine = null;
    }
    return;
  }

  // 2. 보간 엔진 가동 조건 (serverMs가 유효할 때만)
  if (serverMs && serverMs > 0) {
    if (serverMs !== lastServerMs) {
      lastServerMs = serverMs;
      localTimeAtUpdate = performance.now();
    }

    // 🚀 보간 계산
    const interpolatedMs = lastServerMs + (performance.now() - localTimeAtUpdate);

    // 🎯 마감 시간 체크 로직 추가
    const secondsPerBar = tfSec[currentTF] || 60;
    const lastCandleTime = mainData[mainData.length - 1].time; // Unix Sec
    const nextBarTimeMs = (lastCandleTime + secondsPerBar) * 1000; // MS 변환

    if (interpolatedMs >= nextBarTimeMs) {
      // 🚨 시간이 이미 지났다? 서버 신호 올 때까지 "Wait..."으로 강제 고정!
      displayTime = "00:00";
    } else {
      // 아직 시간 남았으면 정상 카운트다운
      displayTime = calculateTimeRemaining(currentTF, interpolatedMs);
    }
  }

  // 3. 봉 색상 및 상태 파악
  const lastCandle = mainData[mainData.length - 1];
  const isDown = lastCandle.close < lastCandle.open;
  const style = getComputedStyle(document.body);
  const varName = isDown ? '--down' : '--up';
  const rawColor = style.getPropertyValue(varName).trim() || (isDown ? '#ef5350' : '#26a69a');

  // 4. 차트 레이블 옵션 (보간된 displayTime 적용)
  const lineOptions = {
    price: lastCandle.close,
    color: 'transparent',
    lineWidth: 0,
    axisLabelVisible: true,
    title: showCountdown ? `${displayTime} ` : "", // 🚀 Wait... 또는 05:20
    axisLabelColor: rawColor,
    axisLabelTextColor: '#ffffff',
  };

  // 5. 생성 및 갱신
  if (!countdownPriceLine) {
    countdownPriceLine = candleSeries.createPriceLine(lineOptions);
  } else {
    countdownPriceLine.applyOptions(lineOptions);
  }
}

// 실시간 카운트다운 보간 
setInterval(() => {
  if (typeof updateRealtimeCountdown === "function" && lastServerMs > 0) {
    updateRealtimeCountdown(lastServerMs);
  }
}, 50);

// 🚀 [특수수사대] 정렬 순서 박제형 방향키 엔진
document.addEventListener("keydown", (e) => {
  if (document.activeElement.tagName === "INPUT") return;

  const up = e.key === "ArrowUp";
  const down = e.key === "ArrowDown";

  if (up || down) {
    e.preventDefault();

    // 1. [수정] 원본 데이터 말고, 현재 화면에 정렬되어 있는 "진짜 순서"를 가져옵니다.
    // renderTable() 할 때 사용하는 그 최종 배열이어야 합니다.
    const sortedList = currentTableData; // 이미 sortTable()에서 정렬된 상태의 배열
    if (!sortedList || sortedList.length === 0) return;

    // 2. 현재 정렬된 순서에서 나의 위치(인덱스) 찾기
    let currentIndex = sortedList.findIndex(item => item.Symbol === currentSelectedSymbol);

    // 3. [수정] 무한 루프 금지! 위아래 "제한" 걸기
    let nextIndex;
    if (up) {
      // 맨 위면 더 이상 안 올라감 (제한)
      nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
    } else {
      // 맨 아래면 더 이상 안 내려감 (제한)
      nextIndex = currentIndex >= sortedList.length - 1 ? sortedList.length - 1 : currentIndex + 1;
    }

    // 4. 인덱스가 변했을 때만 실행 (똑같은 자리면 리소스 아끼기)
    if (nextIndex === currentIndex) return;

    const nextCoin = sortedList[nextIndex];
    if (nextCoin) {
      // 5. 렌더링 리미트 보정 (정렬된 순서대로 보여주기 위해 필요)
      if (nextIndex >= currentRenderLimit) {
        currentRenderLimit = nextIndex + 1;
        renderTable();
      }

      // 6. 실행 및 하이라이트
      currentSelectedSymbol = nextCoin.Symbol;
      selectSymbol(nextCoin.Symbol); // 👈 여기서 이미 마켓 판별 로직 타니까 안전!

      // 7. 스크롤 추적 (즉시 반응을 위해 behavior: instant 추천)
      setTimeout(() => {
        const targetRow = document.querySelector(`#table-body tr[data-sym="${nextCoin.Symbol}"]`);
        if (targetRow) {
          targetRow.scrollIntoView({ block: "nearest", behavior: "instant" });
          applySelectedHighlight();
        }
      }, 0);
    }
  }
});