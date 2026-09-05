import fs from "fs";
import path from "path";

// This file is loaded via vitest.config.ts `setupFiles`, which Vitest
// guarantees runs BEFORE any test file (and therefore before that test
// file's own imports) is evaluated. Setting env vars here avoids the
// ESM import-hoisting trap: a plain `import` inside a test file is always
// hoisted above ordinary statements by esbuild, so setting env vars in the
// test file itself would run too late to affect a singleton created at
// import time in `src/services/index.ts`.
const testDataDir = path.join(process.cwd(), "data");
fs.rmSync(testDataDir, { recursive: true, force: true });
fs.mkdirSync(testDataDir, { recursive: true });

process.env.QUILL_DB_PATH = path.join(testDataDir, `test-${Date.now()}-${process.pid}.db`);
process.env.SESSION_SECRET = "test-secret";
process.env.NODE_ENV = "test";
