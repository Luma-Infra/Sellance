@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
title Sellnance Engine

:: 화면 정리
cls

echo ==================================================
echo       🚀 SELLNANCE 엔진 가동 시스템
echo ==================================================
echo.

:: 1. 환경 검사 (조용히 처리)
echo [1/2] 시스템 환경 및 라이브러리(fastapi, uvicorn, jinja2 ...) 체크 중...
python -m pip install fastapi uvicorn requests pandas openpyxl jinja2 python-dotenv pytz >nul 2>&1
echo ✅ 환경 체크 완료!
echo.

:: 2. 안내 사항 (강조)
echo --------------------------------------------------
echo [NOTICE] CMC API 크레딧 유의 (1,000건/일)
echo [HOST] http://127.0.0.1:8000
echo --------------------------------------------------
echo.

echo [2/2] 메인 엔진을 시작합니다...
echo ⚠️ 이 창을 닫으면 엔진이 중단됩니다.
echo ==================================================

:: 🚀 핵심: 파이썬 서버 가동
:: --log-level critical 로 설정해서 uvicorn 기본 로그를 숨기고 
:: 누님이 만든 '9단계 대시보드'만 선명하게 보이게 합니다.
python -m uvicorn modules.app:app --host 127.0.0.1 --port 8000 --log-level critical

:: 서버가 죽었을 때만 실행되는 구간
echo.
echo ==================================================
echo ❌ 엔진이 예기치 않게 정지되었습니다. 에러 로그를 확인하세요.
echo ==================================================
pause