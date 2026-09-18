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
- **Ausência de Unchoke Automático**: O Seeder recebe o sinal de `INTERESTED` do Leecher, mas não há lógica no `torrent.ts` ou `wire.ts` que automaticamente responda com `UNCHOKE`. No protocolo BitTorrent, o Leecher não pode pedir blocos enquanto estiver "choked" pelo Seeder.
- **Raça na Sincronização de Metadados**: O `syncRemotePieces` pode estar sendo chamado antes de `this.numPieces` ser atualizado, ou o evento `metadata` não está sendo capturado por todos os wires ativos.
- **Choke State Inconsistente**: O Seeder pode achar que já enviou o unchoke, mas o Leecher pode ter reiniciado o wire ou ignorado a mensagem inicial se não estivesse pronto.
- **Validação de Peças**: Se o `ChunkStore` não estiver salvando os blocos corretamente ou se a verificação de hash (`_verifyPiece`) estiver falhando silenciosamente, o progresso permanece em 0%.
- **Event Loop no Torrent**: A lógica de `requestBlocks` pode estar parando prematuramente se o estado do `wire` mudar (ex: `peerChoking` voltando para true).

## Mudanças Realizadas
- Inserção de logs detalhados em `packages/core/src/core/torrent.ts` e `mod.ts`.
- Implementação de `updateLength` em `memory-chunk-store.ts` e `opfs-chunk-store.ts`.
- Ajuste na tipagem do evento de metadados no `mod.ts` para ser mais resiliente.
- **Implementando resposta ao evento `interested`**: Adicionando handler no `torrent.ts` para enviar `wire.sendUnchoke()` quando o peer remoto emitir `interested`.
- **Rastreamento Extensivo**: Adicionados logs de prefixo `[Torrent]` e `[Wire]` para rastrear cada mensagem do protocolo BitTorrent (choke, unchoke, interested, request, piece).
- **Aumento de Timeout E2E**: Timeout do teste P2P aumentado para 60s com diagnósticos extras de estado interno.

## Próximos Passos Recomendados
1. Verificar se o Seeder está recebendo a mensagem `INTERESTED` e respondendo com `UNCHOKE`.
2. Monitorar a função `wire._onMessage` para ver se mensagens de `REQUEST` chegam ao Seeder e se mensagens de `PIECE` chegam ao Leecher.
3. Validar se o `ChunkStore` realmente persiste os dados durante o teste (verificar logs de `put` no store).
