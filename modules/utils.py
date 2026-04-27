import math
import re

# --- ⭐️ FORMATTING FUNCTIONS ⭐️ ---
def format_market_cap_string(mc):
    if mc is None or mc == 0: return "0"
    if mc >= 1_000_000_000_000: return f"{mc / 1_000_000_000_000:,.2f} T"
    if mc >= 1_000_000_000: return f"{mc / 1_000_000_000:,.2f} B"
    if mc >= 1_000_000: return f"{mc / 1_000_000:,.2f} M"
    return f"{mc:,.0f}"

def format_volume_string(vol):
    if vol is None or vol == 0: return "0"
    if vol >= 1_000_000_000: return f"{vol / 1_000_000_000:,.2f} B"
    if vol >= 1_000_000: return f"{vol / 1_000_000:,.2f} M"
    return f"{vol:,.0f}"

def js_round(number, decimals=0):
    """자바스크립트의 Math.round()와 완벽히 동일하게 동작하는 사사오입 함수"""
    multiplier = 10 ** decimals
    # 0.5를 더하고 내림(floor) 처리하는 것이 JS 엔진의 방식입니다.
    return math.floor(number * multiplier + 0.5) / multiplier

# 1. 초기화 단계에서 딱 한 번만 계산 (JavaScript든 Python이든 로직 동일)
def get_precision(tick_size_str):
    """문자열 형태의 틱사이즈에서 소수점 자릿수 추출 (예: "0.0001" -> 4)"""
    if not tick_size_str or '.' not in str(tick_size_str): return 0
    # 뒤에 붙은 의미 없는 0을 지우고 소수점 아래 길이를 잽니다.
    return len(str(tick_size_str).split('.')[-1].rstrip('0'))

# 2. 포맷팅 함수 (초간단)
def format_dynamic_price(price, precision):
    if price is None or price == 0: return
    
    # 거래소가 준 정밀도(precision) 그대로 사용!
    return f"{price:,.{precision}f}"

# --- ⭐️ UX SETTINGS ⭐️ ---
# ✅ [수정 후] 테마를 지원하는 클린 포맷터
def format_change(percent):
    if percent is None or not isinstance(percent, (int, float)):
        return '<span class="text-theme-text opacity-50">N/A</span>'
    
    # 🚀 하드코딩 색상 빼고 테마 클래스로 변경!
    theme_class = "text-theme-up" if percent > 0 else "text-theme-down" if percent < 0 else "text-theme-text opacity-50"
    
    # 🚀 인라인 스타일(font-weight) 대신 Tailwind 클래스로 통일
    weight_class = "font-bold" if abs(percent) >= 5.0 else "font-normal"
    
    # style="..." 은 완전히 삭제하고 class="..." 만 넘겨줍니다.
    return f'<span class="{theme_class} {weight_class}">{percent:+.2f} %</span>'

def create_image_tag(url):
    if not url: return ""
    return f'<img src="{url}" loading="lazy" style="width: 24px; height: 24px; vertical-align: middle; border-radius: 50%;">'

def get_pure_base_asset(ticker):
    # 1. Quote(결제자산)를 뒤에서부터 안전하게 제거
    # USDT, KRW 외에 다른 마켓이 추가되어도 대응 가능하도록 리스트화
    for quote in ['USDT', 'KRW', 'BTC', 'ETH']:
        if ticker.endswith(quote):
            ticker = ticker[:-len(quote)]
            break

    # 2. 정규식으로 배율과 순수 심볼 분리
    # ^(10+|1[MB])? : 시작부분의 10, 100, 1M, 1B 등을 그룹 캡처
    # (?P<symbol>.+) : 나머지를 전부 'symbol' 그룹으로 캡처
    match = re.match(r'^(?P<scale>10+|1[MB])?(?P<symbol>.+)$', ticker)
    if match:
        return match.group('symbol')
    return ticker

def is_scaled_symbol(symbol):
    return bool(re.match(r'^(10+)|^(1[MB])', symbol))

def is_valid_ticker(ticker):
    """
    영어 대문자, 숫자 이외의 문자가 섞여 있으면 거부합니다.
    (한자, 특수문자, 소문자, 이모지 등 온갖 잡다구리한 티커 사전에 차단)
    """
    # ^[A-Z0-9]+$ : 시작부터 끝까지 영어 대문자와 숫자로만 이루어져야 함
    
    if re.match(r'^[A-Z0-9]+$', ticker):
        return True
    return False
