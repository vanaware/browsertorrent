# /loco/monorepo/webtorrent/docs/05-fase-5-swarm-e-ut-metadata.md

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

A extensão `ut_metadata` é essencial para o Loco, pois os usuários compartilharão **Magnet URIs** (que contêm apenas o `infoHash`), não arquivos `.torrent` completos. Esta extensão permite que um peer solicite o dicionário `info` de outro peer que já possui o torrent completo.

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

A próxima fase é criar a **API Pública Principal** (`src/mod.ts`), que une todos esses módulos em uma interface limpa e pronta para ser consumida pelo Loco PWA. A API deve ser compatível com o WebTorrent original, expondo métodos como:
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


