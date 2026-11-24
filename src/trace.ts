import type { WideEventFields } from './wide_event.ts'

/**
 * A function that returns the active span's `trace_id` and `span_id`, read
 * when an event opens: the span may no longer be active when the event is
 * written. Returns nothing when `@opentelemetry/api` isn't installed
 */
export async function traceFieldsReader(): Promise<() => WideEventFields> {
  try {
    const { trace } = await import('@opentelemetry/api')
    return () => {
      const span = trace.getActiveSpan()?.spanContext()
      return span && trace.isSpanContextValid(span)
        ? { trace_id: span.traceId, span_id: span.spanId }
        : {}
    }
  } catch {
    return () => ({})
  }
}
