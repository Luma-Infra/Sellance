// _main.js
import { store, CONFIG, tfSec, measureDOM } from "./store.js";
import {
  loadSymbols,
  searchSymbols,
  clearSearch,
  selectSymbol,
  fetchHistory,
  clearChartData,
  updateExchangeBadges,
} from "./api.js";
import "./chart_utils.js";
import { initChart, initMeasureEvents } from "./chart.js";
import "./sim_engine.js";
import "./ui_control.js";
import "./stream.js";
import "./streamEach.js";
import "./table.js";
import "./start.js";
// import './app_loader.js';

window.store = store;

// 🚀 Vite 모듈 환경에서 인라인 이벤트 처리용 함수 노출
window.searchSymbols = searchSymbols;
window.clearSearch = clearSearch;
window.selectSymbol = selectSymbol;

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
      initChart();
      initMeasureEvents();
      initInfiniteScroll();
      console.log("✅ 2. 차트 및 인터페이스 준비 완료");

      // 3️⃣ [소켓 점화] 모든 준비가 끝났을 때 비로소 소켓을 연결!
      // (장부가 꽉 차 있어서 켜지자마자 바로 구독 성공함)
      initSniperSocket();
      if (typeof startBinanceMarketRadar === "function")
        startBinanceMarketRadar();
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
}

// ⚙️ 시간 변환 통합 헬퍼 (전역으로 이동!)
// 이제 initChart와 startRealtimeCandle 양쪽에서 모두 사용 가능합니다.
const getUnixSeconds = (t) => {
  if (typeof t === "object" && t !== null)
    return new Date(t.year, t.month - 1, t.day).getTime() / 1000;
  if (typeof t === "string") return new Date(t).getTime() / 1000;
  return t;
};

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
    // 탭을 벗어난 정확한 시간을 기록
    tabHiddenTime = Date.now();
  } else if (document.visibilityState === "visible") {
    console.log("☀️ 탭 활성화: 절전 모드 해제 및 데이터 클렌징");

    // 1. 잠든 사이 폭주해서 쌓인 찌꺼기 버퍼 즉시 소각
    for (let key in store.tickerBuffer) delete store.tickerBuffer[key];

    // 2. 다른 탭에 10초 이상 자리를 비웠을 때만 차트를 아예 새로고침 (유령 캔들, 끊김 방지)
    if (
      tabHiddenTime > 0 &&
      Date.now() - tabHiddenTime > 30000 &&
      store.currentAsset
    ) {
      console.log("🔄 장시간 부재 감지: 차트를 재동기화합니다.");
      if (typeof fetchHistory === "function") fetchHistory(store.currentAsset);
    }
    // 복귀했으므로 타이머 초기화
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
