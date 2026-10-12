# Arquitetura e Comparação: WebTorrent Original vs BrowserTorrent

> 🏆 **REGRA DE OURO (GOLDEN RULE): Interoperabilidade Estrita**
> O `@vanaware/browsertorrent` **DEVE ser 100% interoperável** com o ecossistema original do WebTorrent:
> 1. **Cliente vs Tracker Original:** Nosso cliente (`BrowserTorrent`) funciona perfeitamente conectado aos trackers públicos oficiais (`wss://tracker.webtorrent.dev`, `wss://tracker.openwebtorrent.com`, etc.) e instâncias de `bittorrent-tracker`.
> 2. **Tracker vs Cliente Original:** O tracker em Deno (`@vanaware/browsertorrent-tracker`) atende com paridade total o cliente original WebTorrent (`webtorrent.min.js`), distribuindo ofertas/respostas SDP e métricas de swarm.
> 3. **Peer-to-Peer Misto:** Peers BrowserTorrent e WebTorrent conectam-se, trocam metadados (`ut_metadata`), anunciam peers via `ut_pex` e transferem blocos em swarms híbridas transparentemente.

---

## 1. Matriz Comparativa de Recursos e Arquitetura

| Recurso / Camada | WebTorrent Original (`webtorrent`) | BrowserTorrent (`@vanaware/browsertorrent`) | Vantagens do BrowserTorrent |
|---|---|---|---|
| **Runtime & Dependências** | Node.js nativo; exige dezenas de polyfills no browser (`buffer`, `events`, `readable-stream`, `inherits`, `process`). | **Pure Deno & Standard Web APIs**. Zero polyfills externos (`Uint8Array`, `EventTarget`, W3C `ReadableStream`). | 🚀 Bundle leve, moderno, nativo para navegadores e Deno, sem overhead de polyfills Node. |
| **Distribuição & Registry** | Publicado via npm com builds legadas UMD/Browserify. | Publicado nativamente no **JSR** (`jsr:@vanaware/browsertorrent`) com TypeScript nativo e JSDoc embutido. | 📦 Tipagem estrita de primeira classe, auditoria de slow types e documentação integrada ao JSR. |
| **Sinalização WebRTC** | `bittorrent-tracker` WebSocket JSON (baseado em ws / Node socket). | Cliente de tracker desacoplado (`TrackerClient`) + servidor dedicado (`@vanaware/browsertorrent-tracker`). | ⚡ Suporte a reconexão automática, fallback de múltiplos trackers e backpressure em Deno HTTP. |
| **Trackers Públicos** | `wss://tracker.webtorrent.dev`, `wss://tracker.openwebtorrent.com`. | Suporte 100% verificado a todos os trackers públicos WebTorrent WebSocket. | 🟢 Totalmente interoperável com a swarm pública global. |
| **Transporte P2P** | Depende da biblioteca externa `simple-peer`. | Implementação nativa direta com `RTCPeerConnection` e `RTCDataChannel` binário (`arraybuffer`). | 🛡️ Sem camada intermediária; manipulação de estados e buffers de streaming com alta eficiência. |
| **Wire Protocol (BEP 3)** | Pacote `bittorrent-protocol` externo baseado em Streams Node. | Módulo `Wire` nativo com `Message` parser, `Bitfield`, `Handshake` e keep-alive automático. | 🧩 Arquitetura desacoplada e tipada com validação rigorosa de mensagens do protocolo BitTorrent. |
| **Extensões (BEP 10)** | Suporte manual via plugins externos. | `ExtensionHost` nativo com dicionário estrito de IDs, registro modular e mensagens estendidas tipadas. | 🔌 Suporte modular e testado para extensões BitTorrent contemporâneas. |
| **Troca de Metadados (BEP 9)** | `ut_metadata` piecewise. | `UtMetadata` integrado com decodificação bencode de chunks de 16 KiB e montagem resiliente. | 📥 Recuperação e download de arquivos a partir de Magnet URIs puros sem arquivo `.torrent` prévio. |
| **Peer Exchange (BEP 11)** | `ut_pex` experimental ou via plugins externos. | `UtPexExtension` integrado com codificação/decodificação binária de flags (`PexPeerFlag`) e IPv4/IPv6. | 🌐 Descoberta acelerada de peers descentralizada sem sobrecarregar o tracker. |
| **Armazenamento / Storage** | `memory-chunk-store` ou `idb-chunk-store` (IndexedDB com transações lentas para grandes blocos). | **OPFS Chunk Store** (`FileSystemFileHandle.createWritable()`) com fallback inteligente para RAM. | 💾 Desempenho de disco quase nativo via **Origin Private File System**, permitindo gigabytes sem travar a UI. |
| **Geração de Torrents** | `create-torrent` (Node fs / Streams). | `generateTorrent` nativo direto da **Origin Private File System** (`FileSystemDirectoryHandle`). | 📁 Leitura sequencial e cálculo de SHA-1 por peças sem carregar todo o diretório na memória RAM. |
| **Streaming de Mídia** | Servidor HTTP Node.js local (`torrent.createServer()`) em ambiente desktop; no browser requer MSE complexo. | **Service Worker Streaming Bridge** com suporte completo a **HTTP 206 Partial Content** e Range headers. | 🎬 Reprodução nativa e seeking instantâneo em `<video>` e `<audio>` HTML5 sem carregar o arquivo completo. |
| **Modularidade (Subpaths)** | Pacote monolítico com ponto de entrada único ou bundles globais. | Subpaths dedicados no JSR: `.`, `./service-worker`, `./server`, `./torrent-generator`. | ✂️ Tree-shaking excelente; permite importar somente o gerador, o cliente ou o runtime do Service Worker. |
| **Isolamento de Tracker** | `bittorrent-tracker` acoplado ao ecossistema Node. | Pacote independente `@vanaware/browsertorrent-tracker` com roteador e CLI standalone. | 🌐 Tracker dedicado com cache LRU, monitoramento de saúde `/stats` e execução zero-install via JSR. |

