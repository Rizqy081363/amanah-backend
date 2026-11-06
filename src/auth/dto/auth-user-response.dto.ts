import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthAvatarDto {
  @ApiProperty({ description: 'Kanonikal URL avatar profil pengguna' })
  url: string;

  @ApiProperty({ description: 'Inisial nama pengguna (misal: "JD")' })
  initials: string;

  @ApiProperty({
    enum: ['custom', 'oauth', 'initials'],
    description: 'Sumber avatar pengguna',
  })
  type: 'custom' | 'oauth' | 'initials';

  @ApiProperty({
    description: 'Menunjukkan apakah avatar berasal dari upload kustom',
  })
  hasCustomAvatar: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'URL langsung avatar jika tersedia',
  })
  directUrl?: string | null;
}

export class AuthRoleSummaryDto {
  @ApiProperty({ description: 'ID unik role (UUID)' })
  id: string;

  @ApiProperty({
    description: 'Kode unik role (misal: "admin", "doctor", "staff")',
  })
  code: string;

  @ApiProperty({ description: 'Nama resmi role' })
  name: string;

  @ApiProperty({ description: 'Hierarki/tingkat tier peran' })
  tier: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Audience peran (INTERNAL atau EXTERNAL)',
  })
  audience?: string | null;

  @ApiProperty({
    description: 'Menandakan apakah peran termasuk tenaga klinis medis',
  })
  isClinical: boolean;
}

export class AuthStaffAddressDto {
  @ApiPropertyOptional({ nullable: true })
  provinceCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  provinceName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  regencyCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  regencyName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  districtCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  districtName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  villageCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  villageName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  line1?: string | null;

  @ApiPropertyOptional({ nullable: true })
  fullAddress?: string | null;
}

export class AuthStaffProfileDto {
  @ApiProperty({ description: 'ID profil staf (UUID)' })
  id: string;

  @ApiProperty({ description: 'ID akun pengguna induk (UUID)' })
  userId: string;

  @ApiPropertyOptional({ nullable: true })
  roleId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  roleCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  roleName?: string | null;

  @ApiProperty({
    description: 'Menandakan apakah staf merupakan tenaga medis klinis',
  })
  isClinical: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ID praktisi klinis jika ada',
  })
  practitionerId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ID unit poliklinik penempatan staf',
  })
  poliklinikId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nama unit poliklinik penempatan staf',
  })
  poliklinikName?: string | null;

  @ApiProperty({ description: 'Nama lengkap staf beserta gelar' })
  fullName: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Jabatan atau profesi staf',
  })
  profession?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nomor induk staf / kode staf',
  })
  staffCode?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nomor Identitas Kependudukan (NIK)',
  })
  nationalId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nomor identitas kartu (alias NIK)',
  })
  idCardNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  birthPlace?: string | null;

  @ApiPropertyOptional({ nullable: true })
  birthDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  gender?: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  photoUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phoneNumber?: string | null;

  @ApiProperty({ description: 'Status keaktifan staf di klinik' })
  isActive: boolean;

  @ApiPropertyOptional({
    type: () => AuthStaffAddressDto,
    nullable: true,
  })
  address?: AuthStaffAddressDto | null;

  @ApiPropertyOptional({ description: 'Alamat lengkap gabungan' })
  fullAddress?: string;

  @ApiPropertyOptional({ nullable: true })
  alamatDetail?: string | null;

  @ApiPropertyOptional({ nullable: true })
  provinsi?: string | null;

  @ApiPropertyOptional({ nullable: true })
  provinsiId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kabupaten?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kabupatenId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kecamatan?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kecamatanId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kelurahan?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kelurahanId?: string | null;
}

export class AuthPatientProfileDto {
  @ApiProperty({ description: 'ID profil pasien (UUID)' })
  id: string;

  @ApiProperty({ description: 'ID akun pengguna induk (UUID)' })
  userId: string;

