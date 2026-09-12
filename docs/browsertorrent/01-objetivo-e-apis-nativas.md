# /loco/monorepo/webtorrent/docs/01-objetivo-e-apis-nativas.md

# Objetivo do Pacote `@loco/webtorrent` e Mapeamento de APIs Nativas

## 🎯 Objetivo do Projeto
O objetivo do pacote `@loco/webtorrent` é fornecer uma implementação **pura, estritamente tipada e livre de dependências do Node.js** do protocolo BitTorrent, projetada especificamente para rodar no ambiente de navegador (Browser/Deno). 

No contexto do **Loco PWA** (mensageiro descentralizado, offline-first e E2EE), este pacote permite:
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