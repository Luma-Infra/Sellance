# get_market.py
import requests

def get_market_status():
    """업비트/빗썸/바이낸스 선물 종목 리스트 비교 분석"""
    upbit = {m['market'].replace('KRW-', '') for m in requests.get("https://api.upbit.com/v1/market/all").json() if m['market'].startswith('KRW-')}
    
    binance_info = requests.get("https://fapi.binance.com/fapi/v1/exchangeInfo").json()
    binance_futures = {s['symbol'].replace('USDT', '') for s in binance_info['symbols'] if s['quoteAsset'] == 'USDT'}
    
    return {
        "upbit_only": list(upbit - binance_futures),
        "both": list(upbit & binance_futures),
        "futures_only": list(binance_futures - upbit)
    }