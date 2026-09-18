# Katalog Galat Terpusat: Modul Authentication

> **Standard:** RFC 7807 (Problem Details for HTTP APIs)  
> **Source Evidence:** [`src/common/filters/problem-details.filter.ts`](file:///D:/Amanah-backend/src/common/filters/problem-details.filter.ts), [`src/auth/auth.service.ts`](file:///D:/Amanah-backend/src/auth/auth.service.ts), [`src/auth/better-auth/auth.ts`](file:///D:/Amanah-backend/src/auth/better-auth/auth.ts)  

---

## 1. Arsitektur Error Envelope

Modul autentikasi memiliki dua bentuk format envelope galat tergantung pada engine yang dipanggil:

### Format A: RFC 7807 Problem Details (Engine A — `/api/v1/auth/*`)
Header respons: `Content-Type: application/problem+json`

```typescript
export interface ProblemDetails {
  type: string;            // URI dokumentasi error (misal: "https://amanah.health/errors/validation_failed")
  title: string;           // Judul status HTTP (misal: "Unprocessable Entity")
  status: number;          // Kode HTTP numerik standar (misal: 422)
  statusCode: number;      // Backward-compatible alias untuk status
  detail: string;          // Penjelasan manusiawi mengenai galat
  message: string;         // Backward-compatible alias untuk detail
  instance: string;        // Path endpoint yang memicu galat (misal: "/api/v1/auth/email/login")
  code: string;            // Machine-readable kode unik galat (misal: "VALIDATION_FAILED")
  invalidParams?: Array<{  // Array rincian kegagalan per input field
    name: string;          // Nama field (misal: "email", "password")
    reason: string;        // Alasan kegagalan (misal: "notFound", "incorrectPassword")
    code?: string;         // Klasifikasi galat ("INVALID_VALUE")
  }>;
  retryAfter?: number;     // Detik tersisa sebelum boleh request ulang (pada 429)
  traceId: string;         // UUID penelusuran terdistribusi (Distributed Trace ID)
  timestamp: string;       // ISO 8601 UTC timestamp
}
```

### Format B: Better Auth Error (Engine B — `/api/auth/*`)
Header respons: `Content-Type: application/json`

```json
{
  "error": {
    "status": 401,
    "message": "Invalid email or password"
  }
}
```

---

## 2. Katalog Galat Terverifikasi

Tabel berikut mendokumentasikan setiap kondisi error yang dapat terjadi pada modul autentikasi:

| HTTP Status | Machine Code | Instance / Kondisi | Indikator Field (`invalidParams`) | Detail Pesan Backend |
| :---: | :--- | :--- | :--- | :--- |
| **`422`** | `VALIDATION_FAILED` | Login: Email tidak terdaftar di database | `name: "email"`, `reason: "notFound"` | *"Form validation failed for one or more fields."* |
| **`422`** | `VALIDATION_FAILED` | Login: Akun tidak memiliki credential password hash | `name: "password"`, `reason: "incorrectPassword"` | *"Form validation failed for one or more fields."* |
| **`422`** | `VALIDATION_FAILED` | Login: Hash sandi tidak cocok (`bcrypt.compare` false) | `name: "password"`, `reason: "incorrectPassword"` | *"Form validation failed for one or more fields."* |
| **`422`** | `VALIDATION_FAILED` | Forgot Password: Email tidak ditemukan di database | `name: "email"`, `reason: "emailNotExists"` | *"Form validation failed for one or more fields."* |
| **`422`** | `VALIDATION_FAILED` | Request DTO: Format email tidak valid | `name: "payload"`, `reason: "email must be an email"` | *"Validation failed for one or more fields."* |
| **`422`** | `VALIDATION_FAILED` | Request DTO: Password kosong | `name: "payload"`, `reason: "password should not be empty"` | *"Validation failed for one or more fields."* |
| **`401`** | `UNAUTHENTICATED` | Profil `me`: Header Authorization tidak disertakan | - | *"Unauthorized"* |
| **`401`** | `UNAUTHENTICATED` | Profil `me`: Access token kedaluwarsa atau signature palsu | - | *"Unauthorized"* |
| **`401`** | `UNAUTHENTICATED` | Refresh token: Token kedaluwarsa atau bukan refresh token valid | - | *"Unauthorized"* |
| **`401`** | `UNAUTHENTICATED` | Better Auth: Akun diblokir (`session.user.banned = true`) | - | *"Akun Anda dinonaktifkan. Hubungi administrator Amanah."* |
| **`403`** | `FORBIDDEN` | Core RBAC: Peran tidak memenuhi `@Roles('ADMIN')` | - | *"Forbidden resource"* |
| **`403`** | `FORBIDDEN` | Better Auth RBAC: Tidak memiliki hak role / hak permissions | - | *"Insufficient permissions: requires ..."* |
| **`429`** | `RATE_LIMIT_EXCEEDED`| Melebihi kuota request sliding-window (Redis) | - | *"Rate limit exceeded. Try again later."* |
| **`500`** | `INTERNAL_SERVER_ERROR` | Masalah infrastruktur tak terduga (koneksi database putus) | - | *"An internal server error occurred."* |

---

## 3. Contoh Payload Respons Galat Aktual

### A. Galat Kata Sandi Salah (HTTP 422)
```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json; charset=utf-8
x-correlation-id: d4b39e31-8975-430c-8d51-874b62db4811
Cache-Control: no-store

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
  "traceId": "d4b39e31-8975-430c-8d51-874b62db4811",
  "timestamp": "2026-09-19T00:52:30.123Z"
}
```

### B. Galat Email Pemulihan Tidak Ada (HTTP 422)
```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json; charset=utf-8
x-correlation-id: f9c54e12-4521-4f1b-87cc-619f7142b918
Cache-Control: no-store

{
  "type": "https://amanah.health/errors/validation_failed",
  "title": "Unprocessable Entity",
  "status": 422,
  "statusCode": 422,
  "detail": "Form validation failed for one or more fields.",
  "message": "Form validation failed for one or more fields.",
  "instance": "/api/v1/auth/forgot/password",
  "code": "VALIDATION_FAILED",
  "invalidParams": [
    {
      "name": "email",
      "reason": "emailNotExists",
      "code": "INVALID_VALUE"
    }
  ],
  "traceId": "f9c54e12-4521-4f1b-87cc-619f7142b918",
  "timestamp": "2026-09-19T00:52:31.456Z"
}
```

### C. Galat Token Kedaluwarsa (HTTP 401)
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/problem+json; charset=utf-8
x-correlation-id: 8812af03-1002-411a-82ee-cc99981293bf
Cache-Control: no-store

{
  "type": "https://amanah.health/errors/unauthenticated",
  "title": "Unauthorized",
  "status": 401,
  "statusCode": 401,
  "detail": "Unauthorized",
  "message": "Unauthorized",
  "instance": "/api/v1/auth/me",
  "code": "UNAUTHENTICATED",
  "traceId": "8812af03-1002-411a-82ee-cc99981293bf",
  "timestamp": "2026-09-19T00:52:32.789Z"
}
```

### D. Galat Rate Limiting (HTTP 429)
```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json; charset=utf-8
x-correlation-id: a123ffaa-5522-4bb3-93ef-281bba103322
Retry-After: 35
Cache-Control: no-store

{
  "type": "https://amanah.health/errors/rate_limit_exceeded",
  "title": "Too Many Requests",
  "status": 429,
  "statusCode": 429,
  "detail": "Rate limit exceeded. Try again later.",
  "message": "Rate limit exceeded. Try again later.",
  "instance": "/api/v1/auth/email/login",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 35,
  "traceId": "a123ffaa-5522-4bb3-93ef-281bba103322",
  "timestamp": "2026-09-19T00:52:33.012Z"
}
```

---

## 4. Kamus Penerjemahan Galat untuk Frontend (i18n / UX)

Frontend disarankan memetakan nilai `reason` pada `invalidParams` ke pesan antarmuka pengguna dalam Bahasa Indonesia berikut:

```typescript
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  notFound: 'Alamat email tidak terdaftar dalam sistem.',
  incorrectPassword: 'Kata sandi yang Anda masukkan salah.',
  emailNotExists: 'Email tidak ditemukan. Pastikan Anda memasukkan email yang terdaftar.',
  'email must be an email': 'Format alamat email tidak valid.',
  'password should not be empty': 'Kata sandi wajib diisi.',
  'password must be longer than or equal to 6 characters': 'Kata sandi minimal terdiri dari 6 karakter.',
  UNAUTHENTICATED: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  FORBIDDEN: 'Anda tidak memiliki hak akses untuk membuka halaman ini.',
  RATE_LIMIT_EXCEEDED: 'Terlalu banyak percobaan masuk. Mohon tunggu beberapa saat sebelum mencoba kembali.',
  INTERNAL_SERVER_ERROR: 'Terjadi kendala pada server. Tim teknis sedang menangani ini.',
};
```
