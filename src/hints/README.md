# Hint catalog

The solve screen renders one big card per entry in `HINT_CATALOG` (`registry.ts`). Cards are grouped by `category`. There are no dropdowns.

Shipped types:

| id | category | What the player gets |
| --- | --- | --- |
| `find-mistake` | board | One wrong cipher letter turns red. If nothing placed is wrong, one correct letter is revealed instead and the note is "No mistakes found, here's a letter". |
| `reveal-letter` | board | One cipher letter that is not already correct is filled in blue and locked. |
| `unveil-attribution` | source | Author and source, which stay blurred until this hint. |

`weight` is a placeholder for a later catalog (frequency charts, elimination, and the rest of the 2021 writeup). It is not a price. Do not render currency.

## Revealed letters stay locked

A revealed letter cannot be overwritten, cleared, or moved onto another number. Undo and redo put it back. Spending a hint and then taking the letter off the board is not supported.

Red marks clear when the player changes that cipher letter.

## Add a hint

1. Append a `HintType` to `HINT_CATALOG` in `registry.ts`. Give it an `id`, `category`, `title`, `description`, `weight`, `isAvailable`, and `apply`. `apply` should call `gateway.request(id, state)` so live mode stays on the server.
2. Handle that `id` in `localHintEffect` (`localGateway.ts`) for stub mode.
3. Handle that `id` in `cryptogram.request_hint` (a new migration, not the applied init file). Return only what that hint reveals. Log `{id, action}` on `attempts.hint_log` and increment `hints_used` once.
4. Map the id to a title in `hintTitle` if Solve Complete should name it.
5. Add a unit test for availability and for the server effect parser.

Live mode must not ship plaintext or attribution to the browser before the player earns them. Stub mode may keep the local sample quote.
