# app.py
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, Request
from datetime import datetime
import threading
import requests
import pytz
import time
import sys
import io
import os

from pathlib import Path              # 👈 추가됨!
from fastapi import FastAPI, Request   # 👈 대문자 R 확인!

from . import api_manager             # 👈 우리 지휘관

# from modules import api_manager, 

# 윈도우 터미널 인코딩 문제를 해결하기 위해 표준 출력을 utf-8로 강제 설정
sys.stdout = io.TextIOWrapper(sys.stdout.detach(), encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.detach(), encoding='utf-8')

app = FastAPI(title="Blueprint Terminal")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # 🚀 모든 도메인(폰 포함) 허용!
    allow_credentials=True,
    allow_methods=["*"],      # 🚀 GET, POST 등 모든 방식 허용!
    allow_headers=["*"],      # 🚀 모든 헤더 허용!
)

BASE_DIR = Path(__file__).resolve().parent.parent

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

@app.get("/")
async def home(request: v):
    # 뼈대만 렌더링하고 데이터는 AJAX로 그림
    return templates.TemplateResponse(request=request, name="index.html")

# ⭐️ async 삭제됨!
@app.get("/api/market-data")
def get_market_data(force: bool = False):
    """프론트엔드의 표(Table)를 그리기 위한 데이터를 JSON으로 반환합니다."""
    data, last_updated = api_manager.get_cached_data(force_reload=force)
    return {"data": data, "last_updated": last_updated}

# ⭐️ async 삭제됨!
@app.get("/api/market-map")
def get_market_map():
    """업비트, 바낸 현물, 바낸 선물의 모든 심볼을 통합하여 가져옵니다."""
    try:
        u_res = requests.get("https://api.upbit.com/v1/market/all").json()
        upbit = [m['market'].replace('KRW-', '') for m in u_res if m['market'].startswith('KRW-')]
        
        f_res = requests.get("https://fapi.binance.com/fapi/v1/exchangeInfo").json()
        futures = [s['symbol'].replace('USDT', '') for s in f_res['symbols'] if s['quoteAsset'] == 'USDT' and s['status'] == 'TRADING']
        
        s_res = requests.get("https://api.binance.com/api/v3/exchangeInfo").json()
        spot = [s['symbol'].replace('USDT', '') for s in s_res['symbols'] if s['quoteAsset'] == 'USDT' and s['status'] == 'TRADING']
        
        all_assets = list(set(upbit + futures + spot))
        
        return {
            "all_assets": all_assets,
            "upbit": upbit,
            "futures": futures,
            "spot": spot
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
        
        # 캐시된 600개 리스트 중에서 내가 클릭한 코인을 찾습니다
        for coin in cached_data:
            if coin["Symbol"] == asset or coin["DisplayTicker"] == asset:
                return {
                    "asset": asset,
                    "name": coin["Name"],
                    "market_cap": coin["MarketCap_Formatted"]
                }
        
        # 캐시에 없으면 (신규 상장 등)
        return {"asset": asset, "name": asset, "market_cap": "정보 없음"}
    except Exception as e:
        return {"asset": asset, "name": asset, "market_cap": "조회 실패"}

@app.get("/api/candles")
def get_proxy_candles(exchange: str, symbol: str, interval: str, limit: int = 200):
    """JS 대신 파이썬이 업비트/바낸에 차트 데이터를 요청해서 가져다 줍니다 (CORS 완벽 우회)"""
    try:
        if exchange == "upbit":
            # 업비트 요청
            url = f"https://api.upbit.com/v1/candles/{interval}?market={symbol}&count={limit}"
            res = requests.get(url, headers={"Accept": "application/json"}, timeout=5)
            res.raise_for_status()
            return res.json()
            
        elif exchange == "binance_futures":
            # 바이낸스 선물 요청
            url = f"https://fapi.binance.com/fapi/v1/klines?symbol={symbol}&interval={interval}&limit={limit}"
            res = requests.get(url, timeout=5)
            res.raise_for_status()
            return res.json()
            
        elif exchange == "binance_spot":
            # 바이낸스 현물 요청
            url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}"
            res = requests.get(url, timeout=5)
            res.raise_for_status()
            return res.json()
            
        else:
            return {"error": "알 수 없는 거래소입니다."}
            
    except Exception as e:
        print(f"🚨 캔들 프록시 에러 ({exchange} - {symbol}): {e}")
        return {"error": str(e)}

def open_browser():
    webbrowser.open("http://127.0.0.1:8000")
    
def auto_reset_scheduler():
    while True:
        kst = pytz.timezone('Asia/Seoul')
        now_kst = datetime.now(kst)
        
        # 9시 0분 0초 ~ 30초 사이에만 한 번 트리거
        if now_kst.hour == 9 and now_kst.minute == 0 and now_kst.second < 30:
            print("⏰ 스케줄러: 9시 정각입니다. 캐시를 갱신합니다.")
            api_manager.get_cached_data(force_reload=True)
            time.sleep(40) # 중복 실행 방지용 40초 휴식
        
        time.sleep(10) # 10초마다 시계 확인    

@app.on_event("startup")
def on_startup():
    # ⭐️ 9시 정각 감시 스레드 시작
    threading.Thread(target=auto_reset_scheduler, daemon=True).start()
    
    # ⭐️ 데이터 긁어오기 (이건 배포든 로컬이든 필수!)
    threading.Thread(target=api_manager.get_cached_data, args=(True,)).start()
    
    # 🚀 로컬(127.0.0.1) 환경이고, 아직 브라우저 안 열었을 때만 실행
    # Railway 같은 곳에서는 이 환경변수가 없으므로 브라우저를 열지 않는다는 소문이 있네요
    if not os.environ.get("RAILWAY_STATIC_URL") and not os.environ.get("BROWSER_OPENED"):
        threading.Timer(1.5, open_browser).start()
        os.environ["BROWSER_OPENED"] = "1"