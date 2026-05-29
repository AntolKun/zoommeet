package config

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv           string // "development" | "production"
	Port             string
	LiveKitAPIURL    string // http(s):// — for server-side RoomService/Egress calls
	LiveKitWSURL     string // ws(s):// — sent to frontend client
	LiveKitAPIKey    string
	LiveKitAPISecret string
	DBDsn            string
	AppJWTSecret     string
	CORSOrigins      []string
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system env")
	}

	return &Config{
		AppEnv:           getEnv("APP_ENV", "development"),
		Port:             getEnv("PORT", "8080"),
		LiveKitAPIURL:    getEnv("LIVEKIT_API_URL", "http://localhost:7880"),
		LiveKitWSURL:     getEnv("LIVEKIT_WS_URL", "ws://localhost:7880"),
		LiveKitAPIKey:    getEnv("LIVEKIT_API_KEY", "devkey"),
		LiveKitAPISecret: getEnv("LIVEKIT_API_SECRET", "secret"),
		DBDsn:            getEnv("DB_DSN", ""),
		AppJWTSecret:     getEnv("APP_JWT_SECRET", "change-me-in-prod"),
		CORSOrigins:      splitCSV(getEnv("CORS_ORIGINS", "http://localhost:3000")),
	}
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func (c *Config) IsProduction() bool {
	return c.AppEnv == "production"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}