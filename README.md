# Visual diffs in PR descriptions

Playwright compares a PR's UI screenshots against the **target branch's** committed baselines.
Changed regions become before / after / diff strips, uploaded directly into the PR description
with `gh --attach`. The evidence is cumulative: everything the PR changes versus its target, not
just the last push. Identical strips skip re-upload. When the PR matches its target again, the
evidence section is removed. Screenshots the target lacks appear under **New screens (after
only)**, including on reruns after the bot commits their baselines. Changed screens keep their
before / after / diff strips. Evidence is published only after capture succeeds, then the PR's
baselines are committed to its branch. New screens skipped by the capture keep their baselines
but are excluded from evidence.

```yaml
# .github/workflows/visual-diffs.yml
name: Visual diffs
on:
  pull_request:
    types: [opened, reopened, synchronize]
    paths: [src/**, e2e/**, .github/workflows/visual-diffs.yml]
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
with no comparison or upload. A target branch with no baselines at all (unseeded) makes the PR log a
warning, skip the comparison, attach captured screens as new, and still commit baselines.

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
Images under `new-screens/` are labeled as after-only evidence; other images are comparison strips.
Serialize runs per PR; GitHub has no atomic description-edit operation.

Develop: `npm ci && npm test`. On Macs with a global libvips, use
`SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm ci` to use Sharp's packaged library.
