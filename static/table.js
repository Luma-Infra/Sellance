// table.js
import { store, CONFIG } from "./_store.js";
import { formatSmartPrice, formatVolumeKRW } from "./chart_utils.js"; // 🚀 기존 유틸리티 적극 재사용

// 1. 데이터 로드 함수
async function loadTableData(force = false) {
  const modal = document.getElementById("loading-modal");
  const updateTimeSpan = document.getElementById("update-time");

  modal.classList.remove("hidden");
  updateTimeSpan.innerText = "업데이트 중...";

  try {
    console.log("1. 파이썬 서버에 테이블 데이터 요청 시작!"); // ⭐️ 추가
    const res = await fetch(`/api/market-data?force=${force}`);
    console.log("2. 파이썬 서버가 응답 완료!"); // ⭐️ 추가
    const result = await res.json();
    updateTimeSpan.innerText = `마지막 업데이트: ${result.last_updated}`;

    store.originalTableData = JSON.parse(JSON.stringify(result.data)); // 🛡️ 철벽 방어 원본
    store.currentTableData = JSON.parse(JSON.stringify(result.data)); // 🏃 실시간 작업용

    store.currentTableData.forEach((row) => {
      row.DisplayTicker = (row.DisplayTicker || row.Symbol)
        .toString()
        .toUpperCase();
      // 💡 여기서 정밀도(p) 맵핑 데이터도 같이 만들면 find 지옥 탈출 가능!
    });

    if (store.currentSortCol && store.sortState !== "") {
      // 1. 순위 재계산 (경주마 로직 실행)
      applyRealtimeSort();
    } else {
      // 2. 정렬 상태가 아니면 그냥 평소대로 그리기
      renderTable();
    }
  } catch (error) {
    console.error("데이터 로드 에러:", error);
    alert("서버에서 데이터를 가져오지 못했습니다.");
    updateTimeSpan.innerText = "업데이트 실패";
  } finally {
    modal.classList.add("hidden");
  }
}

// 2. ⭐️ 3단계 정렬 핵심 로직 ⭐️ (리셋 & 상단 이동 추가)
function sortTable(colKey) {
  store.currentRenderLimit = 50;

  // 🚀 [추가] 2단 정렬 타겟인지 확인
  const isTwoStep = colKey.includes("Change") || colKey === "Volume";

  // 1. 클릭할 때마다 2 ~ 3단계 사이클 돌리기
  if (store.currentSortCol === colKey) {
    if (isTwoStep) {
      // 2단: 내림차순 <-> 오름차순 무한 반복 (빈 문자열 스킵)
      store.sortState = store.sortState === "desc" ? "asc" : "desc";
    } else {
      // 3단: 내림차순 -> 오름차순 -> 초기화
      store.sortState =
        store.sortState === ""
          ? "desc"
          : store.sortState === "desc"
            ? "asc"
            : "";
    }
  } else {
    store.currentSortCol = colKey;
    store.sortState = "desc";
  }

  // 🚀 [추가] 스크롤을 최상단으로 강제 소환!
  const scrollContainer = document.querySelector(
    "#left-panel .overflow-y-auto",
  );
  if (scrollContainer) scrollContainer.scrollTop = 0;

  // 2. 화살표 UI 업데이트
  document.querySelectorAll(".sort-arrow").forEach((el) => (el.innerText = ""));
  const arrowEl = document.getElementById(`sort-${colKey}`);

  // 3. 정렬 실행
  if (store.sortState === "") {
    // [3타 - 제자리 복구]
    store.currentTableData = [...store.originalTableData];
    if (arrowEl) arrowEl.innerText = "";
    renderTable(); // renderTable 내부에서도 currentRenderLimit(50)을 쓰니까 완벽!
  } else {
    // [1타, 2타 - 실시간 정렬]
    if (arrowEl) arrowEl.innerText = store.sortState === "asc" ? "▲" : "▼";

    // 정렬은 순식간에 해버리기
    simpleSortData();
    renderTable();
  }
}

//  [추가] 표 그리기 행(TR) 생성 헬퍼 (초기 렌더링 & 신규 진입 시 사용)
function createRowElement(row) {
  const tr = document.createElement("tr");
  const ticker = row.Ticker; // 🚀 중복 없는 유니크 티커 사용 (BTCKRW != BTCUSDT)
  tr.dataset.sym = ticker; 

  // 껍데기 만들고 알맹이 채우는 함수 재활용
  updateRowInnerHTML(tr, row);

  // 새로 만든 행을 CCTV에 즉시 등록
  if (store.tableObserver) store.tableObserver.observe(tr);
  return tr;
}

// 🚀 [수정됨] 표 그리기 함수 (딱 100개만 렌더링하도록 변경)

