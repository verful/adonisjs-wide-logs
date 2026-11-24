# AGENTS.md

`@verful/adonisjs-wide-logs`: an AdonisJS 7 package that writes one wide
event (canonical log line) per HTTP request, queue job or other unit of work.
ESM, TypeScript, published to npm by CI.

## Commands

- Install: `pnpm install` (also installs the lefthook git hooks)
- All checks, as CI runs them: `pnpm checks` (typecheck, lint, format check, test)
- Test: `pnpm test`. One file: `pnpm test --files tests/unit/test_app.spec.ts`.
  One test: `pnpm test --tests "<title>"`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`. Format: `pnpm format` (check only: `pnpm format:check`)
- Build: `pnpm build` (tsdown emits JS, `tsc -p tsconfig.build.json` emits
  declarations, then stubs are copied to `build/stubs`)

## Layout

- `index.ts`: main entry (`.`). Exports `configure`, `stubsRoot` and the public API.
- `configure.ts`: the `node ace add` / `node ace configure` hook. Uses codemods.
- `providers/`: AdonisJS providers. Each file is an `exports` entry
  (`@verful/adonisjs-wide-logs/<file>`).
- `src/`: module source. `src/types.ts` is the `./types` export.
  - `wide_event.ts`: one event's fields. `wide_events.ts`: the public `wideEvents`
    interface. `runtime.ts`: internal shared state (async context, sink,
    sampler, config), never exported.
  - `http/request_event.ts` owns a request's event: open, close, the 4xx/5xx
    rule, path redaction. The middleware and `ExceptionHandler` only call it.
  - `queue.ts` reads `@boringnode/queue`'s tracing channels by name, with its
    own message types, so it imports neither the queue nor its types.
  - `sink.ts`: `LoggerSink` (production) and `FakeSink` (`wideEvents.fake()`).
- `stubs/`: `.stub` templates for `configure`. `stubs/main.ts` exports their root.
- `tests/unit/`: Japa specs (`*.spec.ts`). `tests/helpers/app.ts` boots a test app.
- `bin/test.ts`: Japa entry point.

When you add a file under `providers/` or a new public entry, add it to
`exports` in `package.json` and to `entry` in `tsdown.config.ts`, then run
`pnpm build` and check `build/`.

## Tests

`createTestApp()` in `tests/helpers/app.ts` boots a real in-process AdonisJS
app with `IgnitorFactory`, the core providers, `@adonisjs/queue` on the sync
driver and this package's provider, and serves it over HTTP on a random port.

- Requests go through the real server middleware (`serverMiddleware`) and
  routes (`routes`). Call them with `fetch(url + path)`.
- Errors reach the exception handler's `report` (`errorHandler`). They do not
  propagate back through middleware.
- Jobs passed in `jobs` run inside `Job.dispatch()` on the sync driver, which
  traces `boringqueue.job.execute`.
- `logs` holds every record the app logger wrote, parsed from JSON.
- `createWideLogsApp()` in `tests/helpers/wide_logs.ts` adds the package
  middleware and exception handler and returns `events`, a `FakeSink`. Wait
  for events with `events.waitFor(name)`; never sleep for them.
- Always pass `close` to `cleanup`.

Test through this public surface, not internals. Do not mock modules.

## Code style

- oxlint and oxfmt only. No ESLint, Prettier or Biome.
- `oxlint.config.ts` and `oxfmt.config.ts` mirror the OXC preset in
  `verful/tooling-configs`. Switch to that package once 2.x is on npm (see the
  TODOs). Keep the two in sync until then.
- File names are `snake_case`.
- The tsconfig is strict and enables `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess` and `noPropertyAccessFromIndexSignature`, so the
  package compiles for consumer apps that enable them. Do not relax them.
- Import relative files with their `.ts` extension. The build rewrites it.
- `@adonisjs/queue` and `@opentelemetry/api` are optional peers. Import them only
  from code that runs when they are installed (a separate entry or a dynamic
  import), never from the main entry or the provider's top level.

## Commits and releases

Conventional Commits, enforced by commitlint in the `commit-msg` hook and in CI.

- `type(scope): subject`, imperative, lowercase, no final period, at most 72
  characters. Body wrapped at 72, says what changed and why.
- Every push to `main` runs semantic-release (`.github/workflows/release.yml`).
  `feat` publishes a minor, `fix` and `perf` a patch, `!` or
  `BREAKING CHANGE:` a major. `chore`, `ci`, `docs`, `build`, `test`, `refactor`
  and `style` publish nothing.
- Use a releasing type only for a change consumers see. The release commits
  `package.json` and `CHANGELOG.md` back to `main`; do not edit the version by hand.
