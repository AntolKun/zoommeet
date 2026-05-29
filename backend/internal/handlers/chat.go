package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"videoconf-backend/internal/middleware"
	_ "videoconf-backend/internal/models" // for swag schema reference
	"videoconf-backend/internal/repo"
)

const maxMessageLen = 2000

type sendMessageRequest struct {
	Body string `json:"body" binding:"required"`
}

// SendMessage godoc
// @Summary      Kirim chat ke room
// @Description  Persist chat message ke DB. Akses control: owner private OK, anyone untuk public. Real-time delivery di-handle frontend via LiveKit data channel terpisah.
// @Tags         chat
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        idOrSlug  path      string              true  "room id atau slug"
// @Param        request   body      sendMessageRequest  true  "message body (max 2000 char)"
// @Success      201       {object}  models.Message
// @Failure      400       {object}  errorResponse  "body kosong atau >2000 char"
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/messages [post]
func SendMessage(rooms *repo.RoomRepo, messages *repo.MessageRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := RequireRoomAccess(c, rooms)
		if !ok {
			return
		}

		userID, _ := middleware.UserIDFromCtx(c)

		var req sendMessageRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		body := strings.TrimSpace(req.Body)
		if body == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "body cannot be empty"})
			return
		}
		if len(body) > maxMessageLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "body too long"})
			return
		}

		msg, err := messages.Create(room.ID, userID, body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save message"})
			return
		}

		c.JSON(http.StatusCreated, msg)
	}
}

// ListMessages godoc
// @Summary      List chat history
// @Description  Return message DESC by id (paling baru duluan). Pagination cursor-based via `before` (pakai id paling tua dari page sebelumnya).
// @Tags         chat
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true   "room id atau slug"
// @Param        limit     query     int     false  "default 50, max 200"
// @Param        before    query     int     false  "kalau diisi, return message dengan id < before"
// @Success      200       {object}  messagesListResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/messages [get]
func ListMessages(rooms *repo.RoomRepo, messages *repo.MessageRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := RequireRoomAccess(c, rooms)
		if !ok {
			return
		}

		var beforeID uint64
		if v := c.Query("before"); v != "" {
			if parsed, err := strconv.ParseUint(v, 10, 64); err == nil {
				beforeID = parsed
			}
		}

		limit := 50
		if v := c.Query("limit"); v != "" {
			if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
				limit = parsed
			}
		}

		list, err := messages.ListByRoom(room.ID, beforeID, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list messages"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"messages": list})
	}
}
