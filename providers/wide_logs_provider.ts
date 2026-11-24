import type { ApplicationService } from '@adonisjs/core/types'

import { type ResolvedConfig, defineConfig } from '../src/define_config.ts'
import { instrumentQueue } from '../src/queue.ts'
import { runtime } from '../src/runtime.ts'
import { LoggerSink } from '../src/sink.ts'
import { traceFieldsReader } from '../src/trace.ts'

/**
 * Sends wide events to the app logger, instruments queue jobs, and tags
 * every log record with the process role
 */
export default class WideLogsProvider {
  #stopQueue?: () => void

  constructor(protected app: ApplicationService) {}

  async boot() {
    const config = this.app.config.get<ResolvedConfig | undefined>('wide_logs') ?? defineConfig()
    const logger = await this.app.container.make('logger')
    runtime.configure({
      config,
      sink: new LoggerSink(logger),
      openFields: await traceFieldsReader(),
    })
    this.#stopQueue = instrumentQueue(config.queue)
  }

  /**
   * Tag every record with the process role: `web`, `worker` (a queue
   * worker command), `console` (another ace command), `repl` or `test`
   */
  async ready() {
    const logger = await this.app.container.make('logger')
    const environment = this.app.getEnvironment()
    if (environment !== 'console') {
      logger.pino.setBindings({ role: environment })
      return
    }
    const { workerCommands } = runtime.config.queue
    const ace = await this.app.container.make('ace')
    ace.executing((command, isMainCommand) => {
      if (isMainCommand) {
        const role = workerCommands.includes(command.commandName) ? 'worker' : 'console'
        logger.pino.setBindings({ role })
      }
    })
  }

  async shutdown() {
    this.#stopQueue?.()
  }
}
