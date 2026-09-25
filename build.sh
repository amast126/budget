#!/usr/bin/env bash
# Builds dashboard.js (the home screen app) from src/. The budget module (app.js) is a separate, prebuilt bundle.
set -euo pipefail
cd "$(dirname "$0")"
npx esbuild src/app.jsx --bundle --minify --format=iife --target=es2019 \
  --loader:.css=text --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' \
  --outfile=dashboard.js
ls -la dashboard.js
