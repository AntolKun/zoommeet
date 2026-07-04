package repo

import (
	"database/sql"
	"errors"

	"videoconf-backend/internal/models"
)

var ErrQuestionNotFound = errors.New("question not found")

type QuestionRepo struct {
	db *sql.DB
}

func NewQuestionRepo(db *sql.DB) *QuestionRepo {
	return &QuestionRepo{db: db}
}

type CreateQuestionInput struct {
	RoomID    uint64
	UserID    *uint64 // nil = guest
	AskerName string
	Text      string
}

func (r *QuestionRepo) Create(in CreateQuestionInput) (*models.Question, error) {
	res, err := r.db.Exec(
		`INSERT INTO questions (room_id, user_id, asker_name, text) VALUES (?, ?, ?, ?)`,
		in.RoomID, in.UserID, in.AskerName, in.Text,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return r.GetByID(uint64(id), 0)
}

// GetByID returns a question with derived upvote count + my_upvote flag.
// Pass viewerUserID = 0 if anonymous (guest viewer); my_upvote will be false.
func (r *QuestionRepo) GetByID(id uint64, viewerUserID uint64) (*models.Question, error) {
	q := &models.Question{}
	var userID, answeredBy sql.NullInt64
	var answerText sql.NullString
	var answeredAt sql.NullTime
	err := r.db.QueryRow(`
		SELECT q.id, q.room_id, q.user_id, q.asker_name, q.text, q.status,
		       q.answered_by, q.answer_text, q.answered_at, q.created_at,
		       (SELECT COUNT(*) FROM question_upvotes WHERE question_id = q.id) AS upvotes,
		       EXISTS(SELECT 1 FROM question_upvotes WHERE question_id = q.id AND user_id = ?) AS my_upvote
		FROM questions q WHERE q.id = ?
	`, viewerUserID, id).Scan(
		&q.ID, &q.RoomID, &userID, &q.AskerName, &q.Text, &q.Status,
		&answeredBy, &answerText, &answeredAt, &q.CreatedAt,
		&q.Upvotes, &q.MyUpvote,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrQuestionNotFound
	}
	if err != nil {
		return nil, err
	}
	if userID.Valid {
		u := uint64(userID.Int64)
		q.UserID = &u
	}
	if answeredBy.Valid {
		a := uint64(answeredBy.Int64)
		q.AnsweredBy = &a
	}
	if answerText.Valid {
		q.AnswerText = &answerText.String
	}
	if answeredAt.Valid {
		q.AnsweredAt = &answeredAt.Time
	}
	return q, nil
}

// ListByRoom returns all questions for a room, sorted open-first by upvotes desc
// then newest-first within each status group. viewerUserID drives my_upvote
// (pass 0 for guests).
func (r *QuestionRepo) ListByRoom(roomID, viewerUserID uint64) ([]*models.Question, error) {
	rows, err := r.db.Query(`
		SELECT q.id, q.room_id, q.user_id, q.asker_name, q.text, q.status,
		       q.answered_by, q.answer_text, q.answered_at, q.created_at,
		       (SELECT COUNT(*) FROM question_upvotes WHERE question_id = q.id) AS upvotes,
		       EXISTS(SELECT 1 FROM question_upvotes WHERE question_id = q.id AND user_id = ?) AS my_upvote
		FROM questions q
		WHERE q.room_id = ?
		ORDER BY
		  CASE q.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END,
		  upvotes DESC,
		  q.created_at DESC
	`, viewerUserID, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.Question{}
	for rows.Next() {
		q := &models.Question{}
		var userID, answeredBy sql.NullInt64
		var answerText sql.NullString
		var answeredAt sql.NullTime
		if err := rows.Scan(
			&q.ID, &q.RoomID, &userID, &q.AskerName, &q.Text, &q.Status,
			&answeredBy, &answerText, &answeredAt, &q.CreatedAt,
			&q.Upvotes, &q.MyUpvote,
		); err != nil {
			return nil, err
		}
		if userID.Valid {
			u := uint64(userID.Int64)
			q.UserID = &u
		}
		if answeredBy.Valid {
			a := uint64(answeredBy.Int64)
			q.AnsweredBy = &a
		}
		if answerText.Valid {
			q.AnswerText = &answerText.String
		}
		if answeredAt.Valid {
			q.AnsweredAt = &answeredAt.Time
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

// Upvote inserts a row idempotently. Returns ErrQuestionNotFound if the FK fails.
func (r *QuestionRepo) Upvote(questionID, userID uint64) error {
	_, err := r.db.Exec(
		`INSERT IGNORE INTO question_upvotes (question_id, user_id) VALUES (?, ?)`,
		questionID, userID,
	)
	return err
}

// RemoveUpvote is the inverse.
func (r *QuestionRepo) RemoveUpvote(questionID, userID uint64) error {
	_, err := r.db.Exec(
		`DELETE FROM question_upvotes WHERE question_id = ? AND user_id = ?`,
		questionID, userID,
	)
	return err
}

// MarkAnswered flips status and records who/when/what answer.
func (r *QuestionRepo) MarkAnswered(questionID, hostID uint64, answerText string) error {
	res, err := r.db.Exec(
		`UPDATE questions SET status = 'answered', answered_by = ?, answer_text = ?, answered_at = NOW() WHERE id = ?`,
		hostID, answerText, questionID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrQuestionNotFound
	}
	return nil
}

// MarkDismissed lets host hide the question without answering. Used for off-topic
// or duplicate questions.
func (r *QuestionRepo) MarkDismissed(questionID uint64) error {
	res, err := r.db.Exec(
		`UPDATE questions SET status = 'dismissed' WHERE id = ?`,
		questionID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrQuestionNotFound
	}
	return nil
}
