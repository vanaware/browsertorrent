> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém a DOCUMENTAÇÃO e diretrizes arquiteturais do projeto.
> O projeto é o **BrowserTorrent ** estruturado em bbrowsertorrents. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto BrowserTorrent - Modo: DOCS

Gerado automaticamente em: 9/12/2026, 8:09:18 PM

---

## Arquivo: `LICENSE`

```license
MIT License

Copyright (c) 2026 Vanaware

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

---

## Arquivo: `README.md`

```md
# browsertorrent
A pure browser-based BitTorrent client implementation using WebRTC for peer-to-peer file sharing.

```

---

## Arquivo: `.tool-versions`

```tool-versions
deno 2.9.6
```

---

## Arquivo: `docs/browsertorrent/00-api-browsertorrent-webtorrent.md`

````md
# /browsertorrent/monorepo/webtorrent/docs/00-api-browsertorrent-webtorrent.md

# API do `@vanaware/browsertorrent` — Resumo consolidado

> Documento vivo.  Reflete a API pública exposta via `src/mod.ts`.
> Cada item referencia a fase e a fonte original (`webtorrent.min.js` ou inovação do BrowserTorrent).

---

## 📦 Visão geral

O `@vanaware/browsertorrent` é um cliente BitTorrent **100 % browser-first** (Deno + Web APIs nativas, sem dependências de Node.js) que reproduz e estende a API do `webtorrent.min.js` original.  As extensões do BrowserTorrent incluem:

- Service Worker bridge com **backpressure real** (Fase 4.5) — substitui e melhora o `createServer` original.
- Storage **OPFS-first** com fallback em memória (Fase 3) — persiste entre sessões sem IndexedDB.
- Identidade oficial do BrowserTorrent (`-BT0100-`) auto-gerada (Fase 3.4) — PeerId estável entre clientes BrowserTorrent.
- Validators PeerId Azureus/Shadow completos (Fase 3.4) — reconhece qBittorrent, Transmission, BitTornado etc.
- Bitfield com validação rigorosa de spare-bits (Fase 3.5) — mais seguro que a maioria dos clientes.
- `File.streamTo(video)` assíncrono com revoke automático de URL (Fase 4.2).
- `Bitfield.fromBytes` puro Deno, sem dependências.

---

## 🔑 Exports principais (`src/mod.ts`)

### Classe `WebTorrent`

```ts
import { WebTorrent } from "@vanaware/browsertorrent";

const client = new WebTorrent({
  peerId?: Uint8Array | string;          // hex 40 chars ou Uint8Array(20)
  maxConns?: number;                      // default 55
  port?: number;                          // porta de origem (padrão 6881)
  useOPFS?: boolean;                      // padrão true; fallback em memória
  rtcConfig?: RTCConfiguration;           // repassado a RTCPeerConnection
  serviceWorkerUrl?: string;              // se fornecido, initServiceWorker() registra
  serviceWorkerScope?: string;            // default "/"
});
```

| Membro | Tipo | Descrição |
| --- | --- | --- |
| `peerId` | `string` (40 hex) | Peer ID oficial, derivado de `peerIdBuffer`. |
| `peerIdBuffer` | `Uint8Array(20)` | Forma binária. |
| `torrents` | `Map<string, Torrent>` | Torrents ativos indexados por infoHash. |
| `torrentList` | `Torrent[]` | Array na ordem de adição. |
| `server` | `WebTorrentServer \| null` | Servidor de streaming (ver Fase 4.5). |
| `isReady` | `boolean` | true quando inicializou. |
| `isDestroyed` | `boolean` | true após `destroy()`. |
| `torrentCount` | `number` | `torrents.size`. |

#### Métodos

| Método | Retorno | Descrição |
| --- | --- | --- |
| `add(torrentId, opts?)` | `Promise<Torrent>` | Adiciona torrent (magnet / buffer .torrent / ParsedTorrent). |
| `remove(infoHash, destroyStore?)` | `Promise<void>` | Remove torrent. Se `destroyStore`, apaga o OPFS. |
| `destroy(callback?)` | `Promise<void>` | Encerra tudo (swarms, torrents, servidor, OPFS). |
| `createServer({ controller?, scope? })` | `WebTorrentServer` | Cria o servidor de streaming via SW.  Idempotente. |
| `initServiceWorker()` | `Promise<ServiceWorker \| null>` | Registra o SW se `serviceWorkerUrl` foi configurado. |

#### Eventos

| Evento | Payload | Quando |
| --- | --- | --- |
| `torrent` | `{ torrent: Torrent }` | Após `add()`. |
| `error` | `{ error: Error }` | Erro fatal em swarm/tracker. |
| `ready` | `Event` | Inicialização completa. |

---

### Classe `Torrent`

```ts
const torrent = await client.add("magnet:?xt=urn:btih:...");
```

#### Propriedades

| Nome | Tipo | Descrição |
| --- | --- | --- |
| `infoHash` | `string` (40 hex) | SHA-1 do dicionário `info`. |
| `name` | `string` | Nome amigável; pode atualizar via `setMetadata` (magnet). |
| `files` | `ParsedTorrentFile[]` | `path`, `name`, `length`, `offset`. |
| `length` | `number` | Tamanho total em bytes. |
| `pieceLength` | `number` | Tamanho de cada peça. |
| `numPieces` | `number` | Quantidade de peças. |
| `lastPieceLength` | `number` | Tamanho da última peça (pode ser menor). |
| `progress` | `number` (0..1) | Razão `downloaded / length`. |
| `downloaded` | `number` | Bytes baixados e verificados. |
| `uploaded` | `number` | Bytes enviados. |
| `ready` | `boolean` | true após `_init`. |
| `destroyed` | `boolean` | true após `destroy`. |

#### Métodos

| Método | Retorno | Descrição |
| --- | --- | --- |
| `setMetadata(infoBuffer)` | `Promise<boolean>` | Injeta `info` bencoded (usado pelo `ut_metadata`). |
| `receivePiece(index, buf)` | `Promise<boolean>` | Valida e armazena uma peça recebida. |
| `getPiece(index)` | `Promise<Uint8Array \| null>` | Recupera uma peça do store. |
| `destroy(destroyStore?)` | `Promise<void>` | Encerra o torrent. |

#### Eventos

| Evento | Payload |
| --- | --- |
| `ready` | `Event` |
| `metadata` | `{ files, length, name }` |
| `download` | `{ bytes }` |
| `upload` | `{ bytes }` |
| `done` | `Event` |
| `verified` | `{ index }` |
| `error` | `{ error }` |

---

### Classe `File`

```ts
const file = torrent.files[0]; // ou torrent.files.find(f => f.name.endsWith(".mp4"))
```

#### Propriedades

| Nome | Tipo | Descrição |
| --- | --- | --- |
| `length` | `number` | Tamanho em bytes. |
| `name` | `string` | Nome (basename). |
| `path` | `string` | Apelido para `name` (compat com `webtorrent.min.js`). |
| `infoHash` | `string` (injetado) | Identificador do torrent. |
| `fileIndex` | `number` (injetado) | Posição dentro do torrent. |
| `scope` | `string` (injetado) | SW scope para `streamURL`. |

#### Métodos

| Método | Retorno | Descrição |
| --- | --- | --- |
| `streamURL()` | `string` | URL virtual do SW para streaming. **Requer infoHash+fileIndex**. |
| `streamTo(element)` | `void` | Atribui `src` ao elemento (`<video>`, `<audio>`, `<img>`) e revoga a URL em `ended`. |
| `createReadStream()` | `ReadableStream<Uint8Array>` | Stream de bytes (Fase 4.1 — em construção). |
| `stream()` | `ReadableStream<Uint8Array>` | Apelido para `createReadStream`. |
| `arrayBuffer()` | `Promise<ArrayBuffer>` | Lê o arquivo inteiro em memória. |
| `blob()` | `Promise<Blob>` | Materializa como `Blob`. |
| `getBlobURL()` | `Promise<string>` | `URL.createObjectURL(blob)`. |
| `select()` / `deselect()` | `void` | Marca/desmarca para seleção de peças. |
| `includes(piece)` | `boolean` | `true` se a peça se sobrepõe ao arquivo. |
| `Symbol.asyncIterator` | `AsyncIterable<Uint8Array>` | Itera em chunks. |

#### Eventos

| Evento | Payload |
| --- | --- |
| `stream` | `ReadableStream` |
| `iterator` | `AsyncIterable<Uint8Array>` |
| `done` | `void` |

---

### Classe `WebTorrentServer` (Fase 4.5)

```ts
import { createServer } from "@vanaware/browsertorrent";

const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
await navigator.serviceWorker.ready;

const server = client.createServer({ controller: reg.active! });
await server.sendReadyAck();

// No <video>:
const file = torrent.files[0];
file.streamTo(document.querySelector("video"));
```

| Membro | Tipo | Descrição |
| --- | --- | --- |
| `scope` | `string` | SW scope (`/`, `/app/`, …). |
| `isReady` | `boolean` | true após `sendReadyAck()`. |
| `isDestroyed` | `boolean` | true após `destroy()`. |
| `sendReadyAck()` | `Promise<boolean>` | Posta `WEBTORRENT_ACK` no SW. |
| `handleRequest(msg, port)` | `Promise<Response>` | Chamado pelo main-thread bridge. |
| `destroy()` | `void` | Fecha transporte e libera ports. |

---

### `streamManager` e helpers (`src/server/stream-manager.ts`)

```ts
import {
  streamManager,
  buildStreamURL,
  parseStreamURL,
} from "@vanaware/browsertorrent";
```

| Função | Assinatura | Descrição |
| --- | --- | --- |
| `streamManager.register(infoHash, fileIndex, file)` | `void` | Adiciona entrada no registro global. |
| `streamManager.unregister(infoHash, fileIndex)` | `void` | Remove uma entrada. |
| `streamManager.unregisterTorrent(infoHash)` | `void` | Remove todas as entradas do torrent. |
| `streamManager.get(infoHash, fileIndex)` | `StreamEntry \| undefined` | Lookup. |
| `streamManager.list()` | `StreamEntry[]` | Snapshot. |
| `streamManager.clear()` | `void` | Limpa tudo. |
| `buildStreamURL(scope, infoHash, fileIndex, name)` | `string` | Monta URL virtual. |
| `parseStreamURL(url, scope)` | `ParsedStreamURL \| null` | Faz parsing reverso com validação. |

---

### `Bitfield` (`src/core/bitfield.ts`)

```ts
import { Bitfield } from "@vanaware/browsertorrent";

const bf = new Bitfield(1024);
bf.set(42);
bf.get(42); // true

// A partir de bytes (com validação de spare-bits)
const bf2 = Bitfield.fromBytes(new Uint8Array([0b10101010]), 8);
```

| Membro | Tipo | Descrição |
| --- | --- | --- |
| `length` | `number` | Quantidade de peças. |
| `get(i)` | `boolean` | Estado da peça `i`. |
| `set(i)` | `void` | Marca a peça `i`. |
| `unset(i)` | `void` | Desmarca. |
| `count()` | `number` | Quantidade marcada. |
| `toBuffer()` | `Uint8Array` | Snapshot do buffer interno. |
| `static fromBytes(buf, length, opts?)` | `Bitfield` | Cria a partir de bytes; valida spare-bits. |

---

### `peerid` utils (`src/utils/peerid.ts`)

```ts
import {
  generateBrowserTorrentPeerId,
  decodePeerId,
  BT_PEER_ID_PREFIX,
  isAzStyle,
  isShadowStyle,
  isBase32Char,
  isBase32,
  isHex,
  isSha1,
  getPeerIdClientName,
  encodeAzStyle,
  encodeShadowStyle,
  encodeGeneric,
} from "@vanaware/browsertorrent";
```

| Função | Descrição |
| --- | --- |
| `generateBrowserTorrentPeerId()` | Gera Peer ID oficial BrowserTorrent (`-BT0100-…`). |
| `decodePeerId(input)` | Decodifica qualquer Peer ID Azureus/Shadow em `ClientInfo`. |
| `getPeerIdClientName(input)` | Nome legível do cliente (`qBittorrent`, `BitTornado`, …). |
| `encodeAzStyle(code, version)` | Codifica estilo Azureus. |
| `encodeShadowStyle(code, version)` | Codifica estilo Shadow. |
| `encodeGeneric(code, version, style)` | Despacha para o encoder correto. |
| `isAzStyle(id)` / `isShadowStyle(id)` | Validação de formato. |
| `isBase32Char(c)` / `isBase32(s)` | Validação base32. |
| `isHex(s)` / `isSha1(s)` | Validação hex/SHA-1. |

---

### `parseTorrent` (`src/utils/parse-torrent.ts`)

```ts
import { parseTorrent } from "@vanaware/browsertorrent";

const parsed = await parseTorrent("magnet:?xt=urn:btih:…");
const parsed2 = await parseTorrent(new Uint8Array([...])); // .torrent
const parsed3 = await parseTorrent(parsed); // idempotente
```

Retorna um `ParsedTorrent` com `infoHash`, `infoHashBuffer`, `name`, `pieceLength`, `length`, `files`, `pieces`, `announce`, `info`.

---

### `Swarm`, `Peer`, `Wire`

Reexportados de `src/network/swarm.ts`, `src/network/peer.ts`, `src/core/wire.ts`.  Usados internamente pelo `Torrent`; podem ser consumidos pela UI para diagnostics, mas a API pública recomendada é a do `Torrent`/`File`.

---

### `UtMetadata`, `UtPexExtension`

Reexportados de `src/extensions/ut-metadata.ts` e `src/extensions/ut-pex.ts`.  Encapsulam as extensões BEP 9 e BEP 10/BEP 11.

---

### Erros (`src/utils/errors.ts`)

| Classe | Código de uso |
| --- | --- |
| `BitfieldError` | Erros em `Bitfield` (length inválido, spare-bits não-zero, etc.). |
| `WireError` | Erros no protocolo. |
| `TrackerError` | Erros de tracker. |
| `PeerError` | Erros de peer. |
| `TorrentError` / `TorrentParseError` | Erros de torrent. |
| `PeerWireError` | Base para erros do wire. |
| `ProtocolError` | Violação de protocolo. |
| `EofError` | Conexão fechada prematuramente. |
| `TimeoutError` | Deadline excedido. |
| `RequestRejectedError` | BEP 6 fast extension — peça rejeitada. |

---

## 🧪 Resumo de testes

| Suite | Testes | Cobre |
| --- | --- | --- |
| `bencode_test.ts` | 34 | Parser/encoder Bencode. |
| `bit-array_test.ts` | … | BitArray utility. |
| `bitfield_test.ts` | 5 | `Bitfield.fromBytes` + spare-bits. |
| `byte-io_test.ts` | … | Leitura/escrita binária. |
| `buffer-extended_test.ts` | … | Buffer helper. |
| `chunk-store_test.ts` | … | OPFS + Memory stores. |
| `encoding_test.ts` | … | Helpers de encoding. |
| `errors_test.ts` | … | Taxonomia de erros. |
| `extension-host_test.ts` | … | Extension host. |
| `file_test.ts` | 6 | `File` ctor, `includes`, `streamURL`, `streamTo`. |
| `handshake_test.ts` | … | Handshake BitTorrent. |
| `hasher_test.ts` | … | SHA-1, SHA-256. |
| `magnet_test.ts` | … | Magnet URI parser. |
| `message_test.ts` | … | Mensagens BEP 3. |
| `metainfo-parser_test.ts` | … | Parser de metainfo. |
| `mod_test.ts` | … | Smoke tests do `WebTorrent`. |
| `net_test.ts` | … | Utilitários de rede. |
| `parse-torrent_test.ts` | … | `parseTorrent`. |
| `peer_test.ts` | … | Peer (WebRTC). |
| `peerid_test.ts` | 12 | PeerID encoding/decoding. |
| `server_test.ts` | 18 | `createServer`, `handleRequest`, `InProcessTransport`, `guessContentType`. |
| `simple-buffer_test.ts` | … | Simple buffer. |
| `stream-manager_test.ts` | 13 | `StreamManager`, `buildStreamURL`, `parseStreamURL`. |
| `swarm_test.ts` | … | Swarm. |
| `torrent_test.ts` | … | Torrent. |
| `tracker_test.ts` | … | Tracker client. |
| `ut-metadata_test.ts` | … | BEP 9. |
| `ut-pex_test.ts` | … | BEP 11. |
| `utils_test.ts` | … | Utils. |
| `wire_test.ts` | 28 | Wire protocol. |
| **TOTAL** | **501** | Cobertura completa de todas as APIs públicas. |

---

## 📚 Roadmap de evolução

Fases concluídas:
- 3.4 (peerid), 3.5 (Bitfield.fromBytes), 4.1-4.4 (File básico), 4.5 (Service Worker bridge).

Próximas fases:
- 4.6-4.10 (Torrent.select/deselect/pause/resume/peers/properties/events).
- 4.11-4.13 (Client agregado, throttling, WEBRTC_SUPPORT).
- 4.14-4.15 (Web Seeds, Piece class).
- 5.x (Geração de .torrent, DHT, etc.).

Consulte `docs/04-fase-4-rede-e-protocolo.md` para o detalhamento arquitetural da Fase 4.

````

---

## Arquivo: `docs/browsertorrent/01-objetivo-e-apis-nativas.md`

```md
# /browsertorrent/monorepo/webtorrent/docs/01-objetivo-e-apis-nativas.md

# Objetivo do Pacote `@vanaware/browsertorrent` e Mapeamento de APIs Nativas

## 🎯 Objetivo do Projeto
O objetivo do pacote `@vanaware/browsertorrent` é fornecer uma implementação **pura, estritamente tipada e livre de dependências do Node.js** do protocolo BitTorrent, projetada especificamente para rodar no ambiente de navegador (Browser/Deno). 

No contexto do **BrowserTorrent PWA** (mensageiro descentralizado, offline-first e E2EE), este pacote permite:
1. **Compartilhamento descentralizado de arquivos** (ex: mídias, backups de chat) sem depender de servidores centrais de armazenamento.
2. **Streaming progressivo** de arquivos diretamente no browser, utilizando APIs nativas de mídia.
3. **Redução drástica do bundle size**, eliminando polyfills pesados como `Buffer`, `readable-stream`, `crypto-browserify` e `fs`.
4. **Persistência real offline** através do Origin Private File System (OPFS), permitindo que torrents sejam pausados e retomados entre sessões do navegador.

---

## 🌐 Mapeamento de APIs do Browser (Target & Restrictions)

Abaixo está a lista exaustiva das APIs nativas do browser que este pacote utiliza ou planeja utilizar, substituindo equivalentes do Node.js.

### 🔐 1. Criptografia e Segurança (WebCrypto API)
| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `crypto.subtle.digest()` | `crypto` (Node), `rusha`, `simple-sha1` | Cálculo de hashes SHA-1 (peças) e SHA-256 (infoHash v2). | ✅ **Implementado** |
| `crypto.getRandomValues()` | `randombytes`, `crypto.randomBytes` | Geração de `peerId`, `nodeId` e nonces criptográficos. | ✅ **Implementado** |

### 💾 2. Armazenamento e Persistência (Offline-First)
| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `Origin Private File System (OPFS)` | `fs`, `fs-chunk-store` | Armazenamento persistente de chunks de torrent isolados por `infoHash`. | ✅ **Implementado** |
| `IndexedDB` | N/A (ou `memory-chunk-store`) | Fallback de armazenamento ou metadados de sessão (planejado). | 🟡 Fallback em Memória |
| `navigator.storage.getDirectory()` | `path.join`, `os.tmpdir` | Obtenção da raiz do sistema de arquivos virtual do navegador. | ✅ **Implementado** |

### 📦 3. Manipulação de Dados Binários
| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `Uint8Array` / `DataView` | `Buffer` do Node.js | Manipulação de todos os dados binários (bencode, peças, hashes). | ✅ **Implementado** |
| `TextEncoder` / `TextDecoder` | `Buffer.toString()`, `Buffer.from()` | Conversão segura entre strings UTF-8 e bytes brutos. | ✅ **Implementado** |
| `ArrayBuffer.slice()` | N/A | Criação de cópias contíguas de buffers para satisfazer o type-checking rigoroso do Deno em APIs como WebCrypto e OPFS. | ✅ **Implementado** |

### 🌊 4. Streams e Processamento
| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `ReadableStream` / `WritableStream` | `readable-stream`, `stream` | Pipeline de dados para streaming de mídia e escrita em OPFS. | 🟡 Parcial (Chunk Store) |
| `Web Workers` | `worker_threads` | (Planejado) Cálculo de hashes em background para não bloquear a UI. | 🔜 Futuro |

### 📡 5. Rede e Comunicação
| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `RTCPeerConnection` / `RTCDataChannel` | `net`, `utp` | Transporte P2P de dados (WebTorrent no browser só suporta WebRTC). | 🔜 Núcleo (Wire/Peer) |
| `WebSocket` | `ws` | Conexão com trackers WebSocket (`wss://`). | 🔜 Núcleo (Tracker) |
| `fetch()` / `AbortController` | `http`, `https`, `simple-get` | Download de metadados via Web Seeds e requisições HTTP a trackers. | ✅ Parcial (Parse Torrent) |

### ⚠️ APIs Proibidas / Não Suportadas no Browser
- **TCP / uTP Sockets:** O navegador não permite conexões TCP brutas. O transporte será estritamente WebRTC (e WebSockets para trackers).
- **DHT (UDP):** A implementação completa de DHT via UDP não é possível no browser. Dependeremos de Trackers (HTTP/WS) e WebRTC Peer Exchange (ut_pex).
- **File System Access API (com path real):** Por questões de segurança, o browser não permite acesso arbitrário ao disco do usuário. Usamos exclusivamente o **OPFS** (sandboxed).

---

## 🏗️ Decisões Arquiteturais Chave
1. **Strict TypeScript (`noUncheckedIndexedAccess`):** O projeto é compilado com as flags mais rigorosas do Deno. Isso nos forçou a usar asserções de não-nulo (`!`) de forma consciente e a tratar `undefined` explicitamente, aumentando a robustez.
2. **Zero Polyfills:** Em vez de importar `buffer` ou `stream` do npm, criamos utilitários leves (`src/utils/buffer.ts`) que imitam apenas a superfície da API do `Buffer` que o protocolo BitTorrent realmente precisa, usando `Uint8Array` por baixo dos panos.
3. **Heurística de Decodificação Bencode:** O decoder Bencode foi aprimorado para distinguir automaticamente entre strings de texto legíveis (UTF-8) e dados binários brutos (como hashes SHA-1 de peças), retornando `string` ou `Uint8Array` conforme apropriado.
```

---

## Arquivo: `docs/browsertorrent/02-fase-2-metadata-discovery.md`

```md
# Fase 2: Metadata & Discovery (Magnet v2, Metainfo Rigoroso, Tracker)

## 🎯 Objetivo da Fase
Na Fase 2, substituímos os parsers minimalistas de magnet e metainfo por implementações robustas baseadas na referência do `deno-torrent/`. O foco foi:
- Suporte completo a BitTorrent v1 e v2 (BEP 52) em links magnéticos.
- Preservação fiel dos bytes do dicionário `info` para hashes corretos (BEP 9).
- Validação rigorosa de `.torrent` files (BEP 3/12/19/47/52).
- Tracker HTTP com percent-encoding byte-a-byte e peers compactos IPv4/IPv6.

---

## 🧲 1. Magnet Link (`src/utils/magnet.ts`)

Adaptado de `deno-torrent/magnet/magnet.ts`. Substituímos `@std/encoding/base32` e `@std/encoding/hex` por utilitários locais de `encoding.ts`. O parser usa um analisador de query-string customizado com limites de recursos (evita DoS via URI excessivamente longa).

### Decisões de Implementação
1. **Suporte v1 + v2**: decodifica `urn:btih:` (v1/SHA-1), `urn:btmh:1220...` (v2/SHA-256), e híbridos (ambos os `xt`).
2. **`handshakeHash`**: sempre 20 bytes — v1 usa o SHA-1 completo; v2 usa os primeiros 20 bytes do hash de 32 bytes.
3. **`infoHash`**: sempre 40 chars hex do handshakeHash — compatível com wire/tracker.
4. **Validação de recursos**: `maxLength` (1 MiB), `maxQueryParameters` (1024), `maxQueryParameterLength` (64 KiB).
5. **`buildMagnetV2`**: reconstrói URI magnética v2 com opções (nome, trackers, web seeds, peers, URL do torrent).
6. **`isValidMagnet`**: validação formal sem parsing completo.

### API Pública
- `parseMagnet(uri, opts?)`: `ParsedMagnet`
- `encodeMagnet(parsed)`: string
- `buildMagnetV2(hash, opts?)`: string
- `isValidMagnet(uri)`: boolean
- `isSha1Hex(str)`: boolean
- `isSha1Base32(str)`: boolean

---

## 📦 2. Metainfo Parser (`src/utils/metainfo-parser.ts`)

