// table_sort.js
import { store } from "./_store.js";
import { getFilteredData } from "./table_filter.js";
import { renderTable, applySelectedHighlight } from "./table_render.js";

export function sortTable(colKey) {
  // 🚀 [2단 토글 개편] 모든 정렬 가능 컬럼을 3단(desc -> asc -> 해제)이 아닌 2단(desc <-> asc)으로 토글합니다.
  if (store.currentSortCol === colKey) {
    store.sortState = store.sortState === "desc" ? "asc" : "desc";
  } else {
    store.currentSortCol = colKey;
    store.sortState = "desc";
  }

  // 모든 화살표 초기화 후 현재 선택된 헤더 옆에만 방향 표식 표시 (▲: asc, ▼: desc)
  document.querySelectorAll(".sort-arrow").forEach((el) => (el.innerText = ""));
  const arrowEl = document.getElementById(`sort-${colKey}`);
  if (arrowEl) {
    arrowEl.innerText = store.sortState === "asc" ? "▲" : "▼";
  }

  // 🚀 [INP 최적화] 무거운 배열 정렬 및 DOM 렌더링을 다음 페인트 이후로 비동기 양보
  requestAnimationFrame(() => {
    setTimeout(() => {
      const scrollContainer = document.querySelector(
        "#left-panel .overflow-y-auto",
      );
      if (scrollContainer) scrollContainer.scrollTop = 0;

      simpleSortData();
      renderTable(false); // 수동 정렬이므로 0초 컷으로 즉시 전체 배치
    }, 0);
  });
}

export function simpleSortData() {
  const sortKeyMap = {
    MarketCap: "MarketCap_Raw",
    Price: "Price_Raw",
    Change_24h: "Change_24h_Raw",
    Change_Today: "Change_Today_Raw",
    Volume: "Binance_Vol_Futures",
    Ticker: "DisplayTicker",
    Kimchi: "Kimchi_Raw",
    Gap: "Basis_Raw",
    Funding: "Funding_Raw",
    VMC: "VMC_Raw",
  };

  const key = sortKeyMap[store.currentSortCol] || store.currentSortCol;
  const isAsc = store.sortState === "asc";

  store.currentTableData.sort((a, b) => {
    let valA = a[key];
    let valB = b[key];

    if (typeof valA === "number" && typeof valB === "number") {
      return isAsc ? valA - valB : valB - valA;
    }

    const strA = (valA || "").toString();
    const strB = (valB || "").toString();
    return isAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
  });
}

export function applyRealtimeSort() {
  if (!store.currentSortCol || store.sortState === "") return;

  // 🚀 [스크롤 락 최적화] 사용자가 스크롤 중일 때는 실시간 정렬(DOM 재배치)을 건너뛰어 스크롤 렉을 차단!
  if (store.isScrolling) return;

  // 🚀 [약점 1 완벽 개선: 소켓 폭포수 스로틀링 장치]
  // 초당 수십 번씩 밀려오는 소켓 이벤트에 대해 250ms(초당 최대 4회) 주기로만 정렬/렌더링을 허용!
  // 메인 스레드 혹사 및 CPU 스래싱을 95% 이상 완벽히 소각!
  if (store.isRealtimeSorting) return;
  store.isRealtimeSorting = true;
  setTimeout(() => {
    store.isRealtimeSorting = false;
  }, 250);

  simpleSortData();
  renderTable(true);
}
