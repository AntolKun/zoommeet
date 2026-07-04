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
	// Allowed email domains for registration (lowercase). Empty = allow any.
	// Comma-separated env: ALLOWED_REGISTER_DOMAINS="piko.co.id,gmail.com"
	AllowedRegisterDomains []string

	// MinIO connection — used for avatar uploads. Endpoint is the server-side
	// host:port (e.g. "minio:9000" inside docker), PublicBaseURL is what
	// clients use to fetch the file (e.g. "http://localhost:9000").
	MinIOEndpoint         string
	MinIOAccessKey        string
	MinIOSecretKey        string
	MinIOUseSSL           bool
	MinIOAvatarBucket     string
	MinIOAttachmentBucket string
	MinIOPublicBaseURL    string
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
		AppJWTSecret:           getEnv("APP_JWT_SECRET", "change-me-in-prod"),
		CORSOrigins:            splitCSV(getEnv("CORS_ORIGINS", "http://localhost:3000")),
		AllowedRegisterDomains: lowerAll(splitCSV(getEnv("ALLOWED_REGISTER_DOMAINS", ""))),
		MinIOEndpoint:          getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinIOAccessKey:         getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinIOSecretKey:         getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinIOUseSSL:            getEnv("MINIO_USE_SSL", "false") == "true",
		MinIOAvatarBucket:      getEnv("MINIO_AVATAR_BUCKET", "avatars"),
		MinIOAttachmentBucket:  getEnv("MINIO_ATTACHMENT_BUCKET", "chat-attachments"),
		MinIOPublicBaseURL:     getEnv("MINIO_PUBLIC_BASE_URL", "http://localhost:9000"),
	}
}

func lowerAll(in []string) []string {
	out := make([]string, len(in))
	for i, s := range in {
		out[i] = strings.ToLower(s)
	}
	return out
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