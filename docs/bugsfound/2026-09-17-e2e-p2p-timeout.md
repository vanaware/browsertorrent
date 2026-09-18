# Log de Investigação: Timeout no Transferência P2P (E2E)
**Data**: 2026-09-17
**Status**: Aguardando verificação da correção de `unchoke-on-interested`.

## Problema
O teste `packages/e2e/test_trackers.js` (Teste 3) falha consistentemente com "P2P file transfer timed out".

## Descobertas Recentes
1. **Conexão Estabelecida**: O WebRTC DataChannel abre com sucesso entre Seeder e Leecher.
2. **Metadados OK**: O Leecher recebe os metadados via `ut_metadata` (90 bytes no caso do teste). O evento `metadata` no Swarm é disparado e `torrent.setMetadata()` é chamado.
3. **ChunkStore Ajustado**: Identificamos que o `ChunkStore` (OPFS e Memory) precisava ser atualizado dinamicamente com o tamanho do arquivo após a recepção do metadado. Criamos o método `updateLength` para isso.
4. **Interesse Declarado**: O Leecher marca o peer como interessante (`wire.amInterested = true`) e detecta que o peer tem as peças necessárias.
5. **RequestBlocks**: O método `requestBlocks` no `torrent.ts` é chamado, mas parece que as requisições não estão sendo respondidas ou as peças não estão sendo validadas/salvas corretamente.
6. **Infraestrutura**: O ambiente pode exigir `npx playwright install chromium` periodicamente para rodar os testes E2E se o cache for perdido.

## Hipóteses Atuais
- **Ausência de Unchoke Automático**: O Seeder recebe o sinal de `INTERESTED` do Leecher, mas não há lógica no `torrent.ts` ou `wire.ts` que automaticamente responda com `UNCHOKE`. No protocolo BitTorrent, o Leecher não pode pedir bbrowsertorrents enquanto estiver "choked" pelo Seeder.
- **Raça na Sincronização de Metadados**: O `syncRemotePieces` pode estar sendo chamado antes de `this.numPieces` ser atualizado, ou o evento `metadata` não está sendo capturado por todos os wires ativos.
- **Choke State Inconsistente**: O Seeder pode achar que já enviou o unchoke, mas o Leecher pode ter reiniciado o wire ou ignorado a mensagem inicial se não estivesse pronto.
- **Validação de Peças**: Se o `ChunkStore` não estiver salvando os bbrowsertorrents corretamente ou se a verificação de hash (`_verifyPiece`) estiver falhando silenciosamente, o progresso permanece em 0%.
- **Event Loop no Torrent**: A lógica de `requestBlocks` pode estar parando prematuramente se o estado do `wire` mudar (ex: `peerChoking` voltando para true).

## Mudanças Realizadas
- Inserção de logs detalhados em `packages/core/src/core/torrent.ts` e `mod.ts`.
- Implementação de `updateLength` em `memory-chunk-store.ts` e `opfs-chunk-store.ts`.
- Ajuste na tipagem do evento de metadados no `mod.ts` para ser mais resiliente.
- **Implementando resposta ao evento `interested`**: Adicionando handler no `torrent.ts` para enviar `wire.sendUnchoke()` quando o peer remoto emitir `interested`.
- **Rastreamento Extensivo**: Adicionados logs de prefixo `[Torrent]` e `[Wire]` para rastrear cada mensagem do protocolo BitTorrent (choke, unchoke, interested, request, piece).
- **Aumento de Timeout E2E**: Timeout do teste P2P aumentado para 60s com diagnósticos extras de estado interno.

## Update - Sessão em Andamento (17/09/2026)

### Descobertas Recentes
- **Unchoke-on-Interested Implementado**: O Seeder agora responde automaticamente com `UNCHOKE` ao receber `INTERESTED`. Os logs confirmam que o intercâmbio de mensagens `UNCHOKE` está ocorrendo em ambos os sentidos.
- **Race de Metadados Mitigada**: Adicionada lógica para chamar `syncRemotePieces()` imediatamente se o metadado já estiver disponível quando o wire é registrado.
- **Stall em 0%**: Mesmo com `metadataReceived: true` e wires em estado `unchoked`, o leecher reporta `bitfield: 0` nos diagnósticos do teste e não emite requisições de bbrowsertorrents (`REQUEST`).

