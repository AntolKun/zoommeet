package repo

import (
	"database/sql"
	"errors"

	"videoconf-backend/internal/models"
)

var ErrUserNotFound = errors.New("user not found")

type UserRepo struct {
	db *sql.DB
}

func NewUserRepo(db *sql.DB) *UserRepo {
	return &UserRepo{db: db}
}

const userColumns = `id, email, password_hash, display_name, avatar_url, pmr_room_id, created_at, updated_at`

func scanUser(row interface{ Scan(...any) error }, u *models.User) error {
	var avatar sql.NullString
	var pmrRoomID sql.NullInt64
	if err := row.Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName,
		&avatar, &pmrRoomID, &u.CreatedAt, &u.UpdatedAt,
	); err != nil {
		return err
	}
	if avatar.Valid {
		s := avatar.String
		u.AvatarURL = &s
	}
	if pmrRoomID.Valid {
		id := uint64(pmrRoomID.Int64)
		u.PMRRoomID = &id
	}
	return nil
}

func (r *UserRepo) Create(email, passwordHash, displayName string) (*models.User, error) {
	res, err := r.db.Exec(
		`INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)`,
		email, passwordHash, displayName,
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

func (r *UserRepo) GetByID(id uint64) (*models.User, error) {
	u := &models.User{}
	err := scanUser(
		r.db.QueryRow(`SELECT `+userColumns+` FROM users WHERE id = ?`, id),
		u,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *UserRepo) GetByEmail(email string) (*models.User, error) {
	u := &models.User{}
	err := scanUser(
		r.db.QueryRow(`SELECT `+userColumns+` FROM users WHERE email = ?`, email),
		u,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

// SetAvatarURL updates the user's avatar pointer. Pass empty string to clear.
func (r *UserRepo) SetAvatarURL(id uint64, url string) error {
	if url == "" {
		_, err := r.db.Exec(`UPDATE users SET avatar_url = NULL WHERE id = ?`, id)
		return err
	}
	_, err := r.db.Exec(`UPDATE users SET avatar_url = ? WHERE id = ?`, url, id)
	return err
}

// SetPMRRoomID stores the user's Personal Meeting Room pointer (or clears it).
func (r *UserRepo) SetPMRRoomID(userID uint64, roomID *uint64) error {
	if roomID == nil {
		_, err := r.db.Exec(`UPDATE users SET pmr_room_id = NULL WHERE id = ?`, userID)
		return err
	}
	_, err := r.db.Exec(`UPDATE users SET pmr_room_id = ? WHERE id = ?`, *roomID, userID)
	return err
}
