package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"

	"videoconf-backend/internal/auth"
	"videoconf-backend/internal/config"
	"videoconf-backend/internal/repo"
)

const tokenTTL = 24 * time.Hour

type registerRequest struct {
	Email       string `json:"email" binding:"required,email"`
	Password    string `json:"password" binding:"required,min=8"`
	DisplayName string `json:"display_name" binding:"required,min=1,max=100"`
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type authResponse struct {
	Token string      `json:"token"`
	User  userPayload `json:"user"`
}

type userPayload struct {
	ID          uint64 `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
}

// Register godoc
// @Summary      Register user baru
// @Description  Bikin user baru. Email harus unik, password min 8 char, di-hash pakai bcrypt. Sukses langsung dapet app JWT (gak perlu login lagi). Rate-limited (5 req burst per IP).
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request  body      registerRequest   true  "registration data"
// @Success      201      {object}  authResponse
// @Failure      400      {object}  errorResponse
// @Failure      409      {object}  errorResponse  "email udah dipake"
// @Failure      429      {object}  errorResponse  "rate limit"
// @Router       /auth/register [post]
func Register(cfg *config.Config, users *repo.UserRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req registerRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		req.Email = strings.ToLower(strings.TrimSpace(req.Email))

		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}

		user, err := users.Create(req.Email, string(hash), req.DisplayName)
		if err != nil {
			var mysqlErr *mysql.MySQLError
			if errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 {
				c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
			return
		}

		token, err := auth.GenerateToken(cfg.AppJWTSecret, user.ID, user.Email, tokenTTL)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
			return
		}

		c.JSON(http.StatusCreated, authResponse{
			Token: token,
			User: userPayload{
				ID:          user.ID,
				Email:       user.Email,
				DisplayName: user.DisplayName,
			},
		})
	}
}

// Login godoc
// @Summary      Login user
// @Description  Login pakai email + password. Sukses dapet app JWT yang valid 24 jam. Rate-limited (5 req burst per IP).
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request  body      loginRequest      true  "login data"
// @Success      200      {object}  authResponse
// @Failure      400      {object}  errorResponse
// @Failure      401      {object}  errorResponse  "invalid credentials (email/password salah, generic)"
// @Failure      429      {object}  errorResponse  "rate limit"
// @Router       /auth/login [post]
func Login(cfg *config.Config, users *repo.UserRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req loginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		req.Email = strings.ToLower(strings.TrimSpace(req.Email))

		user, err := users.GetByEmail(req.Email)
		if err != nil {
			if errors.Is(err, repo.ErrUserNotFound) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}

		token, err := auth.GenerateToken(cfg.AppJWTSecret, user.ID, user.Email, tokenTTL)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
			return
		}

		c.JSON(http.StatusOK, authResponse{
			Token: token,
			User: userPayload{
				ID:          user.ID,
				Email:       user.Email,
				DisplayName: user.DisplayName,
			},
		})
	}
}
