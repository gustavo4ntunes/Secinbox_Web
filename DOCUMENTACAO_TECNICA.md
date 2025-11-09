# Documentação Técnica - SecInbox Extensão

## 📋 Visão Geral

Esta é uma extensão do Chrome (Manifest V3) desenvolvida em TypeScript que protege usuários contra phishing através de verificação automática de links. A extensão utiliza uma arquitetura modular com Service Worker, Content Scripts e uma interface popup, tudo gerenciado por um sistema de build moderno baseado em Vite.

---

## 🏗️ Arquitetura da Extensão

### Estrutura de Componentes

A extensão segue o padrão **Manifest V3** do Chrome, que divide a extensão em três contextos principais:

```
┌─────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐   │
│  │   Service    │    │   Content    │    │  Popup   │   │
│  │   Worker     │◄──►│    Script    │◄──►│   UI     │   │
│  │ (Background) │    │  (Injected)  │    │          │   │
│  └──────────────┘    └──────────────┘    └──────────┘   │
│         │                    │                  │       │
│         └────────────────────┴──────────────────┘       │
│                          │                              │
│                    chrome.runtime                       │
│                    (Message API)                        │
└─────────────────────────────────────────────────────────┘
```

### 1. Service Worker (Background Script)

**Arquivo:** `src/background.ts`  
**Contexto:** Executa em um contexto isolado, independente de qualquer página web  
**Responsabilidades:**

- Gerenciar estado global de verificação
- Cache de vereditos (memória + storage persistente)
- Comunicação com API externa
- Aplicar regras de bloqueio via Declarative Net Request
- Coordenar comunicação entre componentes

**Por que Service Worker?**  
No Manifest V3, o Chrome substituiu background pages por Service Workers. Eles são mais leves, consomem menos memória e são descarregados quando não estão em uso. No entanto, eles podem ser reiniciados a qualquer momento, então todo estado persistente deve ser salvo no `chrome.storage`.

### 2. Content Script

**Arquivo:** `src/content.ts`  
**Contexto:** Injeta código JavaScript diretamente nas páginas web visitadas  
**Responsabilidades:**

- Escanear DOM em busca de links
- Interceptar cliques em links suspeitos
- Exibir alertas ao usuário
- Observar mudanças dinâmicas no DOM (SPAs)

**Isolamento:** O Content Script roda em um contexto isolado - tem acesso ao DOM da página, mas não ao JavaScript da página. Isso evita conflitos e garante segurança.

### 3. Popup UI

**Arquivo:** `src/popup.html` + `src/popup.js`  
**Contexto:** Interface HTML que aparece ao clicar no ícone da extensão  
**Responsabilidades:**

- Exibir estado de verificação (global e por página)
- Permitir controle de verificação via switches
- Gerenciar lista de sites desativados

**Comunicação:** Comunica-se com o Service Worker via `chrome.runtime.sendMessage()` para ler/alterar estados.

---

## 🛠️ Stack Tecnológica

### TypeScript

**Por que TypeScript?**

- **Type Safety:** Previne erros em tempo de desenvolvimento
- **IntelliSense:** Autocompletar e documentação inline
- **Refatoração Segura:** Mudanças em massa com confiança
- **Chrome Extension Types:** Tipos oficiais do Chrome (`@types/chrome`) para APIs da extensão

**Configuração (`tsconfig.json`):**

```json
{
  "target": "ES2020", // Compila para ES2020
  "module": "ESNext", // Usa módulos ES6
  "moduleResolution": "Bundler", // Resolução para bundlers
  "strict": true, // Modo estrito ativado
  "types": ["chrome"] // Tipos do Chrome Extension API
}
```

### Vite - Build System

**Por que Vite?**

- **Build Rápido:** Usa esbuild para transpilação (10-100x mais rápido que webpack)
- **HMR (Hot Module Replacement):** Desenvolvimento com recarregamento instantâneo
- **Rollup Interno:** Bundling otimizado para produção
- **Zero Config:** Funciona bem com TypeScript out-of-the-box

**Configuração (`vite.config.ts`):**

