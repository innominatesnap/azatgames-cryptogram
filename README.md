# CryptoGram Messenger

Azat Technologies word-puzzle messenger. Every letter in a quote or message is swapped for a number, and the player works out which letter each number stands for.

- Live (planned): https://cryptogram.azat.games
- Sign-in: https://login.azat.games (shared Azat Auth)
- Product code: CGM (PRs are PR-CGM-N)

The app scaffold lands in PR-CGM-1.

## Site layout

- `/` is the landing page: `index.html` and `src/landing/`.
- `/play` is the game. `play/index.html` is a coming-soon placeholder. PR-CGM-1 replaces that page and should keep game code outside `src/landing/`.
- `vercel.json` rewrites `/play` and `/play/(.*)` to `/play/index.html`. The site root is not rewritten.
