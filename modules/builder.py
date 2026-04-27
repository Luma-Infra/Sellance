# ==========================================
# 🧱 모듈 3: 데이터 조립 및 변동률 계산기
# ==========================================

import requests
from modules import utils, config_manager, exchange_api

def build_binance_row(ticker, b_info, market_data_map, asset_to_lookup_key, global_listings, upbit_krw_set, bithumb_krw_set, REVERSE_LOOKUP, processed_uids, mapping):
    global MAPPING_DATA
    
    (   
     NOTE_MAP, 
     TICKER_DATA, CHAIN_LOGO_MAP, 
     EXCLUSION_LIST, DUPLICATED_LIST, 
     SYMBOL_TO_ID_MAP, MANUAL_SUPPLY_MAP, SPECIAL_SYMBOL_MAP, HARDCODE_VERIFY_SKIP_LIST
    ) = config_manager.get_mapping_parts(mapping)
    
    is_updated = False
    
    # 1. 이름표 및 기본 정보
    raw_symbol = ticker.replace('USDT', '')
    base = utils.get_pure_base_asset(ticker).upper()
    display_name = REVERSE_LOOKUP.get(f"{raw_symbol.upper()}_BINANCE", base)
    
    # 2. 족보에서 체인 정보 먼저 확정 (구조적 순서 선점)
    ticker_info = TICKER_DATA.get(display_name)
    saved_chain = ticker_info[1] if isinstance(ticker_info, list) else ticker_info
    
    # 3. CMC 정보 매칭
    lookup_id = asset_to_lookup_key.get(f"BINANCE_{raw_symbol.upper()}") or asset_to_lookup_key.get(f"BINANCE_{base.upper()}")
    info = market_data_map.get(lookup_id)
    ucid = info.get('ucid', '') if info else ''
    
    # 중복 UID 체크
    if ucid and ucid in processed_uids: return None, False
    if ucid: processed_uids.add(ucid)

    # 4. 재료 가공 (순서 중요: ch_sym 확정 후 이미지 생성)
    ch_sym = saved_chain or CHAIN_LOGO_MAP.get(base) or (info.get('chain_symbol') if info else '')
    chain = utils.create_image_tag(CHAIN_LOGO_MAP.get(ch_sym, '')) if ch_sym in CHAIN_LOGO_MAP else ch_sym
    logo = utils.create_image_tag(f"https://s2.coinmarketcap.com/static/img/coins/64x64/{ucid}.png" if ucid else "")

    # 5. 족보 업데이트 및 시총 계산
    price = b_info['price']
    mcap = 0
    if info or base in MANUAL_SUPPLY_MAP:
        if ch_sym and display_name not in TICKER_DATA and base not in CHAIN_LOGO_MAP:
            TICKER_DATA[display_name] = [ucid, ch_sym]
            is_updated = True
        
        # 시총 계산 (생략된 기존 로직 그대로 삽입)
        mcap = info.get('market_cap', 0) if info else 0 # 예시 간소화

    # 6. 상장 거래소 목록
    listed_on = set(global_listings.get(base, set()))
    if b_info.get('is_spot'): listed_on.add('BINANCE')
    if b_info.get('is_futures'): listed_on.add('BINANCE_FUTURES')
    if base in upbit_krw_set: listed_on.add('UPBIT')
    if base in bithumb_krw_set: listed_on.add('BITHUMB')
    
    coin_name = info.get('name', base) if info else base
    vol_24h = info.get('volume_24h', 0) if info else 0
    change_24h = b_info.get('change_24h', 0.0)
    precision = b_info.get('precision', 2)
    utc0_open = utils.js_round(b_info.get('utc0_open', 0), 8) if b_info.get('utc0_open') else 0.0
    change_today = utils.js_round(((price - utc0_open) / utc0_open * 100), 2) if utc0_open > 0 else 0.0
    is_upbit = 'O' if base in upbit_krw_set else 'X'

    # 7. 데이터 조립
    row = {
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
            "Price": utils.format_dynamic_price(b_info['price'], precision),
            "Price_KRW": None, # 바이낸스는 원화 없음
            "Change_24h": utils.format_change(change_24h),
            "Change_Today": utils.format_change(change_today),
            "Volume_Formatted": utils.format_volume_string(vol_24h),
            "MarketCap_Formatted": utils.format_market_cap_string(mcap),

            # --- 3. 프론트엔드 정렬용 순수 숫자 데이터 (Raw) ---
            "Price_Raw": price,
            "Change_24h_Raw": change_24h,
            "Change_Today_Raw": change_today,
            "Volume_Raw": vol_24h,
            "MarketCap_Raw": mcap,
            "utc0_open_Raw": utc0_open,
            
            # 추가 데이터 정리 예정
            "Binance_Vol_Futures": b_info.get('vol_futures', 0.0),
            "Binance_Vol_Spot": b_info.get('vol_spot', 0.0),
            "Spot_Only": 'O' if b_info.get('is_spot_only') else 'X',
            "Tags": info.get('tags', '') if info else '',
            "Listed_Exchanges": list(listed_on), # 🚀 프론트엔드야, 이거 보고 이미지 박아라!
    }
    return row, is_updated

 # 업비트 전용 1줄짜리 결과물 뱉는 함수.

