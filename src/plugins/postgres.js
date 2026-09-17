import pg from 'pg'
import { Signer } from '@aws-sdk/rds-signer'
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

      if (!pgConfig.iamAuthentication) {
        requiredValue('POSTGRES_PASSWORD', pgConfig.password)
      }

      const password = pgConfig.iamAuthentication
        ? async () => {
            const signer = new Signer({
              hostname: pgConfig.host,
              port: pgConfig.port,
              region: pgConfig.awsRegion,
              username: pgConfig.user
            })

            return signer.getAuthToken()
          }
        : pgConfig.password

      const pool = new Pool({
        host: pgConfig.host,
        port: pgConfig.port,
        database: pgConfig.database,
        user: pgConfig.user,
        password,
        ...(pgConfig.iamAuthentication && { maxLifetimeSeconds: 600 }),
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
