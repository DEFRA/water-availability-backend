import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { Signer } from '@aws-sdk/rds-signer'

const { Pool } = pg

// Comparing import.meta.url to `file://${argv[1]}` silently fails for paths containing spaces
// or symlinks (the URL is percent-encoded/resolved), making the CLI scripts no-op.
export function isMainModule(metaUrl) {
  const entry = process.argv[1]

  return Boolean(entry) && metaUrl === pathToFileURL(realpathSync(entry)).href
}

// These are local developer tools (seed/reset/integration tests) intended to run against the
// docker-compose Postgres from compose.yml/.env.example by default, with no setup required beyond
// `npm run local:infra:up`. Every value can still be overridden via env (e.g. to point at a shared
// dev Aurora instance with IAM auth), matching the connection options supported by scripts/migrate.js.
function boolEnv(name, defaultValue) {
  return process.env[name] === undefined
    ? defaultValue
    : process.env[name] === 'true'
}

export function resolveConnectionOptions() {
  const host = process.env.POSTGRES_HOST ?? '127.0.0.1'
  const port = Number(process.env.POSTGRES_PORT ?? 5433)
  const database = process.env.POSTGRES_DATABASE ?? 'water_availability'
  const user = process.env.POSTGRES_USERNAME ?? 'postgres'
  const iamAuthentication = boolEnv('POSTGRES_IAM_AUTHENTICATION', false)
  const sslEnabled = boolEnv('POSTGRES_SSL_ENABLED', false)

  if (iamAuthentication && !sslEnabled) {
    throw new Error(
      'POSTGRES_SSL_ENABLED must be true when POSTGRES_IAM_AUTHENTICATION=true'
    )
  }

  return { host, port, database, user, iamAuthentication, sslEnabled }
}

export function createPoolFromEnv() {
  const { host, port, database, user, iamAuthentication, sslEnabled } =
    resolveConnectionOptions()

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
    : (process.env.POSTGRES_PASSWORD ?? 'postgres')

  return new Pool({
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
  })
}
