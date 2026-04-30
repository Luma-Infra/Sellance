package main

import (
	"log"
	"time"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func main() {
	// 1. 초기 캐시 데이터 로드 (백그라운드에서 실행)
	go UpdateCacheScheduler()

	// 2. Fiber 앱 생성 (FastAPI 대체)
	app := fiber.New(fiber.Config{
		AppName: "Blueprint Terminal Go-Engine",
	})

	// 3. CORS 설정 (모든 도메인 허용)
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
	}))

	// 4. 정적 파일 및 템플릿 서빙 (JS, CSS 그대로 사용!)
	app.Static("/static", "./static")

	// 5. API 라우터 (JS가 찌르는 주소들)
	app.Get("/api/market-data", func(c *fiber.Ctx) error {
		// Redis 없이 메모리에서 바로 0.001초 컷으로 꺼내옴
		data, lastUpdated := GetCachedData()
		return c.JSON(fiber.Map{
			"data":         data,
			"last_updated": lastUpdated,
		})
	})

	// 6. 9시 정각 KST 리셋 스케줄러 가동
	go DailyResetScheduler()

	// 7. 서버 시작 (8000번 포트)
	log.Println("🚀 Go Engine Started on http://127.0.0.1:8000")
	log.Fatal(app.Listen(":8000"))
}

// ⏰ KST 기준 9시 정각 리셋 스케줄러
func DailyResetScheduler() {
	loc, _ := time.LoadLocation("Asia/Seoul")
	for {
		now := time.Now().In(loc)
		if now.Hour() == 9 && now.Minute() == 0 && now.Second() < 30 {
			log.Println("⏰ 스케줄러: 9시 정각! 캐시 강제 갱신!")
			ForceUpdateCache()
			time.Sleep(30 * time.Second) // 중복 실행 방지
		}
		time.Sleep(10 * time.Second)
	}
}