# builder.py
# ==========================================
# 🧱 모듈 3: 데이터 조립 및 변동률 계산기
# ==========================================
import re
import requests
from modules import utils, config_manager

def build_binance_row(
        ticker, b_info, binance_data, market_data_map, asset_to_lookup_key,
        global_listings, upbit_krw_set, bithumb_krw_set,
        REVERSE_LOOKUP, processed_uids, mapping):
        
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
    raw_key = REVERSE_LOOKUP.get(f"{raw_symbol.upper()}_BINANCE", base)
    display_name = re.sub(r'_(binance|upbit|bithumb)$', '', raw_key, flags=re.IGNORECASE)
    
    # 🚀 [추가] 괄호 안의 이름 추출 (예: EDGE(edgeX) -> edgeX)
    explicit_name = ""
    name_match = re.search(r'\((.*?)\)', display_name)
    if name_match:
        explicit_name = name_match.group(1)

    # 2. 족보에서 체인 정보 먼저 확정 (구조적 순서 선점)
    # 🚀 [정리 완료] CMC 정보 매칭 및 만능 열쇠 (이 순서가 파이썬의 정석입니다)
    ticker_info = TICKER_DATA.get(display_name)
    saved_chain = ticker_info[1] if isinstance(ticker_info, list) else ticker_info
    existing_uid = ticker_info[0] if isinstance(ticker_info, list) and len(ticker_info) > 0 else ""
    hardcoded_id = str(SYMBOL_TO_ID_MAP.get(base, ""))
    
    # 🚀 [지문 확정] 1순위: 족보 / 2순위: 하드코딩(base) / 3순위: 하드코딩(display) / 4순위: CMC결과
    final_ucid = existing_uid or hardcoded_id or str(SYMBOL_TO_ID_MAP.get(display_name, ""))
    
    lookup_id = asset_to_lookup_key.get(f"{raw_symbol.upper()}_BINANCE") or asset_to_lookup_key.get(f"{base.upper()}_BINANCE")
    # 3중 타격: 장부 키 -> 순수 티커 -> 하드코딩 ID 순으로 찔러서 info 무조건 확보!
    # TO-BE: 👇 final_ucid를 가장 먼저 찔러야 EDGE 두 놈이 자기 장부를 찾아갑니다!
    info = market_data_map.get(str(final_ucid)) or market_data_map.get(lookup_id)
    
    # 중복 UID 체크 (무조건 final_ucid로 검사)
    # TO-BE: 👇 아래처럼 "주석 처리" 하거나 삭제하세요. 
    # (단, processed_uids.add는 유지해서 족보 세탁기가 누가 누군지 알게는 해줍니다.)
    
    # CMC에서 새로운 ucid를 찾았다면 최종 업데이트
    if not final_ucid and info: final_ucid = info.get('ucid', '')    
    if final_ucid: processed_uids.add(final_ucid)

    # 4. 재료 가공 (무조건 final_ucid로 로고 생성!)
    ch_sym = saved_chain or CHAIN_LOGO_MAP.get(base) or (info.get('chain_symbol') if info else '')
    chain = utils.create_image_tag(CHAIN_LOGO_MAP.get(ch_sym, '')) if ch_sym in CHAIN_LOGO_MAP else ch_sym
    logo = utils.create_image_tag(f"https://s2.coinmarketcap.com/static/img/coins/64x64/{final_ucid}.png" if final_ucid else "")

    # 🚀 [수정] 괄호 안의 이름이 있으면 최우선으로 사용, 없으면 CMC 이름 사용
    coin_name = explicit_name if explicit_name else (info.get('name', base) if info else (ticker_info[2] if ticker_info and len(ticker_info) >= 3 else base))

    # 5. 족보 업데이트 (세탁기)
    if not ticker_info or (isinstance(ticker_info, list) and (len(ticker_info) < 4 or not ticker_info[0])):
        TICKER_DATA[display_name] = [
            final_ucid,                           # 🚀 믿음의 최종 UID
            ch_sym,                               
            coin_name,                            # 🚀 괄호에서 추출한 이름 우선 반영
            base                                  
        ]
        is_updated = True
        print(f"✅ [족보 세탁] {display_name} UID 복구 완료: {final_ucid}")
        
    # 시총 계산 (생략된 기존 로직 그대로 삽입)
    price = b_info['price']
    mcap = 0
    if info or base in MANUAL_SUPPLY_MAP:
        mcap = info.get('market_cap', 0) if info else 0 # 예시 간소화

    # 6. 상장 거래소 목록 및 볼륨 통합
    listed_on = set(global_listings.get(base, set()))
    total_vol_futures = 0.0
    total_vol_spot = 0.0
    exact_spot_ticker = ""
    exact_futures_ticker = ""
    
    for b_tick, b_inf in binance_data.items():
        b_base = utils.get_pure_base_asset(b_tick.replace('USDT', '')).upper()
        if b_base == base:
            if b_inf.get('is_spot'): 
                listed_on.add('BINANCE')
                exact_spot_ticker = b_tick.replace('USDT', '')
            if b_inf.get('is_futures'): 
                listed_on.add('BINANCE_FUTURES')
                exact_futures_ticker = b_tick.replace('USDT', '')
            total_vol_futures += b_inf.get('vol_futures', 0.0)
            total_vol_spot += b_inf.get('vol_spot', 0.0)
    
    # 🚀 [수정] 족보(DUPLICATED_LIST)를 뒤져서 이름이 다르더라도 같은 UID를 가진 형제가 상장되어 있는지 뱃지 검증
    upbit_aliases = [v[2] for v in DUPLICATED_LIST.values() if len(v) >= 4 and v[0] == final_ucid and v[3].upper() == 'UPBIT']
    bithumb_aliases = [v[2] for v in DUPLICATED_LIST.values() if len(v) >= 4 and v[0] == final_ucid and v[3].upper() == 'BITHUMB']
    if base in upbit_krw_set or any(a in upbit_krw_set for a in upbit_aliases): listed_on.add('UPBIT')
    if base in bithumb_krw_set or any(a in bithumb_krw_set for a in bithumb_aliases): listed_on.add('BITHUMB')
    
    vol_24h = info.get('volume_24h', 0) if info else 0
    change_24h = b_info.get('change_24h', 0.0)
    precision = b_info.get('precision', 2)
    utc0_open = utils.js_round(b_info.get('utc0_open', 0), 8) if b_info.get('utc0_open') else 0.0
    change_today = utils.js_round(((price - utc0_open) / utc0_open * 100), 2) if utc0_open > 0 else 0.0
    is_upbit = 'O' if base in upbit_krw_set else 'X'

    # 7. 데이터 조립
    row = {
        # --- 1. 기본 식별 정보 ---
            "UID": final_ucid,
            "Symbol": raw_symbol,
            "DisplayTicker": display_name,
            "Ticker": ticker, 
            "Logo": logo,
            "Name": coin_name, # 🚀 추출된 정확한 이름 삽입
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
            # 🚀 [추가] 바이낸스 전용 거래대금 (선물 + 현물)
            "Binance_Vol_Formatted": utils.format_volume_string(total_vol_futures + total_vol_spot),
            "MarketCap_Formatted": utils.format_market_cap_string(mcap),

            # --- 3. 프론트엔드 정렬용 순수 숫자 데이터 (Raw) ---
            "Price_Raw": price,
            "Change_24h_Raw": change_24h,
            "Change_Today_Raw": change_today,
            "Volume_Raw": vol_24h,
            "MarketCap_Raw": mcap,
            "utc0_open_Raw": utc0_open,
            
            # 추가 데이터 정리 예정
            "Binance_Vol_Futures": total_vol_futures,
            "Binance_Vol_Spot": total_vol_spot,
            "Exact_Spot": exact_spot_ticker,
            "Exact_Futures": exact_futures_ticker,
            "Spot_Only": 'O' if b_info.get('is_spot_only') else 'X',
            "Tags": info.get('tags', '') if info else '',
            "Listed_Exchanges": list(listed_on), # 🚀 프론트엔드야, 이거 보고 이미지 박아라!
    }
    return row, is_updated

