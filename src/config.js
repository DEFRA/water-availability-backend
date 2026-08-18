import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'

convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

export const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind',
    format: 'port',
    default: 3001,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'water-availability-backend'
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: [
      'local',
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test',
      'prod'
    ],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  log: {
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy URL',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  aggregator: {
    baseUrl: {
      doc: 'Base URL for the aggregator service',
      format: String,
      default: 'http://localhost:3002',
      env: 'AGGREGATOR_BASE_URL'
    },
    statusTimeoutMs: {
      doc: 'Timeout in milliseconds for aggregator status fetch',
      format: 'nat',
      default: 3000,
      env: 'AGGREGATOR_STATUS_TIMEOUT_MS'
    },
    heartbeatAuthToken: {
      doc: 'Bearer token expected on aggregator heartbeat requests outside local development',
      format: String,
      nullable: true,
      default: null,
      env: 'AGGREGATOR_HEARTBEAT_AUTH_TOKEN'
    }
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  postgres: {
    enabled: {
      doc: 'Enable Postgres connection plugin',
      format: Boolean,
      default: false,
      env: 'POSTGRES_ENABLED'
    },
    host: {
      doc: 'Postgres hostname',
      format: String,
      nullable: true,
      default: null,
      env: 'POSTGRES_HOST'
    },
    port: {
      doc: 'Postgres port',
      format: 'port',
      default: 5432,
      env: 'POSTGRES_PORT'
    },
    database: {
      doc: 'Postgres database name',
      format: String,
      nullable: true,
      default: null,
      env: 'POSTGRES_DATABASE'
    },
    user: {
      doc: 'Postgres username',
      format: String,
      nullable: true,
      default: null,
      env: 'POSTGRES_USERNAME'
    },
    password: {
      doc: 'Postgres password for local/non-IAM connectivity',
      format: String,
      nullable: true,
      default: null,
      env: 'POSTGRES_PASSWORD'
    },
    sslEnabled: {
      doc: 'Enable SSL/TLS when connecting to Postgres',
      format: Boolean,
      default: isProduction,
      env: 'POSTGRES_SSL_ENABLED'
    },
    sslRejectUnauthorized: {
      doc: 'Whether Postgres TLS certificate should be fully validated',
      format: Boolean,
      default: true,
      env: 'POSTGRES_SSL_REJECT_UNAUTHORIZED'
    }
  }
})

config.validate({ allowed: 'strict' })
