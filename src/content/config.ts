import { defineCollection, z } from 'astro:content';

const baseSchema = z.object({
  title:     z.string(),
  date:      z.coerce.date(),
  category:  z.enum(['blog', 'commands', 'prompts']),
  tags:      z.array(z.string()),
  summary:   z.string().max(200),
  draft:     z.boolean().default(false),
  updatedAt: z.coerce.date().optional(),
});

export const collections = {
  blog:     defineCollection({ type: 'content', schema: baseSchema }),
  commands: defineCollection({ type: 'content', schema: baseSchema }),
  prompts:  defineCollection({ type: 'content', schema: baseSchema }),
};
