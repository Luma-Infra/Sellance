import os
import sys
import subprocess
import time

def clear_port(port):
    """8000번 포트를 점유 중인 프로세스를 찾아 강제로 종료합니다."""
    try:
        # 윈도우 netstat 명령어로 PID 찾기
        result = subprocess.check_output(f"netstat -aon | findstr :{port}", shell=True).decode('cp949')
        for line in result.strip().split('\n'):
            if "LISTENING" in line:
                pid = line.strip().split()[-1]
                print(f"🧹 [PORT CLEAR] 포트 {port}를 점유 중인 프로세스({pid}) 종료 중...")
                os.system(f"taskkill /f /pid {pid}")
    except:
        # 포트가 비어있으면 에러 무시
        pass

def start_engine():
    port = 8000
    clear_port(port)
    
    print("\n" + "="*50)
    print("      🚀 SELLNANCE ENGINE v1.2 - BOOTING...")
    print("="*50)
    print(f"📂 [PATH] {os.getcwd()}")
    print(f"🌐 [HOST] http://127.0.0.1:{port}")
    print("-" * 50)
    
    # Uvicorn 가동 (modules/app.py의 app 객체 실행)
    cmd = [
        sys.executable, "-m", "uvicorn", 
        "modules.app:app", 
        "--host", "127.0.0.1", 
        "--port", str(port), 
        "--log-level", "info"
    ]
    
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        print("\n\n👋 [STOP] 엔진 가동이 중단되었습니다.")

if __name__ == "__main__":
    start_engine()