// 🚀 [추가] 공통 필터 로직 (renderTable와 applyRealtimeSort에서 공유)
function getFilteredData() {
  let filteredData = [...store.currentTableData];

  // 1. 탭 필터링 (ALL, FAV)
  if (store.currentTab === "FAV") {
    const favorites = JSON.parse(localStorage.getItem("sellnance_favs") || "[]");
    filteredData = filteredData.filter((d) =>
      favorites.includes(d.DisplayTicker || d.Symbol),
    );
  }

  // 2. 마켓 필터링 (ALL / BINANCE / UPBIT)
  if (store.filterMode === "UPBIT") {
    filteredData = filteredData.filter((d) => 
      d.Listed_Exchanges?.includes("UPBIT") || d.Listed_Exchanges?.includes("BITHUMB")
    );
  } else if (store.filterMode === "BINANCE") {
    filteredData = filteredData.filter((d) =>
      d.Listed_Exchanges?.some((ex) => ex.startsWith("BINANCE"))
    );
  }

  // 3. 시총 필터링 (1M 미만 숨기기 토글)
  if (store.hideSmallCap) {
    filteredData = filteredData.filter((d) => (d.MarketCap_Raw || 0) >= 1000000);
  }

  // 4. 바운더리 필터링
  const boundary = store.settings?.SORT_BOUNDARY;
  if (boundary) {
    filteredData = filteredData.filter((d) => {
      const c24 = Math.abs(d.Change_24h_Raw || 0);
      return c24 <= boundary;
    });
  }

  return filteredData;
}

// 🚀 [수정됨] 표 그리기 함수 (딱 100개만 렌더링하도록 변경)
function renderTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  // ⭐️ [해결] 렌더링 시작 전 가시성 정보 초기화
  store.visibleSymbols.clear();

  // ⭐️ 기존 감시 카메라 끄고 초기화
  if (store.tableObserver) {
    store.tableObserver.disconnect();
    store.tableObserver = null;
  }

  // ⭐️ 새 감시 카메라 설치
  store.tableObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const sym = entry.target.dataset.sym; // 🚀 Ticker (BTCUSDT 등)
        if (entry.isIntersecting) store.visibleSymbols.add(sym);
        else store.visibleSymbols.delete(sym);
      });
    },
    {
      root: document.querySelector(".table-container"),
      rootMargin: "50px 0px", // 조금 더 좁게 설정하여 정밀도 향상
    },
  );

  const filteredData = getFilteredData();
  const topData = filteredData.slice(0, store.currentRenderLimit);
  topData.forEach((row) => {
    tbody.appendChild(createRowElement(row));
  });
  applySelectedHighlight();

  // 🚀 [핵심] 테이블이 새로 그려졌으므로, 즉시 가시성 계산
  updateVisibleSymbols();

  if (typeof window.refreshSniperTarget === "function") {
    setTimeout(() => {
        window.refreshSniperTarget();
    }, 10);
  }
}

// 🎯 [신규] 현재 화면에 진짜로 뭐가 보이는지 즉시 계산하는 정밀 함수
function updateVisibleSymbols() {
  const container = document.querySelector(".table-container");
  if (!container) return;

  const rows = container.querySelectorAll("tr[data-sym]");
  const containerRect = container.getBoundingClientRect();

  rows.forEach((row) => {
    const rect = row.getBoundingClientRect();
    const isVisible = (
      rect.top < containerRect.bottom &&
      rect.bottom > containerRect.top
    );
    const sym = row.dataset.sym;
    if (isVisible) {
      store.visibleSymbols.add(sym);
    } else {
      store.visibleSymbols.delete(sym);
    }
  });
}

//  애니메이션 없이 정렬만 하는 깔끔한 함수
function simpleSortData() {
  // 🚀 [핵심] 백엔드(api_manager.py)에서 보내주는 필드명과 1:1로 맞춥니다!
  const sortKeyMap = {
    MarketCap: "MarketCap_Raw",
    Price: "Price_Raw",
    Change_24h: "Change_24h_Raw",
    Change_Today: "Change_Today_Raw",
    // "Volume": "Volume_Raw",
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
    // 🚨 [잔상 방지 핵심] 미래 버퍼값을 당겨 쓰면 화면 텍스트(현재)와 순서가 어긋납니다.
    // 무조건 현재 화면에 보이는 값(장부 원본)으로만 정렬하여 잔상을 완벽히 차단합니다.
    let valA = a[key];
    let valB = b[key];

    // 1. 둘 다 숫자인 경우 (MarketCap, Price, Change 등)
    if (typeof valA === "number" && typeof valB === "number") {
      return isAsc ? valA - valB : valB - valA;
    }

    // 2. 문자열인 경우 (Ticker 등)
    const strA = (valA || "").toString();
    const strB = (valB || "").toString();
    return isAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
  });
}

