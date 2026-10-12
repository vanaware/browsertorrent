# BrowserTorrent P2P Presence, Rendezvous & Direct Messaging

Plano arquitetural e técnico para introduzir um subsistema de presença online, descoberta de pares conhecidos/desconhecidos e troca de mensagens diretas em tempo real utilizando a infraestrutura existente de trackers públicos WebTorrent (BEP 3/15/31) e WebRTC DataChannels nativos, mantendo o ecossistema 100% puro Deno, Preact Signals e BeerCSS.

## User Review & Critical Decisions

> [!IMPORTANT]
> As decisões de design e flexibilidade de API foram confirmadas e consolidadas:

- **Estratégias de Rendezvous & Presença (Pluggable)**: O desenvolvedor poderá escolher e alternar entre **3 métodos** suportados pela biblioteca:
  1. *Derived InfoHash (Canal Privado P2P)*: Derivação criptográfica de um InfoHash de 20 bytes a partir dos IDs/chaves públicas dos dois participantes `SHA1(sort(idA, idB))` ou segredo mútuo.
  2. *Topic / Sala Pública Comum*: Canal aberto em um InfoHash comum (ex: `SHA1("public-room:<topic>")`) onde múltiplos participantes anunciam presença simultaneamente.
  3. *Modelo Híbrido*: Entrada inicial via sala pública de descoberta para anúncio geral, migrando para swarm dedicado com InfoHash derivado ao iniciar conversa individual privada.
- **Persistência de Mensagens**: **Efêmera** durante a sessão online ativa. As mensagens transitam exclusivamente pela memória e pelo WebRTC DataChannel sem salvar histórico no IndexedDB.
- **Identificação de Usuários Desconhecidos (Pluggable)**: O desenvolvedor poderá habilitar qualquer uma das **3 modalidades**:
  1. *Handshake com Aprovação Prévia (Knock/Consent)*: Usuário desconhecido envia solicitação de introdução; o destinatário aceita ou rejeita antes de abrir o canal de bate-papo.
  2. *Sala Aberta de Descoberta*: Bate-papo livre e imediato dentro de salas/tópicos públicos.
  3. *Convite por Link/QR Code*: Compartilhamento de identificador único com metadados para adicionar contato direto.

---

## 1. Overview & Core Concept

- **O que faz**: Permite que usuários de aplicações baseadas no `@vanaware/browsertorrent` detectem quando seus contatos conhecidos estão online e troquem mensagens diretas instantâneas, ponto a ponto (P2P), sem necessidade de servidores de backend proprietários, contas centralizadas ou gateways adicionais. Apenas utilizando os servidores de WebSocket Tracker públicos já adotados pela comunidade WebTorrent (`wss://tracker.webtorrent.dev`, etc.) como broker de sinalização WebRTC.
- **Público-alvo**: Desenvolvedores de PWAs e aplicações descentralizadas (chats privados, colaboração P2P, jogos multiplayer sem servidor, descoberta de presença segura) e usuários finais do app de exemplo BrowserTorrent.
- **Valor Principal**: Descentralização real sem custos de infraestrutura de signaling, aproveitando a rede WebTorrent existente com privacidade, segurança e flexibilidade total de integração.

---

## 2. User Experience & Visual Design

- **Fluxos do Usuário**:
  1. **Perfil & Identidade**: Usuário visualiza seu próprio identificador único (Peer ID legível / ID de contato / QR Code) e pode definir seu apelido de exibição.
  2. **Contatos Conhecidos & Status Online**: Lista de contatos previamente adicionados exibindo indicador visual claro (ponto verde de presença online / cinza offline) e latência/RTT.
  3. **Janela de Chat Direto Efêmero**: Ao clicar em um contato online, uma área de conversa limpa se abre, com envio e recebimento de mensagens instantâneas e aviso visual de canal efêmero (não persistido após fechar a aba).
  4. **Descoberta & Apresentação de Desconhecidos**:
     - *Modo Handshake*: Usuário recebe notificação modal de convite ("Usuário X deseja iniciar conversa") com botões "Aceitar" e "Recusar".
     - *Modo Sala Pública*: Aba com salas temáticas onde peers presentes aparecem listados para início rápido de interação.
     - *Modo Link*: Botão para copiar link de convite contendo hash de rendezvous.