# 업비트 전용 1줄짜리 결과물 뱉는 함수.
def build_upbit_row(
        base, up_info,binance_data, market_data_map, asset_to_lookup_key,
        global_listings, upbit_krw_set, bithumb_krw_set, 
        REVERSE_LOOKUP, processed_uids, krw_usd_rate, mapping):
    
    # global MAPPING_DATA
    
    (   
     NOTE_MAP, 
     TICKER_DATA, CHAIN_LOGO_MAP, 
     EXCLUSION_LIST, DUPLICATED_LIST, 
     SYMBOL_TO_ID_MAP, MANUAL_SUPPLY_MAP, SPECIAL_SYMBOL_MAP, HARDCODE_VERIFY_SKIP_LIST
    ) = config_manager.get_mapping_parts(mapping)

    # --- 💡 초기값 세팅 (에러 방어막) ---
    current_p = 0.0
    utc0_open = 0.0
    up_price_krw = 0.0
    up_change_24h = 0.0
    change_today = 0.0
    # -------------------------------
    
    is_updated = False
    if up_info is None: return None, False
    
    # CMC 데이터 매칭
    lookup_id = asset_to_lookup_key.get(f"{base.upper()}_UPBIT")
    info = market_data_map.get(lookup_id)
    ucid = info.get('ucid', '') if info else ''
    raw_key = REVERSE_LOOKUP.get(f"{base}_UPBIT", base)
    display_name = re.sub(r'_(binance|upbit|bithumb)$', '', raw_key, flags=re.IGNORECASE)

    # 🚀 [추가] 괄호 안의 이름 추출 (예: EDGE(Definitive) -> Definitive)
    explicit_name = ""
    name_match = re.search(r'\((.*?)\)', display_name)
    if name_match:
        explicit_name = name_match.group(1)

    # 중복 UID 체크
    if ucid and ucid in processed_uids and raw_key not in DUPLICATED_LIST:
        return None, False
    if ucid: processed_uids.add(ucid)

    # 가격 데이터 추출 (여기서 변수들이 태어납니다)
    up_price_krw = float(up_info.get('price') or 0.0)
    up_open_krw = float(up_info.get('utc0_open') or 0.0)
    up_change_24h = float(up_info.get('change_24h') or 0.0)
    
    if up_price_krw > 0: current_p = up_price_krw / krw_usd_rate
    if up_open_krw > 0: utc0_open = up_open_krw / krw_usd_rate
    
    if utc0_open > 0:
        change_today = utils.js_round(((current_p - utc0_open) / utc0_open * 100), 2)

