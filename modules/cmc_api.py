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

   # 🚀 공통 처리기 (귀빈 대접 버전)
    def process_asset(a, exchange_tag):
        if a in EXCLUSION_LIST: return
        
        # 1순위: '원본 이름(a)' 그대로 하드코딩 맵에 있는지 확인 (최고 귀빈)
        cmc_id = None
        if a in SYMBOL_TO_ID_MAP:
            cmc_id = str(SYMBOL_TO_ID_MAP[a])

        # 2순위: 원본에 없을 때만 '숫자(배율)' 제거를 시도
        # PUMPBTC 같은 건 여기서 BTC가 안 잘리도록 고친 get_pure_base_asset이 작동함
        base = utils.get_pure_base_asset(a).upper()
        
        # [귀빈 예외] 원본과 배율 제거본이 다를 때(즉, 숫자만 붙었을 때) 하드코딩 맵 재조회
        if not cmc_id and a.upper() != base:
            if base in SYMBOL_TO_ID_MAP:
                cmc_id = str(SYMBOL_TO_ID_MAP[base])

        # 유효성 검사 (숫자 6자리 등 쓰레기 필터링)
        if not base or "_" in base or re.search(r'\d{6}$', base): return

        # 이름표 및 별칭 확정 (요청대로 BTC/ETH 자르기는 패스하므로 a를 우선 사용)
        lookup_name = f"{a.upper()}_{exchange_tag}"
        alias_name = REVERSE_LOOKUP.get(lookup_name, a.upper()) 

        # 3순위: 중복 리스트(별명) 및 족보 확인
        if not cmc_id:
            if alias_name in DUPLICATED_LIST:
                cmc_id = str(DUPLICATED_LIST[alias_name][0])
            elif alias_name in TICKER_DATA:
                cmc_id = str(TICKER_DATA[alias_name][0])

        # --- 장부 기록 ---
        if cmc_id and cmc_id not in ["None", ""]:
            id_lookup.append(cmc_id)
            asset_to_lookup_key[lookup_name] = cmc_id
        else:
            # 하드코딩 없으면 원본(a) 혹은 배율 제거본(base)으로 CMC 타격
            # 숫자가 붙었던 녀석은 base로, 일반 합성어는 a 그대로 보냄
            target_name = base if a.upper() != base else a.upper()
            sym_lookup.append(target_name)
            asset_to_lookup_key[lookup_name] = target_name

    # 🚀 바이낸스와 업비트를 '각각' 돌립니다. 이제 EDGE와 MET가 둘 다 큐에 들어갑니다!
    for base in binance_base_set: process_asset(base, "BINANCE")
    for base in upbit_krw_set: process_asset(base, "UPBIT")
                
    return list(set(id_lookup)), list(set(sym_lookup)), asset_to_lookup_key

# CMC 단일 묶음 호출기.
def fetch_cmc_market_data(binance_data, upbit_krw_set, MAPPING_DATA):
    # 1. 전체 자산 목록 합치기
    binance_base_set = {utils.get_pure_base_asset(t.replace('USDT', '')).upper() for t in binance_data.keys()}    # all_assets = binance_base_set.union(upbit_only_assets)

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
    results = []
    try:
        with ThreadPoolExecutor(max_workers=25) as executor:
            results = list(executor.map(_fetch_cmc_api_chunk, quote_tasks))
    except RuntimeError:
        # 인터프리터 종료 중이면 그냥 빈 결과 리턴 (에러 방지)
        return {}

    for res in results:
        if not res or 'data' not in res: continue
        for k, v in res['data'].items():
            info = v[0] if isinstance(v, list) and v else v
            if not info or 'quote' not in info: continue
            
            q = info['quote']['USD']
            ucid_str = str(info.get('id', ''))
            
            # 🚀 [핵심] builder가 찾기 쉽게 공통 데이터 맵을 만듭니다.
            asset_info = {
                'name': info.get('name'),
                'market_cap': q.get('market_cap'),
                'cmc_price': q.get('price'),
                'volume_24h': q.get('volume_24h'),
                'ucid': ucid_str,
                'chain_symbol': info.get('platform', {}).get('symbol') if info.get('platform') else info.get('symbol', ''),
            }
            
            # ✅ [최후 통첩] 숫자 ID(k)와 티커(Symbol) 둘 다 장부에 기록하세요!
            market_data_map[str(k)] = asset_info         # ID로 찾을 때 대비
            if info.get('symbol'):
                market_data_map[info['symbol'].upper()] = asset_info  # 티커로 찾을 때 대비
                
    return market_data_map