- **Identidade Visual & Tema (BeerCSS puro)**:
  - Estilo Material Design 3 sem Tailwind CSS, sem CSS inline ou classes customizadas arbitrárias.
  - Indicadores de presença com elementos semânticos (`badge`, `circle`, `chip`) e cores semânticas (`green`, `grey`).
  - Painéis laterais e drawers semânticos (`<aside>`, `<dialog>`, `<nav>`) para lista de contatos e histórico efêmero de mensagens.
  - Campos de entrada e botões em conformidade com as diretrizes BeerCSS (`<div class="field label border">`, `<button class="primary">`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Arquitetura Dual-Layer no `@vanaware/browsertorrent`**
  - *Abordagem*: Criar o módulo desacoplado `presence` dentro de `packages/core` (ex: `jsr:@vanaware/browsertorrent/presence`) que reutiliza os clientes de tracker (`WsTracker`) e abstração de canal WebRTC já consolidados na biblioteca.
  - *Por que*: Não polui o core do BitTorrent de arquivos, mas expõe uma API de primeira classe reutilizável por qualquer projeto que use Deno ou o navegador.
  - *Alternativas*: Criar um pacote monorepo separado (descartado para evitar fragmentação e facilitar o consumo direto via JSR subpath).
- **Decisão 2: Canal de Dados WebRTC Especializado para Chat/Presença**
  - *Abordagem*: Utilizar um protocolo de mensagens JSON estruturado sobre o `RTCDataChannel` com label `browsertorrent-presence` e `browsertorrent-chat`.
  - *Por que*: Evita o overhead do BitTorrent wire protocol completo (peças, bitfields, choking) quando a intenção dos peers for estritamente troca de mensagens e handshake de presença, enquanto preserva total compatibilidade de sinalização via Tracker WebSocket.
- **Decisão 3: Privacidade na Derivação de InfoHashes**
  - *Abordagem*: Para contatos conhecidos, o InfoHash de rendezvous é calculado através de hash determinístico com salt de domínio (`SHA1("browsertorrent-presence:v1:" + sort(idA, idB))`).
  - *Por que*: Evita colisões com torrents de arquivos reais e impede que terceiros que monitoram o tracker associem o tráfego a conteúdos protegidos por direitos autorais.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Camada de Aplicação / UI                        │
│             (BeerCSS + Preact Signals: Perfil, Contatos, Chat)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Módulo de Presença & Chat (BrowserTorrent)               │
│                                                                        │
│   ┌──────────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│   │   PresenceManager    │  │   DirectChat    │  │ HandshakeAuth   │   │
│   │ (Modos: Hash/Room)   │  │ (DataChannel)   │  │ (Knock/Consent) │   │
│   └──────────┬───────────┘  └────────┬────────┘  └────────┬────────┘   │
└──────────────┼───────────────────────┼────────────────────┼────────────┘
               │                       │                    │
               ▼                       ▼                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Camada de Transporte Core                       │
│                                                                        │
│   ┌───────────────────────────────┐  ┌─────────────────────────────┐   │
│   │     WebSocket Tracker Client  │  │   WebRTC DataChannel Peer   │   │
│   │      (Sinalização P2P BEP)    │  │    (Envio de Mensagens P2P) │   │
│   └──────────────┬────────────────┘  └──────────────┬──────────────┘   │
└──────────────────┼──────────────────────────────────┼──────────────────┘
                   │                                  │
                   ▼                                  ▼
      Trackers Públicos WebTorrent        Conexão P2P Direta (DataChannel)
       (wss://tracker.webtorrent.dev)         (Nenhum servidor intermediário)
```

### Entidades e Tipos de Dados

- `PresenceContact`: `{ id: string; name: string; publicKey?: string; status: 'online' | 'offline' | 'connecting'; lastSeen: number }`
- `RendezvousStrategy`: `'derived-hash' | 'public-room' | 'hybrid'`
- `HandshakePolicy`: `'knock-approval' | 'open-chat' | 'invite-only'`
- `ChatMessage`: `{ id: string; senderId: string; targetId: string; text: string; timestamp: number }` (armazenado apenas em memória reativa via Signals durante a aba aberta)
- `HandshakePayload`: `{ type: 'knock' | 'accept' | 'reject'; sender: PresenceContact; message?: string }`

### Testes & Validação
- Testes unitários com `@std/testing/bdd` e `@std/assert` para:
  - Algoritmos de derivação de `infoHash` a partir de pares de IDs.
  - Máquina de estados de `PresenceManager` e `DirectChat`.
  - Protocolo de serialização e parsing de mensagens de handshake e chat.
  - Verificação com `npm run lint` e `deno task test`.
