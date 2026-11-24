import { ExceptionHandler, wideEvents } from '../../index.ts'
import type { FakeSink } from '../../src/sink.ts'
import { type TestApp, type TestAppOptions, createTestApp } from './app.ts'

/**
 * A test app with the package's middleware and exception handler
 * registered, and wide events kept in memory. Pass `close` to `cleanup`
 */
export async function createWideLogsApp(
  options: TestAppOptions = {}
): Promise<TestApp & { events: FakeSink }> {
  const testApp = await createTestApp({
    serverMiddleware: [() => import('../../src/http/wide_logs_middleware.ts')],
    errorHandler: async () => ({ default: ExceptionHandler }),
    ...options,
  })
  const events = wideEvents.fake()
  return {
    ...testApp,
    events,
    async close() {
      events.restore()
      await testApp.close()
    },
  }
}
