import functools
import sys
import os
from . import api_manager, cmc_api, exchange_api, builder

# 🚀 단계별 고정 메시지 정의
PHASES = [
    "메인 엔진 가동 및 족보 로드",
    "거래소 시세 수집 진입",
    "원화마켓 기초 데이터 확보",
    "바이낸스 시세 병렬 수집",
    "업비트 개별 시세 수집",
    "CMC 족보 대조 및 분석",
    "CMC API 데이터 호출",
    "해외 거래소 상장 탐색",
    "대시보드 조립 및 청소"
]

# 상태 저장소
status_list = ["대기중"] * len(PHASES)

def draw_dashboard():
    """터미널 커서 위치 제어를 통해 무조건 일렬 정렬합니다."""
    sys.stdout.write("\033[H") 
    
    print(f"\n{'='*60}")
    print(f" 🚀 SELLNANCE 엔진 실시간 트레이싱 시스템")
    print(f"{'='*60}")

    completed_count = 0
    for i, msg in enumerate(PHASES):
        status = status_list[i]
        icon = "⏳" if status.strip() == "대기중" else "🏃" if status.strip() == "진행중..." else "✅"
        
        # 🚀 1. 앞부분 출력
        line_start = f" {icon} Phase {i+1}/9: {msg}"
        sys.stdout.write(line_start)
        
        # 🚀 2. 커서를 현재 줄의 N번째 칸으로 강제 이동 (\033[자릿수G)
        # 한글 폭 문제를 무시하고 무조건 안착시킵니다.
        sys.stdout.write("\033[50G") 
        
        # 🚀 3. 상태 출력
        print(f"{status}")
        
        if status.strip() == "완료!!":
            completed_count += 1

    # 📊 하단 프로그레스 바 계산
    percent = int((completed_count / len(PHASES)) * 100)
    bar_length = 30
    filled_length = int(bar_length * completed_count // len(PHASES))
    bar = "█" * filled_length + "░" * (bar_length - filled_length)
    
    print(f"\n [전체 진행도] |{bar}| {percent}%")
    print(f"{'='*60}\n")
    sys.stdout.flush()

def phase_trace(phase_idx):
    """지정된 단계의 상태를 스위칭합니다."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # 1. 상태를 [진행중]으로 변경
            status_list[phase_idx] = "진행중..."
            draw_dashboard()
            
            result = func(*args, **kwargs)
            
            # 2. 상태를 [완료]로 변경
            status_list[phase_idx] = "완료!!"
            draw_dashboard()
            return result
        return wrapper
    return decorator

def apply_traces(manager_broadcast=None):
    # 화면을 한 번 싹 지우고 시작
    os.system('cls' if os.name == 'nt' else 'clear')
    
    # ----------------------------------------------------
    # 📊 1~9단계 함수 매핑 (순서대로 스위칭)
    # ----------------------------------------------------
    api_manager._fetch_and_process_data = phase_trace(0)(api_manager._fetch_and_process_data)
    exchange_api.fetch_exchange_market_data = phase_trace(1)(exchange_api.fetch_exchange_market_data)
    exchange_api.get_korean_exchange_markets = phase_trace(2)(exchange_api.get_korean_exchange_markets)
    exchange_api.fetch_binance_futures_spot = phase_trace(3)(exchange_api.fetch_binance_futures_spot)
    exchange_api.fetch_upbit_prices = phase_trace(4)(exchange_api.fetch_upbit_prices)
    cmc_api.fetch_cmc_market_data = phase_trace(5)(cmc_api.fetch_cmc_market_data)
    cmc_api.execute_cmc_requests = phase_trace(6)(cmc_api.execute_cmc_requests)
    exchange_api.fetch_global_listings = phase_trace(7)(exchange_api.fetch_global_listings)
    builder.assemble_final_dashboard = phase_trace(8)(builder.assemble_final_dashboard)

    draw_dashboard()