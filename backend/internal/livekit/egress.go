package livekit

import (
	"context"

	livekit "github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
)

type EgressClient struct {
	c *lksdk.EgressClient
}

func NewEgressClient(apiURL, apiKey, apiSecret string) *EgressClient {
	return &EgressClient{
		c: lksdk.NewEgressClient(apiURL, apiKey, apiSecret),
	}
}

type EgressInfo struct {
	EgressID string `json:"egress_id"`
	Status   string `json:"status"`
	RoomName string `json:"room_name"`
	Filepath string `json:"filepath"`
}

// StartRoomComposite kicks off a room-composite recording. Storage is taken
// from the Egress service's default config (egress.yaml -> s3) since we don't
// set per-request output credentials.
func (e *EgressClient) StartRoomComposite(ctx context.Context, room, filepath string) (*EgressInfo, error) {
	req := &livekit.RoomCompositeEgressRequest{
		RoomName: room,
		Layout:   "grid",
		FileOutputs: []*livekit.EncodedFileOutput{
			{
				FileType: livekit.EncodedFileType_MP4,
				Filepath: filepath,
			},
		},
	}

	info, err := e.c.StartRoomCompositeEgress(ctx, req)
	if err != nil {
		return nil, err
	}

	return &EgressInfo{
		EgressID: info.EgressId,
		Status:   info.Status.String(),
		RoomName: info.RoomName,
		Filepath: filepath,
	}, nil
}

func (e *EgressClient) Stop(ctx context.Context, egressID string) (*EgressInfo, error) {
	info, err := e.c.StopEgress(ctx, &livekit.StopEgressRequest{EgressId: egressID})
	if err != nil {
		return nil, err
	}
	return &EgressInfo{
		EgressID: info.EgressId,
		Status:   info.Status.String(),
		RoomName: info.RoomName,
	}, nil
}

func (e *EgressClient) Get(ctx context.Context, egressID string) (*EgressInfo, error) {
	res, err := e.c.ListEgress(ctx, &livekit.ListEgressRequest{EgressId: egressID})
	if err != nil {
		return nil, err
	}
	if len(res.Items) == 0 {
		return nil, nil
	}
	info := res.Items[0]
	return &EgressInfo{
		EgressID: info.EgressId,
		Status:   info.Status.String(),
		RoomName: info.RoomName,
	}, nil
}