```typescript
export default defineConfig({
  build: {
    outDir: "dist", // Diretório de saída
    rollupOptions: {
      input: {
        background: "src/background.ts", // Entry point do Service Worker
        content: "src/content.ts", // Entry point do Content Script
        popup: "src/popup.html", // Entry point do Popup
      },
      output: {
        entryFileNames: "[name].js", // background.js, content.js, popup.js
        chunkFileNames: "chunks/[name]-[hash].js", // Chunks com hash
        assetFileNames: "assets/[name]-[hash][extname]", // Assets com hash
      },
    },
    sourcemap: true, // Gera source maps para debug
    target: "es2020", // Target ES2020
    minify: false, // Sem minificação (para debug)
  },
});
```

**Como funciona o build:**

1. **Entry Points:** Vite identifica os três entry points (background, content, popup)
2. **Transpilação:** TypeScript → JavaScript (ES2020) usando esbuild
3. **Bundling:** Rollup agrupa dependências e cria bundles otimizados
4. **Asset Processing:** CSS processado, assets copiados
5. **Output:** Arquivos finais em `dist/` prontos para o Chrome

### Tailwind CSS

**Por que Tailwind?**

- **Utility-First:** Classes utilitárias ao invés de CSS customizado
- **Purge Automático:** Remove CSS não utilizado no build
- **Design System:** Consistência visual rápida
- **Vite Plugin:** Integração nativa via `@tailwindcss/vite`

**Uso no Projeto:**

- Popup UI estilizado com classes Tailwind
- Tema escuro nativo (slate-900, slate-800, etc.)
- Responsividade e animações via utilities

**Processamento:**

```typescript
// vite.config.ts
plugins: [
  tailwindcss(), // Processa @tailwind directives e gera CSS
];
```

O Tailwind escaneia os arquivos HTML/JS e gera apenas o CSS necessário. No build, isso resulta em arquivos CSS otimizados em `dist/assets/`.

### SweetAlert2

**Por que SweetAlert2?**

- **Alertas Modernos:** Substitui `alert()` nativo por modais bonitos
- **Customizável:** Temas, ícones, animações
- **Acessível:** Melhor UX que alertas nativos

**Integração:**

```typescript
// content.ts
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

// Uso
Swal.fire({
  title: "SecInbox",
  text: "Link bloqueado por suspeita de phishing.",
  icon: "warning",
});
```

**Tema Adaptativo:** O código detecta tema escuro/claro do sistema e ajusta cores do SweetAlert2 dinamicamente via CSS injetado.

---

## 🔄 Processo de Build (Dist)

### Comando de Build

```bash
npm run build
```

### O que acontece durante o build:

#### 1. **Vite Inicia**

- Lê `vite.config.ts`
- Identifica entry points: `background.ts`, `content.ts`, `popup.html`

#### 2. **TypeScript Compilation**

- `tsconfig.json` é usado para configuração
- Cada arquivo `.ts` é transpilado para `.js` (ES2020)
- Source maps são gerados (`.map` files)

#### 3. **Dependency Resolution**

- Vite analisa imports (`import ... from ...`)
- Resolve dependências do `node_modules`
- Para `sweetalert2`, inclui no bundle do content script

#### 4. **Bundling (Rollup)**

- **Background:** `background.ts` → `dist/background.js`
  - Inclui código do whitelist (importado)
  - Não inclui dependências grandes (usa APIs nativas do Chrome)
- **Content:** `content.ts` → `dist/content.js`
  - Inclui SweetAlert2 (bundle completo)
  - Inclui lógica de varredura e bloqueio
- **Popup:** `popup.html` → processado
  - HTML copiado para `dist/popup.html`
  - JavaScript inline/importado → `dist/popup.js`
  - CSS do Tailwind → `dist/assets/popup-[hash].css`

#### 5. **Asset Processing**

- **Tailwind CSS:** Processa `styles/tailwind.css` → gera CSS final
- **Static Copy Plugin:** Copia arquivos estáticos:
  - `public/manifest.json` → `dist/manifest.json`
  - `public/icon128.png` → `dist/icon128.png`
  - `src/popup.html` → `dist/popup.html`

#### 6. **Output Final (`dist/`)**