Adaptado de `deno-torrent/metainfo/parser.ts`. Parser rigoroso de buffers `.torrent` bencodeados. Valida BEP 3, 12, 19, 47 e 52 com erros tipados (`TorrentParseError`).

### Decisões de Implementação
1. **Uint8Array apenas**: browser-first, sem `Reader`/`IoUtil` do Deno.
2. **Map→Record**: decodifica com `useMap` para preservar chaves binárias de `piece layers`, depois normaliza para `Record`.
3. **Validação de campos**: `piece length`, `pieces`, `name`, caminhos (`isSafePathComponent` rejeita `..`/`.`/NUL).
4. **Limites**: `maxBytes` (16 MiB default), `maxPathLength`, `maxFileCount`.
5. **Rejeita BEP-3 com piece layers**: incompatibilidade de layout.

### API Pública
- `parseMetainfo(buffer, opts?)`: `ParsedTorrent`

---

## 🔗 3. Metainfo Identity (`src/utils/metainfo-identity.ts`)

Preserva os bytes exatos do dicionário `info` para cálculo fiel do infoHash (BEP 9). Resolve divergência da versão anterior que fazia `sha1(encode(info))`.

### Decisões de Implementação
1. **`infoBytes`**: bytes bencodeados exatos do `info` dict — base para hash fiel.
2. **`calculateInfoHashV2`**: SHA-256 do `info` dict para v2/hybrid.
3. **`wrapInfoBytes`**: encapsula bytes com contexto v2.
4. **`parseTorrentWithIdentity`**: integra identity ao parser.

---

## 📋 4. Tipos V2 (`src/utils/torrent-types.ts`)

Tipos TypeScript para metadados v2/hybrid, portados de `deno-torrent/metainfo/types.ts`.

### Tipos
- `TorrentV2Info`: `name`, `piece length`, `file tree`, `pieces root`
- `TorrentFileTree`: hierarquia de diretórios
- `PieceSizeEnum`: tamanhos de peça válidos
- `ParseTorrentOptions`: `maxBytes`, `allowMissingPieceLayers`

---

## 🔍 5. Parse-Torrent Unificado (`src/utils/parse-torrent.ts`)

Interface unificada que aceita: Magnet URI, infoHash hex/base32, ou buffer `.torrent`. Delega para `magnet.ts` (strings) ou `metainfo-parser.ts` + `metainfo-identity.ts` (buffers).

### Decisões de Implementação
1. **String**: se 40 hex chars ou 32 base32 → magnet URI; se startsWith `magnet:?` → parseMagnet.
2. **Uint8Array**: `parseTorrentWithIdentity` (rigoroso + faithful hash).
3. **ParsedTorrent**: retorna o objeto direto (idempotência).
4. **Campos novos opcionais**: `infoHashV2`, `infoBytes`, `torrentFileBytes`, `version`.
5. **Backward compatible**: `ParsedTorrentFile` (dados simples) preservado.

---

## 🌐 6. Tracker HTTP (`src/network/tracker.ts`)

Cliente HTTP tracker com percent-encoding byte-a-byte e peers compactos IPv4/IPv6. Substitui a versão anterior que usava `String.fromCharCode` (incorreto para bytes >0x7F).

### Decisões de Implementação
1. **`percentEncodeBytes`**: encode byte-a-byte (não UTF-8). Bytes >0x7F viram `%XX` literal.
2. **`buildAnnounceUrl`**: URLSearchParams com percent-encoding correto de hashes binários.
3. **`parseHttpTrackerResponse`**: decodifica compact IPv4 (6 bytes), IPv6 (18 bytes), dicionário peers.
4. **Deduplicação**: peers compactos deduped; porta 0 descartada.
5. **Validação**: `validateTrackerOptions` com limites (`MAX_NUM_WANT=2000`, `MAX_TRACKER_URL_LENGTH=8192`).
6. **Timeout**: `AbortController` com `DEFAULT_TIMEOUT_MS=15_000`.

### API Pública
- `createTracker(announceUrl, opts): Tracker`
- `HttpTracker.announce(opts?)`: `TrackerResponse`
- `buildAnnounceUrl(url, opts, extra?, trackerId?)`: `URL`
- `parseHttpTrackerResponse(buffer): TrackerResponse`
- `percentEncodeBytes(bytes): string`
- `validateTrackerOptions(url, opts, extra?): void`
- `integerInRange(value, name, min, max): number`

---

## ✅ Status dos Testes (Fase 2)

| Arquivo | Testes | Status |
|---|---|---|
| `tests/magnet_test.ts` | 38 testes | ✅ todos passando |
| `tests/metainfo-parser_test.ts` | 11 testes | ✅ todos passando |
| `tests/tracker_test.ts` | 28 testes | ✅ todos passando |
| `tests/parse-torrent_test.ts` | 6 testes | ✅ todos passando |
| **Total** | **83 testes** | ✅ 0 falhas |

---

## 📊 Paridade com deno-torrent (Fase 2)

| Módulo deno-torrent | src/utils | Estado |
|---|---|---|
| `magnet/magnet.ts` | `magnet.ts` | ✅ completo (v1+v2+build+validate) |
| `metainfo/parser.ts` | `metainfo-parser.ts` | ✅ completo (BEP 3/12/19/47/52) |
| `metainfo/identity.ts` | `metainfo-identity.ts` | ✅ completo (infoBytes, v2 hash) |
| `metainfo/types.ts` | `torrent-types.ts` | ✅ completo (TorrentV2Info, etc.) |
| `torrent-tracker/http.ts` | `tracker.ts` (HttpTracker) | ✅ completo (byte-exact encoding) |
| `torrent-tracker/compact.ts` | `tracker.ts` (parseCompactPeers) | ✅ completo (IPv4+IPv6 dedup) |
| `torrent-tracker/types.ts` | `tracker.ts` (types) | ✅ completo (formal types) |
| `torrent-tracker/request.ts` | `tracker.ts` (constants) | ✅ completo (MAX_NUM_WANT, etc.) |

---

## 🚀 Próximos Passos (Fase 3)
A Fase 3 focará em:
1. **Bitfield** com spare-bit validation (BEP 6)
2. **Peer ID** melhorado (encode genérico, validators, version converters)
3. **Wire** enhancements (BEP 6 Fast, BEP 52 v2 hashes)
4. **ExtensionHost** BEP 10 completo
5. **ut_metadata** melhorado (hash verify, pipelining)
```

---

## Arquivo: `docs/browsertorrent/02-fase-4-browser-api.md`

```md
# Fase 4: Browser API (webtorrent.min.js parity)

## 🎯 Objetivo da Fase
A Fase 4 reproduz a API pública do upstream `webtorrent.min.js` para o BrowserTorrent, sem regressão do que já existia.  Cada item abaixo referencia a matriz de paridade do `QWEN.md` (§5, "webtorrent.min.js API → src/").

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
1. **Leitura peça-a-peça**: `createReadStream` faz `pull` lazy no `ChunkStore` para cada bbrowsertorrent de `blockSize` (default 64 KiB).
2. **Range relativo**: `createReadStream({ start, end })` é relativo ao arquivo (`start=0` é o primeiro byte do arquivo, não do torrent).
3. **Cross-piece reads**: `_readBlock` lida com bytes que cruzam fronteiras de peça, retornando a fatia exata pedida.
4. **Backpressure real**: cada `pull` lê um bbrowsertorrent e o enfileira; o consumidor (ex: SW) controla o ritmo.
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

```

---

## Arquivo: `docs/browsertorrent/02-fase-5-opfs-generator.md`

````md
# Fase 5.3: OPFS-backed Torrent Generator

## 🎯 Objetivo da Fase
A Fase 5.3 substitui o gerador de `.torrent` baseado em `Deno.open`/`Deno.stat` do
`deno-torrent/torrent-generator` por uma versão browser-native que opera inteiramente
sobre **OPFS** (`Origin Private File System`).  Isso permite criar torrents diretamente
no browser, sem nenhuma syscall de filesystem.

---

## 📁 Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `src/torrent-generator/types.ts` | Tipos: `Writer`, `PieceSizeEnum`, `OPFSFileEntry`, `GeneratorOptions`, `PieceFile`, `Torrent` |
| `src/torrent-generator/opfs-walker.ts` | `walkOPFSDir()` — varredura recursiva de `FileSystemDirectoryHandle` |
| `src/torrent-generator/opfs-reader.ts` | `OPFSMultiFileReader` — leitura sequencial cross-file via `File.slice()` |
| `src/torrent-generator/util.ts` | Funções puras: `calcPieceSize`, `buildPieceFiles`, `sha1sum`, `fileSizeSum`, `isHiddenFile`, `getDefaultCreatedBy` |
| `src/torrent-generator/generator.ts` | `generateTorrent()` — orquestrador completo |
| `src/torrent-generator/mod.ts` | Barrel file com todas as exportações públicas |
| `tests/torrent-generator_test.ts` | **37 testes** cobrindo todas as funções |

---

## 🔧 Substituição de Primitivos Deno → Browser

A tabela abaixo mostra os 4 primitivos Deno que foram substituídos:

| Deno (original) | Browser (implementação) | Local |
|---|---|---|
| `Deno.stat(path).size` | `FileSystemFileHandle.getFile().size` | `opfs-walker.ts` |
| `Deno.open(path)` → `FsFile.read()` | `FileSystemFileHandle.getFile().slice(start, end).arrayBuffer()` | `opfs-reader.ts` |
| `@std/fs/walk()` | `FileSystemDirectoryHandle.values()` (BFS) | `opfs-walker.ts` |
| `git describe --tags` | hardcoded `"browsertorrent-torrent-generator@1.0.0"` | `util.ts` |

---

## 📦 API Pública

### `generateTorrent(options: GeneratorOptions): Promise<void>`

Gera um `.torrent` e escreve os bytes bencoded em `options.writer`.

**Parâmetros de `GeneratorOptions`:**

```ts
interface GeneratorOptions {
  writer: Writer;                         // sink para os bytes bencoded
  entry: FileSystemDirectoryHandle | OPFSFileEntry[];  // fonte dos arquivos
  pieceSize?: PieceSizeEnum | number;    // SIZE_AUTO (default) ou preset
  ignoreHiddenFile?: boolean;            // pula arquivos que começam com "."
  alignPiece?: boolean;                  // BEP-47: padding entre arquivos
  isPrivate?: boolean;                   // info.private = 1
  trackers?: readonly string[];           // BEP-12
  webSeeds?: readonly string[];          // BEP-19
  source?: string;
  comment?: string;
  createdBy?: string;
  createdAt?: number;
}
```

**Exemplo de uso:**

```ts
import { generateTorrent } from "@vanaware/browsertorrent/torrent-generator";

// Obter handle do diretório OPFS
const rootHandle = await navigator.storage.getDirectory();

// Popular o diretório com arquivos...
// await rootHandle.getFileHandle("video.mp4", { create: true })...

const chunks: Uint8Array[] = [];
await generateTorrent({
  entry: rootHandle,
  writer: {
    async write(p: Uint8Array) {
      chunks.push(p);
      return p.byteLength;
    },
  },
  trackers: ["udp://tracker.example.com:6969/announce"],
  webSeeds: ["https://seed.example.com/"],
  isPrivate: false,
  pieceSize: 512 * 1024, // SIZE_512KB
});

// Flatten chunks → Uint8Array → salvar como .torrent
const torrentBytes = new Uint8Array(chunks.reduce((a, b) => a + b.byteLength, 0));
```

---

## 🔢 `PieceSizeEnum` (presets BEP-3)

```ts
enum PieceSizeEnum {
  SIZE_AUTO = 0,   // heuristic: menor preset > tamanho total
  SIZE_16KB = 16 * 1024,
  SIZE_32KB = 32 * 1024,
  SIZE_64KB = 64 * 1024,
  SIZE_128KB = 128 * 1024,
  SIZE_256KB = 256 * 1024,
  SIZE_512KB = 512 * 1024,  // recomendado para arquivos grandes
  SIZE_1MB = 1024 * 1024,
  SIZE_2MB,
  SIZE_4MB,
  SIZE_8MB,
  SIZE_16MB,
}
```

---

## 🧩 Funções Exportadas

| Função | Pureza | Descrição |
|---|---|---|
| `generateTorrent(opts)` | ❌ | Orquestrador principal |
| `walkOPFSDir(root, ignoreHidden?)` | ❌ | Varredura recursiva de OPFS → `OPFSFileEntry[]` |
| `getOPFSFileSize(handle)` | ❌ | `FileSystemFileHandle.getFile().size` |
| `OPFSMultiFileReader(entries)` | ❌ | Leitura cross-file sequencial |
| `calcPieceSize(fileSize, pieceSizeEnum)` | ✅ | Seleciona preset de piece size |
| `fileSizeSum(entries)` | ✅ | Soma tamanhos de arquivos |
| `buildPieceFiles(entries, pieceSize)` | ✅ | Constrói stream BEP-47 (com padding) |
| `sha1sum(entries, pieceSize, alignPiece?)` | ❌ | SHA-1 streaming das peças |
| `isHiddenFile(name)` | ✅ | Detecta arquivos ocultos |
| `getDefaultCreatedBy()` | ✅ | `"browsertorrent-torrent-generator@1.0.0"` |
| `PieceSizeEnum` | ✅ | Enum de presets |

---

## ✅ Suporte a BEPs

| BEP | Suporte | Detalhes |
|---|---|---|
| **BEP-3** | ✅ | Ordenação por profundidade + lexicográfica |
| **BEP-12** | ✅ | `announce-list` com trackers ordenados |
| **BEP-19** | ✅ | `url-list` com web seeds ordenados |
| **BEP-47** | ✅ | `alignPiece: true` insere `.pad/<size>-<index>` |

---

## 🧪 Testes (37 novos, todos passando)

| Categoria | Testes | Status |
|---|---|---|
| `PieceSizeEnum` | 1 | ✅ |
| `calcPieceSize` | 3 | ✅ |
| `fileSizeSum` | 2 | ✅ |
| `isHiddenFile` | 2 | ✅ |
| `buildPieceFiles` | 4 | ✅ |
| `getDefaultCreatedBy` | 1 | ✅ |
| `OPFSMultiFileReader` | 5 | ✅ |
| `sha1sum` | 4 | ✅ |
| `walkOPFSDir` | 4 | ✅ |
| `getOPFSFileSize` | 1 | ✅ |
| `generateTorrent` (bencode) | 10 | ✅ |

**Total geral do pacote: 568 testes passando, 0 falhas.**

---

## 📝 Decisões de Implementação

1. **Mock de OPFS nos testes**: como OPFS não está disponível em Deno, todos os testes
   usam `buildMockDir()` — um builder recursivo de `FileSystemDirectoryHandle` mockados
   que simula `values()`, `getFileHandle()`, e navegação em sub-diretórios.

2. **Versão gerada**: `browsertorrent-torrent-generator@1.0.0` é hardcoded porque `git describe`
   não está disponível no browser.  Callers podem sobrescrever via `createdBy`.

3. **SHA-1 via `crypto.subtle`**: usa a API Web Crypto em vez de libs externas,
   compatível com browsers modernos (Chrome 37+, Firefox 34+, Safari 11+).

4. **Single-file vs multi-file**: detectada automaticamente quando `entry` é um array
   de `OPFSFileEntry` com zero barras no nome (single) vs múltiplos arquivos/pastas.

5. **`inferRootName`**: quando `entry` é um array pré-populado (sem handle de
   diretório), o nome raiz é inferido do prefixo comum dos paths dos arquivos.

````

---

## Arquivo: `docs/browsertorrent/02-modulos-e-funcoes-implementadas.md`

```md
# Módulos e Funções Implementadas (Fases 1 a 5)

Este documento cataloga todas as funções, classes e tipos que foram implementados, refatorados e validados por testes unitários no pacote `@vanaware/browsertorrent`.

---

## 🛠️ 1. Utilitários Básicos (`src/utils/`)

### `buffer.ts`
Helpers para manipulação de `Uint8Array`, substituindo o `Buffer` do Node.js com foco em performance e compatibilidade com o protocolo BitTorrent.
- `alloc(size: number): Uint8Array` - Cria um array preenchido com zeros.
- `from(input, encoding): Uint8Array` - Cria um array a partir de string (hex/utf8), array ou ArrayBuffer.
- `concat(arrays, totalLength?): Uint8Array` - Concatena múltiplos arrays de forma eficiente.
- `toString(buf, encoding, start, end): string` - Converte fatias do buffer para string hex ou utf8.
- `equals(a, b): boolean` - Comparação byte a byte de dois buffers.
- `readUInt32BE(buf, offset): number` - Leitura de inteiro sem sinal de 32 bits (Big-Endian).
- `writeUInt32BE(buf, value, offset): void` - Escrita de inteiro sem sinal de 32 bits (Big-Endian).

### `event-target.ts`
Substituto tipado para o `EventEmitter` do Node.js, utilizando a API nativa `EventTarget` do browser.
- `class TypedEventTarget<Events>` - Classe base genérica.
  - `on(type, listener)` - Registra um listener.
  - `once(type, listener)` - Registra um listener que se remove após a primeira execução.
  - `off(type, listener)` - Remove um listener.
  - `emit(type, detail?)` - Dispara um evento com dados tipados.

---

## 🔐 2. Criptografia (`src/crypto/`)

### `hasher.ts`
Wrapper para a API nativa `crypto.subtle` do browser/Deno.
- `sha1(data: Uint8Array): Promise<string>` - Calcula o hash SHA-1 (usado para verificação de peças e infoHash v1).
- `sha256(data: Uint8Array): Promise<string>` - Calcula o hash SHA-256 (para infoHash v2 e extensões futuras).

### `random.ts`
Geração de números aleatórios criptograficamente seguros.
- `randomBytes(size: number): Uint8Array` - Gera um array de bytes aleatórios.
- `generateId(): string` - Gera um ID de 40 caracteres hexadecimais (usado para `peerId` ou `nodeId`).

---

## 📦 3. Protocolo e Parsing (`src/utils/`)

### `bencode.ts`
Implementação pura de Bencode (Encoder/Decoder) com suporte a tipos recursivos e BigInt.
- **Tipos:** `BencodeValue` (string | number | bigint | Uint8Array | BencodeList | BencodeDict).
- `decode(data: Uint8Array): BencodeValue` - Parser de descida recursiva com heurística para distinguir strings UTF-8 de dados binários (verifica caracteres de controle como `\x00`).
- `encode(data: BencodeValue): Uint8Array` - Codificador que garante a ordenação lexicográfica das chaves dos dicionários.

### `magnet.ts`
Parser e codificador de URIs Magnéticas.
- `parseMagnet(uri: string): ParsedMagnet` - Extrai `infoHash` (hex e buffer), `trackers`, `webSeeds`, `name`, etc. Suporta decodificação nativa de Base32 para Hex.
- `encodeMagnet(parsed: Omit<ParsedMagnet, "magnetUri">): string` - Reconstrói a URI magnética a partir de um objeto.

### `parse-torrent.ts`
Parser unificado que aceita múltiplos formatos de entrada e retorna uma estrutura padronizada.
- `parseTorrent(torrentId: string | Uint8Array | ParsedTorrent): Promise<ParsedTorrent>`
  - Se for `string` (Magnet ou InfoHash): Retorna metadados básicos (arquivos desconhecidos até o handshake).
  - Se for `Uint8Array` (Arquivo .torrent): Decodifica o Bencode, calcula o `infoHash` via SHA-1 do dicionário `info`, e extrai a lista de arquivos, tamanhos, offsets e trackers.

---

## 💾 4. Armazenamento (Chunk Stores) (`src/storage/`)

Implementam a interface compatível com `abstract-chunk-store`, permitindo troca transparente entre memória e disco.

### `memory-chunk-store.ts`
Fallback em memória para ambientes onde o OPFS não está disponível ou para testes.
- `class MemoryChunkStore`
  - `get(index, opts?, cb?)` - Recupera um chunk. Suporta `offset` e `length` para fatiamento.
  - `put(index, buf, cb?)` - Armazena um chunk, validando o tamanho esperado.
  - `close(cb?)` / `destroy(cb?)` - Limpa o mapa de chunks da memória.

### `opfs-chunk-store.ts`
Armazenamento persistente utilizando o **Origin Private File System (OPFS)** do navegador.
- `class OPFSChunkStore`
  - Construtor aceita `rootDir: FileSystemDirectoryHandle` para isolamento por `infoHash`.
  - `get(index, opts?, cb?)` - Lê o arquivo `<index>.chunk` do OPFS.
  - `put(index, buf, cb?)` - Escreve o chunk no OPFS usando `FileSystemWritableFileStream`.
  - `close(cb?)` - Fecha a referência ao diretório.
  - `destroy(cb?)` - Deleta todos os arquivos `.chunk` dentro do diretório do torrent.

---

## 🧠 5. Núcleo BitTorrent (`src/core/`)

### `bitfield.ts`
Estrutura de dados ultra-eficiente para rastrear o estado de peças (pieces).
- `class Bitfield`
  - `constructor(length: number)` - Inicializa com o número de peças.
  - `get(index: number): boolean` - Verifica se a peça está marcada.
  - `set(index: number): void` - Marca a peça como completa.
  - `count(): number` - Conta quantas peças estão marcadas.
  - `toBuffer(): Uint8Array` - Retorna uma cópia do buffer bruto.

### `wire.ts`
Implementação do Wire Protocol (BEP 3) sobre um transporte abstrato.
- `class Wire extends TypedEventTarget<WireEvents>`
  - `sendHandshake(infoHash, peerId, extensions)` - Envia o handshake do BitTorrent.
  - `sendChoke()`, `sendUnchoke()`, `sendInterested()`, `sendNotInterested()` - Controle de fluxo.
  - `sendHave(index)`, `sendBitfield(bitfield)` - Gerenciamento de peças.
  - `sendRequest(index, offset, length)`, `sendPiece(index, offset, block)` - Transferência de dados.
  - `sendExtended(extId, payload)` - Mensagens estendidas (BEP 10).
  - Eventos: `handshake`, `choke`, `unchoke`, `interested`, `have`, `bitfield`, `request`, `piece`, `extended`, `error`.

### `torrent.ts`
O "cérebro" do download. Orquestra o estado das peças, validação criptográfica e persistência.
- `class Torrent extends TypedEventTarget<TorrentEvents>`
  - `constructor(parsedTorrent, opts)` - Inicializa com metadados e opções (store, skipVerify).
  - `receivePiece(index, buf)` - Recebe um chunk, valida o SHA-1 e persiste no store.
  - `getPiece(index)` - Lê uma peça do store.
  - `destroy(destroyStore?)` - Destrói o torrent e libera recursos.
  - Getters: `ready`, `destroyed`, `downloaded`, `uploaded`, `progress`, `numPieces`, `lastPieceLength`.
  - Eventos: `ready`, `download`, `upload`, `done`, `verified`, `error`.

---

## 🌐 6. Rede e Protocolo (`src/network/`)

### `tracker.ts`
Cliente para descoberta de peers via HTTP e WebSocket.
- `createTracker(announceUrl, opts): Tracker` - Factory que retorna `HttpTracker` ou `WsTracker`.
- `class HttpTracker` - Usa `fetch()` com `AbortController` para timeout.
- `class WsTracker` - Usa `WebSocket` nativo e JSON para comunicação.
- `announce(event?)` - Envia announce para o tracker e retorna lista de peers.
- `destroy()` - Fecha a conexão com o tracker.

### `peer.ts`
Gerenciador de conexão P2P via WebRTC.
- `class Peer extends TypedEventTarget<PeerEvents>`
  - `constructor(opts)` - Inicializa com `initiator`, `infoHash`, `peerId`, `wrtc?`.
  - `signal(data)` - Processa dados de sinalização (offer, answer, ICE candidates).
  - `destroy()` - Destrói a conexão e libera recursos.
  - Getter: `isReady` - Retorna `true` se conectado e com handshake completo.
  - Eventos: `signal`, `connect`, `handshake`, `close`, `error`.

### `swarm.ts`
Orquestrador de múltiplas conexões P2P para um torrent.
- `class Swarm extends TypedEventTarget<SwarmEvents>`
  - `constructor(opts)` - Inicializa com `infoHash`, `peerId`, `announce`, `maxConns?`, `wrtc?`.
  - `start()` - Inicia a descoberta de peers via trackers.
  - `addPeer(addr)` - Adiciona um peer manualmente (respeita `maxConns`).
  - `removePeer(addr)` - Remove um peer ativo.
  - `pause()` / `resume()` - Controla a conexão com novos peers.
  - `destroy()` - Destrói o swarm e todas as conexões.
  - Eventos: `peer`, `wire`, `error`, `warning`, `trackerAnnounce`, `noPeers`.

---

## 🔗 7. Extensões (`src/extensions/`)

