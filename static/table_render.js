// table_render.js
import { store, CONFIG } from "./_store.js";
import { formatSmartPrice } from "./chart_utils.js";
import { getFilteredData } from "./table_filter.js";

export function createRowElement(row) {
  const tr = document.createElement("tr");
  const ticker = row.Ticker; // 🚀 중복 없는 유니크 티커 사용 (BTCKRW != BTCUSDT)
  tr.dataset.sym = ticker;

  updateRowInnerHTML(tr, row);

  if (store.tableObserver) store.tableObserver.observe(tr);
  return tr;
}

export function updateRowInnerHTML(tr, row) {
  const pureSymbol = row.Symbol;
  const tId = row.Ticker; // 🚀 DOM ID용 완벽한 고유키
  tr.dataset.sym = tId; // 🚀 화면 추적용

  const p = row.precision || 2;
  const n24h = row.Change_24h_Raw ?? 0;
  const nPrice = row.Price_Raw ?? 0;

  const formattedPrice = formatSmartPrice(nPrice, p);

  const color24h =
    n24h > 0
      ? "text-theme-up"
      : n24h < 0
        ? "text-theme-down"
        : "text-theme-text";

  const favorites = JSON.parse(localStorage.getItem("sellnance_favs") || "[]");
  const isFav = favorites.includes(pureSymbol);

  const isDetailed = store.viewMode === "detailed";
  const nDay = row.Change_Today_Raw ?? 0;
  const colorDay =
    nDay > 0
      ? "text-theme-up"
      : nDay < 0
        ? "text-theme-down"
        : "text-theme-text";

  // 🚀 [최신] 2층 구조 레이아웃 (디자인 가이드 준수 + z_style.css 단일 관리소 강제 종속)
  tr.innerHTML = `
  <td class="p-2 col-asset overflow-hidden">
    <div class="flex items-center gap-1.5 min-w-0">
      <!-- 0. 절대 순위 번호 (1 ~ max length 고정 배치, CSS 카운터 기반) -->
      <span class="row-counter text-[10px] font-mono font-bold text-theme-text opacity-40 w-5 text-center flex-shrink-0"></span>

      <!-- 1. 별 버튼 (완전 분리) -->
      <button onclick="toggleFavorite('${pureSymbol}', event)" class="star-btn text-[14px] transition-all hover:scale-125 flex-shrink-0 ${isFav ? "active" : ""}" style="color: ${isFav ? "var(--accent)" : "gray"}">
        ${isFav ? "⭐" : "☆"}
      </button>
      
      <!-- 2. 티커 이미지 (고정 영역) -->
      <div class="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/1 rounded-full overflow-hidden">
        ${row.Logo || ""}
      </div>
      
      <!-- 3. 티커 & 이름 묶음 -->
      <div class="flex flex-col leading-[1.1] min-w-0 flex-1">
        <b class="text-[12px] text-theme-text truncate font-black tracking-tighter">${row.DisplayTicker || row.Symbol}</b>
        <span class="text-[9px] text-theme-text opacity-60 truncate font-bold tracking-tighter">
          ${(() => {
            const n =
              store.lang === "KR"
                ? row.Name_KR || row.Name || ""
                : row.Name || "";
            return n.length > 8 ? n.substring(0, 8) + ".." : n;
          })()}
        </span>
      </div>
    </div>
  </td>
  <td class="p-2 col-price overflow-hidden">
    <div class="flex flex-col leading-tight min-w-0 gap-0.5">
      ${(() => {
        const rate = store.marketDataMap?.krw_usd_rate || 0;
        const hasBinance =
          row.Listed_Exchanges?.some(
            (e) => e.includes("BINANCE") || e.includes("BYBIT"),
          ) || row.Price_Raw > 0;
        const hasUpbit =
          row.Listed_Exchanges?.includes("UPBIT") ||
          row.Listed_Exchanges?.includes("BITHUMB") ||
          row.Upbit === "O" ||
          row.Price_KRW > 0;

        let finalUsd = row.Price_Raw ?? 0;
        let finalKrw = row.Price_KRW ?? 0;
        if (!hasBinance && hasUpbit) finalUsd = finalKrw / rate;
        else if (hasBinance && !hasUpbit) finalKrw = finalUsd * rate;

        const isKrwMode = store.currencyMode === "KRW";
        const mainP = isKrwMode
          ? `${Number(finalKrw).toLocaleString()} 원`
          : formatSmartPrice(finalUsd, p);

        return `
          <span id="price-${tId}" data-raw-price="${nPrice}" class="font-black text-[14px] text-theme-text price-cell tracking-tighter truncate block">
            ${mainP}
          </span>
        `;
      })()}
      <div class="flex items-center justify-between gap-2 text-[10px] font-black text-left mt-0.5 w-full min-w-0">
        <span id="change-${tId}" class="${color24h} ${store.currentSortCol === "Change_Today" ? "opacity-40" : "opacity-100"} flex-1 text-left truncate">${n24h > 0 ? "+" : ""}${Number(n24h).toFixed(2)}%</span>
        <span id="today-${tId}" class="${colorDay} ${store.currentSortCol === "Change_Today" ? "opacity-100" : "opacity-40"} flex-1 text-left truncate">${nDay > 0 ? "+" : ""}${Number(nDay).toFixed(2)}%</span>
      </div>
    </div>
  </td>
  <td class="p-2 col-mcap overflow-hidden">
    <div class="flex flex-col leading-tight min-w-0 gap-0.5">
      <div class="flex items-center justify-between gap-1 w-full min-w-0 truncate text-[11px] font-mono">
        <span id="vol-binance-${tId}" class="text-[#f0b90b] font-bold truncate">${row.Volume_Formatted && row.Volume_Formatted !== "-" && row.Volume_Formatted !== "0" ? row.Volume_Formatted : "-"}</span>
        <span class="text-[#093687] font-bold truncate">${row.Upbit_Vol_Formatted && row.Upbit_Vol_Formatted !== "-" && row.Upbit_Vol_Formatted !== "0" ? row.Upbit_Vol_Formatted : "-"}</span>
      </div>
      <div class="flex items-center justify-between gap-2 text-[10px] font-black opacity-60 text-left mt-0.5 w-full min-w-0">
        <span class="flex-1 text-left truncate">${row.MarketCap_Formatted || "0"}</span>
        <span class="text-theme-accent flex-1 text-left truncate">${row.VMC_Formatted || "0.0%"}</span>
      </div>
    </div>
  </td>
  <td class="p-2 text-left col-kimch overflow-hidden">
    <div class="flex flex-col leading-tight items-start min-w-0">
      <div class="flex items-center justify-start gap-1 min-w-0 max-w-full">
         ${
           !row.Kimchi_Label || row.Kimchi_Label === "-"
             ? `<span class="text-[12px] font-black text-theme-text opacity-40">-</span>`
             : `<span class="text-[12px] font-black truncate ${row.Kimchi_Raw > 0 ? "text-theme-up" : "text-theme-down"}">${row.Kimchi_Formatted || "0.0%"}</span>`
         }
      </div>
      <div class="flex items-center justify-start gap-2 text-[10px] font-black mt-0.5 min-w-0 max-w-full">
         <span class="text-theme-accent opacity-70 truncate">${row.Funding_Formatted || "-"}</span>
      </div>
    </div>
  </td>
  <td class="p-2 col-exch overflow-hidden">
    <div class="grid grid-cols-4 gap-[2px] w-fit text-left min-w-0">
      ${(() => {
        const exchanges = row.Listed_Exchanges || [];
        const list = [
          { id: "BINANCE", cmcId: 270 },
          { id: "UPBIT", cmcId: 351 },
          { id: "BITHUMB", cmcId: 200 },
          { id: "BYBIT", cmcId: 521 },
          { id: "OKX", cmcId: 294 },
          { id: "BITGET", cmcId: 513 },
          { id: "GATEIO", cmcId: 302 },
          { id: "COINBASE", cmcId: 89 },
        ];
        return list
          .map((ex) => {
            const isListed =
              exchanges.some((e) => e.includes(ex.id)) ||
              (ex.id === "UPBIT" && row.Upbit === "O");
            const imgUrl = `https://s2.coinmarketcap.com/static/img/exchanges/64x64/${ex.cmcId}.png`;
            return `
            <div class="w-[14px] h-[14px] flex items-center justify-center rounded-[2px] overflow-hidden bg-white/5 transition-all flex-shrink-0"
                 style="${isListed ? "filter: none; opacity: 1;" : "filter: grayscale(1); opacity: 0.1;"}">
              <img src="${imgUrl}" alt="${ex.id}" class="w-full h-full object-contain" />
            </div>
          `;
          })
          .join("");
      })()}
    </div>
  </td>