```
dist/
├── background.js          # Service Worker compilado
├── background.js.map      # Source map
├── content.js             # Content Script compilado
├── content.js.map         # Source map
├── popup.html             # HTML do popup
├── popup.js               # JavaScript do popup
├── popup.js.map           # Source map
├── manifest.json          # Manifest da extensão
├── icon128.png            # Ícone
└── assets/
    ├── content-[hash].css # CSS do content (se houver)
    └── popup-[hash].css   # CSS do popup (Tailwind)
```

### Hash nos Assets

Os hashes (`[hash]`) garantem cache busting - quando o conteúdo muda, o hash muda, forçando o navegador a baixar a nova versão.

---

## 🔌 Chrome Extension APIs Utilizadas

### 1. chrome.storage.local

**O que é:** Sistema de armazenamento persistente da extensão  
**Uso no Projeto:**

- Armazena estado global de verificação
- Cache de vereditos (72h TTL - 3 dias)
- Estado de verificação por domínio

**Exemplo:**

```typescript
// Salvar
await chrome.storage.local.set({
  'scanEnabled:__global__': true,
  'ap_verdicts_v1': { 'https://site.com': { verdict: 'safe', expiresAt: ... } }
});

// Ler
const data = await chrome.storage.local.get('scanEnabled:__global__');
```

**Por que `local` e não `sync`?**

- `sync` tem limite de 100KB e sincroniza entre dispositivos
- `local` tem limite de 10MB e é mais rápido
- Cache de vereditos pode ser grande, então `local` é ideal

### 2. chrome.runtime.sendMessage / onMessage

**O que é:** Sistema de mensagens entre componentes da extensão  
**Uso no Projeto:**

- Content Script ↔ Service Worker
- Popup ↔ Service Worker

**Padrão de Mensagens:**

```typescript
// Enviar mensagem
const response = await chrome.runtime.sendMessage({
  type: 'PAGE_URLS_BATCH',
  urls: ['https://site1.com', 'https://site2.com']
});

// Receber mensagem (Service Worker)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_URLS_BATCH') {
    // Processar
    sendResponse({ ok: true, verdictMap: {...} });
  }
  return true; // Mantém canal aberto para resposta assíncrona
});
```

**Por que `return true`?**  
No listener, retornar `true` indica que a resposta será assíncrona (via `sendResponse` em callback async). Sem isso, o Chrome fecha o canal antes da resposta.

### 3. chrome.declarativeNetRequest

**O que é:** API para bloquear/modificar requisições de rede de forma declarativa  
**Uso no Projeto:**

- Bloqueia requisições a domínios suspeitos/maliciosos

**Como funciona:**

```typescript
// Criar regra de bloqueio
await chrome.declarativeNetRequest.updateDynamicRules({
  addRules: [
    {
      id: 210001,
      priority: 1,
      action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
      condition: {
        urlFilter: "https://malicious-site.com/*",
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
          chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
        ],
      },
    },
  ],
});
```

**Vantagens:**

- Bloqueio nativo do Chrome (mais eficiente que interceptar manualmente)
- Funciona antes da requisição ser feita
- Não requer permissões adicionais além de `declarativeNetRequest`

**Limitações:**

- Máximo de 30.000 regras dinâmicas
- IDs devem ser únicos (usamos hash do hostname)

### 4. chrome.tabs

**O que é:** API para interagir com abas do navegador  
**Uso no Projeto:**

- Obter aba ativa (popup)
- Enviar mensagens para content scripts de abas específicas
- Limpar estado quando aba é fechada

**Exemplo:**

```typescript
// Obter aba ativa
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

// Enviar mensagem para content script
chrome.tabs.sendMessage(tabId, { type: "SCANNING_STATE", enabled: true });
```

### 5. Manifest V3

**Arquivo:** `public/manifest.json`

**Estrutura:**

```json
{
  "manifest_version": 3, // Versão 3 (mais recente)
  "background": {
    "service_worker": "background.js", // Service Worker ao invés de background page
    "type": "module" // Suporta ES modules
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"], // Injeta em todas as URLs
      "js": ["content.js"],
      "run_at": "document_end" // Executa após DOM carregar
    }
  ],
  "permissions": [
    "storage", // chrome.storage
    "tabs", // chrome.tabs
    "activeTab", // Acesso à aba ativa
    "declarativeNetRequest" // Bloquear requisições
  ],
  "host_permissions": ["<all_urls>"] // Acesso a todas as URLs
}
```

