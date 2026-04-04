import type { APIRoute } from 'astro';
import { getAllPosts } from '@/utils/content';

export const GET: APIRoute = async () => {
  const posts = await getAllPosts();

  const index = posts.map((post) => ({
    title:    post.data.title,
    summary:  post.data.summary,
    tags:     post.data.tags,
    category: post.data.category,
    date:     post.data.date.toISOString().slice(0, 10),
    slug:     post.slug,
    url:      `/${post.collection}/${post.slug}`,
  }));

  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
};
