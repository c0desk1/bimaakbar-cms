// scripts/sync-to-d1.mjs
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { execSync } from 'child_process';

const postsDirectory = path.join(process.cwd(), 'content/posts');
const dbName = 'bimaakbar-database';

console.log('Memulai sinkronisasi konten ke D1...');

const filenames = glob.sync(`${postsDirectory}/**/*.mdx`);
if (filenames.length === 0) {
  console.log('Tidak ada file .mdx yang ditemukan. Selesai.');
  process.exit(0);
}

console.log(`Menemukan ${filenames.length} file untuk diproses...`);

for (const filename of filenames) {
  console.log(`- Memproses ${filename}`);

  const fileContent = fs.readFileSync(filename, 'utf8');
  const { data: metadata, content } = matter(fileContent);

  const title = metadata.title;
  const slug = path.basename(filename, '.mdx');
  const metadataJsonString = JSON.stringify(metadata);

  const sql = `
    INSERT INTO posts (slug, title, content, metadata)
    VALUES ('${slug}', '${title.replace(/'/g, "''")}', '${content.replace(/'/g, "''")}', json('${metadataJsonString.replace(/'/g, "''")}'))
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      metadata = excluded.metadata;
  `;

  try {

    execSync(`npx wrangler d1 execute ${dbName} --command "${sql}"`, { stdio: 'inherit' });
    console.log(`  ✅ Sukses menyinkronkan slug: ${slug}`);
  } catch (error) {
    console.error(`  ❌ Gagal menyinkronkan slug: ${slug}`, error);
  }
}

console.log('\nSinkronisasi selesai!');