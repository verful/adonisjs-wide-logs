import type Configure from '@adonisjs/core/commands/configure'

/**
 * Runs on `node ace add @verful/adonisjs-wide-logs` and
 * `node ace configure @verful/adonisjs-wide-logs`
 */
export async function configure(command: Configure) {
  const codemods = await command.createCodemods()

  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@verful/adonisjs-wide-logs/wide_logs_provider')
  })
}
