# Fase 1 - Novas Tarefas (Comprehensive Project Progress Plan)

> **Status:** Planejamento para próximas implementações
> **Base:** Documentação fase1.md (v1.0 Completa) + Status real dos testes (717 passing)
> **Objetivo:** Integração testing, Phase 6 features, cobertura de testes WebTorrent

---

## Estado Atual

- **Documentação Fase 1**: Afirma "v1.0 Completa" com 659 testes passando
- **Testes Reais**: 717 passando (indica trabalho além da documentação)
- **Status**: Funcionalidade core aparentemente completa, mas integração e features Fase 6 pendentes

---


## Fase 1 Completion: Features Remanescentes da antiga Fase 6 do @loco/webtorrent, incorporados na nova fase 1 do browsertorrent

### Status Atual da Documentação Fase 1 (de fase1.md)

**Features Fase 6 Ainda Pendentes** (ver matriz de status da Fase 1 v1.0):
- [ ] `Piece.length/missing` verificação em testes
- [ ] `Wire.uploadSpeed/downloadSpeed` verificação em testes
- [ ] `Wire.remoteAddress/remotePort` verificação em testes
- [ ] `Wire.peerId/type/extensions` verificação em testes
- [ ] `WebSeeds (BEP 19)` verificação em testes
- [ ] `SW integration` verificação em testes
- [ ] Todos os testes Layer 3 (Parity) requerendo suporte WebRTC

### Features Específicas da Fase 6 para Implementar

#### Fase 6.1 Implementação WebRTC

```typescript
// Atualmente na fase1.md: Detecção de feature WebRTC
const _WEBRTC_SUPPORT: boolean = (() => {
  if (typeof globalThis === "undefined") return false;
  return typeof (globalThis as any).RTCPeerConnection !== "undefined" ||
    typeof (globalThis as any).webkitRTCPeerConnection !== "undefined";
})();
```

**Tarefas**:
1. [ ] Implementar lógica completa de conexão WebRTC em `src/network/peer.ts` e `src/network/swarm.ts`
2. [ ] Adicionar RTCPeerConnection com configuração ICE adequada
3. [ ] Implementar signaling via mensagens WebSocket
4. [ ] Adicionar tratamento de erros WebRTC específicos e mecanismos de fallback
5. [ ] Completar detecção e reporte do `Client.WEBRTC_SUPPORT`

#### Fase 6.2 Propriedades Aprimoradas do Torrent

```typescript
// Atualmente na fase1.md: Estas têm status 🟡 (Fase 6.4)
"torrent.pieces" ✅, "torrent.torrentFile" ✅, "torrent.created/createdBy" ✅,
"torrent.comment" ✅, "torrent.done" ✅, "torrent.announce[]" ✅
```

**Tarefas**:
1. [ ] Implementar array `Piece` completo (não apenas bitfield)
2. [ ] Adicionar serialização `.torrentFile` com preservação de bytes
3. [ ] Implementar propriedades `.created`, `.createdBy`, `.comment` a partir do info do torrent
4. [ ] Adicionar propriedade `.done` que reflete `progress === 1`
5. [ ] Completar array `.announce[]` com tratamento adequado de lista de trackers

#### Fase 6.3 Propriedades Aprimoradas do File

```typescript
// Atualmente na fase1.md: Estas têm status 🟡 (Fase 6.4)
"file.downloaded", "file.progress", "file.pieceLength", "file.offset",
"file.scope", "file.pieceRange", "file.destroyed"
```

**Tarefas**:
1. [ ] Implementar rastreamento de download por arquivo (`.downloaded`)
2. [ ] Adicionar cálculo de progresso por arquivo (`.progress`)
3. [ ] Completar propriedades `.pieceLength`, `.offset`, `.scope`, `.pieceRange`
4. [ ] Adicionar flag `.destroyed` para rastreamento de cleanup
5. [ ] Implementar `.select()/.deselect()` delegação para torrent owning

#### Fase 6.4 Features Avançadas

