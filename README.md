# Visual diffs in PR descriptions

Playwright compares UI screenshots against committed baselines. Changed regions become
before / after / diff strips, uploaded directly into the PR description with `gh --attach`.
No differences: no attachments and no description edit. Identical strips also skip re-upload.
Baselines update on the PR branch after a successful screenshot run, as in the original action.
The displayed evidence describes the last detected change, not a cumulative base-branch diff.

```yaml
visual:
  permissions:
    contents: write
    pull-requests: write
  uses: rioredwards/visual-diffs-action/.github/workflows/visual-diffs.yml@<commit>
  secrets:
    upload-token: ${{ secrets.VISUAL_DIFFS_TOKEN }}
  with:
    action-ref: <same-commit>
    container: mcr.microsoft.com/playwright:v1.62.1-noble
    install-command: npm ci
    test-command: npx playwright test --grep @visual
    screenshots-path: e2e/__screenshots__/**
```

Own your Playwright specs, masks, and snapshotPathTemplate. Use `expect(page).toHaveScreenshot`,
not unconditional captures. The workflow compares, crops, verifies by regenerating snapshots,
then uploads and commits changed baselines. Missing baselines are initialized without a diff;
subsequent visual changes produce evidence. Use CI-generated Linux baselines, not macOS pixels.
For monorepos set `working-directory` to the directory containing `test-results`.
Optional `postgres-image` provides an isolated database service at hostname `postgres`.

Same-repository PRs only; forks and Dependabot are excluded. Only run trusted code with the
upload token. Never use `pull_request_target` to run untrusted code. Pin both refs identically.
Native attachments require a user token scoped to the repository with Pull requests write;
GITHUB_TOKEN still handles baseline commits. Rotate the upload token before expiration.
The upload step installs checksum-verified gh 2.100.0 on Linux x64.

The lower-level composite action accepts `images`, `token`, and optional `allow-empty`.
It recursively uploads PNG/JPEG/GIF/WebP (50 maximum, each ≤10 MB), rejects symlinks and unsafe
paths, and preserves surrounding PR text. Stale PR heads and upload errors fail loudly.
Serialize runs per PR; GitHub has no atomic description-edit operation.

Develop: `npm ci && npm test`. On Macs with a global libvips, use
`SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm ci` to use Sharp's packaged library.
