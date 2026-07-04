package models

import "time"

// QuestionStatus values.
const (
	QuestionStatusOpen      = "open"
	QuestionStatusAnswered  = "answered"
	QuestionStatusDismissed = "dismissed"
)

type Question struct {
	ID         uint64     `json:"id"`
	RoomID     uint64     `json:"room_id"`
	UserID     *uint64    `json:"user_id,omitempty"`
	AskerName  string     `json:"asker_name"`
	Text       string     `json:"text"`
	Status     string     `json:"status"`
	AnsweredBy *uint64    `json:"answered_by,omitempty"`
	AnswerText *string    `json:"answer_text,omitempty"`
	AnsweredAt *time.Time `json:"answered_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`

	// Derived: total upvotes across all voters.
	Upvotes int `json:"upvotes"`
	// Derived: whether the requesting user has voted on this question.
	MyUpvote bool `json:"my_upvote"`
}
