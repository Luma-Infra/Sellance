@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8

echo [1/2] Checking system environment...
set PYTHON_CMD=
if exist ".venv\Scripts\python.exe" (
    set PYTHON_CMD=.venv\Scripts\python.exe
) else (
    python --version >nul 2>&1
    if %errorlevel% equ 0 (
        set PYTHON_CMD=python
    )
)

if "%PYTHON_CMD%"=="" (
    echo [ERROR] Python virtual environment .venv not found and python is not in PATH.
    echo Please make sure uv virtual environment is set up properly.
    pause
    exit /b
)

echo [2/2] Starting Sellnance Engine...
echo [HOST] http://127.0.0.1:8000
echo ==================================================

"%PYTHON_CMD%" run.py
pause