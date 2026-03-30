# 🚀 Sellance - 실시간 크립토 차트 & 모의 시뮬레이터

**Sellance**는 업비트(Upbit)와 바이낸스(Binance)의 실시간 웹소켓 데이터를 기반으로 작동하는 고성능 암호화폐 차트 분석 및 트레이딩 시뮬레이터입니다. 단순한 조회를 넘어, 사용자가 직접 다음 캔들을 예측하고 그려볼 수 있는 **커스텀 시뮬레이션 엔진**을 탑재하고 있습니다.

---

## ✨ 핵심 기능 (Key Features)

### 📈 1. 초고속 실시간 차트 (Zero-Lag WebSocket)
* **멀티 거래소 통합:** 바이낸스 선물/현물 및 업비트 원화 마켓의 실시간 시세 완벽 동기화.
* **렌더링 최적화:** - `ResizeObserver` 디바운싱(Debouncing) 적용으로 화면 크기 변경 시 차트 깜빡임 제거.
    - 웹소켓 수신 시 불필요한 DOM Reflow를 차단하여 낮은 CPU 점유율과 60FPS의 부드러운 움직임 구현.
* **스마트 가격 정밀도 (Dynamic Precision):** - 비트코인부터 밈코인까지 가격대에 맞춰 차트 눈금과 유효숫자(최대 10자리) 자동 동기화.

### 🎮 2. 트레이딩 시뮬레이터 (Trading Simulator)
* **롱/숏 모드 전환:** 하이브리드 액체 트랜지션(Liquid Transition)이 적용된 UI를 통해 롱/숏 관점 즉시 전환.
* **정밀 캔들 컨트롤:** 슬라이더를 통해 몸통(Body), 윗꼬리(Upper Wick), 아랫꼬리(Lower Wick) 비율을 1% 단위로 조절.
* **시뮬레이션 관리:** `Add Next Candle`로 타임라인 확장 및 `Undo` 기능을 통한 히스토리 역추적 지원.

### 🎨 3. 사용자 중심 UI/UX
* **플로팅 독(Floating Dock):** 화면 하단에 떠 있는 듯한 세련된 컨트롤러로 시각적 개방감 확보.
* **테마 시스템:** 바이낸스 다크(Deep Navy) 및 업비트 라이트 테마 원클릭 스위칭.
* **고급 알럿(Alert):** `SweetAlert2`를 이식하여 데이터 초기화 등 주요 작업 시 쫀득한 애니메이션 모달 제공.

---

## 🛠 기술 스택 (Tech Stack)

| 구분 | 기술 스택 |
| :--- | :--- |
| **Backend** | Python 3.9+, FastAPI, Uvicorn |
| **Frontend** | Vanilla JavaScript (ES6+), Tailwind CSS (CLI Optimized) |
| **Chart** | TradingView Lightweight Charts v4.0+ |
| **Data** | Binance API/WS, Upbit API/WS, CoinMarketCap API |

---

## 🚀 시작하기 (Quick Start)

### 1. API 키 설정
시총 데이터 로드를 위해 **CoinMarketCap API Key**가 필요합니다.
* 발급: [CoinMarketCap Developer Portal](https://pro.coinmarketcap.com/account)
* 프로젝트 루트의 `.env` 파일에 `CMC_API_KEY=your_key_here` 형태로 입력하세요.

### 2. 실행 (Windows)
프로젝트 폴더 내 `sellance.bat` 파일을 더블 클릭하면 자동으로 환경 검사 및 서버가 가동됩니다.

```batch
# sellance.bat 내부 로직
python -m pip install fastapi uvicorn requests pandas openpyxl jinja2 python-dotenv
python -m uvicorn modules.app:app --reload --port num
```

### 3. 접속 (Access)
서버가 정상적으로 구동되면 브라우저를 실행하여 아래 주소로 접속합니다.
* **URL:** `http://localhost:num`
* **권장 브라우저:** Chrome, Edge, Safari (최신 버전)

---
