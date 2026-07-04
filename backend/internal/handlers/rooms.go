package handlers

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-sql-driver/mysql"
	"github.com/lithammer/shortuuid/v4"
	"golang.org/x/crypto/bcrypt"

	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/models"
	"videoconf-backend/internal/repo"
)

const (
	minDurationMinutes uint32 = 5
	maxDurationMinutes uint32 = 480
	minPasswordLen            = 4
	maxPasswordLen            = 128
)

var slugRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$`)

type createRoomRequest struct {
	Name     string `json:"name" binding:"required,min=1,max=150"`
	Slug     string `json:"slug"`
	IsPublic bool   `json:"is_public"`
	// Optional scheduling. ScheduledAt as RFC3339 UTC string; omit/null = instant room (joinable kapan saja).
	ScheduledAt     *time.Time `json:"scheduled_at"`
	DurationMinutes *uint32    `json:"duration_minutes"`
	// Optional password gate. Empty/omitted = no password.
	Password string `json:"password"`
	// Optional recurrence: "daily" | "weekly". Requires scheduled_at.
	Recurrence string `json:"recurrence"`
	// Optional waiting room — kalau true, non-owner harus diapprove owner.
	WaitingRoomEnabled bool `json:"waiting_room_enabled"`
	// Initial mic/cam state defaults. When true, peserta yang baru join landed
	// di pre-join dengan mic/cam off — bisa override sebelum klik Join.
	DefaultMicOff bool `json:"default_mic_off"`
	DefaultCamOff bool `json:"default_cam_off"`
}

var validRecurrences = map[string]bool{
	"daily":  true,
	"weekly": true,
}

// CreateRoom godoc
// @Summary      Bikin room baru
// @Description  User yang login otomatis jadi owner. Slug optional — kalau kosong, di-generate random shortuuid.
// @Tags         rooms
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        request  body      createRoomRequest  true  "room data"
// @Success      201      {object}  models.Room
// @Failure      400      {object}  errorResponse  "name kosong atau slug pattern invalid"
// @Failure      401      {object}  errorResponse
// @Failure      409      {object}  errorResponse  "slug udah dipake"
// @Router       /rooms [post]
func CreateRoom(rooms *repo.RoomRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := middleware.UserIDFromCtx(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		var req createRoomRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		slug := req.Slug
		if slug == "" {
			slug = shortuuid.New()
		} else if !slugRegex.MatchString(slug) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "slug must be 4-64 chars, lowercase alphanumeric or dash, start/end alphanumeric"})
			return
		}

		// Scheduling: either both fields present, or both omitted. Duration must be within bounds.
		var scheduledAt *time.Time
		var durationMinutes *uint32
		if req.ScheduledAt != nil || req.DurationMinutes != nil {
			if req.ScheduledAt == nil || req.DurationMinutes == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "scheduled_at and duration_minutes must be provided together"})
				return
			}
			if *req.DurationMinutes < minDurationMinutes || *req.DurationMinutes > maxDurationMinutes {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": "duration_minutes must be between 5 and 480",
				})
				return
			}
			utc := req.ScheduledAt.UTC()
			scheduledAt = &utc
			durationMinutes = req.DurationMinutes
		}

		var recurrence *string
		if req.Recurrence != "" {
			if !validRecurrences[req.Recurrence] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "recurrence must be 'daily' or 'weekly'"})
				return
			}
			if scheduledAt == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "recurrence requires scheduled_at"})
				return
			}
			r := req.Recurrence
			recurrence = &r
		}

		var passwordHash *string
		if req.Password != "" {
			if len(req.Password) < minPasswordLen || len(req.Password) > maxPasswordLen {
				c.JSON(http.StatusBadRequest, gin.H{"error": "password must be 4-128 chars"})
				return
			}
			hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
				return
			}
			s := string(hashed)
			passwordHash = &s
		}

		room, err := rooms.Create(repo.CreateRoomInput{
			Slug:               slug,
			Name:               req.Name,
			OwnerID:            userID,
			IsPublic:           req.IsPublic,
			ScheduledAt:        scheduledAt,
			DurationMinutes:    durationMinutes,
			PasswordHash:       passwordHash,
			Recurrence:         recurrence,
			WaitingRoomEnabled: req.WaitingRoomEnabled,
			DefaultMicOff:      req.DefaultMicOff,
			DefaultCamOff:      req.DefaultCamOff,
		})
		if err != nil {
			var mysqlErr *mysql.MySQLError
			if errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 {
				c.JSON(http.StatusConflict, gin.H{"error": "slug already taken"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create room"})
			return
		}

		c.JSON(http.StatusCreated, room)
	}
}

// ListMyRooms godoc
// @Summary      List room milik saya
// @Description  Return semua room dimana current user adalah owner, urut paling baru duluan.
// @Tags         rooms
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  roomsListResponse
// @Failure      401  {object}  errorResponse
// @Router       /rooms/my [get]
func ListMyRooms(rooms *repo.RoomRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := middleware.UserIDFromCtx(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		list, err := rooms.ListByOwner(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list rooms"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"rooms": list})
	}
}

// roomDetailResponse wraps Room with permission flags so frontend can decide
// which host-controls UI to show without making another request.
type roomDetailResponse struct {
	*models.Room
	IsCohost bool `json:"is_cohost"`
}

// GetRoom godoc
// @Summary      Detail room
// @Description  Detail satu room + flag is_cohost untuk current user. Kalau private, cuma owner yang bisa lihat. idOrSlug bisa numeric room id atau slug string.
// @Tags         rooms
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string                true  "room id (number) atau slug"
// @Success      200       {object}  roomDetailResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "private dan bukan owner"
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug} [get]
func GetRoom(rooms *repo.RoomRepo, cohosts *repo.CohostRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := RequireRoomAccess(c, rooms)
		if !ok {
			return
		}
		userID, _ := middleware.UserIDFromCtx(c)
		isCohost := false
		if userID != 0 && userID != room.OwnerID {
			ic, err := cohosts.IsCohost(room.ID, userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "cohost check failed"})
				return
			}
			isCohost = ic
		}
		c.JSON(http.StatusOK, roomDetailResponse{Room: room, IsCohost: isCohost})
	}
}

// RequireRoomAccess looks up the room from the URL param "idOrSlug" and ensures
// the authenticated user can access it (owner, or room is public). Writes an
// appropriate error response (404/403) and returns ok=false on failure.
func RequireRoomAccess(c *gin.Context, rooms *repo.RoomRepo) (*models.Room, bool) {
	room, ok := lookupRoom(c, rooms)
	if !ok {
		return nil, false
	}

	userID, _ := middleware.UserIDFromCtx(c)
	if !room.IsPublic && room.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed"})
		return nil, false
	}
	return room, true
}

// DeleteRoom godoc
// @Summary      Hapus room
// @Description  Owner only. Cascading delete: messages dan recordings ikut kehapus (FK ON DELETE CASCADE).
// @Tags         rooms
// @Security     BearerAuth
// @Param        idOrSlug  path  string  true  "room id atau slug"
// @Success      204
// @Failure      401  {object}  errorResponse
// @Failure      403  {object}  errorResponse  "bukan owner"
// @Failure      404  {object}  errorResponse
// @Router       /rooms/{idOrSlug} [delete]
func DeleteRoom(rooms *repo.RoomRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := lookupRoom(c, rooms)
		if !ok {
			return
		}

		userID, _ := middleware.UserIDFromCtx(c)
		if room.OwnerID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "only owner can delete"})
			return
		}

		if err := rooms.Delete(room.ID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete room"})
			return
		}

		c.Status(http.StatusNoContent)
	}
}

// lookupRoom resolves a room by numeric ID or slug from the URL param "idOrSlug".
// Writes an error response and returns ok=false on failure.
func lookupRoom(c *gin.Context, rooms *repo.RoomRepo) (*models.Room, bool) {
	idOrSlug := c.Param("idOrSlug")

	var (
		room *models.Room
		err  error
	)
	if id, parseErr := strconv.ParseUint(idOrSlug, 10, 64); parseErr == nil {
		room, err = rooms.GetByID(id)
	} else {
		room, err = rooms.GetBySlug(idOrSlug)
	}

	if errors.Is(err, repo.ErrRoomNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "room not found"})
		return nil, false
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
		return nil, false
	}
	return room, true
}
