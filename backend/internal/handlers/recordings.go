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
func StartRecording(rooms *repo.RoomRepo, recordings *repo.RecordingRepo, eg *livekit.EgressClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwner(c, rooms)
		if !ok {
			return
		}

		userID, _ := middleware.UserIDFromCtx(c)

		filepath := fmt.Sprintf("%s/%s.mp4", room.Slug, time.Now().UTC().Format("20060102-150405"))

		info, err := eg.StartRoomComposite(c.Request.Context(), room.Slug, filepath)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "egress: " + err.Error()})
			return
		}

		rec, err := recordings.Create(room.ID, userID, info.EgressID, models.RecordingStatusStarting)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save recording"})
			return
		}

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
func StopRecording(recordings *repo.RecordingRepo, rooms *repo.RoomRepo, eg *livekit.EgressClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		rec, ok := loadRecording(c, recordings)
		if !ok {
			return
		}

		room, err := rooms.GetByID(rec.RoomID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "room lookup failed"})
			return
		}
		userID, _ := middleware.UserIDFromCtx(c)
		if room.OwnerID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "only owner allowed"})
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
func ListRecordings(rooms *repo.RoomRepo, recordings *repo.RecordingRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwner(c, rooms)
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
func GetRecording(recordings *repo.RecordingRepo, rooms *repo.RoomRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		rec, ok := loadRecording(c, recordings)
		if !ok {
			return
		}

		room, err := rooms.GetByID(rec.RoomID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "room lookup failed"})
			return
		}
		userID, _ := middleware.UserIDFromCtx(c)
		if room.OwnerID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "only owner allowed"})
			return
		}

		c.JSON(http.StatusOK, rec)
	}
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
