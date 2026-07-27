# Applying this package

## 1. The folders
Drag these into the repo, overwriting: `app`, `components`, `lib`, `config`, `jobs`, `supabase`,
`tests`, `docs`, plus `STATUS.md`.

## 2. The `.github` folder is INVISIBLE in Finder
macOS hides any folder starting with a dot. Press **Cmd + Shift + .** (period) in Finder and it appears,
then drag it in like the rest. Press it again to re-hide.

That folder holds the CI workflow and the `tidy` cleanup, which is why the tidy action has not shown up
in your Actions tab: the folder never reached the repo.

**If it still will not drag:** GitHub can create the file directly. Go to the repo, press **Add file →
Create new file**, and type this as the filename:

    .github/workflows/tidy.yml

Then paste the contents of `TIDY-WORKFLOW.yml.txt` from this zip and commit. GitHub creates the folders
for you.

## 3. Then run the tidy once
Actions tab → **tidy** in the left list → **Run workflow**. It deletes every retired file, checks
nothing references them, runs the full test suite, and only then commits. If anything would break it
refuses and changes nothing.

## 4. No SQL this time
Nothing to paste. Migration 021 was the last one.

## What CI does, and why it takes a minute
It runs all 254 tests and a full production build against a clean checkout. That is what catches a
half-finished folder drop before Vercel deploys a broken site. Tests and build now run at the same time
rather than one after the other, with caches, so it should be noticeably faster.

If you want fewer emails regardless: **GitHub → Settings → Notifications → Actions**, and choose to be
notified only on failure, or turn email off entirely.