`;
}

// 🚀 [신규 아키텍처] 고정 DOM 풀 및 Lazy 렌더링 상태 관리
store.tablePoolInitialized = false;

// 🚀 [신규] 텅 빈 껍데기 상태일 때도 테이블 가로 구분선(그리드)이 100% 완벽하게 보이도록 유지하는 빈 셀 템플릿!
const EMPTY_ROW_HTML = `
  <td class="p-2 col-asset overflow-hidden">
    <div class="flex items-center gap-1.5 min-w-0">
      <!-- 빈 껍데기 상태에서도 고정된 행 번호는 보이도록 유지 (CSS 카운터 기반) -->
      <span class="row-counter text-[10px] font-mono font-bold text-theme-text opacity-40 w-5 text-center flex-shrink-0"></span>
    </div>
  </td>
  <td class="p-2 col-price overflow-hidden"></td>
  <td class="p-2 col-mcap overflow-hidden"></td>
  <td class="p-2 col-kimch overflow-hidden"></td>
  <td class="p-2 col-exch overflow-hidden"></td>
`;

export function renderTable(isRealtime = false) {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  const filteredData = getFilteredData();
  const totalCount = filteredData.length;

  // 1. 최초 1회 전체 껍데기 풀(Pool) 생성 (DOM 파괴/생성 원천 차단, 가상화 스크롤 바 확보)
  if (!store.tablePoolInitialized || tbody.children.length !== totalCount) {
    tbody.innerHTML = "";
    store.rowDomMap = new Map();
    store.visibleSymbols.clear();
    store.lastSortedTickers = null; // 🚀 풀 재구성 시 정렬 비교 캐시도 초기화!

    if (store.tableObserver) {
      store.tableObserver.disconnect();
    }

    // 🚀 화면 추적용 옵저버 (화면에 들어오면 Lazy하게 내용 채워넣기!)
    store.tableObserver = new IntersectionObserver(
      (entries) => {
        let changed = false;
        entries.forEach((entry) => {
          const tr = entry.target;
          const sym = tr.dataset.sym;
          if (!sym) return;

          const rowData = store.tickerRowMap.get(sym.toUpperCase());
          if (entry.isIntersecting) {
            if (rowData) {
              if (!store.visibleSymbols.has(rowData.Ticker)) {
                store.visibleSymbols.add(rowData.Ticker);
                changed = true;
              }
              // 🚀 [성능 최적화] 무조건 updateRowInnerHTML를 부르지 않고, 내용이나 설정이 바뀐 경우에만 선별적으로 렌더링하여 layout thrashing 차단!
              const needsRender = !tr.dataset.renderedSym ||
                                  tr.dataset.renderedSym !== rowData.Ticker ||
                                  tr.dataset.renderedCurrency !== store.currencyMode ||
                                  tr.dataset.renderedLang !== store.lang;
              if (needsRender) {
                updateRowInnerHTML(tr, rowData);
                tr.dataset.renderedSym = rowData.Ticker;
                tr.dataset.renderedCurrency = store.currencyMode;
                tr.dataset.renderedLang = store.lang;
              }
            }
          } else {
            if (rowData) {
              if (store.visibleSymbols.has(rowData.Ticker)) {
                store.visibleSymbols.delete(rowData.Ticker);
                changed = true;
              }
              tr.dataset.renderedSym = "";
            }
          }
        });

        // 🚀 변경사항이 있을 때만 웹소켓 구독 싱크 호출 (쓰로틀링 적용)
        if (changed && typeof window.syncSniperSubscriptions === "function") {
          if (store.syncSubTimer) clearTimeout(store.syncSubTimer);
          store.syncSubTimer = setTimeout(() => {
            window.syncSniperSubscriptions();
          }, 100);
        }
      },
      {
        root: document.querySelector("#left-panel .overflow-y-auto"),
        rootMargin: "300px 0px", // 🚀 위아래 300px 여유를 두어 스크롤 시 부드럽게 미리 로딩!
      },
    );

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < totalCount; i++) {
      const tr = document.createElement("tr");
      tr.dataset.index = i;
      tr.style.height = "52px"; // 🚀 고정 높이 할당으로 완벽한 800개 스크롤 바 생성!
      tr.style.contain = "content"; // 🚀 브라우저 렌더링 격리 최적화!
      tr.classList.add("flip-row"); // 🚀 FLIP 애니메이션용 클래스 추가!

      const rowData = filteredData[i];
      if (rowData) {
        tr.dataset.sym = rowData.Ticker;
        store.rowDomMap.set(rowData.Ticker, tr);
        // 최초 화면에 보일 법한 상위 40개만 즉시 렌더링, 나머지는 빈 껍데기 그리드로 Lazy 대기!
        if (i < 40) {
          updateRowInnerHTML(tr, rowData);
          tr.dataset.renderedSym = rowData.Ticker;
          tr.dataset.renderedCurrency = store.currencyMode;
          tr.dataset.renderedLang = store.lang;
        } else {
          // 🚀 껍데기 상태일 때도 가로 구분선이 완벽히 유지되도록 EMPTY_ROW_HTML 삽입!
          tr.innerHTML = EMPTY_ROW_HTML;
          tr.dataset.renderedSym = "";
          tr.dataset.renderedCurrency = "";
          tr.dataset.renderedLang = "";
        }
      }
      store.tableObserver.observe(tr);
      fragment.appendChild(tr);
    }
    tbody.appendChild(fragment);
    store.tablePoolInitialized = true;
    applySelectedHighlight();
    return;
  }

  // 2. 이미 풀이 생성되어 있다면? (정렬/실시간 갱신 시 물리적 DOM 재배치 + FLIP 애니메이션 발동!)
  if (!isRealtime) {
    // 🚀 [수동 정렬/필터링/초기화] 800개 전체 코인을 순서에 맞게 DOM에 즉시 배치 (FLIP 애니메이션 생략, 0초 만에 바로 꽂기)
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < totalCount; i++) {
      const rowData = filteredData[i];
      if (rowData) {
        const tr = store.rowDomMap.get(rowData.Ticker);
        if (tr) {
          tr.dataset.index = i;

          // 보이고 있는 행이거나 상위 20위권인 경우 즉각 렌더링
          const isPreRender = i < 20;
          if (isPreRender || store.visibleSymbols.has(rowData.Ticker)) {
            const needsRender = !tr.dataset.renderedSym ||
                                tr.dataset.renderedSym !== rowData.Ticker ||
                                tr.dataset.renderedCurrency !== store.currencyMode ||
                                tr.dataset.renderedLang !== store.lang;
            if (needsRender) {
              updateRowInnerHTML(tr, rowData);
              tr.dataset.renderedSym = rowData.Ticker;
              tr.dataset.renderedCurrency = store.currencyMode;
              tr.dataset.renderedLang = store.lang;
            }
          }
          fragment.appendChild(tr);
        }
      }
    }
    tbody.appendChild(fragment);
    store.lastSortedTickers = null; // 수동 정렬 후 실시간 비교용 캐시 초기화
    applySelectedHighlight();
    if (typeof window.refreshSniperTarget === "function") {
      setTimeout(() => window.refreshSniperTarget(), 10);
    }
    return;
  }

  let orderChanged = false;
  const limit = Math.min(20, totalCount);
  if (!store.lastSortedTickers || store.lastSortedTickers.length !== limit) {
    orderChanged = true;
  } else {
    for (let i = 0; i < limit; i++) {
      if (store.lastSortedTickers[i] !== filteredData[i].Ticker) {
        orderChanged = true;
        break;
      }
    }
  }

  if (!orderChanged) {
    // 🚀 [성능 극대화] 정렬 순서가 이전과 동일하다면 DOM 재배치 전체를 건너뛰고 가시 영역만 갱신!
    for (const sym of store.visibleSymbols) {
      const tr = store.rowDomMap.get(sym);
      const rowData = store.tickerRowMap.get(sym.toUpperCase());
      if (tr && rowData) {
        const needsRender = !tr.dataset.renderedSym ||
                            tr.dataset.renderedSym !== rowData.Ticker ||
                            tr.dataset.renderedCurrency !== store.currencyMode ||
                            tr.dataset.renderedLang !== store.lang;
        if (needsRender) {
          updateRowInnerHTML(tr, rowData);
          tr.dataset.renderedSym = rowData.Ticker;
          tr.dataset.renderedCurrency = store.currencyMode;
          tr.dataset.renderedLang = store.lang;
        }
      }
    }
    applySelectedHighlight();
    return;
  }

  store.lastSortedTickers = filteredData.slice(0, limit).map(r => r.Ticker);

  const firstRects = new Map();
  if (store.useFlip) {
    for (const sym of store.visibleSymbols) {
      const tr = store.rowDomMap.get(sym);
      if (tr) {
        firstRects.set(sym, tr.getBoundingClientRect().top);
      }
    }
  }

  // 🚀 상위 20개 행만 역순(19 -> 0)으로 insertBefore를 호출하여 table-body 맨 앞으로 재배치!
  for (let i = limit - 1; i >= 0; i--) {
    const rowData = filteredData[i];
    if (rowData) {
      const tr = store.rowDomMap.get(rowData.Ticker);
      if (tr) {
        tr.dataset.index = i;

        // 🚀 상위 20위 안의 행은 무조건 즉시 최신 정보로 렌더링
        const needsRender = !tr.dataset.renderedSym ||
                            tr.dataset.renderedSym !== rowData.Ticker ||
                            tr.dataset.renderedCurrency !== store.currencyMode ||
                            tr.dataset.renderedLang !== store.lang;
        if (needsRender) {
          updateRowInnerHTML(tr, rowData);
          tr.dataset.renderedSym = rowData.Ticker;
          tr.dataset.renderedCurrency = store.currencyMode;
          tr.dataset.renderedLang = store.lang;
        }

        tbody.insertBefore(tr, tbody.firstChild);
      }
    }
  }

  // 🚀 [성능 극대화] FLIP 애니메이션 실행 (레이아웃 쓰레싱을 완벽 소각하기 위해 batch read/write 형태로 전면 개편!)
  if (store.useFlip) {
    const moves = [];
    
    // Pass 1: Batch Reads (동작 시작 위치 확인)
    for (const [sym, firstY] of firstRects.entries()) {
      const tr = store.rowDomMap.get(sym);
      if (tr) {
        const lastY = tr.getBoundingClientRect().top;
        const deltaY = firstY - lastY;
        if (deltaY !== 0) {
          moves.push({ tr, deltaY });
        }
      }
    }

    // Pass 2: Batch Writes (트랜스폼 선언 후 단 1회의 강제 reflow로 렌더링 락인)
    if (moves.length > 0) {
      moves.forEach(({ tr, deltaY }) => {
        tr.style.transition = "none";
        tr.style.transform = `translateY(${deltaY}px)`;
      });
      tbody.offsetHeight; // 단 한 번의 강제 reflow로 모든 엘리먼트 트랜스폼 반영!
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const sym of firstRects.keys()) {
          const tr = store.rowDomMap.get(sym);
          if (tr) {
            tr.style.transition = "";
            tr.style.transform = "";
          }
        }
      });
    });
  }

  applySelectedHighlight();
  if (typeof window.refreshSniperTarget === "function") {
    setTimeout(() => window.refreshSniperTarget(), 10);
  }
}

export function updateVisibleSymbols() {
  // 🚀 [성능 극대화] IntersectionObserver가 이미 store.visibleSymbols를 정밀하고 효율적으로 실시간 관리하고 있으므로,
  // 800개 행의 getBoundingClientRect()를 동기적으로 강제 호출하여 브라우저 전체를 프리징시키던 레거시 레이아웃 쓰레싱 로직을 영구 폐기합니다!
}

export function applySelectedHighlight() {
  const selectedSymbol = store.currentSelectedSymbol;
  if (!selectedSymbol) return;

  document.querySelectorAll("#table-body tr").forEach((tr) => {
    tr.style.outline = "none";
    tr.style.boxShadow = "none";
  });

  const targetTr = document.querySelector(
    `#table-body tr[data-sym="${selectedSymbol}"]`,
  );
  if (targetTr) {
    targetTr.style.outline = "2px solid var(--accent)";
    targetTr.style.outlineOffset = "-2px";
    targetTr.style.boxShadow = "inset 0 0 10px rgba(var(--accent-rgb), 0.2)";
    targetTr.style.zIndex = "10";
  }
}

