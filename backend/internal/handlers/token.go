package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/livekit/protocol/auth"
	"github.com/lithammer/shortuuid/v4"
	"golang.org/x/crypto/bcrypt"

	"videoconf-backend/internal/config"
	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/models"
	"videoconf-backend/internal/repo"
)

const guestNameMaxLen = 50

// Token validity window — LiveKit token is fresh after admission to the room.
const liveKitTokenTTL = 6 * time.Hour

// Standard error codes returned in JSON `code` field so the frontend can react
// programmatically (e.g., show a password input on password_required).
const (
	codePasswordRequired = "password_required"
	codePasswordInvalid  = "password_invalid"
)

// Response statuses for the token endpoints.
const (
	tokenStatusImmediate = "immediate" // token siap, langsung join
	tokenStatusPending   = "pending"   // antri di waiting room, klien harus polling
)

// generateRequestToken returns a 64-char hex string used as an opaque ID for
// the waiting request — long enough to be unguessable for status polling.
func generateRequestToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// buildLiveKitToken bikin JWT LiveKit dengan grant standar (join + publish + subscribe).
// Dipakai bareng oleh Token, GuestToken, dan AdmitWaiting.
func buildLiveKitToken(cfg *config.Config, roomSlug, identity, displayName string) (string, error) {
	at := auth.NewAccessToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	grant := &auth.VideoGrant{
		RoomJoin:     true,
		Room:         roomSlug,
		CanPublish:   boolPtr(true),
		CanSubscribe: boolPtr(true),
	}
	at.SetVideoGrant(grant).
		SetIdentity(identity).
		SetName(displayName).
		SetValidFor(liveKitTokenTTL)
	return at.ToJWT()
}

// checkRoomPassword returns an error response if the room is password-protected
// and the supplied password doesn't match. Owner bypasses the check.
// Returns true if the caller should continue, false if a response was written.
func checkRoomPassword(c *gin.Context, room *models.Room, supplied string, ownerBypass bool) bool {
	if !room.HasPassword || ownerBypass {
		return true
	}
	if supplied == "" {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "password required",
			"code":  codePasswordRequired,
		})
		return false
	}
	if err := bcrypt.CompareHashAndPassword([]byte(room.PasswordHash), []byte(supplied)); err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "password salah",
			"code":  codePasswordInvalid,
		})
		return false
	}
	return true
}

type tokenRequest struct {
	Room     string `json:"room" binding:"required"`
	Password string `json:"password"`
}

// tokenResponse bisa balik 2 bentuk:
//   - status="immediate": token + url terisi → klien langsung connect ke LiveKit
//   - status="pending":   request_token terisi → klien polling status sampai owner approve/deny
type tokenResponse struct {
	Status       string `json:"status"`
	Token        string `json:"token,omitempty"`
	URL          string `json:"url,omitempty"`
	Room         string `json:"room"`
	RequestToken string `json:"request_token,omitempty"`
}

// Token godoc
// @Summary      Generate LiveKit access token
// @Description  Generate JWT untuk frontend connect ke LiveKit server. Kalau room pakai waiting room dan caller bukan owner, response balik status="pending" + request_token — klien wajib polling /waiting/{token}/status sampai owner approve. Owner selalu bypass waiting room. Token valid 6 jam.
// @Tags         token
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        request  body      tokenRequest      true  "room id atau slug"
// @Success      200      {object}  tokenResponse
// @Failure      400      {object}  errorResponse
// @Failure      401      {object}  errorResponse
// @Failure      403      {object}  errorResponse  "private dan bukan owner, locked dan bukan owner, atau password salah"
// @Failure      404      {object}  errorResponse  "room gak ada"
// @Router       /token [post]
func Token(cfg *config.Config, users *repo.UserRepo, rooms *repo.RoomRepo, waiting *repo.WaitingRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := middleware.UserIDFromCtx(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		var req tokenRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		user, err := users.GetByID(userID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}

		room, err := lookupRoomByIDOrSlug(rooms, req.Room)
		if err != nil {
			if errors.Is(err, repo.ErrRoomNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "room not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
			return
		}

		isOwner := room.OwnerID == user.ID

		if !room.IsPublic && !isOwner {
			c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to join this room"})
			return
		}

		if room.IsLocked && !isOwner {
			c.JSON(http.StatusForbidden, gin.H{"error": "room is locked"})
			return
		}

		if !checkRoomPassword(c, room, req.Password, isOwner) {
			return
		}

		// Waiting room: kalau aktif dan caller bukan owner, parkir dulu.
		if room.WaitingRoomEnabled && !isOwner {
			uid := user.ID
			reqToken, err := generateRequestToken()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create waiting request"})
				return
			}
			if _, err := waiting.Create(repo.CreateWaitingInput{
				RoomID:       room.ID,
				UserID:       &uid,
				DisplayName:  user.DisplayName,
				RequestToken: reqToken,
			}); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create waiting request"})
				return
			}
			c.JSON(http.StatusOK, tokenResponse{
				Status:       tokenStatusPending,
				Room:         room.Slug,
				RequestToken: reqToken,
			})
			return
		}

		identity := strconv.FormatUint(user.ID, 10)
		token, err := buildLiveKitToken(cfg, room.Slug, identity, user.DisplayName)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
			return
		}

		c.JSON(http.StatusOK, tokenResponse{
			Status: tokenStatusImmediate,
			Token:  token,
			URL:    cfg.LiveKitWSURL,
			Room:   room.Slug,
		})
	}
}

