# api_manager.py
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime
import threading
import traceback
import requests
import decimal
import config
import json
import pytz
import sys
import re
import os

# --- ⭐️ GLOBAL CACHE SETTINGS ⭐️ ---
GLOBAL_CACHE = {
    'data': [],
    'timestamp': datetime.min,
    'last_updated_str': ""
}
CACHE_TIMEOUT_SECONDS = 3600 # 1시간

# --- ⭐️ LOAD MAPPING CONFIG ⭐️ ---
# (기존 하드코딩 딕셔너리들 싹 지우고 아래 코드로 대체)
try:
    with open('mapping.json', 'r', encoding='utf-8') as f:
        MAPPING_DATA = json.load(f)
except FileNotFoundError:
    print("🚨 mapping.json 파일을 찾을 수 없습니다!")
    MAPPING_DATA = {}

NOTE_MAP = MAPPING_DATA.get("NOTE_MAP", {})
CHAIN_LOGO_MAP = MAPPING_DATA.get("CHAIN_LOGO_MAP", {})
EXCLUSION_LIST = MAPPING_DATA.get("EXCLUSION_LIST", [])
DUPLICATED_LIST = MAPPING_DATA.get("DUPLICATED_LIST", {})
SYMBOL_TO_ID_MAP = MAPPING_DATA.get("SYMBOL_TO_ID_MAP", {})
MANUAL_SUPPLY_MAP = MAPPING_DATA.get("MANUAL_SUPPLY_MAP", {})
SPECIAL_SYMBOL_MAP = MAPPING_DATA.get("SPECIAL_SYMBOL_MAP", {})
HARDCODE_VERIFY_SKIP_LIST = MAPPING_DATA.get("HARDCODE_VERIFY_SKIP_LIST", [])

# --- ⭐️ FORMATTING FUNCTIONS ⭐️ ---
def format_market_cap_string(mc):
    if mc is None or mc == 0: return "0"
    if mc >= 1_000_000_000_000: return f"$ {mc / 1_000_000_000_000:,.2f} T"
    if mc >= 1_000_000_000: return f"$ {mc / 1_000_000_000:,.2f} B"
    if mc >= 1_000_000: return f"$ {mc / 1_000_000:,.2f} M"
    return f"$ {mc:,.0f}"

def format_volume_string(vol):
    if vol is None or vol == 0: return "0"
    if vol >= 1_000_000_000: return f"$ {vol / 1_000_000_000:,.2f} B"
    if vol >= 1_000_000: return f"$ {vol / 1_000_000:,.2f} M"
    return f"$ {vol:,.0f}"

# 1. 초기화 단계에서 딱 한 번만 계산 (JavaScript든 Python이든 로직 동일)
def get_precision(tick_size_str):
    """문자열 형태의 틱사이즈에서 소수점 자릿수 추출 (예: "0.0001" -> 4)"""
    if not tick_size_str or '.' not in str(tick_size_str): return 0
    # 뒤에 붙은 의미 없는 0을 지우고 소수점 아래 길이를 잽니다.
    return len(str(tick_size_str).split('.')[-1].rstrip('0'))

# 2. 포맷팅 함수 (초간단)
def format_dynamic_price(price, precision):
    if price is None or price == 0: return
    
    # 거래소가 준 정밀도(precision) 그대로 사용!
    return f"{price:,.{precision}f}"

# --- ⭐️ UX SETTINGS ⭐️ ---
# ✅ [수정 후] 테마를 지원하는 클린 포맷터
def format_change(percent):
    if percent is None or not isinstance(percent, (int, float)):
        return '<span class="text-theme-text opacity-50">N/A</span>'
    
    # 🚀 하드코딩 색상 빼고 테마 클래스로 변경!
    theme_class = "text-theme-up" if percent > 0 else "text-theme-down" if percent < 0 else "text-theme-text opacity-50"
    
    # 🚀 인라인 스타일(font-weight) 대신 Tailwind 클래스로 통일
    weight_class = "font-bold" if abs(percent) >= 5.0 else "font-normal"
    
    # style="..." 은 완전히 삭제하고 class="..." 만 넘겨줍니다.
    return f'<span class="{theme_class} {weight_class}">{percent:+.2f} %</span>'

