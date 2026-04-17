// chart_utils.js
function resetChartScale() {
  if (!chart || !candleSeries) return;
  chart.timeScale().fitContent();
  chart.priceScale("right").applyOptions({ autoScale: true });
}

function formatSmartPrice(price) {
  try {
    if (price === 0 || !price) return "0";

    const absPrice = Math.abs(price);

    // 1. 큰 금액 (100 이상) 처리
    if (absPrice >= 100) {
      return price.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    }

    // 2. 소수점 자릿수 계산 (범인 검거 구역)
    const logValue = Math.log10(absPrice);
    // logValue가 -Infinity(값이 너무 작을 때)인 경우 방어
    const firstSigDigit = isFinite(logValue) ? Math.floor(logValue) : -20;
    // 자릿수 결정 (기존 로직 유지하되 안전장치 추가)
    let precision = Math.min(8, Math.max(2, Math.abs(firstSigDigit) + 3));
    // 🚨 핵심: toLocaleString은 0~20까지만 안전함
    precision = Math.min(Math.max(precision, 0), 20);

    return price.toLocaleString(undefined, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  } catch (error) {
    // 🔥 에러 발생 시 범인(데이터)을 콘솔에 박제
    console.error("❌ formatSmartPrice 에러 발생!");
    console.error(`입력 데이터(price): ${price} (타입: ${typeof price})`);
    console.error(`에러 내용: ${error.message}`);

    // 시스템이 뻗지 않게 기본값 반환
    return String(price);
  }
}

function updateLegend(d) {
  const leg = document.getElementById("ohlc-legend");
  if (!leg) return;
  const cls = d.close >= d.open ? "text-theme-up" : "text-theme-down"; // Tailwind 대응
  const chg = (((d.close - d.open) / d.open) * 100).toFixed(2);
  const sign = chg > 0 ? "+" : "";
  leg.innerHTML = `
        <span class="opacity-50 text-[11px]">O</span> <span class="${cls} font-bold mr-2">${formatSmartPrice(d.open)}</span> 
        <span class="opacity-50 text-[11px]">H</span> <span class="${cls} font-bold mr-2">${formatSmartPrice(d.high)}</span> 
        <span class="opacity-50 text-[11px]">L</span> <span class="${cls} font-bold mr-2">${formatSmartPrice(d.low)}</span> 
        <span class="opacity-50 text-[11px]">C</span> <span class="${cls} font-bold">${formatSmartPrice(d.close)}</span> 
        <span class="${cls} font-black ml-2 bg-black/5 px-1.5 py-0.5 rounded">${sign}${chg}%</span>
    `;
}

function updateStatus(d) {
  // 🚀 1. 핵심: d(실시간 데이터)가 들어오면 그걸 최우선으로 쓴다!
  // d가 없으면(마우스 이벤트 등) 그때만 mainData에서 꺼내온다.
  const last = d || (mainData.length ? mainData[mainData.length - 1] : null);

  if (!last) return;

  // console.log(d);
  // // 확인용

  // 2. 가격 업데이트 (toLocaleString 대신 formatSmartPrice 추천!)
  const priceEl = document.getElementById("head-price");
  if (priceEl) {
    priceEl.innerText = formatSmartPrice(last.close);
  }

  // 3. 거래량 업데이트
  const volEl = document.getElementById("head-volume");
  if (volEl) {
    volEl.innerText = last.volume ? last.volume.toLocaleString() : "-";
  }

  // 4. 시뮬레이터 타겟 & 레전드 동시 갱신
  const targetEl = document.getElementById("head-target");
  if (targetEl && typeof getNext === "function") {
    targetEl.innerText = formatSmartPrice(getNext().close);
    targetEl.style.color = curDir === "bull" ? "var(--up)" : "var(--down)";
  }

  // 🚀 5. 대망의 레전드 업데이트
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
  // 🚨 내 PC 시간이 아니라, 파라미터로 받은 '웹소켓 서버 시간'을 기준으로 삼음
  const now = new Date(serverMs);
  let nextClose = 0;

  switch (tf) {
    case "1m":
      nextClose = Math.ceil(serverMs / 60000) * 60000;
      break;
    case "15m":
      nextClose = Math.ceil(serverMs / 900000) * 900000;
      break;
    case "1h":
      nextClose = Math.ceil(serverMs / 3600000) * 3600000;
      break;
    case "4h":
      const hours = now.getUTCHours();
      const next4h = Math.ceil((hours + 0.1) / 4) * 4;
      nextClose = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        next4h,
        0,
        0,
      );
      break;
    case "1d":
      nextClose = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0,
      );
      break;
    default:
      return "";
  }

  const diff = Math.max(0, nextClose - serverMs);
  if (diff === 0) return "00:00";

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  if (h > 0)
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

