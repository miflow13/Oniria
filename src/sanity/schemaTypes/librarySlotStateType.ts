import {
  defineArrayMember,
  defineField,
  defineType,
} from 'sanity'

export const librarySlotStateType = defineType({
  name: 'librarySlotState',
  title: 'Living Library Slot',
  type: 'document',
  fields: [
    defineField({
      name: 'slotKey',
      title: 'Slot key',
      type: 'string',
      description:
        'Stable spatial identity. The shelf occupant may change, but this key does not.',
      validation: (rule) => rule.required().max(160),
    }),
    defineField({
      name: 'districtId',
      title: 'District ID',
      type: 'string',
      validation: (rule) => rule.required().max(100),
    }),
    defineField({
      name: 'roomSlot',
      title: 'Room slot',
      type: 'number',
      validation: (rule) => rule.required().integer().min(0).max(5),
    }),
    defineField({
      name: 'slotId',
      title: 'Physical slot',
      type: 'string',
      validation: (rule) => rule.required().max(120),
    }),
    defineField({
      name: 'zone',
      title: 'Zone',
      type: 'string',
    }),
    defineField({
      name: 'configured',
      title: 'Configured occupant',
      type: 'boolean',
      initialValue: false,
      description:
        'Configured shelves are stable authored topics and are not automatically retired.',
    }),
    defineField({
      name: 'occupantKey',
      title: 'Occupant key',
      type: 'string',
      description:
        'Null/empty means latent space. Topic occupants use topic:<tag>.',
    }),
    defineField({
      name: 'topic',
      title: 'Topic',
      type: 'string',
    }),
    defineField({
      name: 'lifecycle',
      title: 'Lifecycle',
      type: 'string',
      initialValue: 'dormant',
      options: {
        list: [
          {title: 'Dormant', value: 'dormant'},
          {title: 'Forming', value: 'forming'},
          {title: 'Active', value: 'active'},
          {title: 'Cooling', value: 'cooling'},
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'vitality',
      title: 'Vitality',
      type: 'number',
      initialValue: 0,
      validation: (rule) => rule.min(0).max(1),
    }),
    defineField({
      name: 'signalScore',
      title: 'Signal score',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'articleCount',
      title: 'Recent article count',
      type: 'number',
      initialValue: 0,
      validation: (rule) => rule.integer().min(0),
    }),
    defineField({
      name: 'risingChecks',
      title: 'Consecutive rising checks',
      type: 'number',
      initialValue: 0,
      validation: (rule) => rule.integer().min(0),
    }),
    defineField({
      name: 'lowChecks',
      title: 'Consecutive low checks',
      type: 'number',
      initialValue: 0,
      validation: (rule) => rule.integer().min(0),
    }),
    defineField({
      name: 'materializedAt',
      title: 'Materialized at',
      type: 'datetime',
    }),
    defineField({
      name: 'lastActiveAt',
      title: 'Last active at',
      type: 'datetime',
    }),
    defineField({
      name: 'coolingStartedAt',
      title: 'Cooling started at',
      type: 'datetime',
    }),
    defineField({
      name: 'updatedAt',
      title: 'Evolution updated at',
      type: 'datetime',
    }),
    defineField({
      name: 'history',
      title: 'Slot history',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name: 'event',
              title: 'Event',
              type: 'string',
              options: {
                list: [
                  {title: 'Seeded', value: 'seeded'},
                  {title: 'Materialized', value: 'materialized'},
                  {title: 'Activated', value: 'activated'},
                  {title: 'Cooling', value: 'cooling'},
                  {title: 'Reactivated', value: 'reactivated'},
                  {title: 'Archived', value: 'archived'},
                  {title: 'Dissolved', value: 'dissolved'},
                ],
              },
            }),
            defineField({
              name: 'topic',
              title: 'Topic',
              type: 'string',
            }),
            defineField({
              name: 'at',
              title: 'At',
              type: 'datetime',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'vitality',
              title: 'Vitality',
              type: 'number',
            }),
            defineField({
              name: 'note',
              title: 'Note',
              type: 'string',
            }),
          ],
          preview: {
            select: {
              event: 'event',
              topic: 'topic',
              at: 'at',
            },
            prepare({event, topic, at}) {
              return {
                title: `${event ?? 'event'} · #${topic ?? 'unknown'}`,
                subtitle: at ?? '',
              }
            },
          },
        }),
      ],
    }),
  ],
  preview: {
    select: {
      slotId: 'slotId',
      districtId: 'districtId',
      topic: 'topic',
      lifecycle: 'lifecycle',
      vitality: 'vitality',
    },
    prepare({slotId, districtId, topic, lifecycle, vitality}) {
      const pct =
        typeof vitality === 'number'
          ? `${Math.round(vitality * 100)}%`
          : '0%'
      return {
        title: `${slotId ?? '?'} · ${topic ? '#' + topic : 'empty'}`,
        subtitle: `${districtId ?? 'unknown'} · ${lifecycle ?? 'dormant'} · ${pct}`,
      }
    },
  },
})
