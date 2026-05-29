package repo

import (
	"database/sql"

	"videoconf-backend/internal/models"
)

type MessageRepo struct {
	db *sql.DB
}

func NewMessageRepo(db *sql.DB) *MessageRepo {
	return &MessageRepo{db: db}
}

func (r *MessageRepo) Create(roomID, senderID uint64, body string) (*models.Message, error) {
	res, err := r.db.Exec(
		`INSERT INTO messages (room_id, sender_id, body) VALUES (?, ?, ?)`,
		roomID, senderID, body,
	)
	if err != nil {
		return nil, err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	m := &models.Message{}
	err = r.db.QueryRow(
		`SELECT m.id, m.room_id, m.sender_id, m.body, m.created_at, u.display_name
		 FROM messages m JOIN users u ON u.id = m.sender_id
		 WHERE m.id = ?`,
		id,
	).Scan(&m.ID, &m.RoomID, &m.SenderID, &m.Body, &m.CreatedAt, &m.SenderName)
	if err != nil {
		return nil, err
	}
	return m, nil
}

// ListByRoom returns up to `limit` messages for a room. If beforeID > 0, only
// returns messages with id < beforeID (cursor-based pagination, newest first).
func (r *MessageRepo) ListByRoom(roomID uint64, beforeID uint64, limit int) ([]*models.Message, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	var (
		rows *sql.Rows
		err  error
	)

	query := `SELECT m.id, m.room_id, m.sender_id, m.body, m.created_at, u.display_name
	          FROM messages m JOIN users u ON u.id = m.sender_id
	          WHERE m.room_id = ?`

	if beforeID > 0 {
		rows, err = r.db.Query(query+` AND m.id < ? ORDER BY m.id DESC LIMIT ?`, roomID, beforeID, limit)
	} else {
		rows, err = r.db.Query(query+` ORDER BY m.id DESC LIMIT ?`, roomID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.Message{}
	for rows.Next() {
		m := &models.Message{}
		if err := rows.Scan(&m.ID, &m.RoomID, &m.SenderID, &m.Body, &m.CreatedAt, &m.SenderName); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
