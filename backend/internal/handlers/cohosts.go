package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/models"
	"videoconf-backend/internal/repo"
)

type cohostsListResponse struct {
	Cohosts []cohostView `json:"cohosts"`
}

type cohostView struct {
	UserID      uint64 `json:"user_id"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
	GrantedAt   string `json:"granted_at"`
}

// ListCohosts godoc
// @Summary      List co-host room
// @Description  Siapa pun yang punya akses room bisa lihat daftar co-host. Useful buat UI nampilin badge "co-host".
// @Tags         cohosts
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true  "room id atau slug"
// @Success      200       {object}  cohostsListResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "private dan bukan owner"
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/cohosts [get]
func ListCohosts(rooms *repo.RoomRepo, cohosts *repo.CohostRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := RequireRoomAccess(c, rooms)
		if !ok {
			return
		}
		list, err := cohosts.ListByRoom(room.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list cohosts"})
			return
		}
		out := make([]cohostView, 0, len(list))
		for _, ch := range list {
			out = append(out, cohostView{
				UserID:      ch.UserID,
				DisplayName: ch.DisplayName,
				Email:       ch.Email,
				GrantedAt:   ch.GrantedAt.UTC().Format("2006-01-02T15:04:05Z"),
			})
		}
		c.JSON(http.StatusOK, cohostsListResponse{Cohosts: out})
	}
}

type addCohostRequest struct {
	UserID uint64 `json:"user_id" binding:"required"`
}

// AddCohost godoc
// @Summary      Tambah co-host
// @Description  Owner only. Promote authenticated user jadi co-host — bisa pakai host controls (lock, mute, kick, manage waiting room, recording). Owner sendiri implicit, gak perlu di-add. Promote user yang udah jadi cohost = no-op (idempotent).
// @Tags         cohosts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        idOrSlug  path  string            true  "room id atau slug"
// @Param        request   body  addCohostRequest  true  "user_id yang mau dipromote"
// @Success      200       {object}  map[string]bool
// @Failure      400       {object}  errorResponse  "user_id kosong / owner sendiri / user gak ada"
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "bukan owner"
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/cohosts [post]
func AddCohost(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, audit *repo.AuditRepo, users *repo.UserRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := lookupRoom(c, rooms)
		if !ok {
			return
		}
		ownerID, _ := middleware.UserIDFromCtx(c)
		if room.OwnerID != ownerID {
			c.JSON(http.StatusForbidden, gin.H{"error": "only owner can add cohost"})
			return
		}

		var req addCohostRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.UserID == room.OwnerID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "owner is already host, cannot be added as cohost"})
			return
		}
		// Verify target user exists (FK would also catch this, but explicit 400 is clearer).
		if _, err := users.GetByID(req.UserID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "user not found"})
			return
		}

		added, err := cohosts.Add(room.ID, req.UserID, &ownerID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add cohost"})
			return
		}
		if added {
			emitAudit(audit, room.ID, ownerID, true,
				models.AuditActionCohostAdded, stringPtr(strconv.FormatUint(req.UserID, 10)), nil)
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "added": added})
	}
}

// RemoveCohost godoc
// @Summary      Cabut co-host
// @Description  Owner only. Cabut privilege co-host dari user. Owner sendiri gak bisa di-cabut (implicit). Cabut user yang bukan cohost = 404.
// @Tags         cohosts
// @Security     BearerAuth
// @Param        idOrSlug  path  string  true  "room id atau slug"
// @Param        userID    path  int     true  "user id yang mau di-cabut"
// @Success      204
// @Failure      401  {object}  errorResponse
// @Failure      403  {object}  errorResponse  "bukan owner"
// @Failure      404  {object}  errorResponse  "room atau cohost gak ada"
// @Router       /rooms/{idOrSlug}/cohosts/{userID} [delete]
func RemoveCohost(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, audit *repo.AuditRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := lookupRoom(c, rooms)
		if !ok {
			return
		}
		ownerID, _ := middleware.UserIDFromCtx(c)
		if room.OwnerID != ownerID {
			c.JSON(http.StatusForbidden, gin.H{"error": "only owner can remove cohost"})
			return
		}

		targetID, err := strconv.ParseUint(c.Param("userID"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
			return
		}
		if err := cohosts.Remove(room.ID, targetID); err != nil {
			if errors.Is(err, repo.ErrCohostNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "not a cohost"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove cohost"})
			return
		}
		emitAudit(audit, room.ID, ownerID, true,
			models.AuditActionCohostRemoved, stringPtr(strconv.FormatUint(targetID, 10)), nil)
		c.Status(http.StatusNoContent)
	}
}
