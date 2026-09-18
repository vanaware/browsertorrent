# API do `@vanaware/browsertorrent` — Documentação de Referência

> Documento vivo. Reflete a API pública e modular exposta via `src/mod.ts` e seus subpath exports.

---

## 📦 Visão Geral

O `@vanaware/browsertorrent` é um cliente BitTorrent **100% browser-first** (Deno + Web APIs nativas, zero dependências de Node.js) que reproduz e aprimora a API clássica do WebTorrent.

### Subpath Exports

| Export Path | Descrição |
| --- | --- |
| `@vanaware/browsertorrent` (ou `.`) | Módulos centrais: `Client`, `Torrent`, `Swarm`, `Peer`, `Wire`, `File`, `Piece`, `parseTorrent`, `VERSION`. |
| `@vanaware/browsertorrent/service-worker` | Interceptação de fetch para streaming P2P (`createWebTorrentFetchHandler`, `handleStream`, `registerServiceWorker`). |
| `@vanaware/browsertorrent/server` | Servidor virtual de streaming (`createServer`, `WebTorrentServer`, `streamManager`). |
| `@vanaware/browsertorrent/torrent-generator` | Gerador de metadados torrent sobre OPFS (`generateTorrent`, `calcPieceSize`, `sha1sum`). |

---

## 🔑 Módulo Principal (`@vanaware/browsertorrent`)

### Classe `Client` (ou `WebTorrent`)

```ts
import { Client, WebTorrent } from "@vanaware/browsertorrent";

const client = new Client({
  peerId?: Uint8Array | string;          // hex 40 chars ou Uint8Array(20)
  maxConns?: number;                      // limite de conexões simultâneas (padrão 55)
  port?: number;                          // porta de origem (padrão 6881)
  useOPFS?: boolean;                      // padrão true; fallback em memória
  rtcConfig?: RTCConfiguration;           // configuração STUN/TURN repassada ao WebRTC
  serviceWorkerUrl?: string;              // URL do SW para registro automático
  serviceWorkerScope?: string;            // Escopo do SW (padrão "/")
});
```

#### Propriedades

| Membro | Tipo | Descrição |
| --- | --- | --- |
| `peerId` | `string` (40 hex) | Peer ID oficial derivado de `peerIdBuffer`. |
| `peerIdBuffer` | `Uint8Array(20)` | Forma binária do Peer ID com prefixo `-BT0100-`. |
| `torrents` | `Map<string, Torrent>` | Torrents ativos indexados por infoHash. |
| `torrentList` | `Torrent[]` | Lista de torrents ativos na ordem de adição. |
| `server` | `WebTorrentServer \| null` | Servidor de streaming via Service Worker. |
| `isReady` | `boolean` | `true` quando a inicialização estiver completa. |
| `isDestroyed` | `boolean` | `true` após a chamada de `destroy()`. |
| `torrentCount` | `number` | Quantidade de torrents gerenciados. |

#### Métodos

| Método | Retorno | Descrição |
| --- | --- | --- |
| `add(torrentId, opts?)` | `Promise<Torrent>` | Adiciona um torrent a partir de Magnet URI, buffer `.torrent` ou `ParsedTorrent`. |
| `seed(input, opts?)` | `Promise<Torrent>` | Cria e semeia um novo torrent a partir de `File`, `Blob`, `Uint8Array` ou arquivos OPFS. |
| `remove(infoHash, destroyStore?)` | `Promise<void>` | Remove o torrent da swarm. Se `destroyStore: true`, apaga os dados locais do OPFS. |
| `get(infoHash)` | `Torrent \| undefined` | Retorna a instância do torrent a partir de seu hash. |
| `destroy()` | `Promise<void>` | Encerra com segurança todos os torrents, conexões P2P e libera o storage. |
| `createServer(opts?)` | `WebTorrentServer` | Instancia o servidor de streaming acoplado ao Service Worker. |

#### Eventos

| Evento | Payload | Quando Ocorre |
| --- | --- | --- |
| `torrent` | `{ torrent: Torrent }` | Disparado quando um novo torrent é adicionado e começa a se conectar à swarm. |
| `error` | `{ error: Error }` | Disparado em caso de falha crítica de conexão ou protocolo. |
| `ready` | `Event` | Disparado quando o cliente está totalmente inicializado. |

---

## ⚡ Módulo Service Worker (`@vanaware/browsertorrent/service-worker`)

Desacoplado de qualquer cache específico da aplicação, fornece apenas as funções de streaming e registro:

```ts
import {
  createWebTorrentFetchHandler,
  isWebTorrentStreamRequest,
  registerServiceWorker,
} from "@vanaware/browsertorrent/service-worker";
```

| Função | Descrição |
| --- | --- |
| `createWebTorrentFetchHandler(options?)` | Cria um manipulador de fetch de streaming pronto para ser integrado a qualquer `sw.ts`. |
| `isWebTorrentStreamRequest(urlOrRequest)` | Verifica se uma URL pertence ao padrão de rota de streaming `/webtorrent/`. |
| `handleStream(req, url, pagePort, scope)` | Conecta uma requisição de range a um `ReadableStream` alimentado sob demanda pelo cliente principal via `MessageChannel`. |
| `registerServiceWorker(options?)` | Helper do lado do cliente para registrar e sincronizar o Service Worker no escopo atual. |

---

## 📁 Módulo Gerador de Torrents (`@vanaware/browsertorrent/torrent-generator`)

```ts
import {
  calcPieceSize,
  generateTorrent,
  walkOPFSDir,
} from "@vanaware/browsertorrent/torrent-generator";

// Gera um torrent diretamente a partir de um diretório no OPFS
const dirHandle = await navigator.storage.getDirectory();
const torrentBytes = await generateTorrent(dirHandle, {
  name: "meu-pacote",
  announceList: [["wss://tracker.webtorrent.dev"]],
});
```
