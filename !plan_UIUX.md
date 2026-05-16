# 테이블 UI 및 데이터 전면 개조 구현 계획

이 계획은 Sellnance의 테이블 UI와 백엔드 데이터를 전면 개조하여 새로운 탭, 필터, 그리고 VMC 및 펀딩비와 같은 고급 지표를 추가하는 내용을 담고 있습니다.

## 사용자 검토 필요 사항

> [!IMPORTANT]
> - **VMC 계산**: VMC는 `(24시간 거래대금 / 시가총액) * 100`으로 계산하여 시총 대비 거래 비중(%)으로 표시합니다.
> - **거래소 스위칭**: "바낸·업비트 스위칭"은 기본 가격 소스를 변경하고 해당 거래소에 맞는 코인 목록을 우선적으로 필터링합니다.
> - **UI 디자인**: 새로운 탭 바와 토글 버튼은 기존 테마와 프리미엄 디자인 가이드를 유지하며 부드러운 애니메이션을 적용합니다.

## 제안된 변경 사항

### 백엔드 컴포넌트

#### [수정] [exchange_api.py](file:///c:/Users/78831/Sellnance/modules/exchange_api.py)
- `fetch_binance_futures_spot` 함수를 업데이트하여 바이낸스 선물 펀딩비(`https://fapi.binance.com/fapi/v1/premiumIndex`)를 수집합니다.
- 수집된 펀딩비 데이터를 `binance_data` 딕셔너리에 통합합니다.

#### [수정] [builder.py](file:///c:/Users/78831/Sellnance/modules/builder.py)
- `build_binance_row` 및 `build_upbit_row` 함수 수정:
    - `VMC_Raw` 계산: `(Volume_Raw / MarketCap_Raw) * 100` (시총이 0보다 큰 경우).
    - `VMC_Formatted`: `f"{vmc:.2f}%"` 형태로 포맷팅.
    - 바이낸스 데이터에서 `FundingRate`를 가져와 포함.
    - `KimchiPremium` 계산: `((업비트가격KRW / (바이낸스가격USDT * 환율)) - 1) * 100`.
- 위 신규 필드들을 최종 `row` 데이터에 추가합니다.

---

### 프론트엔드 컴포넌트

#### [수정] [store.js](file:///c:/Users/78831/Sellnance/static/store.js)
- `currentTab` (기본값: 'ALL') 추가: 'ALL', 'FAV', 'FUNDING', 'KIMCHI', 'VMC' 상태 관리.
- `filterMode` (기본값: 'ALL') 추가: 'ALL', 'FUTURES', 'SPOT', 'UPBIT' 필터링 상태 관리.
- `viewMode` (기본값: 'DETAILED') 추가: 상세 보기/간략하게 보기 토글 관리.

#### [수정] [index.html](file:///c:/Users/78831/Sellnance/templates/index.html)
- 테이블 상단에 새로운 **탭 바** 추가:
    - 즐겨찾기 (⭐)
    - 펀비 (Funding)
    - 김프 (Kimchi)
    - VMC
- 탭 바 위에 **토글 버튼 바** 추가:
    - 거래소 스위칭: [바이낸스 | 업비트]
    - 보기 모드: [상세히 | 심플하게]
    - 필터: [전체 | 선물 | 현물]

#### [수정] [table.js](file:///c:/Users/78831/Sellnance/static/table.js)
- `renderTable` 함수를 업데이트하여 `store.currentTab` 및 `store.filterMode`에 따라 데이터를 필터링합니다.
- `updateRowInnerHTML` 함수를 업데이트하여 활성화된 탭에 따라 다른 컬럼을 표시합니다.
    - **펀비 탭**: 펀딩비를 강조하여 표시.
    - **김프 탭**: 업비트/빗썸 대비 바이낸스 가격 차이(김프)를 표시.
    - **VMC 탭**: 시총 대비 거래량 비중(%)을 표시.
- `switchTab(tab)` 및 `switchFilter(filter)` 함수를 구현합니다.

#### [수정] [z_style.css](file:///c:/Users/78831/Sellnance/static/z_style.css)
- 새로운 탭 바와 토글 버튼을 위한 스타일 추가.
- 호버 효과 및 탭 전환 시 부드러운 트랜지션을 적용하여 프리미엄 느낌을 강화합니다.

## 검증 계획

### 자동 테스트
- 해당 없음 (수동 UI 검증 위주)

### 수동 검증
1.  **탭 전환 확인**: 즐겨찾기, 펀비, 김프, VMC 탭을 클릭하여 테이블 내용과 컬럼이 올바르게 바뀌는지 확인합니다.
2.  **필터 동작 확인**: 바이낸스/업비트 스위칭 및 전체/선물/현물 필터가 리스트를 정확히 걸러내는지 확인합니다.
3.  **VMC 데이터 확인**: 계산된 VMC 값이 정확하며 포맷에 맞게 표시되는지 확인합니다.
4.  **펀딩비 확인**: 바이낸스 선물의 실시간 펀딩비가 데이터에 반영되는지 확인합니다.
5.  **김프 계산 확인**: 바이낸스와 국내 거래소(업비트) 간의 가격 차이가 정확히 계산되어 표시되는지 확인합니다.