**Diferenças do Manifest V2:**

- Service Worker ao invés de Background Page
- `host_permissions` separado de `permissions`
- `declarativeNetRequest` ao invés de `webRequest` (mais seguro)

---

## 🔄 Fluxo de Dados Completo

### 1. Inicialização da Extensão

```
┌─────────────────────────────────────────────────────────┐
│ 1. Chrome carrega extensão                              │
│    - Lê manifest.json                                   │
│    - Registra Service Worker                            │
│    - Prepara Content Scripts                            │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Service Worker inicia (background.ts)                │
│    - Carrega whitelist.ts                               │
│    - Inicializa Maps (scanningState, memoryCache)       │
│    - Registra listeners de mensagens                    │
│    - Carrega estado do chrome.storage.local             │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Usuário navega para página web                       │
│    - Chrome detecta match com <all_urls>                │
│    - Injeta content.ts na página                        │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Content Script executa                               │
│    - Consulta estado de verificação (background)        │
│    - Aplica estado inicial                              │
│    - Injeta estilos SweetAlert2                         │
│    - Executa scanAndSendBatch() (primeira varredura)    │
│    - Inicia MutationObserver                            │
└─────────────────────────────────────────────────────────┘
```

### 2. Varredura de Links

```
┌─────────────────────────────────────────────────────────┐
│ Content Script: scanAndSendBatch()                      │
│   1. collectAllUrlsFast()                               │
│      - querySelectorAll('a[href]')                      │
│      - Filtra links visíveis/clicáveis                  │
│      - Normaliza URLs                                   │
│   2. diffNew()                                          │
│      - Remove URLs já processadas (seenUrls Set)        │
│   3. chrome.runtime.sendMessage('PAGE_URLS_BATCH')      │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Service Worker: Listener 'PAGE_URLS_BATCH'              │
│   1. requestApiBatch(urls)                              │
│      a) isWhitelisted() - Separa whitelisted            │
│      b) splitKnownUnknown()                             │
│         - Verifica memoryCache (10min TTL)              │
│         - Verifica chrome.storage.local (72h TTL)       │
│      c) Se houver unknown:                              │
│         - POST para API (localhost:5000/analisar/)      │
│         - Processa resposta                             │
│         - Salva em cache (memória + storage)            │
│   2. applyBlockRulesFor()                               │
│      - Cria regras DNR para URLs suspeitas/maliciosas   │
│   3. sendResponse({ verdictMap })                       │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Content Script: Recebe resposta                         │
│   1. Atualiza blockedUrlsCache / safeUrlsCache          │
│   2. Pronto para bloquear cliques                       │
└─────────────────────────────────────────────────────────┘
```

### 3. Bloqueio de Clique

```
┌─────────────────────────────────────────────────────────┐
│ Usuário clica em link                                   │
│    - Event 'mousedown' dispara                          │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Content Script: Event Listener                          │
│   1. Encontra elemento <a> no path do evento            │
│   2. isUrlBlockedSync(href)                             │
│      - Verifica blockedUrlsCache (síncrono)             │
│      - Se encontrado: bloqueia + alerta                 │
│      - Se safeUrlsCache: permite                        │
│      - Se null: precisa verificar                       │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼ (se não está no cache)
┌─────────────────────────────────────────────────────────┐
│ Content Script: Verificação Assíncrona                  │
│   1. event.preventDefault() (bloqueia temporariamente)  │
│   2. chrome.runtime.sendMessage('IS_URL_BLOCKED')       │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Service Worker: Listener 'IS_URL_BLOCKED'               │
│   1. isWhitelisted() - Verifica whitelist               │
│   2. loadFromCache() - Verifica memória                 │
│   3. loadStore() - Verifica storage                     │
│   4. Se não encontrado: requestApiBatch([url])          │
│   5. sendResponse({ blocked: [...] })                   │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Content Script: Recebe resposta                         │
│   1. Se bloqueada:                                      │
│      - Atualiza blockedUrlsCache                        │
│      - Swal.fire() - Exibe alerta                       │
│   2. Se segura:                                         │
│      - Atualiza safeUrlsCache                           │
│      - anchorEl.click() - Executa clique programático   │
└─────────────────────────────────────────────────────────┘
```

