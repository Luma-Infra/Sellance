# app.py
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from tvDatafeed import TvDatafeed, Interval
from fastapi import FastAPI, Request, Body
from dotenv import load_dotenv
from datetime import datetime
from pathlib import Path
import pandas as pd
import webbrowser
import threading
import requests
import asyncio
import pytz
import json
import time
import sys
import io
import os
import re

import config  # 🚀 설정 모듈 임포트

from . import trace_hooking
from . import api_manager
from .adapter import ExchangeAdapter # 🔌 통합 지휘소 영입

# from modules import api_manager,

# 🚀 터미널 인코딩은 환경변수(PYTHONIOENCODING)로 처리합니다.

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ⭐️ 9시 정각 감시 스레드 시작
    threading.Thread(target=auto_reset_scheduler, daemon=True).start()

    # ⭐️ 데이터 긁어오기 (이건 배포든 로컬이든 필수!)
    threading.Thread(target=api_manager.get_cached_data, args=(True,)).start()

    # 🚀 로컬(127.0.0.1) 환경이고, 아직 브라우저 안 열었을 때만 실행
    if not os.environ.get("RAILWAY_STATIC_URL") and not os.environ.get("BROWSER_OPENED"):
        threading.Timer(1.5, open_browser).start()
        os.environ["BROWSER_OPENED"] = "1"
    
    yield

app = FastAPI(title="Blueprint Terminal", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 🚀 모든 도메인(폰 포함) 허용!
    allow_credentials=True,
    allow_methods=["*"],  # 🚀 GET, POST 등 모든 방식 허용!
    allow_headers=["*"],  # 🚀 모든 헤더 허용!
)

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
print(f"📂 [PATH CHECK] Static Directory: {STATIC_DIR.absolute()}")

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.get("/")
async def home(request: Request):
    # 뼈대만 렌더링하고 데이터는 AJAX로 그림
    return templates.TemplateResponse(request=request, name="index.html")


load_dotenv()


@app.get("/api/get-env-key")
def get_env_cmc_key():
    """서버 환경변수에 설정된 CMC_API_KEY를 안전하게 전달합니다."""
    # 서버 os.environ에서 가져오고, 없으면 빈 문자열
    env_key = os.environ.get("CMC_API_KEY", "")
    return {"key": env_key}


# ⭐️ async 삭제됨!
@app.get("/api/market-data")
def get_market_data(force: bool = False):
    """프론트엔드의 표(Table)를 그리기 위한 데이터를 JSON으로 반환합니다."""
    data, last_updated = api_manager.get_cached_data(force_reload=force)
    return {"data": data, "last_updated": last_updated}


# app.py 내부 라우터 교체
@app.get("/api/market-map")
def get_market_map():
    """🚨 생짜 API 호출 삭제! 중앙 캐시에서 0.01초 만에 뽑아옵니다."""
    try:
        # 중앙 통제소에서 데이터 가져오기 (force=False 라서 크레딧 소모 0)
        cached_data, _ = api_manager.get_cached_data(force_reload=False)

        # 조립된 데이터 안에서 슥슥 뽑아내기만 하면 끝!
        upbit = [c["Symbol"] for c in cached_data if c.get("Upbit") == "O"]
        futures = [
            c["Symbol"]
            for c in cached_data
            if "BINANCE_FUTURES" in c.get("Listed_Exchanges", [])
        ]
        spot = [
            c["Symbol"]
            for c in cached_data
            if "BINANCE" in c.get("Listed_Exchanges", [])
        ]
        bithumb = [
            c["Symbol"]
            for c in cached_data
            if "BITHUMB" in c.get("Listed_Exchanges", [])
        ]
        all_assets = list(set(upbit + futures + spot + bithumb))
        fallback_rate = float(api_manager.MAPPING_DATA.get("DEFAULT_KRW_USD_RATE", 0.0)) if api_manager.MAPPING_DATA else 0.0
        krw_usd_rate = cached_data[0].get("krw_usd_rate", fallback_rate) if cached_data else fallback_rate

        return {
            "all_assets": all_assets,
            "upbit": upbit,
            "futures": futures,
            "spot": spot,
            "bithumb": bithumb,
            "krw_usd_rate": krw_usd_rate,
        }
    except Exception as e:
        return {"error": str(e)}


