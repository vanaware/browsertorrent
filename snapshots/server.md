> **AI INSTRUCTION:** 
> O texto abaixo contém os arquivos de configuração e execução do SERVIDOR @workerdb/server e CI/CD.
> Each file starts with a title indicating its exact relative path (e.g., `## File: src/main.ts`).
> Whenever suggesting changes, clearly indicate which file should be modified based on these paths and provide the complete new code for the file.

---

# Exported Context from Project BrowserTorrent [v0.1.2#mv5nijrw] - Mode: SERVER

Automatically generated at: 2026-10-12T19:34:55.478Z

---

## File: `.github/workflows/ci.yml`

```yaml
name: Continuous Integration

on:
  pull_request:
    branches:
      - main

jobs:
  test-and-lint:
    name: Lint, Type Check, and Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Run Linter
        run: deno lint

      - name: Check Formatting
        run: deno fmt --check

      - name: Type Check Core & Tracker
        run: |
          deno check packages/core/src/mod.ts
          deno check packages/websocket-tracker/src/mod.ts

      - name: Run Test Suite
        run: deno test -A packages/

```

---

## File: `.github/workflows/gh-pages.yml`

```yaml
name: Deploy Example to GitHub Pages

on:
  push:
    tags:
      - "v*.*"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version-file: .tool-versions
          cache: true

      - name: Install dependencies
        run: deno ci

      - name: Verify code integrity
        run: deno task tests

      - name: Build Application
        run: deno task esbuild noversion

      - name: Prepare static assets for GitHub Pages
        run: |
          # Disable Jekyll processing on GitHub Pages
          touch ./packages/server/build/dist/.nojekyll
          # Copy index.html to 404.html for SPA subfolder route fallback
          cp ./packages/server/build/dist/index.html ./packages/server/build/dist/404.html

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: "./packages/server/build/dist"

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4

```

---

## File: `.github/workflows/publish-jsr.yml`

```yaml
name: Publish Packages to JSR

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: read
  id-token: write # Required for JSR OIDC token authentication

jobs:
  publish-core:
    name: Publish Core Client (@vanaware/browsertorrent)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version-file: .tool-versions
          cache: true

      - name: Verify Types and Dry Run
        run: deno publish --dry-run
        working-directory: packages/core

      - name: Publish to JSR
        run: deno publish
        working-directory: packages/core

  publish-tracker:
    name: Publish Tracker Server (@vanaware/browsertorrent-tracker)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version-file: .tool-versions
          cache: true

      - name: Verify Types and Dry Run
        run: deno publish --dry-run
        working-directory: packages/websocket-tracker

      - name: Publish to JSR
        run: deno publish
        working-directory: packages/websocket-tracker

```

---

## File: `packages/server/deno.jsonc`

```json
{
  "name": "@browsertorrent/server",
  "compilerOptions": {
    "lib": [
      "dom",
      "dom.iterable",
      "dom.asynciterable",
      "esnext",
      "deno.ns",
      "deno.unstable"
    ],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "imports": {
    "@std/assert": "jsr:@std/assert",
    "@std/fs": "jsr:@std/fs",
    "@std/http": "jsr:@std/http",
    "@std/path": "jsr:@std/path"
  },
  "tasks": {
    "test": "deno test --allow-env --allow-net --allow-read --unstable-bundle tests/",
    "check": "deno check --unstable-bundle src/**/*.ts src/**/*.tsx tests/**/*.ts",
    "tests": "deno task check && deno task test",
    "start": "deno run --allow-read --allow-write --allow-env --allow-net --env-file ./src/main.ts",
    "dev": "deno run --allow-read --allow-write --allow-env --allow-net --env-file --watch ./src/main.ts",
    "clean": "deno clean && rm -rf ./build && mkdir -p ./build/dist"
  },
  "exports": "./src/main.ts",
  "exclude": ["./build/"]
}

```

---

## File: `packages/server/src/main.ts`

```ts
/// <reference lib="deno.ns" />
import { serveDir, } from "@std/http/file-server";
import { WebSocketTracker, } from "../../websocket-tracker/src/server.ts";

const port = Number(Deno.env.get("PORT",) ?? 3000,);

// Initialize a local tracker instance sharing the main port
const tracker = new WebSocketTracker(port,);

const __dirname = new URL(".", import.meta.url,).pathname;
const fsRoot = Deno.env.get("FS_ROOT",) ??
  new URL("../build/dist", import.meta.url,).pathname;

Deno.serve({ port, }, async (req,) => {
  try {
    const url = new URL(req.url,);

    // Route websocket traffic to the tracker
    if (req.headers.get("upgrade",) === "websocket") {
      const { socket, response, } = Deno.upgradeWebSocket(req,);
      tracker.handleConnection(socket,);
      return response;
    }

    const staticResponse = await serveDir(req, {
      fsRoot,
      showDirListing: false,
      quiet: true,
    },);
    return staticResponse;
  } catch (err) {
    console.warn(
      `[STATIC] Falha ao servir arquivo estático. Build ainda não foi executado?`,
      err instanceof Error ? err.message : err,
    );
    return new Response("Internal Server Error", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", },
    },);
  }
},);

```

---

