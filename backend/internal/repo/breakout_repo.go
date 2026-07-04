package repo

import (
	"database/sql"
	"errors"

	"videoconf-backend/internal/models"
)

var ErrBreakoutNotFound = errors.New("breakout not found")

type BreakoutRepo struct {
	db *sql.DB
}

func NewBreakoutRepo(db *sql.DB) *BreakoutRepo {
	return &BreakoutRepo{db: db}
}

const breakoutColumns = `id, parent_room_id, slug, name, created_by, created_at, closed_at`

func scanBreakout(row interface{ Scan(...any) error }, b *models.BreakoutRoom) error {
	return row.Scan(
		&b.ID, &b.ParentRoomID, &b.Slug, &b.Name, &b.CreatedBy,
		&b.CreatedAt, &b.ClosedAt,
	)
}

type CreateBreakoutInput struct {
	ParentRoomID uint64
	Slug         string
	Name         string
	CreatedBy    uint64
}

func (r *BreakoutRepo) Create(in CreateBreakoutInput) (*models.BreakoutRoom, error) {
	res, err := r.db.Exec(
		`INSERT INTO breakout_rooms (parent_room_id, slug, name, created_by)
		 VALUES (?, ?, ?, ?)`,
		in.ParentRoomID, in.Slug, in.Name, in.CreatedBy,
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

func (r *BreakoutRepo) GetByID(id uint64) (*models.BreakoutRoom, error) {
	b := &models.BreakoutRoom{}
	err := scanBreakout(
		r.db.QueryRow(`SELECT `+breakoutColumns+` FROM breakout_rooms WHERE id = ?`, id),
		b,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrBreakoutNotFound
	}
	if err != nil {
		return nil, err
	}
	return b, nil
}

// ListOpenByParent returns breakouts that haven't been closed yet for the
// parent room, oldest first so the host's mental ordering of "breakout 1, 2,
// 3" stays intact.
func (r *BreakoutRepo) ListOpenByParent(parentRoomID uint64) ([]*models.BreakoutRoom, error) {
	rows, err := r.db.Query(
		`SELECT `+breakoutColumns+` FROM breakout_rooms
		 WHERE parent_room_id = ? AND closed_at IS NULL
		 ORDER BY created_at ASC`,
		parentRoomID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.BreakoutRoom{}
	for rows.Next() {
		b := &models.BreakoutRoom{}
		if err := scanBreakout(rows, b); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// GetBySlug looks up a breakout by its slug. Useful for guarding the
// "currently in a breakout" UI: when frontend hits /room/<slug>, we can ask
// whether <slug> is actually a breakout and, if so, what its parent is.
func (r *BreakoutRepo) GetBySlug(slug string) (*models.BreakoutRoom, error) {
	b := &models.BreakoutRoom{}
	err := scanBreakout(
		r.db.QueryRow(`SELECT `+breakoutColumns+` FROM breakout_rooms WHERE slug = ?`, slug),
		b,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrBreakoutNotFound
	}
	if err != nil {
		return nil, err
	}
	return b, nil
}

// CloseAllForParent flips closed_at on every open breakout under a parent.
// Returns count actually closed (idempotent).
func (r *BreakoutRepo) CloseAllForParent(parentRoomID uint64) (int64, error) {
	res, err := r.db.Exec(
		`UPDATE breakout_rooms SET closed_at = CURRENT_TIMESTAMP
		 WHERE parent_room_id = ? AND closed_at IS NULL`,
		parentRoomID,
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
