import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Placeholder until the wide events module lands
 */
export default class WideLogsProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {}
}
