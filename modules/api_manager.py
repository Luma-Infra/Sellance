# api_manager.py
from contextlib import contextmanager
from datetime import datetime
import threading
import traceback
import pytz
import sys
import os
import re

# ✅ 수정 (옆방 부하들 호출하는 정석)
from modules import builder, cmc_api, exchange_api, config_manager, utils
from modules.exchange_api import capture_utc0_prices_bulk

# --- ⭐️ GLOBAL CACHE SETTINGS ⭐️ ---
KST = pytz.timezone("Asia/Seoul")
GLOBAL_CACHE = {"data": [], "timestamp": datetime.min, "last_updated_str": ""}
CACHE_TIMEOUT_SECONDS = 3600  # 1시간


# 🚀 [추가] 9시 정밀 캡처 스케줄러
def start_kst_9am_scheduler():
    import time

    def run_scheduler():
        print("⏰ [SYSTEM] 9시 정밀 시가 스케줄러 가동 중...")
        last_captured_sec = -1
        while True:
            try:
                now = datetime.now(KST)
                if now.hour == 9 and now.minute == 0 and now.second in [0, 10, 20]:
                    if last_captured_sec != now.second:
                        capture_utc0_prices_bulk()
                        last_captured_sec = now.second
                if now.hour != 9:
                    last_captured_sec = -1
            except Exception as e:
                print(f"🚨 [SCHEDULER ERROR] {e}")
            time.sleep(1)

    thread = threading.Thread(target=run_scheduler, daemon=True)
    thread.start()


# 서버 로드 시 즉시 실행
start_kst_9am_scheduler()

# 🚀 [수정] 모듈 로드 시점에 즉시 실행하지 않고, 처음 호출될 때 초기화하도록 변경
_INITIALIZED = False
MAPPING_DATA = None


def _ensure_initialized():
    global _INITIALIZED, MAPPING_DATA
    if _INITIALIZED:
        return
    try:
        MAPPING_DATA = config_manager.load_mapping_data()
        _INITIALIZED = True
    except:
        pass


@contextmanager
def suppress_output():
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    try:
        with open(os.devnull, "w") as devnull:
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
    # 🚀 1. 족보 로드 (항상 최신본으로 시작!)
    MAPPING_DATA = config_manager.load_mapping_data()
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
    ) = config_manager.get_mapping_parts(MAPPING_DATA)

    # 1. 시세 수집
    (
        binance_data,
        upbit_data,
        upbit_krw_set,
        upbit_only_assets,
        bithumb_krw_set,
        bybit_data,
    ) = exchange_api.fetch_exchange_market_data(MAPPING_DATA)
    print(
        f"📊 [1/3 시세 수집 완료] 바낸:{len(binance_data)}, 업비트:{len(upbit_data)}, 바이비트:{len(bybit_data)}"
    )

    # 2. 정보 수집 (CMC)
    market_data_map, asset_to_lookup_key = cmc_api.fetch_cmc_market_data(
        binance_data, upbit_only_assets, MAPPING_DATA
    )
    print(f"📊 [2/3 CMC 매칭 완료] 장부 매칭 성공:{len(market_data_map)}개")

    # 3. 조립 및 계산
    global_listings = exchange_api.fetch_global_listings()

    # ✅ 조립 부대 가동 (에러 방어막 가동)
    final_results = []
    is_mapping_updated = False
    try:
        final_results, is_mapping_updated = builder.assemble_final_dashboard(
            global_listings,
            binance_data,
            upbit_data,
            market_data_map,
            asset_to_lookup_key,
            upbit_krw_set,
            bithumb_krw_set,
            upbit_only_assets,
            MAPPING_DATA,
            bybit_data,
        )
        print(f"📊 [3/3 장부 조립 완료] 최종 {len(final_results)}개 자산 입고")
    except Exception as e:
        print(f"🚨 [조립 치명적 에러]: {e}")
        import traceback

        traceback.print_exc()

    # 족보 업데이트가 발생했다면 저장 (이게 없으면 EDGE 같은 놈들이 매번 세탁기 돌아갑니다)
    if is_mapping_updated:
        config_manager.save_mapping_data(MAPPING_DATA)
        print("💾 [업데이트] 새로운 족보(mapping.json)가 저장되었습니다.")

    all_live_assets = (
        binance_data.keys() | upbit_krw_set
    )  # 현재 살아있는 모든 티커(원본)
    live_bases = {utils.get_pure_base_asset(a).upper() for a in all_live_assets}

    # 🧹 [청소기 가동 구간 - 안전장치 추가 🚀]
    if len(binance_data) < 100 or len(upbit_krw_set) < 10:
        print(
            "⚠️ [SAFEGUARD] 데이터 수집량이 너무 적어 족보 청소를 중단합니다. (API 에러 의심)"
        )
        return final_results

    keys_to_delete = []

    # DUPLICATED_LIST의 키값(별명)들을 세트로 미리 준비 (속도 향상)
    dup_names = set(MAPPING_DATA.get("DUPLICATED_LIST", {}).keys())
    # 🚀 '_거래소명' 꼬리표를 떼어낸 순수 별명들도 준비 (TICKER_DATA와 비교용)
    dup_names_clean = {
        re.sub(r"_(binance|upbit|bithumb)$", "", k, flags=re.IGNORECASE)
        for k in dup_names
    }

    for saved_name in list(MAPPING_DATA["TICKER_DATA"].keys()):
        # 🚀 철벽 조건:
        # 1. 라이브 목록(live_bases)에 없고
        # 2. 특별 맵핑(SPECIAL_SYMBOL_MAP)에도 없고
        # 3. 고정 UID 맵(SYMBOL_TO_ID_MAP)에도 없고
        # 4. 🔥 [추가] 중복 리스트(DUPLICATED_LIST) 별명에도 없을 경우에만!
        if (
            saved_name not in live_bases
            and saved_name not in SPECIAL_SYMBOL_MAP
            and saved_name not in SYMBOL_TO_ID_MAP
            and saved_name not in dup_names_clean
        ):

            keys_to_delete.append(saved_name)

    for k in keys_to_delete:
        del MAPPING_DATA["TICKER_DATA"][k]
        is_mapping_updated = True
        print(f"🧹 [청소] 상폐/미거래 코인 {k} 족보에서 삭제 완료!")

    # 5. 시총 정렬 후 반환
    if isinstance(final_results, list):
        final_results.sort(key=lambda x: x.get("MarketCap_Raw", 0), reverse=True)

    # ✅ [수정] 저장을 시키세요!
    if is_mapping_updated:
        config_manager.save_mapping_data(MAPPING_DATA)  # 🚀 드디어 도구를 사용함!
        print(f"💾 새로운 코인 정보가 mapping.json에 저장 완료되었습니다!")

    return final_results


