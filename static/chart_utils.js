import { store, tfSec, CONFIG } from "./_store.js";

// ⚙️ 시간 변환 통합 헬퍼
export const getUnixSeconds = (t) => {
  if (typeof t === "object" && t !== null) {
    // 🚀 [UTC 고정] t.year, t.month, t.day를 절대적인 UTC 0시로 변환
    return Date.UTC(t.year, t.month - 1, t.day) / 1000;
  }
  if (typeof t === "string") {
    // 🚀 [UTC 고정] 문자열 뒤에 Z를 붙이거나 T00:00:00Z를 강제하여 UTC로 파싱
    if (!t.includes("T") && !t.includes("Z")) {
      return Date.parse(t + "T00:00:00Z") / 1000;
    }
    return Date.parse(t) / 1000;
  }
  return t; // 이미 숫자(타임스탬프)인 경우 그대로 반환
};
window.getUnixSeconds = getUnixSeconds;

function resetChartScale() {
  if (!store.chart || !store.candleSeries) return;
  store.chart.timeScale().fitContent();
  store.chart.priceScale("right").applyOptions({ autoScale: true });
  
  if (store.chartVol) {
    store.chartVol.timeScale().fitContent();
    store.chartVol.priceScale("right").applyOptions({ autoScale: true });
    store.chartVol.priceScale("left").applyOptions({ autoScale: true });
  }

  // 🚀 더블클릭 등으로 스케일 리셋 시, 늘어나있던 Y축 여백도 함께 리셋!
  if (typeof window.resetPriceScaleWidthSync === "function") {
    window.resetPriceScaleWidthSync();
  }
}

