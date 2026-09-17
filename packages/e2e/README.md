# BrowserTorrent E2E Tests (Playwright)

Este diretório contém os testes de ponta-a-ponta (End-to-End) para validar a interoperabilidade estrita (Golden Rule) do P2P engine em navegadores reais (Chromium).

## Requisitos do Ambiente (Debian/Ubuntu)

O Playwright necessita de bibliotecas de sistema operacional específicas para rodar navegadores em modo *headless*. Se você estiver executando isso em um ambiente Debian/Ubuntu limpo, instale as dependências abaixo:

### 1. Instalação de Dependências de Sistema

```bash
sudo apt-get update
sudo apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libcomposite1 \
    libasound2 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2
```

> **Nota:** Em ambientes como o AI Studio ou containers pré-configurados para CI, você pode rodar o instalador automático do próprio Playwright, que tentará baixar as libs necessárias:
> `npx playwright install-deps`

### 2. Instalação do Playwright (Local)

Nós rodamos estes testes usando Node.js, pois o ecossistema do Playwright em Node é o mais maduro para orquestrar as instâncias de browser, enquanto nosso código fonte principal continua em Deno.

```bash
cd packages/e2e
npm init -y
npm install -D playwright @playwright/test
```

### 3. Baixando os Binários dos Navegadores

Após instalar o pacote, o Playwright precisa baixar a versão correspondente do Chromium:

```bash
npx playwright install chromium
```

## Executando os Testes

Os scripts nesta pasta irão instanciar o servidor Deno em background, abrir abas do Chromium em modo headless e validar a transferência real de metadados e chunks de arquivo via WebRTC.

```bash
node test_webrtc_handshake.js
```
