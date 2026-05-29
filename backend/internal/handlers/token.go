package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/livekit/protocol/auth"
	"github.com/lithammer/shortuuid/v4"

	"videoconf-backend/internal/config"
	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/models"
	"videoconf-backend/internal/repo"
)

const guestNameMaxLen = 50

type tokenRequest struct {
	Room string `json:"room" binding:"required"`
}

type tokenResponse struct {
	Token string `json:"token"`
	URL   string `json:"url"`
	Room  string `json:"room"`
}

// Token godoc
// @Summary      Generate LiveKit access token
// @Description  Generate JWT untuk frontend connect ke LiveKit server. Cek dulu user authorized buat room (owner kalau private, anyone kalau public, harus unlocked atau owner). Identity di LiveKit = user.id, name = display_name. Token valid 6 jam.
// @Tags         token
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        request  body      tokenRequest      true  "room id atau slug"
// @Success      200      {object}  tokenResponse
// @Failure      400      {object}  errorResponse
// @Failure      401      {object}  errorResponse
// @Failure      403      {object}  errorResponse  "private dan bukan owner, atau locked dan bukan owner"
// @Failure      404      {object}  errorResponse  "room gak ada"
// @Router       /token [post]
func Token(cfg *config.Config, users *repo.UserRepo, rooms *repo.RoomRepo) gin.HandlerFunc {
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

		if !room.IsPublic && room.OwnerID != user.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to join this room"})
			return
		}

		if room.IsLocked && room.OwnerID != user.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "room is locked"})
			return
		}

		at := auth.NewAccessToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
		grant := &auth.VideoGrant{
			RoomJoin:     true,
			Room:         room.Slug,
			CanPublish:   boolPtr(true),
			CanSubscribe: boolPtr(true),
		}

		identity := strconv.FormatUint(user.ID, 10)
		at.SetVideoGrant(grant).
			SetIdentity(identity).
			SetName(user.DisplayName).
			SetValidFor(6 * time.Hour)

		token, err := at.ToJWT()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
			return
		}

		c.JSON(http.StatusOK, tokenResponse{
			Token: token,
			URL:   cfg.LiveKitWSURL,
			Room:  room.Slug,
		})
	}
}

type guestTokenRequest struct {
	Name string `json:"name" binding:"required"`
}

// GuestToken godoc
// @Summary      Generate LiveKit token untuk guest (tanpa register)
// @Description  Endpoint publik (gak butuh auth). Siapa pun yang punya link room PUBLIK bisa join sebagai tamu cuma dengan masukin nama. Identity di LiveKit di-generate random ("guest_xxxx"). Room private atau locked tetap ditolak — guest cuma boleh ke room publik yang terbuka.
// @Tags         token
// @Accept       json
// @Produce      json
// @Param        idOrSlug  path      string             true  "room id atau slug"
// @Param        request   body      guestTokenRequest  true  "display name guest"
// @Success      200       {object}  tokenResponse
// @Failure      400       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "room privat atau locked"
// @Failure      404       {object}  errorResponse  "room gak ada"
// @Router       /rooms/{idOrSlug}/guest-token [post]
func GuestToken(cfg *config.Config, rooms *repo.RoomRepo) gin.HandlerFunc {
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

		// Random per-join identity so guests don't collide with each other or
		// with an owner who joined as themselves.
		identity := "guest_" + shortuuid.New()[:8]

		at := auth.NewAccessToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
		grant := &auth.VideoGrant{
			RoomJoin:     true,
			Room:         room.Slug,
			CanPublish:   boolPtr(true),
			CanSubscribe: boolPtr(true),
		}
		at.SetVideoGrant(grant).
			SetIdentity(identity).
			SetName(name).
			SetValidFor(6 * time.Hour)

		token, err := at.ToJWT()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
			return
		}

		c.JSON(http.StatusOK, tokenResponse{
			Token: token,
			URL:   cfg.LiveKitWSURL,
			Room:  room.Slug,
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
