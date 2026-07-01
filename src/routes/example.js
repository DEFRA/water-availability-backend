export const example = [
  {
    method: 'GET',
    path: '/example',
    handler: (request, h) => {
      const entities = [{ entityId: '1' }, { entityId: '2' }]
      return h.response(entities)
    }
  },
  {
    method: 'GET',
    path: '/example/{exampleId}',
    handler: (request, h) => {
      const entity = { entityId: '1' }
      return h.response(entity)
    }
  }
]