def build_upbit_row(base, up_info, binance_data, market_data_map, asset_to_lookup_key, global_listings, upbit_krw_set, REVERSE_LOOKUP, processed_uids, krw_usd_rate, upbit_data, bithumb_krw_set, mapping):
    global MAPPING_DATA
    
    (   
     NOTE_MAP, 
     TICKER_DATA, CHAIN_LOGO_MAP, 
     EXCLUSION_LIST, DUPLICATED_LIST, 
     SYMBOL_TO_ID_MAP, MANUAL_SUPPLY_MAP, SPECIAL_SYMBOL_MAP, HARDCODE_VERIFY_SKIP_LIST
    ) = config_manager.get_mapping_parts(mapping)
    
    is_updated = False
    
    lookup_id = asset_to_lookup_key.get(f"UPBIT_{base}")
    info = market_data_map.get(lookup_id)
    ucid = info.get('ucid', '') if info else ''
    display_name = REVERSE_LOOKUP.get(f"{base}_UPBIT", base)

    # VIP 예외처리 및 중복 UID 체크
    if ucid and ucid in processed_uids and display_name not in DUPLICATED_LIST:
        return None, False
    if ucid: processed_uids.add(ucid)

    # 재료 손질
    ticker_info = TICKER_DATA.get(display_name)
    saved_chain = ticker_info[1] if isinstance(ticker_info, list) else ticker_info
    ch_sym = saved_chain or CHAIN_LOGO_MAP.get(display_name) or (info.get('chain_symbol') if info else '')
    
    chain = utils.create_image_tag(CHAIN_LOGO_MAP.get(ch_sym, '')) if ch_sym in CHAIN_LOGO_MAP else ch_sym
    logo = utils.create_image_tag(f"https://s2.coinmarketcap.com/static/img/coins/64x64/{ucid}.png" if ucid else "")

    # 가격 및 정밀도
    p = up_info['price']
    up_precision = 0 if p >= 100 else 1 if p >= 10 else 2 if p >= 1 else 3 if p >= 0.1 else 4

    # 상장 체크 (바낸 맵 뒤지기)
    listed_on = set(global_listings.get(base, set()))
    b_ticker = f"{base}USDT"
    b_global = binance_data.get(b_ticker)
    if b_global:
        if b_global.get('is_spot'): listed_on.add('BINANCE')
        if b_global.get('is_futures'): listed_on.add('BINANCE_FUTURES')
    if base in upbit_krw_set: listed_on.add('UPBIT')
    
    coin_name = info.get('name', base) if info else base
    vol_24h = info.get('volume_24h', 0) if info else 0
    change_24h = up_change_24h
    final_mcap = info.get('market_cap', 0)
    # 업비트는 가격대별로 변하므로 여기서 '데이터 기반'으로 자릿수 결정
    p = up_info['price']
    # 🚀 하드코딩 대신 자릿수 판별 로직 (표준 호가 단위 규칙만 적용)
    up_precision = 0 if p >= 100 else 1 if p >= 10 else 2 if p >= 1 else 3 if p >= 0.1 else 4
    
    b_ticker = f"{base}USDT"
    b_info_global = binance_data.get(b_ticker) # 👈 전역 바이낸스 맵을 뒤져야 함

    # (루프 안에서) 현재 코인의 상장 거래소 목록 만들기
    listed_on = set(global_listings.get(base, set()))
    if b_info_global:
        if b_info_global.get('is_spot'): listed_on.add('BINANCE')
        if b_info_global.get('is_futures'): listed_on.add('BINANCE_FUTURES')
    if base in upbit_krw_set: listed_on.add('UPBIT')
    if base in bithumb_krw_set: listed_on.add('BITHUMB') # 빗썸 셋 넘겨받았다면!
    
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
    
    change_today = utils.js_round(((current_p - utc0_open) / utc0_open * 100), 2) if utc0_open > 0 else 0.0

    row = {
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
            "Price": utils.format_dynamic_price(p, up_precision),
            "Price_KRW": utils.up_price_krw if up_price_krw > 0 else None,
            "Change_24h": utils.format_change(change_24h),
            "Change_Today": utils.format_change(change_today),
            "Volume_Formatted": utils.format_volume_string(vol_24h),
            "MarketCap_Formatted": utils.format_market_cap_string(final_mcap),

            # --- 3. 프론트엔드 정렬용 순수 숫자 데이터 (Raw) ---
            "Price_Raw": current_p,
            "Change_24h_Raw": change_24h,
            "Change_Today_Raw": change_today,
            "Volume_Raw": vol_24h,
            "MarketCap_Raw": final_mcap,
            "utc0_open": utc0_open,
            
            # 추가 예정
            "Upbit_Vol": up_info.get('acc_trade_price_24h', 0.0),
            "Listed_Exchanges": list(listed_on), # 🚀 프론트엔드야, 이거 보고 이미지 박아라!
    }
    return row, False # 업데이트 로직 필요시 추가

