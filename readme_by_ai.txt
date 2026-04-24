=== [1] PROJECT STRUCTURE ===

폴더 PATH의 목록입니다.
볼륨 일련 번호는 12AE-6CCB입니다.
C:.
|   .env
|   config.py
|   context_for_ai.txt
|   LICENSE
|   mapping.json
|   promptAI.txt
|   README.md
|   requirements.txt
|   start.bat
|   wrangler.jsonc
|   
+---.vscode
|       settings.json
|       
+---modules
|   |   api_manager.py
|   |   app.py
|   |   get_market.py
|   |   
|           api_manager.cpython-313.pyc
|           app.cpython-313.pyc
|           
+---static
|       api.js
|       chart_utils.js
|       sim_engine.js
|       stream.js
|       streamEach.js
|       table.js
|       ui_control.js
|       z_style.css
|       _config.js
|       _main.js
|       
+---templates
|       index.html
|       
        config.cpython-313.pyc
        



=== [2] PYTHON CORE LOGIC ===

--- File: config.py ---

# config.py
def get_cmc_api_key():
    # 1. 🚀 배포 환경(Railway 등) 변수부터 확인 (최우선)
    # 2. 🏠 로컬 환경: .env 파일 확인
    # 3. ⌨️ 둘 다 없으면 로컬 최초 실행으로 간주하고 입력 받기
    # 단, 서버(배포) 환경이 아닐 때만 실행되도록 안전장치
    if not os.environ.get("RAILWAY_STATIC_URL"): # Railway 환경이 아닐 때만
# 전역 변수로 할당 (다른 모듈에서 config.CMC_API_KEY 로 호출)
# UI/차트 테마 설정



--- File: api_manager.py ---

import json # ⭐️ 상단에 json 임포트 추가
# --- ⭐️ GLOBAL CACHE SETTINGS ⭐️ ---
CACHE_TIMEOUT_SECONDS = 3600 # 1시간
# --- ⭐️ LOAD MAPPING CONFIG ⭐️ ---
# (기존 하드코딩 딕셔너리들 싹 지우고 아래 코드로 대체)
# --- ⭐️ FORMATTING FUNCTIONS ⭐️ ---
def format_market_cap_string(mc):
def format_volume_string(vol):
# --- ⭐️ UX SETTINGS ⭐️ ---
PRICE_HIGH_THRESHOLD = 100  # 100달러 이상은 고가 자산으로 분류
def format_dynamic_price(price):
    # 1. 고가주 케이스 (100달러 이상: 60000.1, 1000.2, 100.2)
    # 소수점 1자리로 고정하여 가독성 극대화
    # 2. 중저가주 & 동전주 케이스 (유효숫자 4자리 확보 로직)
        # 로그를 이용해 소수점 아래 첫 유효숫자 위치 계산
        # 예: 0.001222 -> log10은 -2.91 -> floor는 -3
        # 정밀도 계산: 첫 유효숫자 위치(절대값) + 추가 3자리 = 총 유효숫자 4자리
        # 예: 0.001222 (first_sig -3) -> precision 3 + 3 = 6자리 -> "0.001222"
        # 예: 45.6 (first_sig 1) -> precision |-1| + 3 = 4자리(?) -> 아래 max에서 보정
        # 🚨 개선 포인트 1: 10~99달러 구간 (45.60 등) 보정
        # 유효숫자 4개를 위해 최소 2자리는 보여줘야 함
        # 🚨 개선 포인트 2: 극단적 동전주 제한 (최대 10자리)
        # 소수점이 너무 길어지면 레이아웃 깨짐 방지
        # 숫자가 너무 작아 로그 계산이 안 될 경우 기본값
# ✅ [수정 후] 테마를 지원하는 클린 포맷터
def format_change(percent):
    # 🚀 하드코딩 색상 빼고 테마 클래스로 변경!
    theme_class = "text-theme-up" if percent > 0 else "text-theme-down" if percent < 0 else "text-theme-text opacity-50"
    # 🚀 인라인 스타일(font-weight) 대신 Tailwind 클래스로 통일
    weight_class = "font-bold" if abs(percent) >= 5.0 else "font-normal"
    # style="..." 은 완전히 삭제하고 class="..." 만 넘겨줍니다.
def create_image_tag(url):
def get_pure_base_asset(ticker):
    # 1. Quote(결제자산)를 뒤에서부터 안전하게 제거
    # USDT, KRW 외에 다른 마켓이 추가되어도 대응 가능하도록 리스트화
    # 2. 정규식으로 배율과 순수 심볼 분리
    # ^(10+|1[MB])? : 시작부분의 10, 100, 1M, 1B 등을 그룹1로 캡처
    # (?P<symbol>.+) : 나머지를 전부 'symbol' 그룹으로 캡처
def is_scaled_symbol(symbol):
def suppress_output():
def _fetch_cmc_api_chunk(task):
def get_korean_exchange_markets():
        print(f"🚨 [디버그] 업비트 마켓 목록 에러: {e}") # 👈 pass 대신 추가!
        print(f"🚨 [디버그] 빗썸 마켓 목록 에러: {e}") # 👈 pass 대신 추가!
def is_valid_ticker(ticker):
    # ^[A-Z0-9]+$ : 시작부터 끝까지 영어 대문자와 숫자로만 이루어져야 함
# (파일 상단의 임포트와 글로벌 설정, format 함수들은 그대로 두시면 됩니다!)
def _fetch_binance_open(symbol):
        print(f"🚨 [디버그] 바이낸스 API 에러: {e}") # 👈 pass 대신 이걸 넣으세요!
# ==========================================
# 🧱 모듈 1: 거래소 시세 수집기 (Binance & Upbit)
# ==========================================
def fetch_exchange_market_data():
        # 바이낸스 9시 시가 병렬 수집
        print(f"🚨 fetch_exchange_market_data 에러: {e}") # 👈 pass 대신 이걸 넣으세요!
        # 🚨 업비트 API 길이 제한 방어: 100개씩 쪼개서 요청 (0달러 오류 해결)
                        'change_24h': item.get('signed_change_rate', 0.0) * 100 # 아까 고친 24h 변동률!
