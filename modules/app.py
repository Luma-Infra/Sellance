# app.py
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

import config  # 🚀 설정 모듈 임포트

from . import trace_hooking
from . import api_manager
from .adapter import ExchangeAdapter # 🔌 통합 지휘소 영입

# from modules import api_manager,

# 🚀 터미널 인코딩은 환경변수(PYTHONIOENCODING)로 처리합니다.

app = FastAPI(title="Blueprint Terminal")

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

        return {
            "all_assets": all_assets,
            "upbit": upbit,
            "futures": futures,
            "spot": spot,
            "bithumb": bithumb,
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
            if coin["Symbol"] == asset or coin["DisplayTicker"] == asset:
                return {
                    "asset": asset,
                    "name": coin["Name"],
                    "market_cap": coin["MarketCap_Formatted"],
                }

        # 캐시에 없으면 (신규 상장 등)
        return {"asset": asset, "name": asset, "market_cap": "정보 없음"}
    except Exception as e:
        return {"asset": asset, "name": asset, "market_cap": "조회 실패"}


@app.get("/api/candles")
def get_proxy_candles(
    exchange: str, symbol: str, interval: str, limit: int = 200, to: str = "", start: str = ""
):
    """중앙 통제된 어댑터를 통해 모든 거래소의 캔들 데이터를 통합 조회합니다."""
    try:
        url = ExchangeAdapter.get_candle_url(exchange, symbol, interval, limit, to, start)
        if not url: return {"error": "지원하지 않는 거래소입니다."}

        res = requests.get(url, headers={"Accept": "application/json"}, timeout=5)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        print(f"🚨 통합 프록시 에러 ({exchange} - {symbol}): {e}")
        return {"error": str(e)}


# 🚀 메모리 캐시 변수 추가
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


@app.on_event("startup")
def on_startup():
    # trace_hooking 파일 안에 apply_traces 함수가 있다고 가정합니다.
    # 만약 웹소켓 매니저가 있다면 그 broadcast 함수를 넣어주면 됩니다.
    # trace_hooking.apply_traces(None)

    # ⭐️ 9시 정각 감시 스레드 시작
    threading.Thread(target=auto_reset_scheduler, daemon=True).start()

    # ⭐️ 데이터 긁어오기 (이건 배포든 로컬이든 필수!)
    threading.Thread(target=api_manager.get_cached_data, args=(True,)).start()

    # 🚀 로컬(127.0.0.1) 환경이고, 아직 브라우저 안 열었을 때만 실행
    # Railway 같은 곳에서는 이 환경변수가 없으므로 브라우저를 열지 않는다는 소문이 있네요
    if not os.environ.get("RAILWAY_STATIC_URL") and not os.environ.get(
        "BROWSER_OPENED"
    ):
        threading.Timer(1.5, open_browser).start()
        os.environ["BROWSER_OPENED"] = "1"
