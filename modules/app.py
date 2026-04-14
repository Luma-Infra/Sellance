# app.py
from fastapi import FastAPI, Request
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from modules.api_manager import get_cached_data
import os
import threading
import webbrowser
import requests  # ⭐️ 추가됨!
import config    # ⭐️ 추가됨!
import sys
import io

# 윈도우 터미널 인코딩 문제를 해결하기 위해 표준 출력을 utf-8로 강제 설정
sys.stdout = io.TextIOWrapper(sys.stdout.detach(), encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.detach(), encoding='utf-8')

app = FastAPI(title="Blueprint Terminal")

BASE_DIR = Path(__file__).resolve().parent.parent

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

@app.get("/")
async def home(request: Request):
    # 뼈대만 렌더링하고 데이터는 AJAX로 그림
    return templates.TemplateResponse(request=request, name="index.html")

# ⭐️ async 삭제됨!
@app.get("/api/market-data")
def get_market_data(force: bool = False):
    """프론트엔드의 표(Table)를 그리기 위한 데이터를 JSON으로 반환합니다."""
    data, last_updated = get_cached_data(force_reload=force)
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
        cached_data, _ = get_cached_data(force_reload=False)
        
        # 캐시된 400개 리스트 중에서 내가 클릭한 코인을 찾습니다
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

def open_browser():
    webbrowser.open("http://127.0.0.1:8000")

@app.on_event("startup")
def on_startup():
    # ⭐️ 데이터 긁어오기 (이건 배포든 로컬이든 필수!)
    threading.Thread(target=get_cached_data, args=(True,)).start()
    
    # 🚀 로컬(127.0.0.1) 환경이고, 아직 브라우저 안 열었을 때만 실행
    # Railway 같은 곳에서는 이 환경변수가 없으므로 브라우저를 열지 않습니다.
    if not os.environ.get("RAILWAY_STATIC_URL") and not os.environ.get("BROWSER_OPENED"):
        threading.Timer(1.5, open_browser).start()
        os.environ["BROWSER_OPENED"] = "1"