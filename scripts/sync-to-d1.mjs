// scripts/sync-to-d1.mjs
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';

// --- Konfigurasi ---
const postsDirectory = path.join(process.cwd(), 'content/posts');
const dbName = 'bimaakbar-database';
// -----------------

console.log('Memulai sinkronisasi tabel "posts" ke D1...');

const filenames = glob.sync(`${postsDirectory}/**/*.{md,mdx}`);
if (filenames.length === 0) {
  console.log('Tidak ada file .md atau .mdx yang ditemukan. Selesai.');
  process.exit(0);
}

console.log(`Menemukan ${filenames.length} file untuk diproses...`);

for (const filename of filenames) {
  const slug = path.basename(filename, path.extname(filename));
  console.log(`- Memproses: ${slug}`);

  const fileContent = fs.readFileSync(filename, 'utf8');
  const { data: metadata, content } = matter(fileContent);

  if (!metadata.title) {
    console.warn(`  ⚠️ Peringatan: Judul tidak ditemukan di ${filename}, file dilewati.`);
    continue;
  }
  
  // Siapkan data dalam sebuah array untuk dikirim sebagai parameter.
  const params = [
    slug,
    metadata.title,
    content,
    JSON.stringify(metadata)
  ];
  
  // Tulis parameter ke file sementara agar aman dari karakter khusus di terminal.
  const paramsFile = path.join(process.cwd(), `params-${randomBytes(4).toString('hex')}.json`);
  fs.writeFileSync(paramsFile, JSON.stringify(params));

  // Perintah SQL sekarang menggunakan placeholder '?' yang aman.
  const sql = `
    INSERT INTO posts (slug, title, content, metadata)
    VALUES (?, ?, ?, json(?))
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      metadata = excluded.metadata;
  `;

  try {
    // Gunakan --json-parameters untuk mengirim data secara aman.
    execSync(
      `npx wrangler d1 execute ${dbName} --command "${sql}" --json-parameters file://${paramsFile}`,
      { stdio: 'inherit' }
    );
    console.log(`  ✅ Sukses: ${slug}`);
  } catch (error) {
    console.error(`  ❌ Gagal: ${slug}`, error);
  } finally {
    // Selalu hapus file sementara setelah selesai.
    fs.unlinkSync(paramsFile);
  }
}

console.log('\nSinkronisasi selesai!');
