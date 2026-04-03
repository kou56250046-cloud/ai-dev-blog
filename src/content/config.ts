import { defineCollection, z } from 'astro:content';

const baseSchema = z.object({
  title:     z.string(),
  date:      z.coerce.date(),
  category:  z.enum(['blog', 'cheatsheet', 'snippet', 'design', 'roadmap']),
  tags:      z.array(z.string()),
  summary:   z.string().max(200),
  draft:     z.boolean().default(false),
  updatedAt: z.coerce.date().optional(),
});

export const collections = {
  blog:       defineCollection({ type: 'content', schema: baseSchema }),
  cheatsheet: defineCollection({ type: 'content', schema: baseSchema }),
  snippets:   defineCollection({ type: 'content', schema: baseSchema }),
  design:     defineCollection({ type: 'content', schema: baseSchema }),
  roadmap:    defineCollection({ type: 'content', schema: baseSchema }),
};
