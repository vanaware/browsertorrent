# Fase: Testes de Integração com Playwright (Ambiente Deno/Node)

Para assegurar que o WebRTC Signaling, Swarm e WsTracker operam de forma totalmente estável em condições reais (onde o Chromium real processa o SDP), precisamos de E2E tests (End-to-End).

## Estratégia de Teste (Playwright + Deno/Node)
O ambiente AI Studio permite a instalação e execução do `playwright`. Podemos criar um script que instancie múltiplas instâncias de Chromium em Headless mode, servindo nossa aplicação empacotada.

### Tarefas
- [ ] **Configuração do Playwright**: Criar pacote local em `packages/e2e` para isolar a configuração.
- [ ] **Teste Básico E2E Tracker**: 
  - Subir nosso `Server` local do Tracker (em Deno).
  - Lançar dois Browsers Playwright (Client A e Client B).
  - Fazer os dois conectarem na UI, processar um WebRTC Handshake no console.
- [ ] **Teste Completo E2E Torrent**: 
  - Lançar Chromium (Seeder) com um Buffer em memória.
  - Lançar Chromium (Leecher) pedindo o InfoHash.
  - Validar transferência completa da API via console injection.

