import Hapi from '@hapi/hapi'
import { secureContext } from '@defra/hapi-secure-context'
import { config } from '#/config.js'
import { router } from '#/plugins/router.js'
import { requestLogger } from '#/plugins/request-logger.js'
import { failAction } from '#/common/helpers/fail-action.js'
import { pulse } from '#/plugins/pulse.js'
import { requestTracing } from '#/plugins/request-tracing.js'
import { setupProxy } from '#/common/helpers/proxy/setup-proxy.js'
import { metrics } from '@defra/cdp-metrics'
import { postgres } from '#/plugins/postgres.js'

function validateRuntimeConfig() {
  const cdpEnvironment = config.get('cdpEnvironment')
  const heartbeatAuthToken = config.get('aggregator.heartbeatAuthToken')

  if (cdpEnvironment !== 'local' && !heartbeatAuthToken) {
    throw new Error(
      'AGGREGATOR_HEARTBEAT_AUTH_TOKEN must be configured outside local development'
    )
  }
}

export async function createServer() {
  validateRuntimeConfig()
  setupProxy()
  const server = Hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    app: {
      config
    },
    routes: {
      validate: {
        options: {
          abortEarly: false
        },
        failAction
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  // Hapi Plugins:
  // requestLogger  - automatically logs incoming requests
  // requestTracing - trace header logging and propagation
  // secureContext  - loads CA certificates from environment config
  // pulse          - provides shutdown handlers
  // router         - routes used in the app
  await server.register([
    requestLogger,
    requestTracing,
    metrics,
    secureContext,
    pulse,
    postgres,
    router
  ])

  return server
}