data_lock = threading.Lock()


def get_cached_data(force_reload=False):
    global GLOBAL_CACHE
    _ensure_initialized()  # 🚀 [추가] 실제 요청 시점에 데이터 로드
    with data_lock:
        # 🚀 1. 지금 시간을 무조건 한국 시간(KST)으로 꽉 고정!
        kst = pytz.timezone("Asia/Seoul")
        now_kst = datetime.now(kst)

        needs_reset = False

        # 🚀 2. timestamp가 datetime.min이 아닐 때만 계산 (에러 방지)
        if GLOBAL_CACHE["timestamp"] != datetime.min:
            # 저장된 시간도 KST로 변환해서 정확히 비교
            last_update_kst = GLOBAL_CACHE["timestamp"].astimezone(kst)

            # 오늘 9시가 지났고, 마지막 업데이트가 오늘 9시 이전이면 리셋!
            if now_kst.hour >= 9 and (
                last_update_kst.date() < now_kst.date() or last_update_kst.hour < 9
            ):
                needs_reset = True
                print("🚨 오전 9시 정각 리셋 트리거 발동!")

        # 🚀 3. 캐시 만료 로직 (시간 계산 깔끔하게)
        is_expired = False
        if GLOBAL_CACHE["timestamp"] != datetime.min:
            # now_kst와 비교하기 위해 KST로 맞춰서 계산
            is_expired = (
                now_kst - GLOBAL_CACHE["timestamp"].astimezone(kst)
            ).total_seconds() > CACHE_TIMEOUT_SECONDS
        else:
            is_expired = True  # 처음 켰을 때는 무조건 갱신

        if force_reload or needs_reset or is_expired:
            # print("💡 API 데이터를 수집합니다... (약 5~10초 소요)")
            try:
                raw_data = _fetch_and_process_data()

                if raw_data:
                    GLOBAL_CACHE.update(
                        {
                            "data": raw_data,
                            "timestamp": now_kst,  # 🚀 저장할 때도 무조건 KST로 저장!
                            "last_updated_str": now_kst.strftime("%Y-%m-%d %H:%M:%S"),
                        }
                    )
                    print(f"✅ 데이터 캐싱 완료! (총 {len(raw_data)}개)")
            except Exception as e:
                print(f"데이터 수집 에러: {e}")
                traceback.print_exc()

    # 🚀 반환 직전에 리스트로 변환 (프론트엔드 array.length 체크 대응)
    data_to_return = GLOBAL_CACHE["data"]
    if isinstance(data_to_return, dict):
        data_to_return = list(data_to_return.values())

    return data_to_return, GLOBAL_CACHE["last_updated_str"]
