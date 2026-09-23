import {defineField, defineType} from 'sanity'

export const libraryLayoutMarkerType = defineType({
  name: 'libraryLayoutMarker',
  title: 'Library Layout Marker',
  type: 'document',
  fields: [
    defineField({
      name: 'label',
      title: 'Marker label',
      type: 'string',
      validation: (rule) => rule.required().max(80),
    }),
    defineField({
      name: 'roomSlot',
      title: 'Room slot',
      type: 'number',
      validation: (rule) => rule.required().integer().min(0).max(5),
    }),
    defineField({
      name: 'districtId',
      title: 'District ID',
      type: 'string',
      validation: (rule) => rule.required().max(100),
    }),
    defineField({
      name: 'x',
      title: 'World X',
      type: 'number',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'y',
      title: 'World Y',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'z',
      title: 'World Z',
      type: 'number',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'yaw',
      title: 'Shelf yaw',
      type: 'number',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'width',
      title: 'Zone width',
      type: 'number',
      initialValue: 4.5,
      validation: (rule) => rule.required().positive(),
    }),
    defineField({
      name: 'depth',
      title: 'Zone depth',
      type: 'number',
      initialValue: .72,
      validation: (rule) => rule.required().positive(),
    }),
    defineField({
      name: 'createdAt',
      title: 'Created at',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'label',
      roomSlot: 'roomSlot',
      x: 'x',
      z: 'z',
    },
    prepare({title, roomSlot, x, z}) {
      const coords =
        typeof x === 'number' && typeof z === 'number'
          ? `x ${x.toFixed(2)} · z ${z.toFixed(2)}`
          : 'coordinates unavailable'
      return {
        title,
        subtitle: `Room ${roomSlot ?? '?'} · ${coords}`,
      }
    },
  },
})
