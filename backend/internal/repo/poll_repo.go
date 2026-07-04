package repo

import (
	"database/sql"
	"errors"

	"videoconf-backend/internal/models"
)

var (
	ErrPollNotFound       = errors.New("poll not found")
	ErrPollOptionMismatch = errors.New("option does not belong to poll")
	ErrPollClosed         = errors.New("poll is closed")
)

type PollRepo struct {
	db *sql.DB
}

func NewPollRepo(db *sql.DB) *PollRepo {
	return &PollRepo{db: db}
}

type CreatePollInput struct {
	RoomID    uint64
	CreatedBy uint64
	Question  string
	Options   []string // labels in display order; 2..10 entries
}

// Create persists a poll plus its options atomically.
func (r *PollRepo) Create(in CreatePollInput) (*models.Poll, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	res, err := tx.Exec(
		`INSERT INTO polls (room_id, question, created_by) VALUES (?, ?, ?)`,
		in.RoomID, in.Question, in.CreatedBy,
	)
	if err != nil {
		return nil, err
	}
	pollID, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	for i, label := range in.Options {
		if _, err := tx.Exec(
			`INSERT INTO poll_options (poll_id, position, label) VALUES (?, ?, ?)`,
			pollID, i, label,
		); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	// Reload with options.
	return r.GetByID(uint64(pollID), 0)
}

// GetByID returns one poll with its options. If userID != 0, my_vote is
// populated based on that user's existing vote (if any).
func (r *PollRepo) GetByID(id uint64, userID uint64) (*models.Poll, error) {
	p := &models.Poll{}
	err := r.db.QueryRow(
		`SELECT id, room_id, question, created_by, created_at, closed_at
		 FROM polls WHERE id = ?`,
		id,
	).Scan(&p.ID, &p.RoomID, &p.Question, &p.CreatedBy, &p.CreatedAt, &p.ClosedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPollNotFound
	}
	if err != nil {
		return nil, err
	}
	p.IsOpen = p.ClosedAt == nil

	opts, err := r.listOptions(id)
	if err != nil {
		return nil, err
	}
	p.Options = opts

	counts, err := r.countVotes(id)
	if err != nil {
		return nil, err
	}
	p.Counts = counts

	if userID != 0 {
		myVote, err := r.myVote(id, userID)
		if err != nil {
			return nil, err
		}
		p.MyVote = myVote
	}
	return p, nil
}

func (r *PollRepo) listOptions(pollID uint64) ([]models.PollOption, error) {
	rows, err := r.db.Query(
		`SELECT id, poll_id, position, label FROM poll_options
		 WHERE poll_id = ? ORDER BY position ASC`,
		pollID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.PollOption{}
	for rows.Next() {
		var o models.PollOption
		if err := rows.Scan(&o.ID, &o.PollID, &o.Position, &o.Label); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (r *PollRepo) countVotes(pollID uint64) (map[uint64]uint64, error) {
	rows, err := r.db.Query(
		`SELECT option_id, COUNT(*) FROM poll_votes WHERE poll_id = ? GROUP BY option_id`,
		pollID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[uint64]uint64{}
	for rows.Next() {
		var optID uint64
		var count uint64
		if err := rows.Scan(&optID, &count); err != nil {
			return nil, err
		}
		out[optID] = count
	}
	return out, rows.Err()
}

func (r *PollRepo) myVote(pollID, userID uint64) (*uint64, error) {
	var optID uint64
	err := r.db.QueryRow(
		`SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?`,
		pollID, userID,
	).Scan(&optID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &optID, nil
}

// ListByRoom returns all polls for a room (newest first), each with their
// options + vote counts + the user's own vote.
func (r *PollRepo) ListByRoom(roomID uint64, userID uint64) ([]*models.Poll, error) {
	rows, err := r.db.Query(
		`SELECT id FROM polls WHERE room_id = ? ORDER BY created_at DESC LIMIT 50`,
		roomID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []uint64{}
	for rows.Next() {
		var id uint64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]*models.Poll, 0, len(ids))
	for _, id := range ids {
		p, err := r.GetByID(id, userID)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

// Vote inserts or replaces the user's vote in a poll. Errors:
//   - ErrPollNotFound: poll doesn't exist
//   - ErrPollClosed: poll already closed
//   - ErrPollOptionMismatch: optionID isn't an option of this poll
func (r *PollRepo) Vote(pollID, optionID, userID uint64) error {
	var closedAt sql.NullTime
	err := r.db.QueryRow(`SELECT closed_at FROM polls WHERE id = ?`, pollID).Scan(&closedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrPollNotFound
	}
	if err != nil {
		return err
	}
	if closedAt.Valid {
		return ErrPollClosed
	}

	// Validate option belongs to this poll.
	var optPollID uint64
	err = r.db.QueryRow(`SELECT poll_id FROM poll_options WHERE id = ?`, optionID).Scan(&optPollID)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && optPollID != pollID) {
		return ErrPollOptionMismatch
	}
	if err != nil {
		return err
	}

	// Upsert via REPLACE — there's a unique key on (poll_id, user_id) so we
	// can flip the user's choice cleanly.
	_, err = r.db.Exec(
		`INSERT INTO poll_votes (poll_id, option_id, user_id)
		 VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE option_id = VALUES(option_id), created_at = CURRENT_TIMESTAMP`,
		pollID, optionID, userID,
	)
	return err
}

// Close marks a poll as closed. Idempotent — calling on an already-closed
// poll is a no-op.
func (r *PollRepo) Close(pollID uint64) error {
	res, err := r.db.Exec(
		`UPDATE polls SET closed_at = CURRENT_TIMESTAMP WHERE id = ? AND closed_at IS NULL`,
		pollID,
	)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		// Check whether the poll exists at all.
		var dummy uint64
		err = r.db.QueryRow(`SELECT id FROM polls WHERE id = ?`, pollID).Scan(&dummy)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrPollNotFound
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// GetRoomID returns the room id of a poll — needed for permission checks.
func (r *PollRepo) GetRoomID(pollID uint64) (uint64, error) {
	var roomID uint64
	err := r.db.QueryRow(`SELECT room_id FROM polls WHERE id = ?`, pollID).Scan(&roomID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrPollNotFound
	}
	return roomID, err
}
