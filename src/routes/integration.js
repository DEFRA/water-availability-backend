import Joi from 'joi'

let lastAggregatorHeartbeatAt = null

const expectedHeartbeatSource = 'water-availability-aggregator'

function trimTrailingSlashes(value) {
  let result = value
  while (result.endsWith('/')) {
    result = result.slice(0, -1)
  }
  return result
}

function aggregatorPath(path, request) {
  const baseUrl = trimTrailingSlashes(
    request.server.settings.app.config.get('aggregator.baseUrl')
  )
  return `${baseUrl}${path}`
}

async function fetchAggregatorStatus(request) {
  const url = aggregatorPath('/integration/status', request)
  const timeoutMs = request.server.settings.app.config.get(
    'aggregator.statusTimeoutMs'
  )

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs)
    })

    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = { error: 'Aggregator returned a non-JSON response' }
    }

    return {
      url,
      reachable: response.ok,
      statusCode: response.status,
      payload
    }
  } catch (error) {
    return {
      url,
      reachable: false,
      statusCode: null,
      payload: {
        error: error.message
      }
    }
  }
}

function isLocalEnvironment(request) {
  return request.server.settings.app.config.get('cdpEnvironment') === 'local'
}

function extractBearerToken(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return null
  }

  const [scheme, token] = headerValue.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  return token
}

function isAuthorizedHeartbeatRequest(request) {
  const configuredToken = request.server.settings.app.config.get(
    'aggregator.heartbeatAuthToken'
  )

  if (isLocalEnvironment(request)) {
    return true
  }

  if (!configuredToken) {
    request.server.logger.error(
      'AGGREGATOR_HEARTBEAT_AUTH_TOKEN is not configured outside local environment'
    )
    return false
  }

  const receivedToken = extractBearerToken(request.headers.authorization)
  return receivedToken === configuredToken
}

export const integration = [
  {
    method: 'GET',
    path: '/integration/status',
    handler: async (request, h) => {
      const aggregator = await fetchAggregatorStatus(request)

      return h.response({
        service: 'water-availability-backend',
        status: aggregator.reachable ? 'ok' : 'degraded',
        lastAggregatorHeartbeatAt,
        aggregator
      })
    }
  },
  {
    method: 'POST',
    path: '/integration/heartbeat',
    options: {
      validate: {
        payload: Joi.object({
          source: Joi.string().valid(expectedHeartbeatSource).required()
        })
      }
    },
    handler: (request, h) => {
      if (!isAuthorizedHeartbeatRequest(request)) {
        return h
          .response({
            accepted: false,
            error: 'Unauthorized heartbeat request'
          })
          .code(401)
      }

      const { source } = request.payload
      if (source !== expectedHeartbeatSource) {
        return h
          .response({ accepted: false, error: 'Unexpected heartbeat source' })
          .code(403)
      }

      lastAggregatorHeartbeatAt = new Date().toISOString()

      return h.response({
        accepted: true,
        source,
        recordedAt: lastAggregatorHeartbeatAt
      })
    }
  }
]
