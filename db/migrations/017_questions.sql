-- Q&A panel: structured questions with upvotes. Separate from chat — chat is
-- conversational, Q&A is "what should we cover, host?". Hosts mark answered or
-- dismiss. Asker can be a guest (user_id NULL) tracked by display_name only.
CREATE TABLE IF NOT EXISTS questions (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    room_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,                 -- NULL = guest asker
    asker_name VARCHAR(100) NOT NULL,
    text TEXT NOT NULL,
    -- open | answered | dismissed
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    -- Set when status flips to 'answered'.
    answered_by BIGINT UNSIGNED NULL,
    answer_text TEXT NULL,
    answered_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_questions_room_status (room_id, status, created_at),
    CONSTRAINT fk_question_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_question_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_question_answerer FOREIGN KEY (answered_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per (question, voter). Guests can't vote — voting requires auth so we
-- can dedupe per user. Cheap to compute count via JOIN-with-count.
CREATE TABLE IF NOT EXISTS question_upvotes (
    question_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (question_id, user_id),
    CONSTRAINT fk_qupvote_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    CONSTRAINT fk_qupvote_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
