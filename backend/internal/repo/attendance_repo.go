package repo

import (
	"database/sql"
	"errors"

	"videoconf-backend/internal/models"
)

var ErrAttendanceNotFound = errors.New("attendance entry not found")

type AttendanceRepo struct {
	db *sql.DB
}

func NewAttendanceRepo(db *sql.DB) *AttendanceRepo {
	return &AttendanceRepo{db: db}
}

const attendanceColumns = `id, room_id, user_id, display_name, identity, joined_at, left_at, duration_seconds`

func scanAttendance(row interface{ Scan(...any) error }, a *models.AttendanceEntry) error {
	var userID sql.NullInt64
	if err := row.Scan(
		&a.ID, &a.RoomID, &userID, &a.DisplayName, &a.Identity,
		&a.JoinedAt, &a.LeftAt, &a.DurationSeconds,
	); err != nil {
		return err
	}
	if userID.Valid {
		u := uint64(userID.Int64)
		a.UserID = &u
	}
	return nil
}

type LogJoinInput struct {
	RoomID      uint64
	UserID      *uint64 // nil for guests
	DisplayName string
	Identity    string
}

func (r *AttendanceRepo) LogJoin(in LogJoinInput) (*models.AttendanceEntry, error) {
	var userID any
	if in.UserID != nil {
		userID = *in.UserID
	}
	res, err := r.db.Exec(
		`INSERT INTO attendance_logs (room_id, user_id, display_name, identity) VALUES (?, ?, ?, ?)`,
		in.RoomID, userID, in.DisplayName, in.Identity,
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

func (r *AttendanceRepo) GetByID(id uint64) (*models.AttendanceEntry, error) {
	a := &models.AttendanceEntry{}
	err := scanAttendance(
		r.db.QueryRow(`SELECT `+attendanceColumns+` FROM attendance_logs WHERE id = ?`, id),
		a,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrAttendanceNotFound
	}
	if err != nil {
		return nil, err
	}
	return a, nil
}

// LogLeave closes an open attendance entry, computing duration server-side.
// Idempotent — calling on an already-closed entry is a no-op.
func (r *AttendanceRepo) LogLeave(id uint64) error {
	_, err := r.db.Exec(
		`UPDATE attendance_logs
		 SET left_at = CURRENT_TIMESTAMP,
		     duration_seconds = TIMESTAMPDIFF(SECOND, joined_at, CURRENT_TIMESTAMP)
		 WHERE id = ? AND left_at IS NULL`,
		id,
	)
	return err
}

// ListByRoom returns attendance entries for a room, most recent join first.
func (r *AttendanceRepo) ListByRoom(roomID uint64) ([]*models.AttendanceEntry, error) {
	rows, err := r.db.Query(
		`SELECT `+attendanceColumns+` FROM attendance_logs
		 WHERE room_id = ? ORDER BY joined_at DESC`,
		roomID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.AttendanceEntry{}
	for rows.Next() {
		a := &models.AttendanceEntry{}
		if err := scanAttendance(rows, a); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
