# modules/adapter.py
# ==========================================
# 🔌 거래소 규격 통합 어댑터 (Normalization Layer)
# ==========================================

class ExchangeAdapter:
    @staticmethod
    def normalize_interval(exchange, interval):
        """거래소별 인터벌 규격을 통일합니다. (바낸, 업비트, 빗썸, 바이비트)"""
        # 1. BINANCE
        if exchange in ["binance_spot", "binance_futures"]:
            mapping = {"days": "1d", "weeks": "1w", "months": "1M"}
            if interval.startswith("minutes/"):
                return f"{interval.split('/')[1]}m"
            return mapping.get(interval, interval)
        
        # 2. UPBIT
        elif exchange == "upbit":
            # 업비트는 minutes/1, days, weeks, months 형식을 그대로 사용
            return interval
            
        # 3. BITHUMB
        elif exchange == "bithumb":
            mapping = {"1d": "24h", "days": "24h", "1w": "24h", "1M": "24h"}
            if interval.startswith("minutes/"):
                m = interval.split('/')[1]
                return f"{m}m"
            return mapping.get(interval, interval)

        # 4. BYBIT
        elif exchange == "bybit":
            mapping = {"1d": "D", "days": "D", "1w": "W", "1M": "M"}
            if interval.startswith("minutes/"):
                return interval.split('/')[1]
            return mapping.get(interval, interval)
            
        return interval

    @staticmethod
    def normalize_symbol(exchange, symbol):
        """거래소별 마켓 코드 형식을 통일합니다."""
        # 1. BINANCE & BYBIT (BaseQuote 형식)
        if exchange in ["binance_spot", "binance_futures", "bybit"]:
            return symbol.replace("-", "").replace("_", "").upper()
            
        # 2. UPBIT & BITHUMB (Quote-Base 형식)
        elif exchange in ["upbit", "bithumb"]:
            if symbol.startswith("KRW-") and symbol.endswith("USDT"):
                symbol = symbol[:-4]
            if "_" in symbol:
                base, quote = symbol.split("_")
                return f"{quote}-{base}"
            if "-" not in symbol:
                if symbol.endswith("USDT"):
                    symbol = symbol[:-4]
                return f"KRW-{symbol}"
            return symbol
            
        return symbol

    @staticmethod
    def get_candle_url(exchange, symbol, interval, limit, to=None, start=None):
        """거래소별 캔들 조회 최종 URL 생성"""
        norm_sym = ExchangeAdapter.normalize_symbol(exchange, symbol)
        norm_int = ExchangeAdapter.normalize_interval(exchange, interval)
        
        # 1. BINANCE
        if exchange == "binance_futures":
            url = f"https://fapi.binance.com/fapi/v1/klines?symbol={norm_sym}&interval={norm_int}&limit={limit}"
            if to: url += f"&endTime={to}"
            if start: url += f"&startTime={start}"
            return url
        elif exchange == "binance_spot":
            url = f"https://api.binance.com/api/v3/klines?symbol={norm_sym}&interval={norm_int}&limit={limit}"
            if to: url += f"&endTime={to}"
            if start: url += f"&startTime={start}"
            return url
            
        # 2. UPBIT
        elif exchange == "upbit":
            url = f"https://api.upbit.com/v1/candles/{norm_int}?market={norm_sym}&count={limit}"
            if to: url += f"&to={to}"
            return url
            
        # 3. BITHUMB (Public API 기반)
        elif exchange == "bithumb":
            # 빗썸은 symbol_quote 형식 (예: BTC_KRW)
            b_sym = norm_sym.replace("KRW-", "") + "_KRW"
            return f"https://api.bithumb.com/public/candlestick/{b_sym}/{norm_int}"

        # 4. BYBIT (V5 API)
        elif exchange == "bybit":
            return f"https://api.bybit.com/v5/market/kline?category=spot&symbol={norm_sym}&interval={norm_int}&limit={limit}"
            
        return None
