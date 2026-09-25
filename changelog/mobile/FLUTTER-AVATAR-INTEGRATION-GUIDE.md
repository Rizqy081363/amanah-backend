# Panduan Integrasi Frontend: Profile Avatar & Onboarding Lifecycle (Flutter Mobile)

**Target:** Tim Pengembang Flutter Mobile (Amanah Healthcare Staff & Doctor App)  
**Dokumen:** Panduan Teknis & Kontrak Integrasi Avatar Mobile  
**Versi API:** `v1.2.0-avatar-lifecycle`  
**Base URL Development:**
- **Android Emulator:** `http://10.0.2.2:3001`
- **iOS Simulator:** `http://localhost:3001`
- **Physical Device (WiFi):** `http://<IP_KOMPUTER_LAN>:3001`

---

## 1. Apa Saja Ekspektasi di Sisi Mobile Flutter?

Secara fungsional dan arsitektur, tim Flutter memiliki 5 (lima) ekspektasi utama yang harus dipenuhi:

### 1.1. Tidak Perlu Menebak Asal Gambar (*Zero Guesswork*)
Frontend **tidak boleh dan tidak perlu lagi membuat logika percabangan rumit** untuk memeriksa apakah pengguna berasal dari Google OAuth, apakah sudah pernah mengunggah foto, atau apakah harus membuat inisial darurat di sisi klien.
Backend kini menyediakan kontrak terpadu:
```json
"avatar": {
  "url": "/api/v1/users/:id/avatar",
  "initials": "AS",
  "type": "custom",
  "hasCustomAvatar": true,
  "directUrl": "/api/v1/users/:id/avatar?v=1790076343134"
}
```
Setiap widget avatar di Flutter cukup mengarahkan URL ke `baseUrl + user.avatar.url`. Endpoint ini otomatis menyajikan:
- **WebP 512×512** jika pengguna memiliki foto kustom.
- **HTTP 307 Redirect** ke CDN jika pengguna memakai Google OAuth.
- **Vector SVG Inisial** jika pengguna belum memiliki foto.

### 1.2. Dukungan Inisial Klinis Cerdas (*Clinical-Grade Initials*)
Jika Flutter memilih merender inisial secara lokal (menggunakan `CircleAvatar` tanpa network request), backend telah menghitung inisial klinis yang benar pada field `avatar.initials`.
Gelar medis seperti `dr.`, `drg.`, `Bdn.`, `Prof.` dan spesialisasi `, Sp.A`, `, M.Kes` **sudah otomatis dibersihkan**:
- Contoh nama: `"dr. Ahmad Santoso, Sp.A"` → Inisial: **`"AS"`** (bukan "DA").
- Contoh nama: `"Fadilah Ahmad Zikri"` → Inisial: **`"FA"`**.

### 1.3. Alur Onboarding Staf (*First-Time Role & Avatar Setup*)
Ketika pengguna baru login (baik lewat Google OAuth maupun registrasi email biasa) dan payload mengembalikan `"needsOnboarding": true`:
1. Halaman onboarding menampilkan avatar saat ini:
   - Jika login lewat Google: langsung menampilkan foto akun Google pengguna.
   - Jika registrasi manual: menampilkan inisial bawaan (`avatar.initials`).
2. Pengguna diberikan opsi untuk mengganti foto profil langsung dari galeri atau kamera ponsel sebelum menyelesaikan onboarding.

### 1.4. Upload & Penggantian Foto di Profil Pengaturan
1. Pengguna dapat memilih gambar dari perangkat (`image_picker`).
2. Gambar dikirim menggunakan `multipart/form-data` ke `PATCH /api/v1/users/me/avatar`.
3. Backend otomatis melakukan validasi *magic-bytes*, menghapus metadata privasi (EXIF lokasi), memotong menjadi rasio 1:1 (512×512), dan mengonversinya ke WebP.
4. Gambar baru langsung aktif seketika dengan parameter versi cache-busting (misal: `?v=1790076343134`).
5. Pengguna juga dapat memilih tombol **"Hapus Foto Profil"**, yang memanggil `DELETE /api/v1/users/me/avatar` sehingga representasi akun kembali ke inisial.

