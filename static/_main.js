// _main.js
import { store, CONFIG, tfSec, measureDOM } from "./_store.js";
import { loadSymbols } from "./chart_api.js";
import { searchSymbols, clearSearch, selectSymbol, updateExchangeBadges } from "./ui_control.js";
import { fetchHistory, clearChartData } from "./chart_data.js";
import { initChart } from "./chart.js";
import { initMeasureEvents } from "./chart_measure.js";
import "./chart_utils.js";
import "./chart_layout.js";
import "./sim_engine.js";
import "./stream.js";
import "./streamEach.js";
import "./table.js";
import "./start.js";

window.store = store;

// 🚀 Vite 모듈 환경에서 인라인 이벤트 처리용 함수 노출
window.searchSymbols = searchSymbols;
window.clearSearch = clearSearch;
window.selectSymbol = selectSymbol;

// 🚀 [역할 분리] 스트림 엔진(stream.js)의 렌더링 과부하를 막기 위해, 차트 상단 헤더 전광판 조작 전담 함수를 메인 UI 컨트롤러 영역에 선언합니다!
window.updateHeaderDisplay = (row, newPrice, p) => {
  const headPriceEl = document.getElementById("head-price");
  const headPriceSub = document.getElementById("head-price-sub");
  const headChg24h = document.getElementById("head-chg-24h");
  const headChgDay = document.getElementById("head-chg-day");
  const headMcap = document.getElementById("head-mcap");
  const headVolB = document.getElementById("head-vol-binance");
  const headVolU = document.getElementById("head-vol-upbit");

  if (headPriceEl) {
    const rate = store.marketDataMap?.krw_usd_rate || 0;
    const hasBinance = row.Listed_Exchanges?.some(e => e.includes("BINANCE") || e.includes("BYBIT")) || (row.Price_Raw > 0);
    const hasUpbit = row.Listed_Exchanges?.includes("UPBIT") || row.Listed_Exchanges?.includes("BITHUMB") || row.Upbit === "O" || (row.Price_KRW > 0);

    let usdP = row.Price_Raw ?? 0;
    let krwP = row.Price_KRW ?? 0;
    if (!hasBinance && hasUpbit) usdP = krwP / rate;
    else if (hasBinance && !hasUpbit) krwP = usdP * rate;

    if (newPrice !== undefined) {
      if (store.currentMarket === "UPBIT" || store.currentMarket === "BITHUMB") {
        krwP = newPrice;
        if (!hasBinance) usdP = krwP / rate;
      } else {
        usdP = newPrice;
        if (!hasUpbit) krwP = usdP * rate;
      }
    }

    headPriceEl.innerText = `${window.formatSmartPrice(usdP, p)}`;
    if (headPriceSub) headPriceSub.innerText = `${Number(krwP).toLocaleString()} ₩`;
  }
  if (headChg24h) {
    const n24 = row.Change_24h_Raw ?? 0;
    const c24 = n24 > 0 ? "text-theme-up" : n24 < 0 ? "text-theme-down" : "text-theme-text";
    headChg24h.className = `text-[13px] md:text-[15px] font-mono mt-0.5 ${c24}`;
    headChg24h.innerText = `${n24 > 0 ? "+" : ""}${Number(n24).toFixed(2)}%`;
  }
  if (headChgDay) {
    const nDay = row.Change_Today_Raw ?? 0;
    const cDay = nDay > 0 ? "text-theme-up" : nDay < 0 ? "text-theme-down" : "text-theme-text";
    headChgDay.className = `text-[13px] md:text-[15px] font-mono mt-0.5 ${cDay}`;
    headChgDay.innerText = `${nDay > 0 ? "+" : ""}${Number(nDay).toFixed(2)}%`;
  }
  if (headMcap) headMcap.innerText = row.MarketCap_Formatted || "-";
  if (headVolB) headVolB.innerText = row.Volume_Formatted || "-";
  if (headVolU) headVolU.innerText = row.Upbit_Vol_Formatted || "-";
};

