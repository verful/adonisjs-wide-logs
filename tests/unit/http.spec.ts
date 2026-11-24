import { errors } from '@adonisjs/core'
import { test } from '@japa/runner'

import { defineConfig, wideEvents } from '../../index.ts'
import { createWideLogsApp } from '../helpers/wide_logs.ts'

test.group('Request wide events', () => {
  test('writes one event per request, with the route and the context the app added', async ({
    assert,
    cleanup,
  }) => {
    const { url, events, close } = await createWideLogsApp({
      routes: (router) =>
        router
          .get('/orders/:id', ({ params }) => {
            wideEvents.set({ order: { id: Number(params['id']) } })
            wideEvents.set({ order: { total_cents: 4200 } })
            return { ok: true }
          })
          .as('orders.show'),
    })
    cleanup(close)

    await fetch(`${url}/orders/7`, { headers: { 'x-inertia': 'true' } })
    const { level, fields } = await events.waitFor('http.request')

    assert.lengthOf(events.events, 1)
    assert.equal(level, 'info')
    assert.containsSubset(fields, {
      method: 'GET',
      path: '/orders/7',
      route: '/orders/:id',
      route_name: 'orders.show',
      status_code: 200,
      inertia: true,
      outcome: 'success',
      order: { id: 7, total_cents: 4200 },
    })
    assert.isNumber(fields['duration_ms'])
  })

  test('records a client error as context and keeps the event at info', async ({
    assert,
    cleanup,
  }) => {
    const { url, events, close } = await createWideLogsApp()
    cleanup(close)

    await fetch(`${url}/no-such-page`)
    const { level, fields } = await events.waitFor('http.request')

    assert.equal(level, 'info')
    assert.containsSubset(fields, { status_code: 404, outcome: 'success', error: { status: 404 } })
  })

  test('fails the event on a server error and keeps the core error report', async ({
    assert,
    cleanup,
  }) => {
    const { url, events, logs, close } = await createWideLogsApp({
      routes: (router) =>
        router.get('/boom', () => {
          throw new TypeError('boom')
        }),
    })
    cleanup(close)

    await fetch(`${url}/boom`)
    const { level, fields } = await events.waitFor('http.request')

    assert.equal(level, 'error')
    assert.containsSubset(fields, {
      status_code: 500,
      outcome: 'error',
      error: { type: 'TypeError', message: 'boom' },
    })
    assert.isString((fields['error'] as { stack?: unknown }).stack)
    assert.isString(fields['request_id'])
    assert.containsSubset(logs, [{ msg: 'boom', request_id: fields['request_id'] }])
  })

  test('fails the event when the response is a 5xx without a thrown error', async ({
    assert,
    cleanup,
  }) => {
    const { url, events, close } = await createWideLogsApp({
      routes: (router) => router.get('/down', ({ response }) => response.serviceUnavailable('')),
    })
    cleanup(close)

    await fetch(`${url}/down`)
    const { level, fields } = await events.waitFor('http.request')

    assert.equal(level, 'error')
    assert.containsSubset(fields, { status_code: 503, error: { message: 'Answered 503' } })
  })

  test('keeps the values of secret route params out of the path', async ({ assert, cleanup }) => {
    const { url, events, close } = await createWideLogsApp({
      config: { wide_logs: defineConfig({ http: { secretParams: ['publicId'] } }) },
      routes: (router) => {
        router.get('/t/:publicId/open', () => '')
        router.get('/reset/:token', () => '')
      },
    })
    cleanup(close)

    await fetch(`${url}/t/s3cr3t-id/open`)
    await fetch(`${url}/reset/abc123`)

    const paths = events.named('http.request').map(({ fields }) => fields['path'])
    assert.deepEqual(paths, ['/t/:publicId/open', '/reset/abc123'])
  })

  test('redacts params named like secrets by default', async ({ assert, cleanup }) => {
    const { url, events, close } = await createWideLogsApp({
      routes: (router) => router.get('/reset/:token', () => ''),
    })
    cleanup(close)

    await fetch(`${url}/reset/abc123`)
    const { fields } = await events.waitFor('http.request')

    assert.equal(fields['path'], '/reset/:token')
    assert.notInclude(JSON.stringify(fields), 'abc123')
  })

  test('adds the user and app context when the request ends, without erasing a user the app set', async ({
    assert,
    cleanup,
  }) => {
    const { url, events, close } = await createWideLogsApp({
      config: {
        wide_logs: defineConfig({
          http: {
            user: (ctx) => ctx.request.header('x-user'),
            context: (ctx) => ({ workspace: { id: ctx.request.header('x-workspace') } }),
          },
        }),
      },
      routes: (router) =>
        router.get('/pixel', () => {
          wideEvents.set({ user_id: 'sender-1' })
          return ''
        }),
    })
    cleanup(close)

    await fetch(`${url}/pixel`, { headers: { 'x-user': 'user-9', 'x-workspace': 'w-1' } })
    await fetch(`${url}/pixel`)

    const [signedIn, anonymous] = events.named('http.request').map(({ fields }) => fields)
    assert.containsSubset(signedIn, { user_id: 'user-9', workspace: { id: 'w-1' } })
    assert.equal(anonymous?.['user_id'], 'sender-1')
  })

  test('waits for work that continues after the response', async ({ assert, cleanup }) => {
    const { url, events, close } = await createWideLogsApp({
      routes: (router) => {
        router.get('/track', () => {
          wideEvents.waitUntil(
            (async () => {
              await new Promise((resolve) => setTimeout(resolve, 20))
              wideEvents.set({ open: { counted: true } })
            })()
          )
          return ''
        })
        router.get('/track-fails', () => {
          wideEvents.waitUntil(Promise.reject(new Error('recording failed')))
          return ''
        })
      },
    })
    cleanup(close)

    const response = await fetch(`${url}/track`)
    const tracked = await events.waitFor('http.request')
    await fetch(`${url}/track-fails`)
    const failed = await events.waitFor('http.request', {
      where: (fields) => fields['path'] === '/track-fails',
    })

    assert.equal(response.status, 204)
    assert.containsSubset(tracked.fields, { open: { counted: true }, outcome: 'success' })
    assert.equal(failed.level, 'error')
    assert.containsSubset(failed.fields, {
      status_code: 204,
      error: { message: 'recording failed' },
    })
  })

  test('records a validation error as context', async ({ assert, cleanup }) => {
    const { url, events, close } = await createWideLogsApp({
      routes: (router) =>
        router.post('/sign-in', () => {
          throw new errors.E_HTTP_EXCEPTION('Invalid input', { status: 422 })
        }),
    })
    cleanup(close)

    await fetch(`${url}/sign-in`, { method: 'POST' })
    const { level, fields } = await events.waitFor('http.request')

    assert.equal(level, 'info')
    assert.containsSubset(fields, { status_code: 422, error: { status: 422 } })
  })
})