// ✅ 포맷팅 by precision
export function formatSmartPrice(price, p) {
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

// 🚀 크로스헤어 전용 가격표 포맷팅 (플마 퍼센트 및 가격차이 표시)
export function formatCrosshairPrice(price, p, isLeftScale = false) {
  if (!isLeftScale) {
    return formatSmartPrice(price, p);
  }

  if (store.crosshairLeftPrice !== null && store.crosshairLeftPrice !== undefined && store.mainData && store.mainData.length > 0) {
    const minMove = p > 0 ? 1 / Math.pow(10, p) : 1;
    // 좌측 스케일 십자선 가격(crosshairLeftPrice)과 일치하는지 확인
    if (Math.abs(price - store.crosshairLeftPrice) < minMove * 0.51) {
      // 실제 계산은 우측 캔들의 정확한 십자선 가격(store.crosshairPrice)을 기준으로 수행!
      const targetPrice = store.crosshairPrice !== null ? store.crosshairPrice : price;
      const currentPrice = store.mainData[store.mainData.length - 1].close;
      if (currentPrice && currentPrice > 0) {
        const diff = targetPrice - currentPrice;
        const pct = (diff / currentPrice) * 100;
        return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
      }
    }
  }
  return ""; // 좌측 스케일의 평소 눈금 라벨은 깔끔하게 투명 처리!
}
window.formatCrosshairPrice = formatCrosshairPrice;

// 🚀 달러/원화 거래대금 포맷팅 (실시간 소켓용)
export function formatVolumeDollar(vol) {
  if (!vol || isNaN(vol)) return "0";
  if (vol >= 1_000_000_000) return (vol / 1_000_000_000).toFixed(2) + " B";
  if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(2) + " M";
  if (vol >= 1_000) return (vol / 1_000).toFixed(2) + " K";
  return vol.toFixed(2);
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

  // 🚀 [수정] 단일 진실 공급원(Single Source of Truth)인 store.getPrecision 사용! (O(1) 초광속 참조)
  const p = store.getPrecision(store.currentAsset);

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

function updateStatus(d, p) {
  // 🚀 핵심: d(실시간 데이터)가 들어오면 그걸 최우선으로 쓴다!
  // d가 없으면(마우스 이벤트 등) 그때만 mainData에서 꺼내온다.
  const last =
    d ||
    (store.mainData.length ? store.mainData[store.mainData.length - 1] : null);

  if (!last) return;

  // 🚀 [수정] 정밀도(p)가 있으면 사용하고, 없으면 단일 진실 공급원인 store.getPrecision에서 가져옴!
  const precision = p !== undefined ? p : store.getPrecision(store.currentAsset);

  // 가격 업데이트
  const priceEl = document.getElementById("head-price");
  if (priceEl) {
    priceEl.innerText = formatSmartPrice(last.close, precision);
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
window.calculateTimeRemaining = calculateTimeRemaining; // 🚀 이거 빠져있었음!

// 🚀 [추가] 백엔드 정규식 이식: 1000XEC, 1MBABYDOGE 등 단위 배수 추출기
export function getMultiplier(sym) {
  if (!sym) return 1;
  const match = sym.match(/^(10+|1[MB])(?=[A-Z])/i);
  if (!match) return 1;
  const p = match[1].toUpperCase();
  if (p === "1M") return 1000000;
  if (p === "1B") return 1000000000;
  return parseInt(p, 10);
}

// 🚀 [추가] 순수 코인명(Base Asset) 추출기 (1000XEC -> XEC)
export function getPureBase(sym) {
  if (!sym) return "";
  return sym.replace(/^(10+|1[MB])(?=[A-Z])/i, "").toUpperCase();
}

// ================== chart.js에서 이동됨 ==================
// 🚀 김프 다채로운 색상 적용 엔진
window.getKimchiColor = function (val) {
  if (val < -4) return "#4B0082"; // 인디고
  if (val < -2) return "#1E3A8A"; // 딥 블루
  if (val < 0) return "#2E8B57"; // 씨그린
  if (val < 2) return "#57a4fc"; // 하늘색
  if (val < 4) return "#FF69B4"; // 핫핑크
  if (val < 6) return "#B22222"; // 파이어브릭
  if (val < 8) return "#FF4500"; // 오렌지레드
  return "#8B0000"; // 다크레드
};

export function toggleCountdown(isChecked) {
  store.showCountdown = isChecked;
  const knob = document.getElementById("countdown-knob");

  if (isChecked) {
    knob.style.transform = "translateX(10px)";
    knob.parentElement.classList.add("bg-theme-accent");
  } else {
    knob.style.transform = "translateX(0)";
    knob.parentElement.classList.remove("bg-theme-accent");
    if (store.countdownOverlay) store.countdownOverlay.style.display = "none";
  }
}

export function updateRealtimeCountdown(serverMs) {
  if (!store.candleSeries || store.mainData.length === 0) {
    if (store.countdownPriceLine) {
      store.candleSeries.removePriceLine(store.countdownPriceLine);
      store.countdownPriceLine = null;
    }
    return;
  }

  let displayTime = "Wait...";
  if (serverMs && serverMs > 0) {
    if (!store.localTimeAtUpdate) {
      store.localTimeAtUpdate = performance.now();
    }

    const interpolatedMs =
      store.lastServerMs + (performance.now() - store.localTimeAtUpdate);

    const secondsPerBar = tfSec[store.currentTF] || 60;
    const lastCandleTime = store.mainData[store.mainData.length - 1].time;
    const nextBarTimeMs = (lastCandleTime + secondsPerBar) * 1000;

    if (interpolatedMs >= nextBarTimeMs) {
      displayTime = "00:00";
    } else {
      if (typeof window.calculateTimeRemaining === "function") {
        displayTime = window.calculateTimeRemaining(
          store.currentTF,
          interpolatedMs,
        );
      }
    }
  }

  const lastCandle = store.mainData[store.mainData.length - 1];
  const isDown = lastCandle.close < lastCandle.open;
  const style = getComputedStyle(document.body);
  const varName = isDown ? "--down" : "--up";
  const rawColor =
    style.getPropertyValue(varName).trim() || (isDown ? "#ef5350" : "#26a69a");

  const lineOptions = {
    price: lastCandle.close,
    color: rawColor, // 🚀 투명색 대신 현재 양봉/음봉 색상 사용 (이게 없어서 안 보였음)
    lineWidth: 1,
    lineStyle: window.LightweightCharts ? window.LightweightCharts.LineStyle.Dashed : 2, // 🚀 점선(Dashed)으로 차별화
    axisLabelVisible: true,
    title: store.showCountdown ? `${displayTime}` : "",
    axisLabelColor: rawColor,
    axisLabelTextColor: "#ffffff",
  };

  if (!store.countdownPriceLine) {
    store.countdownPriceLine = store.candleSeries.createPriceLine(lineOptions);
  } else {
    store.countdownPriceLine.applyOptions(lineOptions);
  }
}

window.toggleCountdown = toggleCountdown;
window.updateRealtimeCountdown = updateRealtimeCountdown;

setInterval(() => {
  if (store.lastServerMs > 0) {
    updateRealtimeCountdown(store.lastServerMs);
  }
}, 50);
