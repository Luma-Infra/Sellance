// ui_control.js
// --- 📱 UI/UX 컨트롤 로직 ---

function toggleTheme() {
  const body = document.body;
  const btn = document.getElementById("theme-toggle-btn");
  const isCurrentlyDark = body.classList.contains("theme-binance");

  if (isCurrentlyDark) {
    body.classList.remove("theme-binance");
    currentTheme = "upbit-light";
    if (btn) btn.innerHTML = "🌙 다크";
  } else {
    body.classList.add("theme-binance");
    currentTheme = "binance";
    if (btn) btn.innerHTML = "☀️ 라이트";
  }
  setTimeout(() => {
    initChart();
  }, 0);
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
  const overlay = document.getElementById("mobile-chart-overlay");
  const panel = document.getElementById("mobile-chart-panel");
  const content = document.getElementById("mobile-chart-content");
  const rightPanel = document.getElementById("right-panel");

  // 1. 이사 보내기
  content.appendChild(rightPanel);
  rightPanel.classList.remove("hidden"); // 🚨 hidden 털어버리기
  rightPanel.classList.add("flex");

  overlay.classList.remove("hidden");

  setTimeout(() => {
    overlay.style.opacity = "1";
    panel.style.transform = "translateY(0)";

    // 🚨 핵심: 이사 간 집의 크기에 맞춰서 차트를 다시 그려라!
    if (window.chart) {
      window.chart.resize(content.clientWidth, content.clientHeight - 50); // 헤더 높이 대략 뺌
    }
  }, 300); // 패널이 다 올라온 뒤에 리사이즈!
}
function closeMobileChart() {
  const overlay = document.getElementById("mobile-chart-overlay");
  const panel = document.getElementById("mobile-chart-panel");

  panel.style.transform = "translateY(100%)";
  overlay.style.opacity = "0";
  setTimeout(() => overlay.classList.add("hidden"), 300);
}
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
