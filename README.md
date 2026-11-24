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

This installs the package and registers its provider in `adonisrc.ts`.

Peer dependencies: `@adonisjs/core` 7. `@adonisjs/queue` and `@adonisjs/otel`
are optional; the package uses them when they are installed.

## Usage

Usage docs come with the first release.

## License

[MIT](LICENSE.md)
