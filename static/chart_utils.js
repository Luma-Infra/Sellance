// chart_utils.js
function resetChartScale() {
  if (!chart || !candleSeries) return;
  chart.timeScale().fitContent();
  chart.priceScale("right").applyOptions({ autoScale: true });
}

// ✅ 포맷팅 by precision
function formatSmartPrice(price, p) {
  try {
    if (price === 0 || !price) return;

    // 🚀 거래소가 준 precision 그대로 사용 (toLocaleString이 콤마도 찍어줌)
    return price.toLocaleString(undefined, {
      minimumFractionDigits: p,
      maximumFractionDigits: p,
    });
  } catch (error) {
    console.error("❌ formatSmartPrice 에러:", error.message);
    return String(price);
  }
}

function updateLegend(d) {
  const leg = document.getElementById("ohlc-legend");
  if (!leg || !d) return;

  // 🚀 p값 안전장치 (currentAsset이나 데이터가 없을 때 대비)
  const coin =
    typeof currentTableData !== "undefined"
      ? currentTableData.find((c) => c.Symbol === currentAsset)
      : null;
  const p = coin?.precision ?? 2;

  // 🚀 0일 때를 위한 삼항 연산자 (보합색 추가)
  const cls =
    d.close > d.open
      ? "text-theme-up"
      : d.close < d.open
        ? "text-theme-down"
        : "text-theme-text opacity-70";
  const chg = d.close - d.open;

  // 🚀 분모 0 방지 및 chg가 0일 때 직접 처리
  const chgPercent =
    d.open && d.open !== 0 ? ((chg / d.open) * 100).toFixed(2) : "0.00";
  const sign = chg > 0 ? "+" : "";

  // 🚀 formatSmartPrice에 0이 들어가도 안 죽게 안전하게 호출
  const safeFormat = (val, precision) => {
    if (val === 0) return (0).toFixed(precision); // 0이면 그냥 0.00... 출력
    return formatSmartPrice(val, precision);
  };

  leg.innerHTML = `
    <span class="opacity-60 text-[11px] mr-1">시</span><span class="${cls} font-bold mr-3">${safeFormat(d.open, p)}</span>
    <span class="opacity-60 text-[11px] mr-1">고</span><span class="${cls} font-bold mr-3">${safeFormat(d.high, p)}</span>
    <span class="opacity-60 text-[11px] mr-1">저</span><span class="${cls} font-bold mr-3">${safeFormat(d.low, p)}</span>
    <span class="opacity-60 text-[11px] mr-1">종</span><span class="${cls} font-bold mr-3">${safeFormat(d.close, p)}</span>
    <span class="ml-2 px-1 py-0.5 ${cls} font-black bg-black/10 rounded ">${sign}${safeFormat(chg, p)}</span>
    <span class="${cls} font-black ml-1">(${sign}${chgPercent}%)</span>
  `;
}

function updateStatus(d) {
  // 🚀 핵심: d(실시간 데이터)가 들어오면 그걸 최우선으로 쓴다!
  // d가 없으면(마우스 이벤트 등) 그때만 mainData에서 꺼내온다.
  const last = d || (mainData.length ? mainData[mainData.length - 1] : null);

  if (!last) return;

  // console.log(d);
  // // 확인용

  // 가격 업데이트 (toLocaleString 대신 formatSmartPrice 추천!)
  const priceEl = document.getElementById("head-price");
  if (priceEl) {
    priceEl.innerText = formatSmartPrice(last.close);
  }

  // 거래량 업데이트
  const volEl = document.getElementById("head-volume");
  if (volEl) {
    volEl.innerText = last.volume ? last.volume.toLocaleString() : "-";
  }

  // 시뮬레이터 타겟 & 레전드 동시 갱신
  const targetEl = document.getElementById("head-target");
  if (targetEl && typeof getNext === "function") {
    targetEl.innerText = formatSmartPrice(getNext().close);
    targetEl.style.color = curDir === "bull" ? "var(--up)" : "var(--down)";
  }

  // 🚀 대망의 레전드 업데이트
  updateLegend(last);
}

function autoFit() {
  if (chart && mainData.length) {
    const len = mainData.length;

    // 🚨 핵심 패치: 캔들을 화면 중간쯤에 오도록 '보이는 범위'를 강제 조절합니다.
    // from: 과거 100개 캔들 전부터 보여줌 (줌 레벨 조절)
    // to: 현재 캔들 이후로 '50개' 분량의 빈 도화지(우측 여백)를 미리 깔아둠
    chart.timeScale().setVisibleLogicalRange({
      from: len - 100,
      to: len + 20, // 👈 이 숫자를 키우면 캔들이 더 왼쪽(가운데)으로 밀려납니다.
    });

    chart.priceScale("right").applyOptions({ autoScale: true });
  }
}

// _main.js 에서 기존 함수를 이걸로 교체
function calculateTimeRemaining(tf, serverMs) {
  const now = new Date(serverMs);
  let nextClose;

  if (tfSec[tf] && tfSec[tf] <= 43200) {
    const ms = tfSec[tf] * 1000;

    // 🚨 0.1초 오차 방지를 위해 1ms 더해서 올림 처리
    nextClose = Math.ceil((serverMs + 1) / ms) * ms;
  }
  // 2. 날짜 단위 계산이 필요한 봉들 (하루 ~ 1년)
  else {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const date = now.getUTCDate();

    switch (tf) {
      case "1d":
        nextClose = Date.UTC(year, month, date + 1);
        break;
      case "3d":
        // 상장일 기준이 아니라 UTC 0시 기준 3일씩 끊기 (바이낸스 방식)
        const dayDiff =
          Math.ceil((serverMs + 1) / (86400000 * 3)) * (86400000 * 3);
        nextClose = dayDiff;
        break;
      case "1w":
        // 다음주 월요일 00:00 UTC (일요일 23:59:59 마감)
        const dayOfWeek = now.getUTCDay(); // 0(일)~6(토)
        const diffToMon = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
        nextClose = Date.UTC(year, month, date + diffToMon);
        break;
      case "1M":
        nextClose = Date.UTC(year, month + 1, 1);
        break;
      case "1y":
        nextClose = Date.UTC(year + 1, 0, 1);
        break;
      default:
        return "";
    }
  }

  // 3. 남은 시간 계산 및 포맷팅
  const diff = Math.max(0, nextClose - serverMs);
  if (diff <= 0) return "00:00";

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  // 포맷팅은 그냥 일:시:분:초 스타일로 보여주기
  const dd = d > 0 ? `${d}d ` : "";
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");

  if (d > 0) return `${dd}${hh}h`;
  return h > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}
