#!/bin/sh
# Ship the solver at the current commit to a server, record the commit it runs, restart it.
#   deploy/deploy-solver.sh root@your-server
set -e
HOST="$1"; [ -n "$HOST" ] || { echo "usage: $0 user@host"; exit 1; }
COMMIT=$(git rev-parse HEAD)
git diff --quiet HEAD -- solver || { echo "solver/ has uncommitted changes: commit first, so the reported commit is true"; exit 1; }
tar --exclude=node_modules --exclude=data -czf /tmp/nero-solver.tgz solver
scp -q /tmp/nero-solver.tgz "$HOST":/tmp/
ssh "$HOST" "set -e; cd /opt/nero && tar -xzf /tmp/nero-solver.tgz && rm /tmp/nero-solver.tgz && cd solver && npm ci --omit=dev --silent && echo $COMMIT > COMMIT && pm2 restart nero-solver --update-env && sleep 3 && curl -s 127.0.0.1:3197/v2/info | head -c 200"
echo; echo "solver now runs $COMMIT"
