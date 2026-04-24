// ui_control.js
// --- 📱 UI/UX 컨트롤 로직 ---

function toggleTheme() {
  const body = document.body;
  const btn = document.getElementById("theme-toggle-btn");
  const isCurrentlyDark = body.classList.contains("theme-binance");

  // 다크 라이트 모드
  if (isCurrentlyDark) {
    body.classList.remove("theme-binance");
    body.classList.add("theme-upbit");

    currentTheme = "upbit";

    if (btn) btn.innerHTML = "🌙";
  } else {
    body.classList.remove("theme-upbit");
    body.classList.add("theme-binance");

    currentTheme = "binance";
    if (btn) btn.innerHTML = "☀️";
  }
  setTimeout(() => {
    initChart();
    if (typeof updateRealtimeCountdown === 'function') {
      updateRealtimeCountdown(Date.now());
    }
  }, 50);
}

// 데스크탑: 좌측 패널 접기/펴기
function toggleSidebar() {
  const leftPanel = document.getElementById("left-panel");
  const openBtn = document.getElementById("sidebar-open-btn");

  isSidebarOpen = !isSidebarOpen;

  if (isSidebarOpen) {
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

  // UI 변경 후 차트 크기 강제 재계산
  setTimeout(() => {
    if (window.chartResizeObserver && chart) {
      const container = document.getElementById("chart-container");
      chart.resize(container.clientWidth, container.clientHeight);
    }
  }, 50);
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
    leftPanel.style.height = 'calc(100vh - 64px)';
  } else {
    leftPanel.classList.remove("flex");
    leftPanel.classList.add("hidden");
    rightPanel.classList.remove("hidden");
    rightPanel.classList.add("flex");

    btnChart.classList.replace("border-transparent", "border-theme-accent");
    btnChart.classList.replace("opacity-50", "text-theme-accent");
    btnList.classList.replace("border-theme-accent", "border-transparent");
    btnList.classList.replace("text-theme-accent", "opacity-50");

    // 차트 화면 렌더링 최적화
    setTimeout(() => {
      const container = document.getElementById("chart-container");
      if (chart && container.clientWidth > 0) {
        chart.resize(container.clientWidth, container.clientHeight);
      }
    }, 50);
  }
}

function showMobileChart() {
  if (window.innerWidth >= SCREEN_WIDTH) return;

  const overlay = document.getElementById("mobile-chart-overlay");
  const panel = document.getElementById("mobile-chart-panel");
  const content = document.getElementById("mobile-chart-content");
  const rightPanel = document.getElementById("right-panel");

  if (!overlay || !panel || !content || !rightPanel) return;

  // 1. 이사 로직 (중복 방지)
  if (!content.contains(rightPanel)) {
    content.appendChild(rightPanel);
  }

  // 2. 스타일 강제 초기화
  rightPanel.style.setProperty('display', 'flex', 'important');
  rightPanel.style.height = "100%";
  rightPanel.style.width = "100%";
  rightPanel.classList.remove("hidden", "md:flex");

  // 3. 배경 소환
  overlay.classList.remove("hidden");
  overlay.classList.add("active");
  overlay.style.opacity = "1";
  overlay.style.pointerEvents = "auto";

  // 4. 애니메이션 (패널 등장)
  setTimeout(() => {
    panel.style.transform = "translateY(0)";
    panel.style.opacity = "1"; // 🚀 이거 빠지면 안 보여요!

    if (window.chart) {
      const newWidth = content.clientWidth;
      const newHeight = content.clientHeight - 60; // 헤더 빼고
      window.chart.resize(newWidth, newHeight);
      window.chart.timeScale().fitContent();

      const container = document.getElementById("chart-container");
      if (container) container.focus();
    }
  }, 50);
}

function closeMobileChart() {
  const overlay = document.getElementById("mobile-chart-overlay");
  const panel = document.getElementById("mobile-chart-panel");
  const rightPanel = document.getElementById("right-panel");
  const mainContainer = document.querySelector(".max-w-\\[1600px\\]");

  if (!overlay || !panel) return;

  // 1. 유령 장벽 즉시 제거
  panel.style.transform = "translateY(100%)";
  overlay.classList.remove("active"); // pointer-events: none 효과 발생

  setTimeout(() => {
    overlay.classList.add("hidden");
    // 2. 원래 자리로 복구
    if (rightPanel && mainContainer) {
      mainContainer.appendChild(rightPanel);
    }
  }, 50);
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
    if (currentWs) {
      currentWs.close();
      currentWs = null;
      document.getElementById("status-dot").style.background = "gray";
      document.getElementById("status-text").innerText = "SIMULATION MODE";
    }
  }
  if (window.chart) {
    setTimeout(() => {
      const container = document.getElementById("chart-container");
      if (container.clientWidth > 0 && container.clientHeight > 0)
        window.chart.resize(container.clientWidth, container.clientHeight);
    }, 50);
  }
}

