# CryptoGram Messenger

Azat Technologies word-puzzle messenger. Every letter in a quote or message is swapped for a number, and the player works out which letter each number stands for.

- Live (planned): https://cryptogram.azat.games
- Sign-in: https://login.azat.games (shared Azat Auth)
- Product code: CGM (PRs are PR-CGM-N)

## Site layout

- `/` is the landing page: `index.html` and `src/landing/`.
- `/play` is the game. `play/index.html` loads the app in `src/`. Game code stays out of `src/landing/`.
- `vercel.json` rewrites `/play` and `/play/(.*)` to `/play/index.html`. The site root is not rewritten.

## Development

- `npm run dev` serves the landing page at `/` and the game at `/play`. `npm test` runs vitest. `npm run build` typechecks, then builds both entries.
- Copy `.env.example` to `.env` only when wiring the shared Supabase project. The names are `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. With those unset, the game stays in stub mode and plays a local sample quote.
- Schema proposal: `supabase/migrations/20260926120000_cryptogram_init.sql`. A human applies it. The app does not.
