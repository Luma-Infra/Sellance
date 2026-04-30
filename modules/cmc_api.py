# cmc_api.py
# ==========================================
# 🧱 모듈 2: 코인마켓캡(CMC) 정보 수집기
# ==========================================

from concurrent.futures import ThreadPoolExecutor
from logging import config
import re

import requests
from modules import config_manager

from modules import utils
from modules.utils import get_pure_base_asset, is_valid_ticker

def _fetch_cmc_api_chunk(task):
    url, headers, params = task
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        resp.raise_for_status()
        if resp.text: return resp.json()
    except Exception as e:
        # 에러가 나도 당황하지 않고 '어떤' 에러인지 깔끔하게 보고!
        if "timeout" in str(e).lower():
            print(f"⏳ [CMC 지연] {params.get('symbol')} 수집 중 시간 초과 (10초 경과)")
        else:
            print(f"🚨 [CMC 에러] {e} | 대상: {params.get('symbol')}")
        return None

# 심볼 검사하고 ID로 찌를지 티커로 찌를지 대기열(queue) 만드는 로직.
def build_cmc_lookup_lists(binance_base_set, upbit_krw_set, MAPPING_DATA):
    id_lookup, sym_lookup = [], []
    asset_to_lookup_key = {}
    
    (NOTE_MAP, TICKER_DATA, CHAIN_LOGO_MAP, EXCLUSION_LIST, DUPLICATED_LIST,
     SYMBOL_TO_ID_MAP, MANUAL_SUPPLY_MAP, SPECIAL_SYMBOL_MAP, HARDCODE_VERIFY_SKIP_LIST
    ) = config_manager.get_mapping_parts(MAPPING_DATA)

    REVERSE_LOOKUP = {f"{v[2].upper()}_{v[3].upper()}": k for k, v in DUPLICATED_LIST.items() if len(v) >= 4}

    # 🚀 공통 처리기 (함수 안의 함수로 깔끔하게!)
    def process_asset(a, exchange_tag):
        if a in EXCLUSION_LIST: return
        if not utils.is_valid_ticker(a) or "_" in a or re.search(r'\d{6}$', a): return

        lookup_name = f"{a.upper()}_{exchange_tag}" # 예: MET_BINANCE, MET_UPBIT
        alias_name = REVERSE_LOOKUP.get(lookup_name, a)

        cmc_id = None
        if lookup_name in SYMBOL_TO_ID_MAP:
            cmc_id = str(SYMBOL_TO_ID_MAP[lookup_name])
        elif alias_name in HARDCODE_VERIFY_SKIP_LIST:
            cmc_id = str(SYMBOL_TO_ID_MAP.get(alias_name, ""))
        elif alias_name in DUPLICATED_LIST:
            cmc_id = str(DUPLICATED_LIST[alias_name][0])
        elif alias_name in SYMBOL_TO_ID_MAP:
            cmc_id = str(SYMBOL_TO_ID_MAP[alias_name])
        elif alias_name in TICKER_DATA:
            cmc_id = str(TICKER_DATA[alias_name][0])

        if cmc_id and cmc_id != "None" and cmc_id != "":
            id_lookup.append(cmc_id)
            asset_to_lookup_key[lookup_name] = cmc_id
        else:
            norm = SPECIAL_SYMBOL_MAP.get(utils.get_pure_base_asset(a), utils.get_pure_base_asset(a))
            if utils.is_valid_ticker(norm) and "_" not in norm and norm.isascii():
                sym_lookup.append(norm)
                asset_to_lookup_key[lookup_name] = norm

    # 🚀 바이낸스와 업비트를 '각각' 돌립니다. 이제 EDGE와 MET가 둘 다 큐에 들어갑니다!
    for a in binance_base_set: process_asset(a, "BINANCE")
    for a in upbit_krw_set: process_asset(a, "UPBIT")
                
    return list(set(id_lookup)), list(set(sym_lookup)), asset_to_lookup_key

# CMC 단일 묶음 호출기.
def fetch_cmc_market_data(binance_data, upbit_krw_set, MAPPING_DATA):
    # 1. 전체 자산 목록 합치기
    binance_base_set = {t.replace('USDT', '') for t in binance_data.keys()}
    # all_assets = binance_base_set.union(upbit_only_assets)

    # 2. 조회 명단 작성 (UID파 vs 티커파)
    # 🚀 upbit_only_assets 파라미터를 버리고 전체 upbit_krw_set 받기
    id_lookup, sym_lookup, asset_to_lookup_key = build_cmc_lookup_lists(binance_base_set, upbit_krw_set, MAPPING_DATA)

    # 3. CMC API 실행
    market_data_map = execute_cmc_requests(id_lookup, sym_lookup)

    return market_data_map, asset_to_lookup_key

# ThreadPool 돌려서 CMC 데이터 긁어오고 market_data_map 만드는 로직.
def execute_cmc_requests(id_lookup, sym_lookup):
    import config
    url = 'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest'
    headers = {'Accepts': 'application/json', 'X-CMC_PRO_API_KEY': config.CMC_API_KEY}
    quote_tasks = []

    # ID 묶음 생성
    if id_lookup:
        quote_tasks.append((url, headers, {'id': ",".join(id_lookup), 'convert': 'USD'}))

    # 심볼 묶음 생성 (200개씩 청크)
    sym_list = [s.strip() for s in sym_lookup if s]
    for i in range(0, len(sym_list), 200):
        chunk = sym_list[i:i + 200]
        if chunk:
            quote_tasks.append((url, headers, {'symbol': ",".join(chunk), 'convert': 'USD'}))

    market_data_map = {}
    with ThreadPoolExecutor(max_workers=25) as executor:
        results = list(executor.map(_fetch_cmc_api_chunk, quote_tasks))

    for res in results:
        if not res or 'data' not in res: continue
        # (execute_cmc_requests 내부의 for문 로직)
        for k, v in res['data'].items():
            info = v[0] if isinstance(v, list) and v else v
            if not info or 'quote' not in info: continue
            
            q = info['quote']['USD']
            platform = info.get('platform')
            ucid_str = str(info.get('id', ''))
            
            # ✅ [문제 10 해결] UID 길이가 15자를 넘어가면 RWA로 간주!
            asset_type = 'RWA' if len(ucid_str) > 15 else 'CRYPTO'
            
            market_data_map[k] = {
                'name': info.get('name'),
                'market_cap': q.get('market_cap'),
                'cmc_price': q.get('price'),
                'volume_24h': q.get('volume_24h'),
                'ucid': ucid_str,
                'asset_type': asset_type, # 🚀 나중에 builder.py에서 분기할 때 쓰세요!
                'chain_symbol': platform.get('symbol') if platform else info.get('symbol', ''),
                'tags': ",".join([t['name'] for t in info.get('tags', [])]) if isinstance(info.get('tags'), list) else ""
            }   
    return market_data_map