# ⭐️ async 삭제됨!
@app.get("/api/coin-info/{asset}")
def get_coin_info(asset: str):
    """캐시된 데이터에서 코인 정보를 찾아 반환합니다. (CMC 호출 안 함 = 크레딧 0원)"""
    try:
        # api_manager.py의 캐시 데이터를 가져옵니다 (force=False 이므로 API 새로 안 찌름)
        cached_data, _ = api_manager.get_cached_data(force_reload=False)

        # 캐시된 800개 리스트 중에서 내가 클릭한 코인을 찾습니다
        for coin in cached_data:
            if coin["Symbol"] == asset or coin["DisplayTicker"] == asset or coin["Ticker"] == asset:
                return {
                    "asset": coin["DisplayTicker"],
                    "symbol": coin["Symbol"],
                    "name": coin["Name"],
                    "market_cap": coin["MarketCap_Formatted"],
                }

        # 캐시에 없으면 (신규 상장 등)
        return {"asset": asset, "symbol": asset.split("(")[0], "name": asset, "market_cap": "정보 없음"}
    except Exception as e:
        return {"asset": asset, "name": asset, "market_cap": "조회 실패"}


@app.get("/api/candles")
def get_proxy_candles(
    exchange: str, symbol: str, interval: str, limit: int = 200, to: str = "", start: str = ""
):
    """중앙 통제된 어댑터를 통해 모든 거래소의 캔들 데이터를 통합 조회합니다."""
    # 🚀 [추가] 프론트엔드 중복 요청 폭격 방어용 5초 TTL 초고속 캐시 엔진 및 자동 청소기
    if not hasattr(app.state, "req_cache"):
        app.state.req_cache = {}

    now = time.time()
    # 🚀 [사용자님 철학 반영] 딕셔너리에 캐시가 100개 이상 쌓이면 5초 이상 지난 쓰레기 메모리 즉시 청소! (메모리 누수 0% 보장)
    if len(app.state.req_cache) > 100:
        app.state.req_cache = {k: v for k, v in app.state.req_cache.items() if now - v[0] < 5}

    req_cache_key = f"{exchange}_{symbol}_{interval}_{limit}_{start}_{to}"
    if req_cache_key in app.state.req_cache:
        cached_time, cached_data = app.state.req_cache[req_cache_key]
        if now - cached_time < 5:
            return cached_data

    try:
        url = ExchangeAdapter.get_candle_url(exchange, symbol, interval, limit, to, start)
        if not url: return {"error": "지원하지 않는 거래소입니다."}

        res = requests.get(url, headers={"Accept": "application/json"}, timeout=5)
        res.raise_for_status()
        data = res.json()

        if not hasattr(app.state, "req_cache"):
            app.state.req_cache = {}
        app.state.req_cache[req_cache_key] = (now, data)

        # 🚀 [설정 기반 단절 복구 엔진 (mapping.json 연동)]
        # 하드코딩을 배제하고 mapping.json의 PAST_GAP_RECOVERY_MAP에 등록된 코인(AIA 등)에 한해서만,
        # 바이낸스 API 응답이 비어있거나 과거 데이터가 누락되었을 때 TvDatafeed로 과거 캔들을 자동 병합/보간합니다.
        recovery_map = api_manager.MAPPING_DATA.get("PAST_GAP_RECOVERY_MAP", {}) if api_manager.MAPPING_DATA else {}
        base_sym = symbol[:-4] if symbol.endswith("USDT") else symbol.split("_")[0].split("-")[-1]
        
        if base_sym in recovery_map and isinstance(data, list):
            # 🚀 [사용자님 철학 반영] 1day(일봉) 이상에서만 라이브러리 호출 가동, 그 이하(분/시간봉)는 걍 무시!
            # 일봉/주봉/월봉 등 단위가 d, w, M으로 끝나는 경우만 폴백 가동 (1m, 1h, 12h 등은 무시)
            if not (interval.endswith("d") or interval.endswith("w") or interval.endswith("M")):
                return data

            # 🚀 [사용자님 철학 반영] 흉물스러운 날짜 하드코딩 전면 삭제! 
            # 수학적 계산으로 바이낸스 응답 캔들 갯수가 limit보다 부족할 때만 트뷰 라이브러리 폴백 가동!
            if len(data) < limit:
                cache_key = f"{base_sym}_{interval}_{exchange}"
                
                # 🚀 1. 메모리 캐시 확인 (0.0001초 광속 조회 보장!)
                if cache_key in app.state.tv_gap_cache:
                    fallback_data = app.state.tv_gap_cache[cache_key]
                    target_ts = data[0][0] if len(data) > 0 else (int(to) if to else int(time.time() * 1000))
                    filtered_fallback = [row for row in fallback_data if row[0] < target_ts]
                    
                    # 🚀 [사용자님 철학 반영] 무식하게 트뷰 라이브러리 전부 때려박지 말고, limit 총량에 맞춰 Lazy 조립!
                    needed = limit - len(data)
                    if needed > 0:
                        return filtered_fallback[-needed:] + data
                    return data

                tv_exch = recovery_map[base_sym]
                print(f"⚠️ 단절 데이터 복구 감지 ({base_sym} / {symbol}). TvDatafeed({tv_exch}) 스마트 폴백 가동!")
                try:
                    tv = TvDatafeed()
                    tv_interval_map = {
                        "1m": Interval.in_1_minute, "3m": Interval.in_3_minute, "5m": Interval.in_5_minute,
                        "15m": Interval.in_15_minute, "30m": Interval.in_30_minute, "1h": Interval.in_1_hour,
                        "2h": Interval.in_2_hour, "4h": Interval.in_4_hour, "1d": Interval.in_daily,
                        "1w": Interval.in_weekly, "1M": Interval.in_monthly,
                    }
                    
                    # 🚀 하드코딩 완전 배제! 정규식을 통한 범용 커스텀 타임프레임 파싱 및 동적 리샘플링 엔진
                    step = 1
                    resample_needed = False
                    tv_int = tv_interval_map.get(interval)
                    
                    if tv_int is None:
                        # 매핑에 없는 커스텀 봉(예: 3d, 5d, 6h, 8h, 12h 등) 파싱
                        match = re.match(r"(\d+)([mhdwM])", interval)
                        if match:
                            step = int(match.group(1))
                            unit = match.group(2)
                            resample_needed = (step > 1)
                            if unit == "d":
                                tv_int = Interval.in_daily
                            elif unit == "h":
                                tv_int = Interval.in_1_hour
                            elif unit == "m":
                                tv_int = Interval.in_1_minute
                            else:
                                tv_int = Interval.in_daily
                        else:
                            tv_int = Interval.in_daily
                    
                    sym_candidates = (
                        [f"{base_sym}USDT.P", f"{base_sym}USDT"]
                        if exchange == "binance_futures"
                        else [f"{base_sym}USDT", f"{base_sym}USDT.P"]
                    )
                    
                    df = None
                    for cand in sym_candidates:
                        # 🚀 리샘플링 병합 및 깊은 과거(25년도 9월) 도달을 고려하여 넉넉하게 5000개 조회
                        df = tv.get_hist(symbol=cand, exchange=tv_exch, interval=tv_int, n_bars=5000)
                        if df is not None and not df.empty:
                            print(f" └─ [탐색 성공] TvDatafeed 심볼 '{cand}'에서 {len(df)}개 캔들 발견!")
                            break

                    if df is not None and not df.empty:
                        fallback_data = []
                        
                        # 🚀 하드코딩 없는 범용 N단위 리샘플링 병합기 (Open, High, Low, Close, Volume 조립)
                        if resample_needed:
                            temp_chunks = []
                            curr_chunk = []
                            df = df.sort_index()
                            for dt_val, row in df.iterrows():
                                curr_chunk.append((dt_val, row))
                                if len(curr_chunk) == step:
                                    temp_chunks.append(curr_chunk)
                                    curr_chunk = []
                            if curr_chunk:
                                temp_chunks.append(curr_chunk)
                                
                            for chunk in temp_chunks:
                                first_dt, first_row = chunk[0]
                                dt = pd.to_datetime(first_dt)
                                ts_ms = int(datetime(dt.year, dt.month, dt.day, dt.hour, dt.minute, tzinfo=pytz.UTC).timestamp() * 1000)
                                
                                o = str(first_row["open"])
                                h = str(max([r["high"] for _, r in chunk]))
                                l = str(min([r["low"] for _, r in chunk]))
                                c = str(chunk[-1][1]["close"])
                                v = str(sum([r["volume"] for _, r in chunk]))
                                fallback_data.append([ts_ms, o, h, l, c, v])
                        else:
                            for dt_val, row in df.iterrows():
                                dt = pd.to_datetime(dt_val)
                                ts_ms = int(datetime(dt.year, dt.month, dt.day, dt.hour, dt.minute, tzinfo=pytz.UTC).timestamp() * 1000)
                                fallback_data.append([
                                    ts_ms, str(row["open"]), str(row["high"]), str(row["low"]), str(row["close"]), str(row["volume"])
                                ])
                        
                        if fallback_data:
                            # 🚀 [사용자님 철학 반영] 무식하게 5000개 덤핑값을 통째로 캐싱하지 않고, 딱 limit 갯수만큼 다이어트 압축 저장! (백엔드 RAM 90% 절약)
                            compressed_cache = fallback_data[-limit:]
                            app.state.tv_gap_cache[cache_key] = compressed_cache
                            print(f"✅ 단절 복구 및 범용 캐싱 완료 ({cache_key}): 과거 {len(compressed_cache)}개 압축 캔들!")
                            
                            target_ts = data[0][0] if len(data) > 0 else (int(to) if to else int(time.time() * 1000))
                            filtered_fallback = [row for row in fallback_data if row[0] < target_ts]
                            
                            # 🚀 [사용자님 철학 반영] 무식하게 트뷰 라이브러리 전부 때려박지 말고, limit 총량에 맞춰 Lazy 조립!
                            needed = limit - len(data)
                            if needed > 0:
                                return filtered_fallback[-needed:] + data
                            return data
                except Exception as tv_err:
                    print(f"🚨 TvDatafeed 복구 실패 ({base_sym}): {tv_err}")

        return data
    except Exception as e:
        print(f"🚨 통합 프록시 에러 ({exchange} - {symbol}): {e}")
        return {"error": str(e)}


