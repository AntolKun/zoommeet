package repo

import (
	"database/sql"
	"errors"

	"videoconf-backend/internal/models"
)

var ErrRecordingNotFound = errors.New("recording not found")

type RecordingRepo struct {
	db *sql.DB
}

func NewRecordingRepo(db *sql.DB) *RecordingRepo {
	return &RecordingRepo{db: db}
}

const recordingColumns = `id, room_id, egress_id, status, started_by, file_path, file_url, file_size, duration_seconds, started_at, ended_at, error`

func scanRecording(row interface{ Scan(...any) error }, r *models.Recording) error {
	return row.Scan(
		&r.ID, &r.RoomID, &r.EgressID, &r.Status, &r.StartedBy,
		&r.FilePath, &r.FileURL, &r.FileSize, &r.DurationSeconds,
		&r.StartedAt, &r.EndedAt, &r.Error,
	)
}

func (rr *RecordingRepo) Create(roomID, startedBy uint64, egressID, status string) (*models.Recording, error) {
	res, err := rr.db.Exec(
		`INSERT INTO recordings (room_id, egress_id, status, started_by) VALUES (?, ?, ?, ?)`,
		roomID, egressID, status, startedBy,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return rr.GetByID(uint64(id))
}

func (rr *RecordingRepo) GetByID(id uint64) (*models.Recording, error) {
	r := &models.Recording{}
	err := scanRecording(rr.db.QueryRow(`SELECT `+recordingColumns+` FROM recordings WHERE id = ?`, id), r)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrRecordingNotFound
	}
	if err != nil {
		return nil, err
	}
	return r, nil
}

func (rr *RecordingRepo) GetByEgressID(egressID string) (*models.Recording, error) {
	r := &models.Recording{}
	err := scanRecording(rr.db.QueryRow(`SELECT `+recordingColumns+` FROM recordings WHERE egress_id = ?`, egressID), r)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrRecordingNotFound
	}
	if err != nil {
		return nil, err
	}
	return r, nil
}

func (rr *RecordingRepo) ListByRoom(roomID uint64) ([]*models.Recording, error) {
	rows, err := rr.db.Query(`SELECT `+recordingColumns+` FROM recordings WHERE room_id = ? ORDER BY started_at DESC`, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.Recording{}
	for rows.Next() {
		r := &models.Recording{}
		if err := scanRecording(rows, r); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (rr *RecordingRepo) UpdateStatus(id uint64, status string) error {
	_, err := rr.db.Exec(`UPDATE recordings SET status = ? WHERE id = ?`, status, id)
	return err
}

type CompletionUpdate struct {
	Status          string
	FilePath        string
	FileURL         string
	FileSize        uint64
	DurationSeconds uint32
}

func (rr *RecordingRepo) MarkComplete(id uint64, u CompletionUpdate) error {
	_, err := rr.db.Exec(
		`UPDATE recordings SET status = ?, file_path = ?, file_url = ?, file_size = ?, duration_seconds = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?`,
		u.Status, nullableStr(u.FilePath), nullableStr(u.FileURL), nullableU64(u.FileSize), nullableU32(u.DurationSeconds), id,
	)
	return err
}

func (rr *RecordingRepo) MarkFailed(id uint64, errMsg string) error {
	_, err := rr.db.Exec(
		`UPDATE recordings SET status = 'failed', error = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?`,
		errMsg, id,
	)
	return err
}

func nullableStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullableU64(n uint64) any {
	if n == 0 {
		return nil
	}
	return n
}

func nullableU32(n uint32) any {
	if n == 0 {
		return nil
	}
	return n
}
