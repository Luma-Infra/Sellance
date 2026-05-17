# builder.py
# ==========================================
# 🧱 모듈 3: 데이터 조립 및 변동률 계산기
# ==========================================
import re
import requests
from modules import utils, config_manager


def build_binance_row(
    ticker,
    b_info,
    binance_data,
    upbit_data,
    market_data_map,
    asset_to_lookup_key,
    global_listings,
    upbit_krw_set,
    bithumb_krw_set,
    REVERSE_LOOKUP,
    processed_uids,
    mapping,
    krw_usd_rate,
    bybit_data,
):

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

    is_updated = False

    # 1. 이름표 및 기본 정보
    raw_symbol = ticker.replace("USDT", "")
    base = utils.get_pure_base_asset(ticker).upper()
    raw_key = str(REVERSE_LOOKUP.get(f"{raw_symbol.upper()}_BINANCE", base) or base)
    display_name = re.sub(
        r"_(binance|upbit|bithumb)$", "", raw_key, flags=re.IGNORECASE
    )

    # 🚀 [추가] 괄호 안의 이름 추출 (예: EDGE(edgeX) -> edgeX)
    explicit_name = ""
    name_match = re.search(r"\((.*?)\)", display_name)
    if name_match:
        explicit_name = name_match.group(1)

    # 2. 족보에서 체인 정보 먼저 확정 (구조적 순서 선점)
    ticker_info = TICKER_DATA.get(display_name)
    existing_uid = (
        ticker_info[0] if isinstance(ticker_info, list) and len(ticker_info) > 0 else ""
    )
    hardcoded_id = str(SYMBOL_TO_ID_MAP.get(base, ""))

    # 🚀 [지문 확정] 1순위: 족보 / 2순위: 하드코딩(base) / 3순위: 하드코딩(display) / 4순위: CMC결과
    final_ucid = (
        existing_uid or hardcoded_id or str(SYMBOL_TO_ID_MAP.get(display_name, ""))
    )

    lookup_id = asset_to_lookup_key.get(
        f"{raw_symbol.upper()}_BINANCE"
    ) or asset_to_lookup_key.get(f"{base.upper()}_BINANCE")
    info = market_data_map.get(str(final_ucid)) or market_data_map.get(lookup_id)

    # CMC에서 새로운 ucid를 찾았다면 최종 업데이트
    if not final_ucid and info:
        final_ucid = info.get("ucid", "")
    if final_ucid:
        processed_uids.add(final_ucid)

    # 4. 재료 가공 (무조건 final_ucid로 로고 생성!)
    ticker_info_list = (
        ticker_info if isinstance(ticker_info, list) else [None, None, None]
    )
    saved_chain = (
        ticker_info_list[1]
        if len(ticker_info_list) > 1
        else (CHAIN_LOGO_MAP.get(base) or (info.get("chain_symbol") if info else ""))
    )
    ch_sym = saved_chain
    chain = (
        utils.create_image_tag(CHAIN_LOGO_MAP.get(ch_sym, ""))
        if ch_sym in CHAIN_LOGO_MAP
        else ch_sym
    )
    logo = utils.create_image_tag(
        f"https://s2.coinmarketcap.com/static/img/coins/64x64/{final_ucid}.png"
        if final_ucid
        else ""
    )

    # 🚀 [수정] 괄호 안의 이름이 있으면 최우선으로 사용, 없으면 CMC 이름 사용
    coin_name = (
        explicit_name
        if explicit_name
        else (
            info.get("name", base)
            if info
            else (ticker_info_list[2] if len(ticker_info_list) >= 3 else base)
        )
    )

    # 5. 족보 업데이트 (세탁기)
    if not ticker_info or (
        isinstance(ticker_info, list) and (len(ticker_info) < 4 or not ticker_info[0])
    ):
        TICKER_DATA[display_name] = [
            final_ucid,  # 🚀 믿음의 최종 UID
            ch_sym,
            coin_name,  # 🚀 괄호에서 추출한 이름 우선 반영
            base,
        ]
        is_updated = True
        print(f"✅ [족보 세탁] {display_name} UID 복구 완료: {final_ucid}")

    # 시총 계산
    price = b_info["price"]
    mcap = info.get("market_cap", 0) if info else 0

    # 6. 상장 거래소 목록 및 볼륨 통합
    listed_on = set(global_listings.get(base, set()))
    total_vol_futures = 0.0
    total_vol_spot = 0.0
    binance_spot_price = 0.0
    binance_futures_price = 0.0
    exact_spot_ticker = ""
    exact_futures_ticker = ""

    for b_tick, b_inf in binance_data.items():
        b_base = utils.get_pure_base_asset(b_tick.replace("USDT", "")).upper()
        if b_base == base:
            if b_inf.get("is_spot"):
                listed_on.add("BINANCE")
                binance_spot_price = b_inf.get("price", 0.0)
                exact_spot_ticker = b_tick.replace("USDT", "")
            if b_inf.get("is_futures"):
                listed_on.add("BINANCE_FUTURES")
                binance_futures_price = b_inf.get("price", 0.0)
                exact_futures_ticker = b_tick.replace("USDT", "")
            total_vol_futures += b_inf.get("vol_futures", 0.0)
            total_vol_spot += b_inf.get("vol_spot", 0.0)

    # 🚀 [추가] Bybit Fallback (바낸 데이터 부재 시)
    by_spot_p = bybit_data.get(base, {}).get("spot_price", 0.0)
    by_futures_p = bybit_data.get(base, {}).get("futures_price", 0.0)

    if by_spot_p > 0:
        listed_on.add("BYBIT")
    if by_futures_p > 0:
        listed_on.add("BYBIT_FUTURES")

    target_spot_p = binance_spot_price or by_spot_p
    target_futures_p = binance_futures_price or by_futures_p

    # 업비트 연동 (김프용)
    upbit_aliases = [
        v[2]
        for v in DUPLICATED_LIST.values()
        if len(v) >= 4 and (v[0] == final_ucid or v[0] == base) and v[3].upper() == "UPBIT"
    ]

    # 🚀 [수정] Upbit에 동일한 base 심볼이 있더라도, DUPLICATED_LIST 상의 UID가 서로 다르면 동명이인(META 등)으로 간주하여 분리
    upbit_direct_match = False
    if base in upbit_krw_set:
        upbit_direct_match = True
        alias_up_key = REVERSE_LOOKUP.get(f"{base}_UPBIT")
        if alias_up_key in DUPLICATED_LIST:
            if DUPLICATED_LIST[alias_up_key][0] != final_ucid:
                upbit_direct_match = False

    target_up_base = (
        base
        if upbit_direct_match
        else (
            upbit_aliases[0]
            if upbit_aliases and upbit_aliases[0] in upbit_krw_set
            else None
        )
    )

    up_price_krw = 0.0
    if target_up_base and target_up_base in upbit_data:
        up_price_krw = upbit_data[target_up_base].get("price", 0.0)
        listed_on.add("UPBIT")

    # 🚀 [수정] Bithumb도 동일하게 UID 검증
    bithumb_direct_match = False
    if base in bithumb_krw_set:
        bithumb_direct_match = True
        alias_bi_key = REVERSE_LOOKUP.get(f"{base}_BITHUMB")
        if alias_bi_key in DUPLICATED_LIST:
            if DUPLICATED_LIST[alias_bi_key][0] != final_ucid:
                bithumb_direct_match = False

    if bithumb_direct_match:
        listed_on.add("BITHUMB")

    # 🚀 [수정] 화면에 표기되는 바이낸스 단일 거래대금(binance_vol)과 웹소켓 실시간 시세(data.q)를 단일 진실 공급원으로 완벽 일치!
    binance_vol = total_vol_spot + total_vol_futures
    up_vol_24h = upbit_data[target_up_base].get("volume_24h", 0.0) if target_up_base and target_up_base in upbit_data else 0.0
    by_vol_24h = bybit_data.get(base, {}).get("volume_24h", 0.0)
    vol_24h = binance_vol + up_vol_24h + by_vol_24h
    change_24h = b_info.get("change_24h", 0.0)
    precision = b_info.get("precision", 2)
    utc0_open = (
        utils.js_round(b_info.get("utc0_open", 0), 8)
        if b_info.get("utc0_open")
        else 0.0
    )
    change_today = (
        utils.js_round(((price - utc0_open) / utc0_open * 100), 2)
        if utc0_open > 0
        else 0.0
    )

    # 🚀 [핵심] 김프(현현갭) & 현선갭 연산 (라벨 추가)
    kimchi_raw = 0.0
    kimchi_label = "-"
    
    # 1. 국내 거래소 결정 (업비트 -> 빗썸)
    dom_p = 0.0
    dom_name = ""
    if up_price_krw > 0:
        dom_p = up_price_krw
        dom_name = "UPBIT"
    elif base in bithumb_krw_set:
        # 빗썸 가격은 현재 upbit_data 구조에 없으므로 (필요시 추가 로직) 일단 업비트 위주
        pass 

    # 2. 해외 거래소 결정 (바낸 현물 -> 바낸 선물 -> 바이비트 현물)
    ovs_p = 0.0
    ovs_name = ""
    if binance_spot_price > 0:
        ovs_p = binance_spot_price
        ovs_name = "BIN SPOT"
    elif binance_futures_price > 0:
        ovs_p = binance_futures_price
        ovs_name = "BIN FUT"
    elif by_spot_p > 0:
        ovs_p = by_spot_p
        ovs_name = "BYB SPOT"

    if dom_p > 0 and ovs_p > 0 and krw_usd_rate > 0:
        overseas_krw = ovs_p * krw_usd_rate
        kimchi_raw = ((dom_p / overseas_krw) - 1) * 100
        kimchi_label = f"{dom_name} <> {ovs_name}"

    basis_raw = 0.0
    if binance_spot_price > 0 and binance_futures_price > 0:
        basis_raw = ((binance_futures_price / binance_spot_price) - 1) * 100

    # 🚀 VMC 계산 시 화면에 표기되는 바이낸스 단일 거래대금(binance_vol)을 기준으로 계산하여 100% 완벽 일치!
    vmc_raw = (binance_vol / mcap * 100) if mcap > 0 else 0.0
    funding_rate = b_info.get("funding_rate", 0.0)
    # 선물 거래소가 없거나 펀비가 0이면 - 처리
    funding_f = f"{funding_rate*100:.4f}%" if "FUTURES" in str(listed_on) and funding_rate != 0 else "-"

    # 7. 데이터 조립
    row = {
        "UID": final_ucid,
        "Symbol": raw_symbol,
        "DisplayTicker": display_name,
        "Ticker": ticker,
        "Logo": logo,
        "Name": coin_name,
        "Chain": chain,
        "Upbit": "O" if target_up_base else "X",
        "precision": precision,
        "Price": utils.format_dynamic_price(b_info["price"], precision),
        "Price_KRW": up_price_krw if up_price_krw > 0 else None,
        "Change_24h": utils.format_change(change_24h),
        "Change_Today": utils.format_change(change_today),
        "Kimchi_Formatted": f"{kimchi_raw:+.2f}%" if kimchi_raw != 0 else "0.00%",
        "Kimchi_Label": kimchi_label,
        "Basis_Formatted": f"{basis_raw:+.2f}%" if basis_raw != 0 else "0.00%",
        "Volume_Formatted": utils.format_volume_string(binance_vol), # 🚀 화면 표기값과 일원화
        "MarketCap_Formatted": utils.format_market_cap_string(mcap),
        "VMC_Formatted": f"{vmc_raw:.2f}%",
        "Funding_Formatted": funding_f,
        # 🚀 [추가] 바이낸스 전용 거래대금 (선물 + 현물)
        "Binance_Vol_Formatted": utils.format_volume_string(
            binance_vol
        ),
        # --- 3. 프론트엔드 정렬용 순수 숫자 데이터 (Raw) ---
        "Price_Raw": price,
        "Change_24h_Raw": change_24h,
        "Change_Today_Raw": change_today,
        "Volume_Raw": binance_vol, # 🚀 정렬 기준값도 일원화
        "MarketCap_Raw": mcap,
        "VMC_Raw": vmc_raw,
        "Basis_Raw": basis_raw,
        "Funding_Raw": funding_rate,
        "Kimchi_Raw": kimchi_raw,
        "utc0_open_Raw": utc0_open,
        # 추가 데이터 정리 예정
        "Binance_Vol_Futures": total_vol_futures,
        "Binance_Vol_Spot": total_vol_spot,
        "Exact_Spot": exact_spot_ticker,
        "Exact_Futures": exact_futures_ticker,
        "Spot_Only": "O" if b_info.get("is_spot_only") else "X",
        "Tags": info.get("tags", "") if info else "",
        "Listed_Exchanges": list(
            listed_on
        ),  # 🚀 프론트엔드야, 이거 보고 이미지 박아라!
    }
    return row, is_updated


