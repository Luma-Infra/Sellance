 # 🚀 Sellnance - Edge-Optimized Crypto Terminal & Simulator



 Sellnance는 업비트(Upbit)와 바이낸스(Binance)의 데이터를 통합하여 실시간으로 분석하는 고성능 암호화폐 차트 터미널 및 트레이딩 시뮬레이터입니다.

 클라이언트의 브라우저 자원을 극대화하여 서버 리소스를 절감하는 Zero-Cost 아키텍처와, 거래소의 CORS 및 429(Rate Limit) 제재를 완벽히 우회하는 서버 사이드 프록시(Proxy) 엔진을 기반으로 설계되었습니다. 단순한 조회를 넘어 사용자가 직접 미래의 캔들을 예측하고 그려볼 수 있는 커스텀 시뮬레이션 엔진을 제공합니다.

 ## 🏛 System Architecture

 본 프로젝트는 비용 효율성과 렌더링 성능을 극대화하기 위해 백엔드와 프론트엔드의 역할을 엄격하게 분리한 하이브리드 아키텍처를 채택했습니다.

 * Backend (The Proxy Shield): FastAPI 기반의 백엔드는 브라우저의 CORS 에러를 원천 차단하는 API Gateway 역할을 수행합니다. ThreadPoolExecutor를 활용해 다중 거래소 데이터를 병렬로 수집하며, 메모리 Lock(data_lock) 기반의 스마트 캐싱 시스템을 통해 500명 이상의 동시 접속 환경에서도 API 호출 제한(429 Error)을 방어합니다.
 * Frontend (The Heavy Lifter): 유저의 기기 자원을 적극 활용(Client-side Rendering)합니다. IntersectionObserver를 활용한 뷰포트 감지 렌더링과 스나이퍼 웹소켓(Sniper Socket) 통신을 통해 화면에 보이는 데이터만 선택적으로 구독(Subscribe)하여 CPU/RAM 점유율을 획기적으로 낮췄습니다.
 * Edge Routing: Cloudflare Workers 인프라와 결합하여 정적 리소스 로드 속도를 최적화합니다.

 ## ✨ 핵심 기능 및 기술적 문제 해결 (Key Features & Engineering)

 ### 🛡️ 1. CORS 무력화 및 429 율속 방어 (Proxy & Throttle)
 * 문제: 브라우저 직결(fetch) 방식에서 발생하는 거래소 CORS 에러 및 새로고침 남용에 의한 IP 차단(429 Too Many Requests).
 * 해결: 파이썬(app.py)에 우회용 엔드포인트(/api/candles)를 구축하여 **서버 간 통신(Server-to-Server)**으로 CORS를 패스하고, 프론트엔드(api.js)에 1.5초 간격의 **광클 방지 스로틀링(Throttling)**을 적용하여 거래소 방화벽을 안전하게 통과합니다.

 ### ⚡ 2. 초고속 실시간 렌더링 엔진 (Zero-Lag UI)
 * DOM 재활용 (Recycling) & FLIP 애니메이션: 100위권 밖으로 밀려난 캔들 DOM을 파괴하지 않고 메모리 풀(Pool)에 보관(table.js)하여 가비지 컬렉션(GC) 부하를 제거했습니다.
 * 스나이퍼 소켓 (Sniper WebSocket): 500개의 코인 데이터를 모두 수신하지 않고, 화면에 보이는 코인(visibleSymbols)만 추적하여 구독/해지(syncSniperSubscriptions)를 실시간으로 스위칭합니다.
 * 디바운스 리사이징: ResizeObserver에 0.1초 디바운스를 적용하여 창 크기 조절 시 발생하는 무한 Reflow 및 캔버스 깜빡임 버그를 차단했습니다.

 ### 📱 3. 모바일 레이아웃 격리 (Mobile UX Isolation)
 * 문제: 반응형 축소 시 차트 캔버스(Lightweight Charts)가 남기는 잔상과 하위 요소 밀림 현상.
 * 해결: 모바일 오버레이 활성화 시 기존 DOM 트리에서 차트를 분리하여 임시 컨테이너에 마운트(Mount)하고, 닫을 때 원상 복구(closeMobileChart)하는 CSS/DOM 격리 기법을 적용했습니다. 카운트다운 라벨 역시 가장 가까운 table 노드를 역추적하여 안전하게 절대 좌표(position: absolute)에 부착됩니다.

 ### 🧮 4. 동적 가격 정밀도 엔진 (Dynamic Precision)
 * 문제: $100,000 대의 비트코인과 $0.00000001 대의 밈 코인(Meme Coin)이 동일한 눈금 포맷을 사용하여 UI가 붕괴되는 현상.
 * 해결: Math.log10() 기반의 수학적 알고리즘(formatSmartPrice)을 적용하여 코인의 절대 가격에 따라 유효숫자(최대 10자리)를 실시간으로 자동 계산하고 포맷팅합니다.

 ### 🎮 5. 트레이딩 시뮬레이터 (Custom Simulation Engine)
 * 하이브리드 액체 트랜지션: UI 슬라이더를 통해 롱(Bull)/숏(Bear) 모드 전환.
 * 정밀 캔들 조형: 몸통(Body), 위/아래 꼬리(Wick) 비율을 1% 단위로 조작하여 미래의 가상 캔들을 배열 배열(ghostData)에 삽입 및 Undo 히스토리 관리.

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
