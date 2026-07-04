package repo

import (
	"database/sql"

	"videoconf-backend/internal/models"
)

type AuditRepo struct {
	db *sql.DB
}

func NewAuditRepo(db *sql.DB) *AuditRepo {
	return &AuditRepo{db: db}
}

type LogAuditInput struct {
	RoomID    uint64
	ActorID   uint64
	ActorRole string  // "owner" | "cohost"
	Action    string  // see models.AuditAction*
	Target    *string // optional — participant identity, recording id, user id, etc.
	Detail    *string // optional — free-form context
}

// Log persists an audit record. Fire-and-forget from caller's perspective;
// errors are returned but should generally be logged-and-swallowed at the
// handler layer (a failed audit shouldn't fail the underlying action).
func (r *AuditRepo) Log(in LogAuditInput) error {
	_, err := r.db.Exec(
		`INSERT INTO audit_logs (room_id, actor_id, actor_role, action, target, detail)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		in.RoomID, in.ActorID, in.ActorRole, in.Action, in.Target, in.Detail,
	)
	return err
}

// ListByRoom returns audit entries for a room, newest first, joined with
// users so the UI can show actor display names without a second roundtrip.
func (r *AuditRepo) ListByRoom(roomID uint64, limit int) ([]*models.AuditEntry, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := r.db.Query(`
		SELECT a.id, a.room_id, a.actor_id, a.actor_role, a.action, a.target, a.detail, a.created_at, u.display_name
		FROM audit_logs a
		JOIN users u ON u.id = a.actor_id
		WHERE a.room_id = ?
		ORDER BY a.created_at DESC
		LIMIT ?`, roomID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.AuditEntry{}
	for rows.Next() {
		e := &models.AuditEntry{}
		var target sql.NullString
		var detail sql.NullString
		if err := rows.Scan(
			&e.ID, &e.RoomID, &e.ActorID, &e.ActorRole, &e.Action,
			&target, &detail, &e.CreatedAt, &e.ActorName,
		); err != nil {
			return nil, err
		}
		if target.Valid {
			s := target.String
			e.Target = &s
		}
		if detail.Valid {
			s := detail.String
			e.Detail = &s
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
