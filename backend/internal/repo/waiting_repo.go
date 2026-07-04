package repo

import (
	"database/sql"
	"errors"

	"videoconf-backend/internal/models"
)

var ErrWaitingRequestNotFound = errors.New("waiting request not found")

type WaitingRepo struct {
	db *sql.DB
}

func NewWaitingRepo(db *sql.DB) *WaitingRepo {
	return &WaitingRepo{db: db}
}

const waitingColumns = `id, room_id, user_id, display_name, status, request_token, livekit_token, created_at, decided_at`

func scanWaiting(row interface{ Scan(...any) error }, w *models.WaitingRequest) error {
	var userID sql.NullInt64
	var liveKitTok sql.NullString
	if err := row.Scan(
		&w.ID, &w.RoomID, &userID, &w.DisplayName,
		&w.Status, &w.RequestToken, &liveKitTok,
		&w.CreatedAt, &w.DecidedAt,
	); err != nil {
		return err
	}
	if userID.Valid {
		u := uint64(userID.Int64)
		w.UserID = &u
	}
	if liveKitTok.Valid {
		w.LiveKitToken = liveKitTok.String
	}
	return nil
}

type CreateWaitingInput struct {
	RoomID       uint64
	UserID       *uint64
	DisplayName  string
	RequestToken string
}

func (r *WaitingRepo) Create(in CreateWaitingInput) (*models.WaitingRequest, error) {
	var userID any
	if in.UserID != nil {
		userID = *in.UserID
	}
	res, err := r.db.Exec(
		`INSERT INTO waiting_requests (room_id, user_id, display_name, request_token, status)
		 VALUES (?, ?, ?, ?, 'pending')`,
		in.RoomID, userID, in.DisplayName, in.RequestToken,
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

func (r *WaitingRepo) GetByID(id uint64) (*models.WaitingRequest, error) {
	w := &models.WaitingRequest{}
	err := scanWaiting(r.db.QueryRow(`SELECT `+waitingColumns+` FROM waiting_requests WHERE id = ?`, id), w)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrWaitingRequestNotFound
	}
	if err != nil {
		return nil, err
	}
	return w, nil
}

func (r *WaitingRepo) GetByToken(token string) (*models.WaitingRequest, error) {
	w := &models.WaitingRequest{}
	err := scanWaiting(r.db.QueryRow(`SELECT `+waitingColumns+` FROM waiting_requests WHERE request_token = ?`, token), w)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrWaitingRequestNotFound
	}
	if err != nil {
		return nil, err
	}
	return w, nil
}

// ListPending returns pending requests for a room, oldest first (FIFO).
func (r *WaitingRepo) ListPending(roomID uint64) ([]*models.WaitingRequest, error) {
	rows, err := r.db.Query(
		`SELECT `+waitingColumns+` FROM waiting_requests
		 WHERE room_id = ? AND status = 'pending'
		 ORDER BY created_at ASC`,
		roomID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.WaitingRequest{}
	for rows.Next() {
		w := &models.WaitingRequest{}
		if err := scanWaiting(rows, w); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (r *WaitingRepo) Approve(id uint64, liveKitToken string) error {
	_, err := r.db.Exec(
		`UPDATE waiting_requests SET status='approved', livekit_token=?, decided_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`,
		liveKitToken, id,
	)
	return err
}

func (r *WaitingRepo) Deny(id uint64) error {
	_, err := r.db.Exec(
		`UPDATE waiting_requests SET status='denied', decided_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`,
		id,
	)
	return err
}
