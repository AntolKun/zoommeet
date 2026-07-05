package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/lithammer/shortuuid/v4"

	"videoconf-backend/internal/config"
	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/models"
	"videoconf-backend/internal/repo"
)

// Polling status codes returned to the waiting guest. These mirror the DB
// status values but are kept separate so the wire format and storage format
// can evolve independently.
const (
	waitingRespPending  = "pending"
	waitingRespApproved = "approved"
	waitingRespDenied   = "denied"
)

type waitingStatusResponse struct {
	Status string `json:"status"`
	// Filled only when status == "approved" so the guest can connect.
	Token string `json:"token,omitempty"`
	URL   string `json:"url,omitempty"`
	Room  string `json:"room,omitempty"`
}

// WaitingStatus godoc
// @Summary      Polling status waiting request
// @Description  Endpoint publik (gak butuh auth). Klien yang lagi nunggu di waiting room polling endpoint ini pakai request_token yang didapat dari /token atau /guest-token. Status: pending = masih nunggu owner. approved = token + url terisi, langsung connect ke LiveKit. denied = ditolak.
// @Tags         waiting
// @Produce      json
// @Param        token  path      string  true  "request_token dari response /token atau /guest-token"
// @Success      200    {object}  waitingStatusResponse
// @Failure      404    {object}  errorResponse  "request_token gak valid / expired"
// @Router       /waiting/{token}/status [get]
func WaitingStatus(cfg *config.Config, rooms *repo.RoomRepo, waiting *repo.WaitingRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Param("token")
		wr, err := waiting.GetByToken(token)
		if err != nil {
			if errors.Is(err, repo.ErrWaitingRequestNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "waiting request not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
			return
		}

		switch wr.Status {
		case models.WaitingStatusPending:
			c.JSON(http.StatusOK, waitingStatusResponse{Status: waitingRespPending})
		case models.WaitingStatusApproved:
			room, err := rooms.GetByID(wr.RoomID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "room lookup failed"})
				return
			}
			c.JSON(http.StatusOK, waitingStatusResponse{
				Status: waitingRespApproved,
				Token:  wr.LiveKitToken,
				URL:    cfg.LiveKitWSURL,
				Room:   room.Slug,
			})
		case models.WaitingStatusDenied:
			c.JSON(http.StatusOK, waitingStatusResponse{Status: waitingRespDenied})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "unknown waiting status"})
		}
	}
}

type waitingListResponse struct {
	Requests []*models.WaitingRequest `json:"requests"`
}

// ListWaitingRequests godoc
// @Summary      List pending waiting requests
// @Description  Owner only. Return semua waiting request yang status="pending" untuk room, urut paling lama duluan (FIFO).
// @Tags         waiting
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path      string  true  "room id atau slug"
// @Success      200       {object}  waitingListResponse
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "bukan owner"
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/waiting [get]
func ListWaitingRequests(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, waiting *repo.WaitingRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}
		list, err := waiting.ListPending(room.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list waiting requests"})
			return
		}
		c.JSON(http.StatusOK, waitingListResponse{Requests: list})
	}
}

// AdmitWaiting godoc
// @Summary      Admit waiting request
// @Description  Owner only. Generate LiveKit token untuk waiting request, simpan ke DB, status berubah jadi "approved". Guest yang lagi polling status akan langsung dapat token dan auto-connect.
// @Tags         waiting
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path  string  true  "room id atau slug"
// @Param        id        path  int     true  "waiting request id"
// @Success      200       {object}  map[string]bool
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "bukan owner"
// @Failure      404       {object}  errorResponse  "room / request gak ada"
// @Failure      409       {object}  errorResponse  "request udah pernah di-decide (approved/denied)"
// @Router       /rooms/{idOrSlug}/waiting/{id}/admit [post]
func AdmitWaiting(cfg *config.Config, rooms *repo.RoomRepo, cohosts *repo.CohostRepo, audit *repo.AuditRepo, waiting *repo.WaitingRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}
		wr, ok := lookupWaitingForRoom(c, waiting, room.ID)
		if !ok {
			return
		}
		if wr.Status != models.WaitingStatusPending {
			c.JSON(http.StatusConflict, gin.H{"error": "waiting request already decided"})
			return
		}

		// Identity follows the same rule as the original request:
		// - Authenticated user: their user.id (string form)
		// - Guest: random "guest_xxxx" per admission
		var identity string
		if wr.UserID != nil {
			identity = strconv.FormatUint(*wr.UserID, 10)
		} else {
			identity = "guest_" + shortuuid.New()[:8]
		}

		// Admitted from waiting room → always audience in webinar mode.
		canPublish := !room.IsWebinar
		token, err := buildLiveKitToken(cfg, room.Slug, identity, wr.DisplayName, canPublish)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
			return
		}
		if err := waiting.Approve(wr.ID, token); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "approve failed"})
			return
		}
		actorID, _ := middleware.UserIDFromCtx(c)
		emitAudit(audit, room.ID, actorID, actorID == room.OwnerID,
			models.AuditActionWaitingAdmitted, stringPtr(wr.DisplayName), nil)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// DenyWaiting godoc
