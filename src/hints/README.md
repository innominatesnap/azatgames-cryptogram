# Hint catalog

Prices, caps, and star thresholds live in `src/hints/config.ts`. The same numbers are seeded into `cryptogram.hint_catalog` and `cryptogram.scoring_rules` by `supabase/migrations/20260926160000_cryptogram_hint_catalog.sql`. Change both together. Hint points are a score penalty. They are not money.

The solve screen renders one card per row of `HINT_SPECS`. Cards are grouped by category, in this order: Analysis tools, Narrow it down, Placement checks, Reveals, Context. There are no dropdowns. A card flips in place to "Use it" and "Not now". The sheet closes after a hint is used.

Stars use hint points:

| Stars | Rule |
| --- | --- |
| 3 | 0 hint points and inside par |
| 2 | 0 hint points over par, or 1–2 hint points |
| 1 | 3 or more hint points |
| 0 | Gave up |

## Shipped hints

| id | points | What the player gets |
| --- | --- | --- |
| `frequency-chart` | 1, first open only | Puzzle counts next to the R1 English chart. The Lewand 2000 source line stays visible. Opening it again is free. |
| `cross-off` | 1 per use | Up to 4 letters that are not in the puzzle. Repeat until none remain. |
| `mark-one` | 1, max 5 | One wrong placed number, chosen on the server. If nothing is placed, it does not charge. If every placed letter is right, it charges and says so. It does not reveal a letter. |
| `check-all` | 2, max 2 | Every wrong placed number. Same empty and all-right rules as mark-one. |
| `surprise-letter` | 2 | The game locks one unsolved number. |
| `pick-letter` | 3 | The player taps a number. It charges even when that letter was already placed correctly. An already revealed number is free. Cancel before the tap charges nothing. |
| `unveil-author` | 1 | Author only. |
| `unveil-source` | 1 | Work title and year, after the author. |

Reveal hints share a cap of `floor(unique letters / 3)`, at least 1 and at most 4.

Red marks stay until the player edits that number. Revealed letters use a teal fill and the word "lock". They cannot be overwritten, cleared, undone, or placed on another number.

Author and source are withheld until the matching hint, or until the puzzle is solved. The hidden line is a fixed placeholder. It is not a blurred copy of the real name.

`confirm_solve` returns only solved or not solved while the puzzle is open (C9). It does not return how many letters are off.

## Not in this version

H9 friend-puzzle allowances are not built. A later pass can offer Hard (no hints), Standard (analysis, cross-off, mark-one, surprise-letter), and Easy (also check-all and pick-letter). Context stays off on friend puzzles.

H10 stays as stub cards or comments: word patterns, short words, and reveal a word. Confirm-one-right is comment-only because the shipped placement hints are mark-one and check-all. Stub `apply` does not charge.

## Add a hint

1. Append a `HintSpec` in `config.ts` with an id, category, title, description, price, max uses, charge kind, and stub flag.
2. Handle that id in `localHintEffect` for stub mode. Use the seeded helpers in `rules.ts`. Do not call `Math.random`.
3. Seed the same price in a new migration (do not edit an applied migration) and handle the id in `cryptogram.request_hint`. Return only what that hint reveals. Log `{id, action, cost, requestId}` and add the price to `hint_points`.
4. Give it a receipt name in `registry.ts` if Solve Complete should name it.
5. Add a unit test that the card renders and that a repeat request id does not charge twice.

Live mode must not ship plaintext, the answer key, or attribution before the player earns them. Stub mode may keep the sample quote inside the local gateway. The solve screen must not render that quote until a hint returns it.
