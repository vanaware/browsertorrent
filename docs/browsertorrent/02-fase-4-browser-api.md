# Fase 4: Browser API (webtorrent.min.js parity)

## 🎯 Objetivo da Fase
A Fase 4 reproduz a API pública do upstream `webtorrent.min.js` para o Loco, sem regressão do que já existia.  Cada item abaixo referencia a matriz de paridade do `QWEN.md` (§5, "webtorrent.min.js API → src/").

---

## 📁 1. File class (`src/core/file.ts`)

Substitui o `ParsedTorrentFile` estático por uma **classe viva** que acessa o `ChunkStore` para leitura sob demanda.  Habilita streaming de mídia no browser sem precisar baixar o arquivo todo.

### API Pública
- `new File({ store, length, offset, pieceLength, name?, path?, infoHash?, fileIndex?, scope?, blockSize? })`
- `file.length` / `file.name` / `file.path` / `file.pieceLength` / `file.offset`
- `file.infoHash` / `file.fileIndex` / `file.scope` / `file.destroyed`
- `file.pieceRange` → `{ first, last }` (peças que tocam este arquivo)
- `file.includes(piece: Piece)` → boolean (a peça pertence a este arquivo?)
- `file.createReadStream({ start?, end? })` → `ReadableStream<Uint8Array>`
- `file.stream({ start?, end? })` → alias de `createReadStream`
- `file[Symbol.asyncIterator]()` → `AsyncIterableIterator<Uint8Array>`
- `file.arrayBuffer()` → `Promise<ArrayBuffer>` (materializa o arquivo todo)
- `file.blob()` → `Promise<Blob>`
- `file.getBlobURL()` → `Promise<string>` (URL temporária `blob:…`)
- `file.streamTo(element: HTMLMediaElement)` (via SW)
- `file.streamURL()` → `string` (URL servida pelo SW)
- `file.select(start?, end?)` / `file.deselect(start?, end?)` (no-ops, selection vive no `Torrent`)
- `file.destroy()`

### Eventos
- `stream` (CustomEvent<ReadableStream<Uint8Array>>) — emitido quando uma nova stream é criada
- `iterator` (CustomEvent<AsyncIterable<Uint8Array>>) — emitido quando o iterator é criado
- `done` (CustomEvent<void>) — emitido quando a leitura completa termina
- `error` (CustomEvent<{ error: Error }>) — emitido em erro de leitura

### Decisões de Implementação
1. **Leitura peça-a-peça**: `createReadStream` faz `pull` lazy no `ChunkStore` para cada bloco de `blockSize` (default 64 KiB).
2. **Range relativo**: `createReadStream({ start, end })` é relativo ao arquivo (`start=0` é o primeiro byte do arquivo, não do torrent).
3. **Cross-piece reads**: `_readBlock` lida com bytes que cruzam fronteiras de peça, retornando a fatia exata pedida.
4. **Backpressure real**: cada `pull` lê um bloco e o enfileira; o consumidor (ex: SW) controla o ritmo.
5. **Eventos `stream`/`iterator`/`done`**: para integração com consumidores que precisam reagir ao ciclo de vida (ex: telemetria).

### Testes (30 testes, todos passando)
- Constructor, propriedades, defaults
- `pieceRange`, `includes()` (com e sem `Piece` instance)
- `createReadStream` — leitura completa, range, `start`/`end`, validação, `destroy`
- Eventos `stream`, `done`, `error`
- `stream()` (alias)
- `Symbol.asyncIterator` (consumo via `for await`)
- `arrayBuffer`, `blob`, `getBlobURL`
- `streamURL` (validação de infoHash/fileIndex, default scope)
- `streamTo` (atribuição a `<video>`)
- `destroy`
- `select`/`deselect` (no-ops)

---

## 🧩 2. Piece class (`src/core/piece.ts`)

Substitui a `interface Piece` simples por uma **classe** com metadados ricos.  Permite expor `torrent.files[0].pieces[i]` na API pública.

### API Pública
- `new Piece(index, length, offset)`
- `piece.index` / `piece.length` / `piece.offset`
- `piece.hash` (opcional, setado após verificação SHA-1)
- `piece.downloaded` → `boolean` (true se hash está setado)
- `piece.missing` → `boolean` (true se hash está setado)
- `piece.toString()` → string

