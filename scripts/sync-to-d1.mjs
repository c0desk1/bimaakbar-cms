// sync-to-d1.mjs
import { glob } from 'glob';
import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import fetch from 'node-fetch';

const ASSET_BASE_URL = 'https://bimaakbar.bimasaktiakbarr.workers.dev';

const {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_D1_DB_UUID,
  TELEGRAM_BOT_TOKEN,
  ADMIN_CHAT_ID
} = process.env;

// cek environment variable
if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_D1_DB_UUID || !TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.error('Environment variable Cloudflare atau Telegram tidak ditemukan.');
  console.log('CLOUDFLARE_API_TOKEN:', !!CLOUDFLARE_API_TOKEN);
  console.log('CLOUDFLARE_ACCOUNT_ID:', !!CLOUDFLARE_ACCOUNT_ID);
  console.log('CLOUDFLARE_D1_DB_UUID:', !!CLOUDFLARE_D1_DB_UUID);
  console.log('TELEGRAM_BOT_TOKEN:', !!TELEGRAM_BOT_TOKEN);
  console.log('ADMIN_CHAT_ID:', !!ADMIN_CHAT_ID);
  process.exit(1);
}

const D1_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_D1_DB_UUID}/query`;

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

function toFullUrl(filePath) {
  if (!filePath || filePath.startsWith('http')) return filePath;
  return `${ASSET_BASE_URL}${filePath.startsWith('/') ? '' : '/'}${filePath}`;
}

async function syncContentType(config) {
  console.log(`\n--- Sinkronisasi: ${config.name} ---`);

  const contentDir = path.join(process.cwd(), config.directory);
  if (!fs.existsSync(contentDir)) return console.log(`Direktori ${config.directory} tidak ditemukan.`);

  const filenames = glob.sync(`${contentDir}/**/*.{md,mdx}`);
  if (filenames.length === 0) return console.log('Tidak ada file ditemukan.');

  for (const filename of filenames) {
    const slug = path.basename(filename, path.extname(filename));
    try {
      const fileContent = fs.readFileSync(filename, 'utf8');
      const { data: metadata, content } = matter(fileContent);

      if (!metadata.title) continue;

      if (metadata.coverImage) metadata.coverImage = toFullUrl(metadata.coverImage);
      if (metadata.ogImage?.url) metadata.ogImage.url = toFullUrl(metadata.ogImage.url);
      if (metadata.author?.picture) metadata.author.picture = toFullUrl(metadata.author.picture);

      const params = config.mapParams(slug, metadata, content);

      const res = await fetch(D1_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql: config.sql, params })
      });

      const result = await res.json();
      if (!result.success) console.error(`❌ Gagal: ${slug}`, result.errors || result);
      else console.log(`✅ Sukses: ${slug}`);
    } catch (err) {
      console.error(`❌ Error: ${slug}`, err);
    }
  }
}

async function notifySubscribers() {
  try {
    const subsRes = await fetch(`${ASSET_BASE_URL}/subscribers`);
    const text = await subsRes.text();

    let subscribers;
    try {
      subscribers = JSON.parse(text);
    } catch (err) {
      console.error('❌ Response subscriber bukan JSON valid:', text);
      return;
    }

    if (!Array.isArray(subscribers) || subscribers.length === 0) return;

    for (const sub of subscribers) {
      if (!sub.telegram_id) continue;
      try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: sub.telegram_id,
            text: `Hai ${sub.name}, ada konten baru yang mungkin menarik untukmu! 🎉\nCek blog: https://bimaakbar.my.id/blog`
          })
        });
      } catch (err) {
        console.error(`❌ Gagal kirim ke ${sub.telegram_id}:`, err);
      }
    }
    console.log('📩 Semua subscriber telah diberitahu.');
  } catch (err) {
    console.error('❌ Gagal mengirim notifikasi ke subscriber:', err);
  }
}

(async () => {
  for (const config of CONTENT_TYPES) {
    await syncContentType(config);
  }
  await notifySubscribers();
  console.log('\nSemua proses selesai!');
})();
