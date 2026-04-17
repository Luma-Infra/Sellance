// table.js

// 1. 데이터 로드 함수
async function loadTableData(force = false) {
  const modal = document.getElementById("loading-modal");
  const updateTimeSpan = document.getElementById("update-time");

  modal.classList.remove("hidden");
  updateTimeSpan.innerText = "업데이트 중...";

  try {
    console.log("1. 파이썬 서버에 데이터 요청 시작!"); // ⭐️ 추가
    const res = await fetch(`/api/market-data?force=${force}`);
    console.log("2. 파이썬 서버가 응답 완료!"); // ⭐️ 추가
    const result = await res.json();
    updateTimeSpan.innerText = `마지막 업데이트: ${result.last_updated}`;

    // ⭐️ 데이터를 받아오자마자 원본을 깊은 복사로 백업해둡니다.
    originalTableData = JSON.parse(JSON.stringify(result.data));
    currentTableData = JSON.parse(JSON.stringify(result.data));

    const tbody = document.getElementById("table-body");

    // 처음엔 화살표 없이 원본(시총순) 그대로 그림
    renderTable();
  } catch (error) {
    console.error("데이터 로드 에러:", error);
    alert("서버에서 데이터를 가져오지 못했습니다.");
    updateTimeSpan.innerText = "업데이트 실패";
  } finally {
    modal.classList.add("hidden");
  }
}

// [table.js 맨 아래에 독립적으로 배치]
document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("table-body");

  tbody.addEventListener("click", (e) => {
    // 1. 별표(즐겨찾기) 버튼 눌렀을 때는 차트 안 뜨게 방어 (이미 toggleFavorite에 stopPropagation 있지만 한 번 더!)
    if (e.target.closest(".star-btn")) return;

    const tr = e.target.closest("tr");
    if (tr && tr.dataset.sym) {
      const pureSymbol = tr.dataset.sym;
      currentSelectedSymbol = pureSymbol;
      selectSymbol(pureSymbol, true);
      applySelectedHighlight();

      if (window.innerWidth <= SCREEN_WIDTH) {
        showMobileChart();
      }
    }
  });
});

// 2. ⭐️ 3단계 정렬 핵심 로직 ⭐️ (리셋 & 상단 이동 추가)
function sortTable(colKey) {
  // 1. 클릭할 때마다 3단계 사이클 돌리기
  if (currentSortCol === colKey) {
    sortState = sortState === "" ? "desc" : sortState === "desc" ? "asc" : "";
  } else {
    currentSortCol = colKey;
    sortState = "desc";
  }

  // 🚀 [추가] 정렬을 누르면 무조건 50개 리밋으로 리셋!
  currentRenderLimit = 50;

  // 🚀 [추가] 스크롤을 최상단으로 강제 소환!
  const scrollContainer = document.querySelector(
    "#left-panel .overflow-y-auto",
  );
  if (scrollContainer) scrollContainer.scrollTop = 0;

  // 2. 화살표 UI 업데이트
  document.querySelectorAll(".sort-arrow").forEach((el) => (el.innerText = ""));
  const arrowEl = document.getElementById(`sort-${colKey}`);

  // 3. 정렬 실행
  if (sortState === "") {
    // [3타 - 제자리 복구]
    currentTableData = [...originalTableData];
    if (arrowEl) arrowEl.innerText = "";
    renderTable(); // renderTable 내부에서도 currentRenderLimit(50)을 쓰니까 완벽!
  } else {
    // [1타, 2타 - 실시간 정렬]
    if (arrowEl) arrowEl.innerText = sortState === "asc" ? "▲" : "▼";

    // 💡 applyRealtimeSort가 돌면서 100등 밖으로 밀려난 애들을
    // 알아서 recycleBin(재활용 바구니)에 넣고 DOM에서 치워버립니다.
    applyRealtimeSort();
  }
}

