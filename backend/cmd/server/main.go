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
	"videoconf-backend/internal/storage"
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
	waiting := repo.NewWaitingRepo(conn)
	cohosts := repo.NewCohostRepo(conn)
	attendance := repo.NewAttendanceRepo(conn)
	audit := repo.NewAuditRepo(conn)
	polls := repo.NewPollRepo(conn)
	breakouts := repo.NewBreakoutRepo(conn)
	questions := repo.NewQuestionRepo(conn)

	// MinIO is optional — server still boots if config is missing, but avatar
	// upload endpoints return 503 in that case.
	minioStore, mErr := storage.NewMinIO(
		cfg.MinIOEndpoint, cfg.MinIOAccessKey, cfg.MinIOSecretKey,
		cfg.MinIOAvatarBucket, cfg.MinIOPublicBaseURL, cfg.MinIOUseSSL,
	)
	if mErr != nil {
		log.Printf("minio init failed (avatar upload disabled): %v", mErr)
		minioStore = nil
	} else {
		ctxBoot, cancelBoot := context.WithTimeout(context.Background(), 5*time.Second)
		if err := minioStore.EnsureBucket(ctxBoot); err != nil {
			log.Printf("minio bucket setup failed: %v", err)
		}
		cancelBoot()
	}

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
		api.POST("/rooms/:idOrSlug/guest-token", handlers.GuestToken(cfg, rooms, waiting))

		// Public — waiting guest polls admission status with opaque request_token.
		api.GET("/waiting/:token/status", handlers.WaitingStatus(cfg, rooms, waiting))

		// Public-or-auth — attendance logging works for guests too. TryAuth fills
		// in user_id when a valid JWT is present, leaves it nil otherwise.
		tryAuth := middleware.TryAuth(cfg.AppJWTSecret)
		api.POST("/rooms/:idOrSlug/attendance/join", tryAuth, handlers.LogAttendanceJoin(rooms, attendance))
		api.POST("/attendance/:id/leave", handlers.LogAttendanceLeave(attendance))

		protected := api.Group("")
		protected.Use(authMW)
		{
			protected.POST("/token", handlers.Token(cfg, users, rooms, waiting))
			protected.POST("/rooms", handlers.CreateRoom(rooms))
			protected.GET("/rooms/my", handlers.ListMyRooms(rooms))
			protected.GET("/rooms/:idOrSlug", handlers.GetRoom(rooms, cohosts))
			protected.DELETE("/rooms/:idOrSlug", handlers.DeleteRoom(rooms))
			protected.POST("/rooms/:idOrSlug/messages", handlers.SendMessage(rooms, messages, users))
			protected.GET("/rooms/:idOrSlug/messages", handlers.ListMessages(rooms, messages))
			protected.PATCH("/messages/:id", handlers.EditMessage(rooms, messages))
			protected.DELETE("/messages/:id", handlers.DeleteMessage(rooms, cohosts, messages))
			protected.POST("/messages/:id/reactions", handlers.AddMessageReaction(rooms, messages))
			protected.DELETE("/messages/:id/reactions/:emoji", handlers.RemoveMessageReaction(messages))

			protected.POST("/rooms/:idOrSlug/lock", handlers.LockRoom(rooms, cohosts, audit))
			protected.POST("/rooms/:idOrSlug/unlock", handlers.UnlockRoom(rooms, cohosts, audit))
			protected.GET("/rooms/:idOrSlug/participants", handlers.ListParticipants(rooms, cohosts, lk))
			protected.POST("/rooms/:idOrSlug/participants/:identity/mute", handlers.MuteParticipant(rooms, cohosts, audit, lk))
			protected.DELETE("/rooms/:idOrSlug/participants/:identity", handlers.KickParticipant(rooms, cohosts, audit, lk))

			protected.POST("/rooms/:idOrSlug/recordings", handlers.StartRecording(rooms, cohosts, audit, recordings, eg))
			protected.GET("/rooms/:idOrSlug/recordings", handlers.ListRecordings(rooms, cohosts, recordings))
			protected.POST("/recordings/:id/stop", handlers.StopRecording(recordings, rooms, cohosts, audit, eg))
			protected.GET("/recordings/:id", handlers.GetRecording(recordings, rooms, cohosts))

			// Waiting room: toggle owner-only; admit/deny/list shared with cohosts.
			protected.POST("/rooms/:idOrSlug/waiting-room", handlers.ToggleWaitingRoom(rooms, audit))
			protected.GET("/rooms/:idOrSlug/waiting", handlers.ListWaitingRequests(rooms, cohosts, waiting))
			protected.POST("/rooms/:idOrSlug/waiting/:id/admit", handlers.AdmitWaiting(cfg, rooms, cohosts, audit, waiting))
			protected.POST("/rooms/:idOrSlug/waiting/:id/deny", handlers.DenyWaiting(rooms, cohosts, audit, waiting))

			// Co-host management (owner only for write; anyone w/ room access for read).
			protected.GET("/rooms/:idOrSlug/cohosts", handlers.ListCohosts(rooms, cohosts))
			protected.POST("/rooms/:idOrSlug/cohosts", handlers.AddCohost(rooms, cohosts, audit, users))
			protected.DELETE("/rooms/:idOrSlug/cohosts/:userID", handlers.RemoveCohost(rooms, cohosts, audit))

			// Admin: attendance list + audit log (owner / cohost).
			protected.GET("/rooms/:idOrSlug/attendance", handlers.ListAttendance(rooms, cohosts, attendance))
			protected.GET("/rooms/:idOrSlug/audit", handlers.ListAuditLog(rooms, audit))

			// Polls — host creates/closes, anyone with room access lists/votes.
			protected.POST("/rooms/:idOrSlug/polls", handlers.CreatePoll(rooms, cohosts, polls))
			protected.GET("/rooms/:idOrSlug/polls", handlers.ListPolls(rooms, polls))
			protected.POST("/polls/:id/vote", handlers.VotePoll(rooms, polls))
			protected.POST("/polls/:id/close", handlers.ClosePoll(rooms, cohosts, polls))

			// Breakout rooms — host creates N, closes all to signal recall.
			protected.POST("/rooms/:idOrSlug/breakouts", handlers.CreateBreakouts(rooms, cohosts, breakouts))
			protected.GET("/rooms/:idOrSlug/breakouts", handlers.ListBreakouts(rooms, cohosts, breakouts))
			protected.POST("/rooms/:idOrSlug/breakouts/close", handlers.CloseAllBreakouts(rooms, cohosts, breakouts))

			// Q&A — anyone with room access asks/lists/upvotes; host answers/dismisses.
			protected.POST("/rooms/:idOrSlug/questions", handlers.CreateQuestion(rooms, questions))
			protected.GET("/rooms/:idOrSlug/questions", handlers.ListQuestions(rooms, questions))
			protected.POST("/questions/:questionID/upvote", handlers.UpvoteQuestion(questions))
			protected.DELETE("/questions/:questionID/upvote", handlers.RemoveUpvoteQuestion(questions))
			protected.POST("/rooms/:idOrSlug/questions/:questionID/answer", handlers.AnswerQuestion(rooms, cohosts, questions))
			protected.POST("/rooms/:idOrSlug/questions/:questionID/dismiss", handlers.DismissQuestion(rooms, cohosts, questions))

			// Self + avatar.
			protected.GET("/users/me", handlers.GetMe(users))
			protected.POST("/users/me/avatar", handlers.UploadAvatar(users, minioStore))
			protected.GET("/users/me/pmr", handlers.GetMyPMR(users, rooms))
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