// 🚀 엔진 시동 파트
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🏁 대시보드 엔진 가동 시작...");

  try {
    // 1️⃣ [데이터 로드] 마켓 구성 정보 + 실제 테이블 장부를 '순서대로' 가져온다
    await loadSymbols(); // 코인 맵핑 정보 로드
    console.log("✅ 1-A. 마켓 맵 로드 완료");

    if (typeof loadTableData === "function") {
      // 🚨 핵심: 실시간 시세가 기록될 '진짜 장부'가 채워질 때까지 기다립니다.
      await loadTableData();
      console.log("✅ 1-B. 실시간 시세 장부(currentTableData) 입고 완료");
    }

    // 2️⃣ [엔진 준비] 이제 장부가 확실히 있으니 차트를 그린다
    if (store.currentTableData && store.currentTableData.length > 0) {
      initMeasureEvents();
      initInfiniteScroll();
      // 🚀 [추가] 사령관님 요청: 서버 시작 시 테이블 코인들의 실시간 등락 움직임(Market Radar)은 즉시 점화!!!
      if (typeof window.startBinanceMarketRadar === "function") window.startBinanceMarketRadar();
      if (typeof window.startUpbitMarketRadar === "function") window.startUpbitMarketRadar();

      console.log("✅ 2. 테이블 실시간 시세 점화 완료! (차트 및 스나이퍼 소켓은 사용자 최초 선택 시 점화 대기 중...)");
    } else {
      // 🚀 [수정] 성급하게 에러 던지지 말고 재시도 유도
      console.warn("⚠️ 장부가 아직 비어있습니다. 수집 완료를 기다리는 중...");
      const loadingText = document.querySelector("#loading-modal h2");
      if (loadingText) loadingText.innerText = "데이터 수집 완료 대기 중 (5초 후 재시도)...";

      setTimeout(() => {
        console.log("🔄 데이터 수집 완료 재확인 시도...");
        location.reload();
      }, 5000);
      return;
    }

    // 4️⃣ [UI 이벤트] 슬라이더 및 버튼 반응 설정
    setupSliderEvents();
    setupButtonEvents();

    // 🚀 [추가] 초기 필터 UI 상태 동기화 (3단 토글 슬라이더 위치 등)
    if (typeof switchFilter === "function") {
      switchFilter(store.filterMode);
    }
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
          if (store.curDir === "bull") store.bullBody = val;
          else store.bearBody = val;
        }
        if (typeof window.updateStatus === "function") window.updateStatus();
        if (store.isHover && typeof window.updatePreview === "function")
          window.updatePreview();
      };
    }
  });
}

// 💡 버튼 호버 로직
function setupButtonEvents() {
  const genBtn = document.getElementById("btn-generate");
  if (genBtn) {
    genBtn.onmouseenter = () => {
      store.isHover = true;
      if (typeof window.updatePreview === "function") window.updatePreview();
    };
    genBtn.onmouseleave = () => {
      store.isHover = false;
      if (store.previewSeries) store.previewSeries.setData([]);
    };
  }

  // 🚀 flip-toggle (경주마 애니메이션) UI 바인딩
  const flipToggle = document.getElementById("flip-toggle");
  if (flipToggle) {
    store.useFlip = flipToggle.checked;
    flipToggle.addEventListener("change", (e) => {
      store.useFlip = e.target.checked;
      console.log("Flip animation status changed:", store.useFlip);
    });
  }
}

// ⚙️ 시간 변환 통합 헬퍼 (전역으로 이동!)
// 이제 initChart와 startRealtimeCandle 양쪽에서 모두 사용 가능합니다.

// 🚀 검색창 바깥 클릭 시 닫기
document.addEventListener("click", (e) => {
  const searchResults = document.getElementById("search-results");
  const symbolInput = document.getElementById("symbol-input");

  // 입력창이나 결과창 내부를 클릭한 게 아니라면 숨김 처리
  if (
    searchResults &&
    symbolInput &&
    !symbolInput.contains(e.target) &&
    !searchResults.contains(e.target)
  ) {
    searchResults.style.display = "none";
  }
});

