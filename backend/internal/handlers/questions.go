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
	maxQuestionLen    = 1000
	maxAnswerLen      = 2000
	maxAskerNameLen   = 100
)

type createQuestionRequest struct {
	Text string `json:"text" binding:"required"`
	// The display name to attribute the question to. Required from both auth
	// users and guests — JWT doesn't carry display_name, so frontend supplies it.
	// (Trust is acceptable: this is a UX label, not a security boundary.)
	AskerName string `json:"asker_name" binding:"required"`
}

// CreateQuestion lets any participant (auth or guest) submit a question. Auth
// users get attributed by user_id; guests by display_name only.
func CreateQuestion(rooms *repo.RoomRepo, questions *repo.QuestionRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := lookupRoom(c, rooms)
		if !ok {
			return
		}
		var req createQuestionRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		text := strings.TrimSpace(req.Text)
		if text == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "question text required"})
			return
		}
		if len(text) > maxQuestionLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "question too long"})
			return
		}

		askerName := strings.TrimSpace(req.AskerName)
		if askerName == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "asker_name required"})
			return
		}
		if len(askerName) > maxAskerNameLen {
			askerName = askerName[:maxAskerNameLen]
		}

		var userPtr *uint64
		if userID, isAuth := middleware.UserIDFromCtx(c); isAuth {
			userPtr = &userID
		}

		q, err := questions.Create(repo.CreateQuestionInput{
			RoomID:    room.ID,
			UserID:    userPtr,
			AskerName: askerName,
			Text:      text,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create question"})
			return
		}
		c.JSON(http.StatusCreated, q)
	}
}

// ListQuestions returns all questions for a room — including answered and
// dismissed. Frontend can filter. viewerUserID drives my_upvote.
func ListQuestions(rooms *repo.RoomRepo, questions *repo.QuestionRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := lookupRoom(c, rooms)
		if !ok {
			return
		}
		viewerID, _ := middleware.UserIDFromCtx(c)
		list, err := questions.ListByRoom(room.ID, viewerID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list questions"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"questions": list})
	}
}

func parseQuestionID(c *gin.Context) (uint64, bool) {
	idStr := c.Param("questionID")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question id"})
		return 0, false
	}
	return id, true
}

// UpvoteQuestion adds the requester's vote. Auth-only — guests can't vote (we
// can't dedupe them reliably). Idempotent.
func UpvoteQuestion(questions *repo.QuestionRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := middleware.UserIDFromCtx(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		qID, ok := parseQuestionID(c)
		if !ok {
			return
		}
		if err := questions.Upvote(qID, userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upvote"})
			return
		}
		q, err := questions.GetByID(qID, userID)
		if err != nil {
			if errors.Is(err, repo.ErrQuestionNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "question not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch question"})
			return
		}
		c.JSON(http.StatusOK, q)
	}
}

// RemoveUpvoteQuestion removes the requester's vote.
func RemoveUpvoteQuestion(questions *repo.QuestionRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := middleware.UserIDFromCtx(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		qID, ok := parseQuestionID(c)
		if !ok {
			return
		}
		if err := questions.RemoveUpvote(qID, userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove upvote"})
			return
		}
		q, err := questions.GetByID(qID, userID)
		if err != nil {
			if errors.Is(err, repo.ErrQuestionNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "question not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch question"})
			return
		}
		c.JSON(http.StatusOK, q)
	}
}

type answerQuestionRequest struct {
	Answer string `json:"answer" binding:"required"`
}

// AnswerQuestion is host-only. Marks question answered with the provided text.
func AnswerQuestion(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, questions *repo.QuestionRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		_, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}
		qID, ok := parseQuestionID(c)
		if !ok {
			return
		}
		var req answerQuestionRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		answer := strings.TrimSpace(req.Answer)
		if answer == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "answer required"})
			return
		}
		if len(answer) > maxAnswerLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "answer too long"})
			return
		}
		hostID, _ := middleware.UserIDFromCtx(c)
		if err := questions.MarkAnswered(qID, hostID, answer); err != nil {
			if errors.Is(err, repo.ErrQuestionNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "question not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to answer"})
			return
		}
		q, err := questions.GetByID(qID, hostID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch question"})
			return
		}
		c.JSON(http.StatusOK, q)
	}
}

// DismissQuestion is host-only. Hides the question without answering.
func DismissQuestion(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, questions *repo.QuestionRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		_, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}
		qID, ok := parseQuestionID(c)
		if !ok {
			return
		}
		if err := questions.MarkDismissed(qID); err != nil {
			if errors.Is(err, repo.ErrQuestionNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "question not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to dismiss"})
			return
		}
		c.Status(http.StatusNoContent)
	}
}
