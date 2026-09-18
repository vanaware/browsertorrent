# Importing BrowserTorrent from GitHub

This guide explains how to use the `browsertorrent` library in your own projects by importing it directly from the GitHub repository.

## 1. Deno Usage

Deno supports importing TypeScript files directly via URLs. You can point to the `mod.ts` file in the `packages/core` directory.

```typescript
import { Client } from "https://raw.githubusercontent.com/vanaware/browsertorrent/main/packages/core/src/mod.ts";

const client = new Client();

// Seed a file
const file = new File(["hello world"], "hello.txt", { type: "text/plain" });
const torrent = await client.seed(file);

console.log("InfoHash:", torrent.infoHash);
```

## 2. Browser Usage (Vite, Webpack, etc.)

For standard web projects, we recommend using [esm.sh](https://esm.sh) to handle dependencies and TypeScript compilation automatically.

```typescript
import { Client } from "https://esm.sh/gh/vanaware/browsertorrent@main/packages/core/src/mod.ts";

const client = new Client();
```

If you are using a bundler like Vite, you can add it to your `package.json`:

```json
{
  "dependencies": {
    "@vanaware/browsertorrent": "https://esm.sh/gh/vanaware/browsertorrent@main/packages/core/src/mod.ts"
  }
}
```

## 3. Service Worker Integration (Streaming)

To enable video/audio streaming, you must register the `browsertorrent` Service Worker.

### A. Host the Service Worker
Copy `packages/service-worker/src/sw.ts` to your public directory (or use `esbuild` to bundle it).

### B. Register the Service Worker
In your main application file:

```typescript
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" });
}
```

### C. Connect the Client to the SW
The `Client` needs to communicate with the Service Worker to register streamable files.

```typescript
import { streamManager } from "https://esm.sh/gh/vanaware/browsertorrent@main/packages/core/src/mod.ts";

// When a torrent is ready
torrent.on("ready", () => {
  streamManager.registerTorrent(torrent);
});
```

## 4. WebTorrent Drop-in Replacement

If you are already using the original `webtorrent` library, you can use our compatibility wrapper which provides a similar API but uses our high-performance Deno-native core.

**Importing the wrapper:**
`https://raw.githubusercontent.com/vanaware/browsertorrent/main/packages/webtorrent/index.ts`

(Note: Ensure the path matches your repository structure).
