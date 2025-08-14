// app/api/portofolio/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { serialize } from 'next-mdx-remote/serialize';

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
  const portofolioDirectory = path.join(process.cwd(), 'content/portofolio');
  const filenames = fs.readdirSync(portofolioDirectory);

  const portofolioItems = await Promise.all(
    filenames.map(async (filename) => {
      const filePath = path.join(portofolioDirectory, filename);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(fileContent);

      const mdxSource = await serialize(content);

      return {
        slug: generateSlug(filename),
        ...data,
        source: mdxSource,
      };
    })
  );

  return NextResponse.json(portofolioItems);
}