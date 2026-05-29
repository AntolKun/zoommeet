# Project Context: Video Conference App

## Overview
Membangun aplikasi video conference (mirip Zoom/Google Meet) dengan:
- **Backend**: Go + Gin + MySQL + LiveKit Server SDK + Egress (recording) + MinIO (storage)
- **Frontend**: Vite + React 19 + TypeScript + Tailwind v4 + React Router v7 + TanStack Query + LiveKit React Components
- **Mobile (rencana)**: bungkus frontend pakai Capacitor → APK/IPA
- **Infrastructure**: Docker Compose (LiveKit + Egress + MinIO + MySQL + Redis)

## Filosofi
Pakai **LiveKit self-hosted** (open source SFU dalam Go), bukan bangun WebRTC dari nol.
Fokus customisasi di layer atas: UI/UX, auth, room management, business logic.

## Developer
- Solo developer, full-time (6-8 jam/hari)
- Target: eksplor → MVP, belum tentu jadi produk komersial
- Working directory: `D:\PEKERJAAN\videoconf-app`

## Sprint Plan (6 Minggu)
1. **Sprint 1**: Foundation & Video Call Jalan ← **CURRENT**
2. **Sprint 2**: Auth & Database
3. **Sprint 3**: Room Management
4. **Sprint 4**: Meeting Features Lanjutan (opsional)
5. **Sprint 5**: Fitur Pembeda (opsional)
6. **Sprint 6**: Production Deploy (opsional, recommended)

## Status Sekarang
**Sprint 1, Hari Selasa — DONE**
- ✅ Hari Senin: Docker Compose setup (LiveKit + MySQL + Redis), folder structure, git init, commit pertama
- ✅ Hari Selasa: Go module init, struktur backend (cmd/, internal/), endpoint `/api/health` working

## Yang Belum (Hari Selasa Bagian 2 atau Hari Rabu)
- Endpoint `POST /api/token` untuk generate LiveKit JWT access token
- Frontend Next.js setup
- Halaman lobby (form nama + room)
- Halaman `/room/[name]` dengan LiveKitRoom component
- Test end-to-end: video call multi-peserta

## Struktur Project Saat Ini
```
videoconf-app/
├── docker-compose.yml          ✅
├── .gitignore                  ✅
├── README.md                   ✅
├── backend/
│   ├── go.mod                  ✅
│   ├── go.sum                  ✅
│   ├── .env                    ✅
│   ├── .env.example            ✅
│   ├── cmd/server/main.go      ✅
│   └── internal/
│       ├── config/config.go    ✅
│       ├── handlers/           (kosong, next: token.go)
│       └── middleware/cors.go  ✅
└── frontend/                   (kosong, belum diinit)
```

## Konfigurasi Penting
- LiveKit dev mode: API key `devkey`, secret `secret`
- LiveKit URL: `http://localhost:7880` (HTTP) / `ws://localhost:7880` (WebSocket)
- MySQL: `appuser:apppass@tcp(localhost:3306)/videoconf`
- Backend port: 8080
- Frontend port: 3000 (Next.js default)

## Library yang Dipakai
**Backend Go:**
- `github.com/gin-gonic/gin` - HTTP framework
- `github.com/gin-contrib/cors` - CORS middleware
- `github.com/joho/godotenv` - Load .env
- `github.com/livekit/server-sdk-go/v2` - LiveKit SDK (belum diinstall, next step)
- `github.com/livekit/protocol` - LiveKit protocol types

**Frontend (Vite + React, sudah di-setup di Sprint Frontend Hari 1):**
- `vite@8`, `react@19`, `typescript@6`
- `tailwindcss@4` + `@tailwindcss/vite` (config-less)
- `react-router-dom@7` (routing client-side)
- `@tanstack/react-query@5` (data fetching + cache untuk hit /api)
- `@livekit/components-react` - LiveKit pre-built components (akan diinstall Hari 4)
- `livekit-client` - LiveKit JS client (akan diinstall Hari 4)

## Endpoint API yang Direncanakan
- `GET /api/health` ✅ — health check
- `POST /api/token` ⏳ — generate LiveKit access token (next)
- `POST /api/auth/register` (Sprint 2)
- `POST /api/auth/login` (Sprint 2)
- `POST /api/rooms` (Sprint 3)
- `GET /api/rooms/my` (Sprint 3)

## Catatan Penting
1. **Anti-burnout rule**: Jangan kerjain lebih dari 2 hari sprint dalam 1 hari kalender. User udah agree pakai pattern ini.
2. **Go versi 386 (32-bit)**: Mungkin perlu reinstall ke amd64 nanti kalau ada library yang issue. Belum jadi blocker sekarang.
3. **Belum ada auth**: Endpoint `/api/token` di Sprint 1 belum protected. Itu intentional — auth proper baru di Sprint 2.

## Daily Routine
- Pagi: deep work coding
- Siang: istirahat 1 jam
- Sore: testing, debug, dokumentasi
- Akhir hari: update Excel sprint tracker (sheet "Progress Tracker")

## Gaya Komunikasi
- Pakai bahasa Indonesia campur (kayak ngobrol developer santai)
- Jujur dan langsung, jangan ragu push back kalau ada keputusan kurang baik
- Step-by-step instructions, jangan terlalu banyak konsep abstrak sekaligus

## Next Action
Lanjut **Hari Rabu Sprint 1**: install LiveKit Server SDK, bikin handler `/api/token`, lalu pindah ke setup frontend Next.js.

---

**File ini ditulis sebagai handoff dari percakapan Claude.ai. Update file ini setiap akhir sprint atau saat ada keputusan penting.**