def create_image_tag(url):
    if not url: return ""
    return f'<img src="{url}" loading="lazy" style="width: 24px; height: 24px; vertical-align: middle; border-radius: 50%;">'

def get_pure_base_asset(ticker):
    # 1. Quote(결제자산)를 뒤에서부터 안전하게 제거
    # USDT, KRW 외에 다른 마켓이 추가되어도 대응 가능하도록 리스트화
    for quote in ['USDT', 'KRW', 'BTC', 'ETH']:
        if ticker.endswith(quote):
            ticker = ticker[:-len(quote)]
            break

    # 2. 정규식으로 배율과 순수 심볼 분리
    # ^(10+|1[MB])? : 시작부분의 10, 100, 1M, 1B 등을 그룹 캡처
    # (?P<symbol>.+) : 나머지를 전부 'symbol' 그룹으로 캡처
    match = re.match(r'^(?P<scale>10+|1[MB])?(?P<symbol>.+)$', ticker)
    if match:
        return match.group('symbol')
    return ticker

def is_scaled_symbol(symbol):
    return bool(re.match(r'^(10+)|^(1[MB])', symbol))

@contextmanager
def suppress_output():
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    try:
        with open(os.devnull, 'w') as devnull:
            sys.stdout = devnull
            sys.stderr = devnull
            yield
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr

def _fetch_cmc_api_chunk(task):
    url, headers, params = task
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        resp.raise_for_status()
        if resp.text: return resp.json()
    except: return None

def get_korean_exchange_markets():
    upbit_krw_set, bithumb_krw_set = set(), set()
    try:
        res = requests.get("https://api.upbit.com/v1/market/all?isDetails=false").json()
        for m in res:
            if m['market'].startswith('KRW-'): upbit_krw_set.add(m['market'].replace('KRW-', ''))
    except Exception as e:
        print(f"🚨 [디버그] 업비트 마켓 목록 에러: {e}") # 👈 pass 대신 추가!
    try:
        res = requests.get("https://api.bithumb.com/public/ticker/ALL_KRW").json().get('data', {})
        for sym in res.keys():
            if sym.upper() not in ['DATE', 'TIMESTAMP']: bithumb_krw_set.add(sym.upper())
    except Exception as e:
        print(f"🚨 [디버그] 빗썸 마켓 목록 에러: {e}") # 👈 pass 대신 추가!
    return upbit_krw_set, bithumb_krw_set

def is_valid_ticker(ticker):
    """
    영어 대문자, 숫자 이외의 문자가 섞여 있으면 거부합니다.
    (한자, 특수문자, 소문자, 이모지 등 온갖 잡다구리한 티커 사전에 차단)
    """
    # ^[A-Z0-9]+$ : 시작부터 끝까지 영어 대문자와 숫자로만 이루어져야 함
    import re
    if re.match(r'^[A-Z0-9]+$', ticker):
        return True
    return False

# (파일 상단의 임포트와 글로벌 설정, format 함수들은 그대로 두시면 됩니다!)

def _fetch_binance_open(symbol):
    """(보조) 바이낸스 9시 시가 단일 수집기"""
    try:
        res = requests.get(f"https://fapi.binance.com/fapi/v1/klines?symbol={symbol}USDT&interval=1d&limit=1", timeout=2).json()
        if res and len(res) > 0: return symbol, float(res[0][1])
    except Exception as e: 
        print(f"🚨 [디버그] 바이낸스 API 에러: {e}") # 👈 pass 대신 이걸 넣으세요!
    return symbol, None

# ==========================================
# 🧱 모듈 1: 거래소 시세 수집기 (Binance & Upbit)
# ==========================================

