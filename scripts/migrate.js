import { runner } from 'node-pg-migrate'
import { Signer } from '@aws-sdk/rds-signer'

const direction = process.argv[2] ?? 'up'
const validDirections = ['up', 'down']

if (!validDirections.includes(direction)) {
  throw new Error(
    `Migration direction must be one of: ${validDirections.join(', ')}`
  )
}

const required = (name, value) => {
  if (!value) {
    throw new Error(`${name} must be configured to run migrations`)
  }
  return value
}

// Mirrors src/config.js: IAM auth and TLS default to on in production so this script behaves
// the same as the running application when the optional env vars are left unset.
const isProduction = process.env.NODE_ENV === 'production'
const boolEnv = (name, defaultValue) =>
  process.env[name] === undefined ? defaultValue : process.env[name] === 'true'

const host = required('POSTGRES_HOST', process.env.POSTGRES_HOST)
const database = required('POSTGRES_DATABASE', process.env.POSTGRES_DATABASE)
const user = required('POSTGRES_USERNAME', process.env.POSTGRES_USERNAME)
const iamAuthentication = boolEnv('POSTGRES_IAM_AUTHENTICATION', isProduction)
const sslEnabled = boolEnv('POSTGRES_SSL_ENABLED', isProduction)
const port = Number(process.env.POSTGRES_PORT ?? 5432)

if (iamAuthentication && !sslEnabled) {
  throw new Error(
    'POSTGRES_SSL_ENABLED must be true when POSTGRES_IAM_AUTHENTICATION=true'
  )
}

if (!iamAuthentication) {
  required('POSTGRES_PASSWORD', process.env.POSTGRES_PASSWORD)
}

const password = iamAuthentication
  ? async () => {
      const signer = new Signer({
        hostname: host,
        port,
        region: process.env.AWS_REGION ?? 'eu-west-2',
        username: user
      })

      return signer.getAuthToken()
    }
  : process.env.POSTGRES_PASSWORD

await runner({
  databaseUrl: {
    host,
    port,
    database,
    user,
    password,
    ...(iamAuthentication && { maxLifetimeSeconds: 600 }),
    ssl: sslEnabled
      ? {
          rejectUnauthorized:
            process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false'
        }
      : false
  },
  dir: 'migrations',
  direction,
  migrationsTable: 'pgmigrations',
  singleTransaction: true
})
