export const root = {
  method: 'GET',
  path: '/',
  handler: (_request, h) =>
    h.response({
      service: 'water-availability-backend',
      status: 'ok',
      endpoints: ['/health', '/integration/status', '/integration/heartbeat']
    })
}
