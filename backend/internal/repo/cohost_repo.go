package repo

import (
	"database/sql"
	"errors"

	"videoconf-backend/internal/models"
)

var ErrCohostNotFound = errors.New("cohost not found")

type CohostRepo struct {
	db *sql.DB
}

func NewCohostRepo(db *sql.DB) *CohostRepo {
	return &CohostRepo{db: db}
}

// Add inserts (room_id, user_id) with INSERT IGNORE semantics — calling twice
// is a no-op, not an error. Returns (added bool) where false means already cohost.
func (r *CohostRepo) Add(roomID, userID uint64, grantedBy *uint64) (bool, error) {
	res, err := r.db.Exec(
		`INSERT IGNORE INTO room_cohosts (room_id, user_id, granted_by) VALUES (?, ?, ?)`,
		roomID, userID, nullableUint64(grantedBy),
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

// Remove deletes the cohost row. Returns ErrCohostNotFound if no row was
// affected so the caller can surface a 404.
func (r *CohostRepo) Remove(roomID, userID uint64) error {
	res, err := r.db.Exec(`DELETE FROM room_cohosts WHERE room_id = ? AND user_id = ?`, roomID, userID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrCohostNotFound
	}
	return nil
}

// IsCohost reports whether the given user is currently a cohost of the room.
// Returns false for non-cohosts AND for the owner — callers must check
// ownership separately (we don't store owner in this table).
func (r *CohostRepo) IsCohost(roomID, userID uint64) (bool, error) {
	var one int
	err := r.db.QueryRow(
		`SELECT 1 FROM room_cohosts WHERE room_id = ? AND user_id = ? LIMIT 1`,
		roomID, userID,
	).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// ListByRoom returns all cohosts for a room joined with users for display info,
// oldest grant first.
func (r *CohostRepo) ListByRoom(roomID uint64) ([]*models.Cohost, error) {
	rows, err := r.db.Query(`
		SELECT c.room_id, c.user_id, c.granted_by, c.granted_at,
		       u.display_name, u.email
		FROM room_cohosts c
		JOIN users u ON u.id = c.user_id
		WHERE c.room_id = ?
		ORDER BY c.granted_at ASC`, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.Cohost{}
	for rows.Next() {
		ch := &models.Cohost{}
		var grantedBy sql.NullInt64
		if err := rows.Scan(
			&ch.RoomID, &ch.UserID, &grantedBy, &ch.GrantedAt,
			&ch.DisplayName, &ch.Email,
		); err != nil {
			return nil, err
		}
		if grantedBy.Valid {
			g := uint64(grantedBy.Int64)
			ch.GrantedBy = &g
		}
		out = append(out, ch)
	}
	return out, rows.Err()
}

func nullableUint64(v *uint64) any {
	if v == nil {
		return nil
	}
	return *v
}
