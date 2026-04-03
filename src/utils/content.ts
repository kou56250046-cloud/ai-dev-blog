import { getCollection, type CollectionEntry } from 'astro:content';

export type AnyEntry =
  | CollectionEntry<'blog'>
  | CollectionEntry<'commands'>
  | CollectionEntry<'prompts'>;

export async function getAllPosts(includeDrafts = false) {
  const [blog, commands, prompts] = await Promise.all([
    getCollection('blog',     ({ data }) => includeDrafts || !data.draft),
    getCollection('commands', ({ data }) => includeDrafts || !data.draft),
    getCollection('prompts',  ({ data }) => includeDrafts || !data.draft),
  ]);
  return [...blog, ...commands, ...prompts]
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
  blog:     { label: 'ブログ記事',   icon: '📝', description: '学習ログ・気づき・ツール比較' },
  commands: { label: 'コマンド集',   icon: '⚡', description: 'CLI・設定コマンドリファレンス' },
  prompts:  { label: 'プロンプト集', icon: '💬', description: 'AI活用の定番プロンプト' },
};
