# CHANGELOG & PANDUAN INTEGRASI MOBILE FLUTTER (v1.3.0)

> **Dokumen Resmi Serah Terima Integrasi Backend untuk Tim Flutter Mobile**  
> **Aplikasi:** Amanah Healthcare (Dokter, Tenaga Medis, & Staf Operasional)  
> **Status Backend:** Terverifikasi Aktif & Lolos Uji 100% (*Live E2E Verified*)  
> **Tanggal Rilis:** 23 September 2026  
> **Base URL Lokal:**  
> - Android Emulator: `http://10.0.2.2:3001`  
> - iOS Simulator: `http://localhost:3001`  
> - Perangkat Fisik (WiFi): `http://<IP_KOMPUTER_LAN>:3001`  

---

## 1. Ringkasan Eksekutif (TL;DR untuk Pengembang Flutter)

Pada pembaruan backend rilis ini, seluruh kendala integrasi yang sebelumnya ditemui di aplikasi mobile Flutter telah diselesaikan secara tuntas:

1. **Infrastruktur Edit Kredensial Medis (SIP & STR) Telah Dibuat:**  
   Dokter sekarang dapat melihat, menambah, memperbarui, dan menghapus nomor SIP/STR langsung melalui endpoint self-service `/api/v1/staffs/me/credentials`.
2. **Pembaruan Profil Staf/Dokter (Self-Update):**  
   Disediakan endpoint `PATCH /api/v1/staffs/me` untuk memperbarui nama lengkap, nomor telepon, dan data profil staf dokter yang sedang login tanpa risiko `403 Forbidden`.
3. **Sinkronisasi Mekanisme Avatar Dokter:**  
   Endpoint upload foto profil mobile `PATCH /api/v1/users/me/avatar` tetap menjadi standar utama. Web Admin kini juga telah dilengkapi endpoint yang sejalan. URL publik `GET /api/v1/users/:userId/avatar` siap dipakai langsung di widget `CircleAvatar` atau `CachedNetworkImage` tanpa header Authorization.
4. **Kebijakan Email Permanen (*Immutable Email*):**  
   Alamat email akun tidak dapat diubah. Field email pada form pengaturan akun mobile wajib diatur menjadi `readOnly: true`. Jika aplikasi mobile tetap mengirimkan email baru pada `PATCH /api/v1/auth/me`, backend akan menolak dengan `400 Bad Request`.
5. **Jadwal Dokter Bersih dari Data Siluman (*Ghost Data Elimination*):**  
   Dokter baru yang didaftarkan dipastikan memiliki kuota awal `0` dan tidak akan disuntikkan jadwal *dummy* otomatis.

---

## 2. Mengapa Mobile Kemarin Mengalami Masalah? (Forensic Root Cause)

### 2.1. Kendala Gagal Edit Profil & Kredensial Dokter di Mobile
- **Penyebab di Backend:**
  - Sebelumnya endpoint `PATCH /api/v1/staffs/:id` diproteksi secara eksklusif hanya untuk akun dengan peran `@Roles('ADMIN')`. Ketika akun dokter (berperan `STAF`) mencoba memanggil endpoint tersebut, backend langsung menolak dengan status **`403 Forbidden`**.
  - Backend **sama sekali belum memiliki method HTTP `PATCH` dan `DELETE`** untuk entitas kredensial legalitas staf (hanya tersedia `GET` dan `POST`).
- **Solusi yang Diterapkan:**
  - Backend telah mengimplementasikan method `PATCH` dan `DELETE` di tingkat Controller, Service, dan Drizzle Repository.
  - Backend menambahkan rute khusus staf login: `PATCH /api/v1/staffs/me` dan `PATCH /api/v1/staffs/me/credentials/:credentialId`.
  - Backend melonggarkan guard pada `PATCH /api/v1/staffs/:id` sehingga dokter yang bersangkutan diizinkan mengedit profilnya sendiri (`existing.userId === currentUser.id`).

### 2.2. Kendala Upload Avatar Dokter
- **Penyebab:**
  - Di sisi mobile Flutter, endpoint `PATCH /api/v1/users/me/avatar` dan alias `POST /api/v1/auth/me/avatar` sebenarnya **sudah aktif dan berfungsi dengan benar**.
  - Masalah timbul karena Web Admin sebelumnya **belum memiliki** endpoint untuk mengunggah avatar dokter dari sisi admin (`/staffs/:id/avatar`). Akibatnya muncul kesan bahwa mekanisme avatar belum seragam.