def fetch_exchange_market_data():
    upbit_krw_set, bithumb_krw_set = get_korean_exchange_markets()

    binance_base_assets = set()
    binance_data = {}
    try:
        info = requests.get("https://fapi.binance.com/fapi/v1/exchangeInfo").json()
        active = {s['symbol'] for s in info['symbols'] if s['status'] == 'TRADING' and s['quoteAsset'] == 'USDT' and '_' not in s['symbol']}
        for s in active: binance_base_assets.add(s.replace('USDT', ''))

        prices = requests.get("https://fapi.binance.com/fapi/v1/ticker/price").json()
        changes = requests.get("https://fapi.binance.com/fapi/v1/ticker/24hr").json()

        p_dict = {i['symbol']: float(i['price']) for i in prices if i['symbol'] in active}
        c_dict = {i['symbol']: float(i['priceChangePercent']) for i in changes if i['symbol'] in active}

        # 바이낸스 9시 시가 병렬 수집
        utc0_open_dict = {}
        with ThreadPoolExecutor(max_workers=10) as executor:
            results = executor.map(_fetch_binance_open, binance_base_assets)
            for sym, open_p in results:
                if open_p: utc0_open_dict[sym] = open_p
                
        b_precisions = {}
        for s in info['symbols']:
            if s['quoteAsset'] == 'USDT':
                f = {filt['filterType']: filt for filt in s['filters']}
                t_size = f.get('PRICE_FILTER', {}).get('tickSize', '0.01')
                b_precisions[s['symbol']] = get_precision(t_size)

        for ticker, price in p_dict.items():
            sym = ticker.replace('USDT', '')
            binance_data[ticker] = {
                'price': price,
                'change_24h': c_dict.get(ticker, 0.0),
                'utc0_open': utc0_open_dict.get(sym),
                'precision': b_precisions.get(ticker, 2)
            }
    except Exception as e: 
        print(f"🚨 fetch_exchange_market_data 에러: {e}") # 👈 pass 대신 이걸 넣으세요!

    binance_pure = {get_pure_base_asset(a) for a in binance_base_assets}
    upbit_only_assets = {k for k in upbit_krw_set if k not in EXCLUSION_LIST and not is_scaled_symbol(k) and k not in binance_pure and k not in binance_base_assets}

    upbit_data = {}
    if upbit_only_assets:
        # 🚨 업비트 API 길이 제한 방어: 100개씩 쪼개서 요청 (0달러 오류 해결)
        upbit_list = list(upbit_only_assets)
        for i in range(0, len(upbit_list), 100):
            try:
                chunk = upbit_list[i:i+100]
                markets_str = ",".join([f"KRW-{k}" for k in chunk])
                res = requests.get(f"https://api.upbit.com/v1/ticker?markets={markets_str}", timeout=5).json()
                for item in res:
                    sym = item['market'].replace('KRW-', '')
                    # 🚀 하드코딩 없이 '실시간 가격' 기준으로 정밀도 판별 (또는 위 orderbook 함수 사용)
                    # 업비트 규칙을 데이터로 변환 (이건 규칙이라 어쩔 수 없지만 코드는 깔끔!)
                    diff = item['trade_price'] - item.get('prev_closing_price', 0) # 임시값 대신 실제 틱 로직 사용
                    upbit_data[sym] = {
                        'raw_item': item,
                        'price': item['trade_price'],
                        'utc0_open': item['opening_price'],
                        'change_24h': item.get('signed_change_rate', 0.0) * 100 # 아까 고친 24h 변동률!
                    }
            except Exception as e: 
                print(f" 업비트 데이터 수집 에러 (Chunk): {e}")

    return binance_data, upbit_data, upbit_krw_set, upbit_only_assets

# ==========================================
# 🧱 모듈 2: 코인마켓캡(CMC) 정보 수집기
# ==========================================

