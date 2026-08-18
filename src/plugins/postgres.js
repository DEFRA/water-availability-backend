import pg from 'pg'
import { config } from '#/config.js'

const { Pool } = pg

function requiredValue(name, value) {
  if (!value) {
    throw new Error(`${name} must be configured when POSTGRES_ENABLED=true`)
  }
}

export const postgres = {
  plugin: {
    name: 'postgres',
    register: async (server) => {
      const pgConfig = config.get('postgres')

      if (!pgConfig.enabled) {
        server.logger.info('Postgres plugin disabled')
        return
      }

      requiredValue('POSTGRES_HOST', pgConfig.host)
      requiredValue('POSTGRES_DATABASE', pgConfig.database)
      requiredValue('POSTGRES_USERNAME', pgConfig.user)

      const pool = new Pool({
        host: pgConfig.host,
        port: pgConfig.port,
        database: pgConfig.database,
        user: pgConfig.user,
        password: pgConfig.password,
        ssl: pgConfig.sslEnabled
          ? {
              rejectUnauthorized: pgConfig.sslRejectUnauthorized
            }
          : false
      })

      await pool.query('SELECT 1')
      server.logger.info('Postgres connection pool initialized')

      server.decorate('server', 'pg', pool)
      server.decorate('request', 'pg', pool)

      server.ext('onPostStop', async () => {
        await pool.end()
      })
    }
  }
}