### 4. Controle pelo Usuário (Popup)

```
┌─────────────────────────────────────────────────────────┐
│ Usuário abre popup                                      │
│    - popup.html carrega                                 │
│    - popup.js executa init()                            │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Popup: Inicialização                                    │
│   1. getActiveTab() - Obtém aba ativa                   │
│   2. readStates()                                       │
│      - GET_GLOBAL_STATE (background)                    │
│      - IS_SCANNING_ENABLED (background)                 │
│   3. applyUI() - Atualiza switches e textos             │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Usuário alterna switch                                  │
│    - Event 'change' dispara                             │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Popup: Handler do Switch                                │
│   1. chrome.runtime.sendMessage('TOGGLE_GLOBAL')        │
│      ou 'TOGGLE_SCANNING'                               │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Service Worker: Processa Toggle                         │
│   1. Atualiza chrome.storage.local                      │
│   2. Atualiza scanningState Map (se for por aba)        │
│   3. broadcastEffectiveToAllTabs() (se global)          │
│      - Envia 'SCANNING_STATE' para todas as abas        │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Content Script: Recebe 'SCANNING_STATE'                 │
│   1. applyScanningState(enabled)                        │
│   2. Atualiza __AP_scanningEnabled                      │
│   3. Adiciona/remove atributo data-ap-scan-disabled     │
│   4. MutationObserver respeita novo estado              │
└─────────────────────────────────────────────────────────┘
```

---

## 🧠 Conceitos Técnicos Importantes

### 1. Service Worker Lifecycle

**Problema:** Service Workers podem ser descarregados a qualquer momento  
**Solução:** Todo estado persistente vai para `chrome.storage.local`

```typescript
// ❌ ERRADO - Estado perdido quando SW reinicia
let globalState = true;

// ✅ CORRETO - Estado persistente
await chrome.storage.local.set({ state: true });
const { state } = await chrome.storage.local.get("state");
```

### 2. Content Script Isolation

**Problema:** Content Script não pode acessar JavaScript da página  
**Solução:** Comunicação via `window.postMessage` se necessário (não usado aqui)

**Isolamento:**

- Content Script tem seu próprio `window` e `document`
- Pode ler DOM da página, mas não variáveis JavaScript da página
- Isso evita conflitos e garante segurança

### 3. Message Passing Assíncrono

**Problema:** Mensagens podem demorar (API calls)  
**Solução:** Retornar `true` no listener e usar `sendResponse` em callback async

```typescript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const result = await someAsyncOperation();
    sendResponse({ ok: true, data: result });
  })();
  return true; // Mantém canal aberto
});
```

### 4. Cache em Duas Camadas

**Estratégia:** Memória (rápido, temporário) + Storage (lento, persistente)

```typescript
// Camada 1: Memória (10min) - O(1) lookup
memoryCache.set(url, { verdict, expiresAt });

// Camada 2: Storage (72h - 3 dias) - Persiste entre reinícios
await chrome.storage.local.set({ 'ap_verdicts_v1': {...} });
```

**Por quê?**

- Memória: Acesso instantâneo, mas perdido quando SW reinicia
- Storage: Persiste, mas mais lento (I/O assíncrono)
- Combinação: Melhor dos dois mundos

### 5. Declarative Net Request (DNR)

**Problema:** Bloquear requisições de forma eficiente  
**Solução:** DNR bloqueia no nível do navegador, antes da requisição

**Vantagens sobre webRequest (V2):**

- Mais eficiente (nativo do Chrome)
- Não requer permissão `webRequest` (mais seguro)
- Funciona mesmo se Service Worker estiver descarregado

**Limitações:**

- Máximo 30.000 regras dinâmicas
- Não pode modificar requisições (apenas bloquear/redirecionar)
- IDs devem ser únicos (usamos hash do hostname)

### 6. MutationObserver para SPAs

**Problema:** Páginas dinâmicas (React, Vue, etc.) adicionam links após carregamento  
**Solução:** MutationObserver detecta mudanças no DOM

