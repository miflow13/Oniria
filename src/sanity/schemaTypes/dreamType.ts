import {defineArrayMember, defineField, defineType} from 'sanity'

export const dreamType = defineType({
  name: 'dream',
  title: 'Dream',
  type: 'document',
  fields: [
    defineField({
      name: 'date',
      title: 'Dream date',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Optional. Leave blank for an untitled dream.',
      validation: (rule) => rule.max(120),
    }),
    defineField({
      name: 'body',
      title: 'Dream',
      type: 'text',
      rows: 12,
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: 'mood',
      title: 'Mood',
      type: 'number',
      initialValue: 3,
      options: {
        list: [
          {title: '1 — Heavy', value: 1},
          {title: '2 — Uneasy', value: 2},
          {title: '3 — Neutral', value: 3},
          {title: '4 — Pleasant', value: 4},
          {title: '5 — Euphoric', value: 5},
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
      validation: (rule) => rule.required().integer().min(1).max(5),
    }),
    defineField({
      name: 'lucid',
      title: 'Lucid dream',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'symbols',
      title: 'Symbols',
      type: 'array',
      description: 'Select existing symbols or create a new symbol directly from the reference picker.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'symbol'}],
        }),
      ],
      options: {
        sortable: false,
      },
      validation: (rule) => rule.unique(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      body: 'body',
      date: 'date',
      mood: 'mood',
      lucid: 'lucid',
    },
    prepare({title, body, date, mood, lucid}) {
      const dateLabel = date ? new Date(date).toLocaleDateString() : 'No date'
      const fallbackTitle = body?.slice(0, 50) || 'Untitled dream'

      return {
        title: title || fallbackTitle,
        subtitle: `${dateLabel} · Mood ${mood ?? '?'}${lucid ? ' · Lucid' : ''}`,
      }
    },
  },
})