- **Solusi yang Diterapkan:**
  - Backend telah melengkapi Web Admin dengan endpoint `PATCH /api/v1/staffs/:id/avatar`. Mobile tetap menggunakan endpoint `PATCH /api/v1/users/me/avatar` atau `PATCH /api/v1/staffs/me/avatar`.

---

## 3. Spesifikasi Kontrak API untuk Flutter Mobile

### 3.1. Kelola Kredensial Legalitas Dokter (SIP & STR)

Semua endpoint di bawah ini memerlukan header:
```http
Authorization: Bearer <TOKEN_DOKTER_LOGIN>
```

#### A. Mengambil Daftar Kredensial Dokter
- **Method & Path:** `GET /api/v1/staffs/me/credentials`
- **Response (HTTP 200 OK):**
```json
[
  {
    "id": "e0a29792-7104-41d3-9f5b-11c521eb231f",
    "staffProfileId": "0db995d3-88bc-4aa6-bfd1-a20c329dcbff",
    "credentialType": "sip",
    "credentialNumber": "446/123/SIP-D/DPMPTSP/2024",
    "issuer": "Dinas Kesehatan Kota Bandung",
    "issuedAt": "2024-01-01",
    "expiresAt": "2029-01-01",
    "status": "verified"
  }
]
```

#### B. Menambahkan Kredensial Baru (SIP / STR)
- **Method & Path:** `POST /api/v1/staffs/me/credentials`
- **Content-Type:** `application/json`
- **Request Body:**
```json
{
  "credentialType": "sip",
  "credentialNumber": "503/4421/SIP-DOKTER/2024",
  "issuer": "Dinas Kesehatan DKI Jakarta",
  "issuedAt": "2024-05-10",
  "expiresAt": "2029-05-10"
}
```
> [!IMPORTANT]
> **Aturan Huruf Kecil (Lowercase Enum):**  
> Nilai `credentialType` **harus lowercase**: `"sip"`, `"str"`, `"kki"`, `"npwp"`, `"nib"`, `"national_id"`, atau `"other"`. Mengirimkan huruf besar seperti `"SIP"` akan ditolak dengan error `422 Unprocessable Entity`.

- **Response (HTTP 201 Created):** Mengembalikan objek kredensial yang berhasil dibuat.

#### C. Mengedit Kredensial yang Ada (Nomor SIP/STR, Penerbit, dsb.)
- **Method & Path:** `PATCH /api/v1/staffs/me/credentials/:credentialId`
- **Content-Type:** `application/json`
- **Request Body:** (*Semua field bersifat opsional, kirim hanya yang diubah*)
```json
{
  "credentialNumber": "503/4421/SIP-DOKTER/2024-REVISI",
  "issuer": "Kementerian Kesehatan RI",
  "expiresAt": "2030-05-10",
  "status": "verified"
}
```
> [!NOTE]
> Nilai `status` kredensial yang valid adalah: `"unverified"`, `"verified"`, `"expired"`, atau `"revoked"` (wajib lowercase).

- **Response (HTTP 200 OK):** Mengembalikan data kredensial ter-update.

#### D. Menghapus Kredensial
- **Method & Path:** `DELETE /api/v1/staffs/me/credentials/:credentialId`
- **Response (HTTP 204 No Content):** Body kosong (*empty body*).

---

### 3.2. Pembaruan Biodata Profil Staf Dokter (Self-Update)

Jika dokter ingin memperbarui nomor telepon atau nama tampilan gelar:
- **Method & Path:** `PATCH /api/v1/staffs/me`
- **Headers:**  
  `Authorization: Bearer <TOKEN_DOKTER_LOGIN>`  
  `Content-Type: application/json`
- **Request Body:**
```json
{
  "fullName": "dr. Ahmad Santoso, Sp.A",
  "phoneNumber": "081299887766"
}
```
- **Response (HTTP 200 OK):** Objek profil staf medis yang telah diperbarui.

---

### 3.3. Upload & Render Avatar Dokter