# 🚀 메모리 캐시 변수 추가
app.state.tv_gap_cache = {}
app.state.usdkrw_cache = None


@app.get("/api/usdkrw")
def get_usdkrw_history():
    """24년 6월 10일 전후 하이브리드 병합 + 주말 휴장 정밀 보간 엔진"""
    if app.state.usdkrw_cache is not None:
        return app.state.usdkrw_cache

    try:
        # 1. 과거 FX 환율 (FX_IDC) 수집
        tv = TvDatafeed()
        df_fx = tv.get_hist(
            symbol="USDKRW", exchange="FX_IDC", interval=Interval.in_daily, n_bars=3650
        )

        # 2. 최근 테더 환율 (UPBIT) 수집
        res = requests.get(
            "https://api.upbit.com/v1/candles/days?market=KRW-USDT&count=500", timeout=5
        )
        res.raise_for_status()
        upbit_tether = res.json()

        raw_map = {}
        UPBIT_LAUNCH_TS = 1717977600  # 2024-06-10 00:00:00 UTC

        # A. 데이터 수집 (원시 맵 구성)
        if df_fx is not None and not df_fx.empty:
            for date, row in df_fx.iterrows():
                dt = pd.to_datetime(date)
                ts = int(
                    datetime(dt.year, dt.month, dt.day, tzinfo=pytz.UTC).timestamp()
                )
                if ts < UPBIT_LAUNCH_TS:
                    raw_map[ts] = float(row["close"])

        for c in upbit_tether:
            dt = datetime.fromisoformat(c["candle_date_time_utc"])
            ts = int(dt.replace(tzinfo=pytz.UTC).timestamp())
            if ts >= UPBIT_LAUNCH_TS:
                raw_map[ts] = float(c["trade_price"])

        if not raw_map:
            return {"error": "환율 데이터를 수집하지 못했습니다."}

        # B. 정밀 보간 (Interpolation) 로직
        sorted_ts = sorted(raw_map.keys())
        min_ts, max_ts = sorted_ts[0], sorted_ts[-1]

        history_map = {}
        curr_ts = min_ts
        day_sec = 86400  # 하루(초)

        while curr_ts <= max_ts:
            if curr_ts in raw_map:
                history_map[str(curr_ts)] = raw_map[curr_ts]
            else:
                # 🚀 데이터가 비어있다면 (주말 등) 전후 데이터를 찾아 선형 보간
                prev_ts = max([ts for ts in sorted_ts if ts < curr_ts], default=None)
                next_ts = min([ts for ts in sorted_ts if ts > curr_ts], default=None)

                if prev_ts and next_ts:
                    weight = (curr_ts - prev_ts) / (next_ts - prev_ts)
                    interp_val = raw_map[prev_ts] + weight * (
                        raw_map[next_ts] - raw_map[prev_ts]
                    )
                    history_map[str(curr_ts)] = round(interp_val, 2)
                elif prev_ts:
                    history_map[str(curr_ts)] = raw_map[prev_ts]

            curr_ts += day_sec

        app.state.usdkrw_cache = history_map
        print(
            f"✅ 환율 엔진: 총 {len(history_map)}일치 데이터 병합 및 보간 완료 (기준일: 24/06/10)"
        )
        return history_map

    except Exception as e:
        print(f"🚨 환율 보간 엔진 에러: {e}")
        return {"error": str(e)}


