import {defineArrayMember, defineField, defineType} from 'sanity'

export const archiveJourneyType = defineType({
  name: 'archiveJourney',
  title: 'Archive Journey',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Journey title',
      type: 'string',
      validation: (rule) => rule.required().max(100),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 64},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Intro',
      type: 'text',
      rows: 3,
      validation: (rule) => rule.max(320),
    }),
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'stops',
      title: 'Journey stops',
      type: 'array',
      of: [
        defineArrayMember({
          name: 'journeyStop',
          title: 'Journey stop',
          type: 'object',
          fields: [
            defineField({
              name: 'district',
              title: 'District',
              type: 'reference',
              to: [{type: 'libraryDistrict'}],
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'devArticleId',
              title: 'Highlighted DEV article ID',
              type: 'number',
              validation: (rule) => rule.integer().positive(),
            }),
            defineField({
              name: 'caption',
              title: 'Narration / caption',
              type: 'string',
              validation: (rule) => rule.max(180),
            }),
          ],
          preview: {
            select: {
              district: 'district.title',
              caption: 'caption',
            },
            prepare({district, caption}) {
              return {
                title: district || 'Journey stop',
                subtitle: caption || 'No caption',
              }
            },
          },
        }),
      ],
      validation: (rule) => rule.min(1),
    }),
  ],
})
