# Diagram Alir & Siklus Autentikasi: Modul Authentication

> **Standard:** Mermaid Diagrams (Sequence & Flowchart)  
> **Source Evidence:** [`src/auth/auth.controller.ts`](file:///D:/Amanah-backend/src/auth/auth.controller.ts), [`src/auth/auth.service.ts`](file:///D:/Amanah-backend/src/auth/auth.service.ts), [`src/auth/better-auth/auth.ts`](file:///D:/Amanah-backend/src/auth/better-auth/auth.ts)  

---

## 1. Alur Login Kredensial & Inisialisasi Profil (Engine A: JWT)

Diagram ini mengilustrasikan alur dari pengguna memasukkan kredensial pada frontend hingga token disimpan dan profil pengguna (beserta data dokter/pasien) berhasil dimuat ke state aplikasi:

```mermaid
sequenceDiagram
    autonumber
    actor User as Pengguna / Staf Medis
    participant Client as Frontend (Flutter / Web)
    participant Gateway as NestJS Router (/api/v1/auth)
    participant Service as AuthService
    participant DB as PostgreSQL (users, auth_accounts)
    participant JWT as JwtService

    User->>Client: Input Email & Kata Sandi
    Client->>Gateway: POST /api/v1/auth/email/login { email, password }
    Gateway->>Service: validateLogin(dto)
    Service->>DB: Query user by email & auth_accounts (credential)
    alt Email Tidak Ditemukan
        DB-->>Service: null
        Service-->>Gateway: throw UnprocessableEntityException (email: notFound)
        Gateway-->>Client: HTTP 422 { invalidParams: [{ name: "email", reason: "notFound" }] }
        Client-->>User: Tampilkan pesan "Email tidak terdaftar"
    else Password Hash Tidak Ada / Tidak Cocok
        Service->>Service: bcrypt.compare(password, passwordHash)
        Service-->>Gateway: throw UnprocessableEntityException (password: incorrectPassword)
        Gateway-->>Client: HTTP 422 { invalidParams: [{ name: "password", reason: "incorrectPassword" }] }
        Client-->>User: Tampilkan pesan "Kata sandi salah"
    else Kredensial Valid
        Service->>JWT: signAsync(accessTokenPayload, 1d)
        Service->>JWT: signAsync(refreshTokenPayload, 7d)
        Service-->>Gateway: Return { token, refreshToken, tokenExpires, user }
        Gateway-->>Client: HTTP 200 OK
        Client->>Client: Simpan token di SecureStorage
        Client->>Client: Set User State di Store (Pinia / Zustand / Bloc)
        Client->>Gateway: GET /api/v1/auth/me (Header: Bearer <token>)
        Gateway-->>Client: HTTP 200 OK { id, email, systemRole, staff, patient }
        Client-->>User: Arahkan ke Dashboard Berdasarkan Role
    end
```

---

## 2. Alur Silent Token Refresh (Auto-Rotation)

Diagram ini mengilustrasikan penanganan refresh token otomatis menggunakan Axios/Fetch interceptor ketika access token kedaluwarsa:

```mermaid
sequenceDiagram
    autonumber
    participant Client as Frontend App
    participant Interceptor as HTTP Interceptor
    participant Gateway as NestJS Router
    participant Service as AuthService
    participant JWT as JwtRefreshStrategy

    Client->>Gateway: GET /api/v1/appointments (Header: Bearer <expired_token>)
    Gateway-->>Interceptor: HTTP 401 Unauthorized (UNAUTHENTICATED)
    Note over Interceptor: Tangkap 401 & Antrekan (Queue) request tertunda
    Interceptor->>Gateway: POST /api/v1/auth/refresh (Header: Bearer <refreshToken>)
    Gateway->>JWT: Validasi signature & sessionId
    alt Refresh Token Kedaluwarsa / Ilegal
        JWT-->>Gateway: throw UnauthorizedException
        Gateway-->>Interceptor: HTTP 401 Unauthorized
        Interceptor->>Client: Purge Local Tokens
        Interceptor-->>Client: Redirect ke Halaman Login (/login)
    else Refresh Token Valid
        Gateway->>Service: refreshToken({ sessionId })
        Service->>Service: Buat Access Token baru & Refresh Token baru
        Service-->>Gateway: Return { token, refreshToken, tokenExpires }
        Gateway-->>Interceptor: HTTP 200 OK
        Interceptor->>Interceptor: Perbarui tokens di SecureStorage
        Interceptor->>Gateway: Retry GET /api/v1/appointments (Header: Bearer <new_token>)
        Gateway-->>Client: HTTP 200 OK Data Janji Temu
    end
```

---

## 3. Alur Pemulihan Kata Sandi (Forgot Password via SMTP/Mailpit)

Diagram ini mengilustrasikan alur pemulihan kata sandi yang telah terintegrasi dengan Mailer/Mailpit:

```mermaid
sequenceDiagram
    autonumber
    actor User as Pengguna
    participant Client as Frontend
    participant Gateway as NestJS Router
    participant Service as AuthService
    participant Mailer as MailService (Nodemailer)
    participant SMTP as Mailpit Server (Port 1025)

    User->>Client: Masukkan email untuk reset sandi
    Client->>Gateway: POST /api/v1/auth/forgot/password { email }
    Gateway->>Service: forgotPassword(email)
    Service->>Service: Cari user di tabel users
    alt Email Tidak Ada
        Service-->>Gateway: throw UnprocessableEntityException (email: emailNotExists)
        Gateway-->>Client: HTTP 422 { invalidParams: [{ name: "email", reason: "emailNotExists" }] }
        Client-->>User: Tampilkan galat email tidak ditemukan
    else Email Ditemukan
        Service->>Service: Generate JWT reset token (30m validity)
        Service->>Mailer: forgotPassword({ to: email, data: { hash, tokenExpires } })
        Mailer->>SMTP: Kirim Email HTML via SMTP
        Service-->>Gateway: Selesai
        Gateway-->>Client: HTTP 204 No Content
        Client-->>User: Tampilkan notifikasi "Cek kotak masuk email Anda"
    end
```

---

## 4. Alur Sesi Better Auth (Web Admin / Backoffice)

Diagram ini mengilustrasikan autentikasi berbasis sesi stateful yang tersimpan di tabel database `"session"`:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin Backoffice
    participant Browser as Web Browser (SPA)
    participant BetterAuth as BetterAuthController (/api/auth/*)
    participant DB as PostgreSQL ("session", "user")

    Admin->>Browser: Masuk dengan Email & Password
    Browser->>BetterAuth: POST /api/auth/sign-in/email { email, password }
    BetterAuth->>DB: Validasi kredensial & Insert record ke tabel "session"
    BetterAuth-->>Browser: HTTP 200 OK (Set-Cookie: better-auth.session_token; HttpOnly; SameSite=Lax)
    Note over Browser: Browser menyimpan cookie aman secara otomatis
    Browser->>BetterAuth: GET /api/auth/get-session (Otomatis menyertakan Cookie)
    BetterAuth->>DB: Query tabel "session" & join "user"
    BetterAuth-->>Browser: HTTP 200 OK { session, user: { role: "admin" } }
    Browser-->>Admin: Buka Halaman Manajemen Staf & User
```

---

## 5. Komparasi Alur Logout

```mermaid
flowchart TD
    subgraph Engine_A [Engine A: Kanonikal JWT]
        A1[User Klik Tombol Logout] --> A2[Client Panggil POST /api/v1/auth/logout]
        A2 --> A3[Server Return HTTP 204 No-Op]
        A3 --> A4[Client Wajib Hapus Token dari LocalStorage / SecureStorage]
        A4 --> A5[Selesai - Sesi Sisi Klien Berakhir]
    end

    subgraph Engine_B [Engine B: Better Auth]
        B1[User Klik Tombol Logout] --> B2[Client Panggil POST /api/auth/sign-out]
        B2 --> B3[Better Auth Menghapus Baris dari Tabel session di DB]
        B3 --> B4[Server Bersihkan Cookie & Return HTTP 200]
        B4 --> B5[Selesai - Sesi Sisi Server Terhapus Permanen]
    end
```
