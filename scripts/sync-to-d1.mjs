// scripts/sync-to-d1.mjs (VERSI FINAL & PALING ANDAL)
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { getPlatformProxy } from 'wrangler';

const postsDirectory = path.join(process.cwd(), 'content/posts');
const dbName = 'bimaakbar-database';

async function main() {
  console.log('Memulai sinkronisasi tabel "posts" ke D1...');

  const proxy = await getPlatformProxy();

  const filenames = glob.sync(`${postsDirectory}/**/*.{md,mdx}`);
  if (filenames.length === 0) {
    console.log('Tidak ada file .md atau .mdx yang ditemukan. Selesai.');
    return;
  }

  console.log(`Menemukan ${filenames.length} file untuk diproses...`);

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

      const params = [
        slug,
        metadata.title,
        content,
        JSON.stringify(metadata)
      ];

      await proxy.D1.prepare(dbName, sql).bind(...params).run();
      console.log(`  ✅ Sukses: ${slug}`);

    } catch (error) {
      console.error(`  ❌ Gagal memproses ${slug}:`, error);
    }
  }
}

main()
  .then(() => console.log('\nSinkronisasi selesai!'))
  .catch(e => {
    console.error("Sinkronisasi gagal total:", e);
    process.exit(1);
  });
