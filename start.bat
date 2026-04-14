@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
title sellance

echo ==================================================
echo      🚀 sellance 로딩을 시작합니다 🚀
echo ==================================================
echo.

echo [STEP 1/2] 필수 파이썬 라이브러리를 확인합니다.
echo --------------------------------------------------
python -m pip install fastapi uvicorn requests pandas openpyxl jinja2 python-dotenv >nul 2>&1
echo ✅ 라이브러리 검사 완료!
echo.

:: 🚨 [추가된 API 안내 섹션]
echo --------------------------------------------------
echo [ℹ️ CMC API KEY 안내]
echo 시총 데이터를 불러오려면 API 키가 필요합니다.
echo 아래 주소에서 무료 크레딧을 발급받으실 수 있습니다:
echo 월별 1만건, 일별 1천건 제한이 있으니 잦은 호출에 유의하세요
echo 👉 https://pro.coinmarketcap.com/account
echo --------------------------------------------------
echo.

echo [STEP 2/2] sellance 메인 서버를 가동합니다.
echo ⚠️ 브라우저가 자동으로 열립니다. 이 터미널 창은 닫지 마세요!
echo ==================================================
echo.

:: python -m 으로 실행해야 에러가 나도 창이 안 닫히고 로그가 남습니다.
@REM python -m uvicorn modules.app:app --port 8000
python -m uvicorn modules.app:app --host 127.0.0.1 --port 8000 --log-level error

echo.
echo ==================================================
echo ❌ 서버가 멈췄거나 에러가 발생했습니다. 위쪽 로그를 확인하세요.
pause