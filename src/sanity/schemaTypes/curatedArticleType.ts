import {defineField, defineType} from 'sanity'

export const curatedArticleType = defineType({
  name: 'curatedArticle',
  title: 'Curated DEV Article',
  type: 'document',
  fields: [
    defineField({
      name: 'devArticleId',
      title: 'DEV article ID',
      type: 'number',
      description: 'The canonical numeric article ID from DEV.',
      validation: (rule) => rule.required().integer().positive(),
    }),
    defineField({
      name: 'label',
      title: 'Editorial label',
      type: 'string',
      description: 'Optional title used by the Oniria shelf.',
      validation: (rule) => rule.max(120),
    }),
    defineField({
      name: 'district',
      title: 'Pin to district',
      type: 'reference',
      to: [{type: 'libraryDistrict'}],
    }),
    defineField({
      name: 'featured',
      title: 'Feature on curator shelf',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'priority',
      title: 'Priority',
      type: 'number',
      initialValue: 50,
      validation: (rule) => rule.integer().min(0).max(100),
    }),
    defineField({
      name: 'curatorNote',
      title: 'Curator note',
      type: 'text',
      rows: 3,
      validation: (rule) => rule.max(300),
    }),
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      id: 'devArticleId',
      label: 'label',
      featured: 'featured',
    },
    prepare({id, label, featured}) {
      return {
        title: label || `DEV article #${id ?? '?'}`,
        subtitle: featured ? '★ Curator pick' : 'Curated placement',
      }
    },
  },
})
