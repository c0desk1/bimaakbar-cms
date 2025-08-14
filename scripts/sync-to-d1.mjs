import { glob } from 'glob';
import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';

const postsDirectory = path.join(process.cwd(), 'content/posts');

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname !== '/sync-to-d1') {
      return new Response('Not Found', { status: 404 });
    }

    const filenames = glob.sync(`${postsDirectory}/**/*.{md,mdx}`);
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
      try {
        const fileContent = fs.readFileSync(filename, 'utf8');
        const { data: metadata, content } = matter(fileContent);

        if (!metadata.title) {
          results.push({ slug, status: 'skipped', reason: 'title missing' });
          continue;
        }

        const params = [
          slug,
          metadata.title,
          content,
          JSON.stringify(metadata)
        ];

        await env.DB.prepare(sql).bind(...params).run();
        results.push({ slug, status: 'success' });
      } catch (error) {
        results.push({ slug, status: 'error', error: error.message });
      }
    }
    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