// ⭐️ 실시간 재정렬 & 경주마 애니메이션 함수
function applyRealtimeSort() {
  if (!store.currentSortCol || store.sortState === "") return;

  // 🚀 [수정] 무조건 필터링 먼저 진행! (그래야 즐겨찾기/업비트 전용이 유지됨)
  const filteredData = getFilteredData();
  
  // 🚀 [수정] 필터링된 결과물 내에서만 정렬을 진행해야 함
  const sortKeyMap = {
    MarketCap: "MarketCap_Raw",
    Price: "Price_Raw",
    Change_24h: "Change_24h_Raw",
    Change_Today: "Change_Today_Raw",
    Volume: "Binance_Vol_Futures",
    Ticker: "DisplayTicker",
    Kimchi: "Kimchi_Raw",
    Funding: "Funding_Raw",
    VMC: "VMC_Raw",
    Gap: "Basis_Raw",
  };

  const key = sortKeyMap[store.currentSortCol] || store.currentSortCol;
  const isAsc = store.sortState === "asc";

  filteredData.sort((a, b) => {
    let valA = a[key];
    let valB = b[key];
    if (typeof valA === "number" && typeof valB === "number") {
      return isAsc ? valA - valB : valB - valA;
    }
    valA = (valA || "").toString().toLowerCase();
    valB = (valB || "").toString().toLowerCase();
    return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  const tbody = document.getElementById("table-body");
  const topData = filteredData.slice(0, store.currentRenderLimit);
  const topSymbols = new Set(topData.map((d) => d.Ticker)); // 🚀 DisplayTicker -> Ticker 변경

  const existingRows = Array.from(tbody.children);
  const firstRects = new Map();

  // 🚀 [수정] FLIP First: 모든 기존 행의 현재 위치를 기억 (가시성 체크에만 의존하면 센서 지연 시 애니메이션 누락됨)
  existingRows.forEach((row) => {
    const sym = row.dataset.sym;
    if (sym) {
      firstRects.set(sym, row.getBoundingClientRect().top);
    }
  });

  // 🚀 [최적화] DOM 재활용 풀(Pool) 생성
  // 100등 밖으로 밀려난 패배자들의 DOM을 버리지 않고 모아둡니다.
  const recycleBin = [];
  existingRows.forEach((row) => {
    const sym = row.dataset.sym;
    if (!topSymbols.has(sym)) {
      recycleBin.push(row);
      row.remove(); // 🚀 [핵심] 테이블에서 즉시 제거하여 제자리에서 데이터만 바뀌는 '변신 잔상' 방지
      // 재활용 대기열에 들어갔으니 일단 CCTV에서 뺌
      store.visibleSymbols.delete(sym);
    }
  });

  // 4. 새로운 승리자들 DOM 재배치 (재활용 적극 활용)
  topData.forEach((data, index) => {
    const sym = data.Ticker; // 🚀 DisplayTicker -> Ticker 변경 (중복 방어)
    let tr = tbody.querySelector(`tr[data-sym="${sym}"]`);

    // DOM이 없다면? (새로 진입한 코인)
    if (!tr) {
      if (recycleBin.length > 0) {
        tr = recycleBin.pop();
        if (store.tableObserver) store.tableObserver.unobserve(tr); // 1. 기존 감시 취소
        tr.dataset.sym = sym;
        updateRowInnerHTML(tr, data);
        if (store.tableObserver) store.tableObserver.observe(tr); // 2. 새 신분으로 감시 재시작 🚀
      } else {
        // 완전 초기 렌더링 시 빈 공간이 모자랄 때만 새로 생성
        tr = createRowElement(data);
      }
    }

    // 위치가 다르면 DOM 이동
    if (tbody.children[index] !== tr) {
      tbody.insertBefore(tr, tbody.children[index]);
    }
  });

  // 혹시 남은 잉여 DOM이 있다면 그때서야 파괴 (보통 발생 안 함)
  recycleBin.forEach((row) => {
    if (store.tableObserver) store.tableObserver.unobserve(row);
    row.remove();
  });

  // 🚀 [최적화] FLIP Last & Play: "보이는 화면만" 정밀 타격 애니메이션
  const finalRows = Array.from(tbody.children);
  
  if (store.useFlip) {
    // 1단계: 모든 행의 새로운 위치(Last) 측정 (가시성 체크 완화)
    const lastRects = new Map();
    finalRows.forEach((row) => {
      const sym = row.dataset.sym;
      if (firstRects.has(sym)) {
        lastRects.set(sym, row.getBoundingClientRect().top);
      }
    });

    // 2단계: 위치가 바뀐 행들만 부드럽게 이동 (Write Phase)
    finalRows.forEach((row) => {
      const sym = row.dataset.sym;
      const firstY = firstRects.get(sym);
      const lastY = lastRects.get(sym);

      if (firstY !== undefined && lastY !== undefined && firstY !== lastY) {
        const deltaY = firstY - lastY;
        row.style.transition = "none";
        row.style.transform = `translateY(${deltaY}px)`;
        row.style.willChange = "transform";
        row.offsetHeight; // 🚀 [핵심] 강제 리플로우로 브라우저에게 시작 위치를 확실히 각인

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            row.style.transition = "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)"; // 0.3s로 단축 (400ms 주기와 간섭 방지)
            row.style.transform = "";
            // 애니메이션 완료 후 최적화 레이어 해제
            setTimeout(() => { if(row) row.style.willChange = "auto"; }, 350);
          });
        });
      }
    });
  } else {
    // 🚀 애니메이션 OFF: 모든 행의 transform을 깨끗이 비워 즉시 위치 반영
    finalRows.forEach(row => { row.style.transform = ""; row.style.transition = "none"; });
  }
  // 🚀 안전장치 장착 (스크롤 쪽이랑 똑같이!)
  if (typeof refreshSniperTarget === "function") {
    refreshSniperTarget();
  }
  applySelectedHighlight(); // 🚀 [추가] 순위 바뀌어도 내 코인은 빛나자
}