// @Summary      Deny waiting request
// @Description  Owner only. Tolak waiting request, status berubah jadi "denied". Guest yang polling akan lihat status denied dan dapet feedback ditolak.
// @Tags         waiting
// @Security     BearerAuth
// @Produce      json
// @Param        idOrSlug  path  string  true  "room id atau slug"
// @Param        id        path  int     true  "waiting request id"
// @Success      200       {object}  map[string]bool
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "bukan owner"
// @Failure      404       {object}  errorResponse
// @Failure      409       {object}  errorResponse  "request udah pernah di-decide"
// @Router       /rooms/{idOrSlug}/waiting/{id}/deny [post]
func DenyWaiting(rooms *repo.RoomRepo, cohosts *repo.CohostRepo, audit *repo.AuditRepo, waiting *repo.WaitingRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwnerOrCohost(c, rooms, cohosts)
		if !ok {
			return
		}
		wr, ok := lookupWaitingForRoom(c, waiting, room.ID)
		if !ok {
			return
		}
		if wr.Status != models.WaitingStatusPending {
			c.JSON(http.StatusConflict, gin.H{"error": "waiting request already decided"})
			return
		}
		if err := waiting.Deny(wr.ID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "deny failed"})
			return
		}
		actorID, _ := middleware.UserIDFromCtx(c)
		emitAudit(audit, room.ID, actorID, actorID == room.OwnerID,
			models.AuditActionWaitingDenied, stringPtr(wr.DisplayName), nil)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

type toggleWaitingRoomRequest struct {
	Enabled bool `json:"enabled"`
}

// ToggleWaitingRoom godoc
// @Summary      Toggle waiting room on/off untuk room
// @Description  Owner only. Aktifkan/nonaktifkan waiting room. Kalau dinonaktifkan, request pending yang udah ada gak otomatis di-admit — owner harus admit manual atau request akan dianggap stale.
// @Tags         waiting
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        idOrSlug  path  string                    true  "room id atau slug"
// @Param        request   body  toggleWaitingRoomRequest  true  "enabled"
// @Success      200       {object}  map[string]bool
// @Failure      401       {object}  errorResponse
// @Failure      403       {object}  errorResponse  "bukan owner"
// @Failure      404       {object}  errorResponse
// @Router       /rooms/{idOrSlug}/waiting-room [post]
func ToggleWaitingRoom(rooms *repo.RoomRepo, audit *repo.AuditRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		room, ok := requireOwner(c, rooms)
		if !ok {
			return
		}
		var req toggleWaitingRoomRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := rooms.SetWaitingRoom(room.ID, req.Enabled); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update"})
			return
		}
		actorID, _ := middleware.UserIDFromCtx(c)
		detail := "off"
		if req.Enabled {
			detail = "on"
		}
		emitAudit(audit, room.ID, actorID, true,
			models.AuditActionWaitingRoomToggled, nil, stringPtr(detail))
		c.JSON(http.StatusOK, gin.H{"waiting_room_enabled": req.Enabled})
	}
}

// lookupWaitingForRoom resolves the waiting request from the URL `id` param,
// verifies it belongs to the given room, and writes an error response on
// failure (404 for missing or mismatched room).
func lookupWaitingForRoom(c *gin.Context, waiting *repo.WaitingRepo, roomID uint64) (*models.WaitingRequest, bool) {
	reqID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid waiting request id"})
		return nil, false
	}
	wr, err := waiting.GetByID(reqID)
	if err != nil {
		if errors.Is(err, repo.ErrWaitingRequestNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "waiting request not found"})
			return nil, false
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
		return nil, false
	}
	if wr.RoomID != roomID {
		// Don't leak existence of waiting requests across rooms.
		c.JSON(http.StatusNotFound, gin.H{"error": "waiting request not found"})
		return nil, false
	}
	return wr, true
}