```typescript
const observer = new MutationObserver(debounce(() => scanAndSendBatch(), 500));
observer.observe(document.documentElement, {
  childList: true, // Novos elementos
  subtree: true, // Em toda árvore
  attributes: true, // Mudanças em atributos (href, src)
});
```

**Debounce:** Aguarda 500ms de inatividade antes de escanear, evitando execuções excessivas.

### 7. Event Capture Phase

**Problema:** Outros scripts podem interceptar cliques antes  
**Solução:** Usar `capture: true` para executar primeiro

```typescript
document.addEventListener("mousedown", handler, true);
//                                                      ^^^^
//                                            Capture phase
```

**Fases do Event:**

1. **Capture:** Window → Document → ... → Target (nossa extensão aqui)
2. **Target:** No elemento alvo
3. **Bubble:** Target → ... → Document → Window

### 8. URL Normalization

**Problema:** Mesma URL com diferentes formatos (hash, query params)  
**Solução:** Normalizar antes de processar

```typescript
function normalizeUrl(u: string): string {
  const x = new URL(u, location.href);
  x.hash = ""; // Remove hash
  return x.toString();
}
```

**Exemplo:**

- `https://site.com/page#section` → `https://site.com/page`
- Evita processar a mesma URL múltiplas vezes

### 9. Whitelist com Subdomínios

**Problema:** Verificar subdomínios (mail.google.com, drive.google.com)  
**Solução:** Verificar domínios pais recursivamente

```typescript
function isWhitelisted(url: string): boolean {
  const hostname = new URL(url).hostname.toLowerCase();
  const parts = hostname.split(".");

  // Verifica: mail.google.com, google.com, com
  for (let i = 1; i < parts.length; i++) {
    const parentDomain = parts.slice(i).join(".");
    if (WHITELIST_SET.has(parentDomain)) return true;
  }
  return false;
}
```

### 10. Source Maps

**O que são:** Arquivos `.map` que mapeiam código compilado → código fonte  
**Uso:** Debug no Chrome DevTools mostra TypeScript original, não JavaScript compilado

**Configuração:**

```typescript
// vite.config.ts
build: {
  sourcemap: true; // Gera .map files
}
```

**Resultado:** Ao debugar `background.js`, o DevTools mostra `background.ts` original.

---

## 🔗 Como Tudo se Conecta

### Dependências entre Arquivos

```
whitelist.ts
    │
    │ (importado por)
    ▼
background.ts ──┐
    │           │
    │ (comunica via) chrome.runtime
    │           │
    ▼           ▼
content.ts  popup.js
    │           │
    │           │ (lê/escreve)
    │           ▼
    │      popup.html
    │
    │ (injeta)
    ▼
  DOM da página
```

### Fluxo de Imports

**background.ts:**

```typescript
import { WHITELIST_SET } from "./whitelist";
// Vite resolve → inclui código do whitelist no bundle
```

**content.ts:**

```typescript
import Swal from "sweetalert2";
// Vite resolve → inclui SweetAlert2 no bundle do content.js
```

**popup.js:**

```typescript
// Sem imports externos (usa apenas Chrome APIs)
// Tailwind CSS processado separadamente
```

### Comunicação entre Componentes

```
┌─────────────┐         chrome.runtime         ┌─────────────┐
│   Content   │◄──────────────────────────────►│  Background │
│   Script    │    sendMessage / onMessage     │   (SW)      │
└─────────────┘                                 └─────────────┘
      │                                                 │
      │                                                 │
      │ (acessa DOM)                                    │ (armazena)
      │                                                 │
      ▼                                                 ▼
┌─────────────┐                                 ┌─────────────┐
│  Página Web │                                 │   Storage   │
│    (DOM)    │                                 │    Local    │
└─────────────┘                                 └─────────────┘

┌─────────────┐         chrome.runtime         ┌─────────────┐
│    Popup    │◄──────────────────────────────►│  Background │
│     UI      │    sendMessage / onMessage     │   (SW)      │
└─────────────┘                                 └─────────────┘
      │                                                 │
      │ (lê/escreve)                                    │ (lê/escreve)
      │                                                 │
      ▼                                                 ▼
┌─────────────┐                                 ┌─────────────┐
│   chrome.   │                                 │   Storage   │
│    tabs     │                                 │    Local    │
└─────────────┘                                 └─────────────┘
```