// 🚀 탭 활성화 감지 (Sleep -> Wake Up 스턴 방어)
let tabHiddenTime = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    tabHiddenTime = Date.now();
    store.isTabHidden = true;
  } else if (document.visibilityState === "visible") {
    console.log("☀️ 탭 활성화: 절전 모드 해제 및 데이터 클렌징");
    store.isTabHidden = false;

    // 1. 잠든 사이 폭주해서 쌓인 찌꺼기 버퍼 즉시 소각
    for (let key in store.tickerBuffer) delete store.tickerBuffer[key];

    // 2. 🚀 다른 탭에 30초 이상 자리를 비웠을 때, 죽어있는 반쪽짜리 소켓들을 전부 강제 종료하고 새 소켓으로 깔끔하게 재점화!
    if (tabHiddenTime > 0 && Date.now() - tabHiddenTime > 30000) {
      console.log("🔄 장시간 부재 감지: 모든 소켓 연결을 초기화하고 차트를 재동기화합니다.");

      // 기존 소켓들 확실하게 처단 (비동기 락 해제)
      store.isFetchingChart = false;
      window.isFetchingChart = false;

      [store.binanceChartWs, store.upbitChartWs, store.sniperWs, store.binanceRadarWs, store.upbitRadarWs].forEach((ws) => {
        if (ws) {
          ws.onmessage = null;
          ws.onclose = null;
          ws.close();
        }
      });
      store.binanceChartWs = null;
      store.upbitChartWs = null;
      store.sniperWs = null;
      store.binanceRadarWs = null;
      store.upbitRadarWs = null;

      // 소켓 재점화
      if (typeof initSniperSocket === "function") initSniperSocket();
      if (typeof startBinanceMarketRadar === "function") startBinanceMarketRadar();
      if (typeof startUpbitMarketRadar === "function") startUpbitMarketRadar();

      if (store.currentAsset && typeof fetchHistory === "function") {
        fetchHistory(store.currentAsset, false, true); // 🚀 isTabRestore = true로 전달하여 줌 원복 방어!
      }
    }
    tabHiddenTime = 0;
  }
});

// 🚀 정렬 순서 퀵 서칭 탐색 및 타임프레임 변경 엔진 (방향키 이벤트)
document.addEventListener("keydown", (e) => {
  if (document.activeElement.tagName === "INPUT") return;

  const up = e.key === "ArrowUp";
  const down = e.key === "ArrowDown";
  const left = e.key === "ArrowLeft";
  const right = e.key === "ArrowRight";

  // 💡 1. 좌우 방향키: 타임프레임(TF) 퀵 스위칭
  if (left || right) {
    e.preventDefault();
    const tfArray = [
      "1m",
      "3m",
      "5m",
      "15m",
      "30m",
      "1h",
      "2h",
      "4h",
      "12h",
      "1d",
      "3d",
      "1w",
      "1M",
    ];
    let idx = tfArray.indexOf(store.currentTF);
    if (left && idx > 0 && typeof window.setTF === "function")
      window.setTF(tfArray[idx - 1]);
    else if (
      right &&
      idx < tfArray.length - 1 &&
      typeof window.setTF === "function"
    )
      window.setTF(tfArray[idx + 1]);
    return;
  }

  // 💡 2. 상하 방향키: 테이블 리스트 탐색 (기존 코드)
  if (up || down) {
    e.preventDefault();
    const sortedList = store.currentTableData;
    if (!sortedList || sortedList.length === 0) return;

    let currentIndex = sortedList.findIndex(
      (item) => item.DisplayTicker === store.currentSelectedSymbol,
    );
    let nextIndex;

    if (up) nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
    else
      nextIndex =
        currentIndex >= sortedList.length - 1
          ? sortedList.length - 1
          : currentIndex + 1;

    if (nextIndex === currentIndex) return;

    const nextCoin = sortedList[nextIndex];
    if (nextCoin) {
      if (nextIndex >= store.currentRenderLimit) {
        store.currentRenderLimit = nextIndex + 1;
        renderTable();
      }
      store.currentSelectedSymbol = nextCoin.DisplayTicker;
      selectSymbol(nextCoin.DisplayTicker);

      setTimeout(() => {
        const targetRow = document.querySelector(
          `#table-body tr[data-sym="${nextCoin.DisplayTicker}"]`,
        );
        if (targetRow) {
          targetRow.scrollIntoView({ block: "nearest", behavior: "instant" });
          applySelectedHighlight();
        }
      }, 0);
    }
  }
});
