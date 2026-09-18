# JSR Publishing Guide for BrowserTorrent Packages

This guide provides step-by-step instructions for publishing both packages to the [JSR (JavaScript Registry)](https://jsr.io):

1. **`@vanaware/browsertorrent`** (Core Client & WebRTC BitTorrent Engine)
2. **`@vanaware/browsertorrent-tracker`** (Deno WebSocket & HTTP Tracker Server)

---

## 📋 Prerequisites

1. **JSR Account & Scope**:
   - Go to [https://jsr.io](https://jsr.io) and log in with your GitHub account.
   - Create or join the **`@vanaware`** scope at [jsr.io/new/scope](https://jsr.io/new/scope).
2. **Create the Packages on JSR**:
   - Create `@vanaware/browsertorrent` at [jsr.io/new](https://jsr.io/new).
   - Create `@vanaware/browsertorrent-tracker` at [jsr.io/new](https://jsr.io/new).

---

## 🛠️ Option 1: Manual Publishing via Deno CLI

You can publish each package directly from your local terminal using `deno publish`.

### Step 1: Verify Dry Run (Simulate Publish)

Make sure all type checks and JSR linter rules pass:

```bash
# Verify Core Library
deno publish --dry-run --config packages/core/deno.jsonc

# Verify Tracker Server
deno publish --dry-run --config packages/websocket-tracker/deno.jsonc
```

### Step 2: Publish Core Library (`@vanaware/browsertorrent`)

```bash
cd packages/core
deno publish
```
*Note: If prompted, follow the browser authentication flow provided by the Deno CLI.*

### Step 3: Publish Tracker Server (`@vanaware/browsertorrent-tracker`)

```bash
cd packages/websocket-tracker
deno publish
```

---

## 🤖 Option 2: Automated Publishing via GitHub Actions (Recommended)

JSR offers native, token-less OIDC integration with GitHub Actions.

### GitHub Actions Workflow: `.github/workflows/publish-jsr.yml`

Create the workflow file:

```yaml
name: Publish to JSR

on:
  push:
    tags:
      - 'v*'

jobs:
  publish-core:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write # Required for JSR OIDC authentication
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Publish Core to JSR
        run: deno publish
        working-directory: packages/core

  publish-tracker:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write # Required for JSR OIDC authentication
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Publish Tracker to JSR
        run: deno publish
        working-directory: packages/websocket-tracker
```

### Linking GitHub Actions on JSR:
1. On each package page on JSR (`jsr.io/@vanaware/browsertorrent` and `jsr.io/@vanaware/browsertorrent-tracker`):
2. Go to **Settings** > **Publishing**.
3. Select **GitHub Actions** as the publishing method.
4. Link the repository (`vanaware/browsertorrent`).
5. Whenever you create and push a git tag (e.g. `git tag v1.0.0 && git push origin v1.0.0`), GitHub Actions will automatically publish the new version.

---

## 📦 Package Summary & Subpath Exports

### 1. `@vanaware/browsertorrent`
- **JSR URL**: `https://jsr.io/@vanaware/browsertorrent`
- **Config**: `packages/core/deno.jsonc`
- **Subpaths**:
  - `jsr:@vanaware/browsertorrent` (Main client, wire protocol, swarm)
  - `jsr:@vanaware/browsertorrent/service-worker` (Decoupled streaming fetch interceptor)
  - `jsr:@vanaware/browsertorrent/server` (In-browser streaming server bridge)
  - `jsr:@vanaware/browsertorrent/torrent-generator` (OPFS-based torrent metainfo generator)

### 2. `@vanaware/browsertorrent-tracker`
- **JSR URL**: `https://jsr.io/@vanaware/browsertorrent-tracker`
- **Config**: `packages/websocket-tracker/deno.jsonc`
- **Subpaths**:
  - `jsr:@vanaware/browsertorrent-tracker` (Main `createServer` and `WebSocketTracker`)
  - `jsr:@vanaware/browsertorrent-tracker/cli` (Command-line tracker process)
  - `jsr:@vanaware/browsertorrent-tracker/server`
  - `jsr:@vanaware/browsertorrent-tracker/router`
  - `jsr:@vanaware/browsertorrent-tracker/swarm`
  - `jsr:@vanaware/browsertorrent-tracker/peer`
  - `jsr:@vanaware/browsertorrent-tracker/stats`
