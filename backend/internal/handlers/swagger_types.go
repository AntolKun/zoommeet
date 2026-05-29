package handlers

// errorResponse is the shape used for all 4xx/5xx error bodies.
// It only exists so swaggo can generate a schema for error responses.
type errorResponse struct {
	Error string `json:"error" example:"human-readable error message"`
}

type lockResponse struct {
	IsLocked bool `json:"is_locked" example:"true"`
}

type muteResponse struct {
	MutedTracks int `json:"muted_tracks" example:"1"`
}

type messagesListResponse struct {
	Messages []struct {
		ID         uint64 `json:"id"`
		RoomID     uint64 `json:"room_id"`
		SenderID   uint64 `json:"sender_id"`
		Body       string `json:"body"`
		CreatedAt  string `json:"created_at"`
		SenderName string `json:"sender_name"`
	} `json:"messages"`
}

type roomsListResponse struct {
	Rooms []struct {
		ID        uint64 `json:"id"`
		Slug      string `json:"slug"`
		Name      string `json:"name"`
		OwnerID   uint64 `json:"owner_id"`
		IsPublic  bool   `json:"is_public"`
		IsLocked  bool   `json:"is_locked"`
		CreatedAt string `json:"created_at"`
		UpdatedAt string `json:"updated_at"`
	} `json:"rooms"`
}

type participantsListResponse struct {
	Participants []struct {
		SID      string `json:"sid"`
		Identity string `json:"identity"`
		Name     string `json:"name"`
		State    string `json:"state"`
		JoinedAt int64  `json:"joined_at"`
		Tracks   []struct {
			SID    string `json:"sid"`
			Type   string `json:"type"`
			Source string `json:"source"`
			Muted  bool   `json:"muted"`
		} `json:"tracks"`
	} `json:"participants"`
}

type recordingsListResponse struct {
	Recordings []struct {
		ID              uint64  `json:"id"`
		RoomID          uint64  `json:"room_id"`
		EgressID        string  `json:"egress_id"`
		Status          string  `json:"status"`
		StartedBy       uint64  `json:"started_by"`
		FilePath        *string `json:"file_path,omitempty"`
		FileURL         *string `json:"file_url,omitempty"`
		FileSize        *uint64 `json:"file_size,omitempty"`
		DurationSeconds *uint32 `json:"duration_seconds,omitempty"`
		StartedAt       string  `json:"started_at"`
		EndedAt         *string `json:"ended_at,omitempty"`
		Error           *string `json:"error,omitempty"`
	} `json:"recordings"`
}
