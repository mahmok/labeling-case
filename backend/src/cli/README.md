# CLI

A command line for the same data the API serves. It is a third entry point next to the API and the worker: `index.cli.ts` builds the application and calls the use cases directly, so it needs database access but not a running API.

```bash
bun run backend:cli -- <command>
```

## Commands

| Command                                       | What it does                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `printers list` / `printers get <id>`         | List printers, or show one.                                                                                  |
| `labels list` / `labels get <id>`             | List labels, or show one.                                                                                    |
| `prints list` / `prints get <id>`             | List prints, or show one.                                                                                    |
| `prints create --label <id> --printer <name>` | Print a label. The printer is looked up locally first, then at the vendor.                                   |
| `jobs list` / `jobs get <id>`                 | List jobs, or show one with its result or error.                                                             |
| `jobs create <type>`                          | Queue a job (`sync-printers`, `sync-labels` or `backfill-prints`). The worker must be running to execute it. |

Run any command with `--help` to see its flags.

## Filtering, sorting and paging

`list` commands take the same filters as the API, as repeatable flags (`--name a --name b`), plus:

- `--sort name`, `--sort name:desc`, `--sort=-name`: repeat for more than one key.
- `--limit 20 --offset 40`: `--offset` needs `--limit`.

```bash
bun run backend:cli -- prints list --printer-name "Office Printer" --sort createdAt:desc --limit 5
bun run backend:cli -- jobs list --status failed --type sync-labels
```

## Output

- In a terminal you get a table. When output is piped you get JSON.
- `--format json|yaml|md|toon` overrides this.
- Errors go to stderr and the exit code is 1.
- Logs also go to stderr, at `warn` level unless `LOG_LEVEL` is set.
