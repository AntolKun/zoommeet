package middleware

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORS configures cross-origin requests.
//
// If allowAll is true (typically only in dev), every Origin is accepted —
// reflected back as Access-Control-Allow-Origin, so credentials still work.
// In production allowAll should be false and `allowOrigins` should hold the
// explicit allowlist.
func CORS(allowOrigins []string, allowAll bool) gin.HandlerFunc {
	cfg := cors.Config{
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	if allowAll {
		cfg.AllowOriginFunc = func(string) bool { return true }
	} else {
		cfg.AllowOrigins = allowOrigins
	}
	return cors.New(cfg)
}
