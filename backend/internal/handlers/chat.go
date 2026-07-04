package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"videoconf-backend/internal/middleware"
	_ "videoconf-backend/internal/models" // for swag schema reference
	"videoconf-backend/internal/repo"
)

const (
	maxMessageLen = 2000
	maxEmojiLen   = 16
)

type sendMessageRequest struct {
	Body string `json:"body"`
	// Optional: when set, the message is a DM only visible to sender and
	// recipient. recipient_id must belong to an auth user with access to the room.
	RecipientID *uint64 `json:"recipient_id,omitempty"`
	// Optional file attachment. Client uploads first via /rooms/:idOrSlug/attachments,
	// then references the returned URL here. Body may be empty when only attaching.
	AttachmentURL  *string `json:"attachment_url,omitempty"`
	AttachmentName *string `json:"attachment_name,omitempty"`
	AttachmentType *string `json:"attachment_type,omitempty"`
	AttachmentSize *uint64 `json:"attachment_size,omitempty"`
	// Optional reply-to reference. Must belong to the same room.
	ReplyToMessageID *uint64 `json:"reply_to_message_id,omitempty"`
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
func SendMessage(rooms *repo.RoomRepo, messages *repo.MessageRepo, users *repo.UserRepo) gin.HandlerFunc {
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
		hasAttachment := req.AttachmentURL != nil && *req.AttachmentURL != ""
		if body == "" && !hasAttachment {
			c.JSON(http.StatusBadRequest, gin.H{"error": "body or attachment required"})
			return
		}
		if len(body) > maxMessageLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "body too long"})
			return
		}

		// DM validation: recipient must exist + not be the sender themselves.
		// We trust that all auth users in a public room "have access" — for
		// private rooms only the owner is allowed, but then a DM to the owner
		// = self anyway, so that path is naturally blocked.
		if req.RecipientID != nil {
			if *req.RecipientID == userID {
				c.JSON(http.StatusBadRequest, gin.H{"error": "cannot DM yourself"})
				return
			}
			if _, err := users.GetByID(*req.RecipientID); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "recipient not found"})
				return
			}
		}

		msg, err := messages.Create(repo.CreateMessageInput{
			RoomID:           room.ID,
			SenderID:         userID,
			RecipientID:      req.RecipientID,
			Body:             body,
			AttachmentURL:    req.AttachmentURL,
			AttachmentName:   req.AttachmentName,
			AttachmentType:   req.AttachmentType,
			AttachmentSize:   req.AttachmentSize,
			ReplyToMessageID: req.ReplyToMessageID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save message"})
			return
		}

		c.JSON(http.StatusCreated, msg)
	}
}

// ListMessages godoc
// @Summary      List chat history
// @Description  Return message DESC by id (paling baru duluan). Pagination cursor-based via `before` (pakai id paling tua dari page sebelumnya). Soft-deleted messages return dengan body kosong + deleted_at terisi.
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

		userID, _ := middleware.UserIDFromCtx(c)
		list, err := messages.ListByRoom(room.ID, userID, beforeID, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list messages"})
			return
		}

		// Blank out body for soft-deleted messages so the API doesn't leak
		// the original content to clients.
		for _, m := range list {
			if m.DeletedAt != nil {
				m.Body = ""
			}
		}

		c.JSON(http.StatusOK, gin.H{"messages": list})
	}
}

type editMessageRequest struct {
	Body string `json:"body" binding:"required"`
}

// EditMessage godoc
// @Summary      Edit pesan
// @Description  Sender-only. Update body + stamp edited_at. Pesan yang udah deleted gak bisa di-edit.
// @Tags         chat
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id       path  int                 true  "message id"
// @Param        request  body  editMessageRequest  true  "body baru"
// @Success      200      {object}  models.Message
// @Failure      400      {object}  errorResponse
// @Failure      401      {object}  errorResponse
// @Failure      403      {object}  errorResponse  "bukan sender"
// @Failure      404      {object}  errorResponse  "message gak ada atau udah deleted"
// @Router       /messages/{id} [patch]
func EditMessage(rooms *repo.RoomRepo, messages *repo.MessageRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := middleware.UserIDFromCtx(c)
		messageID, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
			return
		}

		// Load to verify sender + room access.
		msg, err := messages.GetByID(messageID)
		if err != nil {
			if errors.Is(err, repo.ErrMessageNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
			return
		}
		if msg.DeletedAt != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "message already deleted"})
			return
		}
		if msg.SenderID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "only sender can edit"})
			return
		}

		// Confirm caller still has room access (private room, no longer owner, etc).
		room, err := rooms.GetByID(msg.RoomID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "room lookup failed"})
			return
		}
		if !room.IsPublic && room.OwnerID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "no longer has room access"})
			return
		}

		var req editMessageRequest
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

		if err := messages.UpdateBody(messageID, userID, body); err != nil {
			if errors.Is(err, repo.ErrMessageNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
				return
			}
			if errors.Is(err, repo.ErrMessageDeleted) {
				c.JSON(http.StatusNotFound, gin.H{"error": "message already deleted"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "edit failed"})
			return
		}

		updated, _ := messages.GetByID(messageID)
		c.JSON(http.StatusOK, updated)
	}
}