### `ut-metadata.ts`
Extensão ut_metadata (BEP 9) para troca de metadados de torrent.
- `class UtMetadata extends EventTarget`
  - `constructor(wire, opts?)` - Inicializa com o Wire e metadata opcional.
  - `onExtendedHandshake(handshake)` - Processa o handshake estendido e inicia o download.
  - `onMessage(buf)` - Processa mensagens ut_metadata recebidas.
  - `fetch()` - Inicia o download do metadata.
  - `cancel()` - Cancela o download.
  - `setMetadata(metadata)` - Define o metadata localmente (para servir a outros peers).
  - Eventos: `metadata`, `warning`.

---

## ✅ Status dos Testes
Todos os módulos acima possuem suítes de testes correspondentes na pasta `/tests/`, validando:
- Codificação/Decodificação roundtrip.
- Manipulação correta de tipos (especialmente a distinção entre string e Uint8Array no Bencode).
- Validação de tamanhos de chunks e tratamento de erros.
- Conformidade com o type-checking rigoroso do Deno 2.x.
- **Total: 66 testes passando (✅)**

---

## 🚀 Próximos Passos (Fase 6: API Pública)

A próxima fase é criar a **API Pública Principal** (`src/mod.ts`), que une todos esses módulos em uma interface limpa e pronta para ser consumida pelo BrowserTorrent PWA. A API deve ser compatível com o WebTorrent original, expondo métodos como:
- `client.add(torrentId, opts)` - Adiciona um torrent (Magnet URI ou .torrent)
- `client.seed(input, opts)` - Compartilha um arquivo como seed
- `client.createServer()` - Cria um servidor HTTP para streaming (usando Service Worker)
- `torrent.files` - Lista de arquivos do torrent
- `torrent.files[0].getBlobURL()` - Gera uma URL para streaming de vídeo
```

---

## Arquivo: `docs/browsertorrent/03-fase-3-nucleo-torrent.md`

```md
# /browsertorrent/monorepo/webtorrent/docs/03-fase-3-nucleo-torrent.md

# Fase 3: O Núcleo BitTorrent (Torrent & Bitfield)

## 🎯 Objetivo da Fase
Nesta fase, construímos o "cérebro" do cliente BitTorrent. O objetivo foi criar a estrutura de dados que gerencia o estado do download, a validação criptográfica das peças (pieces) e a integração com o sistema de armazenamento (Chunk Store), preparando o terreno para a comunicação com a rede (Fase 4).

---

## 🧠 1. Gerenciador de Bitfield (`src/core/bitfield.ts`)

O `Bitfield` é uma estrutura de dados ultra-eficiente usada para rastrear quais peças do torrent já foram baixadas e verificadas. Em vez de usar um array de booleanos (que consumiria muita memória para torrents com milhares de peças), usamos um `Uint8Array` onde cada bit representa uma peça.

### Decisões Arquiteturais
- **Operações Bitwise**: Utilizamos deslocamento de bits (`>>`, `&`) para mapear o índice da peça para o byte e a posição do bit dentro desse byte. Isso garante performance O(1) para leitura e escrita.
- **Algoritmo de Contagem**: O método `count()` usa uma variação do *Brian Kernighan's algorithm* para contar bits `1` de forma extremamente rápida, iterando apenas sobre os bits ativos, e não sobre o buffer inteiro.
- **Imutabilidade Externa**: O método `toBuffer()` retorna uma *cópia* (`.slice()`) do buffer interno, evitando que módulos externos corrompam acidentalmente o estado do bitfield.

---

## 🌪️ 2. A Classe Torrent (`src/core/torrent.ts`)

A classe `Torrent` é o orquestrador central. Ela não sabe *como* o dado é salvo (OPFS vs Memória) nem *de onde* o dado vem (WebRTC vs WebSeed), mas garante que qualquer dado recebido seja válido antes de ser persistido.

### Decisões Arquiteturais
1. **Eventos Tipados (`TypedEventTarget`)**: Substituímos o `EventEmitter` do Node.js por um wrapper nativo do browser (`EventTarget`) com tipagem estrita para os payloads dos eventos (`ready`, `download`, `done`, `verified`, `error`).
2. **Getters Computados**: Propriedades como `progress` e `downloaded` não são variáveis de estado que precisam ser sincronizadas manualmente. Elas são calculadas em tempo real a partir do `Bitfield` e dos metadados do `ParsedTorrent`, eliminando bugs de estado inconsistente.
3. **Inicialização Assíncrona Diferida (`queueMicrotask`)**: O construtor não bloqueia a thread principal. A verificação de peças existentes no `ChunkStore` (para retomar downloads pausados via OPFS) é agendada para a próxima microtask. Isso dá tempo para o código chamador registrar listeners (ex: `torrent.on('ready', ...)`) antes que os eventos sejam disparados.
4. **Validação Criptográfica Rigorosa**: Antes de marcar uma peça como "completa" no bitfield, o método `receivePiece` calcula o SHA-1 do buffer recebido e o compara com o hash esperado no `ParsedTorrent.pieces`. Se houver divergência, a peça é rejeitada (protegendo a rede contra dados corrompidos ou maliciosos).

### Fluxo de Recebimento de uma Peça (`receivePiece`)
1. Verifica se a peça já foi baixada (idempotência).
2. Calcula o SHA-1 do buffer recebido via `crypto.subtle`.
3. Compara com o hash esperado.
4. Se válido, persiste no `ChunkStore` (`store.put`).
5. Atualiza o `Bitfield` e os contadores de bytes baixados.
6. Emite os eventos `verified`, `download` e, se for a última peça, `done`.

---

## ✅ 3. Testes Implementados (`tests/torrent_test.ts`)
Validamos o ciclo de vida completo do núcleo:
- Inicialização e emissão do evento `ready`.
- Recebimento de peça válida (atualização do bitfield e contadores).
- Rejeição de peça com hash inválido (proteção de integridade).
- Emissão do evento `done` ao completar 100% do torrent.
- Pulo de verificação (`skipVerify`) para otimização de downloads novos.

---

## 🚀 O que vem a seguir? (Fase 4)
Com o núcleo capaz de gerenciar estado e armazenamento, precisamos conectá-lo à rede. A Fase 4 focará em:
1. **Tracker Client**: Descoberta de peers via HTTP e WebSocket.
2. **Wire Protocol**: O protocolo de comunicação P2P (handshake, choking, requesting) sobre WebRTC.
3. **Swarm / Peer Manager**: Gerenciamento de múltiplas conexões e estratégias de seleção de peças (Rarest First).
```

---

## Arquivo: `docs/browsertorrent/04-fase-4-rede-e-protocolo.md`

```md
# /browsertorrent/monorepo/webtorrent/docs/04-fase-4-rede-e-protocolo.md

# Fase 4: Rede e Protocolo (Tracker, Wire, Service Worker Bridge)

## 🎯 Objetivo da Fase
Nesta fase, construímos os módulos responsáveis pela **descoberta de peers**, pela **comunicação P2P** e pelo **streaming de arquivos via Service Worker**. Como o navegador impõe restrições severas de segurança (sem acesso a sockets TCP/UDP brutos), adaptamos o protocolo BitTorrent para funcionar exclusivamente sobre **WebRTC** (para dados), **WebSocket/HTTP** (para trackers) e **MessageChannel + Service Worker fetch** (para servir bytes ao `<video>`/`<audio>` do DOM), mantendo a compatibilidade com a especificação oficial (BEPs) e com a API do `webtorrent.min.js` original.

---

## 🧠 Decisões Arquiteturais Críticas

1. **Zero Sockets TCP/UDP**: O browser não permite conexões diretas a IPs e portas de peers tradicionais. A descoberta depende 100% de Trackers (HTTP/WS) e de Peer Exchange (ut_pex) via WebRTC.
2. **Abstração de Transporte (`Transport`)**: O `Wire` (protocolo) e o `WebTorrentServer` (streaming) não devem saber se estão rodando sobre um `RTCDataChannel`, um mock de teste ou um `ServiceWorker` real. Eles recebem uma interface simples (`send`, `onMessage`, `close` / `postMessage`, `requestStream`), garantindo testabilidade unitária sem levantar servidores reais.
3. **Parser de Stream (Acumulador de Buffer)**: Dados chegam em pedaços arbitrários (chunks) pela rede, especialmente no WebRTC, que pode fragmentar mensagens. O `Wire` mantém um `buffer` interno (`Uint8Array`) e acumula os chunks até ter o tamanho completo de uma mensagem.
4. **Uso de `DataView` e Helpers Nativos**: Substituímos completamente o `Buffer` do Node.js. Usamos nossos helpers `readUInt32BE` e `writeUInt32BE` (baseados em `Uint8Array` e operações bitwise) para ler e escrever os cabeçalhos das mensagens de forma performática e nativa.
5. **Streaming via Service Worker com backpressure**: A ponte com o `<video>` do DOM passa por um Service Worker que intercepta requisições `GET` para URLs virtuais do tipo `/webtorrent/<infoHash>/<idx>/<name>`. O main thread responde com `MessageChannel` em modo *pull* (cada `true` enviado pelo SW puxa o próximo bbrowsertorrent), garantindo backpressure real sem sobrecarregar a rede.

---

## 📡 1. Tracker Client (`src/network/tracker.ts`)

O Tracker é o serviço que diz "quem mais está baixando este torrent?". Implementamos suporte nativo a **HTTP/HTTPS** e **WebSocket**, ignorando UDP (inviável no browser).

### Decisões de Implementação
- **HTTP Tracker (Fetch API)**:
  - Utiliza `fetch()` nativo com `AbortController` para timeout (15s).
  - **Codificação Binária na URL**: O protocolo BitTorrent exige que `info_hash` e `peer_id` sejam enviados como bytes brutos na URL, não como strings UTF-8 codificadas. Implementamos um helper `encodeBinary` que converte `Uint8Array` para caracteres de byte único, satisfazendo a especificação sem depender de bibliotecas externas.
  - Decodifica a resposta Bencode e extrai a lista de peers no formato **compact** (6 bytes por peer: 4 de IP + 2 de porta), que é o padrão mais eficiente.
- **WebSocket Tracker**:
  - Essencial para o WebTorrent no browser, pois permite a troca de ofertas SDP (Session Description Protocol) para estabelecer conexões WebRTC diretamente através do tracker.
  - Utiliza a API nativa `WebSocket` e JSON para comunicação (diferente do HTTP, que usa Bencode).
  - Mantém um mapa de `pendingRequests` para correlacionar respostas assíncronas com as promises de `announce()`.
- **Factory Pattern**: A função `createTracker(url, opts)` retorna a instância correta (`HttpTracker` ou `WsTracker`) baseada no protocolo da URL, isolando a lógica de conexão e facilitando testes.

---

## 🔌 2. Wire Protocol (`src/core/wire.ts`)

O Wire Protocol é a "língua" que os peers falam entre si, definida na BEP 3. Ele gerencia o handshake, controle de fluxo e transferência de peças.

### Decisões de Implementação
- **Extensão de `TypedEventTarget`**: Substituímos o `EventEmitter` do Node.js por um wrapper nativo do browser (`EventTarget`) com tipagem estrita para os payloads dos eventos, garantindo segurança de tipos em todo o fluxo de dados.
- **Mensagens Suportadas (BEP 3)**:
  - **Handshake**: Troca de `infoHash` (20 bytes), `peerId` (20 bytes) e extensões (8 bytes).
  - **Controle de Fluxo**: `choke`, `unchoke`, `interested`, `not-interested`.
  - **Gerenciamento de Peças**: `have` (notificação de peça recebida), `bitfield` (mapa de todas as peças), `request` (pedido de bbrowsertorrent), `piece` (dados do bbrowsertorrent), `cancel`.
  - **Extensões (BEP 10)**: `extended` (preparado para `ut_metadata`, `ut_pex`, etc.).
- **Parser de Buffer Acumulador**:
  - O método `_onData(chunk)` acumula os dados recebidos em `this.buffer`.
  - O método `_processBuffer()` verifica continuamente se há mensagens completas no buffer.
  - Lê os 4 primeiros bytes para obter o `length` da mensagem.
  - Se `length === 0`, é um Keep-Alive.
  - Caso contrário, aguarda até que `this.buffer.length >= 4 + length`, extrai o `msgId` e o `payload`, processa a mensagem e remove os bytes processados do buffer (usando `subarray` para evitar cópias desnecessárias de memória).

---

## 🌐 3. Service Worker Bridge — Streaming de arquivos (`src/server/`)

Esta é a parte do BrowserTorrent que substitui (e estende) o `createServer` do `webtorrent.min.js` original.  O objetivo é entregar bytes do `ChunkStore` para elementos `<video>`/`<audio>`/`<img>` do DOM **enquanto o download ainda está em andamento**, sem nunca precisar de um servidor Node.js ou de uma URL `http://` pré-conhecida.

### 3.1. Anatomia do problema

O `webtorrent.min.js` original tem um método `client.createServer({ controller })` que, ao receber um `ServiceWorker` controller, instala uma "ponte" entre o main thread e o SW:

1. O main thread posta `WEBTORRENT_READY` no SW.  O SW flipa uma flag `isWebTorrentReady = true`.
2. Quando o `<video>` faz `GET /webtorrent/<infoHash>/<idx>/<name>`, o SW intercepta no `fetch` event e, em vez de buscar da rede, abre uma `MessageChannel` e envia `{ type: "webtorrent", url, method, headers, scope, destination }` para o main thread.
3. O main thread responde com `{ body: "STREAM" }` e passa a emitir bytes sob demanda no `port1` da `MessageChannel`.
4. O SW encapsula esses bytes em um `ReadableStream` e devolve um `Response` ao `<video>`.  O `<video>` consome os bytes via MSE/`<source>` como se fosse um servidor HTTP normal.

O BrowserTorrent reproduz esse mesmo protocolo, mas com um diferencial: o transporte é **abstraído** numa interface `Transport`, o que permite testar todo o ciclo (incluindo backpressure, cancelamento e timeout) **sem subir um Service Worker real**.

### 3.2. Módulos

#### `src/server/stream-manager.ts`
- **`StreamManager`**: registro em memória que mapeia `(infoHash, fileIndex)` para `File`.  Usado pelo main thread para responder a requisições do SW.
- **`streamManager` (singleton)**: instância global partilhada por `WebTorrent` e `WebTorrentServer`.
- **`buildStreamURL(scope, infoHash, fileIndex, name)`**: monta a URL virtual `/<scope>webtorrent/<infoHash>/<idx>/<encodedName>`.
- **`parseStreamURL(url, scope)`**: parsing reverso com validação rigorosa (infoHash de 40 hex chars, `fileIndex` non-negative safe integer, nome URL-decodificado).

#### `src/server/server.ts`
- **`Transport` (interface)**: contrato com `postMessage` e `requestStream`.  Implementado por:
  - `createServiceWorkerTransport(controller, scope)` — produção, fala com `navigator.serviceWorker`.
  - `InProcessTransport` — usado pelos testes, registra mensagens e permite simular `WEBTORRENT_ACK` e chunks.
- **`WebTorrentServer`**: classe principal.  Mantém `scope`, `isReady`, `isDestroyed` e implementa:
  - `sendReadyAck()` — posta `{ type: "WEBTORRENT_ACK" }` no SW.
  - `handleRequest(message, port)` — devolve um `Response` com `ReadableStream` para a URL requisitada, ou `404`/`503` conforme o caso.
  - `destroy()` — fecha o transporte e libera os ports.
- **`buildFileStream(entry, port, transport)`**: cria o `ReadableStream<Uint8Array>` que materializa o arquivo em bbrowsertorrents de 16 KiB (configurável via `STREAM_BLOCK_SIZE`), aguardando `true` no `port` antes de emitir o próximo bbrowsertorrent (backpressure real).
- **`readNextChunk(file, offset, length)`**: helper que será substituído pelo `createReadStream()` real quando a Fase 4.1 entregar o I/O direto do `ChunkStore`; por enquanto, varre o `Symbol.asyncIterator` do `File`.
- **`guessContentType(name)`**: mapeia extensões comuns (mp4, webm, mp3, jpg, pdf, srt, vtt…) para MIME types apropriados; cai em `application/octet-stream` quando não reconhece.
- **`createServer({ controller, scope, transport })`**: factory pública compatível com `webtorrent.min.js`.  Se `controller` é passado, usa o `createServiceWorkerTransport`; se `transport` é passado, usa o fornecido (testes); caso contrário, cai num `InProcessTransport` (modo self-test).
- **`registerTorrentFiles(torrent, files)` / `unregisterTorrentFiles(infoHash)`**: helpers de manutenção do `streamManager`.  Chamados automaticamente por `WebTorrent.add` e `WebTorrent.remove` quando há um servidor ativo.

### 3.3. Integração com `WebTorrent` (`src/mod.ts`)

A classe `WebTorrent` agora expõe:

- `client.server`: a instância de `WebTorrentServer` (ou `null` se ainda não foi criado).
- `client.createServer({ controller, scope })`: cria o servidor e re-registra os torrents existentes.  Idempotente — chamar duas vezes devolve o mesmo objeto.
- `client.initServiceWorker()`: se `serviceWorkerUrl` foi fornecido em `WebTorrentOptions`, registra o SW, espera `navigator.serviceWorker.ready` e cria o servidor com o controller ativo.  Retorna `null` em ambientes sem SW (SSR, testes).
- `_makeFileObjects(torrent, scope)`: constrói instâncias de `File` já com `infoHash`, `fileIndex`, `name` e `scope` populados, de modo que `file.streamURL()` retorne a URL correta.
- Em `add()`: se `this.server` já existe, registra os arquivos novos.
- Em `remove()`: chama `unregisterTorrentFiles(infoHash)` para limpar o registro.
- Em `destroy()`: chama `server.destroy()` se existir.

### 3.4. URL virtual e `File.streamURL()`

`File.streamURL()` agora retorna a URL do SW, e `File.streamTo(video)` faz `video.src = streamURL()`.  Internamente, `File` carrega `infoHash`, `fileIndex`, `name` e `scope` — injetados pelo `WebTorrent` ao construir o objeto.  Se algum desses campos estiver ausente (caso o `File` seja construído manualmente, ex. em testes), o método lança um erro descritivo em vez de montar uma URL inválida.

### 3.5. Vantagens sobre o `webtorrent.min.js` original

| Aspecto | webtorrent.min.js | BrowserTorrent (`@vanaware/browsertorrent`) |
| --- | --- | --- |
| Acoplamento ao SW | Hard-coded em `webtorrent.min.js` | `Transport` injetável; testável sem SW |
| Cancelamento | Sends `false` on port | Idem + `controller.cancel()` no `ReadableStream` |
| Timeout | Hard-coded 5s | Configurável por transporte |
| MIME type | Apenas `Content-Type` básico | `guessContentType(name)` com 20+ extensões |
| Limpeza de registro | Manual | Automática em `add`/`remove`/`destroy` |
| Backpressure | Pull via `port.onmessage` | Idem + `pendingResolve`/`pendingSignal` abstrato |
| Testes | Poucos e dependentes de browser | `InProcessTransport` permite suite completa em Deno |

### 3.6. Testes (`tests/stream-manager_test.ts`, `tests/server_test.ts`)

- **`stream-manager_test.ts`** (13 testes): CRUD no registro, `unregisterTorrent`, `buildStreamURL` com encoding de caracteres especiais, `parseStreamURL` com validação de infoHash/fileIndex.
- **`server_test.ts`** (18 testes): `createServer` factory, `WebTorrentServer.destroy` idempotente, `handleRequest` retornando `404`/`503`/200 conforme o caso, `InProcessTransport` com fila de mensagens, `guessContentType` para 20+ formatos.

---

## 🌐 APIs Nativas do Browser Utilizadas

| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `fetch()` + `AbortController` | `http`, `https`, `simple-get` | HTTP trackers, web seeds, download de .torrent | ✅ **Implementado** |
| `WebSocket` | `ws` | Conexão com trackers WebSocket (`wss://`) | ✅ **Implementado** |
| `RTCPeerConnection` | `net`, `utp` | Transporte P2P de dados (WebTorrent no browser só suporta WebRTC) | ✅ **Implementado** |
| `RTCSessionDescription` | N/A | Handshake WebRTC (oferta/resposta SDP) | ✅ **Implementado** |
| `RTCIceCandidate` | N/A | Troca de candidatos ICE para NAT traversal | ✅ **Implementado** |
| `RTCDataChannel` | N/A | Canal de dados confiável sobre WebRTC (onde o Wire roda) | ✅ **Implementado** |
| `MessageChannel` | N/A | Backpressure pull-based entre SW e main thread para streaming | ✅ **Implementado** |
| `ServiceWorker` + `fetch` event | N/A | Interceptação de `/webtorrent/*` e entrega de bytes sob demanda | ✅ **Implementado** |
| `Uint8Array` / `DataView` | `Buffer` do Node.js | Manipulação de todos os dados binários do protocolo | ✅ **Implementado** |
| `navigator.storage.getDirectory` | `fs` do Node.js | OPFS para persistência de chunks entre sessões | ✅ **Implementado** |
| `crypto.subtle` | `crypto` do Node.js | SHA-1 / SHA-256 para verificação de peças | ✅ **Implementado** |
| `crypto.randomUUID` | `uuid` | IDs de correlação de request/response entre SW e main thread | ✅ **Implementado** |

---

## 🧪 Testes Implementados

### `tests/tracker_test.ts`
- Valida a factory `createTracker()` para HTTP e WebSocket.
- Testa o lançamento de erro para protocolos não suportados (ex: `udp://`).

### `tests/wire_test.ts`
- **MockTransport**: Cria um par de `Wire`s conectados em memória (loopback) para testar o protocolo sem rede real. O que um envia, o outro recebe instantaneamente via `queueMicrotask`.
- **Handshake**: Valida a troca correta de `peerId` e `infoHash`.
- **Mensagens**: Testa a emissão e recepção de `choke`, `unchoke`, `request` e `piece`.
- **Fragmentação**: Simula dados chegando em pedaços minúsculos (byte a byte) para validar a robustez do parser de stream acumulador.

### `tests/stream-manager_test.ts` (novo)
- CRUD no `streamManager` (registrar, remover, listar, limpar).
- `unregisterTorrent` remove apenas os arquivos do torrent alvo.
- `buildStreamURL` / `parseStreamURL` com edge cases (extensões com espaço, infoHash em maiúsculas, fileIndex inválido, scope divergente).

### `tests/server_test.ts` (novo)
- `createServer` factory em todos os modos (controller, transport, self-test).
- `WebTorrentServer.destroy` é idempotente.
- `handleRequest` retorna `404` para URL fora do padrão, `404` para arquivo não registrado, `503` quando destruído, `200` com headers corretos (`Content-Type` via `guessContentType`, `Content-Length`, `Accept-Ranges`) para arquivo registrado.
- `InProcessTransport` enfileira mensagens, suporta `deliverResponse` e `sendPull` para simular o SW.
- `guessContentType` cobre vídeo, áudio, imagem, documento e legendas.

---

## 🚀 Próximos Passos (Fase 5: Extensões e BEPs avançados)

Com a fundação do Tracker, Wire, Service Worker Bridge e Storage prontos e testados, os próximos passos cobrem:

1. **WebRTC Peer Manager completo** — suporte a ICE restart, trickle ICE, SDP munging para trackers.
2. **Extensão `ut_metadata` refinada** — handshake de metadata com fallback para BEP 9.
3. **Extensão `ut_pex` refinada** — sincronização incremental de listas de peers com filtro de `lastSeen`.
4. **Web Seeds (BEP 19)** — suporte a URLs HTTP/HTTPS como fonte adicional de peças.
5. **Piece class** — expor `length` e `missing` para a UI exibir progresso por peça.
6. **API de throttling** — `client.throttleDownload(bytesPerSec)` e `throttleUpload` para limitar banda agregada.
7. **Seed** — permitir que o BrowserTorrent compartilhe arquivos locais via `client.seed(file)`.

---

