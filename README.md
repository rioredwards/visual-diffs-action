# Visual diffs in PR descriptions

Playwright compares a PR's UI screenshots against the **target branch's** committed baselines.
Changed regions become before / after / diff strips, uploaded directly into the PR description
with `gh --attach`. The evidence is cumulative: everything the PR changes versus its target, not
just the last push. Identical strips skip re-upload. When the PR matches its target again, the
evidence section is removed. A failed comparison with nothing to crop (e.g. a brand new
screenshot) leaves the description unchanged. The PR's own baselines are then captured and
committed to its branch.

```yaml
# .github/workflows/visual-diffs.yml
name: Visual diffs
on:
  pull_request:
    types: [opened, reopened, synchronize]
    paths: [src/**, .github/workflows/visual-diffs.yml]
  workflow_dispatch:
jobs:
  visual:
    permissions:
      contents: write
      pull-requests: write
    uses: rioredwards/visual-diffs-action/.github/workflows/visual-diffs.yml@<version>
    secrets:
      upload-token: ${{ secrets.VISUAL_DIFFS_TOKEN }}
    with:
      container: mcr.microsoft.com/playwright:v1.62.1-noble
      install-command: npm ci
      test-command: npx playwright test --grep @visual
      screenshots-dir: e2e/__screenshots__
```

**Seeding.** "Run workflow" (`workflow_dispatch`) on a branch captures and commits its baselines,
with no comparison or upload. A target branch without a complete set of baselines is "unseeded":
PRs into it log a warning, skip the comparison, and still commit their own baselines.

Own your Playwright specs, masks, and snapshotPathTemplate. Use `expect(page).toHaveScreenshot`,
not unconditional captures. The capture pass must succeed: broken pages never publish evidence
or baselines. Use CI-generated Linux baselines, not macOS pixels. For monorepos set
`working-directory` to the directory containing `test-results`. Optional `postgres-image`
provides an isolated database service at hostname `postgres`. The workflow fetches its image
tools from its own commit, so there is only one ref to pin.

Same-repository PRs only; forks and Dependabot are excluded. Only run trusted code with the
upload token. Never use `pull_request_target` to run untrusted code.
Native attachments require a user token scoped to the repository with Pull requests write;
GITHUB_TOKEN still handles baseline commits. Rotate the upload token before expiration.
The upload step installs checksum-verified gh 2.100.0 on Linux x64.

The lower-level composite action accepts `images`, `token`, and optional `allow-empty` and `clear`.
It recursively uploads PNG/JPEG/GIF/WebP (50 maximum, each ≤10 MB), rejects symlinks and unsafe
paths, and preserves surrounding PR text. Stale PR heads and upload errors fail loudly.
Serialize runs per PR; GitHub has no atomic description-edit operation.

Develop: `npm ci && npm test`. On Macs with a global libvips, use
`SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm ci` to use Sharp's packaged library.
