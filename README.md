# PR visual evidence

Upload captured images directly into a PR description with GitHub CLI's native `--attach`.
Reruns replace one marked section and preserve surrounding text. Capture screenshots however
your app needs; this action never runs tests, commits baselines, publishes branches or comments.

```yaml
- uses: rioredwards/visual-diffs-action@<reviewed-commit>
  if: github.event_name == 'pull_request' && !github.event.pull_request.head.repo.fork
  with:
    images: visual-evidence
    token: ${{ secrets.VISUAL_DIFFS_TOKEN }}
```

Run after screenshot capture, on a Linux runner with Node 22+ and gh 2.99+ (2.100+ for
fine-grained PAT support). Use a dedicated token scoped to the repository with Pull requests
write permission. The built-in GITHUB_TOKEN cannot upload attachments. Validate your token
with a real upload; repository policy may require approval. Rotate it before expiration.

Use a clean image directory: PNG/JPEG/GIF/WebP, up to 50 files, each nonempty and ≤10 MB.
Paths may contain letters, digits, dots, slashes, underscores and hyphens. Symlinks are rejected.
Missing images, stale PR heads and CLI/upload failures fail the step. Partial CLI uploads may
still update the description before returning failure. Serialize runs per PR; GitHub provides
no atomic body-edit operation, so avoid editing the description during an upload.

Only same-repository `pull_request` events are supported. Never expose this token to fork code
or use `pull_request_target` to execute PR code. Pin this action to a reviewed commit.
The former reusable workflow is removed: callers must capture images then use this step action.

Develop: `node --test`. No package installation required.