export function initInfiniteScroll() {
  // 🚀 [신규 아키텍처] 800개 고정 DOM 풀이 존재하므로 무한 스크롤 DOM 추가 로직 영구 소각!
  const scrollContainer = document.querySelector(
    "#left-panel .overflow-y-auto",
  );
  if (!scrollContainer) return;

  let scrollTimer;
  let scrollStopTimer;
  scrollContainer.addEventListener(
    "scroll",
    () => {
      // 🚀 스크롤 중임을 마킹하여 실시간 정렬(DOM 재배치) 차단
      store.isScrolling = true;
      clearTimeout(scrollStopTimer);
      scrollStopTimer = setTimeout(() => {
        store.isScrolling = false;
      }, 200); // 200ms 동안 스크롤이 없으면 정지한 것으로 판단

      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (typeof window.refreshSniperTarget === "function") {
          window.refreshSniperTarget();
        }
      }, 50);
    },
    { passive: true },
  );
}

export function toggleFavorite(symbol, event) {
  event.stopPropagation();
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
    btn.style.transform = "scale(1.5)";
    setTimeout(() => (btn.style.transform = "scale(1)"), 50);
  }
  localStorage.setItem("sellnance_favs", JSON.stringify(favorites));
}

export function applyPriceFlash(element, newPrice, oldPrice) {
  if (!element || newPrice === oldPrice) return;
  if (!store.useFlip) return;

  const flashClass = newPrice > oldPrice ? "flash-up" : "flash-down";
  element.classList.remove("flash-up", "flash-down");
  void element.offsetWidth;
  element.classList.add(flashClass);
  setTimeout(() => element.classList.remove(flashClass), 100);
}
