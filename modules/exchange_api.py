# exchange_api.py
from concurrent.futures import ThreadPoolExecutor, wait
import requests
from modules import config_manager, utils
from modules.utils import is_valid_ticker
from datetime import datetime
import json
import os

# 🚀 9시 시가 캐시 (메모리 & 파일)
UTC0_CACHE_FILE = "utc0_prices.json"
UTC0_OPEN_CACHE = {}

def load_utc0_cache():
    global UTC0_OPEN_CACHE
    if os.path.exists(UTC0_CACHE_FILE):
        try:
            with open(UTC0_CACHE_FILE, "r") as f:
                UTC0_OPEN_CACHE = json.load(f)
        except:
            UTC0_OPEN_CACHE = {}

def save_utc0_cache():
    try:
        with open(UTC0_CACHE_FILE, "w") as f:
            json.dump(UTC0_OPEN_CACHE, f)
    except:
        pass

# 초기 로드
load_utc0_cache()


def get_korean_exchange_markets():
    upbit_krw_set, bithumb_krw_set = set(), set()
    try:
        res = requests.get("https://api.upbit.com/v1/market/all?isDetails=false").json()
        for m in res:
            if m["market"].startswith("KRW-"):
                upbit_krw_set.add(m["market"].replace("KRW-", ""))
    except Exception as e:
        print(f"🚨 [디버그] 업비트 마켓 목록 에러: {e}")  # 👈 pass 대신 추가!
    try:
        res = requests.get(
            "https://api.bithumb.com/v1/market/all?isDetails=false"
        ).json()
        for m in res:
            if m["market"].startswith("KRW-"):
                bithumb_krw_set.add(m["market"].replace("KRW-", ""))
    except Exception as e:
        print(f"🚨 [디버그] 빗썸 마켓 목록 에러: {e}")  # 👈 pass 대신 추가!
    return upbit_krw_set, bithumb_krw_set


def fetch_global_listings():
    """8대 메이저 거래소 중 외부 5개(OKX, BYBIT, BITGET, GATEIO, COINBASE) 현물 상장 수집"""
    listings = {}

    def add_tags(coins, tag):
        for c in coins:
            base = c.upper()
            if base not in listings:
                listings[base] = set()
            listings[base].add(tag)

    def get_okx():
        try:
            add_tags(
                [
                    i["baseCcy"]
                    for i in requests.get(
                        "https://www.okx.com/api/v5/public/instruments?instType=SPOT",
                        timeout=5,
                    )
                    .json()
                    .get("data", [])
                ],
                "OKX",
            )
        except:
            pass

    def get_bybit():
        try:
            add_tags(
                [
                    i["baseCoin"]
                    for i in requests.get(
                        "https://api.bybit.com/v5/market/instruments-info?category=spot",
                        timeout=5,
                    )
                    .json()
                    .get("result", {})
                    .get("list", [])
                ],
                "BYBIT",
            )
        except:
            pass

    def get_bitget():
        try:
            add_tags(
                [
                    i["baseCoin"]
                    for i in requests.get(
                        "https://api.bitget.com/api/v2/spot/public/symbols", timeout=5
                    )
                    .json()
                    .get("data", [])
                ],
                "BITGET",
            )
        except:
            pass

    def get_gateio():
        try:
            add_tags(
                [
                    i["base"]
                    for i in requests.get(
                        "https://api.gateio.ws/api/v4/spot/currency_pairs", timeout=5
                    ).json()
                ],
                "GATEIO",
            )
        except:
            pass

    def get_coinbase():
        try:
            add_tags(
                [
                    i["base_currency"]
                    for i in requests.get(
                        "https://api.exchange.coinbase.com/products", timeout=5
                    ).json()
                ],
                "COINBASE",
            )
        except:
            pass

    # 🚀 병렬로 5개 대문 동시 타격
    target_funcs = [get_okx, get_bybit, get_bitget, get_gateio, get_coinbase]
    try:
        with ThreadPoolExecutor(max_workers=len(target_funcs)) as executor:
            futures = [executor.submit(func) for func in target_funcs]
            wait(futures)
    except RuntimeError:
        # 종료 중이면 조용히 리턴
        return listings

    return listings


# ==========================================
# 🧱 모듈 1: 거래소 시세 수집기 (바낸 업비트 빗썸)
# ==========================================


