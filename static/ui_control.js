// ui_control.js
// --- 📱 UI/UX 컨트롤 로직 ---
import { store, CONFIG } from "./_store.js";
import { initChart, updateChartTheme } from "./chart.js";
import { fetchHistory } from "./chart_data.js";

function toggleTheme() {
  const body = document.body;
  const btn = document.getElementById("theme-toggle-btn");
  const isCurrentlyDark = body.classList.contains("theme-binance");
  const faviconLink = document.getElementById("favicon-link");
  const mainLogoImg = document.getElementById("main-logo-img");
  const staticPath = "../static/";

  if (isCurrentlyDark) {
    body.classList.remove("theme-binance");
    body.classList.add("theme-upbit");
    store.currentTheme = "upbit";
    if (btn) btn.innerHTML = "🌙";
    if (faviconLink) faviconLink.href = staticPath + "_gemini-svg-light.svg";
    if (mainLogoImg) mainLogoImg.src = staticPath + "_gemini-svg-light.svg";
  } else {
    body.classList.remove("theme-upbit");
    body.classList.add("theme-binance");
    store.currentTheme = "binance";
    if (btn) btn.innerHTML = "☀️";
    if (faviconLink) faviconLink.href = staticPath + "_gemini-svg-dark.svg";
    if (mainLogoImg) mainLogoImg.src = staticPath + "_gemini-svg-dark.svg";
  }

  // 🚀 차트 테마 업데이트 (0.3초 트랜지션과 박자를 맞추기 위해 즉시 호출)
  if (typeof updateChartTheme === "function") {
    updateChartTheme();
  }
}

// 데스크탑: 좌측 패널 접기/펴기
function toggleSidebar() {
  const leftPanel = document.getElementById("left-panel");
  const openBtn = document.getElementById("sidebar-open-btn");

  store.isSidebarOpen = !store.isSidebarOpen;

  if (store.isSidebarOpen) {
    // 사이드바 열기
    leftPanel.classList.remove("md:hidden");
    leftPanel.classList.add("md:flex");
    openBtn.classList.add("hidden");
  } else {
    // 사이드바 숨기기
    leftPanel.classList.remove("md:flex");
    leftPanel.classList.add("md:hidden");
    openBtn.classList.remove("hidden");
  }
}

// 모바일: 리스트/차트 화면 전환
function switchMobileView(view) {
  const leftPanel = document.getElementById("left-panel");
  const rightPanel = document.getElementById("right-panel");
  const btnList = document.getElementById("mob-btn-list");
  const btnChart = document.getElementById("mob-btn-chart");

  if (view === "list") {
    leftPanel.classList.remove("hidden");
    leftPanel.classList.add("flex");
    rightPanel.classList.remove("flex");
    rightPanel.classList.add("hidden");

    btnList.classList.replace("border-transparent", "border-theme-accent");
    btnList.classList.replace("opacity-50", "text-theme-accent");
    btnChart.classList.replace("border-theme-accent", "border-transparent");
    btnChart.classList.replace("text-theme-accent", "opacity-50");

    // 🚀 [추가] 모바일 리스트 모드일 때 높이 제한과 스크롤 주입
    leftPanel.classList.add("overflow-y-auto", "h-[calc(100vh-64px)]", "pb-20");
    leftPanel.style.height = "calc(100vh - 64px)";
  } else {
    leftPanel.classList.remove("flex");
    leftPanel.classList.add("hidden");
    rightPanel.classList.remove("hidden");
    rightPanel.classList.add("flex");

    btnChart.classList.replace("border-transparent", "border-theme-accent");
    btnChart.classList.replace("opacity-50", "text-theme-accent");
    btnList.classList.replace("border-theme-accent", "border-transparent");
    btnList.classList.replace("text-theme-accent", "opacity-50");
  }
}

function showMobileChart() {
  if (window.innerWidth >= SCREEN_WIDTH) return;

  const overlay = document.getElementById("mobile-chart-overlay");
  const panel = document.getElementById("mobile-chart-panel");
  const content = document.getElementById("mobile-chart-content");
  const rightPanel = document.getElementById("right-panel");

  if (!overlay || !panel || !content || !rightPanel) return;

  // 🚀 [이사] 원래 부모가 누구였는지 기억할 필요 없이 그냥 옮깁니다.
  if (content && rightPanel && !content.contains(rightPanel)) {
    content.appendChild(rightPanel);
  }

  // 🚀 [스타일] style 속성 대신 클래스로 제어하는 게 나중에 복구가 쉽습니다.
  rightPanel.classList.remove("hidden");
  rightPanel.classList.add("flex"); // 모바일 풀화면용

  overlay.classList.remove("hidden");

  // 4. 애니메이션 (패널 등장)
  setTimeout(() => {
    panel.style.transform = "translateY(0)";
    panel.style.opacity = "1"; // 🚀 이거 빠지면 안 보여요!

    if (store.chart) {
      store.chart.timeScale().fitContent(); // v5 autoSize:true 이므로 resize는 필요없음
    }
  }, 50);
}