# 🚀 [정리 완료] 업비트용 만능 열쇠 및 지문 확정
    ticker_info = TICKER_DATA.get(display_name)
    saved_chain = ticker_info[1] if isinstance(ticker_info, list) else ticker_info
    existing_uid = ticker_info[0] if isinstance(ticker_info, list) and len(ticker_info) > 0 else ""
    hardcoded_id = str(SYMBOL_TO_ID_MAP.get(base, ""))

    final_ucid = existing_uid or hardcoded_id or str(SYMBOL_TO_ID_MAP.get(display_name, ""))
    
    lookup_id = asset_to_lookup_key.get(f"{base.upper()}_UPBIT")
    # 3중 타격으로 업비트 코인 시총/볼륨 확보!
    # TO-BE: 👇 final_ucid를 가장 먼저 찔러야 EDGE 두 놈이 자기 장부를 찾아갑니다!
    info = market_data_map.get(str(final_ucid)) or market_data_map.get(lookup_id)

    # 🚀 CMC에서 새로운 ucid를 찾았다면 최종 업데이트
    if not final_ucid and info: final_ucid = info.get('ucid', '')

    # 중복 UID 체크 및 방어
    if final_ucid and final_ucid in processed_uids and raw_key not in DUPLICATED_LIST:
        return None, False
    if final_ucid: processed_uids.add(final_ucid)

    # 로고 및 체인 설정
    ch_sym = saved_chain or CHAIN_LOGO_MAP.get(display_name) or (info.get('chain_symbol') if info else '')
    chain = utils.create_image_tag(CHAIN_LOGO_MAP.get(ch_sym, '')) if ch_sym in CHAIN_LOGO_MAP else ch_sym
    logo = utils.create_image_tag(f"https://s2.coinmarketcap.com/static/img/coins/64x64/{final_ucid}.png" if final_ucid else "")

    # 🚀 [수정] 괄호 안의 이름이 있으면 최우선으로 사용, 없으면 CMC 이름 사용
    coin_name = explicit_name if explicit_name else (info.get('name', base) if info else (ticker_info[2] if ticker_info and len(ticker_info) >= 3 else base))

    # 🚀 [신규 상장 캐치 & 족보 세탁기]
    if not ticker_info or (isinstance(ticker_info, list) and (len(ticker_info) < 4 or not ticker_info[0])):
        TICKER_DATA[display_name] = [
            final_ucid,                           
            ch_sym,                               
            coin_name,                            # 🚀 괄호에서 추출한 이름 우선 반영
            base                                  
        ]
        is_updated = True
        print(f"✅ [족보 세탁] {display_name} UID 복구 완료: {final_ucid}")

    # 가격 및 정밀도
    # p = up_info['price']
    p = current_p
    up_precision = 0 if p >= 100 else 1 if p >= 10 else 2 if p >= 1 else 3 if p >= 0.1 else 4

    # 상장 거래소 목록 조립
    listed_on = set(global_listings.get(base, set()))
    exact_spot_ticker = ""
    exact_futures_ticker = ""
    
    for b_tick, b_inf in binance_data.items():
        b_base = utils.get_pure_base_asset(b_tick.replace('USDT', '')).upper()
        if b_base == base:
            # 🚀 [수정] 바이낸스 티커가 실제로 같은 코인인지 검증 (EDGE 등 중복 티커 충돌 방어)
            alias_binance_raw = REVERSE_LOOKUP.get(f"{b_base}_BINANCE", b_base)
            alias_binance_clean = re.sub(r'_(binance|upbit|bithumb)$', '', alias_binance_raw, flags=re.IGNORECASE)
            if alias_binance_clean == display_name:
                if b_inf.get('is_spot'): 
                    listed_on.add('BINANCE')
                    exact_spot_ticker = b_tick.replace('USDT', '')
                if b_inf.get('is_futures'): 
                    listed_on.add('BINANCE_FUTURES')
                    exact_futures_ticker = b_tick.replace('USDT', '')
    if base in upbit_krw_set: listed_on.add('UPBIT')
    
    # 🚀 [수정] 업비트 코인도 빗썸에 다른 이름(예: EDGEX)으로 상장되어 있는지 뱃지 검증
    bithumb_aliases = [v[2] for v in DUPLICATED_LIST.values() if len(v) >= 4 and v[0] == final_ucid and v[3].upper() == 'BITHUMB']
    if base in bithumb_krw_set or any(a in bithumb_krw_set for a in bithumb_aliases): listed_on.add('BITHUMB')

    row = {
            # --- 1. 기본 식별 정보 ---
            "UID": final_ucid,
            "Symbol": base,
            "DisplayTicker": display_name,
            "Ticker": f"{base}KRW",
            "Logo": logo,
            "Name": coin_name, # 🚀 추출된 정확한 이름 삽입
            "Chain": chain,
            "Upbit": 'O',
            "Note": NOTE_MAP.get(base, 'Upbit Only'),
            "precision" : up_precision,

            # --- 2. 화면 표시용 데이터 (HTML 포함) ---
            "Price": utils.format_dynamic_price(p, up_precision),
            "Price_KRW": up_price_krw if up_price_krw > 0 else None,
            "Change_24h": utils.format_change(up_change_24h),
            "Change_Today": utils.format_change(change_today),
            "Volume_Formatted": utils.format_volume_string(info.get('volume_24h', 0) if info else 0),
            "MarketCap_Formatted": utils.format_market_cap_string(info.get('market_cap', 0) if info else 0),
            # 🚀 [추가] 업비트 전용 거래대금 (24h 거래대금)[cite: 9]
            "Upbit_Vol_Formatted": utils.format_volume_string(up_info.get('acc_trade_price_24h', 0.0)),
            "MarketCap_Formatted": utils.format_market_cap_string(info.get('market_cap', 0) if info else 0),

            # --- 3. 프론트엔드 정렬용 순수 숫자 데이터 (Raw) ---
            "Price_Raw": current_p,
            "Change_24h_Raw": up_change_24h,
            "Change_Today_Raw": change_today,
            "Volume_Raw": info.get('volume_24h', 0) if info else 0,
            "MarketCap_Raw": info.get('market_cap', 0) if info else 0,
            "utc0_open_Raw": utc0_open,
            
            # 추가 예정
            "Upbit_Vol": up_info.get('acc_trade_price_24h', 0.0),
            "Exact_Spot": exact_spot_ticker,
            "Exact_Futures": exact_futures_ticker,
            "Listed_Exchanges": list(listed_on), # 🚀 프론트엔드야, 이거 보고 이미지 박아라!
    }
    return row, is_updated