# 족보 청소기 로직 분리.
def clean_stale_tickers(binance_data, upbit_krw_set, mapping):
    global MAPPING_DATA
    is_updated = False
    
    live_bases = (   
     NOTE_MAP, 
     TICKER_DATA, CHAIN_LOGO_MAP, 
     EXCLUSION_LIST, DUPLICATED_LIST, 
     SYMBOL_TO_ID_MAP, MANUAL_SUPPLY_MAP, SPECIAL_SYMBOL_MAP, HARDCODE_VERIFY_SKIP_LIST
    ) = config_manager.get_mapping_parts(mapping)
                  
    live_bases = {utils.get_pure_base_asset(t).upper() for t in binance_data.keys()} | upbit_krw_set
    dup_names = set(DUPLICATED_LIST.keys())
    
    keys_to_delete = [
        k for k in TICKER_DATA.keys()
        if k not in live_bases and k not in SPECIAL_SYMBOL_MAP and k not in SYMBOL_TO_ID_MAP and k not in dup_names
    ]
    
    for k in keys_to_delete:
        del TICKER_DATA[k]
        is_updated = True
        print(f"🧹 [청소] {k} 삭제 완료")
        
    return is_updated

# 위 함수들을 호출해서 최종 final_results 리스트를 완성.
def assemble_final_dashboard(global_listings, binance_data, upbit_data, market_data_map, asset_to_lookup_key, upbit_krw_set, bithumb_krw_set, upbit_only_assets, mapping):
   
    (   
     NOTE_MAP, 
     TICKER_DATA, CHAIN_LOGO_MAP, 
     EXCLUSION_LIST, DUPLICATED_LIST, 
     SYMBOL_TO_ID_MAP, MANUAL_SUPPLY_MAP, SPECIAL_SYMBOL_MAP, HARDCODE_VERIFY_SKIP_LIST
    ) = config_manager.get_mapping_parts(mapping)
    
    final_results = []
    any_update = False
    processed_uids = set()
    
    # 역방향 족보 생성
    REVERSE_LOOKUP = {f"{v[2].upper()}_{v[3].upper()}": k for k, v in DUPLICATED_LIST.items() if len(v) >= 4}
    
    # 테더 환율
    krw_usd_rate = 1450.0 
    try:
        tether_res = requests.get("https://api.upbit.com/v1/ticker?markets=KRW-USDT", timeout=3).json()
        if tether_res and len(tether_res) > 0:
            krw_usd_rate = float(tether_res[0]['trade_price'])
    except Exception as e:
        print(f"⚠️ 테더 환율 수집 실패, 기본값 {krw_usd_rate}원 사용")

    # 1. 바이낸스 투입
    for ticker, b_info in binance_data.items():
        row, updated = build_binance_row(ticker, b_info, market_data_map, asset_to_lookup_key, global_listings, upbit_krw_set, bithumb_krw_set, REVERSE_LOOKUP, processed_uids, mapping)
        if row: 
            final_results.append(row)
            if updated: any_update = True

    # 2. 업비트 투입
    for base in upbit_only_assets:
        row, updated = build_upbit_row(base.upper(), upbit_data.get(base), binance_data, market_data_map, asset_to_lookup_key, global_listings, upbit_krw_set, bithumb_krw_set, REVERSE_LOOKUP, processed_uids, krw_usd_rate, mapping)
        if row: final_results.append(row)

    # 3. 청소기 가동
    if clean_stale_tickers(binance_data, upbit_krw_set):
        any_update = True
        
    return final_results, any_update