#### A. Upload Foto Profil dari Galeri/Kamera Ponsel
- **Method & Path:** `PATCH /api/v1/users/me/avatar` (atau `PATCH /api/v1/staffs/me/avatar`)
- **Headers:**  
  `Authorization: Bearer <TOKEN_DOKTER_LOGIN>`  
  `Content-Type: multipart/form-data`
- **Form-Data Key:** `file` (File biner gambar JPEG, PNG, atau WebP, maks 5 MB).
- **Response (HTTP 200 OK):**
```json
{
  "statusCode": 200,
  "message": "Avatar berhasil diperbarui",
  "avatarUrl": "/api/v1/users/837233f8-6e5a-4e2e-8367-73b8893d5001/avatar?v=1727028400000",
  "avatar": {
    "type": "custom",
    "hasCustomAvatar": true,
    "url": "/api/v1/users/837233f8-6e5a-4e2e-8367-73b8893d5001/avatar",
    "initials": "AS",
    "mimeType": "image/webp"
  }
}
```

#### B. Menampilkan Foto Profil di UI Flutter
Panggil URL publik gambar:
```dart
final avatarUrl = '$baseUrl/api/v1/users/${user.id}/avatar';
```
- **Tidak perlu mengirimkan Bearer Token** (bebas dipakai di `Image.network` atau `CachedNetworkImageProvider`).
- Backend secara cerdas akan:
  1. Mengirim gambar `image/webp` jika dokter sudah upload foto.
  2. Mengirim gambar vektor `image/svg+xml` berisikan inisial nama dokter (misal "AS") jika belum upload foto.
  3. Menyediakan header caching ETag (HTTP 304) sehingga hemat kuota data seluler.

#### C. Menghapus Foto Profil (Kembali ke Inisial)
- **Method & Path:** `DELETE /api/v1/users/me/avatar`
- **Headers:** `Authorization: Bearer <TOKEN_DOKTER_LOGIN>`
- **Response (HTTP 200 OK):** Foto terhapus dan profil otomatis beralih kembali ke inisial.

---

### 3.4. Kebijakan Imutabilitas Email Akun

- **Aturan:** Alamat email akun bersifat **permanen** dan tidak dapat diganti karena terikat dengan riwayat legalitas medis serta audit trail pasien.
- **Implementasi Mobile:**
  - Kunci input teks email pada formulir: `TextFormField(readOnly: true, enabled: false)`.
  - Berikan label info: *"Email terdaftar secara permanen untuk keperluan legalitas klinis."*
- **Perilaku Backend:** Jika payload `PATCH /api/v1/auth/me` menyertakan alamat email baru, backend merespons dengan **HTTP 400 Bad Request**:
```json
{
  "type": "https://amanah.health/errors/bad_request",
  "title": "Bad Request",
  "status": 400,
  "statusCode": 400,
  "detail": "Alamat email akun bersifat permanen dan tidak dapat diubah.",
  "message": "Alamat email akun bersifat permanen dan tidak dapat diubah.",
  "code": "BAD_REQUEST"
}
```

---

## 4. Contoh Kode Dart Model & Service (Siap Pakai)

### 4.1. Model Kredensial Medis (`lib/models/staff_credential_model.dart`)

```dart
enum CredentialType {
  sip,
  str,
  kki,
  npwp,
  nib,
  nationalId,
  other;

  String toApiValue() {
    switch (this) {
      case CredentialType.nationalId:
        return 'national_id';
      default:
        return name.toLowerCase();
    }
  }

  static CredentialType fromApiValue(String val) {
    switch (val.toLowerCase()) {
      case 'sip':
        return CredentialType.sip;
      case 'str':
        return CredentialType.str;
      case 'kki':
        return CredentialType.kki;
      case 'npwp':
        return CredentialType.npwp;
      case 'nib':
        return CredentialType.nib;
      case 'national_id':
        return CredentialType.nationalId;
      default:
        return CredentialType.other;
    }
  }
}

class StaffCredentialModel {
  final String id;
  final String staffProfileId;
  final CredentialType credentialType;
  final String credentialNumber;
  final String? issuer;
  final String? issuedAt;
  final String? expiresAt;
  final String status;

  StaffCredentialModel({
    required this.id,
    required this.staffProfileId,
    required this.credentialType,
    required this.credentialNumber,
    this.issuer,
    this.issuedAt,
    this.expiresAt,
    required this.status,
  });

  factory StaffCredentialModel.fromJson(Map<String, dynamic> json) {
    return StaffCredentialModel(
      id: json['id'] as String,
      staffProfileId: json['staffProfileId'] as String? ?? '',
      credentialType: CredentialType.fromApiValue(json['credentialType'] as String? ?? 'other'),
      credentialNumber: json['credentialNumber'] as String? ?? '',
      issuer: json['issuer'] as String?,
      issuedAt: json['issuedAt'] as String?,
      expiresAt: json['expiresAt'] as String?,
      status: json['status'] as String? ?? 'unverified',
    );
  }
}
```