function closeMobileChart() {
  const overlay = document.getElementById("mobile-chart-overlay");
  const panel = document.getElementById("mobile-chart-panel");
  const rightPanel = document.getElementById("right-panel");
  const mainContainer = document.querySelector(".max-w-\\[1600px\\]");

  if (!overlay || !rightPanel || !mainContainer) return;

  // 1. 유령 장벽 즉시 제거
  // panel.style.transform = "translateY(100%)";
  // overlay.classList.remove("active");
  // pointer-events: none 효과 발생

  // 1. 애니메이션/오버레이 숨기기
  overlay.classList.add("hidden");

  // 2. 🚀 [복구 핵심] 강제로 넣었던 style 속성들을 싹 지워야 합니다!
  rightPanel.style.display = "";
  rightPanel.style.height = "";
  rightPanel.style.width = "";

  // 3. 🚀 [원위치] 원래 데스크톱 레이아웃 클래스로 복구
  rightPanel.classList.add("hidden", "md:flex");

  // 4. 부모 컨테이너로 다시 이사
  if (!mainContainer.contains(rightPanel)) {
    mainContainer.appendChild(rightPanel);
  }
}

// ⭐️ 1. 탭 전환 기능 (차트 ↔ 시뮬레이터) ⭐️
function switchChartTab(mode) {
  const btnSim = document.getElementById("tab-btn-sim");
  if (mode === "chart" && btnSim.classList.contains("active")) {
    Swal.fire({
      title: "시뮬레이션 종료 🚨",
      text: "그려둔 가상 캔들이 모두 초기화되고 실제 차트로 돌아갑니다. 종료하시겠습니까?",
      icon: "warning",
      showCancelButton: true,
      background: "var(--panel)",
      color: "var(--text)",
      confirmButtonColor: "var(--down)",
      cancelButtonColor: "var(--border)",
      confirmButtonText: "네, 초기화할게요 🗑️",
      cancelButtonText: "아니요, 계속할게요",
    }).then((result) => {
      if (result.isConfirmed) executeTabSwitch(mode);
    });
  } else {
    executeTabSwitch(mode);
  }
}

// 2. 🚨 진짜 탭을 바꾸고 화면을 업데이트하는 알맹이 로직 (여기로 분리!)
function executeTabSwitch(mode) {
  const btnChart = document.getElementById("tab-btn-chart"),
    btnSim = document.getElementById("tab-btn-sim"),
    controls = document.getElementById("sim-controls");
  if (mode === "chart") {
    btnChart.classList.add("active");
    btnSim.classList.remove("active");
    controls.style.display = "none";
    if (typeof fetchHistory === "function") fetchHistory();
  } else {
    btnSim.classList.add("active");
    btnChart.classList.remove("active");
    controls.style.display = "flex";

    // 🚀 [수정] 바이낸스와 업비트 차트 소켓 둘 다 확실히 처단!
    [store.binanceChartWs, store.upbitChartWs].forEach((ws) => {
      if (ws) {
        ws.onmessage = null;
        ws.close();
      }
    });
    store.binanceChartWs = null;
    store.upbitChartWs = null;

    document.getElementById("status-dot").style.background = "gray";
    document.getElementById("status-text").innerText = "SIMULATION";
  }
}

// 🚀 전역 스코프 노출 (HTML 인라인 onclick 이벤트용)
window.toggleTheme = toggleTheme;
window.toggleSidebar = toggleSidebar;
window.switchMobileView = switchMobileView;
window.showMobileChart = showMobileChart;
window.closeMobileChart = closeMobileChart;
window.switchChartTab = switchChartTab;
window.executeTabSwitch = executeTabSwitch;

// ================== api.js에서 이동됨 ==================
// 검색창 비우기 (X 버튼용)
export function clearSearch() {
  const input = document.getElementById("symbol-input");
  input.value = "";
  input.focus();
  searchSymbols("");
}

