package livekit

import (
	"context"
	"errors"
	"fmt"

	livekit "github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
)

var ErrParticipantNotFound = errors.New("participant not found")

type Client struct {
	rooms *lksdk.RoomServiceClient
}

func NewClient(apiURL, apiKey, apiSecret string) *Client {
	return &Client{
		rooms: lksdk.NewRoomServiceClient(apiURL, apiKey, apiSecret),
	}
}

type Participant struct {
	SID      string `json:"sid"`
	Identity string `json:"identity"`
	Name     string `json:"name"`
	State    string `json:"state"`
	JoinedAt int64  `json:"joined_at"`
	Tracks   []Track `json:"tracks"`
}

type Track struct {
	SID    string `json:"sid"`
	Type   string `json:"type"`
	Source string `json:"source"`
	Muted  bool   `json:"muted"`
}

func (c *Client) ListParticipants(ctx context.Context, room string) ([]Participant, error) {
	res, err := c.rooms.ListParticipants(ctx, &livekit.ListParticipantsRequest{Room: room})
	if err != nil {
		return nil, err
	}

	out := make([]Participant, 0, len(res.Participants))
	for _, p := range res.Participants {
		tracks := make([]Track, 0, len(p.Tracks))
		for _, t := range p.Tracks {
			tracks = append(tracks, Track{
				SID:    t.Sid,
				Type:   t.Type.String(),
				Source: t.Source.String(),
				Muted:  t.Muted,
			})
		}
		out = append(out, Participant{
			SID:      p.Sid,
			Identity: p.Identity,
			Name:     p.Name,
			State:    p.State.String(),
			JoinedAt: p.JoinedAt,
			Tracks:   tracks,
		})
	}
	return out, nil
}

// MuteParticipant mutes (or unmutes) all tracks of a participant matching the given source.
// source can be "audio", "video", or empty for all media tracks.
func (c *Client) MuteParticipant(ctx context.Context, room, identity, source string, muted bool) (int, error) {
	res, err := c.rooms.ListParticipants(ctx, &livekit.ListParticipantsRequest{Room: room})
	if err != nil {
		return 0, err
	}

	var target *livekit.ParticipantInfo
	for _, p := range res.Participants {
		if p.Identity == identity {
			target = p
			break
		}
	}
	if target == nil {
		return 0, ErrParticipantNotFound
	}

	count := 0
	for _, t := range target.Tracks {
		if !matchesSource(t.Type, source) {
			continue
		}
		_, err := c.rooms.MutePublishedTrack(ctx, &livekit.MuteRoomTrackRequest{
			Room:     room,
			Identity: identity,
			TrackSid: t.Sid,
			Muted:    muted,
		})
		if err != nil {
			return count, fmt.Errorf("mute track %s: %w", t.Sid, err)
		}
		count++
	}
	return count, nil
}

func matchesSource(trackType livekit.TrackType, source string) bool {
	switch source {
	case "":
		return true
	case "audio":
		return trackType == livekit.TrackType_AUDIO
	case "video":
		return trackType == livekit.TrackType_VIDEO
	}
	return false
}

func (c *Client) RemoveParticipant(ctx context.Context, room, identity string) error {
	_, err := c.rooms.RemoveParticipant(ctx, &livekit.RoomParticipantIdentity{
		Room:     room,
		Identity: identity,
	})
	return err
}