### 4.2. Service Dio Kredensial & Profil Staf (`lib/services/staff_profile_service.dart`)

```dart
import 'package:dio/dio.dart';
import '../models/staff_credential_model.dart';

class StaffProfileService {
  final Dio _dio;

  StaffProfileService(this._dio);

  /// 1. Ambil daftar SIP / STR dokter login
  Future<List<StaffCredentialModel>> getMyCredentials() async {
    final response = await _dio.get('/api/v1/staffs/me/credentials');
    final data = response.data as List;
    return data.map((e) => StaffCredentialModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// 2. Tambah SIP / STR baru
  Future<StaffCredentialModel> addCredential({
    required CredentialType type,
    required String number,
    String? issuer,
    String? issuedAt,
    String? expiresAt,
  }) async {
    final response = await _dio.post(
      '/api/v1/staffs/me/credentials',
      data: {
        'credentialType': type.toApiValue(),
        'credentialNumber': number,
        if (issuer != null) 'issuer': issuer,
        if (issuedAt != null) 'issuedAt': issuedAt,
        if (expiresAt != null) 'expiresAt': expiresAt,
      },
    );
    return StaffCredentialModel.fromJson(response.data as Map<String, dynamic>);
  }

  /// 3. Update SIP / STR yang sudah ada
  Future<StaffCredentialModel> updateCredential({
    required String credentialId,
    String? number,
    String? issuer,
    String? expiresAt,
    String? status,
  }) async {
    final response = await _dio.patch(
      '/api/v1/staffs/me/credentials/$credentialId',
      data: {
        if (number != null) 'credentialNumber': number,
        if (issuer != null) 'issuer': issuer,
        if (expiresAt != null) 'expiresAt': expiresAt,
        if (status != null) 'status': status.toLowerCase(),
      },
    );
    return StaffCredentialModel.fromJson(response.data as Map<String, dynamic>);
  }

  /// 4. Hapus kredensial
  Future<void> deleteCredential(String credentialId) async {
    await _dio.delete('/api/v1/staffs/me/credentials/$credentialId');
  }

  /// 5. Self-update nama atau nomor telepon staf dokter
  Future<void> updateMyProfile({
    String? fullName,
    String? phoneNumber,
  }) async {
    await _dio.patch(
      '/api/v1/staffs/me',
      data: {
        if (fullName != null) 'fullName': fullName,
        if (phoneNumber != null) 'phoneNumber': phoneNumber,
      },
    );
  }
}
```

---

## 5. Checklist Verifikasi untuk Tim Flutter

| Checklist | Task Integrasi Mobile | Status |
|---|---|:---:|
| 1 | Arahkan panggilan edit SIP/STR ke `PATCH /api/v1/staffs/me/credentials/:credentialId` | Siap Integrasi |
| 2 | Arahkan tombol hapus SIP/STR ke `DELETE /api/v1/staffs/me/credentials/:credentialId` | Siap Integrasi |
| 3 | Pastikan payload `credentialType` dan `status` berhuruf kecil (*lowercase*) | Wajib |
| 4 | Kunci field input `email` pada layar setting akun menjadi `readOnly: true` | Wajib |
| 5 | Gunakan endpoint publik `GET /api/v1/users/:userId/avatar` untuk render avatar | Siap Pakai |
| 6 | Arahkan edit biodata dokter ke `PATCH /api/v1/staffs/me` | Siap Integrasi |

---
*Dokumen ini merupakan panduan implementasi resmi yang telah divalidasi dengan rangkaian uji automated backend Amanah Healthcare.*
