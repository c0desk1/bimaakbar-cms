// scripts/sync-to-d1.mjs (Fokus hanya pada Posts)
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
// Menggunakan API langsung dari Wrangler
import { getPlatformProxy } from 'wrangler';

// --- Konfigurasi ---
const postsDirectory = path.join(process.cwd(), 'content/posts');
const dbName = 'bimaakbar-database';
// -----------------

async function main() {
  console.log('Memulai sinkronisasi tabel "posts" ke D1...');
  
  // Inisialisasi koneksi langsung ke Cloudflare
  const proxy = await getPlatformProxy();

  const filenames = glob.sync(`${postsDirectory}/**/*.{md,mdx}`);
  if (filenames.length === 0) {
    console.log('Tidak ada file .md atau .mdx yang ditemukan. Selesai.');
    return;
  }

  console.log(`Menemukan ${filenames.length} file untuk diproses...`);

  // Perintah SQL yang akan kita gunakan berulang kali
  const sql = `
    INSERT INTO posts (slug, title, content, metadata)
    VALUES (?, ?, ?, json(?))
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      metadata = excluded.metadata;
  `;

  for (const filename of filenames) {
    const slug = path.basename(filename, path.extname(filename));
    
    try {
      console.log(`- Memproses: ${slug}`);
      const fileContent = fs.readFileSync(filename, 'utf8');
      const { data: metadata, content } = matter(fileContent);

      if (!metadata.title) {
        console.warn(`  ⚠️ Peringatan: Judul tidak ada di ${filename}, dilewati.`);
        continue;
      }
      
      // Siapkan parameter sesuai urutan tanda tanya (?) di SQL
      const params = [
        slug,
        metadata.title,
        content,
        JSON.stringify(metadata)
      ];

      // Jalankan perintah langsung ke D1 melalui API
      await proxy.D1.prepare(dbName, sql).bind(...params).run();
      console.log(`  ✅ Sukses: ${slug}`);

    } catch (error) {
      console.error(`  ❌ Gagal memproses ${slug}:`, error);
    }
  }
}

main().catch(e => {
  console.error("Sinkronisasi gagal total:", e);
  process.exit(1); // Keluar dengan status error
});
