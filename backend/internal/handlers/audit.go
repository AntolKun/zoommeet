package handlers

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"videoconf-backend/internal/models"
	"videoconf-backend/internal/repo"
)

// emitAudit is the convenience helper that fire-and-forgets an audit entry.
// Failures are logged but don't propagate — a failed audit must never break
// the underlying moderation action.
func emitAudit(audit *repo.AuditRepo, roomID, actorID uint64, actorIsOwner bool, action string, target *string, detail *string) {
	role := models.AuditActorRoleCohost
	if actorIsOwner {
		role = models.AuditActorRoleOwner
	}
	if err := audit.Log(repo.LogAuditInput{
		RoomID:    roomID,
		ActorID:   actorID,
		ActorRole: role,
		Action:    action,
		Target:    target,
		Detail:    detail,
	}); err != nil {
		log.Printf("audit log failed (room=%d actor=%d action=%s): %v", roomID, actorID, action, err)
	}
}

func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

type auditListResponse struct {
	Entries []*auditView `json:"entries"`
}

type auditView struct {
	ID        uint64  `json:"id"`
	ActorID   uint64  `json:"actor_id"`
	ActorName string  `json:"actor_name"`
	ActorRole string  `json:"actor_role"`
	Action    string  `json:"action"`
	Target    *string `json:"target,omitempty"`
	Detail    *string `json:"detail,omitempty"`
	CreatedAt string  `json:"created_at"`
}

// ListAuditLog godoc
// @Summary      List audit log per room
// @Description  Owner only. Return moderation history paling baru duluan (max 200). Tiap entry: actor (siapa), action (lock/mute/kick/recording/cohost/waiting), target opsional, timestamp.
// @Tags         audit
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true   "room id atau slug"
// @Param        limit     query     int     false  "default 200, max 500"
// @Success      200       {object}  auditListResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "bukan owner"
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/audit [get]
func ListAuditLog(rooms *repo.RoomRepo, audit *repo.AuditRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwner(c, rooms)
		if !ok {
			return
		}
		limit := 200
		if v := c.Query("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				if n > 500 {
					n = 500
				}
				limit = n
			}
		}
		entries, err := audit.ListByRoom(room.ID, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list audit"})
			return
		}
		out := make([]*auditView, 0, len(entries))
		for _, e := range entries {
			out = append(out, &auditView{
				ID:        e.ID,
				ActorID:   e.ActorID,
				ActorName: e.ActorName,
				ActorRole: e.ActorRole,
				Action:    e.Action,
				Target:    e.Target,
				Detail:    e.Detail,
				CreatedAt: e.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
			})
		}
		c.JSON(http.StatusOK, auditListResponse{Entries: out})
	}
}