// 표 그리기 함수 수정
// 🚀 [추가] 행(TR) 생성 헬퍼 (초기 렌더링 & 신규 진입 시 사용)
function createRowElement(row) {
  const tr = document.createElement("tr");
  const pureSymbol = row.Symbol;
  tr.dataset.sym = pureSymbol;

  // 껍데기 만들고 알맹이 채우는 함수 재활용
  updateRowInnerHTML(tr, row);

  // 새로 만든 행을 CCTV에 즉시 등록
  if (tableObserver) tableObserver.observe(tr);
  return tr;
}

// 🚀 [수정됨] 표 그리기 함수 (딱 100개만 렌더링하도록 변경)
function renderTable() {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";

  // ⭐️ 기존 감시 카메라 끄고 초기화
  // 🚀 핵심: 새 카메라 달기 전에 "기존 카메라"를 완전히 파괴해야 합니다!
  if (tableObserver) {
    tableObserver.disconnect();
    tableObserver = null; // 참조까지 끊어버리세요
  }

  // ⭐️ 새 감시 카메라 설치
  tableObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const sym = entry.target.dataset.sym; // 코인 이름 가져오기
        if (entry.isIntersecting)
          visibleSymbols.add(sym); // 화면에 들어오면 추가
        else visibleSymbols.delete(sym); // 화면 밖으로 나가면 삭제
      });
    },
    {
      root: document.querySelector(".table-container"),
      rootMargin: "100px 0px",
    },
  );

  // 🚨 핵심: 500개 전체가 아니라 상위 RENDER_LIMIT만 자릅니다!
  const topData = currentTableData.slice(0, currentRenderLimit); // 🚀 이걸로 변경
  topData.forEach((row) => {
    // 만들어둔 헬퍼 함수로 깔끔하게 렌더링
    tbody.appendChild(createRowElement(row));
  });
  applySelectedHighlight(); // 🚀 [추가] 정렬 끝나고 내 코인 다시 찾아!
}

// <td class="p-4 text-right">
//     <div class="flex flex-col items-end justify-center h-full gap-1">
//         <span class="text-[13px]">${row.Upbit === "O" ? "🔵" : "⚫"}</span>
//         <span style="font-size:10px; opacity:0.6;">${row.Note || ""}</span>
//     </div>
// </td>

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

    // 2. 차트 리사이즈 (가장 무거운 작업)
    if (window.chart) {
      const container = document.getElementById("chart-container");
      window.chart.resize(container.clientWidth, container.clientHeight);
    }
  });
});

document.addEventListener("mouseup", () => {
  isResizing = false;
  document.body.classList.remove("resizing-active"); // 🚨 효과 해제
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
});