### 1.5. Penanganan Error yang Bersahabat (*Graceful Error Handling*)
Jika pengguna mengunggah file non-gambar (misalnya PDF atau file teks yang diubah namanya menjadi `.jpg`), backend akan mengembalikan status `HTTP 422 Unprocessable Entity`. Flutter diharapkan menampilkan pesan:
> *"Format file tidak didukung atau file bukan merupakan gambar yang valid (Gunakan JPEG, PNG, atau WebP maksimal 5MB)."*

---

## 2. Model Data Dart (Data Transfer Objects)

Tambahkan atau perbarui model pengguna Anda:

```dart
// lib/models/user_avatar.dart

class UserAvatar {
  final String url;
  final String initials;
  final String type; // 'custom' | 'oauth' | 'initials'
  final bool hasCustomAvatar;
  final String? directUrl;

  UserAvatar({
    required this.url,
    required this.initials,
    required this.type,
    required this.hasCustomAvatar,
    this.directUrl,
  });

  factory UserAvatar.fromJson(Map<String, dynamic> json) {
    return UserAvatar(
      url: json['url'] as String? ?? '',
      initials: json['initials'] as String? ?? 'AH',
      type: json['type'] as String? ?? 'initials',
      hasCustomAvatar: json['hasCustomAvatar'] as bool? ?? false,
      directUrl: json['directUrl'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'url': url,
      'initials': initials,
      'type': type,
      'hasCustomAvatar': hasCustomAvatar,
      'directUrl': directUrl,
    };
  }
}
```

Integrasikan ke dalam model `UserModel`:
```dart
// lib/models/user_model.dart

import 'user_avatar.dart';

class UserModel {
  final String id;
  final String name;
  final String email;
  final String? imageUrl;
  final UserAvatar avatar;
  final String systemRole;
  final bool needsOnboarding;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    this.imageUrl,
    required this.avatar,
    required this.systemRole,
    required this.needsOnboarding,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      email: json['email'] as String? ?? '',
      imageUrl: json['imageUrl'] as String?,
      avatar: json['avatar'] != null
          ? UserAvatar.fromJson(json['avatar'] as Map<String, dynamic>)
          : UserAvatar(
              url: '/api/v1/users/${json['id']}/avatar',
              initials: 'AH',
              type: 'initials',
              hasCustomAvatar: false,
            ),
      systemRole: json['systemRole'] as String? ?? 'PATIENT',
      needsOnboarding: json['needsOnboarding'] as bool? ?? false,
    );
  }
}
```

---

## 3. Komponen Widget Universal: `AmanahAvatar`

Buat widget yang dapat dipakai di seluruh aplikasi (Header, Drawer, Profil, Chat Antrean, Kartu Dokter):

```dart
// lib/widgets/amanah_avatar.dart

import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/user_avatar.dart';

class AmanahAvatar extends StatelessWidget {
  final UserAvatar avatar;
  final String baseUrl;
  final double radius;
  final VoidCallback? onTap;

  const AmanahAvatar({
    Key? key,
    required this.avatar,
    required this.baseUrl,
    this.radius = 24.0,
    this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // 1. Dapatkan URL absolut
    final rawUrl = avatar.directUrl ?? avatar.url;
    final fullUrl = rawUrl.startsWith('http')
        ? rawUrl
        : '$baseUrl$rawUrl';

    Widget avatarWidget;

    // 2. Jika tipe adalah inisial, tampilkan CircleAvatar dengan warna brand Amanah
    if (avatar.type == 'initials') {
      avatarWidget = CircleAvatar(
        radius: radius,
        backgroundColor: const Color(0xFF0284C7), // Primary Sky-600
        child: Text(
          avatar.initials,
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: radius * 0.75,
            letterSpacing: 1.0,
          ),
        ),
      );
    } else {
      // 3. Tampilkan gambar dari jaringan dengan caching otomatis
      avatarWidget = CachedNetworkImage(
        imageUrl: fullUrl,
        imageBuilder: (context, imageProvider) => CircleAvatar(
          radius: radius,
          backgroundImage: imageProvider,
        ),
        placeholder: (context, url) => CircleAvatar(
          radius: radius,
          backgroundColor: Colors.grey[200],
          child: const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
        errorWidget: (context, url, error) => CircleAvatar(
          radius: radius,
          backgroundColor: const Color(0xFF0284C7),
          child: Text(
            avatar.initials,
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: radius * 0.75,
            ),
          ),
        ),
      );
    }

    if (onTap != null) {
      return GestureDetector(
        onTap: onTap,
        child: avatarWidget,
      );
    }

    return avatarWidget;
  }
}
```

