import type Configure from '@adonisjs/core/commands/configure'

import { stubsRoot } from './stubs/main.ts'

/**
 * Runs on `node ace add @verful/adonisjs-wide-logs` and
 * `node ace configure @verful/adonisjs-wide-logs`
 */
export async function configure(command: Configure) {
  const codemods = await command.createCodemods()

  await codemods.makeUsingStub(stubsRoot, 'config/wide_logs.stub', {})

  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@verful/adonisjs-wide-logs/wide_logs_provider')
  })

  await codemods.registerMiddleware('server', [
    { path: '@verful/adonisjs-wide-logs/wide_logs_middleware', position: 'after' },
  ])

  command.logger.info(
    'Extend ExceptionHandler from @verful/adonisjs-wide-logs in app/exceptions/handler.ts'
  )
}
