# exchange_api.py
from concurrent.futures import ThreadPoolExecutor, wait
import requests
from modules import config_manager, utils

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

def fetch_global_listings():
    """8대 메이저 거래소 중 외부 5개(OKX, BYBIT, BITGET, GATEIO, COINBASE) 현물 상장 수집"""
    listings = {}
    
    def add_tags(coins, tag):
        for c in coins:
            base = c.upper()
            if base not in listings: listings[base] = set()
            listings[base].add(tag)
            
    def get_okx():
        try: add_tags([i['baseCcy'] for i in requests.get("https://www.okx.com/api/v5/public/instruments?instType=SPOT", timeout=5).json().get('data', [])], 'OKX')
        except: pass
    def get_bybit():
        try: add_tags([i['baseCoin'] for i in requests.get("https://api.bybit.com/v5/market/instruments-info?category=spot", timeout=5).json().get('result', {}).get('list', [])], 'BYBIT')
        except: pass
    def get_bitget():
        try: add_tags([i['baseCoin'] for i in requests.get("https://api.bitget.com/api/v2/spot/public/symbols", timeout=5).json().get('data', [])], 'BITGET')
        except: pass
    def get_gateio():
        try: add_tags([i['base'] for i in requests.get("https://api.gateio.ws/api/v4/spot/currency_pairs", timeout=5).json()], 'GATEIO')
        except: pass
    def get_coinbase():
        try: add_tags([i['base_currency'] for i in requests.get("https://api.exchange.coinbase.com/products", timeout=5).json()], 'COINBASE')
        except: pass

    # 🚀 병렬로 5개 대문 동시 타격
    target_funcs = [get_okx, get_bybit, get_bitget, get_gateio, get_coinbase]
    with ThreadPoolExecutor(max_workers=len(target_funcs)) as executor:
        futures = [executor.submit(func) for func in target_funcs]
        wait(futures)  # 👈 깔끔하게 한 줄로 끝!
            
    return listings

# ==========================================
# 🧱 모듈 1: 거래소 시세 수집기 (바낸 업비트 빗썸)
# ==========================================

def fetch_exchange_market_data(mapping):
    (   
     NOTE_MAP, 
     TICKER_DATA, CHAIN_LOGO_MAP, 
     EXCLUSION_LIST, DUPLICATED_LIST, 
     SYMBOL_TO_ID_MAP, MANUAL_SUPPLY_MAP, SPECIAL_SYMBOL_MAP, HARDCODE_VERIFY_SKIP_LIST
    ) = config_manager.get_mapping_parts(mapping)
        
    # 1. 기초 마켓 리스트 확보
    upbit_krw_set, bithumb_krw_set = get_korean_exchange_markets()
    
    # 2. 바이낸스 타격
    binance_data, binance_base_assets = fetch_binance_futures_spot()
    binance_pure = {utils.get_pure_base_asset(a) for a in binance_base_assets}

    # 3. 족보 생성 및 업비트 전용 자산 필터링
    REVERSE_LOOKUP = {f"{v[2].upper()}_{v[3].upper()}": k for k, v in DUPLICATED_LIST.items() if len(v) >= 4}

    upbit_only_assets = set()
    for k in upbit_krw_set:
        if k in EXCLUSION_LIST or utils.is_scaled_symbol(k): continue
        alias_upbit = REVERSE_LOOKUP.get(f"{k.upper()}_UPBIT", k)
        alias_binance = REVERSE_LOOKUP.get(f"{k.upper()}_BINANCE", k)
        
        if k not in binance_pure or alias_upbit != alias_binance:
            upbit_only_assets.add(k)

    # 4. 업비트 시세 타격
    upbit_data = fetch_upbit_prices(upbit_only_assets)

    return binance_data, upbit_data, upbit_krw_set, upbit_only_assets, bithumb_krw_set

# 9시 시가 수집
def fetch_binance_open(task):
    """(보조) 선물/현물 구분해서 9시 시가 수집 (task: (symbol, is_futures))"""
    symbol, is_futures = task
    
    # 🚀 누님의 설계대로 분기점 생성
    if is_futures:
        # 선물 전용 주소
        url = f"https://fapi.binance.com/fapi/v1/klines?symbol={symbol}USDT&interval=1d&limit=1"
    else:
        # 현물 전용 주소
        url = f"https://api.binance.com/api/v3/klines?symbol={symbol}USDT&interval=1d&limit=1"
        
    try:
        res = requests.get(url, timeout=5).json()
        if res and isinstance(res, list) and len(res) > 0:
            return symbol, float(res[0][1])
    except Exception as e:
        # 🚨 실패 시 로그 (어느 쪽에서 터졌는지 알 수 있게 url 슬쩍 노출)
        print(f"🚨 [시가 에러] {symbol} ({'선물' if is_futures else '현물'}): {e}")
        
    return symbol, None