function applySelectedHighlight() {
  const selectedSymbol = store.currentSelectedSymbol; // 전역에 저장된 선택 심볼
  if (!selectedSymbol) return;

  // 1. 일단 모든 행의 하이라이트 제거
  document.querySelectorAll("#table-body tr").forEach((tr) => {
    tr.style.outline = "none";
    tr.style.boxShadow = "none";
  });

  // 2. 선택된 심볼을 가진 행(tr)을 찾아서 외곽선 빡!
  const targetTr = document.querySelector(
    `#table-body tr[data-sym="${selectedSymbol}"]`,
  );
  if (targetTr) {
    targetTr.style.outline = "2px solid var(--accent)";
    targetTr.style.outlineOffset = "-2px";
    targetTr.style.boxShadow = "inset 0 0 10px rgba(var(--accent-rgb), 0.2)";
    targetTr.style.zIndex = "10"; // 다른 행보다 위로
  }
}

// 💡 헬퍼 함수: 재활용한 껍데기에 알맹이만 채우는 함수 (기존 로직 분리)
function updateRowInnerHTML(tr, row) {
  const pureSymbol = row.Symbol;
  const tId = row.Ticker; // 🚀 DOM ID용 완벽한 고유키 (예: EDGEUSDT, EDGEKRW)
  tr.dataset.sym = tId; // 🚀 화면 추적용 (이제 DisplayTicker가 아닌 Ticker 사용!)

  // 백엔드에서 준 Raw 숫자 데이터
  const p = row.precision || 2;
  const n24h = row.Change_24h_Raw ?? 0;
  const nPrice = row.Price_Raw ?? 0;

  // 🚀 가격 포맷팅 (p값 꽂아넣기)
  const formattedPrice = formatSmartPrice(nPrice, p);

  // 테마 색상 결정
  const color24h =
    n24h > 0
      ? "text-theme-up"
      : n24h < 0
        ? "text-theme-down"
        : "text-theme-text";

  // 즐겨찾기 상태
  const favorites = JSON.parse(localStorage.getItem("sellnance_favs") || "[]");
  const isFav = favorites.includes(pureSymbol);

  const isDetailed = store.viewMode === "detailed";
  const nDay = row.Change_Today_Raw ?? 0;
  const colorDay = nDay > 0 ? "text-theme-up" : nDay < 0 ? "text-theme-down" : "text-theme-text";

  // 🚀 [신규] 2층 구조 레이아웃 (디자인 가이드 준수 + 스트리밍 ID 추가)
  tr.innerHTML = `
  <td class="p-2">
    <div class="flex items-center gap-2">
      <!-- 1. 별 버튼 (완전 분리) -->
      <button onclick="toggleFavorite('${pureSymbol}', event)" class="star-btn text-[14px] transition-all hover:scale-125 ${isFav ? "active" : ""}" style="color: ${isFav ? "var(--accent)" : "gray"}">
        ${isFav ? "⭐" : "☆"}
      </button>
      
      <!-- 2. 티커 이미지 (고정 영역) -->
      <div class="flex-shrink-0 w-8 h-6 flex items-center justify-center bg-white/5 rounded-full overflow-hidden">
        ${row.Logo || ""}
      </div>
      
      <!-- 3. 티커 & 이름 묶음 -->
      <div class="flex flex-col leading-[1.1] min-w-0">
        <b class="text-[12px] text-theme-text truncate font-black tracking-tighter">${row.DisplayTicker || row.Symbol}</b>
        <span class="text-[9px] text-theme-text opacity-60 truncate uppercase font-bold tracking-tighter">
          ${(() => {
            const n = store.lang === "KR" ? (row.Name_KR || row.Name || "") : (row.Name || "");
            return n.length > 8 ? n.substring(0, 8) + ".." : n;
          })()}
        </span>
      </div>
    </div>
  </td>
  <td class="p-2">
    <div class="flex flex-col leading-tight">
      <span id="price-${tId}" data-raw-price="${nPrice}" class="font-black text-[14px] text-theme-text price-cell tracking-tighter">
        ${formattedPrice}
        ${row.Price_KRW ? `<span class="text-[12px] text-theme-text opacity-70 ml-1"> ( ${Number(row.Price_KRW).toLocaleString()} 원 )</span>` : ""}
      </span>
      <div class="flex gap-2 text-[10px] font-black">
        <span id="change-${tId}" class="${color24h} ${store.currentSortCol === "Change_Today" ? "opacity-40" : "opacity-100"}">${n24h > 0 ? "+" : ""}${Number(n24h).toFixed(2)}%</span>
        <span id="today-${tId}" class="${colorDay} ${store.currentSortCol === "Change_Today" ? "opacity-100" : "opacity-40"}">${nDay > 0 ? "+" : ""}${Number(nDay).toFixed(2)}%</span>
      </div>
    </div>
  </td>
  <td class="p-2">
    <div class="flex flex-col leading-tight">
      <span class="text-[12px] font-black text-theme-text opacity-90 tracking-tighter">${row.MarketCap_Formatted || "0"}</span>
      <div class="flex items-center gap-2 text-[10px] font-black opacity-60">
        <span id="vol-binance-${tId}">${row.Volume_Formatted || "0"}</span>
        <span class="text-theme-accent">${row.VMC_Formatted || "0.0%"}</span>
      </div>
    </div>
  </td>
  <td class="p-2 text-right pr-3">
    <div class="flex flex-col leading-tight items-end">
      <div class="flex items-center justify-end gap-1">
         <span class="text-[12px] font-black ${row.Kimchi_Raw > 0 ? "text-theme-up" : "text-theme-down"}">${row.Kimchi_Formatted || "0.0%"}</span>
         <span class="text-[9px] font-black opacity-40 uppercase tracking-tighter">(${row.Kimchi_Label || "-"})</span>
      </div>
      <div class="flex items-center justify-end gap-2 text-[10px] font-black">
         <span class="text-theme-accent opacity-70">${row.Funding_Formatted || "-"}</span>
      </div>
    </div>
  </td>
  <td class="p-2">
    <!-- 🚀 8대 거래소 4x2 그리드 로고 (CMC 이미지 활용) -->
    <div class="grid grid-cols-4 gap-[2px] w-fit">
      ${(() => {
        const exchanges = row.Listed_Exchanges || [];
        const list = [
          { id: 'BINANCE', cmcId: 270 },
          { id: 'UPBIT', cmcId: 351 },
          { id: 'BITHUMB', cmcId: 200 },
          { id: 'BYBIT', cmcId: 521 },
          { id: 'OKX', cmcId: 294 },
          { id: 'BITGET', cmcId: 513 },
          { id: 'GATEIO', cmcId: 302 },
          { id: 'COINBASE', cmcId: 89 }
        ];
        return list.map(ex => {
          const isListed = exchanges.some(e => e.includes(ex.id)) || (ex.id === 'UPBIT' && row.Upbit === 'O');
          const imgUrl = `https://s2.coinmarketcap.com/static/img/exchanges/64x64/${ex.cmcId}.png`;
          return `
            <div class="w-[14px] h-[14px] flex items-center justify-center rounded-[2px] overflow-hidden bg-white/5 transition-all"
                 style="${isListed ? 'filter: none; opacity: 1;' : 'filter: grayscale(1); opacity: 0.1;'}">
              <img src="${imgUrl}" alt="${ex.id}" class="w-full h-full object-contain" />
            </div>
          `;
        }).join('');
      })()}
    </div>
  </td>