// DeleteMessage godoc
// @Summary      Hapus pesan
// @Description  Sender atau host (owner/cohost room) bisa hapus. Soft delete — row tetap ada di DB, frontend nampilin placeholder.
// @Tags         chat
// @Security     BearerAuth
// @Param        id  path  int  true  "message id"
// @Success      204
// @Failure      401  {object}  errorResponse
// @Failure      403  {object}  errorResponse
// @Failure      404  {object}  errorResponse
// @Router       /messages/{id} [delete]
func DeleteMessage(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, messages *repo.MessageRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := middleware.UserIDFromCtx(c)
		messageID, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
			return
		}

		msg, err := messages.GetByID(messageID)
		if err != nil {
			if errors.Is(err, repo.ErrMessageNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
			return
		}
		if msg.DeletedAt != nil {
			// Idempotent — already deleted.
			c.Status(http.StatusNoContent)
			return
		}

		isOwnerOrCohost, err := roomHostCheck(rooms, cohosts, msg.RoomID, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "permission check failed"})
			return
		}
		if msg.SenderID != userID && !isOwnerOrCohost {
			c.JSON(http.StatusForbidden, gin.H{"error": "only sender or host can delete"})
			return
		}

		if err := messages.SoftDelete(messageID, userID, isOwnerOrCohost); err != nil {
			if errors.Is(err, repo.ErrMessageNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "delete failed"})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

type reactRequest struct {
	Emoji string `json:"emoji" binding:"required"`
}

// AddMessageReaction godoc
// @Summary      Tambahin reaction ke pesan
// @Description  Insert (message, user, emoji) tuple. Idempotent — toggle ulang akan no-op kalau udah ada. Pakai DELETE buat unreact.
// @Tags         chat
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id       path  int           true  "message id"
// @Param        request  body  reactRequest  true  "emoji"
// @Success      204
// @Failure      400      {object}  errorResponse
// @Failure      401      {object}  errorResponse
// @Failure      403      {object}  errorResponse
// @Failure      404      {object}  errorResponse
// @Router       /messages/{id}/reactions [post]
func AddMessageReaction(rooms *repo.RoomRepo, messages *repo.MessageRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := middleware.UserIDFromCtx(c)
		messageID, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
			return
		}
		msg, err := messages.GetByID(messageID)
		if err != nil {
			if errors.Is(err, repo.ErrMessageNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
			return
		}
		// Caller must have access to the message's room.
		room, err := rooms.GetByID(msg.RoomID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "room lookup failed"})
			return
		}
		if !room.IsPublic && room.OwnerID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "no room access"})
			return
		}

		var req reactRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		emoji := strings.TrimSpace(req.Emoji)
		if emoji == "" || len(emoji) > maxEmojiLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid emoji"})
			return
		}

		if _, err := messages.AddReaction(messageID, userID, emoji); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "react failed"})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

// RemoveMessageReaction godoc
// @Summary      Hapus reaction sendiri
// @Description  Hapus tuple (message, user, emoji) — emoji harus URL-encoded di path.
// @Tags         chat
// @Security     BearerAuth
// @Param        id     path  int     true  "message id"
// @Param        emoji  path  string  true  "emoji character(s)"
// @Success      204
// @Failure      400    {object}  errorResponse
// @Failure      401    {object}  errorResponse
// @Failure      404    {object}  errorResponse
// @Router       /messages/{id}/reactions/{emoji} [delete]
func RemoveMessageReaction(messages *repo.MessageRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := middleware.UserIDFromCtx(c)
		messageID, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
			return
		}
		emoji := strings.TrimSpace(c.Param("emoji"))
		if emoji == "" || len(emoji) > maxEmojiLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid emoji"})
			return
		}
		if err := messages.RemoveReaction(messageID, userID, emoji); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "unreact failed"})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

// roomHostCheck returns true if userID is owner or cohost of the room.
func roomHostCheck(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, roomID, userID uint64) (bool, error) {
	room, err := rooms.GetByID(roomID)
	if err != nil {
		return false, err
	}
	if room.OwnerID == userID {
		return true, nil
	}
	return cohosts.IsCohost(roomID, userID)
}

// PinMessage marks a message as pinned. Host-only (owner or cohost).
func PinMessage(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, messages *repo.MessageRepo) gin.HandlerFunc {
	return setMessagePinned(rooms, cohosts, messages, true)
}

// UnpinMessage clears the pinned flag. Host-only.
func UnpinMessage(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, messages *repo.MessageRepo) gin.HandlerFunc {
	return setMessagePinned(rooms, cohosts, messages, false)
}

func setMessagePinned(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, messages *repo.MessageRepo, pinned bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		msgID, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil || msgID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}
		msg, err := messages.GetByID(msgID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
			return
		}
		userID, _ := middleware.UserIDFromCtx(c)
		isHost, err := roomHostCheck(rooms, cohosts, msg.RoomID, userID)
		if err != nil || !isHost {
			c.JSON(http.StatusForbidden, gin.H{"error": "only host can pin messages"})
			return
		}
		if err := messages.SetPinned(msgID, pinned); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update pin state"})
			return
		}
		updated, err := messages.GetByID(msgID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "fetch failed"})
			return
		}
		c.JSON(http.StatusOK, updated)
	}
}

// ListPinnedMessages returns pinned messages for a room. Anyone with room access can view.
func ListPinnedMessages(rooms *repo.RoomRepo, messages *repo.MessageRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := RequireRoomAccess(c, rooms)
		if !ok {
			return
		}
		list, err := messages.ListPinned(room.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list pinned"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"messages": list})
	}
}
