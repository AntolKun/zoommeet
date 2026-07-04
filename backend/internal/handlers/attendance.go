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

const maxAttendanceNameLen = 100
const maxAttendanceIdentityLen = 80

type attendanceJoinRequest struct {
	DisplayName string `json:"display_name" binding:"required"`
	Identity    string `json:"identity" binding:"required"`
}

type attendanceJoinResponse struct {
	ID uint64 `json:"id"`
}

// LogAttendanceJoin godoc
// @Summary      Catat join attendance
// @Description  Dipanggil frontend pas user connect ke LiveKit room. Auth optional — guest juga boleh log (user_id NULL). Return id buat dipakai saat leave. Akses control: butuh room access (private = owner only).
// @Tags         attendance
// @Accept       json
// @Produce      json
// @Param        idOrSlug  path      string                  true  "room id atau slug"
// @Param        request   body      attendanceJoinRequest   true  "display_name + identity dari LiveKit"
// @Success      201       {object}  attendanceJoinResponse
// @Failure      400       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "private + bukan owner"
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/attendance/join [post]
func LogAttendanceJoin(rooms *repo.RoomRepo, attendance *repo.AttendanceRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := lookupRoom(c, rooms)
		if !ok {
			return
		}

		// Match the room-access rules used by the token endpoints: private
		// rooms are owner-only, public rooms are anyone.
		userID, hasAuth := middleware.UserIDFromCtx(c)
		if !room.IsPublic && (!hasAuth || userID != room.OwnerID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "not allowed"})
			return
		}

		var req attendanceJoinRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		name := strings.TrimSpace(req.DisplayName)
		identity := strings.TrimSpace(req.Identity)
		if name == "" || identity == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "display_name and identity required"})
			return
		}
		if len(name) > maxAttendanceNameLen {
			name = name[:maxAttendanceNameLen]
		}
		if len(identity) > maxAttendanceIdentityLen {
			identity = identity[:maxAttendanceIdentityLen]
		}

		var uid *uint64
		if hasAuth {
			u := userID
			uid = &u
		}

		entry, err := attendance.LogJoin(repo.LogJoinInput{
			RoomID:      room.ID,
			UserID:      uid,
			DisplayName: name,
			Identity:    identity,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log attendance"})
			return
		}

		c.JSON(http.StatusCreated, attendanceJoinResponse{ID: entry.ID})
	}
}

// LogAttendanceLeave godoc
// @Summary      Catat leave attendance
// @Description  Pasangan dari /attendance/join — close out entry pas user disconnect. Idempotent — call kedua kali = no-op. Endpoint publik (no auth) supaya guest yang join lewat shared link juga bisa close out.
// @Tags         attendance
// @Param        id  path  int  true  "attendance entry id"
// @Success      204
// @Failure      400  {object}  errorResponse
// @Failure      404  {object}  errorResponse
// @Router       /attendance/{id}/leave [post]
func LogAttendanceLeave(attendance *repo.AttendanceRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}
		// We don't fail if the row's gone or already closed — leave should
		// always succeed from the caller's POV.
		if err := attendance.LogLeave(id); err != nil {
			if !errors.Is(err, repo.ErrAttendanceNotFound) {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log leave"})
				return
			}
		}
		c.Status(http.StatusNoContent)
	}
}

type attendanceListResponse struct {
	Entries []*attendanceView `json:"entries"`
}

type attendanceView struct {
	ID              uint64  `json:"id"`
	UserID          *uint64 `json:"user_id,omitempty"`
	DisplayName     string  `json:"display_name"`
	Identity        string  `json:"identity"`
	JoinedAt        string  `json:"joined_at"`
	LeftAt          *string `json:"left_at,omitempty"`
	DurationSeconds *uint32 `json:"duration_seconds,omitempty"`
}

// ListAttendance godoc
// @Summary      List attendance room
// @Description  Owner / cohost only. Urut paling baru duluan. `left_at` null = participant masih aktif atau missed leave (browser closed mid-session).
// @Tags         attendance
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true  "room id atau slug"
// @Success      200       {object}  attendanceListResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/attendance [get]
func ListAttendance(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, attendance *repo.AttendanceRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}
		entries, err := attendance.ListByRoom(room.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list attendance"})
			return
		}
		out := make([]*attendanceView, 0, len(entries))
		for _, e := range entries {
			view := &attendanceView{
				ID:              e.ID,
				UserID:          e.UserID,
				DisplayName:     e.DisplayName,
				Identity:        e.Identity,
				JoinedAt:        e.JoinedAt.UTC().Format("2006-01-02T15:04:05Z"),
				DurationSeconds: e.DurationSeconds,
			}
			if e.LeftAt != nil {
				s := e.LeftAt.UTC().Format("2006-01-02T15:04:05Z")
				view.LeftAt = &s
			}
			out = append(out, view)
		}
		c.JSON(http.StatusOK, attendanceListResponse{Entries: out})
	}
}
