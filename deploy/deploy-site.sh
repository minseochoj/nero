#!/bin/sh
# Build and deploy the site with the commit it was built from, so its footer and /verify name it.
#   deploy/deploy-site.sh            (needs the Vercel CLI, linked to the project in site/)
set -e
COMMIT=$(git rev-parse HEAD)
git diff --quiet HEAD -- site || { echo "site/ has uncommitted changes: commit first, so the footer is true"; exit 1; }
cd site && vercel deploy --prod --yes --build-env NEXT_PUBLIC_COMMIT=$COMMIT