---

## 2. Comparativo Detalhado de APIs

### 2.1 Inicialização do Cliente

#### WebTorrent Original:
```js
const WebTorrent = require('webtorrent');
const client = new WebTorrent({
  maxConns: 55,
  tracker: { rtcConfig: { ... } }
});
```

#### BrowserTorrent:
```ts
import { Client } from "jsr:@vanaware/browsertorrent";

const client = new Client({
  maxConns: 55,
  useOPFS: true,                  // Habilita persistência direta no Origin Private File System
  downloadLimit: 2 * 1024 * 1024, // Limite de download opcional (bytes/s)
  uploadLimit: 1 * 1024 * 1024,   // Limite de upload opcional (bytes/s)
  rtcConfig: {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  }
});

// Drop-in alias idêntico disponível:
// import { WebTorrent } from "jsr:@vanaware/browsertorrent";
```

---

### 2.2 Download e Gerenciamento de Torrent

| Operação / Propriedade | WebTorrent Original | BrowserTorrent (`@vanaware/browsertorrent`) | Notas de Compatibilidade |
|---|---|---|---|
| Adicionar Torrent | `client.add(torrentId, [opts], [cb])` | `client.add(torrentId, [opts]): Promise<Torrent>` | Retorna Promise e aceita callbacks/eventos para paridade total. |
| Semeação (Seed) | `client.seed(input, [opts], [cb])` | `client.seed(input, [opts]): Promise<Torrent>` | Aceita `File`, `Blob`, `Uint8Array`, `FileSystemFileHandle` e pastas OPFS. |
| Obter Torrent | `client.get(torrentId)` | `client.get(torrentId)` | Suporta busca por infoHash (40 hex) ou Magnet URI. |
| Remover Torrent | `client.remove(torrentId, [opts], [cb])` | `client.remove(torrentId, destroyStore?): Promise<void>` | Suporta exclusão física opcional do storage OPFS. |
| Destruir Cliente | `client.destroy([cb])` | `client.destroy(callback?): Promise<void>` | Fecha swarms, libera portas e interrompe trackers. |
| Progresso Global | `client.progress` (`0..1`) | `client.progress` (`0..1`) | Idêntico. |
| Velocidade de Download | `client.downloadSpeed` (bytes/s) | `client.downloadSpeed` (bytes/s) | Idêntico. |
| Velocidade de Upload | `client.uploadSpeed` (bytes/s) | `client.uploadSpeed` (bytes/s) | Idêntico. |
| Ratio de Upload/Download | `client.ratio` | `client.ratio` | Idêntico. |

---

### 2.3 Objeto `Torrent`

| Recurso | WebTorrent Original | BrowserTorrent | Detalhes |
|---|---|---|---|
| Metadados Básicos | `name`, `infoHash`, `magnetURI`, `length` | `name`, `infoHash`, `magnetURI`, `length` | 100% idêntico. |
| Lista de Arquivos | `torrent.files: File[]` | `torrent.files: File[]` | Arquivos enriquecidos com métodos nativos de stream e buffer. |
| Estatísticas | `downloadSpeed`, `uploadSpeed`, `progress`, `downloaded`, `uploaded` | `downloadSpeed`, `uploadSpeed`, `progress`, `downloaded`, `uploaded` | Idêntico. |
| Peers Conectados | `torrent.numPeers` | `torrent.numPeers` | Quantidade ativa de canais WebRTC DataChannel estabelecidos. |
| Tempo Restante | `torrent.timeRemaining` | `torrent.timeRemaining` | Estimativa em segundos calculada dinamicamente. |
| Priorização de Peças | `select(start, end, priority)` / `deselect(start, end, priority)` | `select(start, end, priority)` / `deselect(start, end, priority)` | Permite bufferização sob demanda para streaming contínuo. |
| Peças Críticas | `torrent.critical(pieceIndex)` | `torrent.critical(pieceIndex)` | Marca o bloco como emergencial (posição de seek do player). |
| Pausa e Retomada | `pause()` / `resume()` | `pause()` / `resume()` | Pausa temporária da transferência mantendo conexões ativas. |
| Eventos Emitidos | `'ready'`, `'metadata'`, `'download'`, `'upload'`, `'done'`, `'wire'`, `'error'` | `'ready'`, `'metadata'`, `'download'`, `'upload'`, `'done'`, `'wire'`, `'error'` | Suporta `.on(event, fn)`, `.addListener()` e `addEventListener()`. |