# 업비트 전용 1줄짜리 결과물 뱉는 함수.
def build_upbit_row(
    base,
    up_info,
    binance_data,
    market_data_map,
    asset_to_lookup_key,
    global_listings,
    upbit_krw_set,
    bithumb_krw_set,
    REVERSE_LOOKUP,
    processed_uids,
    krw_usd_rate,
    mapping,
    bybit_data,
    upbit_data,
):

    # global MAPPING_DATA

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

    # --- 💡 초기값 세팅 (에러 방어막) ---
    current_p = 0.0
    utc0_open = 0.0
    up_price_krw = 0.0
    up_change_24h = 0.0
    change_today = 0.0
    # -------------------------------

    is_updated = False
    if up_info is None:
        return None, False

    # CMC 데이터 매칭
    lookup_id = asset_to_lookup_key.get(f"{base.upper()}_UPBIT")
    info = market_data_map.get(lookup_id)
    ucid = info.get("ucid", "") if info else ""
    raw_key = str(REVERSE_LOOKUP.get(f"{base}_UPBIT", base) or base)
    display_name = re.sub(
        r"_(binance|upbit|bithumb)$", "", raw_key, flags=re.IGNORECASE
    )

    # 🚀 [추가] 괄호 안의 이름 추출 (예: EDGE(Definitive) -> Definitive)
    explicit_name = ""
    name_match = re.search(r"\((.*?)\)", display_name)
    if name_match:
        explicit_name = name_match.group(1)

    # 가격 데이터 추출 (여기서 변수들이 태어납니다)
    up_price_krw = float(up_info.get("price") or 0.0)
    up_open_krw = float(up_info.get("utc0_open") or 0.0)
    up_change_24h = float(up_info.get("change_24h") or 0.0)

    if up_price_krw > 0:
        current_p = up_price_krw / krw_usd_rate
    if up_open_krw > 0:
        utc0_open = up_open_krw / krw_usd_rate

    if utc0_open > 0:
        change_today = utils.js_round(((current_p - utc0_open) / utc0_open * 100), 2)

    # 🚀 [정리 완료] 업비트용 만능 열쇠 및 지문 확정
    ticker_info = TICKER_DATA.get(display_name)
    saved_chain = ticker_info[1] if isinstance(ticker_info, list) else ticker_info
    existing_uid = (
        ticker_info[0] if isinstance(ticker_info, list) and len(ticker_info) > 0 else ""
    )
    hardcoded_id = str(SYMBOL_TO_ID_MAP.get(base, ""))

    final_ucid = (
        existing_uid or hardcoded_id or str(SYMBOL_TO_ID_MAP.get(display_name, ""))
    )

    lookup_id = asset_to_lookup_key.get(f"{base.upper()}_UPBIT")
    # 3중 타격으로 업비트 코인 시총/볼륨 확보!
    # TO-BE: 👇 final_ucid를 가장 먼저 찔러야 EDGE 두 놈이 자기 장부를 찾아갑니다!
    info = market_data_map.get(str(final_ucid)) or market_data_map.get(lookup_id)

    # 🚀 CMC에서 새로운 ucid를 찾았다면 최종 업데이트
    if not final_ucid and info:
        final_ucid = info.get("ucid", "")

    # 중복 UID 체크 및 방어
    if final_ucid and final_ucid in processed_uids and raw_key not in DUPLICATED_LIST:
        return None, False
    if final_ucid:
        processed_uids.add(final_ucid)

    # 로고 및 체인 설정
    ch_sym = (
        saved_chain
        or CHAIN_LOGO_MAP.get(display_name)
        or (info.get("chain_symbol") if info else "")
    )
    chain = (
        utils.create_image_tag(CHAIN_LOGO_MAP.get(ch_sym, ""))
        if ch_sym in CHAIN_LOGO_MAP
        else ch_sym
    )
    logo = utils.create_image_tag(
        f"https://s2.coinmarketcap.com/static/img/coins/64x64/{final_ucid}.png"
        if final_ucid
        else ""
    )

    # 🚀 [수정] 괄호 안의 이름이 있으면 최우선으로 사용, 없으면 CMC 이름 사용
    coin_name = (
        explicit_name
        if explicit_name
        else (
            info.get("name", base)
            if info
            else (ticker_info[2] if ticker_info and len(ticker_info) >= 3 else base)
        )
    )

    # 🚀 [신규 상장 캐치 & 족보 세탁기]
    if not ticker_info or (
        isinstance(ticker_info, list) and (len(ticker_info) < 4 or not ticker_info[0])
    ):
        TICKER_DATA[display_name] = [
            final_ucid,
            ch_sym,
            coin_name,  # 🚀 괄호에서 추출한 이름 우선 반영
            base,
        ]
        is_updated = True
        print(f"✅ [족보 세탁] {display_name} UID 복구 완료: {final_ucid}")

    # 가격 및 정밀도
    # p = up_info['price']
    p = current_p
    up_precision = (
        0 if p >= 100 else 1 if p >= 10 else 2 if p >= 1 else 3 if p >= 0.1 else 4
    )

    # 상장 거래소 목록 조립
    listed_on = set(global_listings.get(base, set()))
    exact_spot_ticker = ""
    exact_futures_ticker = ""
    binance_spot_price = 0.0

    for b_tick, b_inf in binance_data.items():
        b_base = utils.get_pure_base_asset(b_tick.replace("USDT", "")).upper()
        if b_base == base:
            # 🚀 [수정] 바이낸스 티커가 실제로 같은 코인인지 검증 (EDGE 등 중복 티커 충돌 방어)
            alias_binance_raw = str(REVERSE_LOOKUP.get(f"{b_base}_BINANCE", b_base) or b_base)
            alias_binance_clean = re.sub(
                r"_(binance|upbit|bithumb)$", "", alias_binance_raw, flags=re.IGNORECASE
            )
            if alias_binance_clean == display_name:
                if b_inf.get("is_spot"):
                    listed_on.add("BINANCE")
                    exact_spot_ticker = b_tick.replace("USDT", "")
                    binance_spot_price = float(b_inf.get("price") or 0.0)
                if b_inf.get("is_futures"):
                    listed_on.add("BINANCE_FUTURES")
                    exact_futures_ticker = b_tick.replace("USDT", "")
    if base in upbit_krw_set:
        listed_on.add("UPBIT")

    # 🚀 [수정] 업비트 코인도 빗썸에 다른 이름(예: EDGEX)으로 상장되어 있는지 뱃지 검증
    bithumb_aliases = [
        v[2]
        for v in DUPLICATED_LIST.values()
        if len(v) >= 4 and v[0] == final_ucid and v[3].upper() == "BITHUMB"
    ]
    if base in bithumb_krw_set or any(a in bithumb_krw_set for a in bithumb_aliases):
        listed_on.add("BITHUMB")

    # 🚀 [수정] CMC 거래량 대신 거래소 실시간 거래량 합산
    binance_vol = 0.0
    for b_tick, b_inf in binance_data.items():
        b_base = utils.get_pure_base_asset(b_tick.replace("USDT", "")).upper()
        if b_base == base:
            binance_vol += (b_inf.get("vol_futures") or 0.0) + (b_inf.get("vol_spot") or 0.0)
    
    up_vol_24h = up_price_krw * float(upbit_data[base].get("volume_24h") or 0.0) / krw_usd_rate if base in upbit_data and krw_usd_rate > 0 else 0.0
    by_vol_24h = bybit_data.get(base, {}).get("volume_24h", 0.0)
    
    vol_24h = binance_vol + up_vol_24h + by_vol_24h
    mcap = info.get("market_cap", 0) if info else 0
    vmc_raw = (vol_24h / mcap * 100) if mcap > 0 else 0.0
    
    # 🚀 [추가] 업비트 전용 코인 김프 라벨 (바이비트 등 Fallback 비교군이 있을 때만)
    by_spot_p = bybit_data.get(base, {}).get("spot_price", 0.0)
    kimchi_label = "-"
    if up_price_krw > 0 and by_spot_p > 0:
        kimchi_label = "UPBIT <> BYB SPOT"
    elif up_price_krw > 0 and binance_spot_price > 0:
        kimchi_label = "UPBIT <> BIN SPOT"

    # 업비트는 펀비 없음
    funding_f = "-"

    row = {
        # --- 1. 기본 식별 정보 ---
        "UID": final_ucid,
        "Symbol": base,
        "DisplayTicker": display_name,
        "Ticker": f"{base}KRW",
        "Logo": logo,
        "Name": coin_name,  # 🚀 추출된 정확한 이름 삽입
        "Chain": chain,
        "Upbit": "O",
        "Note": NOTE_MAP.get(base, "Upbit Only"),
        "precision": up_precision,
        # --- 2. 화면 표시용 데이터 (HTML 포함) ---
        "Price": utils.format_dynamic_price(p, up_precision),
        "Price_KRW": up_price_krw if up_price_krw > 0 else None,
        "Change_24h": utils.format_change(up_change_24h),
        "Change_Today": utils.format_change(change_today),
        "Volume_Formatted": utils.format_volume_string(vol_24h),
        "Kimchi_Label": kimchi_label,
        "MarketCap_Formatted": utils.format_market_cap_string(mcap),
        "VMC_Formatted": f"{vmc_raw:.2f}%",
        "Funding_Formatted": funding_f,
        # 🚀 [추가] 업비트 전용 거래대금 (24h 거래대금)
        "Upbit_Vol_Formatted": utils.format_volume_string(
            up_info.get("acc_trade_price_24h", 0.0)
        ),
        # --- 3. 프론트엔드 정렬용 순수 숫자 데이터 (Raw) ---
        "Price_Raw": current_p,
        "Change_24h_Raw": up_change_24h,
        "Change_Today_Raw": change_today,
        "Volume_Raw": vol_24h,
        "MarketCap_Raw": mcap,
        "VMC_Raw": vmc_raw,
        "Funding_Raw": 0.0,
        "Kimchi_Raw": 0.0,
        "utc0_open_Raw": utc0_open,
        # 추가 예정
        "Upbit_Vol": up_info.get("acc_trade_price_24h", 0.0),
        "Exact_Spot": exact_spot_ticker,
        "Exact_Futures": exact_futures_ticker,
        "Listed_Exchanges": list(
            listed_on
        ),  # 🚀 프론트엔드야, 이거 보고 이미지 박아라!
    }
    return row, is_updated


