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
            S.listItem()
              .title('Library Rooms')
              .child(
                S.list()
                  .title('Library Rooms · Physical Order')
                  .items([
                    S.listItem()
                      .title('R-01 · Featured')
                      .child(
                        S.document()
                          .schemaType('libraryDistrict')
                          .documentId('libraryDistrict.featured')
                          .title('R-01 · Featured'),
                      ),
                    S.listItem()
                      .title('R-02 · New Arrivals')
                      .child(
                        S.document()
                          .schemaType('libraryDistrict')
                          .documentId('libraryDistrict.latest')
                          .title('R-02 · New Arrivals'),
                      ),
                    S.listItem()
                      .title('R-03 · Topics')
                      .child(
                        S.document()
                          .schemaType('libraryDistrict')
                          .documentId('libraryDistrict.topics')
                          .title('R-03 · Topics'),
                      ),
                    S.listItem()
                      .title('R-04 · Creators')
                      .child(
                        S.document()
                          .schemaType('libraryDistrict')
                          .documentId('libraryDistrict.creators')
                          .title('R-04 · Creators'),
                      ),
                    S.listItem()
                      .title('R-05 · Search')
                      .child(
                        S.document()
                          .schemaType('libraryDistrict')
                          .documentId('libraryDistrict.search')
                          .title('R-05 · Search'),
                      ),
                    S.listItem()
                      .title('R-06 · Archive')
                      .child(
                        S.document()
                          .schemaType('libraryDistrict')
                          .documentId('libraryDistrict.archive')
                          .title('R-06 · Archive'),
                      ),
                  ]),
              ),
            S.documentTypeListItem('libraryLayoutMarker').title('Layout Pins · Authoring'),
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
