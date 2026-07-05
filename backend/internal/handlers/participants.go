package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"videoconf-backend/internal/livekit"
	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/models"
	"videoconf-backend/internal/repo"
)

// ListParticipants godoc
// @Summary      List participant aktif di room
// @Description  Owner only. Live state dari LiveKit RoomService — bukan dari DB. Identity tiap participant = app user.id (string).
// @Tags         host-controls
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true  "room id atau slug"
// @Success      200       {object}  participantsListResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "bukan owner"
// @Failure      404       {object}  errorResponse
// @Failure      502       {object}  errorResponse  "LiveKit unreachable"
// @Router       /rooms/{idOrSlug}/participants [get]
func ListParticipants(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, lk *livekit.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}

		list, err := lk.ListParticipants(c.Request.Context(), room.Slug)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "livekit: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"participants": list})
	}
}

type muteRequest struct {
	Source string `json:"source"` // "audio" | "video" | "" (all)
	Muted  bool   `json:"muted"`
}

// MuteParticipant godoc
// @Summary      Mute / unmute track participant
// @Description  Owner only. Backend list track participant, filter by source, terus call LiveKit MutePublishedTrack per track yang match. Source kosong = semua track.
// @Tags         host-controls
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        idOrSlug  path      string       true  "room id atau slug"
// @Param        identity  path      string       true  "identity participant (= app user.id)"
// @Param        request   body      muteRequest  true  "source: audio|video|empty, muted: bool"
// @Success      200       {object}  muteResponse
// @Failure      400       {object}  errorResponse  "source value invalid"
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "bukan owner"
// @Failure      404       {object}  errorResponse  "participant gak connect"
// @Failure      502       {object}  errorResponse  "LiveKit error"
// @Router       /rooms/{idOrSlug}/participants/{identity}/mute [post]
func MuteParticipant(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, audit *repo.AuditRepo, lk *livekit.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}

		identity := c.Param("identity")
		if identity == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "identity required"})
			return
		}

		var req muteRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.Source != "" && req.Source != "audio" && req.Source != "video" && req.Source != "screen_share" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "source must be 'audio', 'video', 'screen_share', or empty"})
			return
		}

		count, err := lk.MuteParticipant(c.Request.Context(), room.Slug, identity, req.Source, req.Muted)
		if err != nil {
			if errors.Is(err, livekit.ErrParticipantNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
				return
			}
			c.JSON(http.StatusBadGateway, gin.H{"error": "livekit: " + err.Error()})
			return
		}

		actorID, _ := middleware.UserIDFromCtx(c)
		source := req.Source
		if source == "" {
			source = "all"
		}
		detail := source
		if !req.Muted {
			detail = "unmuted:" + source
		}
		emitAudit(audit, room.ID, actorID, actorID == room.OwnerID,
			models.AuditActionParticipantMuted, stringPtr(identity), stringPtr(detail))

		c.JSON(http.StatusOK, gin.H{"muted_tracks": count})
	}
}

// KickParticipant godoc
// @Summary      Kick participant dari room
// @Description  Owner only. Forced disconnect via LiveKit. Participant bisa rejoin kalau room masih unlocked — kombinasi lock+kick untuk benar-benar exclude.
// @Tags         host-controls
// @Security     BearerAuth
// @Param        idOrSlug  path  string  true  "room id atau slug"
// @Param        identity  path  string  true  "identity participant"
// @Success      204
// @Failure      401  {object}  errorResponse
// @Failure      403  {object}  errorResponse
// @Failure      404  {object}  errorResponse
// @Failure      502  {object}  errorResponse
// @Router       /rooms/{idOrSlug}/participants/{identity} [delete]
func KickParticipant(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, audit *repo.AuditRepo, lk *livekit.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}

		identity := c.Param("identity")
		if identity == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "identity required"})
			return
		}

		if err := lk.RemoveParticipant(c.Request.Context(), room.Slug, identity); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "livekit: " + err.Error()})
			return
		}

		actorID, _ := middleware.UserIDFromCtx(c)
		emitAudit(audit, room.ID, actorID, actorID == room.OwnerID,
			models.AuditActionParticipantKicked, stringPtr(identity), nil)

		c.Status(http.StatusNoContent)
	}
}

// LockRoom godoc
// @Summary      Lock room
// @Description  Owner only. Locked = /api/token reject non-owner. Tidak ngusir participant yang udah connect — kombinasi dengan kick untuk evict semua.
// @Tags         host-controls
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true  "room id atau slug"
// @Success      200       {object}  lockResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/lock [post]
func LockRoom(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, audit *repo.AuditRepo) gin.HandlerFunc {
	return setLocked(rooms, cohosts, audit, true)
}

// UnlockRoom godoc
// @Summary      Unlock room
// @Description  Owner only. Restore akses non-owner ke /api/token (kalau room public).
// @Tags         host-controls
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true  "room id atau slug"
// @Success      200       {object}  lockResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/unlock [post]
func UnlockRoom(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, audit *repo.AuditRepo) gin.HandlerFunc {
	return setLocked(rooms, cohosts, audit, false)
}

func setLocked(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, audit *repo.AuditRepo, locked bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}
		if err := rooms.SetLocked(room.ID, locked); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update lock"})
			return
		}
		actorID, _ := middleware.UserIDFromCtx(c)
		action := models.AuditActionRoomUnlocked
		if locked {
			action = models.AuditActionRoomLocked
		}
		emitAudit(audit, room.ID, actorID, actorID == room.OwnerID, action, nil, nil)

		c.JSON(http.StatusOK, gin.H{"is_locked": locked})
	}
}

// requireOwner looks up the room and ensures the auth user is the owner.
// Writes an error response and returns ok=false on failure.
func requireOwner(c *gin.Context, rooms *repo.RoomRepo) (*roomRef, bool) {
	room, ok := lookupRoom(c, rooms)
	if !ok {
		return nil, false
	}
	userID, _ := middleware.UserIDFromCtx(c)
	if room.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owner allowed"})
		return nil, false
	}
	return &roomRef{ID: room.ID, Slug: room.Slug, OwnerID: room.OwnerID, IsWebinar: room.IsWebinar}, true
}

// requireOwnerOrCohost is the relaxed variant used for shared host controls
// (lock, mute, kick, recording, waiting room admit/deny). Owner OR any cohost
// passes; everyone else gets 403.
func requireOwnerOrCohost(c *gin.Context, rooms *repo.RoomRepo, cohosts *repo.CohostRepo) (*roomRef, bool) {
	room, ok := lookupRoom(c, rooms)
	if !ok {
		return nil, false
	}
	userID, _ := middleware.UserIDFromCtx(c)
	if room.OwnerID == userID {
		return &roomRef{ID: room.ID, Slug: room.Slug, OwnerID: room.OwnerID, IsWebinar: room.IsWebinar}, true
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
	return &roomRef{ID: room.ID, Slug: room.Slug, OwnerID: room.OwnerID, IsWebinar: room.IsWebinar}, true
}

type roomRef struct {
	ID        uint64
	Slug      string
	OwnerID   uint64
	IsWebinar bool
}
