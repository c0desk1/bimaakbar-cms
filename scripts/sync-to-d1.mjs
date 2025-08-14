import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';

// --- PUSAT KONFIGURASI ---
// Tambahkan atau ubah tipe konten di sini
const CONTENT_TYPES = [
  {
    name: 'posts',
    directory: 'content/posts',
    sql: `INSERT INTO posts (slug, title, content, metadata) VALUES (?, ?, ?, json(?))
          ON CONFLICT(slug) DO UPDATE SET title=excluded.title, content=excluded.content, metadata=excluded.metadata;`,
  },
  {
    name: 'portofolio',
    directory: 'content/portofolio',
    sql: `INSERT INTO portofolio (title, date, excerpt, videoId) VALUES (?, ?, ?, ?)
          ON CONFLICT(title) DO UPDATE SET date=excluded.date, excerpt=excluded.excerpt, videoId=excluded.videoId;`,
  },
  {
    name: 'pages',
    directory: 'content/pages',
    sql: `INSERT INTO pages (slug, title, excerpt, coverImage, content) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(slug) DO UPDATE SET title=excluded.title, excerpt=excluded.excerpt, coverImage=exlude.coverImage, content=excluded.content;`,
  },
];

const dbName = 'bimaakbar-database';

async function syncContentType(config) {
  console.log(`\n--- Memulai sinkronisasi untuk tipe: ${config.name} ---`);
  
  const contentDirectory = path.join(process.cwd(), config.directory);
  if (!fs.existsSync(contentDirectory)) {
    console.log(`Direktori ${config.directory} tidak ditemukan, melewati.`);
    return;
  }
  
  const filenames = glob.sync(`${contentDirectory}/**/*.{md,mdx}`);
  if (filenames.length === 0) {
    console.log('Tidak ada file yang ditemukan. Selesai.');
    return;
  }
  
  console.log(`Menemukan ${filenames.length} file...`);

  for (const filename of filenames) {
    const slug = path.basename(filename, path.extname(filename));
    console.log(`- Memproses: ${slug}`);

    const fileContent = fs.readFileSync(filename, 'utf8');
    const { data: metadata, content } = matter(fileContent);

    if (!metadata.title) {
      console.warn(`  ⚠️ Peringatan: Judul tidak ditemukan di ${filename}, file dilewati.`);
      continue;
    }
    
    let params;
    // Siapkan parameter berdasarkan tipe konten
    if (config.name === 'posts') {
      params = [slug, metadata.title, content, JSON.stringify(metadata)];
    } else if (config.name === 'portofolio') {
      params = [metadata.title, metadata.date, metadata.excerpt, metadata.videoId];
    } else if (config.name === 'pages') {
      params = [slug, metadata.title, content];
    }

    const paramsFile = path.join(process.cwd(), `params-${randomBytes(4).toString('hex')}.json`);
    fs.writeFileSync(paramsFile, JSON.stringify(params));

    try {
      execSync(
        `npx wrangler d1 execute ${dbName} --command "${config.sql}" --json-parameters file://${paramsFile}`,
        { stdio: 'inherit' }
      );
      console.log(`  ✅ Sukses: ${slug || metadata.title}`);
    } catch (error) {
      console.error(`  ❌ Gagal: ${slug || metadata.title}`, error);
    } finally {
      fs.unlinkSync(paramsFile);
    }
  }
}

(async () => {
  for (const config of CONTENT_TYPES) {
    await syncContentType(config);
  }
  console.log('\nSemua sinkronisasi selesai!');
})();