# 족보 청소기 로직 분리.
def clean_stale_tickers(binance_data, upbit_krw_set, mapping):
    # global MAPPING_DATA
    is_updated = False

    live_bases = (
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

    live_bases = {
        utils.get_pure_base_asset(t).upper() for t in binance_data.keys()
    } | upbit_krw_set
    dup_names = set(DUPLICATED_LIST.keys())

    keys_to_delete = [
        k
        for k in TICKER_DATA.keys()
        if k not in live_bases
        and k not in SPECIAL_SYMBOL_MAP
        and k not in SYMBOL_TO_ID_MAP
        and k not in dup_names
    ]

    for k in keys_to_delete:
        del TICKER_DATA[k]
        is_updated = True
        print(f"🧹 [안내] {k} 삭제 완료")

    return is_updated


# 위 함수들을 호출해서 최종 final_results 리스트를 완성.
def assemble_final_dashboard(
    global_listings,
    binance_data,
    upbit_data,
    market_data_map,
    asset_to_lookup_key,
    upbit_krw_set,
    bithumb_krw_set,
    upbit_only_assets,
    mapping,
    bybit_data,
):

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

    final_results = {}
    any_update = False
    processed_uids = set()

    # 역방향 족보 생성 (실제 티커명 및 매핑명 모두 대응)
    REVERSE_LOOKUP = {}
    for k, v in DUPLICATED_LIST.items():
        if len(v) >= 4:
            ex = v[3].upper()
            REVERSE_LOOKUP[f"{v[2].upper()}_{ex}"] = k
            REVERSE_LOOKUP[f"{k.split('(')[0].upper()}_{ex}"] = k

    # 테더 환율 (mapping.json의 중앙 마스터 상수 사용)
    krw_usd_rate = float(mapping.get("DEFAULT_KRW_USD_RATE", 0.0))
    try:
        tether_res = requests.get(
            "https://api.upbit.com/v1/ticker?markets=KRW-USDT", timeout=5
        ).json()
        if tether_res and len(tether_res) > 0:
            krw_usd_rate = float(tether_res[0]["trade_price"])
    except Exception as e:
        print(f"⚠️ 테더 환율 수집 실패, 기본값 {krw_usd_rate}원 사용")

    # 1. 바이낸스 투입
    for ticker, b_info in binance_data.items():
        base = utils.get_pure_base_asset(ticker).upper()
        if base in EXCLUSION_LIST:
            continue

        row, is_updated = build_binance_row(
            ticker,
            b_info,
            binance_data,
            upbit_data,
            market_data_map,
            asset_to_lookup_key,
            global_listings,
            upbit_krw_set,
            bithumb_krw_set,
            REVERSE_LOOKUP,
            processed_uids,
            mapping,
            krw_usd_rate,
            bybit_data,
        )
        if is_updated:
            any_update = True

        if row:
            row["krw_usd_rate"] = krw_usd_rate  # 🚀 모든 행에 테더 환율 공급
            uid = str(row.get("UID", row.get("DisplayTicker", ticker)))
            final_results[uid] = row

    # 2. 업비트 투입
    binance_base_set = {t.replace("USDT", "") for t in binance_data.keys()}
    for base in upbit_krw_set:
        alias_upbit_raw = str(REVERSE_LOOKUP.get(f"{base}_UPBIT", base) or base)
        alias_upbit = re.sub(
            r"_(binance|upbit|bithumb)$", "", alias_upbit_raw, flags=re.IGNORECASE)

        # 🚀 [수정] 바이낸스 처리 여부 확인 시 alias 비교 (단, 동명이인 META 등은 UID까지 일치해야 동일 코인으로 인정)
        up_key_check = REVERSE_LOOKUP.get(f"{base}_UPBIT")
        up_expected_uid = DUPLICATED_LIST[up_key_check][0] if up_key_check in DUPLICATED_LIST else None

        already_processed = False
        for r in final_results.values():
            # 1. DisplayTicker가 일치하면 무조건 동일 코인 (UP 등)
            if r.get("DisplayTicker") == alias_upbit:
                already_processed = True
                break
            # 2. Symbol이 일치할 때, 만약 족보에 기대 UID가 명시되어 있다면 UID까지 같아야 인정
            if r.get("Symbol") == base:
                if up_expected_uid and r.get("UID") != up_expected_uid:
                    continue
                already_processed = True
                break

        if already_processed:
            continue
        if base in EXCLUSION_LIST:
            continue

        row, updated = build_upbit_row(
            base,
            upbit_data.get(base),
            binance_data,
            market_data_map,
            asset_to_lookup_key,
            global_listings,
            upbit_krw_set,
            bithumb_krw_set,
            REVERSE_LOOKUP,
            processed_uids,
            krw_usd_rate,
            mapping,
            bybit_data,
            upbit_data,
        )
        if row:
            uid = str(row.get("UID", base))
            if uid in final_results:
                final_results[uid]["Upbit"] = "O"
                final_results[uid]["Listed_Exchanges"] = list(
                    set(
                        final_results[uid].get("Listed_Exchanges", [])
                        + row.get("Listed_Exchanges", [])
                    )
                )
                if row.get("Price_KRW"):
                    final_results[uid]["Price_KRW"] = row["Price_KRW"]

                    b_price = final_results[uid].get("Price_Raw", 0)
                    by_spot_p = bybit_data.get(base, {}).get("spot_price", 0.0)
                    target_overseas_p = b_price or by_spot_p

                    if target_overseas_p > 0 and krw_usd_rate > 0:
                        kimchi = (
                            (row["Price_KRW"] / (target_overseas_p * krw_usd_rate)) - 1
                        ) * 100
                        final_results[uid]["Kimchi_Raw"] = kimchi
                        final_results[uid]["Kimchi_Formatted"] = f"{kimchi:+.2f}%"

                final_results[uid]["Upbit_Symbol"] = base
            else:
                # Bybit Fallback for Upbit only coins
                by_spot_p = bybit_data.get(base, {}).get("spot_price", 0.0)
                if by_spot_p > 0 and row.get("Price_KRW"):
                    overseas_krw = by_spot_p * krw_usd_rate
                    kimchi = ((row["Price_KRW"] / overseas_krw) - 1) * 100
                    row["Kimchi_Raw"] = kimchi
                    row["Kimchi_Formatted"] = f"{kimchi:+.2f}%"
                    row["Listed_Exchanges"] = list(
                        set(row.get("Listed_Exchanges", []) + ["BYBIT"])
                    )
                row["krw_usd_rate"] = krw_usd_rate  # 🚀 모든 행에 테더 환율 공급
                final_results[uid] = row
        if updated:
            any_update = True

    # 3. 청소기 가동
    # if clean_stale_tickers(binance_data, upbit_krw_set, mapping):
    #     any_update = True

    # AS-IS: return final_results, any_update
    # TO-BE: 👇 딕셔너리의 값들만 리스트로 뽑아서 리턴!
    return list(final_results.values()), any_update
