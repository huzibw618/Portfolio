import { defineCollection, z } from 'astro:content';

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    category: z.enum([
      'Generative AI & NLP',
      'Robotics & Reinforcement Learning',
      'Computer Vision',
      'Systems / Hardware / Formal Methods',
      'Algorithms & Foundations',
    ]),
    date: z.string(),
    techStack: z.array(z.string()),
    description: z.string(),
    summary: z.string().optional(),
    featured: z.boolean().default(false),
    links: z
      .object({
        github: z.string().url().optional(),
        demo: z.string().url().optional(),
        paper: z.string().url().optional(),
      })
      .optional(),
  }),
});

export const collections = { projects };
