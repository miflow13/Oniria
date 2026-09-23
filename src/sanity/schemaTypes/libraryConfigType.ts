import {defineField, defineType} from 'sanity'

export const libraryConfigType = defineType({
  name: 'libraryConfig',
  title: 'Library Control',
  type: 'document',
  fields: [
    defineField({
      name: 'welcomeTitle',
      title: 'Welcome title',
      type: 'string',
      initialValue: 'DEV LIBRARY',
      validation: (rule) => rule.required().max(80),
    }),
    defineField({
      name: 'welcomeSubtitle',
      title: 'Welcome subtitle',
      type: 'string',
      initialValue: 'Six rooms. One live DEV collection.',
      validation: (rule) => rule.required().max(140),
    }),
    defineField({
      name: 'welcomeBody',
      title: 'Welcome body',
      type: 'text',
      rows: 4,
      initialValue:
        'Walk the building, browse shelves, inspect books, and open real DEV posts.',
      validation: (rule) => rule.max(420),
    }),
    defineField({
      name: 'archiveStatus',
      title: 'Archive status',
      type: 'string',
      initialValue: 'LIVE ARCHIVE',
      validation: (rule) => rule.max(60),
    }),
    defineField({
      name: 'defaultMovement',
      title: 'Default movement',
      type: 'string',
      initialValue: 'walk',
      options: {
        list: [
          {title: 'Walk', value: 'walk'},
          {title: 'Fly', value: 'fly'},
        ],
        layout: 'radio',
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'atmosphere',
      title: 'Global atmosphere',
      type: 'string',
      initialValue: 'dream-archive',
      options: {
        list: [
          {title: 'Dream archive', value: 'dream-archive'},
          {title: 'Crystalline', value: 'crystalline'},
          {title: 'Industrial', value: 'industrial'},
          {title: 'Deep void', value: 'deep-void'},
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'hazeIntensity',
      title: 'Haze intensity',
      type: 'number',
      initialValue: 0.45,
      validation: (rule) => rule.required().min(0).max(1),
    }),
    defineField({
      name: 'liveDevUpdates',
      title: 'Live DEV updates',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'deepStacksEnabled',
      title: 'Archive streaming enabled',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'featuredDistrict',
      title: 'Featured room',
      type: 'reference',
      to: [{type: 'libraryDistrict'}],
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'Oniria Library Control',
        subtitle: 'Global six-room DEV Library settings',
      }
    },
  },
})