### Build Time vs Runtime

**Build Time (Vite):**

- TypeScript → JavaScript
- Bundling de dependências
- Processamento de CSS (Tailwind)
- Cópia de assets estáticos
- Geração de source maps

**Runtime (Chrome):**

- Service Worker carrega `background.js`
- Content Script injeta `content.js` nas páginas
- Popup carrega `popup.html` + `popup.js` + CSS
- Comunicação via `chrome.runtime`
- Armazenamento via `chrome.storage`

---

## 🎯 Decisões de Design

### Por que Manifest V3?

- **Segurança:** Service Workers mais seguros que Background Pages
- **Performance:** Menor consumo de memória
- **Futuro:** V2 será descontinuado

### Por que TypeScript?

- **Type Safety:** Previne erros comuns
- **Developer Experience:** Autocompletar, refatoração
- **Manutenibilidade:** Código mais legível e documentado

### Por que Vite?

- **Velocidade:** Build 10-100x mais rápido
- **Simplicidade:** Configuração mínima
- **Moderno:** Suporte nativo a ES modules, TypeScript

### Por que Cache em Duas Camadas?

- **Performance:** Memória para acesso rápido
- **Persistência:** Storage para sobreviver a reinícios
- **Eficiência:** Reduz chamadas à API

### Por que Declarative Net Request?

- **Eficiência:** Bloqueio nativo do Chrome
- **Segurança:** Não requer permissões invasivas
- **Confiabilidade:** Funciona mesmo se SW estiver descarregado

### Por que MutationObserver?

- **SPA Support:** Detecta mudanças dinâmicas no DOM
- **Eficiência:** Debounce evita execuções excessivas
- **Compatibilidade:** Funciona com qualquer framework

---

## 📦 Estrutura Final do Projeto

```
SecInbox_extensao/
├── src/                          # Código fonte
│   ├── background.ts            # Service Worker
│   ├── content.ts               # Content Script
│   ├── popup.html               # HTML do popup
│   ├── popup.js                 # JavaScript do popup
│   ├── whitelist.ts             # Lista de domínios confiáveis
│   └── styles/
│       └── tailwind.css         # Estilos Tailwind
├── public/                       # Assets estáticos
│   ├── manifest.json            # Manifest da extensão
│   └── icon128.png              # Ícone
├── dist/                         # Build output (gerado)
│   ├── background.js            # Service Worker compilado
│   ├── content.js               # Content Script compilado
│   ├── popup.html               # HTML do popup
│   ├── popup.js                 # JavaScript do popup
│   ├── manifest.json            # Manifest copiado
│   ├── icon128.png              # Ícone copiado
│   └── assets/                  # CSS e outros assets
├── node_modules/                 # Dependências
├── package.json                  # Dependências e scripts
├── tsconfig.json                 # Configuração TypeScript
├── vite.config.ts               # Configuração Vite
└── DOCUMENTACAO_TECNICA.md      # Este arquivo
```

---

## 🚀 Como Usar o Projeto

### Desenvolvimento

```bash
# Instalar dependências
npm install

# Build em modo watch (recarrega ao salvar)
npm run dev

# Carregar extensão no Chrome:
# 1. chrome://extensions/
# 2. Ativar "Modo do desenvolvedor"
# 3. "Carregar sem compactação"
# 4. Selecionar pasta dist/
```

### Produção

```bash
# Build para produção
npm run build

# Resultado em dist/ pronto para publicação
```

### Debug

- **Service Worker:** `chrome://extensions/` → "Inspecionar visualizações" → "service worker"
- **Content Script:** DevTools da página → Console (executa no contexto da página)
- **Popup:** Clique direito no ícone → "Inspecionar pop-up"

---

## 🔍 Pontos de Extensão Futuros

1. **API Externa:** Trocar `localhost:5000` por API real da SecInbox
2. **Analytics:** Adicionar métricas de uso
3. **Notificações:** Notificar usuário sobre ameaças bloqueadas
4. **Whitelist Customizada:** Permitir usuário adicionar domínios
5. **Histórico:** Mostrar histórico de links bloqueados
6. **Configurações Avançadas:** Mais opções de personalização

---

**Fim da Documentação Técnica**
