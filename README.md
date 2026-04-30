 # 🚀 Sellnance - Edge-Optimized Crypto Terminal & Simulator

 ### 🛡️ 1. CORS 무력화 및 429 율속 방어 (Proxy & Throttle)
 ### ⚡ 2. 초고속 실시간 렌더링 엔진 (Zero-Lag UI)
 ### 📱 3. 모바일 레이아웃 격리 (Mobile UX Isolation)
 ### 🧮 4. 동적 가격 정밀도 엔진 (Dynamic Precision)
 ### 🎮 5. 트레이딩 시뮬레이터 (Custom Simulation Engine)

 ## 🛠 기술 스택 (Tech Stack)

 | Category | Technology |
| :--- | :--- |
| Backend | Python 3.9+, FastAPI, Uvicorn, Requests |
| Frontend | Vanilla JavaScript (ES6+), Tailwind CSS |
| Data Engine | Upbit API/WS, Binance FAPI/WS, CoinMarketCap API |
| Visualization | TradingView Lightweight Charts v4.0+ |
| Infrastructure | Cloudflare Workers, Railway (or Local) |

 ## 📁 프로젝트 구조 (Project Structure)

 ```text
Sellnance/
├── modules/               # 백엔드 코어 (Proxy & Aggregation)
│   ├── api_manager.py     # 다중 거래소 병렬 수집, 캐시 매니저, 동적 가격 포맷터
│   ├── app.py             # FastAPI 라우터, CORS 미들웨어, 프록시 엔드포인트
│   └── get_market.py      # 거래소 티커 맵핑 유틸
├── static/                # 프론트엔드 (Client-side Rendering Engine)
│   ├── api.js             # 내부 API 통신 및 1.5초 Throttle 제어
│   ├── chart_utils.js     # 차트 스케일링, 로그 수학 연산, 카운트다운 DOM 주입
│   ├── stream.js          # 통합 웹소켓 관리 및 Ghost Candle 렌더러
│   ├── streamEach.js      # 스나이퍼 웹소켓 (뷰포트 추적 기반 구독 동기화)
│   ├── table.js           # Intersection Observer 기반 DOM 재활용 & 무한 스크롤
│   ├── ui_control.js      # 모바일/PC 레이아웃 스위칭 및 CSS Isolation 제어
│   └── _main.js           # 전역 상태 관리 및 ResizeObserver 디바운스
├── config.py              # API Key(CMC) 및 전역 환경 변수 관리
└── mapping.json           # 심볼-체인 매핑 캐시 스토리지
```

---

 ## 🚀 시작하기 (Quick Start)

 ### 1. 환경 변수 설정
 * [CoinMarketCap API](https://pro.coinmarketcap.com/account) 키 발급 후 프로젝트 루트에 `.env` 파일을 생성합니다.
 ```env
CMC_API_KEY=your_cmc_api_key_here
 ### 2. 서버 실행 (Windows 환경)
 * 폴더 내 제공된 start.bat을 실행하거나 아래 명령어를 터미널에 입력합니다.
```
```bash
pip install -r requirements.txt
uvicorn modules.app:app --reload --port 8000
```

 ### 3. 접속
 * 브라우저에서 `http://localhost:8000` 접속 (Chrome 최적화).

---

 ## 📝 라이선스 및 면책 조항 (License & Disclaimer)
 * **License:** MIT License. 개인 학습, 연구 및 포트폴리오 목적의 수정/배포를 환영합니다.
 * **Disclaimer:** 본 프로젝트는 실시간 데이터 분석 및 시뮬레이션을 위한 도구입니다. 제공되는 시세 정보의 지연이나 오류가 발생할 수 있으며, 이를 바탕으로 한 실제 트레이딩 손실에 대해서는 어떠한 법적 책임도 지지 않습니다. (거래소 API 이용 약관 준수 필수)

---