`;
}

// 🚀 [table.js 또는 main.js] 무한 스크롤 & 스나이퍼 통합 엔진
function initInfiniteScroll() {
  const scrollContainer = document.querySelector(
    "#left-panel .overflow-y-auto",
  );
  if (!scrollContainer) return;

  let isFetchingMore = false; // 🚨 스크롤 폭주 방지 (스로틀링)
  let scrollTimer; // 🎯 조준경 동기화용 (디바운싱)

  // 1. 로딩 바 DOM 생성
  const loadingIndicator = document.createElement("div");
  loadingIndicator.id = "scroll-loading";
  loadingIndicator.innerHTML = `
    <div class="py-4 flex justify-center items-center gap-2 opacity-50 text-[12px] font-bold">
      <div class="w-4 h-4 border-2 border-theme-text border-t-transparent rounded-full animate-spin"></div>
      더 불러오는 중...
    </div>
  `;
  loadingIndicator.style.display = "none";
  scrollContainer.appendChild(loadingIndicator);

  // 2. 통합 스크롤 센서 가동
  scrollContainer.addEventListener(
    "scroll",
    () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;

      // --- [파트 A] 무한 스크롤 (데이터 추가 렌더링) ---
      if (
        !isFetchingMore &&
        scrollTop + clientHeight >= scrollHeight - clientHeight * 1.2
      ) {
        if (store.currentRenderLimit < store.currentTableData.length) {
          isFetchingMore = true;
          loadingIndicator.style.display = "block";

          setTimeout(() => {
            // 1. 기존 개수 기억하고 한도 늘리기
            const oldLimit = store.currentRenderLimit;
            store.currentRenderLimit += CONFIG.RENDER_CHUNK;

            // 🚀 2. 핵심 최적화: 전체 정렬 대신, 딱 추가될 50개만 잘라서 밑에 붙입니다!
            const tbody = document.getElementById("table-body");
            const nextBatch = store.currentTableData.slice(
              oldLimit,
              store.currentRenderLimit,
            );

            nextBatch.forEach((row) => {
              // 'createRowElement'가 알아서 껍데기 만들고 CCTV(Observer)까지 달아줍니다!
              tbody.appendChild(createRowElement(row));
            });

            // 3. 50개가 새로 생겼으니 조준경 갱신
            if (typeof refreshSniperTarget === "function") {
              refreshSniperTarget();
            }

            loadingIndicator.style.display = "none";
            isFetchingMore = false;
          }, 50);
        }
      }

      // --- [파트 B] 스나이퍼 조준경 (디바운싱 동기화) ---
      // 슥슥 올릴 땐 가만히 있다가, 멈추면 해당 구역 0.1초 틱 따기 시작!
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        // ✅ [통합 훅] refreshSniperTarget 하나면 '보이는 놈 계산 + 구독'까지 한방입니다.
        if (typeof refreshSniperTarget === "function") {
          refreshSniperTarget();
        }
      }, 50); // 초 단위 멈춤 감지 (IP 밴 방어선)
    },
    { passive: true },
  );
}

function toggleFavorite(symbol, event) {
  event.stopPropagation(); // 🚨 중요: 별 눌렀을 때 차트 열리는 거 방지!
  const btn = event.currentTarget;
  let favorites = JSON.parse(localStorage.getItem("sellnance_favs") || "[]");

  if (favorites.includes(symbol)) {
    favorites = favorites.filter((f) => f !== symbol);
    btn.innerText = "☆";
    btn.style.color = "gray";
    btn.classList.remove("active");
  } else {
    favorites.push(symbol);
    btn.innerText = "⭐";
    btn.style.color = "var(--accent)";
    btn.classList.add("active");
    // ⭐️ 쫀득한 애니메이션 효과
    btn.style.transform = "scale(1.5)";
    setTimeout(() => (btn.style.transform = "scale(1)"), 50);
  }
  localStorage.setItem("sellnance_favs", JSON.stringify(favorites));
}

// 🚀 가격 변화에 따른 반짝이 효과 통합 관리자
function applyPriceFlash(element, newPrice, oldPrice) {
  if (!element || newPrice === oldPrice) return;
  if (!store.useFlip) return; // 🚀 플립(반짝이) 기능 꺼져있으면 즉시 퇴근

  const flashClass = newPrice > oldPrice ? "flash-up" : "flash-down";

  // 🚨 기존 클래스 제거 후 다시 추가 (애니메이션 초기화)
  element.classList.remove("flash-up", "flash-down");

  // 강제 리플로우(Reflow) 발생시켜 애니메이션 재시작 유도
  void element.offsetWidth;

  element.classList.add(flashClass);
  setTimeout(() => element.classList.remove(flashClass), 100);
}

// ⭐️ 2. 좌우 넓이 드래그 조절 기능 ⭐️
const leftPanel = document.getElementById("left-panel");
let isResizing = false;
let animationFrameId = null;

document.addEventListener("mousemove", (e) => {
  if (!isResizing) return;

  // 🚨 핵심: 이전 프레임이 대기 중이면 취소하고 최신 것만 실행
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  animationFrameId = requestAnimationFrame(() => {
    const containerWidth = document.body.clientWidth;
    let newWidth = (e.clientX / containerWidth) * 100;

    if (newWidth < 25) newWidth = 25;
    if (newWidth > 75) newWidth = 75;

    // 1. 패널 크기 변경
    leftPanel.style.width = newWidth + "%";
  });
});

document.addEventListener("mouseup", () => {
  isResizing = false;
  document.body.classList.remove("resizing-active"); // 🚨 효과 해제
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
});

// [table.js 맨 아래에 독립적으로 배치]
// ⭐️ 이 코드가 있어야 웹페이지가 켜지자마자 데이터를 가져옵니다!
document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("table-body");
  loadTableData();

  tbody.addEventListener("click", (e) => {
    // 1. 별표(즐겨찾기) 버튼 눌렀을 때는 차트 안 뜨게 방어 (이미 toggleFavorite에 stopPropagation 있지만 한 번 더!)
    if (e.target.closest(".star-btn")) return;

    const tr = e.target.closest("tr");
    if (tr && tr.dataset.sym) {
      const ticker = tr.dataset.sym; // 🚀 Ticker (BTCUSDT 등)
      store.currentSelectedSymbol = ticker;
      selectSymbol(ticker);
      applySelectedHighlight();

      if (window.innerWidth <= CONFIG.SCREEN_WIDTH) {
        showMobileChart();
      }
    }
  });
});

function switchTab(tab) {
  // 🚀 [토글 로직 추가] 이미 FAV 모드인데 또 FAV를 누르면 ALL(LIST)로 복구
  if (tab === "FAV" && store.currentTab === "FAV") {
    tab = "ALL";
  }

  store.currentTab = tab;
  store.currentRenderLimit = 50;

  // UI 업데이트
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("bg-theme-accent", "text-white", "shadow-md");
    btn.classList.add("text-theme-text", "opacity-50", "border-theme-border");
  });

  const activeBtn = document.getElementById(`tab-${tab.toLowerCase()}`);
  if (activeBtn) {
    activeBtn.classList.remove(
      "text-theme-text",
      "opacity-50",
      "border-theme-border",
    );
    activeBtn.classList.add("bg-theme-accent", "text-white", "shadow-md");
  }

  renderTable();
}

function switchFilter(mode) {
  const slider = document.getElementById("filter-slider");
  const btnAll = document.getElementById("filter-all-main");
  const btnBinance = document.getElementById("filter-binance");
  const btnUpbit = document.getElementById("filter-upbit");

  const updateUI = (activeBtn, offset) => {
    [btnAll, btnBinance, btnUpbit].forEach((btn) => {
      if (btn) {
        btn.classList.remove("text-white", "font-black");
        btn.classList.add("text-theme-text", "opacity-50");
      }
    });
    if (activeBtn) {
      activeBtn.classList.remove("text-theme-text", "opacity-50");
      activeBtn.classList.add("text-white", "font-black");
    }
    if (slider) slider.style.left = offset;
  };

  if (mode === "ALL") {
    store.filterMode = "ALL";
    updateUI(btnAll, "4px");
  } else if (mode === "BINANCE") {
    store.filterMode = "BINANCE";
    updateUI(btnBinance, "calc(33.33% + 2px)");
  } else if (mode === "UPBIT") {
    store.filterMode = "UPBIT";
    updateUI(btnUpbit, "calc(66.66% + 1px)");
  } else {
    // FUTURES, SPOT 필터 (서브 필터)
    store.filterMode = mode;
    document.querySelectorAll(".filter-type-btn").forEach((btn) => {
      btn.classList.remove("bg-theme-accent", "text-white", "shadow-sm");
      btn.classList.add("text-theme-text", "opacity-50", "hover:opacity-100");
    });
    const activeBtn = document.getElementById(`filter-${mode.toLowerCase()}`);
    if (activeBtn) {
      activeBtn.classList.remove(
        "text-theme-text",
        "opacity-50",
        "hover:opacity-100",
      );
      activeBtn.classList.add("bg-theme-accent", "text-white", "shadow-sm");
    }
  }

  store.currentRenderLimit = 50;
  renderTable();
}

function switchView(mode) {
  store.viewMode = mode;
  document.getElementById("view-detailed").className =
    mode === "detailed"
      ? "view-btn px-3 py-1.5 text-[11px] font-bold rounded-md transition-all bg-theme-accent text-white shadow-sm"
      : "view-btn px-3 py-1.5 text-[11px] font-bold rounded-md transition-all text-theme-text opacity-50 hover:opacity-100";
  document.getElementById("view-simple").className =
    mode === "simple"
      ? "view-btn px-3 py-1.5 text-[11px] font-bold rounded-md transition-all bg-theme-accent text-white shadow-sm"
      : "view-btn px-3 py-1.5 text-[11px] font-bold rounded-md transition-all text-theme-text opacity-50 hover:opacity-100";

  renderTable();
}




// 🚀 [신규] 상단 제어기 함수들
window.toggleLang = () => {
  store.lang = store.lang === "KR" ? "EN" : "KR";
  const btn = document.getElementById("lang-toggle");
  if (btn) btn.innerText = store.lang;
  renderTable();
};

window.toggleSmallCap = () => {
  store.hideSmallCap = !store.hideSmallCap;
  
  // UI 상태 업데이트
  const btn = document.getElementById("btn-small-cap");
  if (btn) {
    if (store.hideSmallCap) {
      btn.classList.remove("text-theme-text", "opacity-50", "border-theme-border");
      btn.classList.add("bg-theme-down", "text-white", "border-theme-down", "shadow-md", "opacity-100");
      btn.innerText = "🚫 Hiding Mcap < 1M";
    } else {
      btn.classList.add("text-theme-text", "opacity-50", "border-theme-border");
      btn.classList.remove("bg-theme-down", "text-white", "border-theme-down", "shadow-md", "opacity-100");
      btn.innerText = "🚫 Hiding Mcap < 1M";
    }
  }

  store.currentRenderLimit = 50;
  renderTable();
};

// 🚀 플립 토글 중복 선언 제거됨

// ⚙️ 설정 모달 관련 함수 및 마스킹 엔진 (start.js와 동일한 쌀먹 아키텍처)
function maskApiKey(key) {
  if (!key) return "";
  const len = key.length;
  if (len <= 8) return key;

  const start = key.slice(0, 4);
  const end = key.slice(-4);
  const dots = "*".repeat(len - 8);
  return `${start}${dots}${end}`;
}

async function openSettingsModal() {
  const modal = document.getElementById("settings-modal");
  modal.classList.remove("hidden");

  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    store.settings = data;
    const input = document.getElementById("setting-cmc-key");
    const btn = input.nextElementSibling; // 🚀 버튼 찾기 (input 바로 다음 요소)
    input.type = "text"; // 🚀 마스킹된 텍스트가 바로 보이도록 text 타입으로 설정
    input.value = maskApiKey(data.CMC_API_KEY || "");
    input.dataset.masked = "true";
    if (btn) btn.innerText = "🙈"; // 🚀 가려진 상태이므로 눈알 닫기 이모지
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
}

function closeSettingsModal() {
  document.getElementById("settings-modal").classList.add("hidden");
}

async function saveSettings() {
  const input = document.getElementById("setting-cmc-key");
  let newKey = input.value.trim();

  // 🚀 마스킹된 별표(*) 문자열 그대로라면 원본 키를 유지 (안전장치)
  if (newKey.includes("*") && store.settings) {
    newKey = store.settings.CMC_API_KEY || "";
  }

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        CMC_API_KEY: newKey
      }),
    });

    if (res.ok) {
      alert("Settings saved successfully! Restarting data fetch...");
      closeSettingsModal();
      loadTableData(true); // 새 키로 데이터 강제 다시 읽기
    }
  } catch (e) {
    alert("Failed to save settings.");
  }
}

function togglePasswordVisibility(id) {
  const input = document.getElementById(id);
  const btn = input.nextElementSibling; // 🚀 버튼 찾기
  if (!store.settings) return;
  const raw = store.settings.CMC_API_KEY || "";

  if (input.dataset.masked === "true") {
    // 🚀 마스킹 해제 (원본 노출 - 열면 눈알 열리기)
    input.value = raw;
    input.dataset.masked = "false";
    if (btn) btn.innerText = "👁️";
  } else {
    // 🚀 다시 마스킹 (가리면 눈알 닫기)
    input.value = maskApiKey(raw);
    input.dataset.masked = "true";
    if (btn) btn.innerText = "🙈";
  }
}


// 🚀 [HTS급 실시간 정렬 엔진] 0.4초마다 순위 재배치 및 고속 FLIP 실행
setInterval(() => {
  if (store.currentSortCol && store.sortState !== "") {
    applyRealtimeSort();
  }
}, 400);

// 🚀 [통합] 전역 수출 구간
window.loadTableData = loadTableData;
window.sortTable = sortTable;
window.renderTable = renderTable;
window.applyRealtimeSort = applyRealtimeSort;
window.applySelectedHighlight = applySelectedHighlight;
window.initInfiniteScroll = initInfiniteScroll;
window.toggleFavorite = toggleFavorite;
window.applyPriceFlash = applyPriceFlash;
window.switchTab = switchTab;
window.switchFilter = switchFilter;
window.switchView = switchView;
window.toggleSmallCap = toggleSmallCap;
window.updateVisibleSymbols = updateVisibleSymbols;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.togglePasswordVisibility = togglePasswordVisibility;