  @ApiProperty({ description: 'Nomor Rekam Medis (No RM)' })
  medicalRecordNumber: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nomor Induk Kependudukan (NIK)',
  })
  nik?: string | null;

  @ApiProperty({ description: 'Nama lengkap pasien' })
  fullName: string;

  @ApiPropertyOptional({ nullable: true })
  gender?: string | null;

  @ApiPropertyOptional({ nullable: true })
  birthPlace?: string | null;

  @ApiPropertyOptional({ nullable: true })
  birthDate?: string | null;

  @ApiProperty({ description: 'Golongan darah pasien' })
  bloodType: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ID unik master golongan darah (UUID)',
  })
  bloodTypeId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phoneNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  motherName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  occupation?: string | null;

  @ApiProperty({ description: 'Alamat lengkap pasien' })
  address: string;

  @ApiPropertyOptional({ nullable: true })
  alamatDetail?: string | null;

  @ApiPropertyOptional({ nullable: true })
  provinsi?: string | null;

  @ApiPropertyOptional({ nullable: true })
  provinsiId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kabupaten?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kabupatenId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kecamatan?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kecamatanId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kelurahan?: string | null;

  @ApiPropertyOptional({ nullable: true })
  kelurahanId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  emergencyContactName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  emergencyContactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  emergencyContactRelationship?: string | null;

  @ApiProperty({ description: 'Status verifikasi data pasien' })
  status: string;
}

export class AuthUserResponseDto {
  @ApiProperty({ description: 'ID akun pengguna (UUID)' })
  id: string;

  @ApiProperty({ description: 'Nama lengkap pengguna' })
  name: string;

  @ApiProperty({ description: 'Alamat email akun' })
  email: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nomor telepon pengguna',
  })
  phone?: string | null;

  @ApiProperty({ description: 'Status verifikasi email' })
  emailVerified: boolean;

  @ApiProperty({ description: 'Status verifikasi nomor telepon' })
  phoneVerified: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'URL avatar profil' })
  avatarUrl?: string | null;

  @ApiProperty({
    description:
      'Status akun pengguna (active, suspended, pending_verification)',
  })
  status: string;

  @ApiProperty({ description: 'Bahasa antarmuka pilihan pengguna' })
  preferredLocale: string;

  @ApiProperty({ description: 'Status autentikasi dua faktor (2FA)' })
  twoFactorEnabled: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Waktu login terakhir' })
  lastLoginAt?: string | null;

  @ApiProperty({ description: 'Waktu pendaftaran akun' })
  createdAt: string;

  @ApiProperty({ description: 'Waktu pembaruan akun terakhir' })
  updatedAt: string;

  @ApiProperty({
    type: () => AuthAvatarDto,
    description: 'Objek representasi avatar komprehensif',
  })
  avatar: AuthAvatarDto;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Kode peran utama akun (misal: "admin", "doctor")',
  })
  roleCode?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Audience peran (INTERNAL atau EXTERNAL)',
  })
  audience?: string | null;

  @ApiPropertyOptional({
    type: () => AuthRoleSummaryDto,
    nullable: true,
    description: 'Detail peran primer akun beserta hierarkinya',
  })
  role?: AuthRoleSummaryDto | null;

  @ApiProperty({
    type: [String],
    description: 'Daftar kode hak akses/permission dinamis akun (RBAC)',
  })
  permissions: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Daftar route path halaman aplikasi yang diizinkan untuk diakses akun ini',
  })
  accessibleRoutes?: string[];

  @ApiPropertyOptional({
    type: () => AuthStaffProfileDto,
    nullable: true,
    description: 'Data profil staf terhubung jika berstatus staf internal',
  })
  staff?: AuthStaffProfileDto | null;

  @ApiPropertyOptional({
    type: () => AuthPatientProfileDto,
    nullable: true,
    description: 'Data profil pasien terhubung jika berstatus pasien',
  })
  patient?: AuthPatientProfileDto | null;

  @ApiProperty({
    description:
      'Menandakan akun baru yang membutuhkan alur onboarding data profil',
  })
  needsOnboarding: boolean;

  @ApiPropertyOptional({
    description: 'Menandakan apakah akun tertaut dengan Google OAuth',
  })
  hasGoogle?: boolean;

  @ApiPropertyOptional({
    description: 'Menandakan apakah akun memiliki kredensial kata sandi lokal',
  })
  hasPassword?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Daftar provider autentikasi yang terhubung ke akun (credential, google)',
  })
  linkedProviders?: string[];
}
