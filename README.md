# @verful/adonisjs-wide-logs

Wide event logging for [AdonisJS](https://adonisjs.com) 7.

Instead of many scattered log lines, each unit of work (an HTTP request, a
queue job, a command) writes **one** context-rich log line when it ends. Code
that takes part in the work adds its context to that event instead of logging
on its own. The current event follows the work through `AsyncLocalStorage`.

Read [loggingsucks.com](https://loggingsucks.com) for the reasoning behind
wide events.

## Install

```sh
node ace add @verful/adonisjs-wide-logs
```

This creates `config/wide_logs.ts`, registers the provider in `adonisrc.ts`
and adds the middleware to the server middleware in `start/kernel.ts`. Then
make the app's exception handler extend the package's:

```ts
// app/exceptions/handler.ts
import { ExceptionHandler } from '@verful/adonisjs-wide-logs'

export default class HttpExceptionHandler extends ExceptionHandler {
  // ...your existing status pages, debug and handle/report overrides
}
```

Keep the middleware after the static and Vite middleware, so serving an
asset writes nothing.

Peer dependencies: `@adonisjs/core` 7. `@adonisjs/queue` (0.6+) and
`@opentelemetry/api` are optional; jobs and trace ids are picked up when they
are installed.

## What it writes

- **`http.request`**, one per request once the response is sent: request id
  (assigned when missing), method, path (secret route params redacted), route,
  status code, user id, duration, outcome. A 4xx error is recorded as context
  and the line stays at `info`; a 5xx fails it and writes it at `error` with
  the stack. AdonisJS's own error report still runs, tagged with the same
  `request_id`.
- **`job.started`**, **`job.progress`** (every 30 s) and **`job.finished`**
  for each queue job: id, name, queue, attempt, time queued, status. Jobs a
  request or job dispatches are listed on its `jobs_dispatched`.
- Every record carries `role` (`web`, `worker`, `console`, `test`), and every
  event carries `trace_id`/`span_id` when an OpenTelemetry span is active.

## Adding context

Anywhere inside a request, job or `wideEvents.run`:

```ts
import { wideEvents } from '@verful/adonisjs-wide-logs'

wideEvents.set({ order: { id: order.id, total_cents: order.totalCents } })
wideEvents.increment('order.items_added')
wideEvents.append('skipped', { id, reason: 'out_of_stock' }, { limit: 20 })
wideEvents.track('sync', () => ({ pages_done: run.pagesDone })) // read at every snapshot
wideEvents.recordError(error) // handled: context only
wideEvents.fail(error) // the work failed
wideEvents.waitUntil(recordOpen()) // work that continues after the response
```

Each call is a no-op outside a unit of work. Calls to other systems:

```ts
const stripe = measuredFetch('stripe') // fetch that counts calls, errors and time
await wideEvents.measure('geoip', () => lookup(ip)) // any other call
```

Work that is neither a request nor a job gets its own event:

```ts
await wideEvents.run('promo.processed', { message: { id } }, async () => {
  // ...
})
```

`wideEvents.discard()` writes nothing for the current unit (a polling tick
that found nothing).

## Configuration

```ts
// config/wide_logs.ts
export default defineConfig({
  http: {
    secretParams: ['publicId'], // default: names with token|secret|signature|password|key
    user: (ctx) => ctx.auth.user?.id, // the default
    context: (ctx) => ({ workspace: { id: ctx.params.workspaceId } }),
  },
  queue: { progressInterval: 30_000, workerCommands: ['queue:work'] },
  sampling: {
    rate: 0.05, // keep 5% of routine events; default 1
    slowMs: 2000, // always keep slower events
    keep: (fields) => fields.user_id === 42, // always keep watched events
    drop: (fields) => fields.route === '/health' && fields.status_code === 200,
  },
})
```

Sampling happens at the tail: failures, slow events, watched events and job
events are always kept. Events kept by the random branch carry `sample_rate`.

## Testing

```ts
const events = wideEvents.fake()
cleanup(() => events.restore())

await client.get('/orders/7')
const { level, fields } = await events.waitFor('http.request')
assert.containsSubset(fields, { status_code: 200, order: { id: 7 } })
```

`waitFor` resolves once the event is written, including events held open by
`waitUntil`, so tests don't sleep. `events.named(name)` lists every event with
that name.

## License

[MIT](LICENSE.md)
