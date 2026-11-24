import { IgnitorFactory } from '@adonisjs/core/factories'
import type { Router } from '@adonisjs/core/http'
import type { ApplicationService } from '@adonisjs/core/types'
import { Locator, defineConfig as defineQueueConfig, drivers } from '@adonisjs/queue'
import type { JobClass } from '@adonisjs/queue/types'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Writable } from 'node:stream'

const APP_ROOT = new URL('../../tmp/app/', import.meta.url)

type LazyImport = () => Promise<{ default: any }>

export interface TestAppOptions {
  /**
   * Config merged over the core config. The `logger` and `queue` keys are
   * set by the harness unless given here
   */
  config?: Record<string, unknown>

  /**
   * Providers registered after the core providers, `@adonisjs/queue` and
   * the package provider
   */
  providers?: LazyImport[]

  /**
   * Server middleware, run on every request, in order
   */
  serverMiddleware?: LazyImport[]

  /**
   * The app's exception handler. The core default handler applies when
   * omitted
   */
  errorHandler?: LazyImport

  /**
   * Routes to register before the HTTP server boots
   */
  routes?: (router: Router) => void

  /**
   * Job classes the sync queue driver can run, keyed by the class name
   */
  jobs?: JobClass[]
}

export interface TestApp {
  app: ApplicationService

  /**
   * Base URL of the running HTTP server, such as `http://127.0.0.1:41234`
   */
  url: string

  /**
   * Every record the app logger wrote, parsed from its JSON line
   */
  logs: Record<string, unknown>[]

  close: () => Promise<void>
}

/**
 * Boot an in-process AdonisJS app with the package provider and
 * `@adonisjs/queue` on the sync driver, and serve it over HTTP on a random
 * port. Requests go through the real server middleware stack, and a
 * dispatched job runs at once inside the dispatch call. Pass `close` to the
 * test `cleanup`
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const logs: Record<string, unknown>[] = []
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) {
          logs.push(JSON.parse(line) as Record<string, unknown>)
        }
      }
      callback()
    },
  })

  const ignitor = new IgnitorFactory()
    .withCoreConfig()
    .withCoreProviders()
    .merge({
      config: {
        logger: {
          default: 'app',
          loggers: {
            app: { enabled: true, name: 'test', level: 'trace', destination },
          },
        },
        queue: defineQueueConfig({
          default: 'sync',
          adapters: { sync: drivers.sync() },
          locations: [],
        }),
        ...options.config,
      },
      rcFileContents: {
        providers: [
          () => import('@adonisjs/queue/queue_provider'),
          () => import('../../providers/wide_logs_provider.ts'),
          ...(options.providers ?? []),
        ],
      },
    })
    .create(APP_ROOT, {
      importer: (filePath) => import(filePath),
    })

  const app = ignitor.createApp('web')
  await app.init()
  await app.boot()

  for (const job of options.jobs ?? []) {
    Locator.register(job.name, job)
  }

  const router = await app.container.make('router')
  options.routes?.(router)

  const server = await app.container.make('server')
  server.use(options.serverMiddleware ?? [])
  if (options.errorHandler) {
    server.errorHandler(options.errorHandler)
  }
  await server.boot()

  const httpServer = createServer(server.handle.bind(server))
  server.setNodeServer(httpServer)
  httpServer.listen(0, '127.0.0.1')
  await once(httpServer, 'listening')
  await app.start(() => {})

  const { port } = httpServer.address() as AddressInfo

  return {
    app,
    url: `http://127.0.0.1:${port}`,
    logs,
    async close() {
      httpServer.close()
      await once(httpServer, 'close')
      await app.terminate()
      Locator.clear()
    },
  }
}
