#/bin/bash
node --no-warnings=ExperimentalWarnings --loader esm-module-alias/loader --experimental-json-modules ./scripts/migrate-jsonb-columns.js
