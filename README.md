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

## 📁 프로젝트 구조 (Project Structure)

본 프로젝트는 백엔드(Python/FastAPI)와 프론트엔드(Vanilla JS)의 명확한 역할 분담을 위해 다음과 같은 모듈형 구조를 채택하고 있습니다.

```text
sellance/
├── modules/               # 백엔드 핵심 로직 (Python)
│   ├── api_manager.py     # 외부 거래소 API 요청 및 데이터 가공 전용
│   ├── app.py             # FastAPI 메인 서버 및 엔드포인트 제어
│   └── get_market.py      # 전역 마켓 데이터 수집 및 매핑 로직
├── static/                # 프론트엔드 정적 리소스
│   ├── _main.js           # UI 초기화, 테마 관리 및 전역 상태 컨트롤 타워
│   ├── api.js             # 데이터 통신 (History 로드 및 심볼 검색) 전용
│   ├── stream.js          # WebSocket 실시간 데이터 처리 엔진
│   ├── sim_engine.js      # 시뮬레이터 수학 알고리즘 (캔들 생성/Undo)
│   ├── table.js           # 마켓 보드 리스트 실시간 렌더링 제어
│   └── z_style.css        # Content-visibility 등 고성능 렌더링용 CSS
├── templates/
│   └── index.html         # 메인 프론트엔드 레이아웃 (반응형 독 구조)
├── config.py              # 전역 환경 설정 및 API 키 관리
├── mapping.json           # 거래소별 심볼 매핑 데이터 캐시
├── .gitignore             # 가상 환경 및 캐시 파일 제외 설정
├── LICENSE                # 프로젝트 라이선스
└── README.md              # 프로젝트 가이드라인
```

---

## 🔧 주요 최적화 및 문제 해결 일지 (Development Log)

프로젝트 개발 중 발생한 핵심 병목 현상과 버그들을 아래와 같이 최적화하여 해결했습니다.

### 🚀 성능 및 렌더링 최적화 (요약)
* **차트 깜빡임 해결:** `ResizeObserver`에 0.1초 디바운스(Debounce)를 적용하여 무한 리사이즈 버그 차단.
* **CPU 부하 절감:** 전 종목 시세 갱신에 3초 주기 버퍼링(Buffering) 전략을 도입하여 렌더링 횟수 최소화.
* **메모리 효율화:** `content-visibility: auto`를 통해 화면 밖 리스트 요소의 브라우저 연산 제외.
* **로딩 속도 개선:** Tailwind CSS CDN 의존성을 제거하고 CLI 빌드 방식으로 전환하여 초기 로딩 속도 10배 향상.

### 📉 데이터 및 안정성 개선 (요약)
* **캔들 중복 증식 차단:** 내 PC 시계 대신 업비트 서버 타임스탬프(`timestamp`)를 기준점으로 동기화하여 캔들 증식 버그 해결.
* **가격 정밀도 동기화:** `$100,000`부터 `$0.00000001`까지 코인 가격에 맞춰 차트 눈금(`minMove`)과 자릿수 자동 전환.
* **타임존 시차 보정:** 업비트 API 시각 데이터에 UTC 표준(`Z`)을 강제 파싱하여 차트 찌그러짐 및 시차 문제 해결.
* **모듈형 아키텍처:** 800줄의 스파게티 코드를 기능별(API, Stream, Engine)로 분리하여 유지보수성 극대화.

---

## 📝 라이선스 및 기여 (License & Contribution)
* **License:** 본 프로젝트는 MIT 라이선스 하에 배포되며, 개인 학습 및 연구 목적은 가능하나 상업적 이용은 지양 바랍니다.
* 단순 참고 용도이며 거래 시 발생하는 어떠한 손실에 대해서도 책임지지 않으며, 각 거래소(Upbit, Binance)의 API 이용 약관을 준수해야 합니다.