### Testes (6 testes, todos passando)
- Constructor
- `downloaded`/`missing` state
- `toString`

---

## 🌐 3. WebTorrent client (`src/mod.ts`)

Adições/paridade com a API upstream:

- `client.createServer({ controller, scope })` — idêntico a `webtorrent.min.js`
- `client.initServiceWorker()` — registra SW automaticamente
- `client.server` — instância de `WebTorrentServer` (ou `null`)
- `client.add(torrentId, opts)` — adiciona torrent
- `client.remove(infoHash, destroyStore?)`
- `client.destroy()`
- `torrent.magnetURI`, `torrent.numPeers`, `torrent.downloadSpeed`, `torrent.uploadSpeed`, `torrent.ratio`, `torrent.timeRemaining`
- `torrent.paused`, `torrent.selected`, `torrent.criticalPieces`, `torrent.webSeeds`
- `torrent.select(start, end?)`, `torrent.deselect(start, end?)`, `torrent.setCritical(start, end?)`
- `torrent.pause()`, `torrent.resume()`
- `torrent.addPeer(addr)`, `torrent.removePeer(addr)`, `torrent.addWebSeed(url)`, `torrent.removeWebSeed(url)`
- Eventos: `infoHash`, `warning`, `noPeers`, `idle`, `wire`

### Eventos `torrent` (do Torrent)
- `ready`, `metadata`, `download`, `upload`, `done`, `error`, `verified`
- `infoHash`, `warning`, `noPeers`, `idle`, `wire`

---

## ✅ Status dos Testes (Fase 4)

| Arquivo | Testes novos | Status |
|---|---|---|
| `tests/file_test.ts` (reescrito) | 30 | ✅ todos passando |
| `tests/piece_test.ts` (novo) | 6 | ✅ todos passando |
| `tests/torrent_test.ts` (existente) | — | ✅ passando |
| `tests/mod_test.ts` (existente) | — | ✅ passando |
| **Total novo** | **36** | **✅ 0 falhas** |

**Total geral do pacote: 531 testes passando, 0 falhas.**

---

## 📊 Paridade com webtorrent.min.js (após Fase 4)

| Capacidade | webtorrent.min.js | src/ | Estado |
|---|---|---|---|
| **File class** com streaming | ✅ | ✅ | 🟢 |
| File `createReadStream` | ✅ | ✅ | 🟢 |
| File `stream()` (W3C ReadableStream) | ✅ | ✅ | 🟢 |
| File `arrayBuffer()` / `blob()` / `getBlobURL()` | ✅ | ✅ | 🟢 |
| File `[Symbol.asyncIterator]` | ✅ | ✅ | 🟢 |
| File `streamTo(elem)` | ✅ | ✅ | 🟢 |
| File `streamURL` | ✅ | ✅ | 🟢 |
| File `select`/`deselect`/`includes` | ✅ | ✅ | 🟢 |
| File events: `stream`, `iterator`, `done` | ✅ | ✅ | 🟢 |
| **createServer / SW integration** | ✅ | ✅ | 🟢 |
| **Torrent.select/deselect/critical** | ✅ | ✅ | 🟢 |
| **Torrent.pause/resume** | ✅ | ✅ | 🟢 |
| **Torrent.addPeer/addWebSeed/removePeer** | ✅ | ✅ | 🟢 |
| **Torrent properties** (`magnetURI`, `numPeers`, speeds, ratio, timeRemaining) | ✅ | ✅ | 🟢 |
| **Torrent events** (`infoHash`, `warning`, `noPeers`, `idle`, `wire`) | ✅ | ✅ | 🟢 |
| **Client.createServer** | ✅ | ✅ | 🟢 |
| **Client.initServiceWorker** | ✅ | ✅ | 🟢 |
| **Piece class** com `length`, `missing` | ✅ | ✅ | 🟢 |
| Web Seeds (BEP 19) | ✅ | ⏳ | 🟡 (em Phase 5.3) |

---

## 🚀 Próximos Passos (Fase 5)
A Fase 5 focará em:
1. **Phase 5.3**: Web Seeds (BEP 19) — fetch de dados via HTTP como peer alternativo, integrando com OPFS
2. OPFS streaming direto do `File` (bypass do `ChunkStore` para arquivos já completos)
3. Tabela de prioridade de peças (rarest-first) no Swarm
