package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/repo"
)

const (
	maxPollQuestionLen = 500
	maxPollOptionLen   = 200
	minPollOptions     = 2
	maxPollOptions     = 10
)

type createPollRequest struct {
	Question string   `json:"question" binding:"required"`
	Options  []string `json:"options" binding:"required"`
}

// CreatePoll godoc
// @Summary      Bikin poll baru
// @Description  Host (owner/cohost) only. Bikin single-choice poll dengan 2-10 opsi. Peserta vote via /polls/:id/vote, host close pas mau lock results.
// @Tags         polls
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        idOrSlug  path      string             true  "room id atau slug"
// @Param        request   body      createPollRequest  true  "question + options"
// @Success      201       {object}  models.Poll
// @Failure      400       {object}  errorResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/polls [post]
func CreatePoll(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, polls *repo.PollRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}
		var req createPollRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		question := strings.TrimSpace(req.Question)
		if question == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "question required"})
			return
		}
		if len(question) > maxPollQuestionLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "question too long"})
			return
		}
		opts := make([]string, 0, len(req.Options))
		for _, o := range req.Options {
			t := strings.TrimSpace(o)
			if t == "" {
				continue
			}
			if len(t) > maxPollOptionLen {
				t = t[:maxPollOptionLen]
			}
			opts = append(opts, t)
		}
		if len(opts) < minPollOptions {
			c.JSON(http.StatusBadRequest, gin.H{"error": "need at least 2 options"})
			return
		}
		if len(opts) > maxPollOptions {
			c.JSON(http.StatusBadRequest, gin.H{"error": "max 10 options"})
			return
		}

		userID, _ := middleware.UserIDFromCtx(c)
		poll, err := polls.Create(repo.CreatePollInput{
			RoomID:    room.ID,
			CreatedBy: userID,
			Question:  question,
			Options:   opts,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create poll"})
			return
		}
		c.JSON(http.StatusCreated, poll)
	}
}

// ListPolls godoc
// @Summary      List polls per room
// @Description  Anyone with room access. Return semua poll (newest first, max 50) lengkap dengan options, vote counts, dan vote sendiri kalau ada.
// @Tags         polls
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true  "room id atau slug"
// @Success      200       {object}  map[string]interface{}
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/polls [get]
func ListPolls(rooms *repo.RoomRepo, polls *repo.PollRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := RequireRoomAccess(c, rooms)
		if !ok {
			return
		}
		userID, _ := middleware.UserIDFromCtx(c)
		list, err := polls.ListByRoom(room.ID, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list polls"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"polls": list})
	}
}

type votePollRequest struct {
	OptionID uint64 `json:"option_id" binding:"required"`
}

// VotePoll godoc
// @Summary      Vote di poll
// @Description  Authenticated user only — guest gak bisa vote (no user_id buat dedup). Vote ulang = ganti pilihan. Vote di poll yang udah closed = 409.
// @Tags         polls
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id       path  int             true  "poll id"
// @Param        request  body  votePollRequest true  "option_id"
// @Success      204
// @Failure      400      {object}  errorResponse
// @Failure      401      {object}  errorResponse
// @Failure      403      {object}  errorResponse
// @Failure      404      {object}  errorResponse
// @Failure      409      {object}  errorResponse  "poll closed atau option gak match"
// @Router       /polls/{id}/vote [post]
func VotePoll(rooms *repo.RoomRepo, polls *repo.PollRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		pollID, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid poll id"})
			return
		}
		// Voter must have access to the poll's room.
		roomID, err := polls.GetRoomID(pollID)
		if err != nil {
			if errors.Is(err, repo.ErrPollNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "poll not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
			return
		}
		room, err := rooms.GetByID(roomID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "room lookup failed"})
			return
		}
		userID, _ := middleware.UserIDFromCtx(c)
		if !room.IsPublic && room.OwnerID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "not allowed"})
			return
		}

		var req votePollRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := polls.Vote(pollID, req.OptionID, userID); err != nil {
			switch {
			case errors.Is(err, repo.ErrPollNotFound):
				c.JSON(http.StatusNotFound, gin.H{"error": "poll not found"})
			case errors.Is(err, repo.ErrPollClosed):
				c.JSON(http.StatusConflict, gin.H{"error": "poll already closed"})
			case errors.Is(err, repo.ErrPollOptionMismatch):
				c.JSON(http.StatusConflict, gin.H{"error": "option does not belong to this poll"})
			default:
				c.JSON(http.StatusInternalServerError, gin.H{"error": "vote failed"})
			}
			return
		}
		c.Status(http.StatusNoContent)
	}
}

// ClosePoll godoc
// @Summary      Tutup poll
// @Description  Host (owner/cohost) of the poll's room only. Idempotent — call kedua kali = no-op (poll-nya tetep closed). Setelah ditutup, vote ditolak.
// @Tags         polls
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "poll id"
// @Success      204
// @Failure      401  {object}  errorResponse
// @Failure      403  {object}  errorResponse
// @Failure      404  {object}  errorResponse
// @Router       /polls/{id}/close [post]
func ClosePoll(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, polls *repo.PollRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		pollID, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid poll id"})
			return
		}
		roomID, err := polls.GetRoomID(pollID)
		if err != nil {
			if errors.Is(err, repo.ErrPollNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "poll not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
			return
		}
		room, err := rooms.GetByID(roomID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "room lookup failed"})
			return
		}
		userID, _ := middleware.UserIDFromCtx(c)
		isOwner := room.OwnerID == userID
		if !isOwner {
			isCohost, err := cohosts.IsCohost(room.ID, userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "permission check failed"})
				return
			}
			if !isCohost {
				c.JSON(http.StatusForbidden, gin.H{"error": "only owner or cohost allowed"})
				return
			}
		}
		if err := polls.Close(pollID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "close failed"})
			return
		}
		c.Status(http.StatusNoContent)
	}
}
