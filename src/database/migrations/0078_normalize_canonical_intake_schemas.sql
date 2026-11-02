-- Migration: 0078_normalize_canonical_intake_schemas.sql
-- 1. Normalizes standard-registration schema:
--    - Eliminates hardcoded Indonesian strings in step_relationship, binding to catalog:relationships
--    - Normalizes emergencyContactRelationship from text input to select component bound to catalog:relationships
--    - Eliminates redundant standalone step_email in favor of canonical user account identity resolution
--    - Streamlines total steps to 12 (11 entry steps + 1 review step)

UPDATE clinical_intake_forms
SET
  schema = '{
    "version": 2,
    "title": "Formulir Pendaftaran Pasien Baru",
    "description": "Formulir standar pendaftaran profil identitas, data kependudukan KTP, domisili bertingkat, dan pekerjaan pasien baru.",
    "steps": [
      {
        "id": "step_relationship",
        "title": "Hubungan dengan Akun",
        "description": "Pilih hubungan pasien yang berobat dengan akun pembuat janji.",
        "fields": [
          {
            "id": "relationship",
            "type": "LIST",
            "component": "select",
            "title": "Hubungan Pasien dengan Akun",
            "label": "Hubungan Akun",
            "placeholder": "Pilih hubungan dengan akun...",
            "helpText": "Relasi pasien yang didaftarkan dari katalog master resmi",
            "required": true,
            "isActive": true,
            "choices": [],
            "dataSource": {
              "type": "catalog",
              "key": "relationships"
            },
            "colSpan": 1
          }
        ]
      },
      {
        "id": "step_name",
        "title": "Nama Lengkap",
        "description": "Isi nama lengkap pasien sesuai KTP atau kartu keluarga.",
        "fields": [
          {
            "id": "fullName",
            "type": "TEXT",
            "component": "text-input",
            "title": "Nama Lengkap Pasien",
            "label": "Nama Lengkap",
            "placeholder": "contoh: Siti Aminah / Ahmad Dahlan",
            "helpText": "Nama lengkap tanpa singkatan gelar",
            "required": true,
            "isActive": true,
            "choices": [],
            "colSpan": 1
          }
        ]
      },
      {
        "id": "step_nik",
        "title": "Nomor Induk Kependudukan (NIK)",
        "description": "Isi 16 digit NIK sesuai KTP atau kartu keluarga pasien.",
        "fields": [
          {
            "id": "nik",
            "type": "TEXT",
            "component": "text-input",
            "title": "NIK KTP (16 digit angka)",
            "label": "NIK",
            "placeholder": "3271012345670001",
            "helpText": "Wajib 16 digit angka kependudukan resmi",
            "required": true,
            "isActive": true,
            "choices": [],
            "colSpan": 1
          }
        ]
      },
      {
        "id": "step_mother_name",
        "title": "Nama Ibu Kandung",
        "description": "Isi nama ibu kandung pasien sesuai kartu keluarga untuk verifikasi rekam medis.",
        "fields": [
          {
            "id": "motherName",
            "type": "TEXT",
            "component": "text-input",
            "title": "Nama Ibu Kandung",
            "label": "Nama Ibu Kandung",
            "placeholder": "contoh: Maryam / Nurjanah",
            "helpText": "Nama lengkap ibu kandung pasien",
            "required": true,
            "isActive": true,
            "choices": [],
            "colSpan": 1
          }
        ]
      },
      {
        "id": "step_birth",
        "title": "Tempat & Tanggal Lahir",
        "description": "Isi tempat dan tanggal lahir sesuai kartu tanda penduduk.",
        "fields": [
          {
            "id": "placeOfBirth",
            "type": "TEXT",
            "component": "text-input",
            "title": "Tempat Lahir (Sesuai KTP)",
            "label": "Tempat Lahir",
            "placeholder": "contoh: Sleman / Yogyakarta",
            "helpText": "Kota atau kabupaten tempat lahir",
            "required": true,
            "isActive": true,
            "choices": [],
            "colSpan": 1
          },
          {
            "id": "dateOfBirth",
            "type": "DATE",
            "component": "calendar",
            "title": "Tanggal Lahir (Sesuai KTP)",
            "label": "Tanggal Lahir",
            "placeholder": "Pilih tanggal lahir...",
            "helpText": "Tanggal lahir pasien",
            "required": true,
            "isActive": true,
            "choices": [],
            "colSpan": "full"
          }
        ]
      },
      {
        "id": "step_gender",
        "title": "Jenis Kelamin",
        "description": "Pilih jenis kelamin pasien sesuai KTP.",
        "fields": [
          {
            "id": "gender",
            "type": "LIST",
            "component": "select",
            "title": "Jenis Kelamin",
            "label": "Jenis Kelamin",
            "placeholder": "Pilih jenis kelamin...",
            "helpText": "Jenis kelamin pasien",
            "required": true,
            "isActive": true,
            "choices": ["Laki-laki", "Perempuan"],
            "dataSource": {
              "type": "catalog",
              "key": "child_sexes"
            },
            "colSpan": 1
          }
        ]
      },
      {
        "id": "step_blood_type",
        "title": "Golongan Darah",
        "description": "Pilih golongan darah pasien. Pilih Belum Tahu jika belum pernah diperiksa.",
        "fields": [
          {
            "id": "bloodType",
            "type": "LIST",
            "component": "select",
            "title": "Golongan Darah",
            "label": "Golongan Darah",
            "placeholder": "Pilih golongan darah...",
            "helpText": "Pilih Belum Tahu jika belum pernah diperiksa",
            "required": true,
            "isActive": true,
            "choices": ["A", "B", "AB", "O", "Belum Tahu"],
            "dataSource": {
              "type": "catalog",
              "key": "blood_types"
            },
            "colSpan": 1
          }
        ]
      },
      {
        "id": "step_phone",
        "title": "Nomor WhatsApp / Telepon",
        "description": "Nomor aktif yang dapat dihubungi untuk konfirmasi antrean, pengingat janji temu, dan koordinasi faskes.",
        "fields": [
          {
            "id": "phone",
            "type": "TEXT",
            "component": "text-input",
            "title": "Nomor WhatsApp / Telepon",
            "label": "No. Telepon / WhatsApp",
            "placeholder": "0812-3456-7890",
            "helpText": "Nomor handphone aktif untuk notifikasi janji temu",
            "required": true,
            "isActive": true,
            "choices": [],
            "colSpan": 1
          }
        ]
      },
      {
        "id": "step_emergency_contact",
        "title": "Kontak Darurat (Keluarga / Kerabat)",
        "description": "Nomor kerabat atau keluarga yang dapat dihubungi saat kondisi darurat medis.",
        "fields": [
          {
            "id": "emergencyContactAffiliationId",
            "type": "LIST",
            "component": "select",
            "title": "Pilih dari Keluarga / Afiliasi Terdaftar",
            "label": "Keluarga Terdaftar",
            "placeholder": "Pilih dari daftar anggota keluarga akun...",
            "helpText": "Pilih jika kontak darurat sudah terdaftar sebagai afiliasi keluarga",
            "required": false,
            "isActive": true,
            "choices": [],
            "dataSource": {
              "type": "catalog",
              "key": "patient_affiliations"
            },
            "colSpan": 1
          },
          {
            "id": "emergencyContactName",
            "type": "TEXT",
            "component": "text-input",
            "title": "Nama Kontak Darurat",
            "label": "Nama Kerabat",
            "placeholder": "contoh: Budi Santoso / Siti Rahayu",
            "helpText": "Nama keluarga atau kerabat dekat",
            "required": false,
            "isActive": true,
            "choices": [],
            "colSpan": 1
          },
          {
            "id": "emergencyContactRelationship",
            "type": "LIST",
            "component": "select",
            "title": "Hubungan dengan Pasien",
            "label": "Hubungan",
            "placeholder": "Pilih hubungan dengan pasien...",
            "helpText": "Hubungan relasi keluarga dengan pasien dari katalog master resmi",
            "required": false,
            "isActive": true,
            "choices": [],
            "dataSource": {
              "type": "catalog",
              "key": "relationships"
            },
            "colSpan": 1
          },
          {
            "id": "emergencyContactPhone",
            "type": "TEXT",
            "component": "text-input",
            "title": "Nomor Telepon Kontak Darurat",
            "label": "No. Telepon Darurat",
            "placeholder": "contoh: 0812-9876-5432",
            "helpText": "Nomor telepon aktif kerabat darurat",
            "required": false,
            "isActive": true,
            "choices": [],
            "colSpan": 1
          }
        ]
      },
      {
        "id": "step_domicile",
        "title": "Alamat Domisili Bertingkat",
        "description": "Pilih wilayah bertingkat domisili saat ini (Negara, Provinsi, Kota/Kabupaten, Kecamatan, Kelurahan, Alamat Detail).",
        "fields": [
          {
            "id": "region",
            "type": "TEXT",
            "component": "region-dropdown",
            "title": "Wilayah Domisili Indonesia",
            "label": "Alamat Domisili",
            "placeholder": "Pilih provinsi, kota, kecamatan, kelurahan, dan isi alamat jalan...",
            "helpText": "Data wilayah terverifikasi Kementerian Dalam Negeri",
            "required": true,
            "isActive": true,
            "choices": [],
            "dataSource": {
              "type": "catalog",
              "key": "indonesian_regions"
            },
            "colSpan": "full"
          }
        ]
      },
      {
        "id": "step_occupation",
        "title": "Pekerjaan Pasien",
        "description": "Pilih pekerjaan pasien dari katalog master resmi.",
        "fields": [
          {
            "id": "occupationCode",
            "type": "LIST",
            "component": "select",
            "title": "Pekerjaan Pasien",
            "label": "Pekerjaan",
            "placeholder": "Pilih pekerjaan pasien...",
            "helpText": "Pekerjaan dari katalog master",
            "required": true,
            "isActive": true,
            "choices": [],
            "dataSource": {
              "type": "catalog",
              "key": "occupations"
            },
            "colSpan": 1
          }
        ]
      },
      {
        "id": "step_review",
        "title": "Ringkasan & Konfirmasi Data Pasien",
        "description": "Periksa kembali seluruh data sebelum disimpan ke profil afiliasi pasien.",
        "fields": []
      }
    ]
  }'::jsonb,
  updated_at = NOW()
WHERE code = 'standard-registration';