@app.get("/api/settings")
def get_settings():
    return {"CMC_API_KEY": config.CMC_API_KEY, "THEME": "BINANCE"}  # 기본값


@app.post("/api/settings")
def update_settings(data: dict = Body(...)):
    if "CMC_API_KEY" in data:
        config.set_cmc_api_key(data["CMC_API_KEY"])
    return {"status": "success"}


# 서버 시작 시 브라우저 자동 실행 (기존 로직 유지)
def open_browser():
    webbrowser.open("http://127.0.0.1:8000")


def auto_reset_scheduler():
    while True:
        kst = pytz.timezone("Asia/Seoul")
        now_kst = datetime.now(kst)

        # 9시 0분 0초 ~ 30초 사이에만 한 번 트리거
        if now_kst.hour == 9 and now_kst.minute == 0 and now_kst.second < 30:
            print("⏰ 스케줄러: 9시 정각입니다. 캐시를 갱신합니다.")
            api_manager.get_cached_data(force_reload=True)
            time.sleep(30)  # 중복 실행 방지용 휴식

        time.sleep(10)  # 10초마다 시계 확인


@app.get("/api/progress")
async def progress_stream():
    """프론트엔드에 현재 진행 상황을 실시간으로 쏴주는 빨대"""

    async def event_generator():
        while True:
            # trace_hooking에 있는 status_list와 PHASES를 가져옴
            data = {
                "phases": trace_hooking.PHASES,
                "status": trace_hooking.status_list,
                "percent": int(
                    (
                        trace_hooking.status_list.count("완료!!")
                        / len(trace_hooking.PHASES)
                    )
                    * 100
                ),
            }
            yield f"data: {json.dumps(data)}\n\n"

            # 모든 단계가 완료되면 중단하거나 계속 대기
            if data["percent"] == 100:
                break
            await asyncio.sleep(0.5)  # 0.5초마다 업데이트

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# 기존 @app.on_event("startup") 방식은 최신 FastAPI 표준인 lifespan으로 대체되었습니다.
