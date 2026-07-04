package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"videoconf-backend/internal/middleware"
	"videoconf-backend/internal/repo"
	"videoconf-backend/internal/storage"
)

const (
	maxAttachmentBytes = 10 * 1024 * 1024 // 10 MiB — generous but not absurd
)

// Allowlist of MIME types we'll accept for chat attachments. Kept broad enough
// for real-world use (docs, images, PDFs, spreadsheets) but blocks binaries
// / archives that could be used for malware distribution.
var allowedAttachmentTypes = map[string]string{
	"image/png":       "png",
	"image/jpeg":      "jpg",
	"image/webp":      "webp",
	"image/gif":       "gif",
	"application/pdf": "pdf",
	"text/plain":      "txt",
	"text/csv":        "csv",
	"application/vnd.ms-excel":                                                  "xls",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         "xlsx",
	"application/msword":                                                        "doc",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":   "docx",
	"application/vnd.ms-powerpoint":                                             "ppt",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
}

type attachmentResponse struct {
	URL  string `json:"url"`
	Name string `json:"name"`
	Type string `json:"type"`
	Size int64  `json:"size"`
}

// UploadAttachment accepts a multipart form file from an auth user with room
// access. Enforces size + MIME allowlist. The returned URL should be echoed
// back in a subsequent POST /messages so the attachment is linked to a message.
func UploadAttachment(rooms *repo.RoomRepo, store *storage.MinIO) gin.HandlerFunc {
	return func(c *gin.Context) {
		if store == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage not configured"})
			return
		}
		room, ok := RequireRoomAccess(c, rooms)
		if !ok {
			return
		}
		userID, _ := middleware.UserIDFromCtx(c)

		// Cap body reader ahead of parsing so a huge upload can't stall us.
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAttachmentBytes+1024)

		fileHeader, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file field required"})
			return
		}
		if fileHeader.Size > maxAttachmentBytes {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too big (max 10 MiB)"})
			return
		}

		contentType := strings.ToLower(strings.TrimSpace(fileHeader.Header.Get("Content-Type")))
		ext, allowed := allowedAttachmentTypes[contentType]
		if !allowed {
			c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "unsupported file type"})
			return
		}

		f, err := fileHeader.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "open failed"})
			return
		}
		defer f.Close()

		// Object key format: {room_slug}/{user_id}-{random}.{ext}
		// The room prefix makes it easier to bulk-clean when a room is deleted
		// (though we don't have that cascade yet).
		var rnd [8]byte
		if _, err := rand.Read(rnd[:]); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "key gen failed"})
			return
		}
		objectKey := fmt.Sprintf("%s/%d-%s.%s", room.Slug, userID, hex.EncodeToString(rnd[:]), ext)

		url, err := store.PutObject(c.Request.Context(), objectKey, f, storage.PutOptions{
			ContentType: contentType,
			Size:        fileHeader.Size,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "upload failed: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, attachmentResponse{
			URL:  url,
			Name: filepath.Base(fileHeader.Filename),
			Type: contentType,
			Size: fileHeader.Size,
		})
	}
}
