/**
 * DB Atlas - PROTOCOL.md Renderer (§12)
 * The mandatory commandments for AI agents and developers interacting with this schema.
 */

export class ProtocolMdRenderer {
  static render(): string {
    return `# Agent Protocol: Mandatory Database Interaction Rules

> **PERHATIAN UNTUK AI AGENT & REKAYASAWAN**:
> Aturan berikut bersifat **WAJIB (MANDATORY)** dan tidak dapat ditawar ketika berinteraksi dengan database proyek ini.

---

## 1. Periksa Kesegaran Peta Terlebih Dahulu (*Check Freshness First*)
Sebelum menulis kueri atau merancang fitur baru, jalankan:
\`\`\`bash
bun run db:atlas:check
\`\`\`
- **Exit 0**: Peta segar, silakan lanjutkan.
- **Exit 2**: Terjadi *drift* (skema berubah). Jalankan \`bun run db:atlas\` untuk memperbarui peta dan baca ulang kartu tabel yang terpengaruh.
- **Exit lainnya**: Laporkan kendala koneksi atau izin ke pengguna.

## 2. Baca Secara Bertingkat (*Read Top-Down*)
Mulai dari \`INDEX.md\` (Layer 0), identifikasi hanya tabel-tabel yang relevan dengan tugas Anda, lalu baca kartu tabel terkait di \`tables/<schema>.<table>.md\` (Layer 1). Jangan memuat seluruh isi database ke dalam konteks sekaligus.

## 3. Jangan Pernah Mengarang Struktur (*Never Invent Structure*)
Gunakan **hanya** tabel, kolom, label enum, dan relasi yang tercantum di dalam peta. Jika suatu kolom atau enum tidak ada di peta, nyatakan dengan jujur bahwa data tersebut belum tersedia; jangan pernah berhalusinasi atau menebak.

## 4. Rute Join Wajib dari Peta (*Joins Come from Declared Edges*)
Gunakan perintah pencarian jalur:
\`\`\`bash
bun run db:atlas path <tabel_asal> <tabel_tujuan>
\`\`\`
Gunakan relasi deklaratif (\`declared\`). Anggap relasi inferensi (\`inferred\`) sebagai belum terverifikasi: jangan gunakan pada *write path*.

## 5. Waspadai Penggelembungan Baris (*Respect Fan-Out*)
Jika suatu rute join mengandung lompatan *one-to-many*, sadari bahwa baris akan berlipat ganda (*fan-out*). Lakukan agregasi pada subkueri atau gunakan \`DISTINCT\` / pre-agregasi sebelum melakukan operasi \`SUM\` atau \`COUNT\`.

## 6. Terapkan Konvensi yang Terdeteksi (*Apply Detected Conventions*)
Jika suatu kartu tabel mencatat konvensi soft-delete (\`deleted_at\`), filter \`deleted_at IS NULL\` adalah **wajib**. Jika terdapat scoping tenant (\`clinic_id\`), sertakan pembatasan klinik terkait.

## 7. Lindungi Data Sensitif & Medis Pasien (*Protect Sensitive Data / PHI*)
- **DILARANG KERAS** melakukan \`SELECT *\` pada tabel yang bertanda **PHI** atau **PII**.
- Pilih kolom spesifik non-sensitif yang diperlukan saja.
- Jangan pernah mencetak, mencatat ke log, atau menempelkan nilai riil pasien ke dalam riwayat percakapan.

## 8. Validasi Kueri Sebelum Eksekusi (*Validate Before Executing*)
Periksa kueri yang dibuat menggunakan \`EXPLAIN\` (bukan \`EXPLAIN ANALYZE\`) di dalam transaksi \`READ ONLY\`. Perubahan skema hanya boleh dilakukan melalui file migrasi Drizzle resmi, bukan melalui pernyataan SQL ad-hoc.

## 9. Regenerasi Peta Setelah Migrasi (*Regenerate After Migrations*)
Setiap kali Anda membuat atau menjalankan migrasi baru, jalankan regenerasi:
\`\`\`bash
bun run db:atlas
\`\`\`
dan sertakan perubahan diff \`db-atlas/\` pada commit yang sama.

## 10. Hindari Server Cursors (*No Session Cursors*)
Untuk pagination berbasis kursor yang stabil, gunakan rekomendasi kandidat indeks pada kartu tabel (\`Keyset Pagination candidate\`), bukan server-side cursors.
`;
  }
}
