# config.py
import os
from pathlib import Path

ENV_FILE = Path(".env")

def get_cmc_api_key():
    # 1. 🚀 배포 환경(Railway 등) 변수부터 확인 (최우선)
    api_key = os.environ.get("CMC_API_KEY")
    if api_key:
        return api_key

    # 2. 🏠 로컬 환경: .env 파일 확인
    if ENV_FILE.exists():
        with open(ENV_FILE, "r") as f:
            for line in f:
                if line.startswith("CMC_API_KEY="):
                    return line.strip().split("=")[1]
    
    # 3. ⌨️ 둘 다 없으면 로컬 최초 실행으로 간주하고 입력 받기
    # 단, 서버(배포) 환경이 아닐 때만 실행되도록 안전장치
    if not os.environ.get("RAILWAY_STATIC_URL"): # Railway 환경이 아닐 때만
        print("\n🔑 [최초 실행] CoinMarketCap API 키가 필요합니다.")
        api_key = input("API 키를 붙여넣고 엔터를 누르세요: ").strip()
        with open(ENV_FILE, "w") as f:
            f.write(f"CMC_API_KEY={api_key}\n")
        print("✅ 키가 내 PC(.env 파일)에 안전하게 저장되었습니다!\n")
        return api_key
        
    return ""

CMC_API_KEY = get_cmc_api_key()
# 전역 변수로 할당 (다른 모듈에서 config.CMC_API_KEY 로 호출)

# UI/차트 테마 설정
THEMES = {
    'upbit-dark': {'bg': '#0f111a', 'up': '#c84a31', 'down': '#1261c4'},
    'binance': {'bg': '#131722', 'up': '#26a69a', 'down': '#ef5350'}
}