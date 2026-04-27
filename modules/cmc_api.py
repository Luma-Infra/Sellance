# ==========================================
# 🧱 모듈 2: 코인마켓캡(CMC) 정보 수집기
# ==========================================

from concurrent.futures import ThreadPoolExecutor
from logging import config

import requests
from modules import config_manager

# 2. 이름표 9개를 순서대로 나열해서 한 방에 언패킹!

from modules.utils import get_pure_base_asset, is_valid_ticker

def _fetch_cmc_api_chunk(task):
    url, headers, params = task
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        resp.raise_for_status()
        if resp.text: return resp.json()
    except Exception as e:
        # 🚨 [핵심] 범인의 얼굴을 확인하기 위해 에러 내용과 파라미터를 출력합니다!
        print(f"🚨 [CMC 폭파] API 에러 발생: {e}")
        print(f"🚨 실패한 심볼 목록: {params.get('symbol', 'UID 요청임')}")
        return None

# 심볼 검사하고 ID로 찌를지 티커로 찌를지 대기열(queue) 만드는 로직.
def build_cmc_lookup_lists(all_assets, binance_base_set, MAPPING_DATA):
    id_lookup, sym_lookup = [], []
    asset_to_lookup_key = {}
    
    # 🚀 단 한 줄로 9개 족보 명단을 싹 다 가져옵니다.
    (   
     NOTE_MAP, 
     TICKER_DATA, CHAIN_LOGO_MAP, 
     EXCLUSION_LIST, DUPLICATED_LIST, 
     SYMBOL_TO_ID_MAP, MANUAL_SUPPLY_MAP, SPECIAL_SYMBOL_MAP, HARDCODE_VERIFY_SKIP_LIST
    ) = config_manager.get_mapping_parts(MAPPING_DATA)

    # 역방향 족보 생성
    REVERSE_LOOKUP = {f"{v[2].upper()}_{v[3].upper()}": k for k, v in DUPLICATED_LIST.items() if len(v) >= 4}

    for a in all_assets:
        if a in EXCLUSION_LIST: continue
        
        # 🚀 [방역] 만기일 티커 등 불량 티커 원천 차단
        if not is_valid_ticker(a) or "_" in a:
            continue

        exchange_tag = "BINANCE" if a in binance_base_set else "UPBIT"
        alias_name = REVERSE_LOOKUP.get(f"{a.upper()}_{exchange_tag}", a)

        # 🚀 3단계 족보 수사
        # 1. 중복 리스트 / 2. 고정 ID 맵 / 3. 이미 저장된 TICKER_DATA
        cmc_id = None
        if alias_name in DUPLICATED_LIST:
            cmc_id = str(DUPLICATED_LIST[alias_name][0])
        elif alias_name in SYMBOL_TO_ID_MAP:
            cmc_id = str(SYMBOL_TO_ID_MAP[alias_name])
        elif alias_name in TICKER_DATA:
            cmc_id = str(TICKER_DATA[alias_name][0])

        if cmc_id:
            id_lookup.append(cmc_id)
            asset_to_lookup_key[f"{exchange_tag}_{a.upper()}"] = cmc_id
        else:
            # 4. 진짜 신입 (이름으로 조회)
            norm = SPECIAL_SYMBOL_MAP.get(get_pure_base_asset(a), get_pure_base_asset(a))
            if is_valid_ticker(norm) and "_" not in norm:
                sym_lookup.append(norm)
                asset_to_lookup_key[f"{exchange_tag}_{a.upper()}"] = norm
                
    return list(set(id_lookup)), list(set(sym_lookup)), asset_to_lookup_key

# CMC 단일 묶음 호출기.
def fetch_cmc_market_data(binance_data, upbit_only_assets, MAPPING_DATA):
    # 1. 전체 자산 목록 합치기
    binance_base_set = {t.replace('USDT', '') for t in binance_data.keys()}
    all_assets = binance_base_set.union(upbit_only_assets)

    # 2. 조회 명단 작성 (UID파 vs 티커파)
    id_lookup, sym_lookup, asset_to_lookup_key = build_cmc_lookup_lists(all_assets, binance_base_set, MAPPING_DATA)

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
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(_fetch_cmc_api_chunk, quote_tasks))

    for res in results:
        if not res or 'data' not in res: continue
        for k, v in res['data'].items():
            # CMC 응답 구조 처리 (리스트 혹은 딕셔너리)
            info = v[0] if isinstance(v, list) and v else v
            if not info or 'quote' not in info: continue
            
            q = info['quote']['USD']
            platform = info.get('platform')
            
            market_data_map[k] = {
                'name': info.get('name'),
                'market_cap': q.get('market_cap'),
                'cmc_price': q.get('price'),
                'volume_24h': q.get('volume_24h'),
                'ucid': str(info.get('id')),
                'chain_symbol': platform.get('symbol') if platform else info.get('symbol', ''),
                'tags': ",".join([t['name'] for t in info.get('tags', [])]) if isinstance(info.get('tags'), list) else ""
            }
            
    return market_data_map