// 검색 리스트 (티커 + 태그 유지 버전 + 원본 전체 장부 탐색 + 대소문자 완벽 대응)
export function searchSymbols(v) {
  const resDiv = document.getElementById("search-results");
  if (!resDiv) return;

  if (!v || v.trim() === "") {
    resDiv.style.display = "none";
    return;
  }

  // 🚀 [핵심] currentTableData로 잘려나간 심볼까지 모조리 찾기 위해 originalTableData 최우선 탐색!
  const query = v.toUpperCase();
  const sourceData = store.originalTableData || store.currentTableData || [];
  const filtered = sourceData
    .filter((r) => {
      const disp = (r.DisplayTicker || "").toUpperCase();
      const name = (r.Name || "").toUpperCase();
      const sym = (r.Symbol || "").toUpperCase();
      const raw = (r.Ticker || "").toUpperCase();
      return disp.includes(query) || name.includes(query) || sym.includes(query) || raw.includes(query);
    })
    .slice(0, 20);

  if (filtered.length === 0) {
    resDiv.style.display = "none";
    return;
  }

  resDiv.innerHTML = filtered
    .map((r) => {
      const s = r.DisplayTicker;
      const exchanges = r.Listed_Exchanges || [];
      const isUpbit = r.Upbit === "O" || exchanges.includes("UPBIT");
      const isBithumb = exchanges.includes("BITHUMB");
      const isBinanceSpot = exchanges.includes("BINANCE");
      const isBinanceFutures = exchanges.includes("BINANCE_FUTURES");
      const isBybitSpot = exchanges.includes("BYBIT");

      // 각 거래소 버튼들을 독립적으로 생성 (있으면 다 보여줌)
      let buttons = "";
      if (isUpbit) {
        buttons += `<button class="bg-[#093687] text-white text-[9px] px-2 py-1 rounded font-bold hover:brightness-125" onclick="event.stopPropagation(); selectSymbol('${s}', 'UPBIT')">UPBIT</button>`;
      }
      if (isBithumb) {
        buttons += `<button class="bg-[#ff8b00] text-white text-[9px] px-2 py-1 rounded font-bold hover:brightness-125" onclick="event.stopPropagation(); selectSymbol('${s}', 'BITHUMB')">BITHUMB</button>`;
      }
      if (isBinanceSpot) {
        buttons += `<button class="bg-[#333] text-white text-[9px] px-2 py-1 rounded font-bold border border-[#555] hover:bg-[#444]" onclick="event.stopPropagation(); selectSymbol('${s}', 'SPOT')">B-SPOT</button>`;
      }
      if (isBinanceFutures) {
        buttons += `<button class="bg-[#f0b90b] text-black text-[9px] px-2 py-1 rounded font-bold hover:brightness-110" onclick="event.stopPropagation(); selectSymbol('${s}', 'FUTURES')">B-FUT</button>`;
      }
      if (isBybitSpot) {
        buttons += `<button class="bg-[#1c1e23] text-[#f0b90b] text-[9px] px-2 py-1 rounded font-bold border border-[#f0b90b]/30 hover:bg-[#252930]" onclick="event.stopPropagation(); selectSymbol('${s}', 'BYBIT')">BYBIT</button>`;
      }

      return `
      <div class="flex items-center justify-between p-2 cursor-pointer border-b border-theme-border text-[13px] hover:bg-white/5" 
           onclick="selectSymbol('${s}')">
        <div class="flex items-center gap-2">
          ${r.Logo || ""}
          <div class="flex flex-col">
            <b class="w-auto text-theme-text font-bold">${s}</b>
            <span class="text-[10px] text-theme-text opacity-60">${r.Name || ""}</span>
          </div>
        </div>
        <div class="flex gap-1 flex-wrap justify-end max-w-[180px]">${buttons}</div>
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

  // 🚀 [수정] s가 DisplayTicker(BTC)일 수도, 고유 Ticker(BTCUSDT)일 수도 있으므로 둘 다 체크
  const rowInfo = store.currentTableData.find((c) => c.DisplayTicker === s || c.Ticker === s);

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
      } else if (rowInfo.Listed_Exchanges.includes("BYBIT")) {
        store.currentMarket = "BYBIT";
      }
    }
  }
  // 🚀 [수정] 헤더 및 타이틀 Precision(정밀도) 반영
  const p = rowInfo && rowInfo.precision !== undefined ? rowInfo.precision : 2;
  const headAssetName = document.getElementById("head-asset-name");
  
  if (rowInfo) {
    if (headAssetName) {
      headAssetName.innerText = `${rowInfo.Symbol} (${rowInfo.Name || ""})`;
    }
    // 타이틀에 실시간 가격 & 정밀도 반영
    const titlePrice = window.formatSmartPrice(rowInfo.Price_Raw || 0, p);
    document.title = `${titlePrice} | ${rowInfo.Symbol} - Sellnance`;

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

  // 🚀 [추가] 검색한 코인이 현재 테이블 렌더링 범위(50개) 밖에 있을 경우 대응
  const sortedList = store.currentTableData;
  const targetIdx = sortedList.findIndex((item) => item.DisplayTicker === s || item.Ticker === s);

  if (targetIdx !== -1) {
    // 1. 만약 현재 렌더링 한도보다 뒤에 있다면 한도를 늘리고 재렌더링
    if (targetIdx >= store.currentRenderLimit) {
      store.currentRenderLimit = targetIdx + 1;
      if (typeof renderTable === "function") renderTable();
    }

    // 2. 해당 행으로 스크롤 이동 및 하이라이트
    setTimeout(() => {
      store.currentSelectedSymbol = s; // 선택자 동기화
      const targetRow = document.querySelector(`#table-body tr[data-sym="${s}"]`);
      if (targetRow) {
        targetRow.scrollIntoView({ block: "center", behavior: "smooth" });
        if (typeof applySelectedHighlight === "function") applySelectedHighlight();
      }
    }, 100);
  }

  // 🚀 [핵심] 차트 데이터 즉시 로드
  if (typeof fetchHistory === "function") {
    fetchHistory(s);
  }
}

