// app/api/pages/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { serialize } from 'next-mdx-remote/serialize';

const cmsBaseUrl = process.env.CMS_URL;

function toFullUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${cmsBaseUrl}${path}`;
}

function generateSlug(filename: string): string {
  let slug = filename.toLowerCase();
  const lastDotIndex = slug.lastIndexOf('.');
  if (lastDotIndex !== -1) {
    slug = slug.substring(0, lastDotIndex);
  }

  slug = slug.replace(/[^a-z0-9-]/g, '-');
  slug = slug.replace(/--+/g, '-').replace(/^-+|-+$/g, '');

  return slug;
}

export async function GET() {
  const pagesDirectory = path.join(process.cwd(), 'content/pages');
  const filenames = fs.readdirSync(pagesDirectory);

  const pages = await Promise.all(
    filenames.map(async (filename) => {
      const filePath = path.join(pagesDirectory, filename);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(fileContent);

      const mdxSource = await serialize(content);

      return {
        slug: generateSlug(filename),
        ...data,
        source: mdxSource,
        coverImage: toFullUrl(data.coverImage),
        content: content
      };
    })
  );

  return NextResponse.json(pages);
}