def fetch_cmc_market_data(binance_data, upbit_only_assets):
    binance_base_set = {t.replace('USDT', '') for t in binance_data.keys()}
    all_assets = binance_base_set.union(upbit_only_assets)

    asset_to_lookup_key = {}
    id_lookup, sym_lookup = [], []
    
    DUPLICATED_LIST = MAPPING_DATA.get("DUPLICATED_LIST", {})

    # 🚀 [추가] 역방향 족보 생성: "진짜티커_거래소" -> "별명(임의이름)"
    REVERSE_LOOKUP = {}
    for alias, info in DUPLICATED_LIST.items():
        if len(info) >= 4:
            real_ticker, exchange = info[2].upper(), info[3].upper()
            REVERSE_LOOKUP[f"{real_ticker}_{exchange}"] = alias

    for a in all_assets:
        if a in EXCLUSION_LIST: continue
        
        # 바이낸스 소속인지 업비트 소속인지 확인
        exchange_tag = "BINANCE" if a in binance_base_set else "UPBIT"
        
        # 🚀 [수정] 족보에서 별명 찾기
        alias_name = REVERSE_LOOKUP.get(f"{a.upper()}_{exchange_tag}", a)

        # ⭐️ 격리 출신이면 무조건 [0]번값(UID)을 꽂아버리기~
        if alias_name in DUPLICATED_LIST:
            cmc_id = str(DUPLICATED_LIST[alias_name][0])
            id_lookup.append(cmc_id)
            asset_to_lookup_key[f"{exchange_tag}_{a.upper()}"] = cmc_id
        elif alias_name in SYMBOL_TO_ID_MAP:
            cmc_id = SYMBOL_TO_ID_MAP[alias_name]
            id_lookup.append(cmc_id)
            asset_to_lookup_key[f"{exchange_tag}_{a.upper()}"] = cmc_id
        else:
            norm = SPECIAL_SYMBOL_MAP.get(get_pure_base_asset(a), get_pure_base_asset(a))
            sym_lookup.append(norm)
            asset_to_lookup_key[f"{exchange_tag}_{a.upper()}"] = norm

    headers = {'Accepts': 'application/json', 'X-CMC_PRO_API_KEY': config.CMC_API_KEY}
    quote_tasks = []
    url = 'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest'

    if id_lookup: quote_tasks.append((url, headers, {'id': ",".join(id_lookup), 'convert': 'USD'}))

    sym_list = [s.strip() for s in list(set(sym_lookup)) if s and isinstance(s, str) and s.strip()]
    for i in range(0, len(sym_list), 200):
        chunk = [s for s in sym_list[i:i + 200] if s]
        if chunk: quote_tasks.append((url, headers, {'symbol': ",".join(chunk), 'convert': 'USD'}))

    market_data_map = {}
    with ThreadPoolExecutor(max_workers=10) as executor:
        quotes_results = list(executor.map(_fetch_cmc_api_chunk, quote_tasks))

    for res in quotes_results:
        if not res or 'data' not in res: continue
        for k, v in res['data'].items():
            info = v[0] if isinstance(v, list) and v else v if isinstance(v, dict) else None
            if not info or 'quote' not in info: continue
            q = info['quote']['USD']
            platform = info.get('platform')
            chain_symbol = platform.get('symbol') if platform else info.get('symbol', '')
            
            market_data_map[k] = {
                'name': info.get('name'),
                'market_cap': q.get('market_cap'),
                'cmc_price': q.get('price'),
                'volume_24h': q.get('volume_24h'),
                'ucid': str(info.get('id')),
                'chain_symbol': chain_symbol
            }
    return market_data_map, asset_to_lookup_key

# ==========================================
# 🧱 모듈 3: 데이터 조립 및 변동률 계산기
# ==========================================

