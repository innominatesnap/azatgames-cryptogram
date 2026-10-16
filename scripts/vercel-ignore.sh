#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand).
# exit 0 = skip this build, exit 1 = build it.
# Production only builds release commits made by .github/workflows/version.yml,
# so the live footer version label always matches a vX.Y.Z tag. Previews always build.
if [ "$VERCEL_ENV" != "production" ]; then exit 1; fi
case "$VERCEL_GIT_COMMIT_MESSAGE" in
  "chore(release):"*) echo "Release commit: building."; exit 1 ;;
  *) echo "Not a release commit; the version bot will push one. Skipping."; exit 0 ;;
esac
