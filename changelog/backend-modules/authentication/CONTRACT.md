# Kontrak Komunikasi & Protokol Global: Modul Authentication

> **Module Name:** `authentication`  
> **Target Standard:** RFC 7807 (Problem Details), RFC 6750 (OAuth 2.0 Bearer Token), RFC 7231 (HTTP Semantics)  
> **Source Evidence:** [`src/main.ts`](file:///D:/Amanah-backend/src/main.ts), [`src/app.config.ts`](file:///D:/Amanah-backend/src/app.config.ts), [`src/common/filters/problem-details.filter.ts`](file:///D:/Amanah-backend/src/common/filters/problem-details.filter.ts)  

---

## 1. Topologi Jaringan & Base URL

Dalam lingkungan lokal maupun kontainer Docker industri, backend diekspos melalui spesifikasi berikut:

* **Local Base URL (Docker / Direct):** `http://localhost:3001`
* **Local Alternative:** `http://127.0.0.1:3001`
* **Production Base URL:** Ditetapkan via environment variable `BACKEND_DOMAIN` (misal: `https://api.amanah.health`)
* **Transport:** HTTP/1.1 & HTTP/2 over TLS (HTTPS pada lingkungan staging & produksi)
* **Encoding:** UTF-8 (`application/json; charset=utf-8`)

---

## 2. Struktur Routing & Prefiks API

Aplikasi menggunakan pengaturan global NestJS sebagai berikut:

```typescript
// Bukti: src/main.ts baris 46-56
app.setGlobalPrefix('api', {
  exclude: ['/'],
});
app.enableVersioning({
  type: VersioningType.URI,
});
```

### Aturan Resolusi URI:
1. **Engine A: Kanonikal JWT API**
   * Format URI: `/api/v1/auth/{subpath}`
   * Versi eksplisit: `v1` (wajib ada pada path).
   * Contoh valid: `POST http://localhost:3001/api/v1/auth/email/login`
   * Contoh **salah**: `/auth/email/login` (404) atau `/api/auth/email/login` (404/BetterAuth conflict).

2. **Engine B: Better Auth Engine**
   * Format URI: `/api/auth/{subpath}`
   * Versi: `VERSION_NEUTRAL` (tanpa prefix versi `v1`).
   * Controller mengekspos `@Controller({ path: 'auth', version: VERSION_NEUTRAL })` pada [`src/auth/better-auth/better-auth.controller.ts`](file:///D:/Amanah-backend/src/auth/better-auth/better-auth.controller.ts#L8-L12).
   * Contoh valid: `POST http://localhost:3001/api/auth/sign-in/email`

---

## 3. Spesifikasi HTTP Headers

### Request Headers

| Header | Wajib / Opsional | Tipe Data | Deskripsi & Aturan |
| :--- | :---: | :--- | :--- |
| `Content-Type` | **Wajib** (pada `POST`/`PATCH`) | `string` | Harus bernilai `application/json`. Payload form-data akan ditolak kecuali untuk endpoint upload file. |
| `Accept` | Disarankan | `string` | Disarankan `application/json, application/problem+json`. |
| `Authorization` | **Wajib** (pada endpoint terproteksi) | `string` | Skema Bearer token standar RFC 6750: `Bearer <token>`. Digunakan oleh `GET /api/v1/auth/me`, `POST /api/v1/auth/refresh`, serta rute Better Auth bearer. |
| `x-correlation-id` | Opsional (Disarankan) | `UUID v4` | Header penelusuran terdistribusi (Distributed Tracing). Jika frontend tidak menyertakannya, backend akan meng-generate ID acak dan mengembalikannya pada response header. |
| `Idempotency-Key` | Opsional | `UUID v4` / `string` | Kunci idempotensi untuk mencegah duplicate charge / form submission ganda pada jaringan yang tidak stabil. Disimpan pada cache Redis selama 24 jam. |

### Response Headers

| Header | Nilai Contoh | Penjelasan |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` atau `application/problem+json` | Media type resmi payload. Error terpusat selalu menggunakan `application/problem+json`. |
| `x-correlation-id` | `3fa85f64-5717-4562-b3fc-2c963f66afa6` | ID unik pelacakan transaksi, sangat berguna saat melaporkan isu produksi ke Sentry / Datadog. |
| `Cache-Control` | `no-store, no-cache, must-revalidate` | Seluruh endpoint autentikasi wajib mematikan browser caching untuk mencegah kebocoran kredensial. |
| `X-RateLimit-Limit` | `100` | Batas maksimum request dalam satu time window. |
| `X-RateLimit-Remaining`| `98` | Sisa kuota request yang diizinkan. |
| `X-RateLimit-Reset` | `1726707600` | Waktu Unix Epoch saat kuota di-reset kembali. |

---

## 4. Format Envelope Response

### A. Pola Response Berhasil (Engine A: Kanonikal JWT)

Endpoint Kanonikal JWT **tidak menggunakan wrapping arbitrary** seperti `{ data: ... }`. Response langsung mengembalikan DTO data murni.

Contoh `POST /api/v1/auth/email/login`:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenExpires": 1726794000000,
  "user": {
    "id": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
    "email": "dr.ahmad@amanah-healthcare.local",
    "systemRole": "STAF",
    "role": {
      "id": 2,
      "name": "STAF"
    },
    "staff": {
      "id": "993f4a36-7c16-43e9-9133-14b2d56a2977",
      "fullName": "dr. Ahmad Fauzi, Sp.A",
      "positionTitle": "Dokter Spesialis Anak"
    },
    "patient": null
  }
}
```

### B. Pola Response Error Terpusat (RFC 7807 Problem Details)

Setiap exception yang terjadi pada rute `/api/v1/*` ditangkap oleh [`ProblemDetailsFilter`](file:///D:/Amanah-backend/src/common/filters/problem-details.filter.ts) dan diformat menjadi spesifikasi **RFC 7807**:

```json
{
  "type": "https://amanah.health/errors/validation_failed",
  "title": "Unprocessable Entity",
  "status": 422,
  "statusCode": 422,
  "detail": "Form validation failed for one or more fields.",
  "message": "Form validation failed for one or more fields.",
  "instance": "/api/v1/auth/email/login",
  "code": "VALIDATION_FAILED",
  "invalidParams": [
    {
      "name": "password",
      "reason": "incorrectPassword",
      "code": "INVALID_VALUE"
    }
  ],
  "traceId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "timestamp": "2026-09-19T00:52:00.000Z"
}
```

### C. Pola Response Better Auth (Engine B)

Rute `/api/auth/*` dikelola langsung oleh handler Better Auth. Response sukses dan error mengikuti spesifikasi standar Better Auth:

* **Sukses (`GET /api/auth/get-session`):**
  ```json
  {
    "session": {
      "id": "bfa04e22-cb58-47bc-8c4d-6e1d4be2a7a1",
      "userId": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
      "expiresAt": "2026-09-26T00:52:00.000Z"
    },
    "user": {
      "id": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
      "email": "dr.ahmad@amanah-healthcare.local",
      "name": "dr. Ahmad Fauzi, Sp.A",
      "role": "staffDoctor"
    }
  }
  ```
* **Error (`POST /api/auth/sign-in/email` dengan sandi salah):**
  ```json
  {
    "error": {
      "status": 401,
      "message": "Invalid email or password"
    }
  }
  ```

---

## 5. Kebijakan Rate Limiting & Keamanan

Backend menerapkan sliding-window rate limiting yang didukung oleh Redis:

* **Aturan Global:** Maksimum 100 request / 60 detik per IP.
* **Aturan Khusus Better Auth (`auth.ts`):**
  * `/sign-in/email`: Maksimum **5 request / 60 detik** (mencegah brute force password).
  * `/sign-in/social`: Maksimum **10 request / 60 detik**.
  * `/send-verification-email`: Maksimum **20 request / 60 detik**.
* **Respons Saat Limit Tercapai (HTTP 429 Too Many Requests):**
  ```json
  {
    "type": "https://amanah.health/errors/rate_limit_exceeded",
    "title": "Too Many Requests",
    "status": 429,
    "statusCode": 429,
    "detail": "Rate limit exceeded. Try again later.",
    "code": "RATE_LIMIT_EXCEEDED",
    "retryAfter": 45,
    "traceId": "c49a1d95-21d3-4fc6-b8db-8c7676643033",
    "timestamp": "2026-09-19T00:52:10.000Z"
  }
  ```
