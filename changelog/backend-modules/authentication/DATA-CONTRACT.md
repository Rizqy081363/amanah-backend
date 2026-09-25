# Kontrak Data & Skema Tipe: Modul Authentication

> **Standard:** TypeScript Definitions & JSON Schema Specifications  
> **Source Evidence:** [`src/auth/dto/*`](file:///D:/Amanah-backend/src/auth/dto/), [`src/users/domain/user.ts`](file:///D:/Amanah-backend/src/users/domain/user.ts), [`src/common/filters/problem-details.filter.ts`](file:///D:/Amanah-backend/src/common/filters/problem-details.filter.ts)  

---

## 1. Skema Request DTO (Data Transfer Object)

### A. `AuthEmailLoginDto` (Kanonikal Login)
Digunakan pada `POST /api/v1/auth/email/login`.

```typescript
export interface AuthEmailLoginDto {
  /**
   * Alamat email pengguna terdaftar.
   * Ditransformasikan otomatis menjadi lowercase sebelum divalidasi.
   * @example "dr.ahmad@amanah-healthcare.local"
   */
  email: string;

  /**
   * Kata sandi teks murni (plaintext).
   * Minimal 1 karakter, tidak boleh string kosong.
   * @example "Password123!"
   */
  password: string;
}
```

### B. `AuthForgotPasswordDto` (Pemulihan Sandi)
Digunakan pada `POST /api/v1/auth/forgot/password`.

```typescript
export interface AuthForgotPasswordDto {
  /**
   * Alamat email akun yang ingin dipulihkan.
   * @example "dr.ahmad@amanah-healthcare.local"
   */
  email: string;
}
```

### C. `AuthRegisterLoginDto` (⚠️ STUB — Tidak Digunakan di Produksi)
Digunakan pada `POST /api/v1/auth/email/register`.

```typescript
export interface AuthRegisterLoginDto {
  email: string;
  password: string; // MinLength(6)
  firstName: string;
  lastName: string;
}
```

---

## 2. Skema Response DTO

### A. `LoginResponseDto`
Dikembalikan oleh `POST /api/v1/auth/email/login`.

```typescript
export interface LoginResponseDto {
  /**
   * JSON Web Token (JWT) Access Token bertipe Bearer.
   * Default masa berlaku: 1 hari (dikonfigurasi via AUTH_JWT_TIME).
   */
  token: string;

  /**
   * JWT Refresh Token untuk rotasi access token baru.
   * Default masa berlaku: 7 hari.
   */
  refreshToken: string;

  /**
   * Waktu kedaluwarsa access token dalam format Unix Timestamp milidetik.
   * @example 1726794000000
   */
  tokenExpires: number;

  /**
   * Data profil ringkas pengguna yang berhasil login.
   */
  user: AuthenticatedUserPayload;
}
```

### B. `RefreshResponseDto`
Dikembalikan oleh `POST /api/v1/auth/refresh`.

```typescript
export interface RefreshResponseDto {
  token: string;
  refreshToken: string;
  tokenExpires: number;
}
```

---

## 3. Skema Domain Entitas Pengguna (`AuthenticatedUserPayload`)

Struktur data pengguna yang dikembalikan saat otentikasi Kanonikal JWT:

```typescript
export interface AuthenticatedUserPayload {
  /** UUID unik akun pengguna */
  id: string;

  /** Alamat email utama */
  email: string;

  /** Peran sistem tingkat atas: 'ADMIN' | 'STAF' | 'PATIENT' */
  systemRole: 'ADMIN' | 'STAF' | 'PATIENT';

  /** Entitas peran primer */
  role: {
    id: number;
    name: string;
  };

  /** Profil klinis staf (null jika akun adalah pasien murni) */
  staff: StaffProfilePayload | null;

  /** Profil pasien (null jika akun adalah staf murni/admin) */
  patient: PatientProfilePayload | null;
}

export interface StaffProfilePayload {
  id: string;
  practitionerId: string | null;
  userId: string;
  poliklinikId: string | null;
  fullName: string;
  profession: string | null;
  idCardNumber: string | null;
  photoUrl: string | null;
  phoneNumber: string | null;
  isActive: boolean;
}

export interface PatientProfilePayload {
  id: string;
  userId: string;
  medicalRecordNumber: string;
  nik: string;
  fullName: string;
  gender: 'Laki-laki' | 'Perempuan';
  birthPlace: string | null;
  birthDate: string | null;
  bloodType: string | null;
  phoneNumber: string | null;
  status: string;
}
```

---

## 4. Skema Better Auth Data

### `BetterAuthSessionResponse`
Dikembalikan oleh `GET /api/auth/get-session`:

```typescript
export interface BetterAuthSessionResponse {
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: string; // ISO 8601
    ipAddress?: string;
    userAgent?: string;
  };
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'staffDoctor' | 'staffMidwife' | 'staffWorker' | 'patient';
    banned?: boolean;
    banReason?: string | null;
    emailVerified?: boolean;
    createdAt: string;
    updatedAt: string;
  };
}
```

---

## 5. Skema Galat RFC 7807 (`ProblemDetails`)

```typescript
export interface InvalidParam {
  name: string;
  reason: string;
  code?: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  statusCode: number;
  detail: string;
  message: string;
  instance: string;
  code: string;
  invalidParams?: InvalidParam[];
  retryAfter?: number;
  traceId: string;
  timestamp: string;
}
```
