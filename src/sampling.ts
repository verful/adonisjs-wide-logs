import type { WideEventFields } from './wide_event.ts'

export interface SamplingConfig {
  /**
   * Share of routine events kept, from 0 to 1. Defaults to 1 (keep every
   * event). Kept events below 1 carry `sample_rate`
   */
  rate?: number

  /**
   * Events at least this slow (`duration_ms`) are always kept
   */
  slowMs?: number

  /**
   * Always keep a matching event (a watched user, a flag under rollout)
   */
  keep?: (fields: WideEventFields) => boolean

  /**
   * Never keep a matching event unless it failed (a health probe that
   * succeeded)
   */
  drop?: (fields: WideEventFields) => boolean
}

/**
 * `false` drops the event, `true` keeps it, a number keeps it as a random
 * sample at that rate
 */
export type SamplingDecision = boolean | number

export type Sampler = (fields: WideEventFields, failed: boolean) => SamplingDecision

/**
 * Tail sampling: decided when the event is written, so every failure, slow
 * event, watched event and job event is kept, and only routine successes
 * are thinned
 */
export function createSampler(config: SamplingConfig = {}, random = Math.random): Sampler {
  const rate = config.rate ?? 1
  return (fields, failed) => {
    if (failed) {
      return true
    }
    if (config.drop?.(fields)) {
      return false
    }
    if (rate >= 1) {
      return true
    }
    const duration = fields['duration_ms']
    if (config.slowMs !== undefined && typeof duration === 'number' && duration >= config.slowMs) {
      return true
    }
    if (String(fields['event']).startsWith('job.') || config.keep?.(fields)) {
      return true
    }
    return random() < rate ? rate : false
  }
}