// 배지 UI 업데이트 헬퍼
export function updateExchangeBadges(s) {
  const rowInfo = store.currentTableData.find((c) => c.DisplayTicker === s || c.Ticker === s);
  let badges = "";
  if (rowInfo) {
    if (rowInfo.Listed_Exchanges?.includes("UPBIT") || rowInfo.Upbit === "O")
      badges += `<span class="bg-[#093687] text-white text-[10px] px-1.5 py-0.5 rounded">UPBIT</span>`;
    if (rowInfo.Listed_Exchanges?.includes("BINANCE_FUTURES"))
      badges += `<span class="bg-[#f0b90b] text-black text-[10px] px-1.5 py-0.5 rounded ml-1">B-FUT</span>`;
    if (rowInfo.Listed_Exchanges?.includes("BINANCE"))
      badges += `<span class="bg-[#444] text-white text-[10px] px-1.5 py-0.5 rounded ml-1">B-SPOT</span>`;
    if (rowInfo.Listed_Exchanges?.includes("BITHUMB"))
      badges += `<span class="bg-[#ff8b00] text-white text-[10px] px-1.5 py-0.5 rounded ml-1">BITHUMB</span>`;
  }

  const badgeContainer = document.getElementById("exchange-badges");
  if (badgeContainer) badgeContainer.innerHTML = badges;
}

// executeSetTF나 코인 클릭 함수(selectSymbol) 등 마켓이 바뀌는 모든 시점에 이 '세척기'를 돌려야 합니다.
// ================== chart.js에서 이동됨 ==================
export function setTF(tf) {
  const btnSim = document.getElementById("tab-btn-sim");
  const isSimMode = btnSim ? btnSim.classList.contains("active") : false;

  if (isSimMode) {
    window.Swal.fire({
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

export function executeSetTF(tf) {
  store.currentTF = tf;
  document.querySelectorAll(".tf-btn").forEach((b) => {
    const onClickAttr = b.getAttribute("onclick") || "";
    const isMatch = onClickAttr.includes(`'${tf}'`);

    b.classList.toggle("active", isMatch);
    b.classList.toggle("opacity-100", isMatch);
    b.classList.toggle("opacity-50", !isMatch);
  });

  if (typeof window.renderTimeframeButtons === "function") {
    window.renderTimeframeButtons(tf);
  }

  // 4. 차트 데이터 갱신 함수 호출 (타임프레임 변경임을 명시: true)
  if (typeof fetchHistory === "function")
    fetchHistory(store.currentAsset, true);
}

export function toggleLogScale() {
  store.isLogMode = !store.isLogMode;
  const btn = document.getElementById("log-btn");
  if (btn) {
    btn.innerText = store.isLogMode ? "Log ON" : "Log Off";
    btn.classList.toggle("active", store.isLogMode);
  }
  if (store.chart) {
    store.chart
      .priceScale("right")
      .applyOptions({ mode: store.isLogMode ? 1 : 0 });
  }
}

window.setTF = setTF;
window.executeSetTF = executeSetTF;
window.toggleLogScale = toggleLogScale;
