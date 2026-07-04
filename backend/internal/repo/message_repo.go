package repo

import (
	"database/sql"
	"errors"

	"videoconf-backend/internal/models"
)

var (
	ErrMessageNotFound = errors.New("message not found")
	ErrMessageDeleted  = errors.New("message already deleted")
)

type MessageRepo struct {
	db *sql.DB
}

func NewMessageRepo(db *sql.DB) *MessageRepo {
	return &MessageRepo{db: db}
}

// Selects message + sender display_name + recipient display_name (nullable).
// LEFT JOIN on recipient since DMs have a value, public messages don't.
const messageSelectQuery = `
	SELECT m.id, m.room_id, m.sender_id, m.recipient_id, m.body,
	       m.attachment_url, m.attachment_name, m.attachment_type, m.attachment_size,
	       m.reply_to_message_id, m.is_pinned,
	       m.edited_at, m.deleted_at, m.created_at,
	       us.display_name AS sender_name,
	       COALESCE(ur.display_name, '') AS recipient_name,
	       COALESCE(rm.body, '') AS reply_to_body,
	       COALESCE(rus.display_name, '') AS reply_to_sender
	FROM messages m
	JOIN users us ON us.id = m.sender_id
	LEFT JOIN users ur ON ur.id = m.recipient_id
	LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
	LEFT JOIN users rus ON rus.id = rm.sender_id`

func scanMessage(row interface{ Scan(...any) error }, m *models.Message) error {
	var recipientID sql.NullInt64
	var attURL, attName, attType sql.NullString
	var attSize sql.NullInt64
	var replyToID sql.NullInt64
	var replyToBody, replyToSender string
	if err := row.Scan(
		&m.ID, &m.RoomID, &m.SenderID, &recipientID, &m.Body,
		&attURL, &attName, &attType, &attSize,
		&replyToID, &m.IsPinned,
		&m.EditedAt, &m.DeletedAt, &m.CreatedAt,
		&m.SenderName, &m.RecipientName,
		&replyToBody, &replyToSender,
	); err != nil {
		return err
	}
	if recipientID.Valid {
		u := uint64(recipientID.Int64)
		m.RecipientID = &u
	}
	if attURL.Valid {
		s := attURL.String
		m.AttachmentURL = &s
	}
	if attName.Valid {
		s := attName.String
		m.AttachmentName = &s
	}
	if attType.Valid {
		s := attType.String
		m.AttachmentType = &s
	}
	if attSize.Valid {
		s := uint64(attSize.Int64)
		m.AttachmentSize = &s
	}
	if replyToID.Valid {
		u := uint64(replyToID.Int64)
		m.ReplyToMessageID = &u
		if replyToBody != "" {
			m.ReplyToBody = &replyToBody
		}
		if replyToSender != "" {
			m.ReplyToSender = &replyToSender
		}
	}
	return nil
}

// CreateInput bundles all fields when creating a message so the signature
// doesn't balloon with each new attribute.
type CreateMessageInput struct {
	RoomID           uint64
	SenderID         uint64
	RecipientID      *uint64
	Body             string
	AttachmentURL    *string
	AttachmentName   *string
	AttachmentType   *string
	AttachmentSize   *uint64
	ReplyToMessageID *uint64
}

