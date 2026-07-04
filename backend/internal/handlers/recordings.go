package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"videoconf-backend/internal/livekit"
	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/models"
	"videoconf-backend/internal/repo"
)

// StartRecording godoc
// @Summary      Mulai recording room
// @Description  Owner only. Pakai LiveKit Egress room composite (grid layout) → MP4 → upload ke MinIO bucket "recordings". Egress butuh participant aktif — kalau room kosong return 502.
// @Tags         recordings
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true  "room id atau slug"
// @Success      201       {object}  models.Recording  "status: starting"
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "bukan owner"
// @Failure      404       {object}  errorResponse
// @Failure      502       {object}  errorResponse  "Egress error (room kosong, dll)"
// @Router       /rooms/{idOrSlug}/recordings [post]
type startRecordingRequest struct {
	// Optional Egress composition template. "grid" (default), "speaker",
	// "single-speaker". Empty/missing falls back to grid.
	Layout string `json:"layout,omitempty"`
}

var validRecordingLayouts = map[string]bool{
	"":               true, // → grid (default)
	"grid":           true,
	"speaker":        true,
	"single-speaker": true,
}

func StartRecording(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, audit *repo.AuditRepo, recordings *repo.RecordingRepo, eg *livekit.EgressClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}

		userID, _ := middleware.UserIDFromCtx(c)

		var req startRecordingRequest
		// Body optional — empty body is fine, treat as defaults.
		_ = c.ShouldBindJSON(&req)
		if !validRecordingLayouts[req.Layout] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "layout must be 'grid', 'speaker', or 'single-speaker'"})
			return
		}

		filepath := fmt.Sprintf("%s/%s.mp4", room.Slug, time.Now().UTC().Format("20060102-150405"))

		info, err := eg.StartRoomComposite(c.Request.Context(), room.Slug, filepath, req.Layout)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "egress: " + err.Error()})
			return
		}

		rec, err := recordings.Create(room.ID, userID, info.EgressID, models.RecordingStatusStarting)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save recording"})
			return
		}

		emitAudit(audit, room.ID, userID, userID == room.OwnerID,
			models.AuditActionRecordingStarted, stringPtr(strconv.FormatUint(rec.ID, 10)), nil)

		c.JSON(http.StatusCreated, rec)
	}
}

// StopRecording godoc
// @Summary      Stop recording
// @Description  Owner only (cek via room.owner_id). Backend call Egress stop, update status ke "ending". Status jadi "complete" pas file selesai upload (sekarang manual update — webhook auto-update bisa di-add nanti).
// @Tags         recordings
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true  "recording id"
// @Success      200  {object}  models.Recording
// @Failure      400  {object}  errorResponse
// @Failure      401  {object}  errorResponse
// @Failure      403  {object}  errorResponse
// @Failure      404  {object}  errorResponse
// @Failure      502  {object}  errorResponse
// @Router       /recordings/{id}/stop [post]
func StopRecording(recordings *repo.RecordingRepo, rooms *repo.RoomRepo, cohosts *repo.CohostRepo, audit *repo.AuditRepo, eg *livekit.EgressClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		rec, ok := loadRecording(c, recordings)
		if !ok {
			return
		}

		room, ok := canManageRecordingRoomWithRef(c, rec.RoomID, rooms, cohosts)
		if !ok {
			return
		}

		if _, err := eg.Stop(c.Request.Context(), rec.EgressID); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "egress: " + err.Error()})
			return
		}

		if err := recordings.UpdateStatus(rec.ID, models.RecordingStatusEnding); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update status"})
			return
		}

		actorID, _ := middleware.UserIDFromCtx(c)
		emitAudit(audit, room.ID, actorID, actorID == room.OwnerID,
			models.AuditActionRecordingStopped, stringPtr(strconv.FormatUint(rec.ID, 10)), nil)

		updated, _ := recordings.GetByID(rec.ID)
		c.JSON(http.StatusOK, updated)
	}
}

// ListRecordings godoc
// @Summary      List recording per room
// @Description  Owner only. Urut paling baru duluan (DESC by started_at).
// @Tags         recordings
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true  "room id atau slug"
// @Success      200       {object}  recordingsListResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/recordings [get]
func ListRecordings(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, recordings *repo.RecordingRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}

		list, err := recordings.ListByRoom(room.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list recordings"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"recordings": list})
	}
}

// GetRecording godoc
// @Summary      Detail recording
// @Description  Owner only.
// @Tags         recordings
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true  "recording id"
// @Success      200  {object}  models.Recording
// @Failure      400  {object}  errorResponse
// @Failure      401  {object}  errorResponse
// @Failure      403  {object}  errorResponse
// @Failure      404  {object}  errorResponse
// @Router       /recordings/{id} [get]
func GetRecording(recordings *repo.RecordingRepo, rooms *repo.RoomRepo, cohosts *repo.CohostRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		rec, ok := loadRecording(c, recordings)
		if !ok {
			return
		}

		if _, ok := canManageRecordingRoomWithRef(c, rec.RoomID, rooms, cohosts); !ok {
			return
		}

		c.JSON(http.StatusOK, rec)
	}
}

// canManageRecordingRoomWithRef verifies the auth user is owner OR cohost of
// the recording's room and returns a roomRef so the caller can pass it to
// emitAudit. Writes 403/500 response on failure.
func canManageRecordingRoomWithRef(c *gin.Context, roomID uint64, rooms *repo.RoomRepo, cohosts *repo.CohostRepo) (*roomRef, bool) {
	room, err := rooms.GetByID(roomID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "room lookup failed"})
		return nil, false
	}
	userID, _ := middleware.UserIDFromCtx(c)
	if room.OwnerID == userID {
		return &roomRef{ID: room.ID, Slug: room.Slug, OwnerID: room.OwnerID}, true
	}
	isCohost, err := cohosts.IsCohost(room.ID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "permission check failed"})
		return nil, false
	}
	if !isCohost {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owner or cohost allowed"})
		return nil, false
	}
	return &roomRef{ID: room.ID, Slug: room.Slug, OwnerID: room.OwnerID}, true
}

func loadRecording(c *gin.Context, recordings *repo.RecordingRepo) (*models.Recording, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return nil, false
	}
	rec, err := recordings.GetByID(id)
	if errors.Is(err, repo.ErrRecordingNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "recording not found"})
		return nil, false
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
		return nil, false
	}
	return rec, true
}
