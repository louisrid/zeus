# Stakkz

A 3D city property game for 2 to 5 players, with its own multiplayer server. No Claude, no accounts to sign up for.

## Put it online for free (about 10 minutes)

You need a free **GitHub** account and a free **Render** account (no card).

1. **GitHub** – go to github.com → **New repository** → name it `stakkz` → **Create**.
   On the new page choose **uploading an existing file**, drag in *everything inside this folder*
   (not the folder itself), and press **Commit changes**.
2. **Render** – go to render.com → **New +** → **Blueprint** → connect GitHub → pick the `stakkz` repository → **Apply**.
   Render reads `render.yaml`, installs and starts the game.
3. After a minute or two Render shows your address, like `https://stakkz-xxxx.onrender.com`. That is the game.
4. Open it, press **Create party**, then **Copy invite**, and send the link to up to four friends.

That is all. To update the game later, upload the changed files to the same GitHub repository; Render redeploys by itself.

### What to expect on the free plan
- The server sleeps after 15 minutes with nobody on it. The first visit after that takes up to a minute to wake it. It stays awake while anyone has the game open in a party.
- Free servers do not keep files when they sleep. Parties in progress are lost then, but **coins, items and looks are not**: every browser holds a sealed copy of its own account, and the server restores it on the next visit. The seal cannot be forged or edited.
- A player's account lives in the browser they play in. Clearing the site's data, or switching device, starts a new account.

### Running it anywhere else
It is a plain Node program: `npm install` then `npm start` (Node 20 or newer). It listens on `PORT` (default 3000).
Any host that runs Node and allows WebSockets works (Railway, Fly.io, Koyeb, a small VPS, your own computer).
Set `STAKKZ_SECRET` to any long random text so sealed accounts stay valid across restarts, and `DATA_FILE` to a path on a
disk that is kept if your host has one.
Netlify, Vercel and GitHub Pages cannot run it on their own: they host pages and short functions, not a server that
holds a live connection, which is what lets everyone see each move the moment it happens.

## What is in here
- `public/index.html` – the whole game page.  `public/engine.js` – the rules.  `public/three.min.js` – the 3D library.
- `server.js` – web server, live connections, storage.
- `src/core.js` – what the server decides: every move (using the same rules file), dice, timers, coins, shop, loot boxes.
- `src/shop.js` – item list and prices.
- `render.yaml` – tells Render how to run it.
- `tests/` – `rules_sim.cjs` plays 400 random games against the rules; `party_test.py` drives four real browsers against a running server.

## How cheating is prevented
Players send moves, never results. The server checks whose turn it is, rolls the dice, applies the rules and sends
the new game to everyone. Coins and items are only ever changed by the server. Games against the computer or on one
shared device are worked out in the browser, so what they pay is capped by the server.