type guestTokenRequest struct {
	Name     string `json:"name" binding:"required"`
	Password string `json:"password"`
}

// GuestToken godoc
// @Summary      Generate LiveKit token untuk guest (tanpa register)
// @Description  Endpoint publik (gak butuh auth). Siapa pun yang punya link room PUBLIK bisa join sebagai tamu cuma dengan masukin nama. Identity di LiveKit di-generate random ("guest_xxxx"). Room private atau locked tetap ditolak. Kalau waiting room aktif, response balik status="pending" + request_token — klien polling status sampai owner approve.
// @Tags         token
// @Accept       json
// @Produce      json
// @Param        idOrSlug  path      string             true  "room id atau slug"
// @Param        request   body      guestTokenRequest  true  "display name guest"
// @Success      200       {object}  tokenResponse
// @Failure      400       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "room privat, locked, atau password salah"
// @Failure      404       {object}  errorResponse  "room gak ada"
// @Router       /rooms/{idOrSlug}/guest-token [post]
func GuestToken(cfg *config.Config, rooms *repo.RoomRepo, waiting *repo.WaitingRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req guestTokenRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		name := strings.TrimSpace(req.Name)
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
			return
		}
		if len(name) > guestNameMaxLen {
			name = name[:guestNameMaxLen]
		}

		room, err := lookupRoomByIDOrSlug(rooms, c.Param("idOrSlug"))
		if err != nil {
			if errors.Is(err, repo.ErrRoomNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "room not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
			return
		}

		if !room.IsPublic {
			c.JSON(http.StatusForbidden, gin.H{"error": "room is private"})
			return
		}
		if room.IsLocked {
			c.JSON(http.StatusForbidden, gin.H{"error": "room is locked"})
			return
		}
		if !checkRoomPassword(c, room, req.Password, false) {
			return
		}

		// Waiting room: kalau aktif, parkir dulu — guest tidak punya owner bypass.
		if room.WaitingRoomEnabled {
			reqToken, err := generateRequestToken()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create waiting request"})
				return
			}
			if _, err := waiting.Create(repo.CreateWaitingInput{
				RoomID:       room.ID,
				UserID:       nil,
				DisplayName:  name,
				RequestToken: reqToken,
			}); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create waiting request"})
				return
			}
			c.JSON(http.StatusOK, tokenResponse{
				Status:       tokenStatusPending,
				Room:         room.Slug,
				RequestToken: reqToken,
			})
			return
		}

		// Random per-join identity so guests don't collide with each other or
		// with an owner who joined as themselves.
		identity := "guest_" + shortuuid.New()[:8]
		token, err := buildLiveKitToken(cfg, room.Slug, identity, name)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
			return
		}

		c.JSON(http.StatusOK, tokenResponse{
			Status: tokenStatusImmediate,
			Token:  token,
			URL:    cfg.LiveKitWSURL,
			Room:   room.Slug,
		})
	}
}

func lookupRoomByIDOrSlug(rooms *repo.RoomRepo, idOrSlug string) (*models.Room, error) {
	if id, err := strconv.ParseUint(idOrSlug, 10, 64); err == nil {
		return rooms.GetByID(id)
	}
	return rooms.GetBySlug(idOrSlug)
}

func boolPtr(b bool) *bool {
	return &b
}
