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
import math
import pytz
import sys
import re
import os

# ✅ 수정 (옆방 부하들 호출하는 정석)
from . import api_manager, builder, cmc_api, exchange_api, config_manager, utils

# 1. 여기서 딱 한 번 로드한다 (최신본)
mapping = config_manager.load_mapping_data()

# 2. 거래소 데이터 수집 (부하들 총동원)
(
    binance_data, 
    upbit_data, 
    upbit_krw_set, 
    bithumb_krw_set, 
    upbit_only_assets
) = exchange_api.fetch_exchange_market_data(mapping)

# 3. CMC 데이터 수집
market_data_map, asset_to_lookup_key = cmc_api.fetch_cmc_market_data(
    binance_data, upbit_only_assets, mapping
)

# 4. 상장 족보 수집
global_listings = exchange_api.fetch_global_listings()

# 2. 부하들에게 "이거 보고 조립해"라고 던져준다
# 🚀 5. [여기가 핵심!] 빼먹은 것 없이 싹 다 던져주기

# final_data, is_updated = builder.assemble_final_dashboard(
#     global_listings, 
#     binance_data, 
#     upbit_data, 
#     market_data_map, 
#     asset_to_lookup_key, 
#     upbit_krw_set, 
#     bithumb_krw_set, 
#     upbit_only_assets, 
#     mapping 
# )

# 마지막 보따리까지!
# (파일 상단의 임포트와 글로벌 설정, format 함수들은 그대로 두시면 됩니다!)

# --- ⭐️ GLOBAL CACHE SETTINGS ⭐️ ---
GLOBAL_CACHE = {
    'data': [],
    'timestamp': datetime.min,
    'last_updated_str': ""
}
CACHE_TIMEOUT_SECONDS = 3600 # 1시간

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

# ==========================================
# 👑 최종 함수 BOSS
# ==========================================
def _fetch_and_process_data():
    global MAPPING_DATA
    
    # 🚀 1. 족보 로드 (항상 최신본으로 시작!)
    MAPPING_DATA = config_manager.load_mapping_data()
    (   
     NOTE_MAP, 
     TICKER_DATA, CHAIN_LOGO_MAP, 
     EXCLUSION_LIST, DUPLICATED_LIST, 
     SYMBOL_TO_ID_MAP, MANUAL_SUPPLY_MAP, SPECIAL_SYMBOL_MAP, HARDCODE_VERIFY_SKIP_LIST
    ) = config_manager.get_mapping_parts(MAPPING_DATA)
        
    # 1. 시세 수집
    binance_data, upbit_data, upbit_krw_set, upbit_only_assets, bithumb_krw_set, = exchange_api.fetch_exchange_market_data()
    # 2. 정보 수집 (CMC)
    market_data_map, asset_to_lookup_key = cmc_api.fetch_cmc_market_data(binance_data, upbit_only_assets)
    # 3. 조립 및 계산
    
    # 🚀 [추가] 조립 직전에 글로벌 상장 족보 긁어오기
    global_listings = exchange_api.fetch_global_listings()
    
    final_results, is_mapping_updated, updated_chain_map = exchange_api.build_final_market_list(
        global_listings, binance_data, upbit_data, market_data_map, asset_to_lookup_key, upbit_krw_set, upbit_only_assets, bithumb_krw_set
    )
    
    all_live_assets = binance_data.keys() | upbit_krw_set # 현재 살아있는 모든 티커(원본)
    live_bases = {utils.get_pure_base_asset(a).upper() for a in all_live_assets}
    
    # 🧹 [청소기 가동 구간]
    keys_to_delete = []
    
    # DUPLICATED_LIST의 키값(별명)들을 세트로 미리 준비 (속도 향상)
    dup_names = set(MAPPING_DATA.get("DUPLICATED_LIST", {}).keys())

    for saved_name in list(MAPPING_DATA["TICKER_DATA"].keys()):
        # 🚀 누님의 철벽 조건:
        # 1. 라이브 목록(live_bases)에 없고
        # 2. 특별 맵핑(SPECIAL_SYMBOL_MAP)에도 없고
        # 3. 고정 UID 맵(SYMBOL_TO_ID_MAP)에도 없고
        # 4. 🔥 [추가] 중복 리스트(DUPLICATED_LIST) 별명에도 없을 경우에만!
        if (saved_name not in live_bases and 
            saved_name not in SPECIAL_SYMBOL_MAP and 
            saved_name not in SYMBOL_TO_ID_MAP and
            saved_name not in dup_names):
            
            keys_to_delete.append(saved_name)
            
    for k in keys_to_delete:
        del MAPPING_DATA["TICKER_DATA"][k]
        is_mapping_updated = True
        print(f"🧹 [청소] 진짜 상폐/미거래 코인 {k} 족보에서 삭제 완료!")


    # 5. 시총 정렬 후 반환
    final_results.sort(key=lambda x: x.get('MarketCap_Raw', 0), reverse=True)
    return final_results

# 🚀 1. 족보 로드 (항상 최신본으로 시작!)
    MAPPING_DATA = config_manager.load_mapping_data()

    # 🚀 2. 시세 수집 (mapping 보따리 전달)
    (
        binance_data, 
        upbit_data, 
        upbit_krw_set, 
        bithumb_krw_set, 
        upbit_only_assets
    ) = exchange_api.fetch_exchange_market_data(MAPPING_DATA)

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