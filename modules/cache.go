package main

import (
	"sync"
	"time"
	"log"
)

// 🚀 Redis를 대체하는 Go의 완벽한 인메모리 저장소
type CacheStore struct {
	mu          sync.RWMutex
	Data        []map[string]interface{}
	LastUpdated string
}

var globalCache = CacheStore{}

// 읽기 전용 (JS 프론트엔드가 데이터를 달라고 할 때)
func GetCachedData() ([]map[string]interface{}, string) {
	globalCache.mu.RLock()         // 🔒 읽기 잠금 (동시에 수만 명이 읽어도 렉 없음)
	defer globalCache.mu.RUnlock()
	return globalCache.Data, globalCache.LastUpdated
}

// 데이터 갱신 (파이썬 ThreadPoolExecutor 대체)
func ForceUpdateCache() {
	log.Println("💡 API 데이터를 수집합니다... (Goroutine 병렬 처리)")
	
	// 🚀 fetcher.go에 있는 병렬 수집기 호출
	newData := FetchAllMarketsParallel()

	// 한국 시간 KST 가져오기
	loc, _ := time.LoadLocation("Asia/Seoul")
	nowStr := time.Now().In(loc).Format("2006-01-02 15:04:05")

	globalCache.mu.Lock() // 🔒 쓰기 잠금 (업데이트 중에는 못 읽게 철벽 방어)
	globalCache.Data = newData
	globalCache.LastUpdated = nowStr
	globalCache.mu.Unlock()

	log.Printf("✅ 데이터 캐싱 완료! (총 %d개)\n", len(newData))
}

// 1시간마다 알아서 돌아가는 캐시 갱신 데몬
func UpdateCacheScheduler() {
	ForceUpdateCache() // 켜자마자 1회 실행
	ticker := time.NewTicker(1 * time.Hour)
	for range ticker.C {
		ForceUpdateCache()
	}
}