def fetch_exchange_market_data(mapping):
    (
        NOTE_MAP,
        TICKER_DATA,
        CHAIN_LOGO_MAP,
        EXCLUSION_LIST,
        DUPLICATED_LIST,
        SYMBOL_TO_ID_MAP,
        MANUAL_SUPPLY_MAP,
        SPECIAL_SYMBOL_MAP,
        HARDCODE_VERIFY_SKIP_LIST,
    ) = config_manager.get_mapping_parts(mapping)

    # 1. 기초 마켓 리스트 확보
    upbit_krw_set, bithumb_krw_set = get_korean_exchange_markets()

    # 2. 거래소 타격 (병렬 처리 가능하면 좋겠지만 일단 순차로!)
    binance_data, binance_base_assets = fetch_binance_futures_spot()
    bybit_data = fetch_bybit_prices()  # 🚀 [추가] 바이비트 데이터 긁어오기

    binance_pure = {utils.get_pure_base_asset(a) for a in binance_base_assets}

    # 3. 족보 생성 및 업비트 전용 자산 필터링
    REVERSE_LOOKUP = {
        f"{v[2].upper()}_{v[3].upper()}": k
        for k, v in DUPLICATED_LIST.items()
        if len(v) >= 4
    }

    upbit_only_assets = set()
    for k in upbit_krw_set:
        if k in EXCLUSION_LIST or utils.is_scaled_symbol(k):
            continue
        alias_upbit = REVERSE_LOOKUP.get(f"{k.upper()}_UPBIT", k)
        alias_binance = REVERSE_LOOKUP.get(f"{k.upper()}_BINANCE", k)

        if k not in binance_pure or alias_upbit != alias_binance:
            upbit_only_assets.add(k)

    # 4. 업비트 시세 타격
    upbit_data = fetch_upbit_prices(upbit_only_assets)

    return (
        binance_data,
        upbit_data,
        upbit_krw_set,
        upbit_only_assets,
        bithumb_krw_set,
        bybit_data,
    )


# 전역 세션 객체 생성 (커넥션 풀링을 통한 속도 극대화)
api_session = requests.Session()
# 🚀 [FIX] 커넥션 풀 사이즈 확장 (기본 10 -> 100)
adapter = requests.adapters.HTTPAdapter(pool_connections=100, pool_maxsize=100)
api_session.mount("https://", adapter)
api_session.mount("http://", adapter)


def capture_utc0_prices_bulk():
    """
    🚀 [최적화 핵심] 9시 정각에 전체 티커를 벌크로 긁어서 시가를 고정합니다.
    개별 klines 호출 600번을 단 1번의 벌크 호출로 대체!
    """
    global UTC0_OPEN_CACHE
    print("🎯 [SCEDULER] KST 09:00 시가 벌크 캡처 개시...")
    
    try:
        # 선물/현물 벌크 시세 동시 타격
        res_f = api_session.get("https://fapi.binance.com/fapi/v1/ticker/24hr", timeout=5).json()
        res_s = api_session.get("https://api.binance.com/api/v3/ticker/24hr", timeout=5).json()
        
        today_str = datetime.now().strftime("%Y-%m-%d")
        if today_str not in UTC0_OPEN_CACHE:
            UTC0_OPEN_CACHE[today_str] = {}

        # 데이터 매핑
        for item in (res_f + res_s):
            sym = item['symbol'].replace('USDT', '')
            if is_valid_ticker(sym):
                # 현재 시점의 가격을 오늘의 시가로 고정!
                UTC0_OPEN_CACHE[today_str][sym] = float(item['lastPrice'])
        
        save_utc0_cache()
        print(f"✅ [SUCCESS] {today_str} 시가 벌크 저장 완료 ({len(UTC0_OPEN_CACHE[today_str])}개)")
    except Exception as e:
        print(f"🚨 [ERROR] 시가 벌크 캡처 실패: {e}")

def get_utc0_open_price(symbol, is_futures):
    """캐시된 시가가 있으면 반환, 없으면 개별 klines 호출 (보험)"""
    today_str = datetime.now().strftime("%Y-%m-%d")
    cached = UTC0_OPEN_CACHE.get(today_str, {}).get(symbol)
    if cached:
        return cached
        
    # 캐시 없으면 (서버가 9시 이후에 켜진 경우 등) 개별 호출 실행
    return fetch_binance_open((symbol, is_futures))[1]

