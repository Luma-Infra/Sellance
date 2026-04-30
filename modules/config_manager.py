# config_manager.py
import json
import os

# 파일 경로 고정
MAPPING_FILE = 'mapping.json'

# --- ⭐️ LOAD MAPPING CONFIG ⭐️ ---
# (기존 하드코딩 딕셔너리들 싹 지우고 아래 코드로 대체)
def load_mapping_data():
    """mapping.json을 읽어서 딕셔너리로 반환"""
    try:
        if os.path.exists(MAPPING_FILE):
            with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            print(f"🚨 {MAPPING_FILE} 파일을 찾을 수 없습니다!")
            return {}
    except Exception as e:
        print(f"🚨 족보 로드 중 치명적 에러: {e}")
        return {}

def save_mapping_data(mapping_data):
    """업데이트된 족보 데이터를 정렬해서 mapping.json에 저장"""
    try:
        # 🚀 [누님의 요청] TICKER_DATA를 A-Z 알파벳 순으로 깔끔하게 정렬!
        if "TICKER_DATA" in mapping_data:
            mapping_data["TICKER_DATA"] = dict(sorted(mapping_data["TICKER_DATA"].items()))
        
        with open(MAPPING_FILE, 'w', encoding='utf-8') as f:
            json.dump(mapping_data, f, indent=4, ensure_ascii=False)
        
        print("💾 족보(mapping.json)가 최신화되어 저장되었습니다.")
        return True
    except Exception as e:
        print(f"🚨 [System] mapping.json 저장 실패: {e}")
        return False

# --- ⭐️ 아래는 다른 파일에서 "부품"으로 쓰기 좋게 파싱해주는 함수들 ⭐️ ---
def get_mapping_parts(mapping_data):
    """조립에 필요한 각 리스트/맵을 튜플로 한 방에 뱉어줌"""
    return (
        mapping_data.get("NOTE_MAP", {}),
        mapping_data.get("TICKER_DATA", {}),
        mapping_data.get("CHAIN_LOGO_MAP", {}),
        mapping_data.get("EXCLUSION_LIST", []),
        mapping_data.get("DUPLICATED_LIST", {}),
        mapping_data.get("SYMBOL_TO_ID_MAP", {}),
        mapping_data.get("MANUAL_SUPPLY_MAP", {}),
        mapping_data.get("SPECIAL_SYMBOL_MAP", {}),
        mapping_data.get("HARDCODE_VERIFY_SKIP_LIST", [])
    )