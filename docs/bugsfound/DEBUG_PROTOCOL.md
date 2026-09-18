# Protocolo de Depuração para Agentes de IA

Este diretório contém o histórico de investigações técnicas, falhas encontradas e soluções tentadas. 

## Como usar este diretório:
1. **LEITURA OBRIGATÓRIA**: Antes de iniciar qualquer tarefa de correção de bug, leia o arquivo mais recente em `docs/bugsfound/`.
2. **REGISTRE SUAS DESCOBERTAS**: Se você encontrar uma pista nova ou confirmar uma falha, crie ou atualize um log.
3. **PONTOS DE CONTINUIDADE**: Quando estiver prestes a atingir um limite de quota ou timeout, faça um "DUMP" do seu estado mental atual em um arquivo de log para que o próximo modelo saiba exatamente onde você parou.

## Estrutura sugerida para Logs:
- **Problema**: Descrição clara do que está falhando (ex: Teste E2E X falhando com timeout).
- **Hipótese**: O que você acha que está causando o erro.
- **Evidências**: Logs do sistema, trechos de código suspeitos.
- **Tentativas Realizadas**: O que você mudou e qual foi o resultado (sucesso/falha).
- **Próximos Passos**: Recomendações para quem assumir a tarefa.

---
*Este sistema é essencial para manter a eficiência do desenvolvimento e evitar loops de re-aprendizado.*
