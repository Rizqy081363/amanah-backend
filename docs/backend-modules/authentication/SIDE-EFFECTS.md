# Efek Samping & Persistensi: Modul Authentication

> **Standard:** Side Effects, Database Mutations, SMTP Transports, Cache & Logging  
> **Source Evidence:** [`src/auth/auth.service.ts`](file:///D:/Amanah-backend/src/auth/auth.service.ts), [`src/auth/better-auth/auth.ts`](file:///D:/Amanah-backend/src/auth/better-auth/auth.ts), [`src/mail/mail.service.ts`](file:///D:/Amanah-backend/src/mail/mail.service.ts)  

---

## 1. Operasi Persistensi Database (PostgreSQL)

Modul autentikasi berinteraksi dengan dua skema persistensi di database PostgreSQL `amanah_healthcare`:

### A. Pola Stateless (Engine A: Kanonikal JWT)
* **Karakteristik:** Engine A tidak menyimpan sesi aktif ke database (stateless JWT).
* **Operasi Baca (Read-Only):**
  * `POST /api/v1/auth/email/login`: Membaca tabel `users` berdasarkan email, membaca tabel `auth_accounts` untuk memverifikasi hash kata sandi `bcrypt`, serta membaca tabel `user_roles`, `roles`, `staff_profiles`, dan `patient_profiles` untuk menyusun payload profil pengguna.
  * `GET /api/v1/auth/me`: Melakukan join pembacaan `users` beserta relasi profilnya.
  * `POST /api/v1/auth/refresh`: Membaca tabel `users` untuk memastikan akun masih eksis sebelum menerbitkan token baru.
* **Operasi Tulis (Write):**
  * Tidak ada mutasi tabel database yang terjadi pada endpoint login, profil, maupun refresh token.

### B. Pola Stateful (Engine B: Better Auth)
* **Karakteristik:** Engine B menyimpan setiap sesi login ke dalam tabel database.
* **Tabel Terpengaruh:**
  * **Tabel `"session"`**:
    * `POST /api/auth/sign-in/email`: Melakukan `INSERT` baris baru berisi `id`, `userId`, `token`, `expiresAt`, `ipAddress`, dan `userAgent`.
    * `POST /api/auth/sign-out`: Melakukan `DELETE` baris sesi aktif.
    * `POST /api/auth/admin/impersonate-user`: Membuat sesi sementara khusus (durasi 15 menit).
  * **Tabel `account`**:
    * `POST /api/auth/reset-password`: Melakukan `UPDATE` pada kolom `password` hash.

---

## 2. Pengiriman Email Eksternal (SMTP & Mailpit)

Operasi pemulihan kata sandi memicu pengiriman email melalui jaringan SMTP:

| Trigger Endpoint | Engine | Layanan Pengirim | Port Transport | Templat & Konten |
| :--- | :---: | :--- | :---: | :--- |
| `POST /api/v1/auth/forgot/password` | A | `MailService` ([`src/mail/mail.service.ts`](file:///D:/Amanah-backend/src/mail/mail.service.ts)) | `1025` (SMTP) | Tautan reset kata sandi dengan token hash JWT bertenggang waktu 30 menit. |
| `POST /api/auth/forget-password` | B | `sendSmtpEmail` ([`src/auth/better-auth/auth.ts`](file:///D:/Amanah-backend/src/auth/better-auth/auth.ts#L57)) | `1025` (SMTP) | Tautan reset kata sandi Better Auth dengan masa berlaku 1 jam. |

### Inspeksi Lokal Mailpit:
Pengembang frontend dapat melihat langsung email yang terkirim pada lingkungan pengembangan dengan membuka browser ke:
* **Web UI Mailpit:** `http://localhost:8025`
* Setiap email yang dikirim oleh endpoint forgot-password akan langsung muncul di kotak masuk Mailpit tanpa perlu akun email sungguhan.

---

## 3. Caching & Sliding-Window Rate Limiting (Redis)

Setiap request masuk dievaluasi terhadap cluster cache Redis (`amanah-backend-redis-1:6379`):

* **Kunci Sliding Window Rate Limiting:**
  * Pola key: `rl:{ip}:{endpoint_hash}`
  * TTL: 60 detik.
  * Melebihi kuota akan mencatat log peringatan keamanan dan mengembalikan HTTP `429 Too Many Requests`.
* **Kunci Idempotensi:**
  * Pola key: `idemp:{idempotency_key}`
  * TTL: 86400 detik (24 jam).
  * Menjamin request identik yang dikirim ulang akibat koneksi seluler terputus tidak dieksekusi berulang kali.

---

## 4. Pencatatan Jejak Terdistribusi (Distributed Tracing & Audit Log)

* Setiap request yang masuk secara otomatis diberikan **Correlation ID** (UUID v4) melalui [`CorrelationIdMiddleware`](file:///D:/Amanah-backend/src/common/middleware/correlation-id.middleware.ts).
* Header `x-correlation-id` disematkan pada seluruh log NestJS (`[9b1deb4d-3b7d-4bad...]`) dan dikembalikan pada response header maupun RFC 7807 problem details error body (`traceId`).
* Data sensitif seperti kata sandi dan token mentah tidak pernah dicatat ke dalam log konsol.