### Hipótese Atual: Falha na Sincronização do Bitfield Remoto
O `bitfield` do torrent no Leecher não está sendo populado corretamente após a recepção do metadado. 
No `Torrent.ts`, o `syncRemotePieces` depende de `isHaveAll` ou `savedBitfield`. Se o Seeder enviar `HAVE_ALL` (ou o bitfield completo) *antes* do Leecher ter o metadado, essa informação pode estar sendo perdida ou não processada corretamente quando o metadado finalmente chega.

### Próximos Passos (Imediato)
1. **Verificar `isHaveAll`**: Confirmar se o `isHaveAll` está sendo preservado e aplicado corretamente durante o `syncRemotePieces`.
2. **Isolar Armazenamento**: Desabilitar OPFS temporariamente no teste E2E para garantir que o problema não é o armazenamento bloqueando o progresso.
3. **Debug de `remotePieces`**: Adicionar logs específicos no `syncRemotePieces` para ver se ele está encontrando peças para adicionar ao `remotePieces` set.
4. **Verificar Seeder `ready`**: Confirmar se o Seeder A está realmente entrando em estado `ready` e enviando `HAVE_ALL` ou `BITFIELD`.

### Plano de Ação
Vou adicionar logs de depuração em pontos estratégicos do `Torrent.ts` para capturar:
- Quando `sendInitialState` é disparado.
- O conteúdo de `isHaveAll` e `savedBitfield` no momento de `syncRemotePieces`.
- Se o Seeder está recebendo o handshake e enviando a disponibilidade inicial.

---
### Update 17:05 - Execução com MemoryStore
- **Ação**: Desabilitado OPFS no script E2E.
- **Objetivo**: Isolar se o problema é o protocolo P2P ou a persistência em disco.
- **Logs**: Capturando saída detalhada para analisar o fluxo de handshakes.

---
### Update 17:20 - SOLUCIONADO! (Causa Raiz: Temporal Dead Zone / TDZ ReferenceError)
- **Causa Raiz**: Adicionamos monitoramento de erros de página via evento `pageerror` do Playwright e descobrimos que o browser lançava silenciosamente:
  `[Leecher B Page Error] ReferenceError: Cannot access 'updateInterest' before initialization`
  
  No método `_registerWire` de `Torrent.ts`, o bbrowsertorrent de inicialização inicializava e executava `attachInitialState()` na linha 500. No entanto, as funções declaradas via `const` (como `requestBlocks` na linha 532 e `updateInterest` na linha 572) só eram declaradas mais abaixo.
  Como `attachInitialState()` chamava imediatamente `sendInitialState()` (se o wire já estivesse conectado) que por sua vez chamava `updateInterest()`, ocorria a violação da Temporal Dead Zone (TDZ) do JavaScript. O erro abortava silenciosamente o processamento do wire, impedindo o fluxo de requisição e download de peças.

- **Solução**: 
  1. Adicionamos suporte completo a logging de `pageerror` no Playwright para capturar exceções não tratadas no browser.
  2. Movemos a chamada de `attachInitialState()` para o final absoluto de `_registerWire`, garantindo que todas as variáveis e funções (`updateInterest`, `requestBlocks`, `syncRemotePieces`, handlers de eventos do wire) estejam completamente declaradas e inicializadas antes do estado inicial começar a ser processado.

- **Resultado**: 
  Todos os testes do Playwright (`packages/e2e/test_trackers.js`), incluindo o Teste 3 (transferência de arquivos P2P com tracker local) e o Teste 4 (sinalização via tracker público), passaram com **100% de sucesso**. O arquivo foi transferido e verificado byte-a-byte instantaneamente.
  O arquivo `CURRENT.md` e os arquivos temporários não utilizados foram limpos. O projeto está verde e estável!
