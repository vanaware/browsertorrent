# /loco/monorepo/webtorrent/docs/00-api-loco-webtorrent.md

# API do `@loco/webtorrent` — Resumo consolidado

> Documento vivo.  Reflete a API pública exposta via `src/mod.ts`.
> Cada item referencia a fase e a fonte original (`webtorrent.min.js` ou inovação do Loco).

---

## 📦 Visão geral

O `@loco/webtorrent` é um cliente BitTorrent **100 % browser-first** (Deno + Web APIs nativas, sem dependências de Node.js) que reproduz e estende a API do `webtorrent.min.js` original.  As extensões do Loco incluem:

- Service Worker bridge com **backpressure real** (Fase 4.5) — substitui e melhora o `createServer` original.
- Storage **OPFS-first** com fallback em memória (Fase 3) — persiste entre sessões sem IndexedDB.
- Identidade oficial do Loco (`-LO0100-`) auto-gerada (Fase 3.4) — PeerId estável entre clientes Loco.
- Validators PeerId Azureus/Shadow completos (Fase 3.4) — reconhece qBittorrent, Transmission, BitTornado etc.
- Bitfield com validação rigorosa de spare-bits (Fase 3.5) — mais seguro que a maioria dos clientes.
- `File.streamTo(video)` assíncrono com revoke automático de URL (Fase 4.2).
- `Bitfield.fromBytes` puro Deno, sem dependências.

---

## 🔑 Exports principais (`src/mod.ts`)

### Classe `WebTorrent`

```ts
import { WebTorrent } from "@loco/webtorrent";

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
import { createServer } from "@loco/webtorrent";

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
} from "@loco/webtorrent";
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
import { Bitfield } from "@loco/webtorrent";

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
  generateLocoPeerId,
  decodePeerId,
  LOCO_PEER_ID_PREFIX,
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
} from "@loco/webtorrent";
```

| Função | Descrição |
| --- | --- |
| `generateLocoPeerId()` | Gera Peer ID oficial Loco (`-LO0100-…`). |
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
import { parseTorrent } from "@loco/webtorrent";

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