# 9시 시가 수집
def fetch_binance_open(task):
    """(보조) 선물/현물 구분해서 9시 시가 수집 (task: (symbol, is_futures))"""
    symbol, is_futures = task

    # 🚀 설계대로 분기점 생성
    if is_futures:
        # 선물 전용 주소
        url = f"https://fapi.binance.com/fapi/v1/klines?symbol={symbol}USDT&interval=1d&limit=1"
    else:
        # 현물 전용 주소
        url = f"https://api.binance.com/api/v3/klines?symbol={symbol}USDT&interval=1d&limit=1"

    try:
        res = api_session.get(url, timeout=5).json()
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
        # 1. 기초 데이터 수집 (선물/현물 마켓 정보, 24시간 시세, 펀딩비 병렬 타격)
        urls = [
            "https://fapi.binance.com/fapi/v1/exchangeInfo",
            "https://fapi.binance.com/fapi/v1/ticker/24hr",
            "https://api.binance.com/api/v3/exchangeInfo",
            "https://api.binance.com/api/v3/ticker/24hr",
            "https://fapi.binance.com/fapi/v1/premiumIndex",  # 🚀 펀딩비 추가
        ]

        def fetch_url_safe(url):
            try:
                r = api_session.get(url, timeout=5)
                if r.status_code == 200:
                    return r.json()
            except Exception as e:
                print(f"⚠️ [API 개별 실패] {url}: {e}")
            return None

        with ThreadPoolExecutor(max_workers=5) as executor:
            # 🚀 [수정] map 대신 직접 submit 하여 에러 발생 시에도 개별 제어 가능하게 변경
            futures = [executor.submit(fetch_url_safe, url) for url in urls]
            results = [f.result() for f in futures]

            info_f = results[0] or {"symbols": []}
            prices_f = results[1] or []
            info_s = results[2] or {"symbols": []}
            prices_s = results[3] or []
            premium_f = results[4] or []

        # 2. 마켓 필터링 (데이터가 있을 때만 진행)
        active_f = {
            s["symbol"]
            for s in info_f.get("symbols", [])
            if s.get("status") == "TRADING"
            and s.get("quoteAsset") == "USDT"
            and is_valid_ticker(s.get("symbol").replace("USDT", ""))
        }
        active_s = {
            s["symbol"]
            for s in info_s.get("symbols", [])
            if s.get("status") == "TRADING"
            and s.get("quoteAsset") == "USDT"
            and is_valid_ticker(s.get("symbol").replace("USDT", ""))
        }

        # 3. 정밀도(Precision) 및 펀딩비 맵 생성
        b_precisions = {}
        for s in info_f.get("symbols", []) + info_s.get("symbols", []):
            if s.get("quoteAsset") == "USDT" and s.get("symbol") not in b_precisions:
                f_list = s.get("filters", [])
                tick_size = "0.01"
                for filt in f_list:
                    if filt.get("filterType") == "PRICE_FILTER":
                        tick_size = filt.get("tickSize", "0.01")
                        break
                b_precisions[s["symbol"]] = utils.get_precision(tick_size)

        # 🚀 펀딩비 맵
        funding_map = {}
        if isinstance(premium_f, list):
            funding_map = {
                item["symbol"]: float(item["lastFundingRate"])
                for item in premium_f
                if "lastFundingRate" in item
            }

        # 3. 딕셔너리 정리 (데이터 타입 검증 추가)
        f_dict = {}
        if isinstance(prices_f, list):
            f_dict = {
                i["symbol"]: {
                    "price": float(i.get("lastPrice", 0)),
                    "change_24h": float(i.get("priceChangePercent", 0)),
                    "vol": float(i.get("quoteVolume", 0)),
                }
                for i in prices_f
                if isinstance(i, dict) and i.get("symbol") in active_f
            }

        s_dict = {}
        if isinstance(prices_s, list):
            s_dict = {
                i["symbol"]: {
                    "price": float(i.get("lastPrice", 0)),
                    "change_24h": float(i.get("priceChangePercent", 0)),
                    "vol": float(i.get("quoteVolume", 0)),
                }
                for i in prices_s
                if isinstance(i, dict) and i.get("symbol") in active_s
            }

        all_active = active_f.union(active_s)

        # 4. 🚀 9시 시가 수집 (캐시 우선, 없으면 병렬 개별 호출)
        today_str = datetime.now().strftime("%Y-%m-%d")
        day_cache = UTC0_OPEN_CACHE.get(today_str, {})
        
        open_price_tasks = []
        utc0_open_dict = {}
        
        for ticker in all_active:
            sym = ticker.replace('USDT', '')
            if sym in day_cache:
                utc0_open_dict[sym] = day_cache[sym]
            else:
                open_price_tasks.append((sym, ticker in active_f))

        if open_price_tasks:
            print(f"⏳ [시가 보정] 캐시 누락 {len(open_price_tasks)}건 개별 수집 중...")
            with ThreadPoolExecutor(max_workers=25) as executor:
                results = executor.map(fetch_binance_open, open_price_tasks)
                for sym, open_p in results:
                    if open_p: utc0_open_dict[sym] = open_p

        # 5. 최종 데이터 합치기
        for ticker in all_active:
            sym = ticker.replace("USDT", "")
            binance_base_assets.add(sym)
            f_data, s_data = f_dict.get(ticker, {}), s_dict.get(ticker, {})

            binance_data[ticker] = {
                "price": f_data.get("price", s_data.get("price", 0)),
                "change_24h": f_data.get("change_24h", s_data.get("change_24h", 0)),
                "vol_futures": f_data.get("vol", 0.0),
                "vol_spot": s_data.get("vol", 0.0),
                "precision": b_precisions.get(ticker, 2),
                "is_spot_only": ticker not in active_f,
                "is_futures": ticker in active_f,
                "is_spot": ticker in active_s,
                "utc0_open": utc0_open_dict.get(sym),
                "funding_rate": funding_map.get(ticker, 0.0),  # 🚀 펀딩비 꽂아넣기
            }
    except Exception as e:
        print(f"🚨 [바이낸스 수집 에러]: {e}")

    return binance_data, binance_base_assets


