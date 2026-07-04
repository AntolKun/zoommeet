package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/lithammer/shortuuid/v4"

	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/repo"
)

const (
	maxBreakoutCount   = 20
	maxBreakoutNameLen = 150
)

type createBreakoutsRequest struct {
	// Either Count (auto-named "Breakout 1..N") or Names (explicit). Names
	// takes precedence when both are supplied.
	Count uint32   `json:"count"`
	Names []string `json:"names"`
}

type createBreakoutsResponse struct {
	Breakouts []breakoutView `json:"breakouts"`
}

type breakoutView struct {
	ID           uint64 `json:"id"`
	ParentRoomID uint64 `json:"parent_room_id"`
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	CreatedAt    string `json:"created_at"`
	ClosedAt     string `json:"closed_at,omitempty"`
}

// CreateBreakouts godoc
// @Summary      Bikin N breakout rooms
// @Description  Host (owner/cohost) only. Bikin N breakout dengan slug auto-generated. Pakai `count` buat auto-name "Breakout 1..N", atau `names` buat custom names. Max 20.
// @Tags         breakouts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        idOrSlug  path      string                  true  "parent room id atau slug"
// @Param        request   body      createBreakoutsRequest  true  "count atau names"
// @Success      201       {object}  createBreakoutsResponse
// @Failure      400       {object}  errorResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/breakouts [post]
func CreateBreakouts(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, breakouts *repo.BreakoutRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}

		var req createBreakoutsRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Resolve names list — explicit `names` wins, else generate from count.
		var names []string
		if len(req.Names) > 0 {
			for _, n := range req.Names {
				trimmed := strings.TrimSpace(n)
				if trimmed == "" {
					continue
				}
				if len(trimmed) > maxBreakoutNameLen {
					trimmed = trimmed[:maxBreakoutNameLen]
				}
				names = append(names, trimmed)
			}
		} else if req.Count > 0 {
			for i := uint32(1); i <= req.Count; i++ {
				names = append(names, fmt.Sprintf("Breakout %d", i))
			}
		}
		if len(names) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "need count > 0 or non-empty names"})
			return
		}
		if len(names) > maxBreakoutCount {
			c.JSON(http.StatusBadRequest, gin.H{"error": "max 20 breakouts per request"})
			return
		}

		userID, _ := middleware.UserIDFromCtx(c)
		out := make([]breakoutView, 0, len(names))
		for _, name := range names {
			b, err := breakouts.Create(repo.CreateBreakoutInput{
				ParentRoomID: room.ID,
				Slug:         "bo-" + shortuuid.New()[:10],
				Name:         name,
				CreatedBy:    userID,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create breakout: " + err.Error()})
				return
			}
			out = append(out, breakoutView{
				ID:           b.ID,
				ParentRoomID: b.ParentRoomID,
				Slug:         b.Slug,
				Name:         b.Name,
				CreatedAt:    b.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
			})
		}

		c.JSON(http.StatusCreated, createBreakoutsResponse{Breakouts: out})
	}
}

// ListBreakouts godoc
// @Summary      List open breakouts untuk parent room
// @Description  Owner / cohost only. Return semua breakout yang belum di-close, oldest first.
// @Tags         breakouts
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true  "parent room id atau slug"
// @Success      200       {object}  createBreakoutsResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/breakouts [get]
func ListBreakouts(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, breakouts *repo.BreakoutRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}
		list, err := breakouts.ListOpenByParent(room.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list breakouts"})
			return
		}
		out := make([]breakoutView, 0, len(list))
		for _, b := range list {
			out = append(out, breakoutView{
				ID:           b.ID,
				ParentRoomID: b.ParentRoomID,
				Slug:         b.Slug,
				Name:         b.Name,
				CreatedAt:    b.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
			})
		}
		c.JSON(http.StatusOK, createBreakoutsResponse{Breakouts: out})
	}
}

// CloseAllBreakouts godoc
// @Summary      Tutup semua breakout
// @Description  Owner / cohost only. Mark semua breakout yang masih open di-close. Frontend bisa pakai sebagai sinyal recall semua peserta.
// @Tags         breakouts
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true  "parent room id atau slug"
// @Success      200       {object}  map[string]int64
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/breakouts/close [post]
func CloseAllBreakouts(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, breakouts *repo.BreakoutRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}
		n, err := breakouts.CloseAllForParent(room.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "close failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"closed": n})
	}
}
