import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { execSync } from 'child_process';

const postsDirectory = path.join(process.cwd(), 'content/posts');
const dbName = 'bimaakbar-database';

console.log('Memulai sinkronisasi konten...');

const filenames = glob.sync(`${postsDirectory}/**/*.{md,mdx}`);
if (filenames.length === 0) {
  console.log('Tidak ada file .mdx yang ditemukan. Selesai.');
  process.exit(0);
}

console.log(`Menemukan ${filenames.length} file...`);

for (const filename of filenames) {
  const slug = path.basename(filename, '.mdx');
  console.log(`- Memproses: ${slug}`);

  const fileContent = fs.readFileSync(filename, 'utf8');
  const { data: metadata, content } = matter(fileContent);

  if (!metadata.title) {
    console.warn(`  ⚠️ Peringatan: Judul tidak ditemukan di ${filename}, file dilewati.`);
    continue;
  }

  const metadataJsonString = JSON.stringify(metadata).replace(/'/g, "''");

  const sql = `
    INSERT INTO posts (slug, title, content, metadata)
    VALUES ('${slug}', '${metadata.title.replace(/'/g, "''")}', '${content.replace(/'/g, "''")}', json('${metadataJsonString}'))
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      metadata = excluded.metadata;
  `;

  try {
    execSync(`npx wrangler d1 execute ${dbName} --command "${sql}"`, { stdio: 'inherit' });
    console.log(`  ✅ Sukses: ${slug}`);
  } catch (error) {
    console.error(`  ❌ Gagal: ${slug}`, error);
  }
}

console.log('\nSinkronisasi selesai!');

