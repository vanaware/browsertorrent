# Decisões Arquitetônicas (ADR)

Este diretório armazena **Architecture Decision Records (ADRs)** — decisões técnicas importantes que afetam a arquitetura, design ou processo do SyntaxMesh.

## Quando criar um ADR

Crie um ADR quando a decisão:

- Afeta múltiplos pacotes ou camadas
- Envolve trade-offs não triviais (performance vs. simplicidade, compatibilidade vs. inovação)
- Define convenções que outros desenvolvedores devem seguir
- Resolve um bug difícil ou comportamento inesperado
- Introduz ou remove uma dependência significativa
- Altera o formato de dados, API pública ou contrato entre módulos

## Formato do arquivo

Nome: `NNN-titulo-kebab-case.md` (ex: `001-core-independente-do-dom.md`)

Estrutura:

```markdown
# Título da Decisão

## Contexto

Qual o problema ou oportunidade que motivou esta decisão?
Quais foram as alternativas consideradas?

## Decisão

O que foi decidido? Seja específico e acionável.

## Consequências

### Positivas
- Benefício 1
- Benefício 2

### Negativas / Riscos
- Custo/Trade-off 1
- Mitigação planejada

### Neutras / Observações
- Detalhe de implementação
- Referência a issues, PRs ou discussões relacionadas

---

**Status:** Aceito / Proposto / Obsoleto / Substituído por NNN
**Data:** YYYY-MM-DD
**Autor(es):** Nome(s)
```

## Lista de ADRs

## Lista de ADRs

| ID | Título | Status | Data |
|---|---|---|---|
| 001 | Regras para IA | Aceito | 2026-09-08 |
| 002 | Teste e processo | Aceito | 2026-09-08 |


> **Nota:** Manter esta tabela atualizada manualmente ou via script ao adicionar novos ADRs.
