// app/api/posts/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { serialize } from 'next-mdx-remote/serialize';

const cmsBaseUrl = process.env.NEXT_PUBLIC_API_URL;

function toFullUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${cmsBaseUrl}${path}`;
}

function generateSlug(filename: string) {
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
  const postsDirectory = path.join(process.cwd(), 'content/posts');
  const filenames = fs.readdirSync(postsDirectory);

  const posts = await Promise.all(
    filenames.map(async (filename) => {
      const filePath = path.join(postsDirectory, filename);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(fileContent);

      const mdxSource = await serialize(content);

      return {
        slug: generateSlug(filename),
        ...data,
        coverImage: toFullUrl(data.coverImage),
        author: {
          ...data.author,
          picture: toFullUrl(data.author.picture)
        },
        ogImage: {
          url: toFullUrl(data.ogImage?.url)
        },
        source: mdxSource,
        content: content,
      };
    })
  );

  return NextResponse.json(posts);
}