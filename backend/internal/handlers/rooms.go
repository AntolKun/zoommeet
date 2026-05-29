package handlers

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/go-sql-driver/mysql"
	"github.com/lithammer/shortuuid/v4"

	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/models"
	"videoconf-backend/internal/repo"
)

var slugRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$`)

type createRoomRequest struct {
	Name     string `json:"name" binding:"required,min=1,max=150"`
	Slug     string `json:"slug"`
	IsPublic bool   `json:"is_public"`
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

		room, err := rooms.Create(slug, req.Name, userID, req.IsPublic)
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

// GetRoom godoc
// @Summary      Detail room
// @Description  Detail satu room. Kalau private, cuma owner yang bisa lihat. idOrSlug bisa numeric room id atau slug string.
// @Tags         rooms
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string         true  "room id (number) atau slug"
// @Success      200       {object}  models.Room
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "private dan bukan owner"
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug} [get]
func GetRoom(rooms *repo.RoomRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := RequireRoomAccess(c, rooms)
		if !ok {
			return
		}
		c.JSON(http.StatusOK, room)
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
