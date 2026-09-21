import {defineField, defineType} from 'sanity'

export const symbolType = defineType({
  name: 'symbol',
  title: 'Symbol',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (rule) => rule.required().min(1).max(80),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          {title: 'Person', value: 'person'},
          {title: 'Place', value: 'place'},
          {title: 'Object', value: 'object'},
          {title: 'Feeling', value: 'feeling'},
          {title: 'Action', value: 'action'},
        ],
        layout: 'radio',
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'icon',
      title: 'Icon',
      type: 'string',
      description: 'Optional emoji or short icon identifier, e.g. 🌊, 👁️, 🏠.',
      validation: (rule) => rule.max(24),
    }),
  ],
  preview: {
    select: {
      name: 'name',
      category: 'category',
      icon: 'icon',
    },
    prepare({name, category, icon}) {
      return {
        title: `${icon ?? '✦'} ${name ?? 'Unnamed symbol'}`,
        subtitle: category ?? 'Uncategorized',
      }
    },
  },
})