1. [ ] Implementar array `Torrent.pieces` completo com objetos `Piece`
2. [ ] Adicionar configuração `.maxWebConns` ao Torrent
3. [ ] Implementar cálculo de `.timeRemaining`
4. [ ] Adicionar `.received` como alias de `.downloaded`
5. [ ] Completar todos os métodos do Torrent (`select`, `deselect`, `critical`, etc.)

---



## Revisão de Cobertura de Testes das Fases 3-5

#### Status Atual dos Testes:
- **Testes Core**: 32 arquivos de teste em `packages/core/tests/`
- **Testes Example**: 1 arquivo de teste (`packages/example/src/test_trackers.ts`)
- **Testes Service Worker**: 0 arquivos de teste

#### Tarefas para Completude dos Testes:

**Fase 3 (Core Protocol) Tests**:
1. [ ] Verificar que todas as implementações BEP-3/12/19/47/52 são testadas
2. [ ] Adicionar testes para novas features da Fase 6 (`Piece.length/missing`, `Wire.*`, etc.)
3. [ ] Completar testes de `Wire.uploadSpeed/downloadSpeed`

**Fase 4 (Generator) Tests**:
1. [ ] Verificar testes da API `generateTorrent`
2. [ ] Garantir que testes de integração OPFS estão completos
3. [ ] Adicionar testes para novas features do generator da Fase 6

**Fase 5 (Network) Tests**:
1. [ ] Completar testes de `Swarm` e `Peer`
2. [ ] Adicionar testes de signaling WebRTC
3. [ ] Implementar testes de WebSeeds (BEP 19)

**Fase 8 (Tracker) Tests**:
1. [ ] Criar testes abrangentes do WebSocket tracker
2. [ ] Adicionar testes de integração com client browser

---

## Resolução de Falhas Preexistentes nos Testes


---

## Plano de Prioridades de Implementação

### Imediato (Semana 1):
1. cancelled
2. Completar implementação da Fase 6.1 WebRTC
3. Verificar completude das propriedades da Fase 6.2 Torrent
4. Executar revisão de integração da Fase 2

### Semana 2-3:
1. Completar implementação das propriedades da Fase 6.3 File
2. Implementar fundação da Fase 8 WebSocket tracker
3. Adicionar cobertura de testes abrangente para novas features
4. Testes de integração example/service-worker da Fase 2

### Semana 4+:
1. Completar features avançadas da Fase 6.4
2. Testes de integração completos entre todos os componentes
3. Finalizar documentação e cobertura de testes

---

## Verificação de Cobertura de Testes

**Para cada feature implementada, verificar**:
- [ ] Testes Layer 1 API (conformidade de interface pública)
- [ ] Testes Layer 2 Behavior (correção funcional)
- [ ] Testes Layer 3 Parity (compatibilidade WebTorrent)
- [ ] Testes de integração com client browser
- [ ] Testes de compatibilidade cross-browser
- [ ] Testes de casos de borda e condições de erro
- [ ] Testes de performance e uso de memória
- [ ] Conformidade com linting e type checking

---

## Requisitos de Garantia de Qualidade

**Para cada tarefa completada**:
- [ ] Todos os testes relacionados passando
- [ ] Código passa em `deno check` (validação de tipos)
- [ ] Código passa em `deno lint` (convenções de estilo)
- [ ] Código passa em `deno fmt --check` (padrões de formatação)
- [ ] Segue convenções do projeto do código existente
- [ ] Inclui cobertura de testes abrangente
- [ ] Documenta mudanças na documentação da tarefa

---

## Integração com Fase 2 (fase2.md)

Esta nova tarefa complementa a Fase 2 existente em `docs/browsertorrent/fases/fase2.md` focando em:
- Verificação de integração entre componentes
- Completude de features da Fase 6
- Cobertura de testes WebTorrent original (ainda dentro de fase 1, adicionar tests se necessário)
- Qualidade do código (lint, tipos)

**Relação**: Fase 2 (fase2.md) = Revisão de Arquivos Existentes | Esta Fase = Novas Implementações e Testes