// ⭐️ [신규 추가] 실시간 재정렬 & 경주마 애니메이션 함수
function applyRealtimeSort() {
  if (!currentSortCol || sortState === "") return;

  // 1. 값 기반 메모리 정렬 (500개 연산 - 초고속)
  currentTableData.sort((a, b) => {
    let valA = a[currentSortCol],
      valB = b[currentSortCol];
    if (
      ["Price", "Change_24h", "MarketCap", "Volume", "Change_Today"].includes(
        currentSortCol,
      )
    ) {
      valA = parseFloat(
        valA
          .toString()
          .replace(/,/g, "")
          .replace(/<[^>]*>?/gm, ""),
      );
      valB = parseFloat(
        valB
          .toString()
          .replace(/,/g, "")
          .replace(/<[^>]*>?/gm, ""),
      );
      valA = isNaN(valA) ? 0 : valA;
      valB = isNaN(valB) ? 0 : valB;
    } else {
      valA = valA.toString().toLowerCase();
      valB = valB.toString().toLowerCase();
    }
    const isAsc = sortState === "asc";
    if (valA < valB) return isAsc ? -1 : 1;
    if (valA > valB) return isAsc ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById("table-body");
  const topData = currentTableData.slice(0, currentRenderLimit);
  const topSymbols = new Set(topData.map((d) => d.Symbol || d.symbol));

  const existingRows = Array.from(tbody.children);
  const firstRects = new Map();

  // 🚀 [최적화 2] FLIP First: "화면에 보이는 놈들만" 위치 기억
  existingRows.forEach((row) => {
    const sym = row.dataset.sym;
    if (visibleSymbols.has(sym)) {
      firstRects.set(sym, row.getBoundingClientRect().top);
    }
  });

  // 🚀 [최적화 1] DOM 재활용 풀(Pool) 생성
  // 100등 밖으로 밀려난 패배자들의 DOM을 버리지 않고 모아둡니다.
  const recycleBin = [];
  existingRows.forEach((row) => {
    const sym = row.dataset.sym;
    if (!topSymbols.has(sym)) {
      recycleBin.push(row);
      // 재활용 대기열에 들어갔으니 일단 CCTV에서 뺌
      visibleSymbols.delete(sym);
    }
  });

  // 4. 새로운 승리자들 DOM 재배치 (재활용 적극 활용)
  topData.forEach((data, index) => {
    const sym = data.Symbol || data.symbol;
    let tr = tbody.querySelector(`tr[data-sym="${sym}"]`);

    // DOM이 없다면? (새로 진입한 코인)
    if (!tr) {
      if (recycleBin.length > 0) {
        tr = recycleBin.pop();
        if (tableObserver) tableObserver.unobserve(tr); // 1. 기존 감시 취소
        tr.dataset.sym = sym;
        updateRowInnerHTML(tr, data);
        if (tableObserver) tableObserver.observe(tr); // 2. 새 신분으로 감시 재시작 🚀
      } else {
        // 완전 초기 렌더링 시 빈 공간이 모자랄 때만 새로 생성
        tr = createRowElement(data);
      }
      tr.style.animation = "flash-up 1s ease-out"; // 떡상 이펙트
    }

    // 위치가 다르면 DOM 이동
    if (tbody.children[index] !== tr) {
      tbody.insertBefore(tr, tbody.children[index]);
    }
  });

  // 혹시 남은 잉여 DOM이 있다면 그때서야 파괴 (보통 발생 안 함)
  recycleBin.forEach((row) => {
    if (tableObserver) tableObserver.unobserve(row);
    row.remove();
  });

  // 🚀 [최적화 2] FLIP Last & Play: "화면에 보였던 놈들만" 부드럽게 이동
  const finalRows = Array.from(tbody.children);
  finalRows.forEach((row) => {
    const sym = row.dataset.sym;
    const firstY = firstRects.get(sym);

    // 안 보였던 놈(firstY 없음)은 좌표 연산 스킵!
    if (firstY !== undefined) {
      row.style.transition = "none";
      const lastY = row.getBoundingClientRect().top; // 여기서 Reflow 발생 (최소화됨)
      const deltaY = firstY - lastY;

      if (deltaY !== 0) {
        row.style.transform = `translateY(${deltaY}px)`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            row.style.transition =
              "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
            row.style.transform = "";
          });
        });
      }
    }
  });
  // 🚀 안전장치 장착 (스크롤 쪽이랑 똑같이!)
  if (typeof refreshSniperTarget === "function") {
    refreshSniperTarget();
  }
  applySelectedHighlight(); // 🚀 [추가] 순위 바뀌어도 내 코인은 빛나야지!
}

function applySelectedHighlight() {
  const selectedSymbol = currentSelectedSymbol; // 전역에 저장된 선택 심볼
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
    targetTr.style.outline = "2px solid var(--accent)"; // 68층 성주님의 골드 라인
    targetTr.style.outlineOffset = "-2px";
    targetTr.style.boxShadow = "inset 0 0 10px rgba(var(--accent-rgb), 0.3)";
    targetTr.style.zIndex = "10"; // 다른 행보다 위로
  }
}

