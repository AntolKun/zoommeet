package repo

import (
	"database/sql"
	"errors"

	"videoconf-backend/internal/models"
)

var ErrRoomNotFound = errors.New("room not found")

type RoomRepo struct {
	db *sql.DB
}

func NewRoomRepo(db *sql.DB) *RoomRepo {
	return &RoomRepo{db: db}
}

const roomColumns = `id, slug, name, owner_id, is_public, is_locked, created_at, updated_at`

func scanRoom(row interface{ Scan(...any) error }, rm *models.Room) error {
	return row.Scan(&rm.ID, &rm.Slug, &rm.Name, &rm.OwnerID, &rm.IsPublic, &rm.IsLocked, &rm.CreatedAt, &rm.UpdatedAt)
}

func (r *RoomRepo) Create(slug, name string, ownerID uint64, isPublic bool) (*models.Room, error) {
	res, err := r.db.Exec(
		`INSERT INTO rooms (slug, name, owner_id, is_public) VALUES (?, ?, ?, ?)`,
		slug, name, ownerID, isPublic,
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

func (r *RoomRepo) GetByID(id uint64) (*models.Room, error) {
	rm := &models.Room{}
	err := scanRoom(r.db.QueryRow(`SELECT `+roomColumns+` FROM rooms WHERE id = ?`, id), rm)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrRoomNotFound
	}
	if err != nil {
		return nil, err
	}
	return rm, nil
}

func (r *RoomRepo) GetBySlug(slug string) (*models.Room, error) {
	rm := &models.Room{}
	err := scanRoom(r.db.QueryRow(`SELECT `+roomColumns+` FROM rooms WHERE slug = ?`, slug), rm)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrRoomNotFound
	}
	if err != nil {
		return nil, err
	}
	return rm, nil
}

func (r *RoomRepo) ListByOwner(ownerID uint64) ([]*models.Room, error) {
	rows, err := r.db.Query(
		`SELECT `+roomColumns+` FROM rooms WHERE owner_id = ? ORDER BY created_at DESC`,
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.Room{}
	for rows.Next() {
		rm := &models.Room{}
		if err := scanRoom(rows, rm); err != nil {
			return nil, err
		}
		out = append(out, rm)
	}
	return out, rows.Err()
}

func (r *RoomRepo) Delete(id uint64) error {
	res, err := r.db.Exec(`DELETE FROM rooms WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrRoomNotFound
	}
	return nil
}

func (r *RoomRepo) SetLocked(id uint64, locked bool) error {
	_, err := r.db.Exec(`UPDATE rooms SET is_locked = ? WHERE id = ?`, locked, id)
	return err
}
