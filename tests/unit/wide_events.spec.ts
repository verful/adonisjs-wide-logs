import { test } from '@japa/runner'
import { context, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { setTimeout as sleep } from 'node:timers/promises'

import { defineConfig, measuredFetch, wideEvents } from '../../index.ts'
import { createTestApp } from '../helpers/app.ts'
import { createWideLogsApp } from '../helpers/wide_logs.ts'

test.group('Units of work', () => {
  test('collects context added anywhere in the work into one event', async ({
    assert,
    cleanup,
  }) => {
    const events = wideEvents.fake()
    cleanup(() => events.restore())

    const result = await wideEvents.run('promo.processed', { message: { id: 1 } }, async () => {
      wideEvents.set({ promo: { id: 7 } })
      await sleep(1)
      await Promise.all([
        (async () => wideEvents.set({ promo: { outcome: 'matched' } }))(),
        (async () => wideEvents.increment('store.requests'))(),
        (async () => wideEvents.increment('store.requests'))(),
      ])
      return 'done'
    })
    const { level, fields } = await events.waitFor('promo.processed')

    assert.equal(result, 'done')
    assert.equal(level, 'info')
    assert.containsSubset(fields, {
      message: { id: 1 },
      promo: { id: 7, outcome: 'matched' },
      store: { requests: 2 },
      outcome: 'success',
    })
  })

  test('fails the event and rethrows when the work throws', async ({ assert, cleanup }) => {
    const events = wideEvents.fake()
    cleanup(() => events.restore())

    await assert.rejects(
      () =>
        wideEvents.run('listener.message', {}, () => {
          throw new Error('Unreadable message', { cause: new SyntaxError('Unexpected <') })
        }),
      'Unreadable message'
    )
    const { level, fields } = await events.waitFor('listener.message')

    assert.equal(level, 'error')
    assert.containsSubset(fields, {
      error: {
        message: 'Unreadable message',
        cause: { type: 'SyntaxError', message: 'Unexpected <' },
      },
    })
  })

  test('writes nothing for discarded work', async ({ assert, cleanup }) => {
    const events = wideEvents.fake()
    cleanup(() => events.restore())

    await wideEvents.run('poll.tick', {}, () => wideEvents.discard())
    await wideEvents.run('poll.tick', { found: 1 }, () => {})

    await events.waitFor('poll.tick')
    assert.lengthOf(events.events, 1)
  })

  test('caps appended lists and counts the rest', async ({ assert, cleanup }) => {
    const events = wideEvents.fake()
    cleanup(() => events.restore())

    await wideEvents.run('sweep', {}, () => {
      for (const id of [1, 2, 3, 4]) {
        wideEvents.append('items', id, { limit: 2 })
      }
    })
    const { fields } = await events.waitFor('sweep')

    assert.deepEqual(fields['items'], [1, 2])
    assert.equal(fields['items_omitted'], 2)
  })

  test('ignores context added outside any unit of work', ({ assert }) => {
    assert.doesNotThrow(() => {
      wideEvents.set({ orphan: true })
      wideEvents.fail(new Error('nowhere'))
    })
  })
})

test.group('Measuring calls', () => {
  test('counts calls, errors and time spent per system', async ({ assert, cleanup }) => {
    const { url, close } = await createTestApp({
      routes: (router) => {
        router.get('/items', () => ({ ok: true }))
        router.get('/missing', ({ response }) => response.notFound(''))
      },
    })
    cleanup(close)
    const events = wideEvents.fake()
    cleanup(() => events.restore())
    const supplier = measuredFetch('supplier')

    await wideEvents.run('catalog.sync', {}, async () => {
      await supplier(`${url}/items`)
      await supplier(`${url}/missing`)
      await wideEvents
        .measure('geoip', () => Promise.reject(new Error('lookup failed')))
        .catch(() => {})
    })
    const { fields } = await events.waitFor('catalog.sync')

    assert.containsSubset(fields, {
      supplier: { count: 2, errors: 1 },
      geoip: { count: 1, errors: 1 },
    })
    assert.isNumber((fields['supplier'] as { duration_ms: unknown }).duration_ms)
  })
})

test.group('Tail sampling', () => {
  test('keeps failures, slow, watched and job events, and thins the rest', async ({
    assert,
    cleanup,
  }) => {
    const { close } = await createWideLogsApp({
      config: {
        wide_logs: defineConfig({
          sampling: {
            rate: 0,
            slowMs: 30,
            keep: (fields) => fields['user_id'] === 'vip',
            drop: (fields) => fields['event'] === 'health',
          },
        }),
      },
    })
    cleanup(close)
    const events = wideEvents.fake()
    cleanup(() => events.restore())

    await wideEvents.run('routine', {}, () => {})
    await wideEvents.run('health', {}, () => {})
    await wideEvents.run('watched', { user_id: 'vip' }, () => {})
    await wideEvents.run('slow', {}, () => sleep(40))
    await wideEvents.run('failed', {}, () => Promise.reject(new Error('x'))).catch(() => {})
    await wideEvents.run('job.finished', {}, () => {})
    await events.waitFor('job.finished')

    assert.sameMembers(
      events.events.map(({ fields }) => fields['event']),
      ['watched', 'slow', 'failed', 'job.finished']
    )
  })
})

test.group('Logger and tracing', () => {
  test('writes events to the app logger with the process role', async ({ assert, cleanup }) => {
    const { logs, close } = await createTestApp()
    cleanup(close)

    await wideEvents.run('report.built', { report: { id: 3 } }, () => {})
    await sleep(5)

    assert.containsSubset(logs, [
      { event: 'report.built', report: { id: 3 }, role: 'web', outcome: 'success' },
    ])
  })

  test('carries the trace ids of the span active when the event opens', async ({
    assert,
    cleanup,
  }) => {
    const manager = new AsyncLocalStorageContextManager().enable()
    context.setGlobalContextManager(manager)
    cleanup(() => context.disable())
    const { close } = await createTestApp()
    cleanup(close)
    const events = wideEvents.fake()
    cleanup(() => events.restore())
    const span = trace.wrapSpanContext({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: 1,
    })

    await context.with(trace.setSpan(context.active(), span), () =>
      wideEvents.run('traced', {}, () => {})
    )
    const { fields } = await events.waitFor('traced')

    assert.containsSubset(fields, {
      trace_id: '0af7651916cd43dd8448eb211c80319c',
      span_id: 'b7ad6b7169203331',
    })
  })
})
