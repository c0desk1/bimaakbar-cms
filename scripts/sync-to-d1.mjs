import { glob } from 'glob';
import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';

const postsDirectory = path.join(process.cwd(), 'content/posts');

export default {
  async fetch(request, env, ctx) {
    const reqPath = new URL(request.url).pathname;
    console.log(`[sync-to-d1] Incoming request path: ${reqPath}`);

    if (reqPath !== '/sync-to-d1') {
      console.log('[sync-to-d1] Path not matched, returning 404.');
      return new Response('Not Found', { status: 404 });
    }

    const filenames = glob.sync(`${postsDirectory}/**/*.{md,mdx}`);
    console.log(`[sync-to-d1] Found ${filenames.length} markdown files.`);

    if (filenames.length === 0) {
      return new Response('Tidak ada file .md atau .mdx ditemukan.', { status: 200 });
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

        // Log SQL and params for debugging
        console.log(`[sync-to-d1] Executing SQL for slug "${slug}" with params:`, params);

        const dbResult = await env.DB.prepare(sql).bind(...params).run();
        console.log(`[sync-to-d1] SQL result for "${slug}":`, dbResult);

        results.push({ slug, status: 'success' });
      } catch (error) {
        console.error(`[sync-to-d1] Error processing "${slug}":`, error);
        results.push({ slug, status: 'error', error: error.message });
      }
    }

    console.log(`[sync-to-d1] Sync results:`, results);

    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
