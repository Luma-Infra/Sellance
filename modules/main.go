package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
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
		AllowHeaders: "*",
		AllowMethods: "*",
	}))

	// 4. 정적 파일 및 템플릿 서빙
	app.Static("/static", "./static")

	// 🚀 [이식 1] 뼈대 HTML 렌더링
	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendFile("./templates/index.html")
	})

	// 🚀 [이식 2] 환경변수 API 키 안전 전달
	app.Get("/api/get-env-key", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"key": os.Getenv("CMC_API_KEY")})
	})

	// 5. API 라우터 (JS가 찌르는 주소들)
	app.Get("/api/market-data", func(c *fiber.Ctx) error {
		// 🚀 [중요] 사용자가 강제 갱신 버튼을 눌렀을 때의 방어
		if c.Query("force") == "true" {
			ForceUpdateCache() // 동기 대기 후 데이터 반환
		}
		// Redis 없이 메모리에서 바로 0.001초 컷으로 꺼내옴
		data, lastUpdated := GetCachedData()
		return c.JSON(fiber.Map{
			"data":         data,
			"last_updated": lastUpdated,
		})
	})

	// 🚀 [이식 3] 실시간 마켓 맵 조회 (캐시 0.01초 컷)
	app.Get("/api/market-map", func(c *fiber.Ctx) error {
		data, _ := GetCachedData()
		
		upbit := []string{}
		futures := []string{}
		spot := []string{}
		allAssetsMap := make(map[string]bool)

		for _, item := range data {
			sym, ok := item["Symbol"].(string)
			if !ok { continue }
			
			if item["Upbit"] == "O" {
				upbit = append(upbit, sym)
				allAssetsMap[sym] = true
			}
			
			if exchanges, ok := item["Listed_Exchanges"].([]interface{}); ok {
				for _, ex := range exchanges {
					if ex == "BINANCE_FUTURES" {
						futures = append(futures, sym)
						allAssetsMap[sym] = true
					} else if ex == "BINANCE" {
						spot = append(spot, sym)
						allAssetsMap[sym] = true
					}
				}
			}
		}

		allAssets := []string{}
		for k := range allAssetsMap {
			allAssets = append(allAssets, k)
		}

		return c.JSON(fiber.Map{
			"all_assets": allAssets,
			"upbit":      upbit,
			"futures":    futures,
			"spot":       spot,
		})
	})

	// 🚀 [이식 4] 개별 코인 정보 조회 (CMC 크레딧 방어)
	app.Get("/api/coin-info/:asset", func(c *fiber.Ctx) error {
		asset := c.Params("asset")
		data, _ := GetCachedData()

		for _, item := range data {
			sym, _ := item["Symbol"].(string)
			disp, _ := item["DisplayTicker"].(string)
			
			if sym == asset || disp == asset {
				return c.JSON(fiber.Map{
					"asset":      asset,
					"name":       item["Name"],
					"market_cap": item["MarketCap_Formatted"],
				})
			}
		}
		return c.JSON(fiber.Map{"asset": asset, "name": asset, "market_cap": "정보 없음"})
	})

	// 🚀 [이식 5] 차트 프록시 (FastAPI의 requests.get 대체 및 고속화)
	app.Get("/api/candles", func(c *fiber.Ctx) error {
		exchange := c.Query("exchange")
		symbol := c.Query("symbol")
		interval := c.Query("interval")
		limit := c.Query("limit", "200")
		to := c.Query("to")

		var url string
		if exchange == "upbit" {
			url = fmt.Sprintf("https://api.upbit.com/v1/candles/%s?market=%s&count=%s", interval, symbol, limit)
			if to != "" {
				url += "&to=" + to
			}
		} else if exchange == "binance_futures" {
			url = fmt.Sprintf("https://fapi.binance.com/fapi/v1/klines?symbol=%s&interval=%s&limit=%s", symbol, interval, limit)
		} else if exchange == "binance_spot" {
			url = fmt.Sprintf("https://api.binance.com/api/v3/klines?symbol=%s&interval=%s&limit=%s", symbol, interval, limit)
		} else if exchange == "bybit" {
			// 바이비트 인터벌 변환 (1d -> D, 1w -> W 등)
			bybitInterval := interval
			if interval == "1d" { bybitInterval = "D" }
			if interval == "1w" { bybitInterval = "W" }
			if interval == "1M" { bybitInterval = "M" }
			url = fmt.Sprintf("https://api.bybit.com/v5/market/kline?category=spot&symbol=%s&interval=%s&limit=%s", symbol, bybitInterval, limit)
		} else if exchange == "bithumb" {
			// 빗썸 인터벌 변환 (1d -> 24h)
			bithumbInterval := interval
			if interval == "1d" { bithumbInterval = "24h" }
			url = fmt.Sprintf("https://api.bithumb.com/public/candlestick/%s/%s", symbol, bithumbInterval)
		} else {
			return c.Status(400).JSON(fiber.Map{"error": "알 수 없는 거래소입니다."})
		}

		// Fiber의 자체 HTTP 클라이언트로 초고속 비동기 요청
		agent := fiber.Get(url).Timeout(10 * time.Second) // 대량 캔들 수집을 위해 타임아웃 증가
		if exchange == "upbit" {
			agent.Set("Accept", "application/json")
		}

		statusCode, body, errs := agent.Bytes()
		if len(errs) > 0 {
			return c.Status(500).JSON(fiber.Map{"error": errs[0].Error()})
		}
		if statusCode != 200 {
			return c.Status(statusCode).Send(body)
		}

		c.Set("Content-Type", "application/json")
		return c.Send(body)
	})

	// 🚀 [이식 6] SSE 진행률 빨대 (StreamingResponse 완벽 구현)
	app.Get("/api/progress", func(c *fiber.Ctx) error {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")

		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			for {
				data := GetProgressData()
				jsonData, _ := json.Marshal(data)
				fmt.Fprintf(w, "data: %s\n\n", string(jsonData))
				w.Flush()

				if data["percent"].(int) == 100 {
					break
				}
				time.Sleep(500 * time.Millisecond)
			}
		})
		return nil
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