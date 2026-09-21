import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {apiVersion, dataset, projectId} from './src/sanity/env'
import {schemaTypes} from './src/sanity/schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'Oniria',
  basePath: '/studio',
  projectId,
  dataset,
  plugins: [structureTool()],
  schema: {
    types: schemaTypes,
  },
})