# 족보 청소기 로직 분리.
def clean_stale_tickers(
        binance_data, upbit_krw_set, mapping):
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
        print(f"🧹 [안내] {k} 삭제 완료")
        
    return is_updated

# 위 함수들을 호출해서 최종 final_results 리스트를 완성.
def assemble_final_dashboard(
        global_listings, binance_data, upbit_data, market_data_map,
        asset_to_lookup_key, upbit_krw_set, bithumb_krw_set, upbit_only_assets, mapping):
    
    (   
     NOTE_MAP, 
     TICKER_DATA, CHAIN_LOGO_MAP, 
     EXCLUSION_LIST, DUPLICATED_LIST, 
     SYMBOL_TO_ID_MAP, MANUAL_SUPPLY_MAP, SPECIAL_SYMBOL_MAP, HARDCODE_VERIFY_SKIP_LIST
    ) = config_manager.get_mapping_parts(mapping)
    
    final_results = {}
    any_update = False
    processed_uids = set()
    
    # 역방향 족보 생성
    REVERSE_LOOKUP = {f"{v[2].upper()}_{v[3].upper()}": k for k, v in DUPLICATED_LIST.items() if len(v) >= 4}
    
    # 테더 환율
    krw_usd_rate = 1450.0 
    try:
        tether_res = requests.get("https://api.upbit.com/v1/ticker?markets=KRW-USDT", timeout=5).json()
        if tether_res and len(tether_res) > 0:
            krw_usd_rate = float(tether_res[0]['trade_price'])
    except Exception as e:
        print(f"⚠️ 테더 환율 수집 실패, 기본값 {krw_usd_rate}원 사용")

    # 1. 바이낸스 투입
    for ticker, b_info in binance_data.items():
        base = utils.get_pure_base_asset(ticker).upper() # 👈 base 추출
        # 🚀 [솔루션 적용!] EXCLUSION_LIST 거르고, is_valid_ticker로 잡동사니 차단!
        if base in EXCLUSION_LIST or not utils.is_valid_ticker(base): 
            continue
        
        row, updated = build_binance_row(ticker, b_info, binance_data, market_data_map, asset_to_lookup_key, global_listings, upbit_krw_set, bithumb_krw_set, REVERSE_LOOKUP, processed_uids, mapping)
        if row:
            uid = row.get("UID")
            final_results[uid] = row
            if updated: any_update = True

    # 2. 업비트 투입 (upbit_only_assets 버리고 upbit_krw_set 사용!)
    binance_base_set = {t.replace('USDT', '') for t in binance_data.keys()} # 🚀 비교를 위해 바낸 셋 준비
    for base in upbit_krw_set:
        # 🚀 [추가] 업비트 심볼의 '진짜 이름(Display Name)'을 확인
        alias_upbit_raw = REVERSE_LOOKUP.get(f"{base}_UPBIT", base)
        alias_upbit = re.sub(r'_(binance|upbit|bithumb)$', '', alias_upbit_raw, flags=re.IGNORECASE)
        
        # 🚀 [중요!] 바이낸스에서도 이 코인을 처리했는지 확인합니다.
        # 만약 바이낸스에 이 코인이 있고, 바이낸스에서의 '진짜 이름'도 같다면 중복이므로 패스!
        alias_binance_raw = REVERSE_LOOKUP.get(f"{base}_BINANCE", base)
        alias_binance = re.sub(r'_(binance|upbit|bithumb)$', '', alias_binance_raw, flags=re.IGNORECASE)
        if base in binance_base_set and alias_binance == alias_upbit:
            continue
        
        # 🚀 만약 이 코인이 EXCLUSION_LIST에 있다면 패스
        if base in EXCLUSION_LIST: continue
        
        # 🚀 이제 build_upbit_row로 넘깁니다! 
        row, updated = build_upbit_row(
            base, upbit_data.get(base), binance_data, 
            market_data_map, asset_to_lookup_key, global_listings,
            upbit_krw_set, bithumb_krw_set,
            REVERSE_LOOKUP, processed_uids, krw_usd_rate, mapping
        )
        if row: 
            uid = row.get("UID")
            if uid in final_results:
                # 🚀 기존 바낸 데이터에 업비트 정보만 덧칠합니다.
                final_results[uid]["Upbit"] = 'O'
                final_results[uid]["Listed_Exchanges"] = list(set(final_results[uid].get("Listed_Exchanges", []) + row.get("Listed_Exchanges", [])))
                if row.get("Price_KRW"): final_results[uid]["Price_KRW"] = row["Price_KRW"]
                final_results[uid]["Upbit_Symbol"] = base
                
                # 🚀 [추가] 바이낸스 정보에 업비트 볼륨 정보도 병합!
                final_results[uid]["Upbit_Vol_Formatted"] = row.get("Upbit_Vol_Formatted")
            else:
                final_results[uid] = row
        if updated: any_update = True

    # 3. 청소기 가동
    # if clean_stale_tickers(binance_data, upbit_krw_set, mapping):
    #     any_update = True
        
    # AS-IS: return final_results, any_update
    # TO-BE: 👇 딕셔너리의 값들만 리스트로 뽑아서 리턴!
    return list(final_results.values()), any_update