// 💡 헬퍼 함수: 재활용한 껍데기에 알맹이만 채우는 함수 (기존 로직 분리)
function updateRowInnerHTML(tr, row) {
  const pureSymbol = (row.Ticker || "").replace("KRW", "").replace("USDT", "").toUpperCase();
  tr.dataset.sym = pureSymbol;
  const getCleanNum = (val) => {
    if (val === undefined || val === null) return 0;
    const clean =
      typeof val === "string"
        ? val
          .replace(/<[^>]*>?/gm, "")
          .replace("%", "")
          .trim()
        : val;
    return parseFloat(clean) || 0;
  };

  // console.log(`[유기적 체크] 티커: ${row.Ticker} | 최종 이름표: ${pureSymbol}`);

  const n24h = getCleanNum(row.Change_24h);
  const nDay = getCleanNum(row.Change_Today);
  const color24h =
    n24h > 0
      ? "text-theme-up"
      : n24h < 0
        ? "text-theme-down"
        : "text-theme-text";
  const colorDay =
    nDay > 0
      ? "text-theme-up"
      : nDay < 0
        ? "text-theme-down"
        : "text-theme-text";
  const formattedPrice = formatSmartPrice(Number(row.Price));
  // 🚀 핵심: 원화 가격이 데이터에 존재하면 " (911원)" 포맷으로 만들기
  const krwDisplay = row.Price_KRW
    ? `<span class="text-[12px] text-theme-text opacity-70 ml-1"> ( ${Number(row.Price_KRW).toLocaleString()} 원 )</span>`
    : "";
  // ⭐️ [추가] 로컬스토리지에서 즐겨찾기 상태 가져오기
  const favorites = JSON.parse(localStorage.getItem("sellnance_favs") || "[]");
  const isFav = favorites.includes(pureSymbol);

  tr.innerHTML = `
  <td class="p-4">
    <div class="flex items-center gap-2">
    <span class="star-btn ${isFav ? "active" : ""}" 
            onclick="toggleFavorite('${pureSymbol}', event)"
            style="cursor:pointer; font-size:16px; color: ${isFav ? "var(--accent)" : "gray"};">
        ${isFav ? "⭐" : "☆"}
      </span>
      ${row.Logo || ""}
      <div class="flex flex-col">
        <b class="text-sm text-theme-text">${row.Ticker}</b>
        <span class="text-[10px] text-theme-text opacity-60">${row.Name || ""}</span>
      </div>
    </div>
  </td>
  <td class="p-4">
    <div class="flex flex-col gap-0.5">
      <span id="price-${pureSymbol}" class="font-bold text-[14px] text-theme-text price-cell">
        $ ${formattedPrice} ${krwDisplay}
      </span>
      <div class="flex gap-2 text-[11px] font-mono mt-0.5">
        <span class="text-theme-text opacity-70">
          24h: <span id="change-${pureSymbol}" class="${color24h} font-bold">${n24h > 0 ? "+" : ""}${n24h.toFixed(2)}%</span>
        </span>
        <span class="text-theme-text opacity-70">
          Day: <span id="today-${pureSymbol}" class="${colorDay} font-bold">${nDay > 0 ? "+" : ""}${nDay.toFixed(2)}%</span>
        </span>
      </div>
    </div>
  </td>
  <td class="p-4">
    <div class="flex flex-col gap-0.5 text-theme-text">
      <span class="font-bold text-[13px] opacity-90">${row.Volume_Formatted || "-"}</span>
      <span class="text-[11px] opacity-50">M.Cap: ${row.MarketCap_Formatted}</span>
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
        if (currentRenderLimit < currentTableData.length) {
          isFetchingMore = true;
          loadingIndicator.style.display = "block";

          setTimeout(() => {
            // 1. 기존 개수 기억하고 한도 늘리기
            const oldLimit = currentRenderLimit;
            currentRenderLimit += RENDER_CHUNK;

            // 🚀 2. 핵심 최적화: 전체 정렬 대신, 딱 추가될 50개만 잘라서 밑에 붙입니다!
            const tbody = document.getElementById("table-body");
            const nextBatch = currentTableData.slice(
              oldLimit,
              currentRenderLimit,
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
          }, 200);
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
      }, 200); // 0.3초 멈춤 감지 (IP 밴 방어선)
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
    setTimeout(() => (btn.style.transform = "scale(1)"), 200);
  }
  localStorage.setItem("sellnance_favs", JSON.stringify(favorites));
}

// ⭐️ 이 코드가 있어야 웹페이지가 켜지자마자 데이터를 가져옵니다!
window.addEventListener("DOMContentLoaded", () => {
  loadTableData();
});
