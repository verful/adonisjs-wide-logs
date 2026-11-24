import type { HttpContext } from '@adonisjs/core/http'
import { ExceptionHandler } from '@adonisjs/core/http'
import { Job, tracingChannels } from '@adonisjs/queue'
import { test } from '@japa/runner'

import WideLogsProvider from '../../providers/wide_logs_provider.ts'
import { createTestApp } from '../helpers/app.ts'

class EchoJob extends Job<{ text: string }> {
  static ran: string[] = []

  async execute() {
    EchoJob.ran.push(this.payload.text)
  }
}

class RecordingHandler extends ExceptionHandler {
  static reported: unknown[] = []

  override async report(error: unknown, ctx: HttpContext) {
    RecordingHandler.reported.push(error)
    return super.report(error, ctx)
  }
}

test.group('Test app', (group) => {
  group.each.setup(() => {
    EchoJob.ran = []
    RecordingHandler.reported = []
  })

  test('boots the package provider and serves requests', async ({ assert, cleanup }) => {
    const booted: WideLogsProvider[] = []
    const boot = WideLogsProvider.prototype.boot
    WideLogsProvider.prototype.boot = async function (this: WideLogsProvider) {
      booted.push(this)
      return boot.call(this)
    }
    cleanup(() => {
      WideLogsProvider.prototype.boot = boot
    })

    const { app, url, close } = await createTestApp({
      routes: (router) => router.get('/health', () => ({ ok: true })),
    })
    cleanup(close)

    const response = await fetch(`${url}/health`)

    assert.isTrue(app.isReady)
    assert.lengthOf(booted, 1)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
  })

  test('runs server middleware around each request', async ({ assert, cleanup }) => {
    const { url, close } = await createTestApp({
      serverMiddleware: [
        async () => ({
          default: class {
            async handle(ctx: HttpContext, next: () => Promise<void>) {
              await next()
              ctx.response.header('x-wrapped', 'yes')
            }
          },
        }),
      ],
      routes: (router) => router.get('/', () => 'hi'),
    })
    cleanup(close)

    const response = await fetch(url)

    assert.equal(response.headers.get('x-wrapped'), 'yes')
  })

  test('reports request errors through the exception handler', async ({ assert, cleanup }) => {
    const { url, close } = await createTestApp({
      errorHandler: async () => ({ default: RecordingHandler }),
      routes: (router) =>
        router.get('/boom', () => {
          throw new Error('boom')
        }),
    })
    cleanup(close)

    const response = await fetch(`${url}/boom`)

    assert.equal(response.status, 500)
    assert.lengthOf(RecordingHandler.reported, 1)
    assert.equal((RecordingHandler.reported[0] as Error).message, 'boom')
  })

  test('runs dispatched jobs on the sync driver, traced', async ({ assert, cleanup }) => {
    const traced: string[] = []
    const onStart = (message: unknown) => {
      traced.push((message as { job: { name: string } }).job.name)
    }
    tracingChannels.executeChannel.start.subscribe(onStart)
    cleanup(() => tracingChannels.executeChannel.start.unsubscribe(onStart))

    const { close } = await createTestApp({ jobs: [EchoJob] })
    cleanup(close)

    await EchoJob.dispatch({ text: 'hello' })

    assert.deepEqual(EchoJob.ran, ['hello'])
    assert.deepEqual(traced, ['EchoJob'])
  })

  test('captures the app logger output', async ({ assert, cleanup }) => {
    const { app, logs, close } = await createTestApp()
    cleanup(close)

    const logger = await app.container.make('logger')
    logger.info({ event: 'smoke' }, 'hello')

    assert.containsSubset(logs, [{ event: 'smoke', msg: 'hello' }])
  })
})
