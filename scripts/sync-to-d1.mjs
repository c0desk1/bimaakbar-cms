import { glob } from 'glob';
import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import fetch from 'node-fetch';

const postsDirectory = path.join(process.cwd(), 'content/posts');

// Ganti sesuai secrets di workflow
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_D1_DB_UUID = process.env.CLOUDFLARE_D1_DB_UUID;

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_D1_DB_UUID) {
  console.error('CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, or CLOUDFLARE_D1_DB_UUID is missing in environment.');
  process.exit(1);
}

const D1_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_D1_DB_UUID}/query`;

async function syncToD1() {
  console.log('[sync-to-d1] Start syncing markdown to D1');

  const filenames = glob.sync(`${postsDirectory}/**/*.{md,mdx}`);
  console.log(`[sync-to-d1] Found ${filenames.length} markdown files.`);

  if (filenames.length === 0) {
    console.log('[sync-to-d1] Tidak ada file .md atau .mdx ditemukan.');
    return;
  }

  const sql = `
    INSERT INTO posts (slug, title, content, metadata)
    VALUES (?, ?, ?, json(?))
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      metadata = excluded.metadata;
  `;

  let results = [];
  for (const filename of filenames) {
    const slug = path.basename(filename, path.extname(filename));
    console.log(`[sync-to-d1] Processing file: ${filename}, slug: ${slug}`);

    try {
      const fileContent = fs.readFileSync(filename, 'utf8');
      console.log(`[sync-to-d1] Read file content (length: ${fileContent.length})`);

      const { data: metadata, content } = matter(fileContent);
      console.log(`[sync-to-d1] Parsed metadata:`, metadata);

      if (!metadata.title) {
        console.log(`[sync-to-d1] Skipping file "${slug}": metadata.title is missing.`);
        results.push({ slug, status: 'skipped', reason: 'title missing' });
        continue;
      }

      const params = [
        slug,
        metadata.title,
        content,
        JSON.stringify(metadata)
      ];

      // Kirim query ke D1 REST API
      const response = await fetch(D1_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sql,
          params
        })
      });

      const result = await response.json();
      if (!result.success) {
        console.error(`[sync-to-d1] Error for "${slug}":`, result.errors || result);
        results.push({ slug, status: 'error', error: JSON.stringify(result.errors || result) });
      } else {
        console.log(`[sync-to-d1] Success for "${slug}":`, result);
        results.push({ slug, status: 'success' });
      }
    } catch (error) {
      console.error(`[sync-to-d1] Error processing "${slug}":`, error);
      results.push({ slug, status: 'error', error: error.message });
    }
  }

  console.log(`[sync-to-d1] Sync results:`, results);
}

syncToD1();