def build_final_market_list(
    binance_data, upbit_data, market_data_map, asset_to_lookup_key, upbit_krw_set, upbit_only_assets):
    global MAPPING_DATA
    PRICE_DIFFERENCE_THRESHOLD = 0.20
    # MAJOR_COINS = {'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'SUI'}
    TICKER_DATA = MAPPING_DATA.get("TICKER_DATA", {})
    DUPLICATED_LIST = MAPPING_DATA.get("DUPLICATED_LIST", {})

    # 🚀 1. 실시간 테더 환율 가져오기 (두나무 api 에러 방지)
    krw_usd_rate = 1450.0 
    try:
        tether_res = requests.get("https://api.upbit.com/v1/ticker?markets=KRW-USDT", timeout=3).json()
        if tether_res and len(tether_res) > 0:
            krw_usd_rate = float(tether_res[0]['trade_price'])
    except Exception as e:
        print(f"⚠️ 테더 환율 수집 실패, 기본값 {krw_usd_rate}원 사용")

    final_results = []
    is_mapping_updated = False
    
     # 🚀 [추가] 역방향 족보 여기서도 동일하게 생성
    REVERSE_LOOKUP = {}
    for alias, info in DUPLICATED_LIST.items():
        if len(info) >= 4:
            REVERSE_LOOKUP[f"{info[2].upper()}_{info[3].upper()}"] = alias

    # 🚀 [추가] 중복 출입 통제소 (같은 UID는 두 번 못 들어옴!)
    processed_uids = set()

    # ---------------------------------------------------------
    # 1. 바이낸스 선물 조립
    # ---------------------------------------------------------
    # --- 1. 바이낸스 선물 조립 루프 내부 ---
    for ticker, b_info in binance_data.items():
        price = b_info['price']
        mcap = 0
        
        # 1. 이름표 발급 (딱 한 번만 선언)
        raw_symbol = ticker.replace('USDT', '') 
        base = get_pure_base_asset(ticker).upper() 
        
        # 2. 프론트용 예쁜 별명 찾기
        display_name = REVERSE_LOOKUP.get(f"{raw_symbol.upper()}_BINANCE", base)
        
        # 3. 맵핑 조회를 위한 룩업 키 결정 (원본 우선, 없으면 깎은 이름)
        lookup_key = raw_symbol if raw_symbol in SYMBOL_TO_ID_MAP else base

        # 4. 쓰레기 필터링
        if not is_valid_ticker(base) and lookup_key not in SYMBOL_TO_ID_MAP: continue
        if base in EXCLUSION_LIST: continue

        # 5. CMC 정보 가져오기 (에러 확률 원천 차단)
        lookup_id = asset_to_lookup_key.get(f"BINANCE_{raw_symbol.upper()}") or asset_to_lookup_key.get(f"BINANCE_{base.upper()}")
        info = market_data_map.get(lookup_id) if lookup_id else None

        if not info: continue # 정보 없으면 스킵
        
        ucid = info.get('ucid', '') if info else ''

        # 🚀 [철벽 방어] 이미 명부에 있는 UID면 즉시 폐기 (중복 방지)
        if ucid and ucid in processed_uids:
            continue
        if ucid:
            processed_uids.add(ucid)

        if info or base in MANUAL_SUPPLY_MAP:
            logo = create_image_tag(f"https://s2.coinmarketcap.com/static/img/coins/128x128/{ucid}.png" if ucid else "")

            # 🚀 [철벽 방어 2] 격리 병동 놈들은 체인 덮어씌우고 TICKER_DATA에 저장 안 함!
            if display_name in DUPLICATED_LIST:
                ch_sym = DUPLICATED_LIST[display_name][1] # [1]번 값으로 체인 덮어씌움
            else:
                ticker_info = TICKER_DATA.get(display_name)
                saved_chain = ticker_info[1] if isinstance(ticker_info, list) else ticker_info
                ch_sym = saved_chain or CHAIN_LOGO_MAP.get(base) or (info.get('chain_symbol') if info else '')
                
                # 깨끗한 놈들만 TICKER_DATA에 저장 허락
                if ch_sym and display_name not in TICKER_DATA and base not in CHAIN_LOGO_MAP:
                    TICKER_DATA[display_name] = [ucid, ch_sym]
                    is_mapping_updated = True

            chain = create_image_tag(CHAIN_LOGO_MAP.get(ch_sym, '')) if ch_sym in CHAIN_LOGO_MAP else ch_sym

            if ch_sym and base not in TICKER_DATA and base not in CHAIN_LOGO_MAP:
                TICKER_DATA[display_name] = [ucid, ch_sym]
                is_mapping_updated = True

            if base in MANUAL_SUPPLY_MAP:
                sup = MANUAL_SUPPLY_MAP[base]; mul = 1
                m = re.match(r'^(10+)', base)
                if m: mul = int(m.group(1))
                mcap = (price / mul if mul > 0 else price) * sup
            elif info and info.get('market_cap') is not None:
                cmc_p = info['cmc_price']; mul = 1
                if base.startswith('1M'): mul = 1_000_000
                elif base.startswith('1B'): mul = 1_000_000_000
                else:
                    m = re.match(r'^(10+)', base)
                    if m and len(base) > len(m.group(0)): mul = int(m.group(1))
                adj_p = price / mul if mul > 0 else price
                mcap = info.get('market_cap', 0)
                diff = abs(adj_p - cmc_p) / adj_p if adj_p > 0 else 1

                # if base in MAJOR_COINS or diff <= PRICE_DIFFERENCE_THRESHOLD:
                #     mcap = info.get('market_cap', 0)
                # else:
                #     continue
        # else: continue

        utc0_open = round(b_info.get('utc0_open', 0), 8) if b_info.get('utc0_open') else 0.0
        change_today = round(((price - utc0_open) / utc0_open * 100), 2) if utc0_open and utc0_open > 0 else 0.0

        # 🚀 [사전 변수 통일] append 안에 들어갈 놈들을 미리 깔끔하게 정리
        coin_name = info.get('name', base) if info else base
        vol_24h = info.get('volume_24h', 0) if info else 0
        change_24h = b_info.get('change_24h', 0.0)
        is_upbit = 'O' if base in upbit_krw_set else 'X'
        precision = b_info.get('precision', 2)

        # 🚀 [깔끔한 Append] 바이낸스/업비트 완벽하게 동일한 구조
        final_results.append({
            # --- 1. 기본 식별 정보 ---
            "Symbol": raw_symbol,
            "DisplayTicker": display_name,
            "Ticker": ticker, 
            "Logo": logo,
            "Name": coin_name,
            "Chain": chain,
            "Upbit": is_upbit,
            "Note": NOTE_MAP.get(base, ''),
            "precision" : precision,

            # --- 2. 화면 표시용 데이터 (HTML 포함) ---
            "Price": format_dynamic_price(b_info['price'], precision),
            "Price_KRW": None, # 바이낸스는 원화 없음
            "Change_24h": format_change(change_24h),
            "Change_Today": format_change(change_today),
            "Volume_Formatted": format_volume_string(vol_24h),
            "MarketCap_Formatted": format_market_cap_string(mcap),

            # --- 3. 프론트엔드 정렬용 순수 숫자 데이터 (Raw) ---
            "Price_Raw": price,
            "Change_24h_Raw": change_24h,
            "Change_Today_Raw": change_today,
            "Volume_Raw": vol_24h,
            "MarketCap_Raw": mcap,
            "utc0_open_Raw": utc0_open,
        })

    # ---------------------------------------------------------
    # 2. 업비트 전용 조립 (🚨 철벽 방어 적용 완료)
    # ---------------------------------------------------------
    for base in upbit_only_assets:
        base = base.upper()
        if not is_valid_ticker(base) and base not in SYMBOL_TO_ID_MAP: continue
        
        # 지도에서 UID 찾아오기 (중복 제거 완료)
        lookup_id = asset_to_lookup_key.get(f"UPBIT_{base}")
        info = market_data_map.get(lookup_id)
        if not info or info.get('cmc_price') is None: continue

        ucid = info.get('ucid', '')
        # 🚀 별명 먼저 확정 (VIP 여부 판단용)
        display_name = REVERSE_LOOKUP.get(f"{base}_UPBIT", base)

        # ✅ 원칙 적용: UID가 이미 명부에 있다면?
        if ucid and ucid in processed_uids:
            # ⭐️ 단, "이미 지어준 별명(EDGE 등)"이 있는 귀빈들은 예외로 통과!
            if display_name not in DUPLICATED_LIST:
                continue
        
        if ucid: processed_uids.add(ucid)
        
        # --- 여기서부터는 데이터 조립 ---
        logo = create_image_tag(f"https://s2.coinmarketcap.com/static/img/coins/128x128/{ucid}.png" if ucid else "")

        # 🚀 [철벽 방어] 격리 놈들은 체인 덮어씌우고 TICKER_DATA 저장 안 함!
        if display_name in DUPLICATED_LIST:
            ch_sym = DUPLICATED_LIST[display_name][1]
        else:
            ticker_info = TICKER_DATA.get(display_name)
            saved_chain = ticker_info[1] if isinstance(ticker_info, list) else ticker_info
            ch_sym = saved_chain or CHAIN_LOGO_MAP.get(display_name) or info.get('chain_symbol', '')
            
            if ch_sym and display_name not in TICKER_DATA and base not in CHAIN_LOGO_MAP:
                TICKER_DATA[display_name] = [ucid, ch_sym]
                is_mapping_updated = True

        chain = create_image_tag(CHAIN_LOGO_MAP.get(ch_sym, '')) if ch_sym in CHAIN_LOGO_MAP else ch_sym      

        # 🚀 [철벽 방어] 모든 변수를 안전한 실수형(float) 0.0으로 선언하고 시작
        up_price_krw = 0.0
        up_open_krw = 0.0
        up_change_24h = 0.0
        current_p = float(info.get('cmc_price') or 0.0)
        utc0_open = 0.0

        up_info = upbit_data.get(base)
        if up_info:
            # 데이터가 None일 경우를 대비해 'or 0.0' 처리
            up_price_krw = float(up_info.get('price') or 0.0)
            up_open_krw = float(up_info.get('utc0_open') or 0.0)
            up_change_24h = float(up_info.get('change_24h') or 0.0)
            
            if up_price_krw > 0:
                current_p = up_price_krw / krw_usd_rate
            if up_open_krw > 0:
                utc0_open = up_open_krw / krw_usd_rate

        change_today = round(((current_p - utc0_open) / utc0_open * 100), 2) if utc0_open > 0 else 0.0
        
        # 🚀 [사전 변수 통일] 바이낸스와 똑같은 변수명으로 맞춤
        coin_name = info.get('name', base) if info else base
        vol_24h = info.get('volume_24h', 0) if info else 0
        change_24h = up_change_24h
        final_mcap = info.get('market_cap', 0)
        # 업비트는 가격대별로 변하므로 여기서 '데이터 기반'으로 자릿수 결정
        p = up_info['price']
        # 🚀 하드코딩 대신 자릿수 판별 로직 (표준 호가 단위 규칙만 적용)
        up_precision = 0 if p >= 100 else 1 if p >= 10 else 2 if p >= 1 else 3 if p >= 0.1 else 4

        # 🚀 [깔끔한 Append] 바이낸스와 복붙 수준으로 통일
        final_results.append({
            # --- 1. 기본 식별 정보 ---
            "Symbol": base,
            "DisplayTicker": display_name,
            "Ticker": f"{base}KRW",
            "Logo": logo,
            "Name": coin_name,
            "Chain": chain,
            "Upbit": 'O',
            "Note": NOTE_MAP.get(base, 'Upbit Only'),
            "precision" : up_precision,

            # --- 2. 화면 표시용 데이터 (HTML 포함) ---
            "Price": format_dynamic_price(p, up_precision),
            "Price_KRW": up_price_krw if up_price_krw > 0 else None,
            "Change_24h": format_change(change_24h),
            "Change_Today": format_change(change_today),
            "Volume_Formatted": format_volume_string(vol_24h),
            "MarketCap_Formatted": format_market_cap_string(final_mcap),

            # --- 3. 프론트엔드 정렬용 순수 숫자 데이터 (Raw) ---
            "Price_Raw": current_p,
            "Change_24h_Raw": change_24h,
            "Change_Today_Raw": change_today,
            "Volume_Raw": vol_24h,
            "MarketCap_Raw": final_mcap,
            "utc0_open": utc0_open,
        })

    return final_results, is_mapping_updated, TICKER_DATA

