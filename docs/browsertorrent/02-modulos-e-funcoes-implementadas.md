# Módulos e Funções Implementadas (Fases 1 a 5)

Este documento cataloga todas as funções, classes e tipos que foram implementados, refatorados e validados por testes unitários no pacote `@loco/webtorrent`.

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

A próxima fase é criar a **API Pública Principal** (`src/mod.ts`), que une todos esses módulos em uma interface limpa e pronta para ser consumida pelo Loco PWA. A API deve ser compatível com o WebTorrent original, expondo métodos como:
- `client.add(torrentId, opts)` - Adiciona um torrent (Magnet URI ou .torrent)
- `client.seed(input, opts)` - Compartilha um arquivo como seed
- `client.createServer()` - Cria um servidor HTTP para streaming (usando Service Worker)
- `torrent.files` - Lista de arquivos do torrent
- `torrent.files[0].getBlobURL()` - Gera uma URL para streaming de vídeo