# 업비트 가격 수집 (새로 생성)
def fetch_upbit_prices(upbit_only_assets):
    upbit_data = {}
    if not upbit_only_assets:
        return upbit_data

    upbit_list = list(upbit_only_assets)
    for i in range(0, len(upbit_list), 100):
        try:
            chunk = upbit_list[i : i + 100]
            markets_str = ",".join([f"KRW-{k}" for k in chunk])
            res = api_session.get(
                f"https://api.upbit.com/v1/ticker?markets={markets_str}", timeout=5
            ).json()

            for item in res:
                sym = item["market"].replace("KRW-", "")
                upbit_data[sym] = {
                    "raw_item": item,
                    "price": item["trade_price"],
                    "utc0_open": item["opening_price"],
                    "change_24h": item.get("signed_change_rate", 0.0) * 100,
                }
        except Exception as e:
            print(f"🚨 [업비트 수집 에러 (Chunk)]: {e}")

    return upbit_data


def fetch_bybit_prices():
    bybit_data = {}
    try:
        # 1. 시세 (Ticker) 가져오기 - 현물 & 선물 통합
        res_f = api_session.get(
            "https://api.bybit.com/v5/market/tickers?category=linear", timeout=5
        ).json()
        res_s = api_session.get(
            "https://api.bybit.com/v5/market/tickers?category=spot", timeout=5
        ).json()

        f_list = res_f.get("result", {}).get("list", [])
        s_list = res_s.get("result", {}).get("list", [])

        # 2. 데이터 매핑 (티커별 spot/futures 가격 및 거래대금)
        for item in f_list:
            sym = item["symbol"]
            if sym.endswith("USDT") and is_valid_ticker(sym.replace("USDT", "")):
                base = sym.replace("USDT", "")
                if base not in bybit_data:
                    bybit_data[base] = {"volume_24h": 0.0}
                bybit_data[base]["futures_price"] = float(item.get("lastPrice", 0))
                bybit_data[base]["volume_24h"] += float(item.get("turnover24h", 0))

        for item in s_list:
            sym = item["symbol"]
            if sym.endswith("USDT") and is_valid_ticker(sym.replace("USDT", "")):
                base = sym.replace("USDT", "")
                if base not in bybit_data:
                    bybit_data[base] = {"volume_24h": 0.0}
                bybit_data[base]["spot_price"] = float(item.get("lastPrice", 0))
                bybit_data[base]["volume_24h"] += float(item.get("turnover24h", 0))

    except Exception as e:
        print(f"🚨 [바이비트 수집 에러]: {e}")
    return bybit_data
