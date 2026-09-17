# Arquitetura de Sinalização WebRTC (Interoperabilidade WebTorrent)

## 1. Visão Geral do Protocolo WebTorrent sobre WebSocket
A comunicação P2P entre navegadores não pode ser feita via UDP/TCP direto. O WebTorrent resolve isso usando os WebSockets Trackers como **Servidores de Sinalização (Signaling Servers)**. 

### A Regra do Trickle ICE: `trickle: false`
Uma descoberta crucial na investigação do cliente `bittorrent-tracker` original é o uso de **`trickle: false`**.
O WebTorrent **não utiliza Trickle ICE** (o envio incremental de candidatos ICE). Em vez disso, o cliente aguarda o navegador reunir todos os candidatos (ICE gathering state = 'complete') e os embute dentro de um único pacote SDP (`offer` ou `answer`). 
Isso evita inundar o tracker com mensagens de candidatos individuais e simplifica o fluxo de roteamento JSON.

## 2. Tipos de Payload (Interfaces TypeScript)

Baseado no código fonte original, definimos as seguintes interfaces para o payload JSON trafegado sobre os WebSockets:

```typescript
// Interface base para mensagens SDP
export interface WebRTCSdp {
  type: 'offer' | 'answer';
  sdp: string;
}

// Oferta embutida no request de Announce
export interface TrackerOffer {
  offer: WebRTCSdp;
  offer_id: string; // ID único para a oferta (gerado pelo initiator)
}

// Request de Announce (Enviado pelo cliente ao Tracker)
export interface TrackerAnnounceRequest {
  action: 'announce';
  info_hash: string; // 20 bytes hex ou binário (normalmente hex no socket do browser)
  peer_id: string;   // 20 bytes hex ou binário
  numwant?: number;
  offers?: TrackerOffer[];     // Enviado pelo Initiator
  answer?: WebRTCSdp;          // Enviado pelo Responder (direcionado)
  to_peer_id?: string;         // Necessário quando enviando uma 'answer'
  offer_id?: string;           // Necessário quando enviando uma 'answer'
}

// Mensagem recebida do Tracker (Pode ser uma resposta ao announce, uma offer ou uma answer)
export interface TrackerMessage {
  action: 'announce' | 'scrape' | 'error';
  info_hash: string;
  
  // Resposta padrão (Lista de pares, intervalo, etc)
  interval?: number;
  complete?: number;
  incomplete?: number;
  
  // Sinalização WebRTC (Vindo de outros peers)
  peer_id?: string;    // ID do peer remoto
  offer?: WebRTCSdp;   // Se recebemos uma oferta
  offer_id?: string;   // ID da oferta recebida
  answer?: WebRTCSdp;  // Se recebemos uma resposta a uma oferta nossa
}
```

## 3. Fluxo de Sequência da Sinalização

### A. O Iniciador (Peer A) anuncia-se e envia Ofertas
1. **Peer A** decide fazer um announce.
2. Ele gera $N$ (ex: 5) ofertas WebRTC. (Instancia 5 `RTCPeerConnection` temporários ou gerenciados e aguarda o gathering complete).
3. **Peer A** envia o JSON para o Tracker contendo o array `offers`.

### B. O Tracker roteia a Oferta
1. O **Tracker** recebe o announce.
2. Ele seleciona até 5 peers aleatórios na swarm que suportam WebRTC.
3. Para cada peer selecionado (ex: **Peer B**), o Tracker envia uma mensagem JSON:
   `{ action: 'announce', peer_id: 'PeerA_ID', offer: { ... }, offer_id: 'ID1' }`

### C. O Respondedor (Peer B) recebe a Oferta e gera a Resposta
1. **Peer B** recebe a mensagem via WebSocket.
2. Ele identifica que possui uma `offer`.
3. Ele cria um `RTCPeerConnection`, aplica a oferta como `RemoteDescription` e gera uma `answer`.
4. Ele aguarda o gathering complete da `answer`.
5. **Peer B** envia um announce de volta ao Tracker endereçado ao Peer A:
   `{ action: 'announce', peer_id: 'PeerB_ID', to_peer_id: 'PeerA_ID', offer_id: 'ID1', answer: { ... } }`

### D. O Iniciador (Peer A) recebe a Resposta e conecta
1. **Tracker** roteia a mensagem para o **Peer A**.
2. **Peer A** recebe `{ action: 'announce', peer_id: 'PeerB_ID', offer_id: 'ID1', answer: { ... } }`.
3. Ele recupera a conexão WebRTC pendente correspondente ao `offer_id`.
4. Aplica a `answer` como `RemoteDescription`.
5. O estado do ICE vai para `connected`, o `RTCDataChannel` é aberto e a conexão Peer-to-Peer é estabelecida!
6. A partir daqui, as mensagens do protocolo Wire (BitTorrent) começam a fluir pelo DataChannel.

## 4. Próximos Passos na Implementação
- **Refatorar Tracker (`WsTracker`)**: Não fechar a conexão, mas atuar como um EventEmitter repassando `offer` e `answer` para o `Swarm`.
- **Refatorar Swarm**: 
  - Solicitar ofertas (offers) à classe `Peer` (ou a um gerenciador de sinalização) antes de chamar `tracker.announce()`.
  - Escutar por `offer` recebido do tracker e gerar respostas.
  - Escutar por `answer` recebido do tracker e concluir a conexão inicial.
- **Refatorar Peer**:
  - Implementar geração de Ofertas com espera do ICE (iceGatheringState).
  - Implementar método para aceitar uma Oferta Externa e devolver uma Resposta.
  - Implementar método para aceitar uma Resposta e concluir a conexão.