---

## 4. Implementasi Upload & Delete Service (Dio)

Berikut implementasi repository/service untuk mengunggah dan menghapus avatar:

```dart
// lib/services/avatar_service.dart

import 'dart:io';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import '../models/user_avatar.dart';

class AvatarService {
  final Dio _dio;

  AvatarService(this._dio);

  /// Mengunggah atau memperbarui avatar pengguna dari file lokal
  Future<UserAvatar> uploadAvatar(XFile file, String token) async {
    try {
      final fileName = file.name.isNotEmpty ? file.name : 'avatar.jpg';
      
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(
          file.path,
          filename: fileName,
        ),
      });

      final response = await _dio.patch(
        '/api/v1/users/me/avatar',
        data: formData,
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'multipart/form-data',
          },
        ),
      );

      if (response.statusCode == 200 && response.data != null) {
        return UserAvatar.fromJson(response.data['avatar']);
      }

      throw Exception('Gagal mengunggah avatar: Respons tidak valid');
    } on DioException catch (e) {
      if (e.response?.statusCode == 422) {
        throw Exception(
          'Berkas yang dipilih bukan format gambar yang didukung (Gunakan JPEG, PNG, atau WebP max 5MB).',
        );
      }
      throw Exception(
        e.response?.data?['message'] ?? 'Terjadi kesalahan saat mengunggah foto profil',
      );
    }
  }

  /// Menghapus avatar kustom dan mengembalikan ke inisial nama
  Future<bool> deleteAvatar(String token) async {
    try {
      final response = await _dio.delete(
        '/api/v1/users/me/avatar',
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
          },
        ),
      );

      return response.statusCode == 200;
    } catch (e) {
      throw Exception('Gagal menghapus avatar kustom: $e');
    }
  }
}
```

---

## 5. UI BottomSheet untuk Pemilihan Foto

Tampilkan BottomSheet modern saat pengguna menekan ikon kamera pada foto profil:

```dart
// lib/widgets/avatar_picker_sheet.dart

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

class AvatarPickerSheet extends StatelessWidget {
  final bool hasCustomAvatar;
  final Function(XFile file) onImageSelected;
  final VoidCallback onDeleteAvatar;

  const AvatarPickerSheet({
    Key? key,
    required this.hasCustomAvatar,
    required this.onImageSelected,
    required this.onDeleteAvatar,
  }) : super(key: key);

  Future<void> _pickImage(BuildContext context, ImageSource source) async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(
      source: source,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 85,
    );

    if (pickedFile != null) {
      Navigator.pop(context);
      onImageSelected(pickedFile);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Wrap(
        children: [
          ListTile(
            leading: const Icon(Icons.camera_alt, color: Color(0xFF0284C7)),
            title: const Text('Ambil dari Kamera'),
            onTap: () => _pickImage(context, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library, color: Color(0xFF0284C7)),
            title: const Text('Pilih dari Galeri'),
            onTap: () => _pickImage(context, ImageSource.gallery),
          ),
          if (hasCustomAvatar) ...[
            const Divider(),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: Colors.red),
              title: const Text('Hapus Foto Profil (Gunakan Inisial)',
                  style: TextStyle(color: Colors.red)),
              onTap: () {
                Navigator.pop(context);
                onDeleteAvatar();
              },
            ),
          ],
        ],
      ),
    );
  }
}
```

---

## 6. Ringkasan Checklist Integrasi Mobile

- [ ] Model `UserAvatar` telah diintegrasikan pada `UserModel`.
- [ ] Widget `AmanahAvatar` menggantikan `CircleAvatar` statis di seluruh halaman utama.
- [ ] Menggunakan `directUrl` (atau parameter versi query `?v=...`) untuk memastikan foto baru langsung ter-refresh tanpa terhalang cache lokal.
- [ ] Menangani status `HTTP 422` jika file yang dipilih pengguna tidak valid.
- [ ] Menggunakan Base URL `http://10.0.2.2:3001` untuk Android Emulator atau IP lokal untuk Real Device.
