import { Job } from '@adonisjs/queue'
import { test } from '@japa/runner'
import { setTimeout as sleep } from 'node:timers/promises'

import { defineConfig, wideEvents } from '../../index.ts'
import { createWideLogsApp } from '../helpers/wide_logs.ts'

class SyncCatalogJob extends Job<{ catalogId: number }> {
  async execute() {
    wideEvents.set({ catalog_sync: { id: this.payload.catalogId } })
    await sleep(1)
    wideEvents.increment('catalog_sync.pages_fetched', 3)
  }
}

class FailingJob extends Job<Record<string, never>> {
  async execute() {
    throw new Error('Supplier unreachable')
  }
}

class SlowJob extends Job<Record<string, never>> {
  async execute() {
    const run = { pages: 0 }
    wideEvents.track('catalog_sync', () => ({ pages_fetched: run.pages }))
    run.pages = 3
    await sleep(70)
  }
}

test.group('Job wide events', () => {
  test('writes job.started and job.finished, with the context the job added', async ({
    assert,
    cleanup,
  }) => {
    const { events, close } = await createWideLogsApp({ jobs: [SyncCatalogJob] })
    cleanup(close)

    await SyncCatalogJob.dispatch({ catalogId: 7 })
    const finished = await events.waitFor('job.finished')

    assert.deepEqual(
      events.events.map(({ fields }) => fields['event']),
      ['job.started', 'job.finished']
    )
    assert.containsSubset(events.named('job.started')[0]?.fields, {
      job: { name: 'SyncCatalogJob', attempt: 1 },
      outcome: 'running',
    })
    assert.equal(finished.level, 'info')
    assert.containsSubset(finished.fields, {
      job: { name: 'SyncCatalogJob', attempt: 1, status: 'completed' },
      catalog_sync: { id: 7, pages_fetched: 3 },
      outcome: 'success',
    })
  })

  test('writes a failed job as an error', async ({ assert, cleanup }) => {
    const { events, close } = await createWideLogsApp({ jobs: [FailingJob] })
    cleanup(close)

    try {
      await FailingJob.dispatch({})
    } catch {
      // the sync driver may rethrow the job's error
    }
    const finished = await events.waitFor('job.finished')

    assert.equal(finished.level, 'error')
    assert.containsSubset(finished.fields, {
      outcome: 'error',
      error: { message: 'Supplier unreachable' },
    })
  })

  test('writes progress snapshots of a running job', async ({ assert, cleanup }) => {
    const { events, close } = await createWideLogsApp({
      jobs: [SlowJob],
      config: { wide_logs: defineConfig({ queue: { progressInterval: 20 } }) },
    })
    cleanup(close)

    await SlowJob.dispatch({})
    await events.waitFor('job.finished')

    const progress = events.named('job.progress')
    assert.isAtLeast(progress.length, 2)
    assert.containsSubset(progress[0]?.fields, {
      outcome: 'running',
      catalog_sync: { pages_fetched: 3 },
    })
  })

  test('lists the jobs a request dispatched on its event', async ({ assert, cleanup }) => {
    const { url, events, close } = await createWideLogsApp({
      jobs: [SyncCatalogJob],
      routes: (router) =>
        router.post('/catalogs/:id/sync', async ({ params }) => {
          await SyncCatalogJob.dispatch({ catalogId: Number(params['id']) })
          return ''
        }),
    })
    cleanup(close)

    await fetch(`${url}/catalogs/7/sync`, { method: 'POST' })
    const request = await events.waitFor('http.request')
    const job = await events.waitFor('job.finished')

    assert.containsSubset(request.fields, {
      jobs_dispatched: [{ name: 'SyncCatalogJob' }],
    })
    assert.notProperty(request.fields, 'catalog_sync')
    assert.containsSubset(job.fields, { catalog_sync: { id: 7 } })
  })
})
