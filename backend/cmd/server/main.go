// Package main is the videoconf backend HTTP server.
//
// @title           Videoconf Backend API
// @version         0.1
// @description     Backend Go + Gin untuk aplikasi video conference berbasis LiveKit.
// @description     Auth pakai dua jenis JWT: app JWT (untuk endpoint backend ini) dan LiveKit JWT (untuk connect ke LiveKit server, di-issue oleh /api/token).
//
// @host            localhost:8080
// @BasePath        /api
// @schemes         http
//
// @securityDefinitions.apikey BearerAuth
// @in              header
// @name            Authorization
// @description     Type "Bearer" lalu spasi, lalu app JWT yang didapat dari /auth/login atau /auth/register.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"golang.org/x/time/rate"

	_ "videoconf-backend/docs"
	"videoconf-backend/internal/config"
	"videoconf-backend/internal/db"
	"videoconf-backend/internal/handlers"
	"videoconf-backend/internal/livekit"
	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/repo"
)

func main() {
	cfg := config.Load()

	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	conn, err := db.Open(cfg.DBDsn)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer conn.Close()

	users := repo.NewUserRepo(conn)
	rooms := repo.NewRoomRepo(conn)
	messages := repo.NewMessageRepo(conn)
	recordings := repo.NewRecordingRepo(conn)

	lk := livekit.NewClient(cfg.LiveKitAPIURL, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	eg := livekit.NewEgressClient(cfg.LiveKitAPIURL, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)

	r := gin.Default()
	r.Use(middleware.CORS(cfg.CORSOrigins, !cfg.IsProduction()))

	// Swagger UI: only enabled outside production.
	if !cfg.IsProduction() {
		r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	authMW := middleware.RequireAuth(cfg.AppJWTSecret)
	// Auth endpoints: 5 req/min per IP, burst 5. Bcrypt is intentionally CPU-heavy,
	// so unbounded brute-force will hammer the server.
	authRL := middleware.NewIPRateLimiter(rate.Limit(5.0/60.0), 5)

	api := r.Group("/api")
	{
		// healthCheck godoc
		// @Summary      Health check
		// @Description  Cek apakah backend hidup. Tidak butuh auth.
		// @Tags         meta
		// @Produce      json
		// @Success      200  {object}  map[string]string
		// @Router       /health [get]
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"status":  "ok",
				"service": "videoconf-backend",
			})
		})

		api.POST("/auth/register", authRL.Middleware(), handlers.Register(cfg, users))
		api.POST("/auth/login", authRL.Middleware(), handlers.Login(cfg, users))

		// Public — guest join via shared link, no account needed.
		api.POST("/rooms/:idOrSlug/guest-token", handlers.GuestToken(cfg, rooms))

		protected := api.Group("")
		protected.Use(authMW)
		{
			protected.POST("/token", handlers.Token(cfg, users, rooms))
			protected.POST("/rooms", handlers.CreateRoom(rooms))
			protected.GET("/rooms/my", handlers.ListMyRooms(rooms))
			protected.GET("/rooms/:idOrSlug", handlers.GetRoom(rooms))
			protected.DELETE("/rooms/:idOrSlug", handlers.DeleteRoom(rooms))
			protected.POST("/rooms/:idOrSlug/messages", handlers.SendMessage(rooms, messages))
			protected.GET("/rooms/:idOrSlug/messages", handlers.ListMessages(rooms, messages))

			protected.POST("/rooms/:idOrSlug/lock", handlers.LockRoom(rooms))
			protected.POST("/rooms/:idOrSlug/unlock", handlers.UnlockRoom(rooms))
			protected.GET("/rooms/:idOrSlug/participants", handlers.ListParticipants(rooms, lk))
			protected.POST("/rooms/:idOrSlug/participants/:identity/mute", handlers.MuteParticipant(rooms, lk))
			protected.DELETE("/rooms/:idOrSlug/participants/:identity", handlers.KickParticipant(rooms, lk))

			protected.POST("/rooms/:idOrSlug/recordings", handlers.StartRecording(rooms, recordings, eg))
			protected.GET("/rooms/:idOrSlug/recordings", handlers.ListRecordings(rooms, recordings))
			protected.POST("/recordings/:id/stop", handlers.StopRecording(recordings, rooms, eg))
			protected.GET("/recordings/:id", handlers.GetRecording(recordings, rooms))
		}
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("Server running on :%s (env=%s)", cfg.Port, cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("shutdown: %v", err)
	}
	log.Println("Server stopped cleanly")
}
