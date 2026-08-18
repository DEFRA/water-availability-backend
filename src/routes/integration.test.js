import { config } from '#/config.js'
import { createServer } from '#/server.js'

const initialConfig = structuredClone(config.getProperties())

describe('integration routes', () => {
  let server

  beforeEach(() => {
    config.load(initialConfig)
    config.set('cdpEnvironment', 'local')
    globalThis.fetchMock.resetMocks()
  })

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = null
    }
    config.load(initialConfig)
  })

  test('GET /integration/status reports reachable aggregator status', async () => {
    globalThis.fetchMock.mockResponseOnce(
      JSON.stringify({
        service: 'water-availability-aggregator',
        status: 'ok'
      }),
      { status: 200 }
    )
    server = await createServer()

    const response = await server.inject({
      method: 'GET',
      url: '/integration/status'
    })

    expect(response.statusCode).toBe(200)
    expect(response.result).toMatchObject({
      service: 'water-availability-backend',
      status: 'ok',
      aggregator: {
        reachable: true,
        statusCode: 200,
        payload: { service: 'water-availability-aggregator', status: 'ok' }
      }
    })
  })

  test('GET /integration/status reports a degraded status when the aggregator fails', async () => {
    globalThis.fetchMock.mockRejectOnce(new Error('Connection refused'))
    server = await createServer()

    const response = await server.inject({
      method: 'GET',
      url: '/integration/status'
    })

    expect(response.statusCode).toBe(200)
    expect(response.result).toMatchObject({
      status: 'degraded',
      aggregator: {
        reachable: false,
        statusCode: null,
        payload: { error: 'Connection refused' }
      }
    })
  })

  test('POST /integration/heartbeat accepts the expected local source', async () => {
    server = await createServer()

    const response = await server.inject({
      method: 'POST',
      url: '/integration/heartbeat',
      payload: { source: 'water-availability-aggregator' }
    })

    expect(response.statusCode).toBe(200)
    expect(response.result).toMatchObject({
      accepted: true,
      source: 'water-availability-aggregator'
    })
  })

  test('POST /integration/heartbeat rejects invalid payloads', async () => {
    server = await createServer()

    const response = await server.inject({
      method: 'POST',
      url: '/integration/heartbeat',
      payload: { source: 'unexpected-service' }
    })

    expect(response.statusCode).toBe(400)
  })

  test('POST /integration/heartbeat requires a valid bearer token outside local development', async () => {
    config.set('cdpEnvironment', 'dev')
    config.set('aggregator.heartbeatAuthToken', 'test-token')
    server = await createServer()

    const unauthorizedResponse = await server.inject({
      method: 'POST',
      url: '/integration/heartbeat',
      payload: { source: 'water-availability-aggregator' }
    })
    const authorizedResponse = await server.inject({
      method: 'POST',
      url: '/integration/heartbeat',
      headers: { authorization: 'Bearer test-token' },
      payload: { source: 'water-availability-aggregator' }
    })

    expect(unauthorizedResponse.statusCode).toBe(401)
    expect(authorizedResponse.statusCode).toBe(200)
  })

  test('server creation fails outside local development without a heartbeat token', async () => {
    config.set('cdpEnvironment', 'dev')
    config.set('aggregator.heartbeatAuthToken', null)

    await expect(createServer()).rejects.toThrow(
      'AGGREGATOR_HEARTBEAT_AUTH_TOKEN must be configured outside local development'
    )
  })
})
