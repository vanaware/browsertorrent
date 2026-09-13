# Estratégia de testes

Toda funcionalidade deverá possuir testes.

Regra:

```text
Implementar
    ↓
Criar teste
    ↓
Executar teste
    ↓
Corrigir
    ↓
Formatar
    ↓
Lint
    ↓
Commit
    ↓
Próxima tarefa
```

Comandos principais:

```bash
deno test -P
deno lint
deno fmt --check
```

Durante desenvolvimento:

```bash
deno fmt
deno lint
deno test -P
```

---

## Regra de desenvolvimento incremental

Não implementar grandes blocos de código de uma única vez.

Cada fase deverá ser dividida em pequenas tarefas.

Cada tarefa deverá:

1. possuir objetivo claro;
2. modificar o mínimo necessário;
3. possuir testes;
4. passar nos testes;
5. passar no lint;
6. estar formatada;
7. deixar o projeto em estado funcional.

---

## Critério de conclusão de cada fase

Uma fase não será considerada concluída apenas porque o código funciona.

Ela deverá possuir:

```text
Código
+
Testes
+
Documentação
+
Lint
+
Formatter
+
Integração
```

Critério:

```bash
deno test -P
deno lint
deno fmt --check
```

sem erros.

---

## Convenção de biblioteca de testes

O projeto usa **BDD com `describe`/`it`** da biblioteca `@std/testing/bdd` como padrão para todos os testes.

**Estilo padrão do projeto:**

```ts
import { describe, it } from "@std/testing/bdd";
import { assertEquals, assert, assertNotEquals } from "@std/assert";

describe("myFeature", () => {
  it("should do something", () => {
    assertEquals(actual, expected);
  });
});
```

**Por quê este estilo?**

- Padrão amplamente reconhecido em JS/TS
- Agrupa testes por funcionalidade (`describe`)
- Testes nomeados com `it` são claros e auto-documentáveis
- Funciona com `Deno.test` internamente

### Biblioteca de assertions

Usa-se `@std/assert` para todas as validações:

```ts
import { assertEquals, assert, assertNotEquals } from "@std/assert";
```

### Nota sobre `Deno.test()` direta

Existem testes (ex: `packages/worker-db/tests/`) usando `Deno.test({ name, fn })` diretamente sem `describe`/`it`. Este é um estilo válido mas **não é o padrão adotado**. Novos testes devem usar `describe`/`it`.