# ==========================================
# 👑 최종 함수 BOSS
# ==========================================
def _fetch_and_process_data():
    global MAPPING_DATA

    # 1. 시세 수집
    binance_data, upbit_data, upbit_krw_set, upbit_only_assets = fetch_exchange_market_data()
    # 2. 정보 수집 (CMC)
    market_data_map, asset_to_lookup_key = fetch_cmc_market_data(binance_data, upbit_only_assets)
    # 3. 조립 및 계산
    final_results, is_mapping_updated, updated_chain_map = build_final_market_list(
        binance_data, upbit_data, market_data_map, asset_to_lookup_key, upbit_krw_set, upbit_only_assets
    )

    # 4. JSON 덮어쓰기 (체인 변경 시)
    if is_mapping_updated:
        try:
            # 🚀 [추가] TICKER_DATA를 A-Z 알파벳 순으로 깔끔하게 정렬!
            sorted_ticker_data = dict(sorted(updated_chain_map.items()))
            MAPPING_DATA["TICKER_DATA"] = sorted_ticker_data
            with open('mapping.json', 'w', encoding='utf-8') as f:
                json.dump(MAPPING_DATA, f, indent=4, ensure_ascii=False)
            print("💾 새로운 티커 정보가 mapping.json에 저장되었습니다.")
            
        except Exception as e:
            print(f"[System] mapping.json 자동 저장 실패: {e}")

    # 5. 시총 정렬 후 반환
    final_results.sort(key=lambda x: x.get('MarketCap_Raw', 0), reverse=True)
    return final_results