func (r *MessageRepo) Create(in CreateMessageInput) (*models.Message, error) {
	var rid, reply any
	if in.RecipientID != nil {
		rid = *in.RecipientID
	}
	if in.ReplyToMessageID != nil {
		reply = *in.ReplyToMessageID
	}
	res, err := r.db.Exec(
		`INSERT INTO messages
		 (room_id, sender_id, recipient_id, body, attachment_url, attachment_name, attachment_type, attachment_size, reply_to_message_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		in.RoomID, in.SenderID, rid, in.Body,
		in.AttachmentURL, in.AttachmentName, in.AttachmentType, in.AttachmentSize, reply,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return r.GetByID(uint64(id))
}

// SetPinned toggles the pinned flag. Access control is the caller's job — this
// method assumes the caller has already verified host-only permission.
func (r *MessageRepo) SetPinned(messageID uint64, pinned bool) error {
	res, err := r.db.Exec(
		`UPDATE messages SET is_pinned = ? WHERE id = ? AND deleted_at IS NULL`,
		pinned, messageID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrMessageNotFound
	}
	return nil
}

// ListPinned returns only pinned messages for a room, newest-first. Used by the
// chat panel to render a sticky "pinned messages" section.
func (r *MessageRepo) ListPinned(roomID uint64) ([]*models.Message, error) {
	rows, err := r.db.Query(
		messageSelectQuery+` WHERE m.room_id = ? AND m.is_pinned = 1 AND m.deleted_at IS NULL ORDER BY m.id DESC`,
		roomID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.Message{}
	for rows.Next() {
		m := &models.Message{}
		if err := scanMessage(rows, m); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *MessageRepo) GetByID(id uint64) (*models.Message, error) {
	m := &models.Message{}
	err := scanMessage(
		r.db.QueryRow(messageSelectQuery+` WHERE m.id = ?`, id),
		m,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrMessageNotFound
	}
	if err != nil {
		return nil, err
	}
	return m, nil
}

// ListByRoom returns messages visible to the viewer in this room:
//   - All public messages (recipient_id IS NULL)
//   - Plus any DM where viewer is sender or recipient
//
// Soft-deleted messages still return so the UI can show "pesan dihapus".
// Reactions are aggregated and attached per-message.
func (r *MessageRepo) ListByRoom(roomID, viewerID uint64, beforeID uint64, limit int) ([]*models.Message, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	// Visibility filter: public OR sent by viewer OR sent to viewer.
	// `?` placeholder count varies with beforeID, so we keep two paths.
	visibility := `(m.recipient_id IS NULL OR m.sender_id = ? OR m.recipient_id = ?)`

	var (
		rows *sql.Rows
		err  error
	)
	if beforeID > 0 {
		rows, err = r.db.Query(
			messageSelectQuery+` WHERE m.room_id = ? AND `+visibility+` AND m.id < ? ORDER BY m.id DESC LIMIT ?`,
			roomID, viewerID, viewerID, beforeID, limit,
		)
	} else {
		rows, err = r.db.Query(
			messageSelectQuery+` WHERE m.room_id = ? AND `+visibility+` ORDER BY m.id DESC LIMIT ?`,
			roomID, viewerID, viewerID, limit,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.Message{}
	ids := []uint64{}
	for rows.Next() {
		m := &models.Message{}
		if err := scanMessage(rows, m); err != nil {
			return nil, err
		}
		out = append(out, m)
		ids = append(ids, m.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(ids) > 0 {
		reacts, err := r.ListReactions(ids)
		if err != nil {
			return nil, err
		}
		for _, m := range out {
			if r, ok := reacts[m.ID]; ok {
				m.Reactions = r
			}
		}
	}
	return out, nil
}

// UpdateBody changes the body of a message and stamps edited_at. Only the
// sender should be allowed by the handler — repo enforces ownership too as a
// belt-and-suspenders check.
func (r *MessageRepo) UpdateBody(messageID, senderID uint64, newBody string) error {
	res, err := r.db.Exec(
		`UPDATE messages
		 SET body = ?, edited_at = CURRENT_TIMESTAMP
		 WHERE id = ? AND sender_id = ? AND deleted_at IS NULL`,
		newBody, messageID, senderID,
	)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		_, gerr := r.GetByID(messageID)
		if errors.Is(gerr, ErrMessageNotFound) {
			return ErrMessageNotFound
		}
		return ErrMessageDeleted
	}
	return nil
}

// SoftDelete flags the message as deleted. `byHost` lets the handler skip the
// sender ownership check.
func (r *MessageRepo) SoftDelete(messageID, senderID uint64, byHost bool) error {
	var (
		res sql.Result
		err error
	)
	if byHost {
		res, err = r.db.Exec(
			`UPDATE messages SET deleted_at = CURRENT_TIMESTAMP
			 WHERE id = ? AND deleted_at IS NULL`,
			messageID,
		)
	} else {
		res, err = r.db.Exec(
			`UPDATE messages SET deleted_at = CURRENT_TIMESTAMP
			 WHERE id = ? AND sender_id = ? AND deleted_at IS NULL`,
			messageID, senderID,
		)
	}
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		_, gerr := r.GetByID(messageID)
		if errors.Is(gerr, ErrMessageNotFound) {
			return ErrMessageNotFound
		}
		return ErrMessageDeleted
	}
	return nil
}

// AddReaction inserts a (message, user, emoji) tuple. Returns true if newly
// inserted, false if already existed.
func (r *MessageRepo) AddReaction(messageID, userID uint64, emoji string) (bool, error) {
	res, err := r.db.Exec(
		`INSERT IGNORE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)`,
		messageID, userID, emoji,
	)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (r *MessageRepo) RemoveReaction(messageID, userID uint64, emoji string) error {
	_, err := r.db.Exec(
		`DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`,
		messageID, userID, emoji,
	)
	return err
}

// ListReactions fetches every reaction for the given message ids, returning a
// map keyed by message_id → emoji → list of user_ids who reacted.
func (r *MessageRepo) ListReactions(messageIDs []uint64) (map[uint64]map[string][]uint64, error) {
	if len(messageIDs) == 0 {
		return map[uint64]map[string][]uint64{}, nil
	}
	placeholders := make([]byte, 0, len(messageIDs)*2)
	args := make([]any, 0, len(messageIDs))
	for i, id := range messageIDs {
		if i > 0 {
			placeholders = append(placeholders, ',')
		}
		placeholders = append(placeholders, '?')
		args = append(args, id)
	}
	rows, err := r.db.Query(
		`SELECT message_id, user_id, emoji FROM message_reactions
		 WHERE message_id IN (`+string(placeholders)+`)
		 ORDER BY id ASC`,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[uint64]map[string][]uint64{}
	for rows.Next() {
		var messageID, userID uint64
		var emoji string
		if err := rows.Scan(&messageID, &userID, &emoji); err != nil {
			return nil, err
		}
		if out[messageID] == nil {
			out[messageID] = map[string][]uint64{}
		}
		out[messageID][emoji] = append(out[messageID][emoji], userID)
	}
	return out, rows.Err()
}
