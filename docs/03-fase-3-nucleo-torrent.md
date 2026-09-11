# /loco/monorepo/webtorrent/docs/03-fase-3-nucleo-torrent.md

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