data_lock = threading.Lock()
def get_cached_data(force_reload=False):
    global GLOBAL_CACHE
    with data_lock:
        # 🚀 1. 지금 시간을 무조건 한국 시간(KST)으로 꽉 고정!
        kst = pytz.timezone('Asia/Seoul')
        now_kst = datetime.now(kst)
        
        needs_reset = False
        
        # 🚀 2. timestamp가 datetime.min이 아닐 때만 계산 (에러 방지)
        if GLOBAL_CACHE['timestamp'] != datetime.min:
            # 저장된 시간도 KST로 변환해서 정확히 비교
            last_update_kst = GLOBAL_CACHE['timestamp'].astimezone(kst)
            
            # 오늘 9시가 지났고, 마지막 업데이트가 오늘 9시 이전이면 리셋!
            if now_kst.hour >= 9 and (last_update_kst.date() < now_kst.date() or last_update_kst.hour < 9):
                needs_reset = True
                print("🚨 오전 9시 정각 리셋 트리거 발동!")
        
        # 🚀 3. 캐시 만료 로직 (시간 계산 깔끔하게)
        is_expired = False
        if GLOBAL_CACHE['timestamp'] != datetime.min:
            # now_kst와 비교하기 위해 KST로 맞춰서 계산
            is_expired = (now_kst - GLOBAL_CACHE['timestamp'].astimezone(kst)).total_seconds() > CACHE_TIMEOUT_SECONDS
        else:
            is_expired = True # 처음 켰을 때는 무조건 갱신

        if force_reload or needs_reset or is_expired:
            print("💡 API 데이터를 수집합니다... (약 5~10초 소요)")
            try:
                raw_data = _fetch_and_process_data() 

                if raw_data:
                    GLOBAL_CACHE.update({
                        'data': raw_data,
                        'timestamp': now_kst, # 🚀 저장할 때도 무조건 KST로 저장!
                        'last_updated_str': now_kst.strftime("%Y-%m-%d %H:%M:%S")
                    })
                    print(f"✅ 데이터 캐싱 완료! (총 {len(raw_data)}개)")
            except Exception as e:
                print(f"데이터 수집 에러: {e}")
                traceback.print_exc()
            
    return GLOBAL_CACHE['data'], GLOBAL_CACHE['last_updated_str']