# ==========================================
# 🧱 모듈 2: 코인마켓캡(CMC) 정보 수집기
# ==========================================
def fetch_cmc_market_data(binance_data, upbit_only_assets):
# ==========================================
# 🧱 모듈 3: 데이터 조립 및 변동률 계산기
# ==========================================
# ==========================================
# 🧱 모듈 3: 데이터 조립 및 변동률 계산기 (완전 교체본)
# ==========================================
def build_final_market_list(binance_data, upbit_data, market_data_map, asset_to_lookup_key, upbit_krw_set, upbit_only_assets):
    # MAJOR_COINS = {'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'SUI'}
    # 🚀 1. 실시간 테더 환율 가져오기 (두나무 api 에러 방지)
    # ---------------------------------------------------------
    # 1. 바이낸스 선물 조립
    # ---------------------------------------------------------
    # --- 1. 바이낸스 선물 조립 루프 내부 ---
        # [수정 1] 정규식 돌리기 전에 "원본 티커(숫자포함)"를 먼저 보관!
        # [수정 2] 이름은 정규식으로 예쁘게 깎기 (화면 표시용)
        # [수정 3] 맵핑 조회는 "원본 티커"가 있으면 그걸 우선, 없으면 깎인 이름으로!
        # [수정 4] 이제 조회할 때 lookup_key를 사용!
        # [수정 5] CMC 데이터 맵에서 가져올 때도 lookup_key 사용!
        info = market_data_map.get(asset_to_lookup_key.get(lookup_key))# --- 바이낸스 루프 긴급 수정본 ---
        # 1. 원본 티커 (예: 1000000BOB)
        # 2. 예쁘게 깎은 이름 (예: BOB)
        # 3. ⭐️ 맵핑 데이터 확인 (철벽 방어)
            lookup_key = base_display # 맵핑 없으면 그냥 깎은 이름으로!
        # 4. ⭐️ 여기서 에러 났을 확률 높음! 안전하게 조회
            # 맵핑에 없으면 그냥 통과하거나 예전 방식(base_display)으로 한 번 더 시도
        # [이하 로직은 기존과 동일... 하지만 info가 없을 때를 대비해야 함]
        if not info: continue # 👈 데이터 없으면 그냥 다음 코인으로! (목록 증발 방지)
        # mcap = 0
                # if base in MAJOR_COINS or diff <= PRICE_DIFFERENCE_THRESHOLD:
                #     mcap = info.get('market_cap', 0)
                # else:
                #     continue
    # ---------------------------------------------------------
    # 2. 업비트 전용 조립 (🚨 철벽 방어 적용 완료)
    # ---------------------------------------------------------
        # 🚀 [철벽 방어] 모든 변수를 안전한 실수형(float) 0.0으로 선언하고 시작
            # 데이터가 None일 경우를 대비해 'or 0.0' 처리
            "Price_KRW": up_price_krw if up_price_krw > 0 else None, # JS에서 원화 표기용
# ==========================================
# 👑 최종 함수 BOSS
# ==========================================
def _fetch_and_process_data():
    # 1. 시세 수집
    # 2. 정보 수집 (CMC)
    # 3. 조립 및 계산
    # 4. JSON 덮어쓰기 (새 체인 발견 시)
    # 5. 시총 정렬 후 반환
def get_cached_data(force_reload=False):
    with data_lock: # 👈 여기서 딱 한 명만 진입 가능! 나머지는 줄 서서 기다림
                # with suppress_output():



--- File: app.py ---

# app.py
import requests  # ⭐️ 추가됨!
import config    # ⭐️ 추가됨!
# 윈도우 터미널 인코딩 문제를 해결하기 위해 표준 출력을 utf-8로 강제 설정
    allow_origins=["*"],      # 🚀 모든 도메인(폰 포함) 허용!
    allow_methods=["*"],      # 🚀 GET, POST 등 모든 방식 허용!
    allow_headers=["*"],      # 🚀 모든 헤더 허용!
async def home(request: Request):
    # 뼈대만 렌더링하고 데이터는 AJAX로 그림
# ⭐️ async 삭제됨!
def get_market_data(force: bool = False):
# ⭐️ async 삭제됨!
def get_market_map():
# ⭐️ async 삭제됨!
def get_coin_info(asset: str):
        # api_manager.py의 캐시 데이터를 가져옵니다 (force=False 이므로 API 새로 안 찌름)
        # 캐시된 400개 리스트 중에서 내가 클릭한 코인을 찾습니다
        # 캐시에 없으면 (신규 상장 등)
def get_proxy_candles(exchange: str, symbol: str, interval: str, limit: int = 200):
            # 업비트 요청
            # 바이낸스 선물 요청
            # 바이낸스 현물 요청
def open_browser():
def on_startup():
    # ⭐️ 데이터 긁어오기 (이건 배포든 로컬이든 필수!)
    # 🚀 로컬(127.0.0.1) 환경이고, 아직 브라우저 안 열었을 때만 실행
    # Railway 같은 곳에서는 이 환경변수가 없으므로 브라우저를 열지 않습니다.



--- File: get_market.py ---

# modules/data_engine.py
def get_market_status():



=== [3] JAVASCRIPT CORE LOGIC ===

--- File: api.js ---

