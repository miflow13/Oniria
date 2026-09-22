import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {apiVersion, dataset, projectId} from './src/sanity/env'
import {schemaTypes} from './src/sanity/schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'Oniria Archive Control',
  basePath: '/studio',
  projectId,
  dataset,
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Oniria Archive')
          .items([
            S.listItem()
              .title('Library Control')
              .child(
                S.document()
                  .schemaType('libraryConfig')
                  .documentId('libraryConfig')
                  .title('Library Control'),
              ),
            S.divider(),
            S.documentTypeListItem('libraryDistrict').title('Districts'),
            S.documentTypeListItem('curatedArticle').title('Curator Picks'),
            S.documentTypeListItem('archiveJourney').title('Guided Journeys'),
            S.divider(),
            S.listItem()
              .title('Legacy Dream Journal')
              .child(
                S.list()
                  .title('Legacy Dream Journal')
                  .items([
                    S.documentTypeListItem('dream').title('Dreams'),
                    S.documentTypeListItem('symbol').title('Symbols'),
                  ]),
              ),
          ]),
    }),
  ],
  schema: {
    types: schemaTypes,
  },
})
