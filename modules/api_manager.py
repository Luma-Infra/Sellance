import requests
from datetime import datetime
import re
import sys
import os
import math
import json # ⭐️ 상단에 json 임포트 추가
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
import threading

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

# --- ⭐️ UX SETTINGS ⭐️ ---
PRICE_HIGH_THRESHOLD = 100  # 100달러 이상은 고가 자산으로 분류

import math

def format_dynamic_price(price):
    if price is None or price == 0:
        return "0.00"
    
    abs_price = abs(price)
    
    # 1. 고가주 케이스 (100달러 이상: 60000.1, 1000.2, 100.2)
    # 소수점 1자리로 고정하여 가독성 극대화
    if abs_price >= PRICE_HIGH_THRESHOLD:
        return f"{price:,.1f}"
    
    # 2. 중저가주 & 동전주 케이스 (유효숫자 4자리 확보 로직)
    try:
        # 로그를 이용해 소수점 아래 첫 유효숫자 위치 계산
        # 예: 0.001222 -> log10은 -2.91 -> floor는 -3
        first_sig_digit = math.floor(math.log10(abs_price))
        
        # 정밀도 계산: 첫 유효숫자 위치(절대값) + 추가 3자리 = 총 유효숫자 4자리
        # 예: 0.001222 (first_sig -3) -> precision 3 + 3 = 6자리 -> "0.001222"
        # 예: 45.6 (first_sig 1) -> precision |-1| + 3 = 4자리(?) -> 아래 max에서 보정
        precision = abs(first_sig_digit) + 3 if first_sig_digit < 0 else 2
        
        # 🚨 개선 포인트 1: 10~99달러 구간 (45.60 등) 보정
        # 유효숫자 4개를 위해 최소 2자리는 보여줘야 함
        if 10 <= abs_price < 100:
            precision = 2
        elif 1 <= abs_price < 10:
            precision = 3
            
        # 🚨 개선 포인트 2: 극단적 동전주 제한 (최대 10자리)
        # 소수점이 너무 길어지면 레이아웃 깨짐 방지
        precision = min(max(2, precision), 10)
        
        return f"{price:,.{precision}f}"
        
    except (ValueError, OverflowError):
        # 숫자가 너무 작아 로그 계산이 안 될 경우 기본값
        return f"{price:,.2f}"

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
    # ^(10+|1[MB])? : 시작부분의 10, 100, 1M, 1B 등을 그룹1로 캡처
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
        with ThreadPoolExecutor(max_workers=25) as executor:
            results = executor.map(_fetch_binance_open, binance_base_assets)
            for sym, open_p in results:
                if open_p: utc0_open_dict[sym] = open_p

        for ticker, price in p_dict.items():
            sym = ticker.replace('USDT', '')
            binance_data[ticker] = {
                'price': price,
                'change_24h': c_dict.get(ticker, 0.0),
                'utc0_open': utc0_open_dict.get(sym)
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
                    upbit_data[sym] = {
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
    import config
    base_assets = {t.replace('USDT', '') for t in binance_data.keys()}
    all_assets = base_assets.union(upbit_only_assets)

    asset_to_lookup_key = {}
    id_lookup, sym_lookup = [], []

    for a in all_assets:
        if a in EXCLUSION_LIST: continue
        if a in SYMBOL_TO_ID_MAP:
            cmc_id = SYMBOL_TO_ID_MAP[a]
            id_lookup.append(cmc_id)
            asset_to_lookup_key[a] = cmc_id
        else:
            norm = SPECIAL_SYMBOL_MAP.get(get_pure_base_asset(a), get_pure_base_asset(a))
            sym_lookup.append(norm)
            asset_to_lookup_key[a] = norm

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
# ==========================================
# 🧱 모듈 3: 데이터 조립 및 변동률 계산기 (완전 교체본)
# ==========================================
def build_final_market_list(binance_data, upbit_data, market_data_map, asset_to_lookup_key, upbit_krw_set, upbit_only_assets):
    global MAPPING_DATA
    PRICE_DIFFERENCE_THRESHOLD = 0.20
    # MAJOR_COINS = {'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'SUI'}
    SAVED_CHAIN_MAP = MAPPING_DATA.get("SAVED_CHAIN_MAP", {})

    # 🚀 1. 실시간 테더 환율 가져오기 (두나무 에러 방지)
    krw_usd_rate = 1400.0 
    try:
        tether_res = requests.get("https://api.upbit.com/v1/ticker?markets=KRW-USDT", timeout=3).json()
        if tether_res and len(tether_res) > 0:
            krw_usd_rate = float(tether_res[0]['trade_price'])
    except Exception as e:
        print(f"⚠️ 테더 환율 수집 실패, 기본값 {krw_usd_rate}원 사용")

    final_results = []
    is_mapping_updated = False

    # ---------------------------------------------------------
    # 1. 바이낸스 선물 조립
    # ---------------------------------------------------------
    for ticker, b_info in binance_data.items():
        base = get_pure_base_asset(ticker).upper()
        price = b_info['price']

        if not is_valid_ticker(base) and base not in SYMBOL_TO_ID_MAP: continue
        if base in EXCLUSION_LIST: continue

        info = market_data_map.get(asset_to_lookup_key.get(base))
        mcap = 0
        if info or base in MANUAL_SUPPLY_MAP:
            ucid = info.get('ucid', '') if info else ''
            logo = create_image_tag(f"https://s2.coinmarketcap.com/static/img/coins/128x128/{ucid}.png" if ucid else "")

            ch_sym = SAVED_CHAIN_MAP.get(base) or CHAIN_LOGO_MAP.get(base) or (info.get('chain_symbol') if info else '')
            chain = create_image_tag(CHAIN_LOGO_MAP.get(ch_sym, '')) if ch_sym in CHAIN_LOGO_MAP else ch_sym

            if ch_sym and base not in SAVED_CHAIN_MAP and base not in CHAIN_LOGO_MAP:
                SAVED_CHAIN_MAP[base] = ch_sym
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
                diff = abs(adj_p - cmc_p) / adj_p if adj_p > 0 else 1

                # if base in MAJOR_COINS or diff <= PRICE_DIFFERENCE_THRESHOLD:
                #     mcap = info.get('market_cap', 0)
                # else:
                #     continue
        else: continue

        utc0_open = round(b_info.get('utc0_open', 0), 8) if b_info.get('utc0_open') else 0.0
        change_today = round(((price - utc0_open) / utc0_open * 100), 2) if utc0_open and utc0_open > 0 else 0.0

        final_results.append({
            "Symbol": base, "DisplayTicker": ticker.replace('USDT', ''), "Ticker": ticker, 
            "Logo": logo, "Name": info.get('name', base) if info else base,
            "Chain": chain, "Upbit": 'O' if base in upbit_krw_set else 'X',
            "Price": format_dynamic_price(price), "Change_24h": format_change(b_info.get('change_24h', 0.0)),
            "Change_Today": format_change(change_today), "utc0_open": utc0_open,
            "Volume": info.get('volume_24h', 0) if info else 0, 
            "Volume_Formatted": format_volume_string(info.get('volume_24h', 0)) if info else "0", 
            "MarketCap": mcap, "MarketCap_Formatted": format_market_cap_string(mcap),
            "Note": NOTE_MAP.get(base, '')
        })

    # ---------------------------------------------------------
    # 2. 업비트 전용 조립 (🚨 철벽 방어 적용 완료)
    # ---------------------------------------------------------
    for base in upbit_only_assets:
        base = base.upper()
        if not is_valid_ticker(base) and base not in SYMBOL_TO_ID_MAP: continue

        info = market_data_map.get(asset_to_lookup_key.get(base))
        if not info or info.get('cmc_price') is None: continue

        ucid = info.get('ucid', '')
        logo = create_image_tag(f"https://s2.coinmarketcap.com/static/img/coins/128x128/{ucid}.png" if ucid else "")
        ch_sym = SAVED_CHAIN_MAP.get(base) or CHAIN_LOGO_MAP.get(base) or info.get('chain_symbol', '')
        chain = create_image_tag(CHAIN_LOGO_MAP.get(ch_sym, '')) if ch_sym in CHAIN_LOGO_MAP else ch_sym

        if ch_sym and base not in SAVED_CHAIN_MAP and base not in CHAIN_LOGO_MAP:
            SAVED_CHAIN_MAP[base] = ch_sym
            is_mapping_updated = True

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
        
        final_results.append({
            "Symbol": base, "DisplayTicker": base, "Ticker": f"{base}KRW", 
            "Logo": logo, "Name": info.get('name', base),
            "Chain": chain, "Upbit": 'O',
            "Price": format_dynamic_price(current_p), 
            "Price_KRW": up_price_krw if up_price_krw > 0 else None, # JS에서 원화 표기용
            "Change_24h": format_change(up_change_24h),
            "Change_Today": format_change(change_today), "utc0_open": utc0_open,
            "Volume": info.get('volume_24h', 0) if info else 0, 
            "Volume_Formatted": format_volume_string(info.get('volume_24h', 0)) if info else "0", 
            "MarketCap": info.get('market_cap', 0), 
            "MarketCap_Formatted": format_market_cap_string(info.get('market_cap', 0)),
            "Note": NOTE_MAP.get(base, 'Upbit Only')
        })

    return final_results, is_mapping_updated, SAVED_CHAIN_MAP
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

    # 4. JSON 덮어쓰기 (새 체인 발견 시)
    if is_mapping_updated:
        try:
            MAPPING_DATA["SAVED_CHAIN_MAP"] = updated_chain_map
            with open('mapping.json', 'w', encoding='utf-8') as f:
                json.dump(MAPPING_DATA, f, indent=4, ensure_ascii=False)
            print("💾 [System] 새로운 체인 정보가 mapping.json에 영구 저장되었습니다.")
        except Exception as e:
            print(f"[System] mapping.json 자동 저장 실패: {e}")

    # 5. 시총 정렬 후 반환
    final_results.sort(key=lambda x: x.get('MarketCap', 0), reverse=True)
    return final_results

data_lock = threading.Lock()
def get_cached_data(force_reload=False):
    global GLOBAL_CACHE
    with data_lock: # 👈 여기서 딱 한 명만 진입 가능! 나머지는 줄 서서 기다림
        if force_reload or (datetime.now() - GLOBAL_CACHE['timestamp']).total_seconds() > CACHE_TIMEOUT_SECONDS:
            print("💡 API 데이터를 수집합니다... (약 5~10초 소요)")
            try:
                # with suppress_output():
                raw_data = _fetch_and_process_data() 

                if raw_data:
                    GLOBAL_CACHE.update({
                        'data': raw_data,
                        'timestamp': datetime.now(),
                        'last_updated_str': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    })
                    print(f"✅ 데이터 캐싱 완료! (총 {len(raw_data)}개)")
            except Exception as e:
                print(f"데이터 수집 에러: {e}")
            
    return GLOBAL_CACHE['data'], GLOBAL_CACHE['last_updated_str']