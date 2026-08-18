import { config } from '#/config.js'

const mockPool = vi.hoisted(() => vi.fn())

vi.mock('pg', () => ({
  default: {
    Pool: mockPool
  }
}))

const { postgres } = await import('./postgres.js')

const initialConfig = structuredClone(config.getProperties())

function createPluginServer() {
  return {
    logger: {
      info: vi.fn()
    },
    decorate: vi.fn(),
    ext: vi.fn()
  }
}

describe('postgres plugin', () => {
  beforeEach(() => {
    config.load(initialConfig)
    mockPool.mockReset()
  })

  afterEach(() => {
    config.load(initialConfig)
  })

  test('does not create a pool when Postgres is disabled', async () => {
    const server = createPluginServer()
    config.set('postgres.enabled', false)

    await postgres.plugin.register(server)

    expect(mockPool).not.toHaveBeenCalled()
    expect(server.logger.info).toHaveBeenCalledWith('Postgres plugin disabled')
  })

  test('requires connection settings when Postgres is enabled', async () => {
    const server = createPluginServer()
    config.set('postgres.enabled', true)

    await expect(postgres.plugin.register(server)).rejects.toThrow(
      'POSTGRES_HOST must be configured when POSTGRES_ENABLED=true'
    )
  })

  test('checks connectivity and closes the pool during shutdown', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const end = vi.fn().mockResolvedValue()
    mockPool.mockImplementation(function Pool() {
      return { query, end }
    })
    const server = createPluginServer()
    config.set('postgres.enabled', true)
    config.set('postgres.host', 'localhost')
    config.set('postgres.database', 'water_availability')
    config.set('postgres.user', 'postgres')
    config.set('postgres.password', 'postgres')

    await postgres.plugin.register(server)

    expect(mockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        database: 'water_availability',
        user: 'postgres',
        ssl: false
      })
    )
    expect(query).toHaveBeenCalledWith('SELECT 1')
    expect(server.decorate).toHaveBeenCalledWith(
      'server',
      'pg',
      expect.anything()
    )
    expect(server.decorate).toHaveBeenCalledWith(
      'request',
      'pg',
      expect.anything()
    )

    const shutdownHandler = server.ext.mock.calls[0][1]
    await shutdownHandler()

    expect(end).toHaveBeenCalled()
  })
})
