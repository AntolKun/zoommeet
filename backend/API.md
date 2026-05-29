# Videoconf Backend — API Reference

Backend Go + Gin yang nyediain auth, room management, chat persistence, host controls, dan recording untuk aplikasi video conference berbasis LiveKit.

- **Base URL (dev)**: `http://localhost:8080`
- **Auth scheme**: Bearer JWT di header `Authorization: Bearer <token>`
- **Content-Type**: `application/json` untuk semua request body
- **Format**: Semua response JSON. Error pakai shape `{"error": "<message>"}`.

---

## Daftar isi

1. [Konsep dasar](#konsep-dasar)
2. [Endpoint summary](#endpoint-summary)
3. [Health](#health)
4. [Auth — register, login](#auth)
5. [LiveKit token — join room](#livekit-token)
6. [Rooms — CRUD](#rooms)
7. [Chat — pesan persistent per room](#chat)
8. [Host controls — lock, mute, kick, list participants](#host-controls)
9. [Recordings — start, stop, list, get](#recordings)
10. [Model shapes](#model-shapes)
11. [Error codes](#error-codes)

---

## Konsep dasar

### Dua jenis JWT
Aplikasi pake **dua JWT yang beda jangan sampai ketuker**:

| JWT | Issued by | Pakai untuk | Header |
|---|---|---|---|
| **App JWT** | Backend (`/auth/login` atau `/auth/register`) | Otentikasi ke endpoint backend kita | `Authorization: Bearer <app_jwt>` |
| **LiveKit JWT** | Backend (`/api/token`) — di-sign pake LiveKit API secret | Connect ke LiveKit server (WebRTC media) di frontend | dipass langsung ke `<LiveKitRoom token={...} />` |

Flow normal: user login ke backend → dapet **app JWT** → fetch `/api/token` (sambil bawa app JWT) → dapet **LiveKit JWT** → frontend connect ke LiveKit server.

### Akses room
- **Public room** (`is_public=true`): siapa aja yang udah login bisa join + kirim chat.
- **Private room** (`is_public=false`): cuma owner yang bisa join + kirim chat + lihat history.
- **Locked room** (`is_locked=true`): walaupun public, non-owner gak bisa dapet LiveKit token sampai owner unlock. Owner tetep bisa join.

### Owner-only operations
Yang **cuma owner** boleh: delete room, lock/unlock, list participants, mute, kick, semua endpoint recording.

### Rate limit
- `POST /api/auth/register` dan `POST /api/auth/login` di-rate-limit **per client IP**: burst **5 request**, refill **5 req / menit**. Lewat itu dapet `429 Too Many Requests`.
- Endpoint lain belum di-rate-limit (MVP).

---

## Endpoint summary

| Method | Path | Auth | Owner only | Fungsi |
|---|---|---|---|---|
| `GET` | `/api/health` | — | — | Health check |
| `POST` | `/api/auth/register` | — | — | Bikin user baru |
| `POST` | `/api/auth/login` | — | — | Login dapet app JWT |
| `POST` | `/api/token` | ✅ | — | Generate LiveKit token buat join room |
| `POST` | `/api/rooms` | ✅ | — | Bikin room baru |
| `GET` | `/api/rooms/my` | ✅ | — | List room milik user yang login |
| `GET` | `/api/rooms/:idOrSlug` | ✅ | sebagian | Detail room |
| `DELETE` | `/api/rooms/:idOrSlug` | ✅ | ✅ | Hapus room |
| `POST` | `/api/rooms/:idOrSlug/messages` | ✅ | sebagian | Kirim chat |
| `GET` | `/api/rooms/:idOrSlug/messages` | ✅ | sebagian | List chat history |
| `POST` | `/api/rooms/:idOrSlug/lock` | ✅ | ✅ | Lock room |
| `POST` | `/api/rooms/:idOrSlug/unlock` | ✅ | ✅ | Unlock room |
| `GET` | `/api/rooms/:idOrSlug/participants` | ✅ | ✅ | List participant aktif (dari LiveKit) |
| `POST` | `/api/rooms/:idOrSlug/participants/:identity/mute` | ✅ | ✅ | Mute/unmute track participant |
| `DELETE` | `/api/rooms/:idOrSlug/participants/:identity` | ✅ | ✅ | Kick participant dari room |
| `POST` | `/api/rooms/:idOrSlug/recordings` | ✅ | ✅ | Mulai recording |
| `GET` | `/api/rooms/:idOrSlug/recordings` | ✅ | ✅ | List recording per room |
| `POST` | `/api/recordings/:id/stop` | ✅ | ✅ | Stop recording |
| `GET` | `/api/recordings/:id` | ✅ | ✅ | Detail recording |

`:idOrSlug` = bisa pakai numeric room ID (`123`) atau slug (`weekly-standup`). Backend auto-detect berdasarkan apakah string-nya integer.

---

<a id="health"></a>

## Health

### `GET /api/health`

Cek apakah backend hidup. Gak butuh auth. Berguna buat liveness probe / docker healthcheck.

**Response 200:**
```json
{
  "status": "ok",
  "service": "videoconf-backend"
}
```

---

<a id="auth"></a>

## Auth

### `POST /api/auth/register`

Bikin user baru. Email harus unik. Password di-hash pake bcrypt (cost 10). Sukses langsung dapet app JWT (gak perlu login lagi setelah register).

**Request body:**
```json
{
  "email": "alice@example.com",
  "password": "minimum8chars",
  "display_name": "Alice"
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `email` | string | ✅ | format email, unik di DB |
| `password` | string | ✅ | min 8 char |
| `display_name` | string | ✅ | 1–100 char |

**Response 201 Created:**
```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": 1,
    "email": "alice@example.com",
    "display_name": "Alice"
  }
}
```

**Errors:**
- `400` — body invalid / field missing / password kurang dari 8
- `409` — email udah dipake user lain
- `429` — rate limit kena (>5 attempt dalam ~1 menit)

---

### `POST /api/auth/login`

Login pake email + password. Sukses dapet app JWT yang valid 24 jam.

**Request body:**
```json
{
  "email": "alice@example.com",
  "password": "minimum8chars"
}
```

**Response 200:**
```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": 1,
    "email": "alice@example.com",
    "display_name": "Alice"
  }
}
```

**Errors:**
- `400` — body invalid
- `401` — email gak ketemu **atau** password salah (sengaja generic biar gak gampang ditebak email mana yang exist)
- `429` — rate limit

---

<a id="livekit-token"></a>

## LiveKit Token

### `POST /api/token`

Generate LiveKit JWT buat join room. Backend cek dulu user authorized buat room ini (owner kalau private, anyone kalau public, bukan locked). Token valid 6 jam, identity = user.id (string), name = display_name.

**Headers:** `Authorization: Bearer <app_jwt>`

**Request body:**
```json
{
  "room": "alice-standup"
}
```
`room` bisa slug atau numeric ID.

**Response 200:**
```json
{
  "token": "eyJhbGciOi...",
  "url": "ws://localhost:7880",
  "room": "alice-standup"
}
```

Frontend pake response ini langsung di `<LiveKitRoom serverUrl={url} token={token}>`.

**Errors:**
- `400` — body invalid
- `401` — app JWT invalid/missing
- `403` — room private dan user bukan owner; **atau** room locked dan user bukan owner
- `404` — room gak ada

---

<a id="rooms"></a>

## Rooms

### `POST /api/rooms`

Bikin room baru. User yang login otomatis jadi owner.

**Headers:** `Authorization: Bearer <app_jwt>`

**Request body:**
```json
{
  "name": "Weekly Standup",
  "slug": "weekly-standup",
  "is_public": false
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `name` | string | ✅ | 1–150 char |
| `slug` | string | ❌ | 4–64 char, lowercase alphanumeric + `-`, harus mulai/akhir dengan alphanumeric. Kalau kosong, backend generate random shortuuid. |
| `is_public` | bool | ❌ | default `false` |

**Response 201:** [Room object](#model-room).

**Errors:**
- `400` — slug pattern invalid / name kosong
- `409` — slug udah dipake room lain

---

### `GET /api/rooms/my`

List semua room yang dimiliki user yang login, urut dari yang paling baru.

**Response 200:**
```json
{
  "rooms": [
    { "id": 1, "slug": "alice-private", "name": "Alice Private", ... },
    ...
  ]
}
```

---

### `GET /api/rooms/:idOrSlug`

Detail satu room. Kalau private, cuma owner yang bisa lihat.

**Response 200:** [Room object](#model-room).

**Errors:** `403` (private + bukan owner), `404` (gak ada).

---

### `DELETE /api/rooms/:idOrSlug`

Hapus room. **Owner only**. Cascading delete: messages + recordings ikut kehapus (ON DELETE CASCADE di FK).

**Response 204** (no content).

**Errors:** `403` (bukan owner), `404`.

---

<a id="chat"></a>

## Chat

Chat di-persist ke MySQL biar history-nya gak hilang setelah meeting selesai. Real-time delivery di-handle LiveKit data channel di frontend (kirim message via data channel + POST ke backend buat persist).

### `POST /api/rooms/:idOrSlug/messages`

Kirim chat ke room. Akses control sama kayak join: owner private OK, anyone untuk public.

**Request body:**
```json
{
  "body": "Halo semua!"
}
```

| Field | Constraint |
|---|---|
| `body` | non-kosong setelah trim, max 2000 char |

**Response 201:** [Message object](#model-message) dengan `sender_name` ke-include.

**Errors:** `400` (body kosong/kepanjangan), `403`, `404`.

---

### `GET /api/rooms/:idOrSlug/messages`

List chat history, **paling baru duluan** (DESC by id). Pakai cursor pagination via `before`.

**Query params:**

| Param | Type | Default | Note |
|---|---|---|---|
| `limit` | int | 50 | max 200 |
| `before` | uint | — | kalau diisi, return message dengan `id < before`. Pakai id paling tua dari page sebelumnya. |

**Response 200:**
```json
{
  "messages": [
    {
      "id": 8,
      "room_id": 4,
      "sender_id": 1,
      "body": "msg-5",
      "created_at": "2026-05-02T21:57:01Z",
      "sender_name": "Alice"
    },
    ...
  ]
}
```

**Pagination flow contoh:**
1. `GET /messages?limit=20` → return id 100..81
2. `GET /messages?limit=20&before=81` → return id 80..61
3. dst, sampai response array kosong

**Errors:** `403`, `404`.

---

<a id="host-controls"></a>

## Host Controls

Semua endpoint di section ini **owner only**. Lock disimpan di DB app (efek: blokir issuance LiveKit token). Mute/kick passthrough ke LiveKit RoomService API.

### `POST /api/rooms/:idOrSlug/lock` & `POST /api/rooms/:idOrSlug/unlock`

Toggle lock state room. Locked = `/api/token` reject non-owner.

**Response 200:**
```json
{ "is_locked": true }
```

**Catatan:** lock gak ngusir participant yang udah connect ke LiveKit. Buat itu, lo perlu kombinasikan: `POST lock` + iterate `participants` + `DELETE` (kick) tiap non-owner.

---

### `GET /api/rooms/:idOrSlug/participants`

List participant yang lagi connect ke LiveKit room (live state — dari LiveKit, bukan dari DB).

**Response 200:**
```json
{
  "participants": [
    {
      "sid": "PA_xxx",
      "identity": "1",
      "name": "Alice",
      "state": "ACTIVE",
      "joined_at": 1714000000,
      "tracks": [
        { "sid": "TR_xxx", "type": "AUDIO", "source": "MICROPHONE", "muted": false },
        { "sid": "TR_yyy", "type": "VIDEO", "source": "CAMERA", "muted": false }
      ]
    }
  ]
}
```

`identity` di sini = user.id app kita (string). Inget itu pas mau call mute/kick.

---

### `POST /api/rooms/:idOrSlug/participants/:identity/mute`

Mute (atau unmute) **semua track** participant matching source.

**Path param:** `identity` = identity participant di LiveKit (= app user.id).

**Request body:**
```json
{
  "source": "audio",
  "muted": true
}
```

| Field | Constraint |
|---|---|
| `source` | `"audio"` \| `"video"` \| `""` (= all) |
| `muted` | `true` = mute, `false` = unmute |

Backend list tracks participant, filter by source, terus call LiveKit `MutePublishedTrack` per track yang match.

**Response 200:**
```json
{ "muted_tracks": 1 }
```

**Errors:**
- `400` — source value invalid
- `403` — bukan owner
- `404` — participant gak ada di room (gak connect)
- `502` — LiveKit unreachable / error

---

### `DELETE /api/rooms/:idOrSlug/participants/:identity`

Kick participant dari LiveKit room. Forced disconnect, participant bisa rejoin kalau room masih unlocked.

**Response 204.**

**Errors:** `403`, `502`.

---

<a id="recordings"></a>

## Recordings

Pake **LiveKit Egress** (room composite mode) → MP4 → upload ke MinIO bucket `recordings`. Owner only. Egress cuma kerja kalo ada participant aktif di room — kalo room kosong, `start` bakal return `502 ... requested room does not exist`.

### `POST /api/rooms/:idOrSlug/recordings`

Mulai recording room composite (grid layout). Backend call Egress API, simpan `egress_id` ke DB, return record dengan status `starting`.

**Response 201:** [Recording object](#model-recording) dengan `status: "starting"`.

**Errors:**
- `403` — bukan owner
- `404` — room gak ada
- `502` — Egress error (room gak aktif, dll)

---

### `POST /api/recordings/:id/stop`

Stop recording yang lagi jalan. Owner-only (cek via room.owner_id). Backend call Egress stop, update status ke `ending`. Status bakal jadi `complete` kalo file sukses ke-upload (untuk ini sekarang manual update — auto-update via webhook bisa di-add nanti).

**Response 200:** [Recording object](#model-recording) updated.

**Errors:** `403`, `404`, `502`.

---

### `GET /api/rooms/:idOrSlug/recordings`

List semua recording untuk satu room, urut dari paling baru (DESC by `started_at`).

**Response 200:**
```json
{
  "recordings": [
    { "id": 1, "egress_id": "EG_xxx", "status": "complete", ... }
  ]
}
```

---

### `GET /api/recordings/:id`

Detail satu recording. Owner-only.

**Response 200:** [Recording object](#model-recording).

**Errors:** `403`, `404`.

---

<a id="model-shapes"></a>

## Model shapes

<a id="model-room"></a>

### Room
```json
{
  "id": 1,
  "slug": "weekly-standup",
  "name": "Weekly Standup",
  "owner_id": 1,
  "is_public": false,
  "is_locked": false,
  "created_at": "2026-05-02T21:44:48Z",
  "updated_at": "2026-05-02T21:44:48Z"
}
```

<a id="model-message"></a>

### Message
```json
{
  "id": 1,
  "room_id": 4,
  "sender_id": 1,
  "body": "Halo!",
  "created_at": "2026-05-02T21:57:00Z",
  "sender_name": "Alice"
}
```
`sender_name` di-JOIN dari tabel users — selalu ada untuk message yang baru-baru di-fetch dari API.

<a id="model-recording"></a>

### Recording
```json
{
  "id": 1,
  "room_id": 4,
  "egress_id": "EG_xxx",
  "status": "complete",
  "started_by": 1,
  "file_path": "weekly-standup/20260502-215701.mp4",
  "file_url": "http://minio:9000/recordings/weekly-standup/20260502-215701.mp4",
  "file_size": 12345678,
  "duration_seconds": 120,
  "started_at": "2026-05-02T21:57:01Z",
  "ended_at": "2026-05-02T21:59:01Z",
  "error": null
}
```

| Field | Possible values |
|---|---|
| `status` | `starting` \| `active` \| `ending` \| `complete` \| `failed` |
| `file_path`, `file_url`, `file_size`, `duration_seconds`, `ended_at` | null sampai recording complete |
| `error` | non-null kalau status `failed` |

---

<a id="error-codes"></a>

## Error codes

| HTTP | Arti | Contoh |
|---|---|---|
| `400` | Bad request — body invalid, field constraint kelewat | `password` < 8 char, `slug` regex gak match |
| `401` | Unauthorized — JWT missing/invalid/expired, atau credential salah | Tanpa `Authorization` header, login password salah |
| `403` | Forbidden — udah login tapi gak boleh akses resource ini | Non-owner akses private room, non-owner mute participant |
| `404` | Not found — resource gak ada | Slug room salah ketik |
| `409` | Conflict — duplicate yang harusnya unik | Email ke-double saat register, slug ke-double saat create room |
| `429` | Too many requests — rate limit kena | Spam `/auth/login` |
| `500` | Server error — bug di backend / DB error | Cek server log |
| `502` | Bad gateway — error dari upstream service (LiveKit/Egress) | Egress mute participant tapi LiveKit unreachable |

Semua error pakai shape:
```json
{ "error": "<human-readable message>" }
```

---

## Quick test pakai PowerShell

```powershell
$base = "http://localhost:8080/api"

# Register & dapet token
$reg = Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" `
  -Body (@{ email="alice@test.com"; password="password123"; display_name="Alice" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($reg.token)" }

# Bikin room
$room = Invoke-RestMethod -Uri "$base/rooms" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ name="Standup"; slug="standup"; is_public=$true } | ConvertTo-Json)

# Generate LiveKit token
$tok = Invoke-RestMethod -Uri "$base/token" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ room="standup" } | ConvertTo-Json)
"$($tok.url) / $($tok.token.Substring(0, 30))..."
```
