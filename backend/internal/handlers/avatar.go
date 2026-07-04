package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/repo"
	"videoconf-backend/internal/storage"
)

const (
	maxAvatarBytes = 2 * 1024 * 1024 // 2 MiB — plenty for a head-and-shoulders crop
)

// mimeToExt maps an upload's MIME type to the file extension we'll store the
// object under. Any other content-type is rejected.
var mimeToExt = map[string]string{
	"image/png":  "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
}

type avatarResponse struct {
	AvatarURL string `json:"avatar_url"`
}

// UploadAvatar godoc
// @Summary      Upload avatar
// @Description  Auth user only. Multipart upload field "avatar". PNG / JPEG / WebP, max 2 MiB. Stored di MinIO bucket "avatars" sebagai {user_id}-{random}.{ext}. Bucket policy public-read so the URL is fetchable. Replaces existing avatar atomically — old object stays in bucket sebagai garbage (cleanup job belum ada).
// @Tags         users
// @Security     BearerAuth
// @Accept       mpfd
// @Produce      json
// @Param        avatar  formData  file  true  "image file (max 2 MiB)"
// @Success      200     {object}  avatarResponse
// @Failure      400     {object}  errorResponse
// @Failure      401     {object}  errorResponse
// @Failure      413     {object}  errorResponse  "file too big"
// @Failure      415     {object}  errorResponse  "unsupported mime type"
// @Failure      503     {object}  errorResponse  "storage not configured"
// @Router       /users/me/avatar [post]
func UploadAvatar(users *repo.UserRepo, store *storage.MinIO) gin.HandlerFunc {
	return func(c *gin.Context) {
		if store == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage not configured"})
			return
		}
		userID, ok := middleware.UserIDFromCtx(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		// Cap the body before even calling FormFile so a massive upload doesn't
		// stall the goroutine reading it.
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAvatarBytes+1024)

		fileHeader, err := c.FormFile("avatar")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "avatar file required (multipart field 'avatar')"})
			return
		}
		if fileHeader.Size > maxAvatarBytes {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too big (max 2 MiB)"})
			return
		}

		// Sniff content type from header rather than trusting the form value.
		contentType := strings.ToLower(strings.TrimSpace(fileHeader.Header.Get("Content-Type")))
		ext, supported := mimeToExt[contentType]
		if !supported {
			c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "unsupported type (png/jpeg/webp only)"})
			return
		}

		f, err := fileHeader.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "open failed"})
			return
		}
		defer f.Close()

		// Object key: {user_id}-{random_hex}.{ext} — random suffix means a
		// re-upload doesn't collide with a cached old avatar at the same URL.
		var rnd [6]byte
		if _, err := rand.Read(rnd[:]); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "key gen failed"})
			return
		}
		objectKey := fmt.Sprintf("%d-%s.%s", userID, hex.EncodeToString(rnd[:]), ext)

		url, err := store.PutObject(c.Request.Context(), objectKey, f, storage.PutOptions{
			ContentType: contentType,
			Size:        fileHeader.Size,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "upload failed: " + err.Error()})
			return
		}

		if err := users.SetAvatarURL(userID, url); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save avatar"})
			return
		}

		c.JSON(http.StatusOK, avatarResponse{AvatarURL: url})
	}
}

// GetMe godoc
// @Summary      Detail user yang lagi login
// @Description  Return current user lengkap dengan avatar_url. Frontend pakai pas reload buat refresh state user.
// @Tags         users
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  models.User
// @Failure      401  {object}  errorResponse
// @Router       /users/me [get]
func GetMe(users *repo.UserRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := middleware.UserIDFromCtx(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		u, err := users.GetByID(userID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusOK, u)
	}
}

// GetMyPMR returns the requesting user's Personal Meeting Room, lazy-creating
// it on first call. Slug pattern: `pmr-<userID>` for a stable, shareable URL.
func GetMyPMR(users *repo.UserRepo, rooms *repo.RoomRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := middleware.UserIDFromCtx(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		u, err := users.GetByID(userID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}

		// If the user already has a PMR pointer AND the room still exists,
		// hand it straight back. Otherwise lazy-create a new room and update
		// the pointer (orphaned pointers may exist if the user manually deleted
		// their PMR room from the dashboard).
		if u.PMRRoomID != nil {
			if room, err := rooms.GetByID(*u.PMRRoomID); err == nil {
				c.JSON(http.StatusOK, room)
				return
			}
		}

		slug := pmrSlugFor(userID)
		// Best-effort name. The user can rename later via a regular update flow.
		name := "Personal Meeting Room"
		if u.DisplayName != "" {
			name = u.DisplayName + "'s Room"
		}

		room, err := rooms.Create(repo.CreateRoomInput{
			Slug:     slug,
			Name:     name,
			OwnerID:  userID,
			IsPublic: true,
		})
		if err != nil {
			// On slug collision (e.g. another user grabbed it earlier), surface
			// the underlying room — different users shouldn't collide because
			// the slug includes their user id, but lookup is the safe path.
			if existing, lookupErr := rooms.GetBySlug(slug); lookupErr == nil && existing.OwnerID == userID {
				_ = users.SetPMRRoomID(userID, &existing.ID)
				c.JSON(http.StatusOK, existing)
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create personal room"})
			return
		}

		if err := users.SetPMRRoomID(userID, &room.ID); err != nil {
			// Room exists and is usable; the pointer just won't persist. Log and
			// move on — next call will re-create the pointer.
			c.JSON(http.StatusOK, room)
			return
		}
		c.JSON(http.StatusOK, room)
	}
}

func pmrSlugFor(userID uint64) string {
	return "pmr-" + strconv.FormatUint(userID, 10)
}