// --- 📡 API Fetch 로직 ---
// app.js
async function loadSymbols() {
    const res = await fetch("/api/market-map");
function searchSymbols(v) {
  const resDiv = document.getElementById("search-results");
  const filtered = allSymbols
async function selectSymbol(s) {
  const symInput = document.getElementById("symbol-input");
  const searchRes = document.getElementById("search-results");
  const headAssetName = document.getElementById("head-asset-name");
    const el = document.getElementById(id);
  const badgeContainer = document.getElementById("exchange-badges");
    const infoRes = await fetch(`/api/coin-info/${s}`);
    const infoData = await infoRes.json();
    // if (headMcap) headMcap.innerText = infoData.market_cap;
    // if (headMcap) headMcap.innerText = "조회 실패";
async function fetchHistory(symbol, rawTicker) {
  // 🚨 1. 광클 철벽 방어 (1.5초 이내 재요청 무시하여 429 에러 방지)
  const now = Date.now();
  const pureSymbol = symbol.replace(/USDT$/i, "").toUpperCase();
  const isUpbitOnly = (marketDataMap.upbit || []).includes(pureSymbol);
  const binanceTicker = rawTicker || `${pureSymbol}USDT`;
  const upbitTicker = rawTicker || `KRW-${pureSymbol}`;
  const loadingModal = document.getElementById("chart-loading-modal");
  const isFutures = !isUpbitOnly && (marketDataMap.futures || []).includes(pureSymbol);
  const isSpot = !isUpbitOnly && (marketDataMap.spot || []).includes(pureSymbol);
    // 🚀 2. 직접 외부로 안 나가고 내 파이썬 서버(/api/candles)로 요청!
      const exchange = isFutures ? "binance_futures" : "binance_spot";
      // 내부 API 호출
      const res = await fetch(`/api/candles?exchange=${exchange}&symbol=${binanceTicker}&interval=${currentTF}&limit=500`);
      const tfMap = { "1m": 1, "15m": 15, "1h": 60, "4h": 240, "1d": "days", "1w": "weeks", "1M": "months" };
      const tfValue = tfMap[currentTF] || 60;
      // 내부 API 호출
      const res = await fetch(`/api/candles?exchange=upbit&symbol=${upbitTicker}&interval=${upbitInterval}&limit=200`);
          const ts = Math.floor(Date.parse(d.candle_date_time_utc + "Z") / 1000);
    // 3. 차트 그리기



--- File: chart_utils.js ---

// chart_utils.js
function resetChartScale() {
function formatSmartPrice(price) {
    const absPrice = Math.abs(price);
    // 1. 큰 금액 (100 이상) 처리
    // 2. 소수점 자릿수 계산 (범인 검거 구역)
    const logValue = Math.log10(absPrice);
    // logValue가 -Infinity(값이 너무 작을 때)인 경우 방어
    const firstSigDigit = isFinite(logValue) ? Math.floor(logValue) : -20;
    // 자릿수 결정 (기존 로직 유지하되 안전장치 추가)
    // 🚨 핵심: toLocaleString은 0~20까지만 안전함
    // 🔥 에러 발생 시 범인(데이터)을 콘솔에 박제
    // 시스템이 뻗지 않게 기본값 반환
function updateLegend(d) {
  const leg = document.getElementById("ohlc-legend");
  const cls = d.close >= d.open ? "text-theme-up" : "text-theme-down"; // Tailwind 대응
  const chg = (((d.close - d.open) / d.open) * 100).toFixed(2);
  const sign = chg > 0 ? "+" : "";
function updateStatus(d) {
  // 🚀 1. 핵심: d(실시간 데이터)가 들어오면 그걸 최우선으로 쓴다!
  // d가 없으면(마우스 이벤트 등) 그때만 mainData에서 꺼내온다.
  const last = d || (mainData.length ? mainData[mainData.length - 1] : null);
  // console.log(d);
  // // 확인용
  // 2. 가격 업데이트 (toLocaleString 대신 formatSmartPrice 추천!)
  const priceEl = document.getElementById("head-price");
  // 3. 거래량 업데이트
  const volEl = document.getElementById("head-volume");
  // 4. 시뮬레이터 타겟 & 레전드 동시 갱신
  const targetEl = document.getElementById("head-target");
  // 🚀 5. 대망의 레전드 업데이트
function autoFit() {
    const len = mainData.length;
    // 🚨 핵심 패치: 캔들을 화면 중간쯤에 오도록 '보이는 범위'를 강제 조절합니다.
    // from: 과거 100개 캔들 전부터 보여줌 (줌 레벨 조절)
    // to: 현재 캔들 이후로 '50개' 분량의 빈 도화지(우측 여백)를 미리 깔아둠
      to: len + 20, // 👈 이 숫자를 키우면 캔들이 더 왼쪽(가운데)으로 밀려납니다.
// _main.js 에서 기존 함수를 이걸로 교체
function calculateTimeRemaining(tf, serverMs) {
  // 🚨 내 PC 시간이 아니라, 파라미터로 받은 '웹소켓 서버 시간'을 기준으로 삼음
  const now = new Date(serverMs);
      const hours = now.getUTCHours();
      const next4h = Math.ceil((hours + 0.1) / 4) * 4;
  const diff = Math.max(0, nextClose - serverMs);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);



--- File: sim_engine.js ---

// --- 🎮 시뮬레이터 수학 & 로직 ---
// sim_engine.js
function changeDir(d) {
    const bodyInput = document.getElementById('input-body');
    const slider = document.getElementById('dir-slider');
    const btnBull = document.getElementById('dir-bull');
    const btnBear = document.getElementById('dir-bear');
    const btnGen = document.getElementById('btn-generate');
function addCandle() {
    const n = getNext();
function undoLast() {
        const lastCandle = mainData[mainData.length - 1];
function getNext() {
    const last = mainData[mainData.length - 1];
    const o = last.close;
    const t = parseFloat(document.getElementById('input-top').value) / 100;
    const bt = parseFloat(document.getElementById('input-bottom').value) / 100;
    const c = curDir === 'bull' ? o * (1 + b) : o * (1 - b);
    const highLimit = Math.max(o, c);
    const lowLimit = Math.min(o, c);
    const nextTime = last.time + (tfSec[currentTF] || 86400);



--- File: stream.js ---

// --- 🌊 실시간 웹소켓 엔진 ---
// stream.js
function startRealtimeCandle(symbol, interval, isFutures, isSpot) {
    // 🚀 연결 막기
    // 연결 종료
    // 메모리 정리
  // 🚀 [추가] update()를 대체할 궁극의 실시간 덮어쓰기 함수
  const renderWithGhosts = () => {
    // 앞서 만든 헬퍼 함수 활용 (initChart 밖에 선언해두면 좋습니다)
    const lastTime = getUnixSeconds(mainData[mainData.length - 1].time);
    const interval =
    // 🚀 전역 변수 CHART_CONFIG.GHOST_COUNT 적용!
    const ghostData = Array.from(
    // stream.js 내부 renderWithGhosts 함수 하단
      const lastPrice = mainData[mainData.length - 1].close;
      // JS에 있는 formatSmartPrice 함수 소환!
      const displayPrice = formatSmartPrice(lastPrice);
      // 탭 제목 0.1초 컷 업데이트 🚀
  // binance
    const binanceTicker = `${symbol}USDT`;
    const wsBase = isFutures
      const res = JSON.parse(e.data);
      const k = res.k;
      const serverMs = res.E;
      const liveData = {
        const lastIdx = mainData.length - 1;
      // 🚀 카운트다운을 웹소켓 서버 시간에 종속시킴
      // 🚨 기존 candleSeries.update(liveData); 삭제하고 아래 함수로 교체!
    // upbit
    const upbitTicker = `KRW-${symbol}`;
      const msg = [
    currentWs.onmessage = async (e) => {
      const text = await e.data.text();
      const res = JSON.parse(text);
      const serverMs = res.timestamp; // 🚨 업비트가 보내준 현재 서버 시간
        const d = new Date(res.timestamp);
        const candleStartTime = Math.floor(d.getTime() / 1000);
        const liveData = {
        const lastIdx = mainData.length - 1;
        // 🚀 카운트다운을 웹소켓 서버 시간에 종속시킴
        // 🚨 기존 candleSeries.update(liveData); 삭제하고 아래 함수로 교체!
function startBinanceMarketRadar() {
    const dot = document.getElementById("status-dot"),
  // stream.js 내부 수정
    const data = JSON.parse(event.data);
      const pureSymbol = ticker.s.replace("USDT", "");
      tickerBuffer[pureSymbol] = ticker; // 정렬용 버퍼는 그대로 유지
      // // 🚀 [차등화 전략 핵심] 0초 실시간 깜빡이 센서 가동
      // // 쌀먹 원칙: CCTV(visibleSymbols)에 잡힌 놈만 즉시 렌더링한다.
      // if (
      //   typeof visibleSymbols !== "undefined" &&
      //   visibleSymbols.has(pureSymbol)
      // ) {
      //   const priceCell = document.getElementById(`price-${pureSymbol}`);
      //   if (priceCell) {
      //     const newPrice = parseFloat(ticker.c);
      //     const oldPrice = parseFloat(
      //       priceCell.innerText.replace(/[^0-9.-]+/g, ""),
      //     );
      //     // 가격이 변했을 때만 즉시 DOM 조작 (웹소켓 단위)
      //     if (oldPrice !== newPrice) {
      //       priceCell.innerText = `$ ${formatSmartPrice(newPrice)}`;
      //       const flashClass = newPrice > oldPrice ? "flash-up" : "flash-down";
      //       priceCell.classList.add(flashClass);
      //       // 0.2초 뒤 클래스 제거 (다음 깜빡임을 위해)
      //       setTimeout(() => priceCell.classList.remove(flashClass), 200);
      //     }
      //   }
      // }
    let dataUpdated = false; // 데이터가 갱신되었는지 확인하는 플래그
      const ticker = tickerBuffer[pureSymbol];
      const newPrice = parseFloat(ticker.c);
      // 🚨 1. 정렬을 위해 원본 배열(currentTableData) 무조건 갱신!
      // (화면에 안 보여도 데이터는 최신화해둬야 갑자기 떡상할 때 1등으로 치고 올라옵니다)
        const targetRow = currentTableData.find(
            const openPrice = parseFloat(targetRow.utc0_open);
      // 🚨 2. 화면에 안 보이는 코인이면 CPU 절약을 위해 DOM 업데이트(깜빡임 등)는 패스!
      // --- 👇 여기서부터는 기존 화면 업데이트 로직 동일 👇 ---
      const priceCell = document.getElementById(`price-${pureSymbol}`);
      const changeCell = document.getElementById(`change-${pureSymbol}`);
      const todayCell = document.getElementById(`today-${pureSymbol}`);
      // if (priceCell) {
      //   const currentPrice = parseFloat(
      //     priceCell.innerText.replace(/[^0-9.-]+/g, ""),
      //   );
      //   if (currentPrice !== newPrice) {
      //     priceCell.innerText = `$ ${formatSmartPrice(newPrice)}`;
      //     const flashClass =
      //       newPrice > currentPrice ? "flash-up" : "flash-down";
      //     priceCell.classList.add(flashClass);
      //     setTimeout(() => priceCell.classList.remove(flashClass), 200);
      //   }
      // }
      // if (changeCell) {
      //   const newChange = parseFloat(ticker.P);
      //   const formattedChange = newChange.toFixed(2); // 🚀 소수점 2자리 고정
      //   const color =
      //     newChange > 0 ? "#26a69a" : newChange < 0 ? "#ef5350" : "gray";
      //   const weight = Math.abs(newChange) >= 5.0 ? "bold" : "normal";
      //   // formattedChange를 출력에 사용
      //   changeCell.innerHTML = `<span style="color:${color}; font-weight:${weight};">${newChange > 0 ? "+" : ""}${formattedCha
nge} %</span>`;
      // }
      // if (todayCell && typeof originalTableData !== "undefined") {
      //   const targetCoin = originalTableData.find(
      //     (c) => (c.Symbol || c.symbol) === pureSymbol,
      //   );
      //   if (targetCoin && targetCoin.utc0_open) {
      //     const openPrice = parseFloat(targetCoin.utc0_open);
      //     const newPrice = parseFloat(ticker.c);
      //     if (openPrice > 0) {
      //       // 🚀 1. 새로 계산한 등락률 (숫자형)
      //       const todayChange = ((newPrice - openPrice) / openPrice) * 100;
      //       // 🚀 2. 출력용 문자열 (소수점 2자리 고정)
      //       const finalStr = todayChange.toFixed(2);
      //       const tColor =
      //         todayChange > 0
      //           ? "#26a69a"
      //           : todayChange < 0
      //             ? "#ef5350"
      //             : "gray";
      //       const tWeight = Math.abs(todayChange) >= 5.0 ? "bold" : "normal";
      //       // 🚀 3. DOM 업데이트
      //       todayCell.innerHTML = `<span style="color:${tColor}; font-weight:${tWeight};">${todayChange > 0 ? "+" : ""}${final
Str} %</span>`;
      //       // 🚀 4. [중요] 정렬용 데이터(currentTableData)도 숫자로 업데이트
      //       const row = currentTableData.find(
      //         (r) => (r.Symbol || r.symbol) === pureSymbol,
      //       );
      //       if (row) {
      //         row.Change_Today = todayChange; // 여기는 숫자로 저장해야 나중에 정렬할 때 안 터짐
      //       }
      //     }
      //   }
      // }
    // 🚀 3. 데이터가 갱신되었다면 경주마 애니메이션 출동! (3초마다 스르륵)
    const dot = document.getElementById("status-dot"),



--- File: streamEach.js ---

// streamEach.js
// 🎯 스나이퍼 소켓 초기화
function initSniperSocket() {
  // 바이낸스 선물 복합 스트림 (개별 티커 전용)
    syncSniperSubscriptions(); // 연결되자마자 현재 보이는 놈들 구독
    const data = JSON.parse(e.data);
    // 개별 티커 데이터(24hrTicker)가 오면 즉시 DOM 업데이트
// 🔄 [핵심] visibleSymbols와 연동하여 구독 리스트 동기화
function syncSniperSubscriptions() {
  const currentVisible = Array.from(visibleSymbols).map(
  // 1. 새로 들어온 놈들 -> SUBSCRIBE
  const toSub = currentVisible.filter((s) => !activeSubs.has(s));
  // 2. 나간 놈들 -> UNSUBSCRIBE (바이낸스 부하 방지)
  const toUnsub = Array.from(activeSubs).filter(
// ⚡ 정밀 렌더링 시작하기
// streamEach.js
function renderSniperPrice(data) {
  const symbol = data.s.replace("USDT", "");
  const priceCell = document.getElementById(`price-${symbol}`);
  const changeCell = document.getElementById(`change-${symbol}`);
  const todayCell = document.getElementById(`today-${symbol}`);
  const newPrice = parseFloat(data.c);
  const oldPrice = parseFloat(priceCell.innerText.replace(/[^0-9.-]+/g, ""));
  // 1. 가격 업데이트 (기존 로직)
    const flashClass = newPrice > oldPrice ? "flash-up" : "flash-down";
  // ✅ [수정 완료] 2. 24시간 등락률 업데이트
    const change24h = parseFloat(data.P);
    const themeClass =
  // ✅ [수정 완료] 3. 당일(Today) 등락률 업데이트
    const targetRow = currentTableData.find(
      const openPrice = parseFloat(targetRow.utc0_open);
      const todayChange = ((newPrice - openPrice) / openPrice) * 100;
      // 🚀 하드코딩 색상(#26a69a) 대신 테마 클래스로 교체!
      const tThemeClass =
// 🚀 모든 뷰 변화의 종착역
function refreshSniperTarget() {



--- File: table.js ---

// table.js
// 1. 데이터 로드 함수
async function loadTableData(force = false) {
  const modal = document.getElementById("loading-modal");
  const updateTimeSpan = document.getElementById("update-time");
    console.log("1. 파이썬 서버에 데이터 요청 시작!"); // ⭐️ 추가
    const res = await fetch(`/api/market-data?force=${force}`);
    console.log("2. 파이썬 서버가 응답 완료!"); // ⭐️ 추가
    const result = await res.json();
    // ⭐️ 데이터를 받아오자마자 원본을 깊은 복사로 백업해둡니다.
    const tbody = document.getElementById("table-body");
    // 처음엔 화살표 없이 원본(시총순) 그대로 그림
// [table.js 맨 아래에 독립적으로 배치]
  const tbody = document.getElementById("table-body");
    // 1. 별표(즐겨찾기) 버튼 눌렀을 때는 차트 안 뜨게 방어 (이미 toggleFavorite에 stopPropagation 있지만 한 번 더!)
    const tr = e.target.closest("tr");
      const pureSymbol = tr.dataset.sym;
      if (window.innerWidth <= SCREEN_WIDTH) {
// 2. ⭐️ 3단계 정렬 핵심 로직 ⭐️ (리셋 & 상단 이동 추가)
function sortTable(colKey) {
  // 1. 클릭할 때마다 3단계 사이클 돌리기
  // 🚀 [추가] 정렬을 누르면 무조건 50개 리밋으로 리셋!
  // 🚀 [추가] 스크롤을 최상단으로 강제 소환!
  const scrollContainer = document.querySelector(
  // 2. 화살표 UI 업데이트
  const arrowEl = document.getElementById(`sort-${colKey}`);
  // 3. 정렬 실행
    // [3타 - 제자리 복구]
    renderTable(); // renderTable 내부에서도 currentRenderLimit(50)을 쓰니까 완벽!
    // [1타, 2타 - 실시간 정렬]
    // 💡 applyRealtimeSort가 돌면서 100등 밖으로 밀려난 애들을
    // 알아서 recycleBin(재활용 바구니)에 넣고 DOM에서 치워버립니다.
// 표 그리기 함수 수정
// 🚀 [추가] 행(TR) 생성 헬퍼 (초기 렌더링 & 신규 진입 시 사용)
function createRowElement(row) {
  const tr = document.createElement("tr");
  const pureSymbol = row.Symbol;
  // 껍데기 만들고 알맹이 채우는 함수 재활용
  // 새로 만든 행을 CCTV에 즉시 등록
// 🚀 [수정됨] 표 그리기 함수 (딱 100개만 렌더링하도록 변경)
function renderTable() {
  const tbody = document.getElementById("table-body");
  // ⭐️ 기존 감시 카메라 끄고 초기화
  // 🚀 핵심: 새 카메라 달기 전에 "기존 카메라"를 완전히 파괴해야 합니다!
    tableObserver = null; // 참조까지 끊어버리세요
  // ⭐️ 새 감시 카메라 설치
        const sym = entry.target.dataset.sym; // 코인 이름 가져오기
          visibleSymbols.add(sym); // 화면에 들어오면 추가
        else visibleSymbols.delete(sym); // 화면 밖으로 나가면 삭제
  // 🚨 핵심: 500개 전체가 아니라 상위 RENDER_LIMIT만 자릅니다!
  const topData = currentTableData.slice(0, currentRenderLimit); // 🚀 이걸로 변경
    // 만들어둔 헬퍼 함수로 깔끔하게 렌더링
  applySelectedHighlight(); // 🚀 [추가] 정렬 끝나고 내 코인 다시 찾아!
// <td class="p-4 text-right">
//     <div class="flex flex-col items-end justify-center h-full gap-1">
//         <span class="text-[13px]">${row.Upbit === "O" ? "🔵" : "⚫"}</span>
//         <span style="font-size:10px; opacity:0.6;">${row.Note || ""}</span>
//     </div>
// </td>
// ⭐️ 2. 좌우 넓이 드래그 조절 기능 ⭐️
const leftPanel = document.getElementById("left-panel");
  // 🚨 핵심: 이전 프레임이 대기 중이면 취소하고 최신 것만 실행
    const containerWidth = document.body.clientWidth;
    // 1. 패널 크기 변경
    // 2. 차트 리사이즈 (가장 무거운 작업)
    if (window.chart) {
      const container = document.getElementById("chart-container");
      window.chart.resize(container.clientWidth, container.clientHeight);
  document.body.classList.remove("resizing-active"); // 🚨 효과 해제
// ⭐️ [신규 추가] 실시간 재정렬 & 경주마 애니메이션 함수
function applyRealtimeSort() {
  // 1. 값 기반 메모리 정렬 (500개 연산 - 초고속)
    const isAsc = sortState === "asc";
  const tbody = document.getElementById("table-body");
  const topData = currentTableData.slice(0, currentRenderLimit);
  const topSymbols = new Set(topData.map((d) => d.Symbol || d.symbol));
  const existingRows = Array.from(tbody.children);
  const firstRects = new Map();
  // 🚀 [최적화 2] FLIP First: "화면에 보이는 놈들만" 위치 기억
    const sym = row.dataset.sym;
  // 🚀 [최적화 1] DOM 재활용 풀(Pool) 생성
  // 100등 밖으로 밀려난 패배자들의 DOM을 버리지 않고 모아둡니다.
  const recycleBin = [];
    const sym = row.dataset.sym;
      // 재활용 대기열에 들어갔으니 일단 CCTV에서 뺌
  // 4. 새로운 승리자들 DOM 재배치 (재활용 적극 활용)
    const sym = data.Symbol || data.symbol;
    // DOM이 없다면? (새로 진입한 코인)
        if (tableObserver) tableObserver.unobserve(tr); // 1. 기존 감시 취소
        if (tableObserver) tableObserver.observe(tr); // 2. 새 신분으로 감시 재시작 🚀
        // 완전 초기 렌더링 시 빈 공간이 모자랄 때만 새로 생성
      tr.style.animation = "flash-up 1s ease-out"; // 떡상 이펙트
    // 위치가 다르면 DOM 이동
  // 혹시 남은 잉여 DOM이 있다면 그때서야 파괴 (보통 발생 안 함)
  // 🚀 [최적화 2] FLIP Last & Play: "화면에 보였던 놈들만" 부드럽게 이동
  const finalRows = Array.from(tbody.children);
    const sym = row.dataset.sym;
    const firstY = firstRects.get(sym);
    // 안 보였던 놈(firstY 없음)은 좌표 연산 스킵!
      const lastY = row.getBoundingClientRect().top; // 여기서 Reflow 발생 (최소화됨)
      const deltaY = firstY - lastY;
  // 🚀 안전장치 장착 (스크롤 쪽이랑 똑같이!)
  applySelectedHighlight(); // 🚀 [추가] 순위 바뀌어도 내 코인은 빛나야지!
function applySelectedHighlight() {
  const selectedSymbol = currentSelectedSymbol; // 전역에 저장된 선택 심볼
  // 1. 일단 모든 행의 하이라이트 제거
  // 2. 선택된 심볼을 가진 행(tr)을 찾아서 외곽선 빡!
  const targetTr = document.querySelector(
    targetTr.style.outline = "2px solid var(--accent)"; // 68층 성주님의 골드 라인
    targetTr.style.zIndex = "10"; // 다른 행보다 위로
// 💡 헬퍼 함수: 재활용한 껍데기에 알맹이만 채우는 함수 (기존 로직 분리)
function updateRowInnerHTML(tr, row) {
  const pureSymbol = (row.Ticker || "").replace("KRW", "").replace("USDT", "").toUpperCase();
  const getCleanNum = (val) => {
    const clean =
  // console.log(`[유기적 체크] 티커: ${row.Ticker} | 최종 이름표: ${pureSymbol}`);
  const n24h = getCleanNum(row.Change_24h);
  const nDay = getCleanNum(row.Change_Today);
  const color24h =
  const colorDay =
  const formattedPrice = formatSmartPrice(Number(row.Price));
  // 🚀 핵심: 원화 가격이 데이터에 존재하면 " (911원)" 포맷으로 만들기
  const krwDisplay = row.Price_KRW
  // ⭐️ [추가] 로컬스토리지에서 즐겨찾기 상태 가져오기
  const favorites = JSON.parse(localStorage.getItem("sellnance_favs") || "[]");
  const isFav = favorites.includes(pureSymbol);
// 🚀 [table.js 또는 main.js] 무한 스크롤 & 스나이퍼 통합 엔진
function initInfiniteScroll() {
  const scrollContainer = document.querySelector(
  let isFetchingMore = false; // 🚨 스크롤 폭주 방지 (스로틀링)
  let scrollTimer; // 🎯 조준경 동기화용 (디바운싱)
  // 1. 로딩 바 DOM 생성
  const loadingIndicator = document.createElement("div");
  // 2. 통합 스크롤 센서 가동
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      // --- [파트 A] 무한 스크롤 (데이터 추가 렌더링) ---
            // 1. 기존 개수 기억하고 한도 늘리기
            const oldLimit = currentRenderLimit;
            // 🚀 2. 핵심 최적화: 전체 정렬 대신, 딱 추가될 50개만 잘라서 밑에 붙입니다!
            const tbody = document.getElementById("table-body");
            const nextBatch = currentTableData.slice(
              // 'createRowElement'가 알아서 껍데기 만들고 CCTV(Observer)까지 달아줍니다!
            // 3. 50개가 새로 생겼으니 조준경 갱신
      // --- [파트 B] 스나이퍼 조준경 (디바운싱 동기화) ---
      // 슥슥 올릴 땐 가만히 있다가, 멈추면 해당 구역 0.1초 틱 따기 시작!
        // ✅ [통합 훅] refreshSniperTarget 하나면 '보이는 놈 계산 + 구독'까지 한방입니다.
      }, 200); // 0.3초 멈춤 감지 (IP 밴 방어선)
function toggleFavorite(symbol, event) {
  event.stopPropagation(); // 🚨 중요: 별 눌렀을 때 차트 열리는 거 방지!
  const btn = event.currentTarget;
    // ⭐️ 쫀득한 애니메이션 효과
// ⭐️ 이 코드가 있어야 웹페이지가 켜지자마자 데이터를 가져옵니다!
window.addEventListener("DOMContentLoaded", () => {



--- File: ui_control.js ---

// ui_control.js
// --- 📱 UI/UX 컨트롤 로직 ---
function toggleTheme() {
  const body = document.body;
  const btn = document.getElementById("theme-toggle-btn");
  const isCurrentlyDark = body.classList.contains("theme-binance");
  // 다크 라이트 모드
// 데스크탑: 좌측 패널 접기/펴기
function toggleSidebar() {
  const leftPanel = document.getElementById("left-panel");
  const openBtn = document.getElementById("sidebar-open-btn");
    // 사이드바 열기
    // 사이드바 숨기기
  // UI 변경 후 차트 크기 강제 재계산
    if (window.chartResizeObserver && chart) {
      const container = document.getElementById("chart-container");
// 모바일: 리스트/차트 화면 전환
function switchMobileView(view) {
  const leftPanel = document.getElementById("left-panel");
  const rightPanel = document.getElementById("right-panel");
  const btnList = document.getElementById("mob-btn-list");
  const btnChart = document.getElementById("mob-btn-chart");
    // 🚀 [추가] 모바일 리스트 모드일 때 높이 제한과 스크롤 주입
    // 차트 화면 렌더링 최적화
      const container = document.getElementById("chart-container");
function showMobileChart() {
  if (window.innerWidth >= SCREEN_WIDTH) return;
  const overlay = document.getElementById("mobile-chart-overlay");
  const panel = document.getElementById("mobile-chart-panel");
  const content = document.getElementById("mobile-chart-content");
  const rightPanel = document.getElementById("right-panel");
  // 1. 이사 로직 (중복 방지)
  // 2. 레이아웃 및 '방벽 제거' (핵심!)
  // 🚀 active 클래스 하나로 pointer-events와 opacity를 동시에 제어하는 게 가장 깔끔합니다.
  // 3. 애니메이션 및 차트 리사이즈
    if (window.chart) {
      const newWidth = content.clientWidth;
      const newHeight = content.clientHeight - 60;
      window.chart.resize(newWidth, newHeight);
      window.chart.timeScale().fitContent();
      // 🚀 [추가] 차트가 뜨자마자 포커스를 잡게 해서 원터치 프리패스 완성!
      const container = document.getElementById("chart-container");
function closeMobileChart() {
  const overlay = document.getElementById("mobile-chart-overlay");
  const panel = document.getElementById("mobile-chart-panel");
  const rightPanel = document.getElementById("right-panel");
  const mainContainer = document.querySelector(".max-w-\\[1600px\\]");
  // 1. 유령 장벽 즉시 제거
  overlay.classList.remove("active"); // pointer-events: none 효과 발생
    // 2. 원래 자리로 복구
// ⭐️ 1. 탭 전환 기능 (차트 ↔ 시뮬레이터) ⭐️
function switchChartTab(mode) {
  const btnSim = document.getElementById("tab-btn-sim");
// 2. 🚨 진짜 탭을 바꾸고 화면을 업데이트하는 알맹이 로직 (여기로 분리!)
function executeTabSwitch(mode) {
  const btnChart = document.getElementById("tab-btn-chart"),
  if (window.chart) {
      const container = document.getElementById("chart-container");
        window.chart.resize(container.clientWidth, container.clientHeight);



--- File: _config.js ---

// _config.js
// 🌐 전역 변수 (Global State)
// 🚀 [광클 방지용] 마지막 요청 시간 기록
const SCREEN_WIDTH = 768;
const UI_UPDATE_INTERVAL = 3000;
const tfSec = {
  "1M": 2592000,   // 30일 기준
  "1Y": 31536000,  // 365일 기준
// BTC
let countdownOverlay = null; // 차트 위에 떠다닐 DOM
// --- 🎨 차트 렌더링 및 UI ---
// ⚙️ 차트 설정 전역 변수 (여기만 수정하면 전체 적용됨)
const CHART_CONFIG = {
  GHOST_COUNT: 500, // 미래 유령 캔들 개수
  VISIBLE_COUNT: 100, // 화면에 보여줄 과거 캔들 개수
  RIGHT_PADDING: 10, // 우측 여백 칸 수
let originalTableData = []; // ⭐️ 원본 백업용 변수 추가
let sortState = ""; // 'desc'(내림) -> 'asc'(오름) -> ''(제자리)
// 초기 로딩은 가장 가볍게 50개로 시작
const RENDER_CHUNK = 50; // 스크롤 바닥 칠 때마다 50개씩 추가
// ⭐️ 파일 위쪽 전역 변수 모여있는 곳에 2줄 추가
// 웹 소캣
// --- 📏 1. 전역 상태 및 DOM 요소 (간소화) ---
  cachedPriceTd = null; // 🚀 DOM 캐싱용 변수
// 요소 생성 (스타일은 CSS 파일로 빼는 것을 강력 추천하지만, 일단 유지)



--- File: _main.js ---

// _main.js
// --- 🚀 초기화 (Init) ---
window.onload = () => {
  initInfiniteScroll(); // 🚀 무한 스크롤 센서 가동!
  initSniperSocket(); // 🚀 스나이퍼 센서 가동
  // if (typeof selectSymbol === "function") selectSymbol("BTC");
  // 슬라이더 이벤트 바인딩
    const inputEl = document.getElementById("input-" + id);
        const val = inputEl.value;
  const genBtn = document.getElementById("btn-generate");
// ⚙️ 2. 시간 변환 통합 헬퍼 (전역으로 이동!)
// 이제 initChart와 startRealtimeCandle 양쪽에서 모두 사용 가능합니다.
const getUnixSeconds = (t) => {
function initChart() {
  const container = document.getElementById("chart-container");
  const isDark = currentTheme === "binance" || currentTheme === "upbit-dark";
  const upColor = currentTheme === "binance" ? "#26a69a" : "#c84a31";
  const downColor = currentTheme === "binance" ? "#ef5350" : "#1261c4";
        const d = new Date(getUnixSeconds(time) * 1000);
        // 🚀 핵심: tickMarkType이 'Year'(0)이면 연도를 최우선으로 반환
        // LightweightCharts.TickMarkType.Year 값은 보통 0입니다.
        const isDayUnit = !(currentTF || "1h").match(/[hm]/);
          // 일봉 이상: 연도 첫날이 아니면 '월/일' 표시
          // 분/시간봉: '시:분' 표시
        const d = new Date(getUnixSeconds(tick) * 1000);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const date = String(d.getDate()).padStart(2, "0");
        const h = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");
        // 🚀 십자선(Crosshair) 라벨도 동일한 규칙 적용
  // 🚀 1. 공통 커스텀 가격 포맷 설정 (함수 추가 없이 기존 formatSmartPrice 재활용!)
  const customPriceFormat = {
    minMove: 0.00000001, // 동전주(최대 소수점 8자리)까지 눈금을 허용하도록 족쇄 해제
    formatter: (price) => formatSmartPrice(price), // Y축 숫자를 그릴 때마다 기존 함수 통과
    priceFormat: customPriceFormat, // 👈 여기 추가
    priceFormat: customPriceFormat, // 👈 여기 추가
    // 1. 마우스가 차트 위에 있고 데이터가 존재할 때 (탐색 모드)
      const d = p.seriesData.get(candleSeries);
    // 2. 마우스가 차트를 벗어났을 때 (실시간 추적 모드)
      // 가장 최근 봉(현재가) 데이터를 전광판에 고정!
  // 🚀 설정 변수를 활용한 유령 데이터 렌더링
    const lastTime = getUnixSeconds(mainData[mainData.length - 1].time);
    const interval =
    // 🚀 전역 변수 적용
    const ghostData = Array.from(
    // VISIBLE_COUNT, RIGHT_PADDING 변수 사용
  // 측정 도구 세팅
  // 🚀 [여기에 추가!!!] 차트 그려진 직후에 카운트다운 DOM 세팅!
  // 리사이즈 옵저버 디바운스
  if (window.chartResizeObserver) window.chartResizeObserver.disconnect();
  window.chartResizeObserver = new ResizeObserver(([entry]) => {
    // 1. 부모 컨테이너 크기 실시간 감지
    const { width, height } = entry.contentRect;
    // 2. 0달러 방지 (크기가 0일 땐 패스)
    // 3. 디바운스 (너무 자주 그리면 렉 걸리니까 0.05초 대기)
        // 🚀 리사이즈 직후 차트 범위를 다시 맞춰야 안 찌그러짐
        // console.log(`📏 리사이즈 완료: ${width}x${height}`);
      // 🚀 모바일 오버레이 방어 (아까 그 기준 적용!)
        const overlay = document.getElementById("mobile-chart-overlay");
  // 🎯 차트 컨테이너 감시 시작!
  const chartContainer = document.getElementById("chart-container");
    window.chartResizeObserver.observe(chartContainer);
function setTF(tf) {
  const isSimMode = document
function executeSetTF(tf) {
    const onClickAttr = b.getAttribute("onclick") || "";
    // 1. 현재 버튼이 클릭된 타임프레임(tf)과 일치하는지 확인
    const isMatch = onClickAttr.includes(`'${tf}'`);
    // 2. active 클래스 토글
    // 3. 투명도 조절 (Tailwind 기준) - 반드시 루프 안에서 실행!
  // 4. 차트 데이터 갱신 함수 호출
function toggleLogScale() {
  const btn = document.getElementById("log-btn");
function updatePreview() {
function stopMeasuring() {
// --- 🚀 2. 렌더링 시 DOM만 다시 붙여주는 함수 (initChart 내부에서 호출) ---
function setupMeasureTool() {
  const container = document.getElementById("chart-container");
// --- ⚡ 3. 마우스 이벤트 (단 한 번만 실행되도록 분리) ---
function initMeasureEvents() {
  const container = document.getElementById("chart-container");
    // 🚀 매번 찾지 않고 캐싱된 DOM 사용
    const rect = container.getBoundingClientRect();
      const chartRect = cachedChartTd.getBoundingClientRect();
      const sX = e.clientX - chartRect.left;
      const sY = e.clientY - chartRect.top;
      const price = candleSeries.coordinateToPrice(sY);
      // 초기화 및 노출
    const chartRect = cachedChartTd.getBoundingClientRect();
    const curX = e.clientX - chartRect.left;
    const curY = e.clientY - chartRect.top;
    const curPrice = candleSeries.coordinateToPrice(curY);
    const curTime = chart.timeScale().coordinateToTime(curX);
    // 🚀 실시간 좌표 역산
    const startX = chart.timeScale().timeToCoordinate(measureStart.time);
    const startY = candleSeries.priceToCoordinate(measureStart.price);
    const priceDiff = curPrice - measureStart.price;
    const percentDiff = (priceDiff / measureStart.price) * 100;
    const isUp = priceDiff >= 0;
    const tColor = isUp ? "var(--up, #26a69a)" : "var(--down, #ef5350)";
    const tBg = isUp ? "rgba(38,166,154,0.15)" : "rgba(239,83,80,0.15)";
    const topY = Math.min(startY, curY),
    const leftX = Math.min(startX, curX),
    const barsDiff = Math.abs(
function toggleCountdown(isChecked) {
  const knob = document.getElementById("countdown-knob");
  // UI 토글 애니메이션
// _main.js 빈 곳에 추가 (기존 updateCountdownPosition이 있다면 덮어쓰기)
function updateRealtimeCountdown(serverMs) {
  // 1. 서버 시간 기반으로 남은 시간 텍스트 계산
  const timeText = calculateTimeRemaining(currentTF, serverMs);
  // 2. 현재 봉 상태 가져오기
  const lastCandle = mainData[mainData.length - 1];
  const { open, close } = lastCandle;
  // 3. 색상 및 위치 계산
  const bgCol = close < open ? "var(--down)" : "var(--up)";
  const yCoordinate = candleSeries.priceToCoordinate(close);
  // 4. DOM 업데이트 (단 한 번의 Reflow만 발생)
function setupCountdownDOM() {
  const container = document.getElementById("chart-container");
  // 🚀 [개선 포인트] container 내부뿐만 아니라, 이사 간 부모(table) 전체에서 가격축(td:nth-child(3))을 찾습니다.
  const priceScaleTd = container.closest('table')?.querySelector("tr:nth-child(1) td:nth-child(3)") 
    // 차트가 아직 안 그려졌거나 렌더링 전이면 재시도
  // 🚀 [중요] 기존에 그려진 잔상이 있다면 제거하고 새로 붙입니다 (중복 방지)
  // 🚀 [핵심] 스타일 재설정 (기존 스타일 유지)
  // 🚀 최종적으로 현재 활성화된 가격 축에 찰싹 붙이기!
// // 🚀 [실시간 브라우저 감시관] - initChart 밖에 두세요!
// window.addEventListener('resize', () => {
//   const width = window.innerWidth; // 창 전체 너비 측정
//   const overlay = document.getElementById("mobile-chart-overlay");
//   const isOverlayOpen = overlay && !overlay.classList.contains("hidden");
//   // 1. 📱 PC -> 모바일 자동 전환
//   if (width < SCREEN_WIDTH && !isOverlayOpen) {
//     // 현재 차트를 보고 있는 상태일 때만 자동으로 오버레이 띄우기
//     const btnChart = document.getElementById("mob-btn-chart");
//     if (btnChart && btnChart.classList.contains("text-theme-accent")) {
//       console.log("📱 창 크기 감지: 모바일 모드 자동 전환");
//       showMobileChart();
//     }
//   }
//   // 2. 🖥️ 모바일 -> PC 자동 복구
//   if (width >= SCREEN_WIDTH && isOverlayOpen) {
//     console.log("🖥️ 창 크기 감지: PC 레이아웃 자동 복구");
//     closeMobileChart();
//   }
// });
