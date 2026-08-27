# visual-diffs-action

Playwright visual snapshots → GitHub-native PR image diffs + a sticky comment with
**cropped before / after / diff strips** of exactly the pixels that changed.
No third-party service; everything stays in your repo.

Proven in [rioredwards/portfolio#82](https://github.com/rioredwards/portfolio/pull/82).

## What a PR gets

1. CI regenerates the `@visual` Playwright screenshots in a pinned Linux container and
   commits changed baselines to the PR branch → GitHub shows native image diffs
   (2-up / swipe / onion-skin) in the commit.
2. Each changed region is cropped to a stacked before/after/diff strip and posted as one
   sticky PR comment. Public repos get inline images; private repos get links
   (GitHub can't render authenticated raw images inline).
3. Crops live on an orphan `visual-diffs` branch — they never touch your main history.

## Usage

```yaml
# .github/workflows/ci.yml
jobs:
  visual:
    if: ${{ !github.event.pull_request.head.repo.fork }}
    permissions:
      contents: write
      pull-requests: write
    uses: rioredwards/visual-diffs-action/.github/workflows/visual-diffs.yml@main
    with:
      container: mcr.microsoft.com/playwright:v1.58.1-noble   # match your Playwright version
      install-command: npm ci
      test-command: npx playwright test --grep @visual
```

### Inputs

| Input | Default | Notes |
|---|---|---|
| `container` | *(required)* | Playwright image; **must match** the repo's Playwright version |
| `install-command` | `npm ci` | Inline any env vars it needs (`HUSKY=0` is already set) |
| `test-command` | `npx playwright test --grep @visual` | Without `--update-snapshots`/`--retries`; the workflow runs it twice |
| `screenshots-path` | `e2e/__screenshots__/**` | Committed baseline glob committed back to the PR branch |
| `pad` | `40` | Rows of context around each changed band |
| `action-ref` | `main` | Ref of this repo to fetch the crop tool from |

## Your repo owns

- An `@visual`-tagged Playwright spec: one `toHaveScreenshot` per route, with masks for
  anything animated/rotating, `animations: 'disabled'`, and hydration waits.
- `snapshotPathTemplate` **without a platform suffix** (baselines are Linux-only), e.g.
  `e2e/__screenshots__/{projectName}/{arg}{ext}`, and isolating `@visual` from the normal
  suite (e.g. `grepInvert` unless `VISUAL=1`).
- Never run `--update-snapshots` locally on macOS — CI owns the baselines.

## Notes / limits

- Never fails on pixel diffs — it's a "show me" job, not a gate.
- The baseline commit is pushed with `GITHUB_TOKEN`, so it does **not** re-trigger CI;
  the PR's checks remain those of the last human push.
- Fork PRs are skipped (no write token).
- The `visual-diffs` branch grows per run; prune it whenever (delete-and-recreate is safe).
