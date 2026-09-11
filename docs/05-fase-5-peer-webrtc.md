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