---

### 2.4 Streaming de Mídia: Desktop vs Browser Nativo

Um dos maiores diferenciais técnicos entre as duas soluções reside em como a mídia é transmitida para elementos `<video>` e `<audio>`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ WebTorrent Original (Ambiente Node / Desktop)                               │
│                                                                             │
│ [ Torrent Data ] ──> [ Servidor HTTP Interno Node.js ] ──> [ localhost:PORT ]
│                                                                   │         │
│                                            (Via Socket TCP local) ▼         │
│                                                      <video src="http://">  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ BrowserTorrent (Navegador Moderno / PWA / Service Worker)                   │
│                                                                             │
│ [ OPFS / Swarm ] ──> [ streamManager ] ◄──(MessageChannel)──► [ ServiceWorker]
│                             │                                        │      │
│                             ▼                                        ▼      │
│               [ Chunks com Backpressure ]               [ HTTP 206 Ranges ] │
│                                                                      │      │
│                                            (Interceptação de Fetch)  ▼      │
│                                            <video src="/webtorrent/...">    │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Código no WebTorrent (Desktop / Node):
```js
const server = torrent.createServer();
server.listen(port);
video.src = `http://localhost:${port}/0`;
```

#### Código no BrowserTorrent (Browser / PWA / Mobile):
```ts
import { registerAndConnectServiceWorker } from "jsr:@vanaware/browsertorrent/service-worker";
import { Client } from "jsr:@vanaware/browsertorrent";

// 1. Registra o Service Worker com escopo relativo (funciona em PWA e GitHub Pages)
await registerAndConnectServiceWorker({ scriptUrl: "./sw.js", scope: "./" });

// 2. Cria o servidor virtual de streaming conectado ao Service Worker
const client = new Client();
client.createServer({ scope: "/" });

// 3. Ao carregar o torrent, utilize diretamente a URL virtual do arquivo
const torrent = await client.add(magnetURI);
torrent.on("ready", () => {
  const file = torrent.files[0];
  video.src = file.streamURL; // ex: "/webtorrent/08ada5a7.../0/video.mp4"
});
```

---

### 2.5 Gerador de `.torrent` Metainfo

| Funcionalidade | `create-torrent` (WebTorrent) | `@vanaware/browsertorrent/torrent-generator` |
|---|---|---|
| **Origem dos Dados** | Arquivos locais em disco via Node.js `fs.createReadStream`. | Origin Private File System (`FileSystemFileHandle` / `FileSystemDirectoryHandle`). |
| **Ambiente** | Requer Node.js ou bundlers pesados no navegador. | 100% nativo do navegador via Web Cryptography API (`crypto.subtle.digest`). |
| **Alinhamento de Peças** | Suporte a BEP 47 (`alignPiece`). | Suporte nativo a BEP 47 (`.pad/...` sintético gerado automaticamente). |
| **Cálculo de Piece Size** | Heurística padrão baseada no tamanho total. | `PieceSizeEnum` com `SIZE_AUTO` (16 KiB até 16 MiB) ou pré-configurado. |
| **Saída dos Dados** | Callback com `Buffer` ou stream legada. | `Writer` assíncrono que escreve bencode progressivo sem estourar o heap. |

---

## 3. Matriz de Interoperabilidade P2P Validada

Os testes automatizados de integração cruzada (`packages/e2e/test_scenarios.js`) e testes unitários contínuos comprovam os seguintes cenários:

```
[ Cliente WebTorrent Original ]  ◄──(WebRTC DataChannel)──►  [ Cliente BrowserTorrent ]
             │                                                             │
             └──────────────► [ Tracker WebSocket ] ◄──────────────────────┘
                   (Público ou Deno @vanaware/browsertorrent-tracker)
```

1. **Cenário A: WebTorrent ↔ WebTorrent no Deno Tracker**
   - **Resultado:** ✅ APROVADO. O servidor `@vanaware/browsertorrent-tracker` gerencia a sinalização WebRTC de instâncias clássicas do WebTorrent sem alterações.
2. **Cenário B: WebTorrent ↔ BrowserTorrent Interoperabilidade**
   - **Resultado:** ✅ APROVADO. Um seeder WebTorrent original envia metadados e blocos para um leecher BrowserTorrent, e vice-versa.
3. **Cenário C: Streaming via Service Worker**
   - **Resultado:** ✅ APROVADO. Requisições parciais (HTTP 206) emitidas por navegadores buscando posições de seek funcionam com controle de fluxo contínuo.
4. **Cenário D: Trackers Públicos Mundiais**
   - **Resultado:** ✅ APROVADO. Conexão e anúncio nos trackers oficiais `wss://tracker.webtorrent.dev:443`, `wss://tracker.openwebtorrent.com:443` e `wss://open.ftorrent.com:443`.
