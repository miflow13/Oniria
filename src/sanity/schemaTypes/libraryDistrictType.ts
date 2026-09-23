import {defineArrayMember, defineField, defineType} from 'sanity'

export const libraryDistrictType = defineType({
  name: 'libraryDistrict',
  title: 'Library Room',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Room name',
      type: 'string',
      validation: (rule) => rule.required().max(80),
    }),
    defineField({
      name: 'slug',
      title: 'Room ID',
      type: 'slug',
      options: {source: 'title', maxLength: 64},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'code',
      title: 'Wayfinding code',
      type: 'string',
      description: 'Short physical marker such as A-18.',
      validation: (rule) => rule.required().max(12),
    }),
    defineField({
      name: 'description',
      title: 'Purpose',
      type: 'text',
      rows: 3,
      validation: (rule) => rule.max(300),
    }),
    defineField({
      name: 'devTags',
      title: 'DEV tags',
      type: 'array',
      description:
        'Articles matching these DEV tags are candidates for this physical district.',
      of: [defineArrayMember({type: 'string'})],
      options: {layout: 'tags'},
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'routeBay',
      title: 'Cinematic depth band',
      type: 'number',
      description:
        'Internal atmosphere coordinate. Defaults are 1, 4, and 7 for the three room rows.',
      validation: (rule) => rule.required().min(0).max(72),
    }),
    defineField({
      name: 'order',
      title: 'Studio order',
      type: 'number',
      initialValue: 50,
      validation: (rule) => rule.integer().min(0).max(999),
    }),
    defineField({
      name: 'accent',
      title: 'Accent color',
      type: 'string',
      description: 'Hex color used for wayfinding and district reactions.',
      initialValue: '#8c7cff',
      validation: (rule) =>
        rule.regex(/^#[0-9a-fA-F]{6}$/, {
          name: 'hex color',
        }),
    }),
    defineField({
      name: 'atmosphere',
      title: 'Atmosphere',
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
    }),
    defineField({
      name: 'audioProfile',
      title: 'Audio profile',
      type: 'string',
      initialValue: 'ambient',
      options: {
        list: [
          {title: 'Ambient archive', value: 'ambient'},
          {title: 'Crystalline / digital', value: 'crystalline'},
          {title: 'Mechanical / terminal', value: 'mechanical'},
          {title: 'Warm / community', value: 'warm'},
          {title: 'Deep / subsonic', value: 'deep'},
        ],
      },
    }),
    defineField({
      name: 'landmarkType',
      title: 'Landmark type',
      type: 'string',
      initialValue: 'index',
      options: {
        list: [
          {title: 'Index structure', value: 'index'},
          {title: 'Neural lattice', value: 'neural-lattice'},
          {title: 'Terminal wall', value: 'terminal-wall'},
          {title: 'Syntax tree', value: 'syntax-tree'},
          {title: 'DEV monument', value: 'dev-monument'},
          {title: 'Archive tower', value: 'archive-tower'},
        ],
      },
    }),
    defineField({
      name: 'sourceMode',
      title: 'Room content source',
      type: 'string',
      description:
        'Controls which live DEV query populates this physical room.',
      initialValue: 'tagged',
      options: {
        list: [
          {title: 'Featured / trending', value: 'featured'},
          {title: 'Latest / new arrivals', value: 'latest'},
          {title: 'Topics / tags', value: 'topics'},
          {title: 'Creators', value: 'creators'},
          {title: 'Search', value: 'search'},
          {title: 'Archive / catalogue', value: 'catalog'},
          {title: 'Tag-matched district', value: 'tagged'},
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'roomSlot',
      title: 'Physical room slot',
      type: 'number',
      description:
        '0–5 maps the district into the six-room library floor plan.',
      initialValue: 0,
      validation: (rule) => rule.required().integer().min(0).max(5),
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
      title: 'title',
      code: 'code',
      sourceMode: 'sourceMode',
      roomSlot: 'roomSlot',
      tags: 'devTags',
      enabled: 'enabled',
    },
    prepare({title, code, sourceMode, roomSlot, tags, enabled}) {
      const tagSummary =
        (tags ?? []).slice(0, 2).join(', ') || 'live DEV'
      return {
        title: `${enabled === false ? '○' : '●'} ${title ?? 'Untitled room'}`,
        subtitle:
          `${code ?? 'No code'} · room ${Number(roomSlot ?? 0) + 1} · ${sourceMode ?? 'tagged'} · ${tagSummary}`,
      }
    },
  },
})
