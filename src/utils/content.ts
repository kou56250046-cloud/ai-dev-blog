import { getCollection, type CollectionEntry } from 'astro:content';

export type AnyEntry =
  | CollectionEntry<'blog'>
  | CollectionEntry<'cheatsheet'>
  | CollectionEntry<'snippets'>
  | CollectionEntry<'design'>
  | CollectionEntry<'roadmap'>;

export async function getAllPosts(includeDrafts = false) {
  const [blog, cheatsheet, snippets, design, roadmap] = await Promise.all([
    getCollection('blog',       ({ data }) => includeDrafts || !data.draft),
    getCollection('cheatsheet', ({ data }) => includeDrafts || !data.draft),
    getCollection('snippets',   ({ data }) => includeDrafts || !data.draft),
    getCollection('design',     ({ data }) => includeDrafts || !data.draft),
    getCollection('roadmap',    ({ data }) => includeDrafts || !data.draft),
  ]);
  return [...blog, ...cheatsheet, ...snippets, ...design, ...roadmap]
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getRecentPosts(limit = 6) {
  const all = await getAllPosts();
  return all.slice(0, limit);
}

export async function getAllTags(): Promise<string[]> {
  const all = await getAllPosts();
  const tags = new Set<string>();
  for (const post of all) post.data.tags.forEach(t => tags.add(t));
  return [...tags].sort();
}

export const categoryMeta: Record<string, { label: string; icon: string; description: string }> = {
  blog:       { label: 'ブログ記事',     icon: '📝', description: '学習ログ・気づき・ツール比較' },
  cheatsheet: { label: 'チートシート',   icon: '⚡', description: 'コマンド・設定リファレンス' },
  snippet:    { label: 'スニペット',     icon: '🧩', description: '再利用可能なコード片' },
  design:     { label: '設計メモ',       icon: '🏗️', description: 'アーキテクチャ・要件定義' },
  roadmap:    { label: 'ロードマップ',   icon: '🗺️', description: '学習進捗管理' },
};