# 바낸 선물/현물 수집 및 합치기 (새로 생성)
def fetch_binance_futures_spot():
    binance_data = {}
    binance_base_assets = set()
    
    try:
        # 1. 기초 데이터 수집 (선물/현물 마켓 정보 및 24시간 시세)
        info_f = requests.get("https://fapi.binance.com/fapi/v1/exchangeInfo").json()
        prices_f = requests.get("https://fapi.binance.com/fapi/v1/ticker/24hr").json()
        active_f = {s['symbol'] for s in info_f['symbols'] if s['status'] == 'TRADING' and s['quoteAsset'] == 'USDT'}

        info_s = requests.get("https://api.binance.com/api/v3/exchangeInfo").json()
        prices_s = requests.get("https://api.binance.com/api/v3/ticker/24hr").json()
        active_s = {s['symbol'] for s in info_s['symbols'] if s['status'] == 'TRADING' and s['quoteAsset'] == 'USDT'}

        # 2. 정밀도(Precision) 맵 생성
        b_precisions = {}
        for s in info_f['symbols'] + info_s['symbols']:
            if s['quoteAsset'] == 'USDT' and s['symbol'] not in b_precisions:
                f = {filt['filterType']: filt for filt in s['filters']}
                b_precisions[s['symbol']] = utils.get_precision(f.get('PRICE_FILTER', {}).get('tickSize', '0.01'))

        # 3. 딕셔너리 정리 (선물/현물)
        f_dict = {i['symbol']: {'price': float(i['lastPrice']), 'change_24h': float(i['priceChangePercent']), 'vol': float(i['quoteVolume'])} 
                  for i in prices_f if i['symbol'] in active_f}
        s_dict = {i['symbol']: {'price': float(i['lastPrice']), 'change_24h': float(i['priceChangePercent']), 'vol': float(i['quoteVolume'])} 
                  for i in prices_s if i['symbol'] in active_s}

        all_active = active_f.union(active_s)

        # 4. 🚀 9시 시가 병렬 수집 가동
        open_price_tasks = [(ticker.replace('USDT', ''), ticker in active_f) for ticker in all_active]
        utc0_open_dict = {}
        with ThreadPoolExecutor(max_workers=25) as executor:
            results = executor.map(fetch_binance_open, open_price_tasks)
            for sym, open_p in results:
                if open_p: utc0_open_dict[sym] = open_p

        # 5. 최종 데이터 합치기
        for ticker in all_active:
            sym = ticker.replace('USDT', '')
            binance_base_assets.add(sym)
            f_data, s_data = f_dict.get(ticker, {}), s_dict.get(ticker, {})
            
            binance_data[ticker] = {
                'price': f_data.get('price', s_data.get('price', 0)),
                'change_24h': f_data.get('change_24h', s_data.get('change_24h', 0)),
                'vol_futures': f_data.get('vol', 0.0),
                'vol_spot': s_data.get('vol', 0.0),
                'precision': b_precisions.get(ticker, 2),
                'is_spot_only': ticker not in active_f,
                'is_futures': ticker in active_f,
                'is_spot': ticker in active_s,
                'utc0_open': utc0_open_dict.get(sym)
            }
    except Exception as e:
        print(f"🚨 [바이낸스 수집 에러]: {e}")

    return binance_data, binance_base_assets

# 업비트 가격 수집 (새로 생성)
def fetch_upbit_prices(upbit_only_assets):
    upbit_data = {}
    if not upbit_only_assets: return upbit_data

    upbit_list = list(upbit_only_assets)
    for i in range(0, len(upbit_list), 100):
        try:
            chunk = upbit_list[i:i+100]
            markets_str = ",".join([f"KRW-{k}" for k in chunk])
            res = requests.get(f"https://api.upbit.com/v1/ticker?markets={markets_str}", timeout=5).json()
            
            for item in res:
                sym = item['market'].replace('KRW-', '')
                upbit_data[sym] = {
                    'raw_item': item,
                    'price': item['trade_price'],
                    'utc0_open': item['opening_price'],
                    'change_24h': item.get('signed_change_rate', 0.0) * 100
                }
        except Exception as e:
            print(f"🚨 [업비트 수집 에러 (Chunk)]: {e}")

    return upbit_data

