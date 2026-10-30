import dotenv from 'dotenv';
import path from 'node:path';
import { Resend } from 'resend';

// Load backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error('❌ Error: RESEND_API_KEY tidak ditemukan di backend/.env');
    process.exit(1);
  }

  // Parse arguments
  const args = process.argv.slice(2);
  const targetEmail = args[0] || 'zikrifadhiilahahmad@gmail.com';
  
  // From address: check CLI argument or fallback to onboarding@resend.dev
  // (Resend testing allows sending from onboarding@resend.dev to the registered account email)
  const fromIndex = args.indexOf('--from');
  const fromAddress = fromIndex !== -1 && args[fromIndex + 1]
    ? args[fromIndex + 1]
    : 'onboarding@resend.dev';

  const subject = 'Test Resend Amanah Healthcare';
  const text = 'halo bro';

  console.log('================================================================');
  console.log('🚀 Menguji Pengiriman Email via Resend Official SDK');
  console.log('================================================================');
  console.log(`📤 Dari     : ${fromAddress}`);
  console.log(`📥 Kepada   : ${targetEmail}`);
  console.log(`📋 Subjek   : ${subject}`);
  console.log(`💬 Isi      : ${text}`);
  console.log('----------------------------------------------------------------');

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [targetEmail],
      subject,
      text,
      html: `<p><strong>${text}</strong></p><p>Email uji coba integrasi Resend dari Amanah Healthcare Backend.</p>`,
    });

    if (error) {
      console.error(`❌ Gagal mengirim via Resend:`);
      console.error(`   Nama Error  : ${error.name}`);
      console.error(`   Pesan Error : ${error.message}`);
      if (error.name === 'validation_error' && fromAddress !== 'onboarding@resend.dev') {
        console.log('\n💡 Tip: Jika domain kustom belum diverifikasi di Resend, gunakan sender default:');
        console.log('   bun ./scripts/dev/test-resend.ts <email> --from onboarding@resend.dev');
      }
      process.exit(1);
    }

    console.log(`✅ Berhasil terkirim via Resend!`);
    console.log(`🆔 Resend Email ID : ${data?.id}`);
    console.log('================================================================');
  } catch (err) {
    console.error(`❌ Terjadi exception saat memanggil Resend:`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
