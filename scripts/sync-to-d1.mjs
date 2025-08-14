import { glob } from 'glob';
import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import fetch from 'node-fetch';

const CONTENT_TYPES = [
  {
    name: 'posts',
    directory: 'content/posts',
    sql: `INSERT INTO posts (slug, title, content, metadata) VALUES (?, ?, ?, json(?))
          ON CONFLICT(slug) DO UPDATE SET title=excluded.title, content=excluded.content, metadata=excluded.metadata;`,
    mapParams: (slug, metadata, content) => [slug, metadata.title, content, JSON.stringify(metadata)],
  },
 {
    name: 'pages',
    directory: 'content/pages',
    sql: `INSERT INTO pages (slug, title, content, excerpt, coverImage) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(slug) DO UPDATE SET title=excluded.title, content=excluded.content, excerpt=excluded.excerpt, coverImage=excluded.coverImage;`,
    mapParams: (slug, metadata, content) => [slug, metadata.title, content, metadata.excerpt, metadata.coverImage],
  },
  {
    name: 'portofolio',
    directory: 'content/portofolio',
    sql: `INSERT INTO portofolio (title, date, excerpt, videoId) VALUES (?, ?, ?, ?)
          ON CONFLICT(videoId) DO UPDATE SET title=excluded.title, date=excluded.date, excerpt=excluded.excerpt;`,
    mapParams: (slug, metadata, content) => [metadata.title, metadata.date, metadata.excerpt, metadata.videoId],
  },
];

const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DB_UUID } = process.env;

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_D1_DB_UUID) {
  console.error('Satu atau lebih environment variable Cloudflare tidak ditemukan.');
  process.exit(1);
}

const D1_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_D1_DB_UUID}/query`;

async function syncContentType(config) {
  console.log(`\n--- Memulai sinkronisasi untuk tipe: ${config.name} ---`);
  
  const contentDirectory = path.join(process.cwd(), config.directory);
  if (!fs.existsSync(contentDirectory)) {
    console.log(`Direktori ${config.directory} tidak ditemukan, melewati.`);
    return;
  }

  const filenames = glob.sync(`${contentDirectory}/**/*.{md,mdx}`);
  if (filenames.length === 0) {
    console.log('Tidak ada file yang ditemukan.');
    return;
  }
  
  console.log(`Menemukan ${filenames.length} file...`);

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
      
      const params = config.mapParams(slug, metadata, content);
      
      const response = await fetch(D1_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql: config.sql, params })
      });

      const result = await response.json();
      if (!result.success) {
        console.error(`  ❌ Gagal untuk "${slug}":`, result.errors || result);
      } else {
        console.log(`  ✅ Sukses untuk "${slug}"`);
      }
    } catch (error) {
      console.error(`  ❌ Error saat memproses "${slug}":`, error);
    }
  }
}

(async () => {
  for (const config of CONTENT_TYPES) {
    await syncContentType(config);
  }
  console.log('\nSemua sinkronisasi selesai!');
})();