## 📚 Referências (BEPs)
- [BEP 3: The BitTorrent Protocol Specification](http://www.bittorrent.org/beps/bep_0003.html)
- [BEP 10: Extension Protocol](http://www.bittorrent.org/beps/bep_0010.html)
- [BEP 9: Extension for Peers to Send Metadata Files](http://www.bittorrent.org/beps/bep_0009.html) (`ut_metadata`)
- [BEP 11: Peer Exchange (PEX)](http://www.bittorrent.org/beps/bep_0011.html) (`ut_pex`)
- [BEP 19: WebSeed](http://www.bittorrent.org/beps/bep_0019.html)
- [MDN — Service Worker MessageChannel](https://developer.mozilla.org/en-US/docs/Web/API/Channel_Messaging_API)
- [WebTorrent Browser API](https://github.com/webtorrent/webtorrent/blob/master/docs/api.md#browser-usage)

```

---

## Arquivo: `docs/browsertorrent/05-fase-5-peer-webrtc.md`

````md
# Fase 5: Peer WebRTC (Conexão P2P no Browser)

## 🎯 Objetivo da Fase
Nesta fase, implementamos o **Peer Manager**, a classe que orquestra a conexão P2P via WebRTC entre dois peers do BitTorrent. Esta é a ponte entre o **Tracker** (que descobre peers) e o **Wire Protocol** (que fala BitTorrent).

No browser, não temos acesso a sockets TCP/UDP brutos. A única forma de estabelecer conexões P2P é via **WebRTC**, que usa uma combinação de:
- **RTCPeerConnection**: Gerencia a conexão P2P
- **RTCDataChannel**: Canal de dados confiável (onde o Wire roda)
- **ICE Candidates**: Endereços de rede para NAT traversal
- **SDP (Session Description Protocol)**: Negociação de capacidades

---

## 🏗️ Arquitetura do Peer

```
┌─────────────────────────────────────────────────────────────┐
│                        Peer Manager                          │
│  (src/network/peer.ts)                                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │ RTCPeerConnection│◄───────►│  RTCDataChannel  │          │
│  │   (WebRTC)       │         │   (Dados P2P)    │          │
│  └────────┬─────────┘         └────────┬─────────┘          │
│           │                            │                     │
│           │ signal()                   │ Transport           │
│           ▼                            ▼                     │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │   Tracker / SW   │         │  Wire Protocol   │          │
│  │  (Sinalização)   │         │  (BitTorrent)    │          │
│  └──────────────────┘         └──────────────────┘          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo de Conexão (Iniciador)
1. `new Peer({ initiator: true, ... })` → Cria `RTCPeerConnection`
2. Cria `RTCDataChannel` com nome "webtorrent"
3. Gera `offer` SDP → Emite evento `signal`
4. Tracker envia `offer` para o peer remoto
5. Peer remoto responde com `answer` SDP
6. Troca de `ICE candidates` via `signal()`
7. WebRTC estabelece conexão P2P (NAT traversal)
8. `DataChannel.onopen` → Cria `Wire` e envia handshake BitTorrent
9. Handshake BitTorrent recebido → Emite evento `handshake`
10. **Peer pronto para transferir peças!**

### Fluxo de Conexão (Não-Iniciador)
1. `new Peer({ initiator: false, ... })` → Cria `RTCPeerConnection`
2. Aguarda `offer` SDP via `signal()`
3. Gera `answer` SDP → Emite evento `signal`
4. Aguarda `RTCDataChannel` do peer remoto (`ondatachannel`)
5. Restante igual ao fluxo do iniciador

---

## 🔒 Mecanismos de Segurança e Robustez

### 1. Timeout de Conexão (25s)
Se a conexão WebRTC não estabelecer em 25 segundos, o peer é destruído. Isso evita que peers lentos ou maliciosos fiquem pendurados consumindo recursos.

```typescript
private _startConnectTimeout(): void {
  this.connectTimeoutId = setTimeout(() => {
    if (!this.connected && !this.destroyed) {
      this._onError(new Error(`WebRTC connection timeout after ${WEBRTC_CONNECT_TIMEOUT}ms`));
    }
  }, WEBRTC_CONNECT_TIMEOUT) as unknown as number;
}
```

### 2. Timeout de Handshake BitTorrent (25s)
Após a conexão WebRTC estabelecer, se o handshake do BitTorrent não ocorrer em 25 segundos, o peer é destruído. Isso evita peers que conectam mas não falam o protocolo.

### 3. Validação de InfoHash
Quando o handshake do BitTorrent chega, o `Wire` já valida internamente se o `infoHash` recebido bate com o esperado. Se não bater, o handshake falha e o peer é destruído.

### 4. Tratamento Granular de Estados WebRTC
- `connected`: Conexão estabelecida
- `failed`: **Fatal** → Destroi o peer
- `closed`: Conexão fechada → Destroi o peer
- `disconnected`: **Transitório** → Aguarda reconexão automática do WebRTC

### 5. Cleanup Defensivo no `destroy()`
- Pode ser chamado múltiplas vezes sem erro
- Limpa todos os timers
- Destrói o `Wire` ANTES do `DataChannel` (ordem correta)
- Remove todos os listeners
- Define `destroyed = true` para evitar operações pós-destruição

---

## 🧪 Testes

Os testes usam mocks de `RTCPeerConnection` e `RTCDataChannel` para simular o comportamento do WebRTC sem depender de um navegador real.

### Casos Testados
- ✅ Iniciador cria offer e DataChannel
- ✅ Não-iniciador aguarda DataChannel remoto
- ✅ `destroy()` é idempotente (pode ser chamado múltiplas vezes)
- ✅ Emite erro em falha de conexão
- ✅ `signal()` é ignorado após `destroy()`
- ✅ `isReady` retorna false antes do handshake

---

## 🔌 APIs Nativas Utilizadas

| API Nativa | Uso | Status |
|------------|-----|--------|
| `RTCPeerConnection` | Gerencia conexão P2P | ✅ Implementado |
| `RTCSessionDescription` | Handshake WebRTC (offer/answer) | ✅ Implementado |
| `RTCIceCandidate` | Troca de candidatos ICE | ✅ Implementado |
| `RTCDataChannel` | Canal de dados confiável | ✅ Implementado |

---

## 🚀 Próximos Passos (Fase 6: Swarm)

Com o Peer pronto, a próxima fase é implementar o **Swarm** (`src/network/swarm.ts`), que:
1. Gerencia múltiplos peers simultaneamente
2. Integra com o Tracker para descobrir peers
3. Repassa eventos do Wire para o Torrent
4. Implementa estratégias de choking/unchoke
5. Gerencia reconexão em caso de falhas

O Swarm será a camada que conecta o **Tracker** (descoberta) com o **Torrent** (lógica de download), orquestrando múltiplos **Peers** (conexões P2P).
````

---

## Arquivo: `docs/browsertorrent/05-fase-5-swarm-e-ut-metadata.md`

````md
# /browsertorrent/monorepo/webtorrent/docs/05-fase-5-swarm-e-ut-metadata.md

# Fase 5: Swarm Manager e Extensão ut_metadata

## 🎯 Objetivo da Fase
Nesta fase, implementamos as duas peças finais que tornam o WebTorrent funcional de ponta a ponta no browser:

1. **Swarm Manager**: Orquestra múltiplas conexões P2P simultâneas, gerenciando o ciclo de vida dos peers, limites de conexão e estratégias de reconexão.
2. **Extensão ut_metadata (BEP 9)**: Permite baixar o dicionário `info` (metadados do torrent) diretamente de outros peers, tornando os **Magnet URIs** totalmente funcionais sem necessidade de um servidor HTTP para buscar o arquivo `.torrent`.

---

## 🐝 1. Swarm Manager (`src/network/swarm.ts`)

O Swarm é o "gerente de tráfego" do BitTorrent. Ele conecta o **Tracker** (que descobre peers) ao **Torrent** (que gerencia o download), orquestrando múltiplas conexões P2P simultâneas.

### Decisões Arquiteturais

1. **Limite de Conexões (`maxConns`)**: Respeita o limite configurável (padrão: 55 conexões) para evitar sobrecarga de recursos. Peers além do limite são colocados em uma fila (`queue`) com tamanho máximo de 200.

2. **Reconexão Inteligente com Backoff Exponencial**: Quando um peer desconecta, o Swarm tenta reconectar com delays crescentes:
   - 1ª tentativa: 1 segundo
   - 2ª tentativa: 5 segundos
   - 3ª tentativa: 15 segundos
   - Após isso, o peer é descartado.

3. **Injeção de Dependência (`wrtc`)**: O construtor aceita um parâmetro opcional `wrtc: typeof RTCPeerConnection` para permitir testes unitários sem depender de um navegador real. Isso é crucial para testar a lógica de conexão em ambientes CI/CD.

4. **Eventos Tipados**: O Swarm emite eventos como `peer`, `wire`, `error`, `warning`, `trackerAnnounce` e `noPeers`, permitindo que a classe `Torrent` reaja a mudanças no estado da rede.

5. **Controle de Fluxo (`pause`/`resume`)**: Permite pausar a conexão com novos peers sem destruir as conexões existentes, útil para gerenciamento de banda ou quando o usuário pausa o download.

### Fluxo de Descoberta e Conexão

```
┌─────────────┐
│   Tracker   │
│  (HTTP/WS)  │
└──────┬──────┘
       │ announce() → Lista de peers
       ▼
┌─────────────────────────────────────┐
│         Swarm Manager               │
│  - Gerencia fila de peers           │
│  - Respeita maxConns                │
│  - Reconexão com backoff            │
└──────┬──────────────────────────────┘
       │ Para cada peer na fila
       ▼
┌─────────────┐
│    Peer     │
│  (WebRTC)   │
└──────┬──────┘
       │ Conexão estabelecida
       ▼
┌─────────────┐
│    Wire     │
│ (BitTorrent)│
└──────┬──────┘
       │ Handshake + ut_metadata
       ▼
┌─────────────┐
│   Torrent   │
│  (Download) │
└─────────────┘
```

### APIs Nativas Utilizadas

| API Nativa | Uso | Status |
|------------|-----|--------|
| `RTCPeerConnection` | Conexão P2P via WebRTC | ✅ Implementado |
| `RTCDataChannel` | Canal de dados confiável | ✅ Implementado |
| `setTimeout` / `clearTimeout` | Backoff de reconexão | ✅ Implementado |

---

## 🔗 2. Extensão ut_metadata (BEP 9)

A extensão `ut_metadata` é essencial para o BrowserTorrent, pois os usuários compartilharão **Magnet URIs** (que contêm apenas o `infoHash`), não arquivos `.torrent` completos. Esta extensão permite que um peer solicite o dicionário `info` de outro peer que já possui o torrent completo.

### Como Funciona (BEP 9)

1. **Handshake Estendido (BEP 10)**: Após o handshake do BitTorrent, os peers trocam um "extended handshake" informando quais extensões suportam. Se o peer remoto suporta `ut_metadata`, ele informa o `metadata_size` (tamanho do dicionário `info` em bytes).

2. **Divisão em Peças de 16KB**: O metadata é dividido em peças de 16384 bytes (16KB). Cada peça é solicitada individualmente via mensagem `request` (msg_type: 0).

3. **Resposta com Dados**: O peer que possui o metadata responde com uma mensagem `data` (msg_type: 1) contendo o dicionário Bencode seguido pelos bytes brutos da peça.

4. **Verificação de Integridade**: Após receber todas as peças, o cliente monta o metadata completo, calcula o SHA-1 do dicionário `info` e compara com o `infoHash` esperado. Se bater, o metadata é válido.

5. **Rejeição e Retry**: Se um peer rejeita o pedido (msg_type: 2), o cliente tenta novamente com outros peers. Há um limite de rejeições (`remainingRejects = 2 * numPieces`) para evitar loops infinitos.

### Decisões Arquiteturais

1. **EventTarget Nativo**: A classe `UtMetadata` estende `EventTarget` (nativo do browser) em vez de `EventEmitter` do Node.js, emitindo eventos como `metadata` e `warning` via `dispatchEvent`.

2. **Bitfield Nativo**: Usa nossa implementação nativa de `Bitfield` (`src/core/bitfield.ts`) para rastrear quais peças do metadata já foram recebidas, evitando dependências externas.

3. **Parsing Híbrido de Payload**: A mensagem `data` contém um dicionário Bencode seguido por dados binários brutos. Usamos uma heurística segura: procuramos pela sequência `"ee"` (101, 101 em ASCII) no `Uint8Array` para encontrar onde o dicionário termina e fatiar o buffer sem cópias desnecessárias.

4. **Verificação Assíncrona de Hash**: Como a API `crypto.subtle` do browser é assíncrona, a verificação do SHA-1 é feita de forma não-bloqueante, evitando travar a thread principal.

5. **Resiliência a Dados Inválidos**: O método `setMetadata` usa `try/catch` ao decodificar o metadata, permitindo que buffers inválidos (ex: em testes) não causem exceções não tratadas ou loops infinitos.

### Fluxo de Download de Metadata

```
┌─────────────────────────────────────────────────────────────┐
│                    Cliente A (Leech)                        │
│  - Tem apenas o infoHash (Magnet URI)                       │
│  - Precisa do dicionário 'info'                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ 1. Conecta via WebRTC
                           │ 2. Handshake BitTorrent
                           │ 3. Extended Handshake (BEP 10)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cliente B (Seed)                         │
│  - Tem o .torrent completo                                  │
│  - Informa: "Suporto ut_metadata, metadata_size = 50000"    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ 4. Cliente A: "Quero peça 0"
                           │ 5. Cliente B: "Aqui está peça 0"
                           │ 6. Repete para peças 1, 2, 3...
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cliente A (Leech)                        │
│  - Monta metadata completo                                  │
│  - Calcula SHA-1 do dicionário 'info'                       │
│  - Compara com infoHash esperado                            │
│  - Se bater: metadata válido! Inicia download das peças.    │
└─────────────────────────────────────────────────────────────┘
```

### APIs Nativas Utilizadas

| API Nativa | Uso | Status |
|------------|-----|--------|
| `EventTarget` | Emissão de eventos (`metadata`, `warning`) | ✅ Implementado |
| `TextEncoder` / `TextDecoder` | Conversão de bytes para string (parsing) | ✅ Implementado |
| `Uint8Array.set()` | Cópia de dados sem `.copy()` do Node.js | ✅ Implementado |
| `crypto.subtle.digest()` | Verificação SHA-1 do metadata | ✅ Implementado |

---

## 🧪 Testes Implementados

### `tests/swarm_test.ts`
- ✅ Inicialização com `infoHash` correto
- ✅ Respeito ao limite `maxConns` (peers excedentes vão para a fila)
- ✅ `pause()` previne novas conexões
- ✅ `destroy()` limpa todos os recursos (peers, trackers, fila)
- ✅ Peers duplicados são rejeitados

### `tests/ut-metadata_test.ts`
- ✅ Inicialização correta
- ✅ Processamento do extended handshake (solicita peças automaticamente)
- ✅ Rejeição de `metadata_size` inválido (negativo ou > 10MB)
- ✅ `setMetadata()` marca como completo e emite evento
- ✅ Resposta a requests de outros peers quando temos o metadata

---

## 🚀 Próximos Passos (Fase 6: API Pública)

Com o Swarm e o `ut_metadata` prontos, temos todas as peças do quebra-cabeça:
- ✅ **Utilitários**: Bencode, Buffer, Crypto, Magnet, Parse-Torrent
- ✅ **Armazenamento**: ChunkStore (OPFS/Memória)
- ✅ **Núcleo**: Torrent, Bitfield
- ✅ **Rede**: Tracker, Wire, Peer, Swarm
- ✅ **Extensões**: ut_metadata

A próxima fase é criar a **API Pública Principal** (`src/mod.ts`), que une todos esses módulos em uma interface limpa e pronta para ser consumida pelo BrowserTorrent PWA. A API deve ser compatível com o WebTorrent original, expondo métodos como:
- `client.add(torrentId, opts)` - Adiciona um torrent (Magnet URI ou .torrent)
- `client.seed(input, opts)` - Compartilha um arquivo como seed
- `client.createServer()` - Cria um servidor HTTP para streaming (usando Service Worker)
- `torrent.files` - Lista de arquivos do torrent
- `torrent.files[0].getBlobURL()` - Gera uma URL para streaming de vídeo

---

## 📚 Referências

- [BEP 9: Extension for Peers to Send Metadata Files](http://www.bittorrent.org/beps/bep_0009.html)
- [BEP 10: Extension Protocol](http://www.bittorrent.org/beps/bep_0010.html)
- [WebTorrent Browser API](https://github.com/webtorrent/webtorrent/blob/master/docs/api.md#browser-usage)



````

---

## Arquivo: `docs/browsertorrent/06-fase-6-api-final.md`

````md
# Fase 6 — API Final @vanaware/browsertorrent: Proposta de Implementação

> **Contexto:** Análise comparativa detalhada entre `@vanaware/browsertorrent` e `webtorrent.min.js`, identificando lacunas browser-aplicáveis e melhorias do `deno-torrent` a incorporar.

---

## 1. Resumo Executivo

A implementação atual do `@vanaware/browsertorrent` cobre **~75%** da API pública do `webtorrent.min.js`, com 568 testes passando. A análise identificou **22 lacunas browser-aplicáveis** no `webtorrent.min.js` e **15 melhorias** do `deno-torrent` ainda não portadas. Deste universo, a Fase 6 propõe implementar **13 capacidades de alta/média prioridade** que são viáveis no browser,afeitas de dependências Node/UDP, e que impactam diretamente a experiência do usuário do BrowserTorrent PWA.

---

## 2. Capacidades Prioritárias para Implementação

### 🟥 Críticos (Alta Prioridade)

#### 2.1 `client.seed(input, opts?, cb?)` — **CAPACIDADE CENTRAL**

**Por que é crítico:** É a另一半 do BitTorrent — sem seed, só baixamos. O `webtorrent.min.js` implementa isso nativamente e é uma das APIs mais usadas. A boa notícia: **já temos 100% do código necessário** — o `torrent-generator/` (Fase 5.3) implementa `generateTorrent()` com OPFS.

**Implementação necessária:**
1. Criar `src/client-seed.ts` — método `seed()` no `WebTorrent`
2. Aceitar inputs: `FileSystemFileHandle[]`, `FileSystemDirectoryHandle`, `File[]`, `Uint8Array`, `Blob`
3. Usar `generateTorrent()` internamente
4. Chamar `client.add()` com o `.torrent` resultante
5. Retornar a `Torrent` (ou chamar `cb` se fornecido)

```typescript
// Proposta de API
interface SeedOptions extends AddTorrentOptions {
  name?: string;
  pieceSize?: PieceSizeEnum | number;
  trackers?: string[];
  webSeeds?: string[];
  private?: boolean;
  comment?: string;
  createdBy?: string;
}

async seed(
  input: FileSystemFileHandle | FileSystemFileHandle[] | FileSystemDirectoryHandle | File | Blob | Uint8Array | { files: File[] },
  opts?: SeedOptions,
  cb?: (torrent: Torrent) => void
): Promise<Torrent>
```

**Estimativa:** 150–200 linhas de código (o generator já existe).

---

#### 2.2 Fix do Tracker HTTP — Encoding byte-a-byte + IPv6 + Deduplicação

**Por que é crítico:** O tracker HTTP é a porta de entrada de peers. Se o announce falhar por encoding errado, o torrent nunca encontra peers.

**Melhorias do deno-torrent a incorporar:**
1. **Encoding byte-a-byte:** `%XX` encoding correto para TODO byte não-ASCII — não usar `encodeURIComponent()` que codifica mais do que o necessário (espaços como `%20` em vez de `+`, parênteses, colchetes opcionais etc.)
2. **`parseCompactIpv6Peers`:** Suporte a peers IPv6 no response compact (BEP 7)
3. **`deduplicatePeers`:** Evitar peers duplicados no response
4. **`validateAnnounceRequest`:** Validar tamanhos de strings, bounds de integers

**Estimativa:** 100–150 linhas. Impacto: alta confiabilidade.

---

### 🟨 Alta Prioridade

#### 2.3 `WebTorrent.WEBRTC_SUPPORT` — Static boolean

**Implementação:** Deteção do ambiente:
```typescript
static readonly WEBRTC_SUPPORT: boolean =
  typeof RTCPeerConnection !== "undefined" &&
  typeof globalThis.RTCPeerConnection !== "undefined";
```

#### 2.4 Getters Agregados no Client

```typescript
// client.ts — adicionados em WebTorrent
get downloadSpeed(): number   // bytes/s soma de todos os torrents
get uploadSpeed(): number     // bytes/s soma de todos os torrents
get progress(): number        // 0..1 ponderado por tamanho
get ratio(): number           // uploaded/downloaded agregado
```

#### 2.5 `client.throttleDownload(rate)` / `client.throttleUpload(rate)`

```typescript
throttleDownload(rate: number): void  // rate em bytes/s, 0 = sem limite
throttleUpload(rate: number): void
```

Propaga para todos os `Wire` ativos via throttle nos writes.

#### 2.6 `torrent.torrentFile` (Uint8Array) + `torrent.torrentFileBlob` (Blob)

```typescript
get torrentFile(): Uint8Array   // .torrent bencoded bytes
get torrentFileBlob(): Blob     // new Blob([torrentFile])
```

**Implementação:** `encodeTorrent(parsed)` usando o generator internamente (sem OPFS, só o `Writer` em memória).

---

### 🟩 Média Prioridade

#### 2.7 Metadados de Torrent

```typescript
get created(): Date | undefined   // "creation date" do .torrent
get createdBy(): string | undefined
get comment(): string | undefined
get done(): boolean               // alias semântico de ready
get received(): number            // alias de downloaded
```

#### 2.8 `torrent.pieces[]` — Array de Piece objects

```typescript
get pieces(): Piece[]  // Em vez de só bitfield, expõe Piece[]
```

#### 2.9 `torrent.announce[]` + `torrent.maxWebConns`

```typescript
get announce(): string[]   // lista de todos os trackers
get maxWebConns(): number  // configurable, default 10
```

#### 2.10 `torrent.select(start, end, priority?, notify?)` — Assinatura completa

Adicionar `priority` (0–7) e `notify` (boolean) ao `select()` existente.

#### 2.11 `torrent.rescanFiles(cb?)`

Re-verifica todas as peças no store, úteis após manipulação externa do store.

#### 2.12 `file.type` (MIME detection)

```typescript
get type(): string  // ex: "video/mp4", "application/pdf"
```

Implementação: mapa de extensão → MIME type (extensão kecil → lookup table).

#### 2.13 `file.downloaded` + `file.progress` (por arquivo)

```typescript
get downloaded(): number   // bytes baixados deste arquivo específico
get progress(): number    // 0..1
```

#### 2.14 `file.on('download', bytes)` + `file.on('upload', bytes)` Eventos

Forward dos eventos do Torrent para cada File.

#### 2.15 `wire.uploadSpeed` / `wire.downloadSpeed` / `wire.remoteAddress` / `wire.remotePort`

```typescript
get uploadSpeed(): number    // bytes/s
get downloadSpeed(): number  // bytes/s
get remoteAddress(): string
get remotePort(): number
```

---

### 🟦 Melhorias do deno-torrent (importantes, não-críticas)

| # | Módulo deno-torrent | O que aporta | Dificuldade |
|---|---|---|---|
| 1 | `metainfo/identity.ts` | Preserva bytes exatos do `info` dict (sem re-encode), `calculateInfoHashV2` | Média |
| 2 | `metainfo/parser.ts` | `TorrentParseError` + validação rigorosa BEP 3/12/19/47/52 | Média |
| 3 | `metainfo/path.ts` | `isSafePathComponent` (rejeita `..`, NUL, path separators) | Trivial |
| 4 | `metainfo/types.ts` | `TorrentV2Info`, `TorrentFileTree` types | Baixa |
| 5 | `metainfo/v2.ts` | `flattenV2Files`, validação de piece layers v2 | Média |
| 6 | `peerwire/peer_wire.ts` | Correlação request/response Promise-based | Média |
| 7 | `peerwire/ut_metadata.ts` | Pipelining + per-block timeout nos metadata requests | Média |
| 8 | `peerid/peerid.ts` | `encodeAzStyle()`, `encodeShadowStyle()` | Trivial |
| 9 | `torrent-tracker/request.ts` | `validateAnnounceRequest` + limites | Baixa |
| 10 | `utp/` | uTP protocol (UDP) | **Não portar** (UDP indisponível no browser) |
| 11 | `torrent-dht/` | Kademlia DHT | **Postergar** (futuro relay WebRTC) |

---

## 3. O que NÃO Implementar

| Capacidade | Motivo |
|---|---|
| `DHT`, `utP`, `LSD`, `NAT-PMP`, `UPnP` | UDP/mDNS/TCP sockets indisponíveis no browser |
| `blocklist` (IP set) | Sem range `net` module |
| `path` (torrent save location) | Sem filesystem paths no browser |
| `client.get(torrentId)` | Trivial; `client.torrents.get(infoHash)` já existe |
| File advanced `stream` event com `req` callback | Sobrecarga desnecessária para o caso de uso do BrowserTorrent |

---

## 4. Estimativa de Esforço

| Fase | Escopo | Linhas estimadas | Testes estimados |
|---|---|---|---|
| **6.1** seed() | 1 novo arquivo + integração | ~200 | ~30 |
| **6.2** tracker HTTP fix | 1 arquivo | ~150 | ~20 |
| **6.3** WebRTC_SUPPORT + agregados + throttle | `mod.ts` | ~80 | ~10 |
| **6.4** torrentFile + metadados | `torrent.ts` | ~100 | ~15 |
| **6.5** file.type + downloaded + progress | `file.ts` | ~60 | ~10 |
| **6.6** wire speed + remote address | `wire.ts` | ~40 | ~5 |
| **6.7** metainfo improvements | `parse-torrent.ts` | ~120 | ~20 |
| **Total** | | **~750** | **~110** |

---

## 5. Ordem de Implementação Recomendada

```
6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7
```

**Justificativa:**
1. `seed()` primeiro — máxima visibilidade/impacto, o generator já existe
2. `tracker HTTP fix` segundo — sem peers, seed/download não funcionam
3. Aggregated getters + throttle terceiro — APIs pequenas e independentes
4. `torrentFile` + metadados quarto — extensiones do torrent já existente
5. `file.type` + per-file stats quinto — extensões do file já existente
6. `wire` speed/address sexto — extensões menores do wire
7. `metainfo` por último — robusta mas não bloqueia funcionalidades principais

````

---

## Arquivo: `docs/browsertorrent/06-fase-6-api-publica-e-integracao.md`

````md
# Fase 6: API Pública e Integração Final

## 🎯 Objetivo da Fase
Nesta fase final, unificamos todos os módulos construídos (Parsing, Core, Network e Extensões) em uma **API Pública Principal** (`src/mod.ts`). O objetivo é expor uma interface limpa, reativa e compatível com a API original do WebTorrent, permitindo que a UI do BrowserTorrent PWA (Preact + Signals) consuma o cliente de forma declarativa e segura.

Além disso, fechamos o ciclo crítico dos **Magnet URIs**, garantindo que o cliente possa iniciar um download "cego" e, dinamicamente, receber e processar os metadados (lista de arquivos, tamanhos, hashes) assim que a extensão `ut_metadata` os obtiver da rede.

---

## 🏗️ Arquitetura da API Pública

A classe principal `WebTorrent` atua como o orquestrador de alto nível. Ela gerencia o ciclo de vida de múltiplos torrents simultaneamente, abstraindo a complexidade do Swarm, do ChunkStore e do Wire Protocol.

```text
┌─────────────────────────────────────────────────────────────────┐
│                     BrowserTorrent PWA UI (Preact/Signals)                │
│  - Barra de progresso reativa                                   │
│  - Lista de arquivos dinâmica                                   │
│  - Botões de Play/Pause/Cancel                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ (Eventos: 'metadata', 'download', 'done')
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   WebTorrent (src/mod.ts)                       │
│  - Gerencia Map<string, Torrent> e Map<string, Swarm>           │
│  - Roteia eventos de metadados do Swarm para o Torrent          │
│  - Gerencia criação de OPFSChunkStore ou MemoryChunkStore       │
└──────────────┬──────────────────────────────┬───────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐      ┌───────────────────────────────┐
│      Torrent (Core)      │      │        Swarm (Network)        │
│ - Bitfield               │      │ - Tracker Client (HTTP/WS)    │
│ - Validação SHA-1        │◄─────│ - Peer Manager (WebRTC)       │
│ - setMetadata() dinâmico │      │ - ut_metadata (BEP 9)         │
└──────────────────────────┘      └───────────────────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐      ┌───────────────────────────────┐
│   ChunkStore (Storage)   │      │      Wire Protocol            │
│ - OPFS (Persistente)     │      │ - Handshake, Choke, Request   │
│ - Memory (Fallback/Test) │      │ - Piece, Extended (BEP 10)    │
└──────────────────────────┘      └───────────────────────────────┘
```

---

## 🔑 Decisões Arquiteturais Críticas

1. **Injeção Tardia de Metadados (`setMetadata`)**: 
   - Ao adicionar um Magnet URI, o `Torrent` é instanciado com `length: 0` e `files: []`. 
   - Quando o `Swarm` recebe o dicionário `info` via `ut_metadata`, ele emite um evento `metadata`.
   - O `WebTorrent` intercepta esse evento e chama `torrent.setMetadata(infoBuffer)`.
   - O `Torrent` decodifica o Bencode, atualiza `this.files`, `this.length`, `this.numPieces`, recria o `Bitfield` e emite o evento `metadata` para a UI. Isso permite que a interface mostre a lista de arquivos *antes* de qualquer peça ser baixada.

2. **Isolamento de Estado por InfoHash**: 
   - Tanto os `Torrents` quanto os `Swarms` são armazenados em `Map`s indexados pelo `infoHash`. Isso previne duplicidade e permite operações de limpeza (`remove`, `destroy`) O(1).

3. **Fallback Graceful de Armazenamento**: 
   - O método `_createChunkStore` tenta primeiro usar o **OPFS** (Origin Private File System) para persistência real entre sessões. Se a API `navigator.storage.getDirectory` não estiver disponível (ex: modo anônimo, navegador antigo), ele faz fallback silencioso para o `MemoryChunkStore`, garantindo que o app não quebre.

4. **Event-Driven UI**: 
   - Em vez de a UI fazer polling (`setInterval`), ela escuta eventos nativos (`torrent.on('download', ...)`, `torrent.on('metadata', ...)`). Isso se integra perfeitamente com os `Signals` do Preact, disparando re-renderizações apenas quando o estado muda.

---

## 📚 Referência da API Pública

### `class WebTorrent`

#### Construtor
```typescript
const client = new WebTorrent({
  peerId?: string,          // Opcional. Gerado automaticamente se omitido (40 chars hex).
  maxConns?: number,        // Opcional. Máximo de conexões P2P por torrent (padrão: 55).
  useOPFS?: boolean,        // Opcional. Habilita persistência no Origin Private File System (padrão: true).
});
```

#### Métodos
- `async add(torrentId: string | Uint8Array | ParsedTorrent, opts?: AddTorrentOptions): Promise<Torrent>`
  - Adiciona um torrent. Aceita Magnet URI, buffer de arquivo `.torrent` ou objeto parseado.
  - `opts.skipVerify`: Pula a verificação de peças existentes no store (útil para downloads novos).
- `async remove(infoHash: string, destroyStore: boolean = false): Promise<void>`
  - Remove o torrent do cliente. Se `destroyStore` for true, deleta os arquivos do OPFS.
- `async destroy(callback?: () => void): Promise<void>`
  - Destrói o cliente, fechando todos os torrents, swarms e conexões WebRTC.

#### Propriedades
- `torrents: Map<string, Torrent>` - Mapa de torrents ativos.
- `torrentList: Torrent[]` - Array de torrents ativos (para iteração fácil na UI).
- `isReady: boolean` - True quando o cliente foi inicializado.

### `class Torrent`

#### Propriedades (Reativas)
- `infoHash: string` - Hash identificador do torrent.
- `name: string` - Nome do torrent (atualizado dinamicamente em Magnet URIs).
- `files: ParsedTorrentFile[]` - Lista de arquivos (path, name, length, offset).
- `length: number` - Tamanho total em bytes.
- `progress: number` - Progresso do download (0.0 a 1.0).
- `downloaded: number` - Bytes baixados e verificados.
- `ready: boolean` - True quando o torrent está pronto para operar.
- `numPieces: number` - Número total de peças.

#### Eventos
- `'ready'`: Emitido quando o torrent é inicializado.
- `'metadata'`: Emitido quando os metadados são recebidos dinamicamente (crucial para Magnet URIs). Payload: `{ files, length, name }`.
- `'download'`: Emitido a cada peça validada. Payload: `{ bytes }`.
- `'done'`: Emitido quando o download atinge 100%.
- `'error'`: Emitido em caso de falha crítica.

---

## 💻 Exemplo de Integração com BrowserTorrent PWA (Preact + Signals)

```tsx
import { signal, effect } from "@preact/signals";
import { WebTorrent } from "@vanaware/browsertorrent";

// 1. Inicializa o cliente
const client = new WebTorrent({ useOPFS: true });
const currentTorrent = signal<Torrent | null>(null);
const progress = signal(0);
const files = signal<any[]>([]);

// 2. Função para adicionar um Magnet URI
async function startDownload(magnetUri: string) {
  const torrent = await client.add(magnetUri);
  currentTorrent.value = torrent;

  // 3. Reage a eventos do torrent
  torrent.on("metadata", (e: any) => {
    files.value = e.detail.files;
    console.log("Metadados recebidos! Arquivos:", files.value);
  });

  torrent.on("download", (e: any) => {
    progress.value = torrent.progress; // Atualiza o signal, disparando re-render na UI
  });

  torrent.on("done", () => {
    console.log("Download completo! Pronto para streaming ou compartilhamento.");
  });
}

// 4. Componente de UI (Exemplo simplificado)
function DownloadManager() {
  return (
    <div>
      {currentTorrent.value ? (
        <>
          <h3>{currentTorrent.value.name}</h3>
          <progress value={progress.value * 100} max="100" />
          <p>{(progress.value * 100).toFixed(1)}% Concluído</p>
          <ul>
            {files.value.map((f: any, i: number) => (
              <li key={i}>{f.name} ({(f.length / 1024 / 1024).toFixed(2)} MB)</li>
            ))}
          </ul>
        </>
      ) : (
        <p>Nenhum download ativo.</p>
      )}
    </div>
  );
}
```

---

## 🚀 Próximos Passos (Pós-Fundação)

Com a fundação do WebTorrent 100% testada e documentada, os próximos passos para o BrowserTorrent PWA são:

1. **Método `seed()`**: Implementar a capacidade de o cliente BrowserTorrent compartilhar arquivos locais (do OPFS ou da memória) com a rede, respondendo a requests de `ut_metadata` e `piece`.
2. **Streaming via Service Worker**: Implementar um Service Worker que intercepta requisições HTTP para URLs virtuais (ex: `http://localhost/torrent/{infoHash}/{fileIndex}`) e utiliza `MediaSource Extensions (MSE)` ou `Response` streams para entregar os dados do `ChunkStore` em tempo real, permitindo reprodução de vídeo/áudio *enquanto* o download ocorre.
3. **UI de Gerenciamento de Downloads**: Construir os componentes `beercss` para listar, pausar, retomar e excluir torrents, conectados aos Signals demonstrados acima.
4. **Testes de Integração E2E**: Criar testes que simulam dois clientes WebTorrent no mesmo ambiente (usando mocks de WebRTC) trocando metadados e peças de forma autônoma.

---

## 📊 Resumo do Projeto (Status Atual)

| Módulo | Status | Testes | Descrição |
|--------|--------|--------|-----------|
| `utils/bencode` | ✅ Completo | 11 | Parser/Encoder Bencode nativo com heurística de tipos. |
| `utils/magnet` | ✅ Completo | 9 | Parser e encoder de URIs magnéticas (Hex/Base32). |
| `utils/parse-torrent` | ✅ Completo | 6 | Unificação de entrada (Magnet, Buffer, Objeto) em `ParsedTorrent`. |
| `crypto/hasher` | ✅ Completo | 3 | Wrappers nativos para `crypto.subtle` (SHA-1, SHA-256). |
| `storage/*-chunk-store`| ✅ Completo | 7 | Abstração de armazenamento (OPFS persistente + Memória). |
| `core/bitfield` | ✅ Completo | N/A | Estrutura de dados bitwise para rastreamento de peças. |
| `core/wire` | ✅ Completo | 4 | Protocolo BitTorrent (BEP 3) com parser de stream acumulativo. |
| `network/tracker` | ✅ Completo | 3 | Cliente de descoberta de peers (HTTP e WebSocket). |
| `network/peer` | ✅ Completo | 4 | Gerenciador de conexão WebRTC (RTCPeerConnection/DataChannel). |
| `network/swarm` | ✅ Completo | 5 | Orquestrador de múltiplos peers com reconexão e backoff. |
| `extensions/ut-metadata`| ✅ Completo | 4 | Implementação BEP 9 para download dinâmico de metadados. |
| `core/torrent` | ✅ Completo | 8 | Cérebro do download com injeção tardia de metadados (`setMetadata`). |
| `mod.ts` (API Pública) | ✅ Completo | 7 | Classe `WebTorrent` unificada e pronta para consumo pela UI. |
| **TOTAL** | **✅ 100%** | **76** | **Fundação sólida, zero dependências do Node.js, 100% Deno/Browser.** |
````

---

## Arquivo: `docs/browsertorrent/07-api-final.md`

````md
# API Final @vanaware/browsertorrent v1.0

> **Status:** Snapshot pós-Fase 5.3, com roadmap de Fase 6 definido.
> **Foco:** Browser-first, sem Node.js, sem pacotes npm. Stack 100% nativo (Web APIs, TypedEventTarget, OPFS, W3C Streams, Service Worker).

---

## 1. Importação e Construtor

```typescript
import { WebTorrent, generateTorrent, Torrent, File, Piece } from "@vanaware/browsertorrent";

const client = new WebTorrent({
  peerId: undefined,            // Uint8Array(20) ou hex string — opcional
  maxConns: 55,                  // máximo de WebRTC peers por swarm
  useOPFS: true,                 // usar OPFS para persistência
  rtcConfig: { iceServers: [] }, // configuração ICE WebRTC
  serviceWorkerUrl: "/sw.js",    // URL do SW para streaming
  serviceWorkerScope: "/",       // escopo do SW
});
```

| Opção | Tipo | Default | Descrição |
|---|---|---|---|
| `peerId` | `Uint8Array \| string` | BrowserTorrent-BT0100-prefixed | Peer ID de 20 bytes |
| `maxConns` | `number` | `55` | Limite de conexões WebRTC |
| `port` | `number` | `6881` | Port hint (para peerwire) |
| `useOPFS` | `boolean` | `true` | Usar OPFS ChunkStore |
| `rtcConfig` | `RTCConfiguration` | `{}` | ICE servers, transports etc. |
| `serviceWorkerUrl` | `string` | — | URL do SW para streaming |
| `serviceWorkerScope` | `string` | `"/"` | Escopo de registro do SW |

---

## 2. `WebTorrent` (Client)

### 2.1 Static Members

| Membro | Tipo | Status | Descrição |
|---|---|---|---|
| `WebTorrent.WEBRTC_SUPPORT` | `boolean` | 🟢 Fase 6 | True se `RTCPeerConnection` existe |

### 2.2 Properties

| Property | Tipo | Descrição |
|---|---|---|
| `client.peerId` | `string` | 40-char hex |
| `client.peerIdBuffer` | `Uint8Array(20)` | bytes |
| `client.torrents` | `Map<string, Torrent>` | por infoHash |
| `client.torrentList` | `Torrent[]` | ordem de adição |
| `client.server` | `WebTorrentServer \| null` | servidor SW |
| `client.isReady` | `boolean` | inicializado |
| `client.isDestroyed` | `boolean` | destruído |
| `client.torrentCount` | `number` | `.torrents.size` |
| `client.downloadSpeed` | `number` 🟢 | bytes/s agregado |
| `client.uploadSpeed` | `number` 🟢 | bytes/s agregado |
| `client.progress` | `number` 🟢 | 0..1 ponderado |
| `client.ratio` | `number` 🟢 | uploaded/downloaded |

### 2.3 Methods

| Método | Assinatura | Status | Descrição |
|---|---|---|---|
| `add` | `add(torrentId, opts?): Promise<Torrent>` | 🟢 | Magnet, infoHash, ou .torrent bytes |
| `seed` | `seed(input, opts?, cb?): Promise<Torrent>` | 🟢 Fase 6 | Semear arquivos |
| `remove` | `remove(infoHash, destroyStore?): Promise<void>` | 🟢 | Remove torrent |
| `destroy` | `destroy(cb?): Promise<void>` | 🟢 | Destrói tudo |
| `get` | `get(torrentId): Torrent` | 🟢 (Map) | conveniência |
| `createServer` | `createServer({controller, scope?}): WebTorrentServer` | 🟢 | SW server + Range requests (206 Partial Content) |
| `initServiceWorker` | `initServiceWorker(): Promise<ServiceWorker \| null>` | 🟢 (extensão) | Registra SW |
| `throttleDownload` | `throttleDownload(rate: number)` | 🟢 Fase 6 | 0 = sem limite |
| `throttleUpload` | `throttleUpload(rate: number)` | 🟢 Fase 6 | 0 = sem limite |

### 2.4 Events

| Evento | Detail | Status |
|---|---|---|
| `'torrent'` | `{ torrent: Torrent }` | 🟢 |
| `'add'` | `{ torrent: Torrent }` | 🟢 v1.0 | dispara após torrent ser adicionado |
| `'remove'` | `{ torrent: Torrent }` | 🟢 v1.0 | dispara após torrent ser removido |
| `'error'` | `{ error: Error }` | 🟢 |
| `'ready'` | `Event` | 🟢 |

---

## 3. `Torrent`

### 3.1 Properties

| Property | Tipo | Status | Descrição |
|---|---|---|---|
| `name` | `string` | 🟢 | `info.name` |
| `infoHash` | `string` | 🟢 | hex 40 chars |
| `infoHashBuffer` | `Uint8Array(20)` | 🟢 | bytes |
| `magnetURI` | `string` | 🟢 | magnet gerado |
| `torrentFile` | `Uint8Array` | 🟢 Fase 6 | .torrent bencoded |
| `torrentFileBlob` | `Blob` | 🟢 Fase 6 | `new Blob([torrentFile])` |
| `announce` | `string[]` | 🟢 Fase 6 | lista de trackers |
| `files` | `ParsedTorrentFile[]` | 🟢 | arquivos do torrent |
| `pieces` | `Piece[]` | 🟡 Fase 6.4 | pieces, não só bitfield |
| `pieceLength` | `number` | 🟢 | bytes por piece |
| `lastPieceLength` | `number` | 🟢 | tamanho da última piece |
| `length` | `number` | 🟢 | tamanho total |
| `timeRemaining` | `number` | 🟢 | ms estimado |
| `received` | `number` | 🟢 Fase 6 | alias de `downloaded` |
| `downloaded` | `number` | 🟢 | bytes baixados |
| `uploaded` | `number` | 🟢 | bytes enviados |
| `downloadSpeed` | `number` | 🟢 | bytes/s |
| `uploadSpeed` | `number` | 🟢 | bytes/s |
| `progress` | `number` | 🟢 | 0..1 |
| `ratio` | `number` | 🟢 | uploaded/downloaded |
| `numPeers` | `number` | 🟢 | peers conectados |
| `maxWebConns` | `number` | 🟢 Fase 6 | configurable |
| `ready` | `boolean` | 🟢 | metadata recebida |
| `paused` | `boolean` | 🟢 | swarm pausado |
| `done` | `boolean` | 🟢 Fase 6 | `progress === 1` |
| `created` | `Date` | 🟢 Fase 6 | criação do .torrent |
| `createdBy` | `string` | 🟢 Fase 6 | criador do .torrent |
| `comment` | `string` | 🟢 Fase 6 | comentário |
| `destroyed` | `boolean` | 🟢 | |

### 3.2 Methods

| Método | Assinatura | Status | Descrição |
|---|---|---|---|
| `addPeer` | `addPeer(peer: Peer \| string)` | 🟢 | adiciona peer |
| `removePeer` | `removePeer(peer: Peer \| string)` | 🟢 | remove peer |
| `addWebSeed` | `addWebSeed(url)` | 🟢 | adiciona web seed |
| `removeWebSeed` | `removeWebSeed(url)` | 🟢 | remove web seed |
| `select` | `select(start?, end?, priority?, notify?)` | 🟢 Fase 6 | prioriza pieces |
| `deselect` | `deselect(start?, end?)` | 🟢 | desmarca pieces |
| `critical` | `critical(start?, end?)` | 🟢 | pieces críticas |
| `pause` | `pause()` | 🟢 | pausa swarm |
| `resume` | `resume()` | 🟢 | retoma swarm |
| `rescanFiles` | `rescanFiles(cb?)` | 🟢 Fase 6 | re-verifica store |
| `getPiece` | `getPiece(index): Promise<Uint8Array>` | 🟢 | lê piece do store |
| `destroy` | `destroy(destroyStore?)` | 🟢 | destrói torrent |
| `setMetadata` | `setMetadata(buf)` | 🟢 | define metadata recebido |

### 3.3 Events

| Evento | Detail | Status |
|---|---|---|
| `'infoHash'` | `{ infoHash: string }` | 🟢 |
| `'metadata'` | `{ metadata: Uint8Array }` | 🟢 |
| `'ready'` | `Event` | 🟢 |
| `'warning'` | `{ error: Error }` | 🟢 |
| `'error'` | `{ error: Error }` | 🟢 |
| `'idle'` | `Event` | 🟢 |
| `'done'` | `Event` | 🟢 |
| `'download'` | `{ bytes: number }` | 🟢 |
| `'upload'` | `{ bytes: number }` | 🟢 |
| `'wire'` | `{ wire: Wire }` | 🟢 |
| `'noPeers'` | `{ tracker: string }` | 🟢 |
| `'verified'` | `{ index: number }` | 🟢 |

---

## 4. `File`

### 4.1 Properties

| Property | Tipo | Status | Descrição |
|---|---|---|---|
| `name` | `string` | 🟢 | "movie.mp4" |
| `path` | `string` | 🟢 | path completo |
| `length` | `number` | 🟢 | bytes |
| `type` | `string` | 🟢 Fase 6 | MIME type |
| `downloaded` | `number` | 🟢 Fase 6 | per-file |
| `progress` | `number` | 🟢 Fase 6 | per-file 0..1 |
| `pieceLength` | `number` | 🟢 | |
| `offset` | `number` | 🟢 | no torrent |
| `infoHash` | `string` | 🟢 | |
| `fileIndex` | `number` | 🟢 | |
| `scope` | `string` | 🟢 | |
| `pieceRange` | `{ first, last }` | 🟢 | |
| `destroyed` | `boolean` | 🟢 | |

### 4.2 Methods

| Método | Retorno | Status | Descrição |
|---|---|---|---|
| `createReadStream(opts?)` | `ReadableStream<Uint8Array>` | 🟢 | W3C stream |
| `stream(opts?)` | `ReadableStream<Uint8Array>` | 🟢 | alias |
| `Symbol.asyncIterator` | `AsyncIterableIterator<Uint8Array>` | 🟢 | |
| `arrayBuffer(opts?)` | `Promise<ArrayBuffer>` | 🟢 v1.0 | aceita `{start, end}` (byte range) |
| `blob(opts?)` | `Promise<Blob>` | 🟢 v1.0 | aceita `{start, end}`, define MIME type |
| `getBlobURL()` | `Promise<string>` | 🟢 | `URL.createObjectURL` |
| `streamTo(elem)` | `void` | 🟢 | `<video>` / `<audio>` |
| `streamURL()` | `string` | 🟢 | URL do SW |
| `select()` / `deselect()` | `void` | 🟢 v1.0 | delega para owning torrent |
| `includes(piece)` | `boolean` | 🟢 | aceita `Piece` ou `number` (upstream parity) |
| `destroy()` | `void` | 🟢 | |

### 4.3 Events

| Evento | Detail | Status |
|---|---|---|
| `'stream'` | `ReadableStream` | 🟢 |
| `'iterator'` | `AsyncIterable` | 🟢 |
| `'done'` | `void` | 🟢 |
| `'error'` | `{ error: Error }` | 🟢 |
| `'download'` | `{ bytes: number }` | 🟢 Fase 6 |
| `'upload'` | `{ bytes: number }` | 🟢 Fase 6 |

---

## 5. `Piece`

| Property/Método | Tipo | Descrição |
|---|---|---|
| `index` | `number` | posição no torrent |
| `length` | `number` | tamanho da piece |
| `missing` | `boolean` | ainda não baixada |
| `verify(buf)` | `Promise<boolean>` | SHA-1 check |

---

## 6. `Wire`

| Property | Tipo | Status | Descrição |
|---|---|---|---|
| `peerId` | `string \| null` | 🟢 | 40-char hex |
| `peerIdBuffer` | `Uint8Array \| null` | 🟢 | 20 bytes |
| `type` | `string` | 🟢 v1.0 | `'webrtc'` (readonly, upstream parity) |
| `uploaded` | `number` | 🟢 | bytes enviados |
| `downloaded` | `number` | 🟢 | bytes recebidos |
| `uploadSpeed` | `number` | 🟢 Fase 6 | bytes/s |
| `downloadSpeed` | `number` | 🟢 Fase 6 | bytes/s |
| `remoteAddress` | `string` | 🟢 Fase 6 | IP |
| `remotePort` | `number` | 🟢 Fase 6 | port |
| `extensions` | `Record<string, unknown>` | 🟢 v1.0 | extensões remotas (upstream parity) |
| `extendedMapping` | `Record<number, string>` | 🟢 v1.0 | id→nome das ext. remotas |

**Methods:** `sendHandshake`, `sendChoke`, `sendUnchoke`, `sendInterested`, `sendNotInterested`, `sendHave`, `sendBitfield`, `sendRequest`, `sendPiece`, `sendCancel`, `sendKeepAlive`, `sendExtended`, `destroy`.

---

## 7. `Swarm`

| Property/Método | Tipo | Descrição |
|---|---|---|
| `infoHash` | `Uint8Array` | 20 bytes |
| `peerId` | `Uint8Array` | 20 bytes |
| `announce` | `string[]` | trackers |
| `maxConns` | `number` | limite |
| `wires` | `Wire[]` | conexões ativas |
| `paused` | `boolean` | |
| `start()` | `void` | inicia tracker announce |
| `addPeer(addr)` | `void` | |
| `removePeer(addr)` | `void` | |
| `pause()` / `resume()` | `void` | |
| `destroy()` | `void` | |

**Events:** `metadata`, `peer`, `wire`, `trackerAnnounce`, `noPeers`, `error`, `warning`.

---

## 8. `Peer`

| Property | Tipo | Descrição |
|---|---|---|
| `isReady` | `boolean` | handshake completo |
| `type` | `string` | `'webrtc'` |
| `id` | `string` | peer ID |
| `addr` | `string` | remote addr |

**Methods:** `signal(data)`, `destroy()`

**Events:** `signal`, `connect`, `handshake`, `close`, `error`.

---

## 9. Generator API (Fase 5.3)

```typescript
import { generateTorrent, OPFSMultiFileReader, PieceSizeEnum } from "@vanaware/browsertorrent";

const torrent = await generateTorrent(
  dirHandle,                              // FileSystemDirectoryHandle
  {
    name: "my-folder",
    pieceSize: PieceSizeEnum.AUTO,        // ou bytes
    announce: ["wss://tracker.example"],
    webSeeds: ["https://..."],
    private: false,
    alignPiece: true,                     // BEP-47 padding files
  },
  {
    onProgress: (i, total) => console.log(i / total),
  }
);
console.log(torrent.infoHash);  // 40-char hex
console.log(torrent.magnetURI); // magnet link
```

### Funções Exportadas

| Função | Descrição |
|---|---|
| `generateTorrent(input, opts, progressCb?)` | Gera torrent a partir de OPFS handle |
| `walkOPFSDir(root, ignoreHiddenFile?)` | AsyncIterator de OPFSFileEntry |
| `getOPFSFileSize(handle)` | Tamanho do arquivo (lida com directories) |
| `OPFSMultiFileReader` | Lê arquivos OPFS sequencialmente (chunk) |
| `buildPieceFiles(files, pieceSize)` | BEP-47 piece layout |
| `calcPieceSize(totalLength)` | AUTO piece size |
| `fileSizeSum(files)` | soma de tamanhos |
| `getDefaultCreatedBy()` | "browsertorrent-torrent-generator@1.0.0" |
| `isHiddenFile(name)` | começa com `.` |
| `sha1sum(data)` | hash SHA-1 via `crypto.subtle` |
| `PieceSizeEnum` | `AUTO` ou bytes |

---

## 10. Chunk Stores (Storage)

### `MemoryChunkStore`

```typescript
new MemoryChunkStore({ chunkLength, length })
```

### `OPFSChunkStore`

```typescript
const root = await navigator.storage.getDirectory();
const dir = await root.getDirectoryHandle("torrent-folder", { create: true });
new OPFSChunkStore({ chunkLength, length, rootDir: dir })
```

---

## 11. Utilities

| Função | Módulo | Descrição |
|---|---|---|
| `parseTorrent(id)` | `utils/parse-torrent.ts` | string/buffer → ParsedTorrent |
| `parseMagnet(uri)` | `utils/magnet.ts` | magnet → ParsedMagnet |
| `encodeMagnet(parsed)` | `utils/magnet.ts` | ParsedMagnet → magnet URI |
| `buildMagnetV2(hashHex, opts?)` | `utils/magnet.ts` | v2 (BEP 52) |
| `decode(buffer)` | `utils/bencode.ts` | bencode → object |
| `encode(object)` | `utils/bencode.ts` | object → bencode |
| `sha1(data)` | `crypto/hasher.ts` | SHA-1 hex |
| `sha256(data)` | `crypto/hasher.ts` | SHA-256 hex |
| `randomBytes(n)` | `crypto/random.ts` | Uint8Array |
| `generateId()` | `crypto/random.ts` | 40-char hex |
| `generateBrowserTorrentPeerId()` | `utils/peerid.ts` | `-BT0100-XXXXXXXXXX` |
| `scrapeTracker(url, infoHashes, opts?)` | `network/tracker.ts` | BEP 48 scrape (completo) |
| `parseRangeHeader(header, fileLength)` | `server/server.ts` | parse `bytes=N-M` → `{start,end}` |

---

## 12. Resumo de Status

| Categoria | Implementado | Pendente (Fase 6) | Total |
|---|---|---|---|
| Client | 13/13 props, 9/9 métodos | 0 | 13+9=22 |
| Torrent | 24/24 props, 13/13 métodos | 0 | 24+13=37 |
| File | 12/12 props, 9/11 métodos, 6/6 events | 0 | 12+11+6=29 |
| Wire | 12/12 props | 0 | 12 |
| Generator | ✅ Completo (Fase 5.3) | — | — |
| Magnet | ✅ Completo (v1+v2) | — | — |
| Tracker | ✅ Completo | percent-encoding, BEP 48 scrape, buildAnnounceUrl |
| Metainfo | ✅ Completo (BEP 3/12/19/47/52) | infoBytes preservados, v1/v2/hybrid |
| Server | ✅ Completo | Range requests (206 Partial Content + Content-Range) |

**Status:** ✅ **v1.0 Completa** — todas as funcionalidades do roadmap implementadas e testadas.
**Total de tests:** 659 passing.

````

---

## Arquivo: `docs/browsertorrent/roadmap-futuro.md`

````md
# Roadmap — Tracker WebSocket em Deno para `@vanaware/browsertorrent`

> Documento de planejamento para a Fase 8 do `@vanaware/browsertorrent`:
> construção de um **servidor tracker BitTorrent WebSocket** (BEP-15 / BEP-31),
> escrito em Deno, que o cliente PWA pode usar para descoberta de peers
> quando os trackers públicos (`tracker.fastcast.nz`, etc.) falham
> ou não estão acessíveis em contexto HTTPS-only.

---

## 1. Contexto e motivação

### 1.1 O problema atual

- O cliente `@vanaware/browsertorrent` (`src/network/tracker.ts`) implementa
  `WsTracker`, que fala o protocolo BEP-15 sobre WebSocket.
- Em ambiente HTTPS, o navegador **bloqueia** conexões `ws://` (mixed content),
  e os trackers públicos via `wss://` (`wss://tracker.fastcast.nz/`,
  `wss://tracker.openbittorrent.com`) sofrem com:
  - certificado expirado/autoassinado,
  - CORS/Origin policies agressivas,
  - indisponibilidade intermitente (browsers imprimem `WebSocket connection to 'wss://...' failed`).
- O resultado é que um leech aberto em uma segunda aba/navegador **nunca
  recebe peers** → `torrent.files.length: 0` → sem metadados → sem stream.

### 1.2 A solução

Construir um **servidor tracker dedicado** em Deno, exposto via `wss://`,
que:

1. Implemente o subconjunto WebSocket do protocolo tracker BitTorrent
   (BEP-15: `announce`/`scrape`; BEP-31: `offer`/`answer` para WebRTC
   signaling).
2. Reuse a referência de protocolo colocada em
   `monorepo/webtorrent/bittorrent-tracker/` (sub-pasta criada em 2026-09-04
   contendo o upstream `webtorrent/bittorrent-tracker` para consulta).
3. Seja executável localmente (`deno task server:tracker`) e deployável
   em qualquer host que aceite Deno (Deno Deploy, VPS, container).
4. **Não quebre as regras de ouro** do `QWEN.md` raiz: as implementações
   no `src/` continuam browser-first. O tracker é um **binário/servidor
   separado**, fora de `src/`.

### 1.3 Por que Deno (e não Node)?

- O resto do monorepo BrowserTorrent já é Deno (`deno.jsonc`, `deno.lock`).
- `Deno.upgradeWebSocket()` é uma API de primeira classe para WebSockets
  com hijack de socket TCP — não há dependência de `ws` ou de polyfills.
- TS nativo, sem etapa de build para o servidor.
- Deploy trivial no Deno Deploy (que tem suporte a WebSocket nativo e
  gratuito para projetos pequenos).

---

## 2. Escopo

### 2.1 Dentro do escopo (v1)

- **Servidor WebSocket tracker** aceitando conexões `ws://` e `wss://`.
- Mensagens suportadas: `announce` (com `offer`/`answer`), `scrape`.
- Eventos do ciclo de vida do peer: `started`, `stopped`, `completed`,
  `update` (sintético).
- `Swarm` por `info_hash` com LRU de peers e contadores `complete`/
  `incomplete`.
- Estatísticas básicas: `/stats` (HTML) e `/stats.json`.
- Logging via `Deno.stdout` (sem dependência de `debug`/`pino`).
- Dockerfile mínimo + `Dockerfile` para deploy.
- Teste de integração: cliente Deno → tracker → assertiva sobre peers
  retornados.
- CLI com `deno task` (`server:tracker`, `server:tracker:dev` com watch).

### 2.2 Fora do escopo (v1)

- Tracker HTTP/UDP (BEP-3, BEP-15 parte HTTP/UDP) — pode entrar em v2.
- Persistência entre reinícios (swarms são in-memory).
- Autenticação, listas de allow/deny, filtragem de torrents
  (existe hook `filter` no upstream, mas é nice-to-have).
- `clientTracking` (já desativado no upstream para WebSocket).
- Rate limiting — adicionar em v1.1 com token bucket por IP.

### 2.3 Limites de recursos (v1)

| Recurso | Limite | Justificativa |
|---|---|---|
| Peers por swarm (LRU) | 1000 | Igual ao upstream |
| TTL do peer no LRU | 20 min | Igual ao upstream |
| `MAX_NUMWANT` aceito | 82 | Igual ao `MAX_ANNOUNCE_PEERS` upstream |
| `interval` (anúncio) | 120 s | `intervalMs / 5`, igual ao upstream |
| `intervalMs` default | 10 min | Igual ao upstream |
| Tamanho máx. de mensagem WS | 64 KiB | Generoso p/ offer SDP pequeno |
| Conexões simultâneas | 10 000 | Limite default do Deno Deploy |
| Body de scrape | 100 infoHashes | Defesa contra abuso |

---

## 3. Arquitetura

### 3.1 Estrutura de diretórios

```
monorepo/webtorrent/
├── bittorrent-tracker/            # upstream reference (read-only, não editar)
│   ├── server.js
│   ├── swarm.js
│   ├── parse-websocket.js
│   ├── common.js
│   ├── common-node.js
│   ├── client.js
│   └── websocket-tracker.js
├── tracker-server/                # NOVO: nossa implementação Deno
│   ├── deno.json                  # tasks + imports
│   ├── README.md
│   ├── Dockerfile
│   ├── src/
│   │   ├── mod.ts                 # barrel + createServer factory
│   │   ├── server.ts              # TrackerServer: aceita conexões WS
│   │   ├── swarm.ts               # Swarm: LRU de peers por infoHash
│   │   ├── peer.ts                # Peer: estado de um cliente conectado
│   │   ├── parse-websocket.ts     # parse de mensagem BEP-15 JSON
│   │   ├── constants.ts           # ACTIONS/EVENTS/limites (de common-node.js)
│   │   ├── errors.ts              # TrackerServerError tipado
│   │   ├── stats.ts               # agregação de /stats + /stats.json
│   │   └── log.ts                 # wrapper de console.* com prefixo
│   └── tests/
│       ├── swarm_test.ts
│       ├── parse-websocket_test.ts
│       └── integration_test.ts    # Deno.connect WebSocket → assert
└── qwen.md                        # ESTE ARQUIVO
```

### 3.2 Diagrama de componentes

```
                       ┌────────────────────────────────────┐
                       │       @vanaware/browsertorrent (browser)   │
                       │  src/network/tracker.ts            │
                       │  WsTracker ── wss://tracker.../ann │
                       └─────────────────┬──────────────────┘
                                         │ WebSocket (JSON BEP-15)
                                         ▼
            ┌────────────────────────────────────────────┐
            │  Deno HTTP server (Deno.serve)             │
            │  + Deno.upgradeWebSocket()                 │
            └─────────────────┬──────────────────────────┘
                              │
                              ▼
            ┌────────────────────────────────────────────┐
            │  TrackerServer (src/server.ts)             │
            │  - gerencia conexões                       │
            │  - roteia mensagens para Swarm             │
            │  - emite eventos de lifecycle              │
            │  - expõe /stats + /stats.json             │
            └─────────────────┬──────────────────────────┘
                              │
                              ▼
            ┌────────────────────────────────────────────┐
            │  Swarm (src/swarm.ts)                      │
            │  Map<infoHash, Swarm>                      │
            │  - LRU de peers (max 1000)                 │
            │  - contadores complete/incomplete          │
            │  - _getPeers(numwant, ownPeerId, isWebRTC) │
            └─────────────────┬──────────────────────────┘
                              │
                              ▼
            ┌────────────────────────────────────────────┐
            │  Peer (src/peer.ts)                        │
            │  { peerId, ip, port, type, socket,        │
            │    complete, infoHashes, onSend, onMsg,    │
            │    onClose, onError }                     │
            └────────────────────────────────────────────┘
```

### 3.3 Fluxo de mensagem (BEP-15 + BEP-31)

**Cliente → Servidor (announce com offers):**

```jsonc
{
  "action": "announce",
  "info_hash": "<20 bytes binários como string latin-1>",
  "peer_id":   "<20 bytes binários como string latin-1>",
  "port": 6881,
  "uploaded": 0,
  "downloaded": 0,
  "left": 1234,
  "compact": 1,
  "numwant": 5,
  "event": "started",
  "offers": [
    { "offer": { "type":"offer","sdp":"v=0\r\n..." }, "offer_id": "<20 bytes>" }
  ]
}
```

**Servidor → Cliente (resposta com peers):**

```jsonc
{
  "action": "announce",
  "info_hash": "<20 bytes>",
  "interval": 120,
  "complete": 1,
  "incomplete": 1,
  "peers": [
    { "peer id": "<20 bytes>", "ip": "1.2.3.4", "port": 6881 }
  ]
}
```

**Servidor → Outros peers (forward de offer):**

```jsonc
{
  "action": "announce",
  "offer": { ... },
  "offer_id": "<20 bytes>",
  "peer_id": "<20 bytes>",
  "info_hash": "<20 bytes>"
}
```

---

## 4. Mapeamento de arquivos `bittorrent-tracker/` → `tracker-server/src/`

| Upstream (Node) | Deno (nosso) | Adaptações |
|---|---|---|
| `server.js` (Server class) | `server.ts` (TrackerServer) | Substitui `http.createServer`+`WebSocketServer` por `Deno.serve({ port })` + `Deno.upgradeWebSocket()`. Remove UDP. Mantém `/stats` e `/stats.json`. `EventEmitter` → `TypedEventTarget` (`src/utils/`). |
| `swarm.js` (Swarm class) | `swarm.ts` (Swarm) | Substitui `lru` por implementação caseira de LRU (≤ 80 linhas) ou importa `lru@npm:` via `npm:` specifier. Mantém `randomIterate` do upstream (≤ 30 linhas) ou usa `crypto.getRandomValues` para sampling. |
| `parse-websocket.js` | `parse-websocket.ts` | **Quase 1:1** — só converte `if (socket.upgradeReq)` para Deno (não há `upgradeReq`; obtém `ip`/`port` de `Deno.ServerWebSocket.remoteAddr`). Validações idênticas. |
| `common.js` + `common-node.js` | `constants.ts` | Copia constantes puras (`IPV4_RE`, `IPV6_RE`, `MAX_ANNOUNCE_PEERS`, `EVENT_NAMES`, etc.). Remove `querystring` helpers (não usado em WS). |
| `client.js` | — | Não portar — é o cliente, já temos `WsTracker` em `src/network/tracker.ts`. |
| `websocket-tracker.js` | — | Não portar — é o cliente. Servidor não usa. |

### 4.1 Decisões de adaptação críticas

1. **`Deno.upgradeWebSocket()`** — recebe `Request`, retorna
   `{ socket, response }`. O `socket` é um `Deno.WebSocket` com API
   parecida com `WebSocket` mas com método `.send()` e eventos via
   listener (`.onmessage`, `.onclose`, `.onerror`). Armazena ip/port
   via `socket.remoteAddr` (`Deno.NetAddr`).

2. **Sem `peerid` library** — `bittorrent-peerid` é dependência node-only.
   Para `/stats` groupByClient, **v1 retorna só contagens sem nome de
   client**; v2 pode reusar nossa `src/utils/peerid.ts` se ela for
   portável (verificar).

3. **LRU próprio** — `lru@npm:` funciona em Deno via `npm:` specifier,
   mas é +10kB. Para 1000 peers máx., um Map + timestamp é suficiente
   e remove dependência:

   ```ts
   class PeerLRU {
     private map = new Map<string, { value: Peer; ts: number }>();
     constructor(private max: number, private ttl: number) {}
     get(id: string): Peer | undefined { ... }
     set(id: string, value: Peer) { ... }
     peek(id: string): Peer | undefined { ... } // sem bump
     remove(id: string) { ... }
     keys(): IterableIterator<string> { ... }
   }
   ```

4. **`randomIterate` próprio** — Fisher-Yates sobre `Array.from(this.map.keys())`
   no momento do `_getPeers()`. Lista máx. 1000 elementos, custo desprezível.

5. **`hex2bin` / `bin2hex` / `arr2text` / `arr2hex`** — já temos
   equivalentes em `src/utils/encode-util.ts`. **Reutilizar** ou
   duplicar no `tracker-server/`? Resposta: duplicar (tracker-server
   é independente, sem `src/`). Implementar `bin2hex` (16 linhas)
   e `arr2text` (5 linhas) inline em `constants.ts` ou `peer.ts`.

6. **`ws` library** — não usar. `Deno.upgradeWebSocket()` cobre
   o `WebSocketServer` do upstream.

7. **`bencode`** — **não usar** no servidor WS. Mensagens são JSON,
   conforme `parse-websocket.js`. BEP-15 sobre WS é JSON puro.

8. **Sem UDP** — `_onUdpRequest` removido. O `monorepo/webtorrent/`
   já descartou suporte a UDP no cliente; o tracker também fica sem
   UDP por enquanto.

---

## 5. Plano de execução por tarefas

### Fase 8.0 — Esqueleto e constantes (≈ 1–2 h)

| # | Tarefa | Arquivo | Saída |
|---|---|---|---|
| 8.0.1 | Criar `tracker-server/deno.json` com tasks (`start`, `dev`, `test`) | `deno.json` | `deno task -l tracker-server` |
| 8.0.2 | Portar constantes puras de `common.js`+`common-node.js` | `src/constants.ts` | `ACTIONS`, `EVENTS`, `EVENT_NAMES`, `EVENT_IDS`, `IPV4_RE`, `IPV6_RE`, `MAX_ANNOUNCE_PEERS`, limites |
| 8.0.3 | Helpers `bin2hex`/`arr2text`/`text2arr` | `src/encode.ts` | Funções puras |
| 8.0.4 | Logger simples com prefixo `[tracker]` | `src/log.ts` | `log.debug/info/warn` |
| 8.0.5 | `errors.ts` com `TrackerServerError` tipado | `src/errors.ts` | Erro com `code: "INVALID_INFO_HASH"\|...` |

### Fase 8.1 — Parse de mensagem (≈ 2 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.1.1 | Portar `parse-websocket.js` para TS | `src/parse-websocket.ts` | Tipar `ParsedWsAnnounce`, `ParsedWsScrape` |
| 8.1.2 | Substituir `socket.upgradeReq` por `Deno.ServerWebSocket.remoteAddr` | `src/parse-websocket.ts` | IPv4 mapped IPv6 stripping via `REMOVE_IPV4_MAPPED_IPV6_RE` |
| 8.1.3 | Testes de borda (info_hash errado, offer inválido, etc.) | `tests/parse-websocket_test.ts` | 15+ casos |

### Fase 8.2 — Swarm + Peer + LRU (≈ 3 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.2.1 | Implementar `PeerLRU` próprio (Map + timestamp) | `src/lru.ts` | Máx. 80 linhas |
| 8.2.2 | Implementar `Swarm` (1:1 com upstream, TS tipado) | `src/swarm.ts` | Preservar `announce`/`scrape`/`_getPeers` com `randomIterate` próprio |
| 8.2.3 | Implementar `Peer` (estado de uma conexão) | `src/peer.ts` | `infoHashes[]`, `peerId` (hex), `socket`, `onSend`, `onMessageBound`, `onCloseBound`, `onErrorBound` |
| 8.2.4 | `Swarm.announce` com eventos `started`/`stopped`/`completed`/`update`/`paused` | `src/swarm.ts` | Ajustar contadores `complete`/`incomplete` |
| 8.2.5 | Testes unitários Swarm (anúncios, LRU eviction, _getPeers random) | `tests/swarm_test.ts` | 20+ casos |

### Fase 8.3 — TrackerServer (≈ 4 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.3.1 | `TrackerServer` com `Deno.serve({ port })` + `Deno.upgradeWebSocket()` | `src/server.ts` | Aceita `http://` e `https://` (TLS opcional via certs) |
| 8.3.2 | `onWebSocketConnection` (estado por socket, listeners) | `src/server.ts` | `peerId`/`infoHashes` anexados ao socket (mesmo padrão upstream) |
| 8.3.3 | `_onWebSocketRequest` (parse + dispatch para Swarm) | `src/server.ts` | Suporte a `answer` (forward para `to_peer_id`) |
| 8.3.4 | Forward de `offer` para `numwant` peers do swarm | `src/server.ts` | Mesmo padrão upstream, com `peers[i].socket.send(...)` |
| 8.3.5 | `_onWebSocketClose` (sintético `stopped` para cada infoHash) | `src/server.ts` | Idêntico ao upstream |
| 8.3.6 | `/stats` HTML + `/stats.json` (sem groupByClient em v1) | `src/stats.ts` | `torrents`, `activeTorrents`, `peersAll`, `peersSeederOnly`, etc. |
| 8.3.7 | EventEmitter → `TypedEventTarget` (`listening`, `warning`, `error`, `start`, `complete`, `stop`) | `src/server.ts` | Tipos dos eventos em `src/types.ts` |
| 8.3.8 | `listen()` + `close()` + `createSwarm()` + `getSwarm()` | `src/server.ts` | `AddressInfo` retornado em `listen()` |

### Fase 8.4 — Endurecimento (≈ 2 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.4.1 | `filter` hook (allow/deny por infoHash) | `src/server.ts` | Igual ao upstream, opcional |
| 8.4.2 | Limite de tamanho de mensagem (64 KiB) | `src/server.ts` | `socket.addEventListener("message", ...)` checa `data.length` |
| 8.4.3 | Limite de numwant aceito (capping em `MAX_ANNOUNCE_PEERS`) | `src/parse-websocket.ts` | Idêntico ao upstream |
| 8.4.4 | Graceful shutdown (`SIGINT`/`SIGTERM` → `close()`) | `src/cli.ts` | Deno tem `Deno.addSignalListener` |
| 8.4.5 | Limite de infoHashes por socket (ex: 100) | `src/server.ts` | Defesa contra abuso |

### Fase 8.5 — CLI + Docker (≈ 1 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.5.1 | `src/cli.ts` com `parseArgs` para `--port`, `--host`, `--interval` | `src/cli.ts` | Exemplo: `deno task start -- --port=8001` |
| 8.5.2 | `deno task start` no `deno.json` | `deno.json` | `deno run -A --unstable-net src/cli.ts` |
| 8.5.3 | `deno task dev` com `--watch` | `deno.json` | Reload em mudanças |
| 8.5.4 | `deno task test` rodando `tests/` | `deno.json` | `deno test -A --unstable-net` |
| 8.5.5 | `Dockerfile` mínimo (multi-stage) | `Dockerfile` | `denoland/deno:distroless` + `EXPOSE 8001` |
| 8.5.6 | `README.md` com instruções de uso local + Deno Deploy | `README.md` | Inclui `wss://` exemplo para o client |

### Fase 8.6 — Teste de integração (≈ 2 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.6.1 | Subir `TrackerServer` em porta aleatória (`port: 0`) | `tests/integration_test.ts` | `Deno.serve({ port: 0, ... })`, lê `addr.port` |
| 8.6.2 | Conectar 2 WebSocket clients (`new WebSocket(...)`) | `tests/integration_test.ts` | Cliente A anuncia, Cliente B anuncia, A recebe B como peer |
| 8.6.3 | Validar forward de `offer` (A envia offer, B recebe offer do swarm) | `tests/integration_test.ts` | Assertiva sobre `data.action === "announce" && data.offer` |
| 8.6.4 | Validar `scrape` (A scrape, recebe `files[infoHash]`) | `tests/integration_test.ts` | Hash binário (20 bytes) |
| 8.6.5 | Validar `/stats.json` com `torrents >= 1` | `tests/integration_test.ts` | `fetch` ao server |

### Fase 8.7 — Smoke test com cliente real (≈ 1 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.7.1 | Subir o tracker em `ws://localhost:8001` | manual | `deno task start` |
| 8.7.2 | Configurar `torrent-context.tsx` para usar `ws://localhost:8001/announce` | `example/torrent-context.tsx` | Substituir `wss://tracker.openbittorrent.com/announce` |
| 8.7.3 | Rodar `deno task --config ~/github/browsertorrent/deno.jsonc build webtorrent` | manual | Confirmar 0 type errors |
| 8.7.4 | Rodar `deno task --config ~/github/browsertorrent/monorepo/webtorrent/deno.jsonc server` | manual | Confirmar SW registra |
| 8.7.5 | Abrir 2 abas com o mesmo magnet → verificar `peers.length > 0` | manual | Logs do tracker devem mostrar 2 announces + 1 offer forward |
| 8.7.6 | Verificar download de peça (Piece → wire → storage) | manual | `torrent.progress > 0` na aba leech |

### Fase 8.8 — Documentação e changelog (≈ 30 min)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.8.1 | Adicionar Fase 8 ao plano de ação em `QWEN.md` raiz | `../QWEN.md` | Tabela de fases com link para este arquivo |
| 8.8.2 | Atualizar matriz de paridade (adicionar `tracker-server`) | `../QWEN.md` §5 | 🟢 quando v1 concluído |
| 8.8.3 | Adicionar entrada de changelog | `../QWEN.md` §7 | "Fase 8: tracker WebSocket em Deno" |

---

## 6. Critérios de aceite (v1)

A Fase 8 está completa quando **todos** os itens abaixo forem verdade:

### Funcionais
- [ ] `deno task start` sobe o tracker em `ws://localhost:8001` sem erros
- [ ] `deno task test` passa **todos** os testes (unitários + integração)
- [ ] Cliente PWA consegue conectar a `ws://localhost:8001/announce` em 2 abas
- [ ] Cliente A anuncia → Cliente B anuncia → A recebe B como peer (offer/answer)
- [ ] Cliente A scrape → recebe `{ files: { "<infoHash>": { complete, incomplete }}}`
- [ ] `GET http://localhost:8001/stats.json` retorna JSON com contagens
- [ ] Fechar a aba de A dispara `stopped` no tracker (verificável via `complete`/`incomplete` decrescer)

### Não-funcionais
- [ ] 0 type errors (`deno check **/*.ts`)
- [ ] 0 warnings de `deno lint`
- [ ] Sem dependência `npm:` (apenas Deno std + tracker-server próprio)
- [ ] Build não inclui código do tracker (verificar bundle: `webtorrent.min.js` continua ≈150kB)
- [ ] `src/` permanece browser-first: nenhum `Deno.*` em `src/`
- [ ] Tempo de startup < 100 ms
- [ ] Memória em swarm vazio < 50 MB
- [ ] 1000 peers simultâneos em 1 swarm sem degradação perceptível

### Documentação
- [ ] `tracker-server/README.md` cobre instalação, uso, deploy
- [ ] `tracker-server/Dockerfile` builda e roda
- [ ] `QWEN.md` raiz atualizado com Fase 8
- [ ] Diagrama de sequência de announce + offer/answer no `tracker-server/README.md`

---

## 7. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `Deno.upgradeWebSocket()` muda em versões instáveis | Média | Baixo | Fixar `deno --version` no `Dockerfile` e na doc |
| LRU próprio tem bug de O(n) em eviction | Baixa | Médio | Testes de stress com 10k peers em `tests/swarm_test.ts` |
| Browser bloqueia `ws://` (não `wss://`) em HTTPS | Alta (se o PWA rodar em HTTPS) | Alto | v1 aceita `ws://` e `wss://`. Em produção, sempre usar `wss://` com proxy reverso (Caddy, nginx) ou Deno Deploy |
| Forward de offer excede o limite de `Deno.WebSocket.send` (rate limit interno) | Baixa | Médio | Limitar `numwant` ao receber (não ao enviar) — já feito pelo upstream |
| LRU TTL longo → peers mortos poluem swarm | Média | Médio | `Deno.upgradeWebSocket` expõe `socket.isClosed`; onClose dispara `stopped` sintético |
| Cliente A e B no mesmo IP/NAT → não conseguem conectar via WebRTC | Alta em localhost | Médio | Já existe STUN em `torrent-context.tsx`. Adicionar TURN em v2 se necessário |
| `WebSocket.send()` lança quando buffer cheio | Baixa | Médio | Capturar com `try/catch` no `onSend` e fechar socket (igual upstream) |

---

## 8. Pós-v1 — Roadmap futuro (v2+)

### Fase 9 — Tracker HTTP/UDP (BEP-3 completo)
- `onHttpRequest` com `bencode` (reusar `src/utils/bencode.ts`)
- `onUdpRequest` com `Deno.listenDatagram` (`--unstable-net` ou `Deno.DatagramConn` em APIs estáveis)
- Compatibilidade com clientes BitTorrent clássicos (qBittorrent, Transmission)

### Fase 10 — Persistência opcional
- Deno KV (`Deno.openKv()`) para stats e `info_hash`s recentes
- Snapshot/restore em reinício

### Fase 11 — Autenticação e rate limiting
- Token por info_hash (HMAC do peer_id)
- Rate limit por IP (token bucket in-memory)

### Fase 12 — Federation
- Múltiplas instâncias trocando swarms via gossip
- Útil para deploy distribuído em múltiplas regiões

### Fase 13 — `client.scrape` no `@vanaware/browsertorrent` (BEP-48)
- Expor método em `src/mod.ts` para consultar `ws://tracker/announce` via WS
- Já existe `scrapeTracker` em `src/network/tracker.ts` mas só para HTTP

---

## 9. Referências

- **BEP-3** — The BitTorrent Protocol Specification (peer messages)
- **BEP-15** — UDP Tracker Protocol (a parte WS é "tracker over websocket", não BEP oficial, mas especificada em `webtorrent/bittorrent-tracker`)
- **BEP-23** — Tracker Returns Compact Peer Lists
- **BEP-31** — WebSocket Tracker Protocol (offer/answer signaling)
- **BEP-48** — Tracker Protocol Extension: Scrape
- **WebSocket API no Deno** — https://docs.deno.com/runtime/manual/runtime/web_platform_apis#websocket
- **Deno Deploy WebSockets** — https://docs.deno.com/deploy/manual/runtime-broadcasts#websockets
- **Upstream `webtorrent/bittorrent-tracker`** — referência de protocolo (em `monorepo/webtorrent/bittorrent-tracker/`)
- **QWEN.md raiz** — regras de ouro do `@vanaware/browsertorrent`

---

## 10. Anexo — Mensagens JSON (BEP-15 + BEP-31)

### 10.1 Cliente → Tracker: `announce` (started)
```json
{
  "action": "announce",
  "info_hash": "ÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿ",  // 20 bytes latin-1
  "peer_id":   "ÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿ",  // 20 bytes latin-1
  "port": 6881,
  "uploaded": 0,
  "downloaded": 0,
  "left": 1234,
  "compact": 1,
  "numwant": 5,
  "event": "started"
}
```

### 10.2 Cliente → Tracker: `announce` (com offer)
```json
{
  "action": "announce",
  "info_hash": "...",
  "peer_id":   "...",
  "port": 6881,
  "uploaded": 0,
  "downloaded": 0,
  "left": 0,
  "event": "",
  "numwant": 5,
  "offers": [
    {
      "offer": { "type": "offer", "sdp": "v=0\r\n..." },
      "offer_id": "ÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿ"  // 20 bytes
    }
  ]
}
```

### 10.3 Tracker → Cliente: `announce` (resposta)
```json
{
  "action": "announce",
  "info_hash": "...",
  "interval": 120,
  "complete": 1,
  "incomplete": 1,
  "peers": [
    { "peer id": "...", "ip": "1.2.3.4", "port": 6881 }
  ]
}
```

### 10.4 Tracker → Cliente: `announce` (forward de offer)
```json
{
  "action": "announce",
  "offer": { "type": "offer", "sdp": "..." },
  "offer_id": "...",
  "peer_id": "...",
  "info_hash": "..."
}
```

### 10.5 Cliente → Tracker: `answer`
```json
{
  "action": "announce",
  "info_hash": "...",
  "peer_id":   "...",
  "to_peer_id": "...",
  "answer": { "type": "answer", "sdp": "..." },
  "offer_id": "..."
}
```

### 10.6 Cliente → Tracker: `scrape`
```json
{
  "action": "scrape",
  "info_hash": "..."
}
```

### 10.7 Tracker → Cliente: `scrape` (resposta)
```json
{
  "action": "scrape",
  "files": {
    "ÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿ": {
      "complete": 1,
      "incomplete": 1,
      "downloaded": 5
    }
  },
  "flags": { "min_request_interval": 600 }
}
```

### 10.8 Tracker → Cliente: erro
```json
{
  "action": "announce",
  "info_hash": "...",
  "failure reason": "invalid info_hash"
}
```

````

---

## Arquivo: `docs/browsertorrent/Regras-IA.md`

````md
# Regras de conduta — @vanaware/browsertorrent

> Contexto obrigatório para qualquer IA (Qwen Code) que analise, adapte ou
> modifique este pacote. Leia este arquivo antes de propor mudanças.

## 1. Missão do pacote

- `src/` é a implementação oficial do **BrowserTorrent**, um cliente BitTorrent
  **browser-first** (PWA). Tudo em `src/` deve funcionar no navegador.
- `deno-torrent/` é a **fonte de referência de protocolo** (implementação
  rigorosa, orientada a Deno). Ela informa *o que* implementar e *quais
  validações* existem — não é copiada cegamente.
- Direção do trabalho: incorporar capacidades do `deno-torrent/` ao `src/`
  **sem perder nenhuma funcionalidade existente**.

## 2. Regras de ouro (não negociáveis)

1. **Zero regressão de funcionalidade.** Ao incorporar algo novo, adaptar —
   nunca reescrever do zero removendo comportamento existente. APIs públicas
   (`mod.ts` exports, eventos emitidos, assinaturas) só mudam com pedido
   explícito do usuário.
2. **Browser-first.** Em `src/` são permitidas apenas APIs web padrão:
   `TextEncoder/TextDecoder`, `DataView`, `crypto.subtle`, `setTimeout`,
   `AbortSignal`, `EventTarget`, `navigator.storage` (OPFS). **Proibido** em
   código de produção de `src/`: `Deno.*`, `node:*`, `process.*`, `require`.
   Exceção: arquivos de teste (`tests/`) podem usar `Deno.test`.
3. **A fachada é orientada a eventos.** `Wire`, `Torrent`, `Swarm`, `Peer` e
   as extensões emitem eventos via `TypedEventTarget` (`src/utils/`). Essa
   fachada é estável e consumida pelo restante do BrowserTorrent. A máquina de estados
   do `deno-torrent` pode ser adotada como *internals*, mas os eventos
   públicos devem continuar existindo.
4. **Utils locais, não imports do deno-torrent.** O bundle do browser não
   deve importar `@deno-torrent/toolkit` nem `@deno-torrent/bencode`. Portar
   para `src/utils/` apenas o necessário, e somente código puro (sem APIs
   Deno). Funções Deno-only como `NetUtil.getMacAddr()` e `MultiFileReader`
   **nunca** devem entrar em `src/`.
5. **Validações do deno-torrent são segurança, não perfumaria.** Limites
   (`maxMessageLength`, `maxPendingRequests`, `maxQueuedWriteBytes`),
   timeouts, validação de spare bits de bitfield, verificação de infoHash e
   rejeição de peers inesperados protegem o PWA contra peers maliciosos. Ao
   adaptar uma função, preservar (ou justificar a remoção de) cada validação.
6. **Tudo que entra precisa de teste.** Nova capacidade incorporada → teste
   em `monorepo/webtorrent/tests/` seguindo o padrão existente
   (`wire_test.ts`, `ut-pex_test.ts`).
7. **Documentar a paridade.** Ao concluir uma incorporação, atualizar a
   matriz de paridade na seção 5 deste arquivo e, se relevante,
   `snapshots/webtorrent.md`.

## 3. Checklist obrigatório para analisar um módulo do deno-torrent

Antes de propor qualquer adaptação de um módulo (ex.: `deno-torrent/magnet`,
`deno-torrent/metainfo`, ...), executar e relatar:

1. **Inventário**: listar todos os exports do módulo (funções, classes,
   constantes, tipos) e o arquivo correspondente em `src/`, se houver.
2. **Classificação por função**: `🟢 já existe` / `🟡 parcial` / `🔴 ausente`.
3. **Dependências**: quais imports o módulo usa (`toolkit`, `bencode`, etc.)
   e se cada um é puro ou depende de API Deno.
4. **Viabilidade browser**: veredito final (`alta`/`média`/`baixa`) com os
   pontos bloqueantes listados.
5. **Plano de incorporação incremental**: ordem das entregas, o que vira
   utils puros, o que vira internals, o que muda na fachada (idealmente nada).
6. **Mapa de validações**: lista das validações/limits do módulo original que
   devem sobreviver à adaptação.

## 4. Avaliação global de todos os submódulos deno-torrent (2026-09-04)

### Resumo executivo

| Submódulo | Linhas | Browser-viável | Prioridade | Bloqueantes |
|---|---|---|---|---|
| **toolkit/** | ~1.543 | Parcial (6/8 arquivos) | 🔴 Fundação | `@std/encoding/*` (substituível) |
| **bencode/** | ~300 | ✅ Sim | 🔴 Fundação | Nenhum |
| **peerwire/** | ~3.300 | ✅ Sim | 🔴 Crítico | Nenhum |
| **magnet/** | ~610 | ✅ Sim (c/ adaptação) | 🟡 Importante | `@std/encoding/base32+hex` |
| **metainfo/** | ~1.369 | Parcial (4/6 arquivos) | 🟡 Importante | generator/utils = Deno-only |
| **peerid/** | ~778 | ✅ Sim | 🟢 Baixo | Nenhum |
| **torrent-parser/** | ~348 | ✅ Sim (c/ Uint8Array) | 🟡 Importante | `@deno-torrent/bencode` import |
| **torrent-tracker/** | ~809 | ✅ Sim | 🔴 Crítico | Nenhum — `fetch`-based! |
| **torrent-generator/** | ~788 | ❌ Não | ⛔ Excluir | `Deno.stat`, `Deno.FsFile`, `@std/fs` |
| **torrent-dht/** | ~3.433 | ❌ Não (UDP) | 🔮 Futuro | `Deno.listenDatagram`, `Deno.Addr` |
| **utp/** | ~3.629 | ❌ Não (UDP) | 🔮 Futuro | `Deno.NetAddr`, raw UDP |

### Detalhe por submódulo

#### toolkit/ (8 sub-pastas)

| Arquivo | Linhas | Browser? | Valor para src/ | Adaptação necessária |
|---|---|---|---|---|
| `bytes/bytes_util.ts` | 251 | ⚠️ `@std/encoding/hex` | `xor`, `compare`, `bigint`, `chunkBytes` | Inlinear hex (5 linhas) |
| `bytes/bit_array.ts` | 382 | ✅ | `BitArray` com `BitOrder` (msb0/lsb0), `xor`, `diff`, `fromBigInt` | Substituir import `BytesUtil.hex` |
| `encoding/encode_util.ts` | 90 | ⚠️ `@std/encoding/*` | Validadores `isBase32/Hex/Sha1`, `encodeBase32/64/Hex` | Inlinear ou usar `atob`/`btoa` |
| `hash/hash_util.ts` | 438 | ✅ | **SHA-1 incremental**, `md5`, `sha512`, `toHex` | Nenhuma — já usa `crypto.subtle` |
| `io/io_util.ts` | 193 | ✅ | `ByteReader/Writer`, `readExactly`, `writeAll`, `InvalidByteCountError` | Nenhuma |
| `io/simple_buffer.ts` | 158 | ✅ | Buffer growable com cursor de leitura/escrita | Nenhuma |
| `io/multi_file_reader.ts` | 246 | ❌ | — | **Não portar** (Deno filesystem) |
| `net/net_util.ts` | 172 | ⚠️ 1 função | `isNetPort`, `isIPv4Str/Bytes`, compact peer format (BEP 23) | Remover `getMacAddr()`; inlinear |

#### bencode/ (4 arquivos, ~300 linhas)

| Arquivo | Linhas | Browser? | vs src/utils/bencode.ts |
|---|---|---|---|
| `decode.ts` | ~269 | ✅ | Retorna `Map` (correto p/ bencode), tem `maxBytes/maxDepth`, `BencodeDecodeError`. src/ retorna `Record` (pode perder chaves binárias) |
| `encode.ts` | ~148 | ✅ | Suporta `Map` e `Record`. src/ só `Record`. Ordenação por byte raw (correta), detecção de ciclo via `WeakSet` |
| `types.ts` | ~57 | ✅ | `BencodeValue = Map \| Uint8Array \| number \| string \| BencodeValue[]`. src/ usa `BencodeDict = Record` |
| `mod.ts` | ~29 | ✅ | Re-exports |

**Decisão:** Adaptar para src/ mantendo compatibilidade com `BencodeDict` existente, mas adicionando `maxBytes/maxDepth` limits e `BencodeDecodeError`.

#### magnet/ (2 arquivos, ~610 linhas)

| Arquivo | Linhas | Browser? | vs src/utils/magnet.ts (97 linhas) |
|---|---|---|---|
| `magnet.ts` | 587 | ⚠️ `@std/encoding/*` | Suporta **v2** (`urn:btmh`), `buildV2()`, validação robusta, `MagnetParseOptions` (limites), separa `infoHashV1/V2/handshakeHash`. src/ não suporta v2. |

#### metainfo/ (7 arquivos, ~1.369 linhas)

| Arquivo | Linhas | Browser? | Valor |
|---|---|---|---|
| `identity.ts` | 231 | ✅ (Uint8Array path) | **Preserva bytes exatos do info dict** (hash fiel), `calculateInfoHashV2`, `wrapInfoBytes` (BEP 9). src/ faz `sha1(encode(info))` que pode divergir |
| `parser.ts` | 354 | ✅ (Uint8Array path) | Validação completa (BEP 3/12/19/47/52), `TorrentParseError`. src/ é minimalista |
| `types.ts` | 262 | ✅ | Tipos v2/hybrid (`TorrentV2Info`, `TorrentFileTree`, `PieceSizeEnum`). src/ não tem |
| `path.ts` | 21 | ✅ | `isSafePathComponent` (rejeita `.`/`..`/NUL). src/ não valida |
| `v2.ts` | 223 | ✅ | `flattenV2Files`, `validateV2PieceLayers`, `validateHybridLayout`. src/ não tem v2 |
| `generator.ts` | 210 | ❌ Deno FS | **Não portar** |
| `utils.ts` | 255 | ❌ Deno FS | **Não portar** (mas `calcPieceSize` é pura) |

#### peerid/ (6 arquivos, ~778 linhas)

| Arquivo | Linhas | Browser? | vs src/utils/peerid.ts |
|---|---|---|---|
| `peerid.ts` | 204 | ✅ | `encode()`, `encodeAzStyle()`, `encodeShadowStyle()` — src/ só gera BrowserTorrent hardcoded |
| `util.ts` | 362 | ✅ | 16+ funções (validators, version converters, `randomStr`). src/ tem 4 funções simplificadas |
| `enum.ts` | 121 | ✅ | `enum AZStyleClient`/`ShadowStyleClient`. src/ usa `Record`. **Nota:** src/ tem `"LO": "BrowserTorrent"`, deno-torrent não |
| `type.ts` | 11 | ✅ | `type Client`. src/ tem `ClientInfo` com campo `style` a mais |
| `constant.ts` | 46 | ✅ | Char arrays para encoding |

#### torrent-parser/ (2 arquivos, ~348 linhas)

| Arquivo | Linhas | Browser? | vs src/utils/parse-torrent.ts |
|---|---|---|---|
| `parser.ts` | 347 | ✅ (Uint8Array) | Mais rigoroso (validação campo a campo, `maxBytes`, `TorrentParseError`). src/ é mais rico em output (infoHash, magnet, files+offsets) |

#### torrent-tracker/ (7 arquivos, ~809 linhas)

| Arquivo | Linhas | Browser? | Valor |
|---|---|---|---|
| `http.ts` | 451 | ✅ fetch-based! | **Cliente HTTP tracker completo**: `HttpTrackerClient`, `buildAnnounceUrl` (percent-encoding correto byte-a-byte), `parseHttpTrackerResponse`. Substitui `HttpTracker` do src/ (que usa `String.fromCharCode` — incorreto p/ bytes >0x7F) |
| `compact.ts` | 68 | ✅ | `parseCompactIpv4Peers`, `parseCompactIpv6Peers`, `deduplicatePeers`. src/ não tem |
| `types.ts` | 86 | ✅ | `PeerEndpoint`, `TrackerAnnounceRequest/Response`, `AnnounceClient`, `TrackerError` |
| `request.ts` | 79 | ✅ | Constantes de limite (`MAX_NUM_WANT=2000`, `MAX_TRACKER_URL_LENGTH=8192`) + `validateAnnounceRequest` |
| `client.ts` | 125 | ✅ | `TrackerClient` unificado (delega p/ HTTP ou futuro UDP) |
| `udp.ts` | 294 | ❌ | `Deno.listenDatagram` — **não portar** |

## 5. Matrizes de paridade (2026-09-04, atualizado após Fase 0)

### peerwire → src/core/ + src/extensions/

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| Mensagens BEP 3 (choke..cancel) | ✅ | ✅ | 🟢 |
| `port` (BEP 5) | ✅ | ✅ | 🟢 |
| BEP 6 Fast | ✅ | ✅ | 🟢 |
| BEP 52 v2 hashes | ✅ | ✅ | 🟢 |
| Mensagem `unknown` | ✅ | ✅ | 🟢 |
| Reserved bits nomeados | ✅ | ✅ | 🟢 |
| Negociação gating | ✅ | ✅ | 🟢 |
| Validação `expectedPeerId` | ✅ | ✅ | 🟢 |
| Correlação de requests (Promise) | ✅ | parcial | 🟡 |
| Timeouts (todos) | ✅ | ✅ | 🟢 |
| Keepalive | ✅ | ✅ | 🟢 |
| Backpressure escrita | ✅ | ✅ | 🟢 |
| Limites configuráveis | ✅ | ✅ | 🟢 |
| ExtensionHost BEP 10 completo | ✅ | ✅ | 🟢 |
| ut_metadata c/ hash verify | ✅ | parcial | 🟡 |
| ut_pex | ✅ | ✅ | 🟢 |
| Bitfield spare-bit validation | ✅ | parcial | 🟡 |
| Taxonomia de erros | ✅ | ✅ | 🟢 |
| Ordem de disponibilidade | ✅ | ✅ | 🟢 |

### toolkit → src/crypto/ + src/utils/

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| SHA-1 incremental (streaming) | ✅ `createSha1()` | ✅ | 🟢 |
| SHA-512 | ✅ | ✅ | 🟢 |
| MD5 | ✅ puro-TS | ✅ | 🟢 |
| `toHex` helper | ✅ | ✅ | 🟢 |
| `BitArray` (msb0/lsb0, xor, diff) | ✅ | ✅ | 🟢 |
| `BytesUtil.xor/compare/bigint` | ✅ | ✅ | 🟢 |
| `EncodeUtil` validadores | ✅ | ✅ | 🟢 |
| `SimpleBuffer` (cursor R/W) | ✅ | ✅ | 🟢 |
| `ByteReader/Writer` + `readExactly` | ✅ | ✅ | 🟢 |
| `NetUtil` IP/porta/compact | ✅ | ✅ | 🟢 |

### bencode → src/utils/bencode.ts

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| decode c/ `maxBytes/maxDepth` | ✅ | ✅ | 🟢 |
| `BencodeDecodeError` | ✅ | ✅ | 🟢 |
| Suporte a `Map` (chaves binárias) | ✅ | ✅ (opt-in) | 🟢 |
| encode c/ `Map` | ✅ | ✅ | 🟢 |
| Ordenação por byte raw | ✅ | ✅ | 🟢 |
| Detecção de ciclo | ✅ `WeakSet` | ✅ | 🟢 |

### magnet → src/utils/magnet.ts

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| v2 (`urn:btmh`) | ✅ | ❌ | 🔴 |
| `buildV2()` | ✅ | ❌ | 🔴 |
| `isValid()` validação formal | ✅ | ❌ | 🔴 |
| Limites de recursos | ✅ | ❌ | 🟡 |
| `infoHashV1/V2/handshakeHash` | ✅ | ❌ | 🔴 |

### metainfo → src/utils/parse-torrent.ts

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| Preservar bytes exatos do info dict | ✅ | ❌ (re-encode) | 🔴 |
| Info hash v2/hybrid | ✅ | ❌ | 🔴 |
| Validação BEP 3/12/19/47/52 | ✅ | ❌ | 🔴 |
| `TorrentParseError` tipado | ✅ | ❌ | 🔴 |
| Tipos v2 (`TorrentV2Info`, file tree) | ✅ | ❌ | 🔴 |
| `isSafePathComponent` | ✅ | ❌ | 🟡 |
| `wrapInfoBytes` (BEP 9) | ✅ | ❌ | 🟡 |

### torrent-tracker → src/network/tracker.ts

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| HTTP tracker (byte-a-byte encoding) | ✅ | ✅ (com bug) | 🔴 |
| Compact peers IPv4 | ✅ | parcial (inline) | 🔴 |
| Compact peers IPv6 | ✅ | ❌ | 🔴 |
| `deduplicatePeers` | ✅ | ❌ | 🟡 |
| Tipos formais de request/response | ✅ | ❌ | 🟡 |
| Constantes de limite | ✅ | parcial | 🟡 |
| `validateAnnounceRequest` | ✅ | ❌ | 🟡 |

### webtorrent.min.js API → src/ (funcionalidades browser)

> Atualizado após Fase 6 (API Final). Matriz completa após incorporação
> de todas as capacidades browser-aplicáveis do upstream WebTorrent.

| Capacidade | webtorrent.min.js | src/ | Estado |
|---|---|---|---|
| **WebRTC_SUPPORT** static | ✅ | ✅ | 🟢 |
| **client.add(torrentId, opts, cb)** | ✅ | ✅ | 🟢 |
| **client.seed(input, opts, cb)** | ✅ | ✅ (Fase 6) | 🟢 |
| **client.remove(infoHash)** | ✅ | ✅ | 🟢 |
| **client.destroy(cb)** | ✅ | ✅ | 🟢 |
| **client.get(torrentId)** | ✅ | ✅ (via Map) | 🟢 |
| **client.torrents / torrentList** | ✅ array | ✅ Map + array | 🟢 |
| **client.downloadSpeed/uploadSpeed** | ✅ aggregate | ✅ (Fase 6) | 🟢 |
| **client.progress/ratio** | ✅ aggregate | ✅ (Fase 6) | 🟢 |
| **client.throttleDownload/throttleUpload** | ✅ | ✅ (Fase 6) | 🟢 |
| **client.createServer** | ✅ | ✅ | 🟢 |
| **client.initServiceWorker** | — (extensão) | ✅ | 🟢 |
| **torrent.name/infoHash/magnetURI** | ✅ | ✅ | 🟢 |
| **torrent.files[]** (ParsedTorrentFile) | ✅ | ✅ | 🟢 |
| **torrent.pieceLength/lastPieceLength/length** | ✅ | ✅ | 🟢 |
| **torrent.ready/destroyed/paused** | ✅ | ✅ | 🟢 |
| **torrent.downloaded/uploaded/received** | ✅ | ✅ (Fase 6) | 🟢 |
| **torrent.downloadSpeed/uploadSpeed** | ✅ | ✅ | 🟢 |
| **torrent.progress/ratio/timeRemaining** | ✅ | ✅ | 🟢 |
| **torrent.numPeers** | ✅ | ✅ | 🟢 |
| **torrent.torrentFile / torrentFileBlob** | ✅ | ✅ (Fase 6) | 🟢 |
| **torrent.created/createdBy/comment** | ✅ | ✅ (Fase 6) | 🟢 |
| **torrent.done** | ✅ | ✅ (Fase 6) | 🟢 |
| **torrent.announce[]** | ✅ | ✅ (Fase 6) | 🟢 |
| **torrent.maxWebConns** | ✅ | ✅ (Fase 6) | 🟢 |
| **torrent.select/deselect/critical** | ✅ | ✅ (priority/notify via Fase 6) | 🟢 |
| **torrent.pause/resume** | ✅ | ✅ | 🟢 |
| **torrent.addPeer/removePeer** | ✅ | ✅ | 🟢 |
| **torrent.addWebSeed/removeWebSeed** | ✅ | ✅ | 🟢 |
| **torrent.rescanFiles(cb)** | ✅ | ✅ (Fase 6) | 🟢 |
| **torrent.getPiece(index)** | ✅ | ✅ | 🟢 |
| **torrent.destroy** | ✅ | ✅ | 🟢 |
| **torrent.pieces** (Bitfield) | ✅ | ✅ | 🟢 |
| Torrent events: `infoHash`, `ready`, `warning`, `noPeers`, `idle`, `wire` | ✅ | ✅ | 🟢 |
| Torrent events: `download`, `upload`, `done`, `verified`, `metadata` | ✅ | ✅ | 🟢 |
| **File class** com streaming | ✅ `createReadStream`, `stream()`, `streamTo()`, `streamURL`, `arrayBuffer()`, `blob()`, `getBlobURL()`, `[Symbol.asyncIterator]` | ✅ (Fase 4.1, Fase 6) | 🟢 |
| **file.type** (MIME) | ✅ | ✅ (Fase 6) | 🟢 |
| **file.downloaded/progress** (per-file) | ✅ | ✅ (Fase 6) | 🟢 |
| **file.select/deselect/includes(piece)** | ✅ | ✅ | 🟢 |
| **file.streamURL** | ✅ | ✅ | 🟢 |
| **file.streamTo(elem)** | ✅ | ✅ | 🟢 |
| File events: `stream`, `iterator`, `done`, `error` | ✅ | ✅ | 🟢 |
| File events: `download`, `upload` | ✅ | ✅ (Fase 6) | 🟢 |
| **Piece.length/missing** | ✅ | ✅ | 🟢 |
| **wire.uploadSpeed/downloadSpeed** | ✅ | ✅ (Fase 6) | 🟢 |
| **wire.remoteAddress/remotePort** | ✅ | ✅ (Fase 6) | 🟢 |
| **wire.uploadedBytes/downloadedBytes** | ✅ | ✅ | 🟢 |
| **wire.peerId/type/extensions** | ✅ | ✅ | 🟢 |
| **Web Seeds (BEP 19)** | ✅ | ✅ | 🟢 |
| **SW integration** (`client.createServer`) | ✅ | ✅ | 🟢 |
| **OPFS storage** | — (extensão) | ✅ | 🟢 |
| **OPFS torrent generator** | — (extensão) | ✅ (Fase 5.3) | 🟢 |

## 6. Plano de ação por fases

### Fase 0 — Fundação ✅ CONCLUÍDA

Ordem: bencode → crypto → bytes/bitfield → io → net → errors

| # | Tarefa | Status | Arquivo |
|---|---|---|---|
| 0.1 | Bencode: `maxBytes/maxDepth`, `BencodeDecodeError`, suporte `Map`, byte-raw sort, ciclo | ✅ | `src/utils/bencode.ts` |
| 0.2 | Crypto: SHA-1 incremental (`createSha1`), `md5`, `toHex`, `sha512` | ✅ | `src/crypto/hasher.ts` |
| 0.3 | `BitArray` com `BitOrder` + `xor`/`diff`/`fromBigInt` | ✅ | `src/utils/bit-array.ts` |
| 0.4 | `ByteReader/Writer` + `readExactly`/`writeAll` + erros | ✅ | `src/utils/byte-io.ts` |
| 0.5 | `BytesUtil.xor/compare/bigint/chunkBytes` | ✅ | `src/utils/buffer.ts` |
| 0.6 | `EncodeUtil` validadores + encode/decode base32/64/hex | ✅ | `src/utils/encoding.ts` |
| 0.7 | `SimpleBuffer` (cursor R/W, compactação) | ✅ | `src/utils/simple-buffer.ts` |
| 0.8 | `NetUtil` IP/porta/compact peer (sem `getMacAddr`) | ✅ | `src/utils/net.ts` |
| 0.9 | Taxonomia de erros `PeerWireError`/`Protocol`/`Eof`/`Timeout`/`RequestRejected` | ✅ | `src/utils/errors.ts` |

### Fase 1 — Core Protocol (peerwire) ✅ CONCLUÍDA

Depende de: Fase 0 (bencode, ByteReader/Writer, BitArray, errors)

| # | Tarefa | Origem | Destino | Impacto |
|---|---|---|---|---|
| 1.1 | Codec completo de mensagens (20 tipos + `unknown`) | `peerwire/message.ts` + `constants.ts` | `src/core/message.ts` | Base para tudo |
| 1.2 | Handshake com reserved bits nomeados + encode/decode | `peerwire/handshake.ts` + `constants.ts` | `src/core/handshake.ts` | Gating por capability |
| 1.3 | Wire internals: máquina de estados, timeouts, limites, keepalive | `peerwire/peer_wire.ts` | Internals de `src/core/wire.ts` | Proteção contra peers maliciosos |
| 1.4 | Validação de ordem de disponibilidade + `expectedPeerId` | `peerwire/peer_wire.ts` | Internals de `src/core/wire.ts` | Conformidade de protocolo |
| 1.5 | Backpressure de escrita + `maxQueuedWriteBytes` | `peerwire/peer_wire.ts` | Internals de `src/core/wire.ts` | Estabilidade |
| 1.6 | `ExtensionHost` BEP 10 completo (IDs direcionais, re-handshake, `waitForPeerHandshake`) | `peerwire/extension.ts` | `src/core/extension.ts` | Base robusta p/ extensões |

### Fase 2 — Metadata & Discovery

Depende de: Fase 0 + Fase 1

| # | Tarefa | Origem | Destino | Impacto |
|---|---|---|---|---|
| 2.1 | Magnet v2 (`urn:btmh`, `buildV2`, validação, `infoHashV1/V2`) | `magnet/magnet.ts` | `src/utils/magnet.ts` | BitTorrent v2 |
| 2.2 | Metainfo identity: preservar bytes exatos, `calculateInfoHashV2`, `wrapInfoBytes` | `metainfo/identity.ts` | `src/utils/parse-torrent.ts` | Hash fiel, v2/hybrid |
| 2.3 | Metainfo parser: validação rigorosa (BEP 3/12/19/47/52) + `TorrentParseError` | `metainfo/parser.ts` + `torrent-parser/` | `src/utils/parse-torrent.ts` | Robustez |
| 2.4 | Tipos v2 (`TorrentV2Info`, `TorrentFileTree`, `PieceSizeEnum`) | `metainfo/types.ts` | `src/utils/torrent-types.ts` | v2 type safety |
| 2.5 | HTTP tracker correto (byte-a-byte percent-encoding, compact IPv4+IPv6, dedupe) | `torrent-tracker/http.ts` + `compact.ts` | `src/network/tracker.ts` | Fix bug, IPv6, limits |
| 2.6 | Tipos formais de tracker + validação de request | `torrent-tracker/types.ts` + `request.ts` | `src/network/tracker.ts` | Type safety |

### Fase 3 — Advanced Protocol

Depende de: Fase 1 + Fase 2

| # | Tarefa | Origem | Destino | Impacto |
|---|---|---|---|---|
| 3.1 | BEP 6 Fast: `suggestPiece/haveAll/haveNone/rejectRequest/allowedFast` | `peerwire/message.ts` + `peer_wire.ts` | `src/core/wire.ts` + `message.ts` | Fast peers |
| 3.2 | BEP 52 v2: `hashRequest/hashes/hashReject` | `peerwire/message.ts` + `peer_wire.ts` | `src/core/wire.ts` + `message.ts` | BitTorrent v2 |
| 3.3 | `ut_metadata` melhorado: verificação SHA-1/256, pipelining, per-block timeout | `peerwire/ut_metadata.ts` | `src/extensions/ut-metadata.ts` | Integridade + performance |
| 3.4 | `peerid` melhorado: `encode()` genérico, validators, version converters | `peerid/peerid.ts` + `util.ts` | `src/utils/peerid.ts` | Flexibilidade (manter `"LO": "BrowserTorrent"`) |
| 3.5 | `Bitfield` com spare-bit validation (manter `grow`) | `peerwire/bitfield.ts` + `BitArray` | `src/core/bitfield.ts` | Conformidade |

### Fase 4 — Browser API (funcionalidades da webtorrent.min.js)

> Funcionalidades da API pública do upstream WebTorrent que faltam no BrowserTorrent.
> Referência: `docs/webtorrent-api.md` + análise do bundle `webtorrent.min.js`.

Depende de: Fase 1 + Fase 2

| # | Tarefa | Descrição | Destino | Impacto |
|---|---|---|---|---|
| 4.1 | **File class** com `createReadStream`, `stream()` (W3C ReadableStream), `arrayBuffer()`, `blob()`, `[Symbol.asyncIterator]` | Substituir `ParsedTorrentFile` por classe viva que acessa o store | `src/core/file.ts` | 🔴 Crítico — streaming de mídia no browser |
| 4.2 | **File.streamTo(elem)** + **File.streamURL** | Expor URL de stream para `<video>`/`<audio>` via SW; depende de createServer | `src/core/file.ts` | 🔴 Crítico — playback no browser |
| 4.3 | **File.select/deselect/includes(piece)** | Piece selection por arquivo | `src/core/file.ts` | 🟡 Importante |
| 4.4 | **File events**: `stream`, `iterator`, `done` | Eventos no ciclo de vida do stream | `src/core/file.ts` | 🟡 Importante |
| 4.5 | **createServer / SW integration** | Integrar `service-worker/src/sw/webtorrent.ts` ao pkg; `client.createServer({ controller })` | `src/core/server.ts` | 🔴 Crítico — serve URLs para o browser |
| 4.6 | **Torrent.select/deselect/critical** | Priorização de pieces no Torrent | `src/core/torrent.ts` | 🟡 Importante |
| 4.7 | **Torrent.pause/resume** | Pausar retomar download | `src/core/torrent.ts` | 🟡 Importante |
| 4.8 | **Torrent.addPeer/addWebSeed/removePeer** | Gerenciamento manual de peers | `src/core/torrent.ts` + `src/network/` | 🟡 Importante |
| 4.9 | **Torrent properties**: `magnetURI`, `downloadSpeed`, `uploadSpeed`, `numPeers`, `timeRemaining`, `ratio`, `torrentFile`, `torrentFileBlob` | Getters computados + exposed state | `src/core/torrent.ts` | 🟡 Importante |
| 4.10 | **Torrent events**: `infoHash`, `warning`, `noPeers`, `idle`, `wire` | Eventos faltantes | `src/core/torrent.ts` | 🟡 Importante |
| 4.11 | **Client properties**: `downloadSpeed`, `uploadSpeed`, `progress`, `ratio` (agregados) | Soma de todos os torrents ativos | `src/mod.ts` | 🟡 Importante |
| 4.12 | **Client.throttleDownload/throttleUpload** | Limitar velocidade global | `src/mod.ts` | 🟢 Baixo |
| 4.13 | **WEBRTC_SUPPORT** static | Detectar suporte a WebRTC no browser | `src/mod.ts` | 🟢 Baixo |
| 4.14 | **Web Seeds (BEP 19)** | Fetch de dados via HTTP como peer alternativo | `src/network/web-seed.ts` (novo) | 🟡 Importante |
| 4.15 | **Piece class** com `length`, `missing` | Objeto Piece exposto na API | `src/core/piece.ts` (novo) | 🟢 Baixo |

### Fase 5 — OPFS Torrent Generator ✅ CONCLUÍDA

> Implementação browser-first do generator de `.torrent` usando OPFS.
> Referência: `docs/02-fase-5-opfs-generator.md`.

| # | Tarefa | Destino | Status |
|---|---|---|---|
| 5.1 | OPFS walker (`walkOPFSDir`) | `src/torrent-generator/opfs-walker.ts` | ✅ |
| 5.2 | OPFS reader (`OPFSMultiFileReader`) | `src/torrent-generator/opfs-reader.ts` | ✅ |
| 5.3 | Generator util (`calcPieceSize`, `sha1sum`, `isHiddenFile`) | `src/torrent-generator/util.ts` | ✅ |
| 5.4 | Generator orchestrator (`generateTorrent`) | `src/torrent-generator/generator.ts` | ✅ |
| 5.5 | Tipos (`GeneratorOptions`, `PieceSizeEnum`, `PieceFile`) | `src/torrent-generator/types.ts` | ✅ |
| 5.6 | Barrel `mod.ts` + re-export em `src/mod.ts` | `src/torrent-generator/mod.ts` | ✅ |
| 5.7 | Testes (37 testes, mock OPFS) | `tests/torrent-generator_test.ts` | ✅ |

### Fase 6 — API Final @vanaware/browsertorrent ✅ CONCLUÍDA

> Completa a API pública do `webtorrent.min.js` no browser-first BrowserTorrent.

| # | Tarefa | Destino | Status |
|---|---|---|---|
| 6.1 | Fix `FakeChunkStore` (put/close/destroy) | `tests/file_test.ts` | ✅ |
| 6.2 | `client.seed(input, opts?, cb?)` + `SeedInput`/`SeedOptions` | `src/mod.ts` | ✅ |
| 6.3 | `WebTorrent.WEBRTC_SUPPORT` static + agregados | `src/mod.ts` | ✅ |
| 6.4 | `client.throttleDownload/throttleUpload` + `client.get()` | `src/mod.ts` + `src/network/swarm.ts` | ✅ |
| 6.5 | `torrent.torrentFile`/`torrentFileBlob`/`created`/`createdBy`/`comment`/`done`/`received`/`announce`/`maxWebConns` | `src/core/torrent.ts` | ✅ |
| 6.6 | `torrent.rescanFiles(cb?)` + `torrent.select(start,end,priority,notify)` | `src/core/torrent.ts` | ✅ |
| 6.7 | `file.type` (MIME) + `file.downloaded`/`progress` (per-file) + `download`/`upload` events + `_registerFiles` | `src/core/file.ts` + `src/core/torrent.ts` | ✅ |
| 6.8 | `wire.uploadSpeed`/`downloadSpeed`/`remoteAddress`/`remotePort` + speed tracking | `src/core/wire.ts` + `src/network/peer.ts` | ✅ |
| 6.9 | Atualizar matriz de paridade QWEN.md + rodar todos os testes | `QWEN.md` + `tests/` | ✅ |

**Resultado Fase 6:** 568 testes passando, 0 type errors em todo o `src/`.

### Fase 7 — Melhorias Restantes (opcionais)

| # | Tarefa | Origem | Dificuldade |
|---|---|---|---|
| 7.1 | Fix tracker HTTP (encoding byte-a-byte, IPv6, dedupe) | `deno-torrent/torrent-tracker/http.ts` | Média |
| 7.2 | Metainfo parser rigoroso (preserva info bytes, validação BEP 3/12/19/47/52) | `deno-torrent/metainfo/` | Média |
| 7.3 | Magnet v2 + metainfo v2 types + piece layers | `deno-torrent/magnet/` + `metainfo/v2.ts` | Alta |
| 7.4 | ut_metadata pipelining + per-block timeout | `deno-torrent/peerwire/ut_metadata.ts` | Média |
| 7.5 | `peerid` genérico (`encodeAzStyle`, `encodeShadowStyle`) | `deno-torrent/peerid/` | Trivial |

### Fase 8 — Futuro (bloqueados, requer decisão arquitetural)

| # | Tarefa | Bloqueante | Alternativa browser |
|---|---|---|---|
| 8.1 | DHT (Kademlia) | UDP sockets (`Deno.listenDatagram`) | WebRTC DataChannel ou WebTransport p/ relay |
| 8.2 | uTP | Raw UDP (`Deno.NetAddr`) | WebTransport datagrams (Chrome 120+) |

## 7. Decisões arquiteturais vigentes

- **`src/core/wire.ts` segue como fachada de eventos.** A robustez do
  `peer_wire.ts` (estados, timeouts, correlação) entra como internals,
  preservando os eventos `handshake/choke/unchoke/have/bitfield/request/
  piece/cancel/extended/error`.
- **BEPs alvo de incorporação**: 5 (port), 6 (Fast), 10 (ExtensionHost
  completo), 52 (v2 hashes). BEP 9/11 já existem e serão endurecidos.
- **Sem novas dependências npm** em `src/` sem aprovação explícita.
- **torrent-generator**: não portar (Deno-only, não necessário para PWA).
- **torrent-dht + utp**: bloqueados por UDP. A lógica Kademlia (Bucket,
  RoutingTable, etc.) é browser-pura, mas o transporte não. Requer decisão
  sobre relay via WebRTC/WebTransport para viabilizar no browser.
- **File class é a prioridade browser.** O upstream WebTorrent expõe uma
  classe `File` viva com streaming (ReadableStream, streamTo, streamURL,
  arrayBuffer, blob, async iterator). `ParsedTorrentFile` é apenas dados —
  a transição para `src/core/file.ts` com acesso ao ChunkStore é essencial
  para media playback no browser.
- **createServer via Service Worker.** O BrowserTorrent já possui
  `service-worker/src/sw/webtorrent.ts` com a ponte MessageChannel para
  streaming sob demanda. A integração com o pkg webtorrent será via
  `client.createServer({ controller: ServiceWorkerRegistration })`, que
  inicializa a ponte e habilita `file.streamURL` e `file.streamTo()`.
- Comentários de documentação seguem o idioma já presente no arquivo (o
  pacote mistura PT-BR e EN; não reescrever comentários existentes só por
  idioma).

## 8. Proibições rápidas

- ❌ Copiar arquivos inteiros de `deno-torrent/` sem adaptar imports e APIs.
- ❌ Importar `@deno-torrent/*` em qualquer arquivo de `src/`.
- ❌ Remover eventos, exports ou opções públicas existentes.
- ❌ Introduzir `Deno.*`/`node:*`/`process.*` fora de `tests/`.
- ❌ "Simplificar" removendo validações de protocolo sem justificativa.
- ❌ Portar `MultiFileReader`, `getMacAddr()`, `torrent-generator/`.
- ❌ Portar `torrent-dht/` ou `utp/` sem resolver o bloqueio de transporte UDP.

## 9. Demonstração WebTorrent (v1.0)

### 9.1 Objetivo

Demonstrar o BrowserTorrent WebTorrent funcionando em navegador com streaming de vídeo P2P real:
- **Seeder (A):** compartilha um arquivo de vídeo
- **Viewer (B):** assiste ao vídeo via streaming P2P
- **Peer (C):** baixa o mesmo arquivo e participa do swarm (resiliência)

### 9.2 Stack

| Componente | Tecnologia |
|---|---|
| Runtime servidor | Deno (`deno serve` + `@std/http/file-server`) |
| UI | Preact 10.x + Signals + BeerCSS 5.x (CDN) |
| Bundler | `esbuild.ts` existente (raiz do repo) — **apenas adicionar target** |
| Output | `@vanaware/browsertorrent/build/dist/` |
| Imports UI | `https://esm.sh/preact@10.29.7`, `@preact/signals@1.3.1` |

### 9.3 Estrutura de diretórios

```
monorepo/webtorrent/
├── build/
│   └── dist/                   ← saída do esbuild (vazia, pronta)
├── example/
│   ├── public/
│   │   └── index.html          ← SPA com BeerCSS + Preact
│   ├── sw/
│   │   └── sw.ts              ← service worker (stream bridge)
│   ├── app.tsx                ← componente raiz Preact
│   ├── main.tsx              ← entry point (registra SW)
│   ├── torrent-context.tsx     ← contexto (signals: client, torrent, peers, stats)
│   ├── components/
│   │   ├── seeder-panel.tsx  ← escolha arquivo + seed
│   │   ├── viewer-panel.tsx  ← video player + magnet input
│   │   └── peer-panel.tsx    ← peers + speeds
│   └── server.ts             ← deno serve (arquivos estáticos)
```

### 9.4 Trackers públicos

```typescript
const PUBLIC_TRACKERS = [
  "wss://tracker.btorrent.xyz",
  "wss://tracker.webtorrent.io",
];
```

### 9.5 Plano de implementação

| # | Passo | Status |
|---|---|---|
| 1 | `esbuild.ts` — targets `example` + `example-sw` | ✅ |
| 2 | `example/index.html` — BeerCSS CDN + Preact mount | ✅ |
| 3 | `example/main.tsx` — bootstrap, registra SW | ✅ |
| 4 | `example/torrent-context.tsx` — signals globais | ✅ |
| 5 | `example/sw/sw.ts` — SW com MessageChannel bridge | ✅ |
| 6 | `example/app.tsx` — layout 3 painéis | ✅ |
| 7 | `example/components/seeder-panel.tsx` | ✅ |
| 8 | `example/components/viewer-panel.tsx` | ✅ |
| 9 | `example/components/peer-panel.tsx` | ✅ |
| 10 | `example/server.ts` + `deno.jsonc` tasks | ✅ |
| 11 | **Teste manual em 3 navegadores** | 🔜 |

### 9.6 Fluxo de demonstração

```
Seeder (A)          Viewer (B)           Peer (C)
    │                   │                   │
    │── Choose File ───►│                   │
    │                   │                   │
    │── Seed (seed) ───►│                   │
    │                   │                   │
    │  (magnetURI)◄────│  copy magnetURI   │
    │                   │                   │
    │                   │── Paste magnet ──►│
    │                   │                   │
    │◄──── Tracker ─────►│◄── Tracker ──────►│
    │                   │                   │
    │──── pieces ──────►│──── pieces ──────►│
    │                   │                   │
    │   <video stream>   │                   │
    │                   │  (video plays)   │
    │── closes ──────────│                   │
    │                   │                   │
    │   (viewer still   │                   │
    │    plays via C)   │                   │
```

### 9.7 Restrições de implementação

- **`esbuild.ts` é intocado** — apenas adicionar o target `example` ao CONFIG.
- **Browser-first** — todo código em `example/` roda no navegador.
- **Sem `Deno.*` em arquivos browser** — `server.ts` é servidor, pode usar Deno.
- **Zero quebra de API existente** — não modificar `src/`, `tests/`, nem `deno.jsonc` existente.


````

---

