/**
 * example/server.ts — Servidor estático Deno para a demo.
 *
 * Uso:
 *   deno serve --allow-net --allow-read --port 8080 example/server.ts
 *
 * Serve arquivos de build/dist/ e o service worker.
 */
import { serveDir } from "@std/http/file-server";

const PORT = 8000;

console.log(`🌐 Loco WebTorrent Demo Server`);
console.log(`   Acesse: http://localhost:${PORT}/`);
console.log(`   SW scope: /`);
console.log(``);

Deno.serve({ port: PORT }, (req: Request) => {
  // O serveDir é nativo e otimizado para servir arquivos locais
  return serveDir(req, {
    fsRoot: "./build/dist",
    showDirListing: true,
  });
});
