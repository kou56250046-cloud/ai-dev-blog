---
title: "Astro Content Collections — 基本スニペット集"
date: 2026-04-03
category: snippet
tags: [astro, typescript, setup]
summary: "Astroのコンテンツコレクションをすぐに使い始めるためのスニペット集。スキーマ定義から記事一覧取得まで。"
draft: false
---

## スキーマ定義（src/content/config.ts）

```typescript
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title:   z.string(),
    date:    z.coerce.date(),
    tags:    z.array(z.string()),
    draft:   z.boolean().default(false),
  }),
});

export const collections = { blog };
```

## 記事一覧取得

```typescript
import { getCollection } from 'astro:content';

// 全記事（下書き除く）を日付降順で取得
const posts = (await getCollection('blog', ({ data }) => !data.draft))
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
```

## 静的パス生成

```typescript
export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map(post => ({
    params: { slug: post.slug },
    props:  { post },
  }));
}
```

## MDXレンダリング

```astro
---
const { post } = Astro.props;
const { Content } = await post.render();
---

<Content />
```
