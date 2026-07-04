// Package storage wraps the MinIO client so handlers don't have to wrangle
// SDK setup. Single global Storage is initialized at server startup with the
// config-provided credentials and bucket name.
package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var ErrNotConfigured = errors.New("minio storage not configured")

type MinIO struct {
	client     *minio.Client
	bucket     string
	publicBase string
}

func NewMinIO(endpoint, accessKey, secretKey, bucket, publicBase string, useSSL bool) (*MinIO, error) {
	if endpoint == "" {
		return nil, ErrNotConfigured
	}
	c, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio init: %w", err)
	}
	return &MinIO{client: c, bucket: bucket, publicBase: publicBase}, nil
}

// EnsureBucket creates the bucket if it doesn't exist yet and sets a public
// download policy so the avatar URLs are fetchable without presigning each
// view. Idempotent.
func (m *MinIO) EnsureBucket(ctx context.Context) error {
	if m == nil {
		return ErrNotConfigured
	}
	exists, err := m.client.BucketExists(ctx, m.bucket)
	if err != nil {
		return err
	}
	if !exists {
		if err := m.client.MakeBucket(ctx, m.bucket, minio.MakeBucketOptions{}); err != nil {
			return err
		}
	}
	// Public read policy on this bucket so the URL is shareable.
	policy := fmt.Sprintf(`{
		"Version": "2012-10-17",
		"Statement": [{
			"Effect": "Allow",
			"Principal": {"AWS": ["*"]},
			"Action": ["s3:GetObject"],
			"Resource": ["arn:aws:s3:::%s/*"]
		}]
	}`, m.bucket)
	return m.client.SetBucketPolicy(ctx, m.bucket, policy)
}

type PutOptions struct {
	ContentType string
	Size        int64
}

// PutObject uploads an arbitrary reader as the given object key. Returns the
// public URL clients can fetch the object from.
func (m *MinIO) PutObject(ctx context.Context, objectKey string, r io.Reader, opts PutOptions) (string, error) {
	if m == nil {
		return "", ErrNotConfigured
	}
	if opts.Size <= 0 {
		// MinIO requires a known size or -1 for streaming uploads.
		opts.Size = -1
	}
	_, err := m.client.PutObject(
		ctx,
		m.bucket,
		objectKey,
		r,
		opts.Size,
		minio.PutObjectOptions{ContentType: opts.ContentType},
	)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s/%s/%s", m.publicBase, m.bucket, objectKey), nil
}

// PresignedGet returns a temporary signed URL for fetching an object. Useful
// for private buckets; we still expose this in case the bucket policy is
// changed back to private.
func (m *MinIO) PresignedGet(ctx context.Context, objectKey string, expires time.Duration) (string, error) {
	if m == nil {
		return "", ErrNotConfigured
	}
	u, err := m.client.PresignedGetObject(ctx, m.bucket, objectKey, expires, nil)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}
