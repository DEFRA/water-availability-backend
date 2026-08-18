import { health } from '#/routes/health.js'
import { root } from '#/routes/root.js'
import { integration } from '#/routes/integration.js'

export const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([root, health].concat(integration))
    }
  }
}
