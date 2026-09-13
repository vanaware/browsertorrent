> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém os arquivos de configuração e execução do SERVIDOR para testes do exemplo ui.
> O projeto é o **BrowserTorrent ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto BrowserTorrent - Modo: SERVER

Gerado automaticamente em: 9/12/2026, 8:09:19 PM

---

## Arquivo: `packages/server/deno.jsonc`

```json
{
  "name": "@browsertorrent/server",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "esnext", "deno.ns", "deno.unstable"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "imports": {
    "@negrel/webpush": "jsr:@negrel/webpush@^0.5.0",
    "@std/assert": "jsr:@std/assert",
    "@std/fs": "jsr:@std/fs",
    "@std/http": "jsr:@std/http",
    "@std/path": "jsr:@std/path",
    "@cloudflare/workers-types": "npm:@cloudflare/workers-types",
    "wrangler": "npm:wrangler"
  },
  "tasks": {
    "test": "deno test --allow-env --allow-net --allow-read --unstable-bundle tests/",
    "check": "deno check --unstable-bundle src/**/*.ts src/**/*.tsx tests/**/*.ts",
    "tests": "deno task check && deno task test",
    "start": "deno run --allow-read --allow-write --allow-env --allow-net --env-file ./src/main.ts",
    "dev": "deno run --allow-read --allow-write --allow-env --allow-net --env-file --watch ./src/main.ts",
    "clean": "deno clean && rm -rf ./build && mkdir -p ./build/dist",
    "deploy": "deno task init && ./deploy.sh"
  },
  "exports": "./src/main.ts",
  "exclude": ["./build/"]
}

```

---

## Arquivo: `packages/server/src/main.ts`

```ts
/// <reference lib="deno.ns" />

import { serveDir } from "@std/http/file-server";

const port = Number(Deno.env.get("PORT") ?? 8000);

Deno.serve({ port }, async (req) => {
  try {
    const staticResponse = await serveDir(req, {
      fsRoot: "./build/dist",
      showDirListing: false,
      quiet: true,
    });

    return staticResponse;
  } catch (err) {
    console.warn(
      `[STATIC] Falha ao servir arquivo estático. Build ainda não foi executado?`,
      err instanceof Error ? err.message : err,
    );

    return new Response("Internal Server Error", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
});
```

---

