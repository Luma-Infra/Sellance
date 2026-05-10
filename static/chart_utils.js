// chart_utils.js
import { store, tfSec, CONFIG } from "./store.js";

function resetChartScale() {
  if (!store.chart || !store.candleSeries) return;
  store.chart.timeScale().fitContent();
  store.chart.priceScale("right").applyOptions({ autoScale: true });
}

// ✅ 포맷팅 by precision
function formatSmartPrice(price, p) {
  try {
    if (price === 0) return (0).toFixed(p || 2);
    if (!price) return "";

    // 🚀 거래소가 준 precision 그대로 사용 (toLocaleString이 콤마도 찍어줌)
    return price.toLocaleString(undefined, {
      minimumFractionDigits: p,
      maximumFractionDigits: p,
    });
  } catch (error) {
    console.error("❌ formatSmartPrice 에러:", error.message);
    return String(price || "");
  }
}

// 🚀 달러/원화 거래대금 포맷팅 (실시간 소켓용)
export function formatVolumeDollar(vol) {
  if (!vol || isNaN(vol)) return "0";
  if (vol >= 1_000_000_000) return "$" + (vol / 1_000_000_000).toFixed(2) + "B";
  if (vol >= 1_000_000) return "$" + (vol / 1_000_000).toFixed(2) + "M";
  if (vol >= 1_000) return "$" + (vol / 1_000).toFixed(2) + "K";
  return "$" + vol.toFixed(2);
}

export function formatVolumeKRW(vol) {
  if (!vol || isNaN(vol)) return "0";
  if (vol >= 100_000_000) return (vol / 100_000_000).toFixed(0) + "억";
  if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(0) + "백만";
  if (vol >= 1_000) return (vol / 1_000).toFixed(0) + "천";
  return vol.toFixed(0);
}

function updateLegend(d, v, k) {
  const leg = document.getElementById("ohlc-legend");
  if (!leg || !d) return;

  // 🚀 p값 안전장치 (currentAsset이나 데이터가 없을 때 대비)
  const coin =
    typeof store.currentTableData !== "undefined"
      ? store.currentTableData.find(
          (c) => c.DisplayTicker === store.currentAsset,
        ) // 🚀 [수정]
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

  // 🚀 볼륨 전광판 포맷팅 및 색상 적용
  let volHtml = "";
  if (store.paneConfig.volume) {
    let volValue = "-";
    let volColor = "text-theme-text";
    if (v && v.value !== undefined) {
      volValue = window.formatVolumeDollar
        ? window.formatVolumeDollar(v.value)
        : v.value.toLocaleString();
      volColor = cls; // 캔들의 양봉/음봉 색상을 그대로 따라감
    }
    volHtml = `<span class="opacity-60 text-[11px] mr-1 border-l border-white/10 pl-3">Vol</span><span class="${volColor} font-bold mr-3">${volValue}</span>`;
  }

  // 🚀 김프 전광판 포맷팅 및 다이내믹 색상(getKimchiColor) 적용
  let kimHtml = "";
  if (store.paneConfig.kimchi) {
    let kimValue = "-";
    let kimColorStyle = "";
    if (k && k.value !== undefined) {
      kimValue = (k.value > 0 ? "+" : "") + k.value.toFixed(2) + "%";
      kimColorStyle = `color: ${k.color || "#57a4fc"}`; // 부여된 무지개색 100% 반영!
    }
    kimHtml = `<span class="opacity-60 text-[11px] mr-1 border-l border-white/10 pl-3">Kimchi</span><span style="${kimColorStyle}" class="font-bold">${kimValue}</span>`;
  }

  leg.innerHTML = `
    <span class="opacity-60 text-[11px] mr-1">시</span><span class="${cls} font-bold mr-3">${safeFormat(d.open, p)}</span>
    <span class="opacity-60 text-[11px] mr-1">고</span><span class="${cls} font-bold mr-3">${safeFormat(d.high, p)}</span>
    <span class="opacity-60 text-[11px] mr-1">저</span><span class="${cls} font-bold mr-3">${safeFormat(d.low, p)}</span>
    <span class="opacity-60 text-[11px] mr-1">종</span><span class="${cls} font-bold mr-3">${safeFormat(d.close, p)}</span>
    <span class="ml-2 px-1 py-0.5 ${cls} font-black bg-black/10 rounded mr-3">${sign}${safeFormat(chg, p)} (${sign}${chgPercent}%)</span>
    ${volHtml}
    ${kimHtml}
  `;
}

function updateStatus(d) {
  // 🚀 핵심: d(실시간 데이터)가 들어오면 그걸 최우선으로 쓴다!
  // d가 없으면(마우스 이벤트 등) 그때만 mainData에서 꺼내온다.
  const last =
    d ||
    (store.mainData.length ? store.mainData[store.mainData.length - 1] : null);

  if (!last) return;

  // console.log(d);
  // // 확인용

  // 가격 업데이트 (toLocaleString 대신 formatSmartPrice 추천!)
  const priceEl = document.getElementById("head-price");
  if (priceEl) {
    priceEl.innerText = formatSmartPrice(last.close);
  }

  // 거래량 업데이트
  // (이제 헤더의 거래량은 24시간 기준으로 api.js에서 고정 관리하므로 제거합니다)
  // const volEl = document.getElementById("head-volume");
  // if (volEl) {
  //   volEl.innerText = last.volume ? last.volume.toLocaleString() : "-";
  // }

  // 시뮬레이터 타겟 & 레전드 동시 갱신
  const targetEl = document.getElementById("head-target");
  if (targetEl && typeof getNext === "function") {
    targetEl.innerText = formatSmartPrice(getNext().close);
    targetEl.style.color =
      store.curDir === "bull" ? "var(--up)" : "var(--down)";
  }

  // 🚀 대망의 레전드 업데이트 (십자선 활성화 중일 때는 덮어쓰기 방어!)
  if (!store.isCrosshairActive) {
    const lastIdx = store.mainData.length ? store.mainData.length - 1 : -1;
    const v =
      store.volumeData && store.volumeData.length > 0
        ? store.volumeData[lastIdx]
        : null;
    const k =
      store.kimchiData && store.kimchiData.length > 0
        ? store.kimchiData[lastIdx]
        : null;
    updateLegend(last, v, k);
  }
}

function autoFit() {
  if (store.chart && store.mainData.length) {
    const len = store.mainData.length;

    // 🚨 [과거 유령 캔들 철벽 차단]
    // 상장된 지 얼마 안 된 코인(데이터가 100개 미만)일 때,
    // 인덱스가 음수로 떨어져 과거로 텅 빈 유령 공간이 강제로 생기는 현상을 막습니다.
    store.chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, len - 100), // 0 이하로 절대 못 내려가게 음수 방어!
      to: len + 10, // 우측 여백(미래)만 10칸 살짝 남김
    });

    store.chart.priceScale("right").applyOptions({ autoScale: true });
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

window.resetChartScale = resetChartScale;
window.formatSmartPrice = formatSmartPrice;
window.formatVolumeDollar = formatVolumeDollar;
window.formatVolumeKRW = formatVolumeKRW;
window.updateLegend = updateLegend;
window.updateStatus = updateStatus;
window.autoFit = autoFit;
