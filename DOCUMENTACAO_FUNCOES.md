# Documentação de Funções - SecInbox Extensão

Este documento descreve todas as funções do projeto em ordem de execução, explicando o propósito e funcionamento de cada uma.

---

## 📋 Índice de Arquivos

1. **whitelist.ts** - Lista de domínios confiáveis
2. **background.ts** - Service Worker (gerenciamento de estado, cache e bloqueio)
3. **content.ts** - Content Script (varredura de links nas páginas)
4. **popup.js** - Interface do usuário (controle da extensão)

---

## 1. whitelist.ts

### 1.1. `WHITELIST_DOMAINS` (Constante)

**Tipo:** Array de strings  
**Ordem de execução:** Carregada na inicialização do módulo  
**Função:** Define uma lista de domínios confiáveis que não precisam ser verificados pela API. Inclui domínios de grandes empresas (Google, Microsoft, Apple, etc.), bancos brasileiros, serviços governamentais e plataformas conhecidas.

**Domínios incluídos:**

- Empresas de tecnologia: google.com, microsoft.com, apple.com, amazon.com
- Redes sociais: facebook.com, linkedin.com
- Serviços de desenvolvimento: github.com, gitlab.com, atlassian.net
- Comunicação: slack.com, zoom.us
- Email: outlook.com, yahoo.com, protonmail.com
- Bancos: bradesco.com.br, santander.com.br, caixa.gov.br
- Pagamentos: paypal.com, visa.com, mastercard.com
- Governo: gov.br, fazenda.gov.br, receita.fazenda.gov.br

---

### 1.2. `WHITELIST_SET` (Constante)

**Tipo:** Set<string>  
**Ordem de execução:** Carregada na inicialização do módulo  
**Função:** Converte o array `WHITELIST_DOMAINS` em um Set para permitir busca O(1) (tempo constante) ao verificar se um domínio está na whitelist. Isso otimiza a performance das verificações.

---

## 2. background.ts

### 2.1. Estado de Verificação (Toggle)

#### 2.1.1. `scanningState` (Map)

**Tipo:** `Map<number, boolean>`  
**Ordem de execução:** Inicializado no carregamento do service worker  
**Função:** Armazena o estado de verificação por aba (tabId) em tempo de execução. Permite que cada aba tenha seu próprio estado de verificação independente, mesmo que seja do mesmo domínio.

---

#### 2.1.2. `GLOBAL_KEY` (Constante)

**Tipo:** `'scanEnabled:__global__'`  
**Ordem de execução:** Definida na inicialização  
**Função:** Chave usada no storage para armazenar o estado global de verificação (ligado/desligado para todos os sites).

---

#### 2.1.3. `getGlobalEnabled()`

**Tipo:** `async function(): Promise<boolean>`  
**Ordem de execução:** Chamada quando necessário verificar o estado global  
**Função:** Lê do storage local se a verificação global está ativada. Retorna `true` por padrão (se não houver valor armazenado). Se o valor armazenado for `false`, retorna `false`.

**Fluxo:**

1. Busca a chave `GLOBAL_KEY` no `chrome.storage.local`
2. Se não existir ou for diferente de `false`, retorna `true`
3. Caso contrário, retorna `false`

---

#### 2.1.4. `setGlobalEnabled(enabled: boolean)`

**Tipo:** `async function(enabled: boolean): Promise<void>`  
**Ordem de execução:** Chamada quando o usuário alterna o switch global no popup  
**Função:** Salva o estado global de verificação no storage local.

**Parâmetros:**

- `enabled`: `true` para ativar verificação global, `false` para desativar

---

#### 2.1.5. `getEnabled(origin: string, tabId?: number)`

**Tipo:** `async function(origin: string, tabId?: number): Promise<boolean>`  
**Ordem de execução:** Chamada para verificar se a verificação está habilitada para um domínio/aba específica  
**Função:** Retorna o estado efetivo de verificação considerando:

1. Estado global (se estiver desligado, retorna `false`)
2. Estado da aba específica (se `tabId` for fornecido e existir no `scanningState`)
3. Estado do domínio (armazenado no storage com chave `scanEnabled:${origin}`)

**Lógica de prioridade:**

- Se global estiver OFF → retorna `false`
- Se `tabId` fornecido e existir no `scanningState` → retorna o valor da aba
- Caso contrário → retorna o valor armazenado para o domínio (padrão: `true`)

---

#### 2.1.6. `setEnabled(origin: string, enabled: boolean, tabId?: number)`

**Tipo:** `async function(origin: string, enabled: boolean, tabId?: number): Promise<void>`  
**Ordem de execução:** Chamada quando o usuário alterna o switch de verificação  
**Função:** Define o estado de verificação para um domínio e/ou aba específica.

**Parâmetros:**

- `origin`: Domínio (ex: "https://example.com")
- `enabled`: Estado desejado
- `tabId`: (Opcional) ID da aba para definir estado específico da aba

**Ações:**

1. Se `tabId` fornecido, atualiza o `scanningState` Map
2. Salva o estado no storage com chave `scanEnabled:${origin}`

---

#### 2.1.7. `broadcastEffectiveToAllTabs()`

**Tipo:** `async function(): Promise<void>`  
**Ordem de execução:** Chamada após alternar o estado global  
**Função:** Propaga o estado efetivo de verificação para todas as abas abertas, garantindo que os content scripts sejam notificados sobre mudanças no estado global.

**Fluxo:**

1. Busca todas as abas abertas com `chrome.tabs.query({})`
2. Para cada aba válida:
   - Extrai o `origin` da URL
   - Calcula o estado efetivo com `getEnabled()`
   - Envia mensagem `SCANNING_STATE` para o content script da aba

---

#### 2.1.8. Listener de Mensagens - Toggle (Parte 1)

**Tipo:** `chrome.runtime.onMessage.addListener()`  
**Ordem de execução:** Executado quando qualquer mensagem é enviada ao background  
**Função:** Processa mensagens relacionadas ao controle de verificação.

**Tipos de mensagens tratadas:**

- **`GET_SCANNING_STATE`**: Retorna o estado de verificação para um domínio/aba

  - Usado pelo content script para verificar se deve escanear

- **`TOGGLE_SCANNING`**: Alterna o estado de verificação para um domínio/aba

  - Usado pelo popup quando o usuário clica no switch da página
  - Atualiza o estado e notifica o content script da aba

- **`IS_SCANNING_ENABLED`**: Verifica se a verificação está habilitada

  - Similar a `GET_SCANNING_STATE`, mas com lógica de fallback

- **`GET_GLOBAL_STATE`**: Retorna o estado global de verificação

  - Usado pelo popup para exibir o estado do switch global

- **`TOGGLE_GLOBAL`**: Alterna o estado global

  - Usado pelo popup quando o usuário clica no switch global
  - Chama `broadcastEffectiveToAllTabs()` para propagar mudanças

- **`GET_DISABLED_SITES`**: Retorna lista de domínios explicitamente desativados

  - Usado pelo modal do popup para listar sites desativados
  - Busca todas as chaves `scanEnabled:*` no storage que tenham valor `false`

- **`SET_SITE_ENABLED`**: Define explicitamente o estado de um domínio
  - Usado pelo modal para reativar sites
  - Propaga mudanças para todas as abas do mesmo domínio

---

#### 2.1.9. `chrome.tabs.onRemoved.addListener()`

**Tipo:** Event Listener  
**Ordem de execução:** Executado quando uma aba é fechada  
**Função:** Remove o estado de verificação da aba do `scanningState` Map para liberar memória.

---

### 2.2. Sistema de Cache e Verificação de URLs

#### 2.2.1. `memoryCache` (Map)

**Tipo:** `Map<string, { verdict: Verdict, expiresAt: number }>`  
**Ordem de execução:** Inicializado no carregamento do service worker  
**Função:** Cache em memória de vereditos de URLs. Tempo de vida limitado (10 minutos) e é perdido quando o service worker é reiniciado.

**Estrutura:**

- Chave: URL completa
- Valor: Objeto com `verdict` ('safe' | 'suspect' | 'malicious') e `expiresAt` (timestamp)

---

#### 2.2.2. `CACHE_TTL_MS` (Constante)

**Tipo:** `number` (10 _ 60 _ 1000 = 600000 ms)  
**Função:** Tempo de vida do cache em memória (10 minutos).

---

#### 2.2.3. `STORAGE_KEY` (Constante)

**Tipo:** `'ap_verdicts_v1'`  
**Função:** Chave usada no storage local para armazenar vereditos persistentes.

---

#### 2.2.4. `STORAGE_TTL_MS` (Constante)

**Tipo:** `number` (72 _ 60 _ 60 \* 1000 = 259200000 ms)  
**Função:** Tempo de vida do cache persistente (72 horas - 3 dias).

---

#### 2.2.5. `loadStore()`

**Tipo:** `async function(): Promise<StoredMap>`  
**Ordem de execução:** Chamada quando precisa ler vereditos do storage  
**Função:** Carrega o mapa completo de vereditos armazenados no `chrome.storage.local`.

**Retorno:** Objeto `Record<string, StoredVerdict>` onde:

- Chave: URL
- Valor: `{ verdict: Verdict, expiresAt: number }`

---

#### 2.2.6. `saveToStore(entries: Record<string, StoredVerdict>)`

**Tipo:** `async function(entries: Record<string, StoredVerdict>): Promise<void>`  
**Ordem de execução:** Chamada após receber novos vereditos da API  
**Função:** Salva ou atualiza vereditos no storage persistente, mesclando com dados existentes.

**Fluxo:**

1. Carrega o store atual com `loadStore()`
2. Mescla as novas entradas com `Object.assign()`
3. Salva de volta no storage

---

#### 2.2.7. `splitKnownUnknown(urls: string[])`

**Tipo:** `async function(urls: string[]): Promise<{ known: Record<string, Verdict>, unknown: string[] }>`  
**Ordem de execução:** Chamada antes de fazer requisição à API  
**Função:** Separa URLs em duas categorias: conhecidas (já verificadas e em cache) e desconhecidas (precisam ser verificadas).

**Fluxo:**

1. Remove URLs duplicadas
2. Verifica cache em memória primeiro (mais rápido)
3. Para URLs não encontradas em memória, verifica storage persistente
4. URLs encontradas no storage são "aquecidas" no cache em memória
5. Retorna:
   - `known`: Objeto com URLs e seus vereditos conhecidos
   - `unknown`: Array de URLs que precisam ser verificadas

---

#### 2.2.8. `saveToCache(url: string, verdict: Verdict, ttl?: number)`

**Tipo:** `function(url: string, verdict: Verdict, ttl?: number): void`  
**Ordem de execução:** Chamada após obter um veredito (da API ou storage)  
**Função:** Salva um veredito no cache em memória com TTL configurável.

**Parâmetros:**

- `url`: URL a ser cacheada
- `verdict`: Veredito ('safe' | 'suspect' | 'malicious')
- `ttl`: Tempo de vida em ms (padrão: `CACHE_TTL_MS`)

---

#### 2.2.9. `loadFromCache(url: string)`

**Tipo:** `function(url: string): Verdict | undefined`  
**Ordem de execução:** Chamada ao verificar se uma URL já foi analisada  
**Função:** Lê um veredito do cache em memória, retornando `undefined` se não existir ou estiver expirado.

**Fluxo:**

1. Busca no `memoryCache`
2. Se não encontrado, retorna `undefined`
3. Se encontrado mas expirado, remove do cache e retorna `undefined`
4. Caso contrário, retorna o veredito

---

#### 2.2.10. `isWhitelisted(url: string)`

**Tipo:** `function(url: string): boolean`  
**Ordem de execução:** Chamada antes de verificar uma URL na API  
**Função:** Verifica se uma URL está na whitelist de domínios confiáveis. Verifica tanto o domínio exato quanto domínios pais (para suportar subdomínios).

**Fluxo:**

1. Extrai o hostname da URL
2. Verifica se o hostname está no `WHITELIST_SET`
3. Verifica domínios pais (ex: `mail.google.com` → verifica `google.com`)
4. Retorna `true` se encontrar, `false` caso contrário

**Exemplo:**

- `https://mail.google.com/inbox` → verifica `mail.google.com`, depois `google.com` → retorna `true`

---

#### 2.2.11. `requestApiBatch(urls: string[])`

**Tipo:** `async function(urls: string[]): Promise<Record<string, Verdict>>`  
**Ordem de execução:** Chamada quando há URLs desconhecidas para verificar  
**Função:** Faz uma requisição em lote para a API de verificação, processando apenas URLs que não estão na whitelist e não estão em cache.

**Fluxo:**

1. **Separação inicial:**

   - URLs whitelisted → marcadas como 'safe' imediatamente
   - URLs não-whitelisted → seguem para verificação

2. **Verificação de cache:**

   - Chama `splitKnownUnknown()` para separar conhecidas/desconhecidas

3. **Requisição à API (se houver desconhecidas):**

   - Faz POST para `API_ENDPOINT` com formato:
     ```json
     {
       "tipo_geral": "url",
       "lista_itens": ["url1", "url2", ...]
     }
     ```
   - Processa resposta e normaliza vereditos

4. **Salvamento:**

   - Salva novos vereditos no cache em memória (10min)
   - Salva no storage persistente (72h - 3 dias)

5. **Retorno:**

   - Merge de whitelisted + known + novos vereditos da API

6. **Tratamento de erro:**
   - Se a API falhar, assume 'safe' para URLs desconhecidas
   - Mantém whitelisted + known

---

#### 2.2.12. `ruleIdFromHost(host: string)`

**Tipo:** `function(host: string): number`  
**Ordem de execução:** Chamada ao criar regras de bloqueio  
**Função:** Gera um ID numérico único para uma regra de bloqueio baseado no hostname. Usa um hash simples (não criptográfico) para mapear hosts para IDs na faixa 210000-229999.

**Algoritmo:**

- Hash djb2-like (deslocamento e soma)
- Módulo 20000 para manter em faixa
- Offset 210000 para evitar conflitos com outras regras

---

#### 2.2.13. `applyBlockRulesFor(urlsToBlock: string[])`

**Tipo:** `async function(urlsToBlock: string[]): Promise<void>`  
**Ordem de execução:** Chamada após receber vereditos 'suspect' ou 'malicious'  
**Função:** Cria regras de bloqueio usando a API Declarative Net Request do Chrome para bloquear requisições a domínios suspeitos/maliciosos.

**Fluxo:**

1. Para cada URL a bloquear:

   - Extrai o hostname
   - Cria padrão `protocol://host/*`
   - Gera ID único com `ruleIdFromHost()`
   - Define regra bloqueando:
     - MAIN_FRAME (navegação principal)
     - SUB_FRAME (iframes)
     - XMLHTTPREQUEST (requisições AJAX)
     - SCRIPT (scripts)
     - IMAGE (imagens)

2. Remove regras antigas com os mesmos IDs (idempotência)

3. Adiciona novas regras com `chrome.declarativeNetRequest.updateDynamicRules()`

**Efeito:** O navegador bloqueia automaticamente qualquer requisição aos domínios listados.

---

#### 2.2.14. Listener de Mensagens - Verificação (Parte 2)

**Tipo:** `chrome.runtime.onMessage.addListener()`  
**Ordem de execução:** Executado quando content script envia mensagens de verificação  
**Função:** Processa mensagens relacionadas à verificação de URLs.

**Tipos de mensagens tratadas:**

- **`PAGE_URLS_BATCH`**: Recebe um lote de URLs da página para verificar

  - Chama `requestApiBatch()` para verificar todas
  - Aplica regras de bloqueio para URLs suspeitas/maliciosas
  - Retorna `verdictMap` para o content script atualizar seu cache

- **`IS_URL_BLOCKED`**: Verifica se uma URL específica está bloqueada
  - Verifica whitelist primeiro
  - Verifica cache em memória
  - Verifica storage persistente
  - Se não encontrado, faz nova verificação via API
  - Retorna array de URLs bloqueadas

---

## 3. content.ts

### 3.1. Sistema de Toggle no Content Script

#### 3.1.1. `__AP_scanningEnabled` (Variável)

**Tipo:** `boolean`  
**Ordem de execução:** Inicializada como `true`  
**Função:** Flag que controla se o content script deve escanear links. Pode ser desativada pelo usuário via popup.

---

#### 3.1.2. `applyScanningState(enabled: boolean)`

**Tipo:** `function(enabled: boolean): void`  
**Ordem de execução:** Chamada quando o estado de verificação muda  
**Função:** Atualiza a flag `__AP_scanningEnabled` e adiciona/remove atributo `data-ap-scan-disabled` no elemento raiz do documento para permitir estilização CSS.

---

#### 3.1.3. Listener de Mensagens - Toggle

**Tipo:** `chrome.runtime.onMessage.addListener()`  
**Ordem de execução:** Executado quando background envia mensagem `SCANNING_STATE`  
**Função:** Atualiza o estado de verificação quando o background notifica mudanças.

---

#### 3.1.4. Inicialização do Estado (IIFE)

**Tipo:** `(async () => { ... })()`  
**Ordem de execução:** Executado imediatamente ao carregar o content script  
**Função:** Consulta o background para obter o estado inicial de verificação do domínio atual e aplica com `applyScanningState()`.

---

#### 3.1.5. `wrapScanIfPresent()`

**Tipo:** `(function wrapScanIfPresent() { ... })()`  
**Ordem de execução:** Executado imediatamente após a inicialização  
**Função:** Envolve a função global `scanAndSendBatch` (se existir) para respeitar o toggle. Se a verificação estiver desativada, a função não executa.

---

### 3.2. Sistema de Alertas (SweetAlert2)

#### 3.2.1. `isDarkMode()`

**Tipo:** `function(): boolean`  
**Ordem de execução:** Chamada ao configurar alertas  
**Função:** Detecta se o sistema operacional/navegador está em tema escuro usando `window.matchMedia('(prefers-color-scheme: dark)')`.

---

#### 3.2.2. `injectSwalThemeStyles()`

**Tipo:** `function(): void`  
**Ordem de execução:** Executada uma vez na inicialização  
**Função:** Injeta estilos CSS customizados no documento para adaptar o SweetAlert2 ao tema claro/escuro do sistema.

**Estilos aplicados:**

- Tema escuro: fundo #2d2d2d, texto #e0e0e0
- Tema claro: fundo #ffffff, texto #5f6368

---

#### 3.2.3. `getSwalConfig(message: string, title?: string)`

**Tipo:** `function(message: string, title?: string): object`  
**Ordem de execução:** Chamada ao exibir alertas  
**Função:** Retorna configuração do SweetAlert2 adaptada ao tema atual.

**Retorno:**

- `title`: Título do alerta (padrão: 'SecInbox')
- `text`: Mensagem
- `icon`: 'warning'
- `confirmButtonText`: 'OK'
- Cores adaptadas ao tema

---

### 3.3. Sistema de Coleta de URLs

#### 3.3.1. `seenUrls` (Set)

**Tipo:** `Set<string>`  
**Ordem de execução:** Inicializado no carregamento  
**Função:** Mantém registro de todas as URLs já coletadas para evitar processamento duplicado.

---

#### 3.3.2. `blockedUrlsCache` (Set)

**Tipo:** `Set<string>`  
**Ordem de execução:** Inicializado no carregamento  
**Função:** Cache local de URLs bloqueadas (atualizado com retorno do background). Usado para verificação síncrona rápida.

---

#### 3.3.3. `safeUrlsCache` (Set)

**Tipo:** `Set<string>`  
**Ordem de execução:** Inicializado no carregamento  
**Função:** Cache local de URLs seguras (atualizado com retorno do background). Usado para verificação síncrona rápida.

---

#### 3.3.4. `normalizeUrl(u: string)`

**Tipo:** `function(u: string): string`  
**Ordem de execução:** Chamada ao processar URLs  
**Função:** Normaliza uma URL removendo o hash (#) e convertendo para URL absoluta. Isso evita duplicatas causadas por âncoras diferentes.

**Exemplo:**

- `https://example.com/page#section` → `https://example.com/page`

---

#### 3.3.5. `diffNew(urls: string[])`

**Tipo:** `function(urls: string[]): string[]`  
**Ordem de execução:** Chamada antes de enviar URLs ao background  
**Função:** Filtra URLs novas (não vistas anteriormente) normalizando e comparando com `seenUrls`.

**Fluxo:**

1. Normaliza cada URL
2. Verifica se já está em `seenUrls`
3. Se nova, adiciona ao Set e inclui no retorno
4. Retorna array apenas com URLs novas

---

#### 3.3.6. `hasUsableHref(a: HTMLAnchorElement)`

**Tipo:** `function(a: HTMLAnchorElement): boolean`  
**Ordem de execução:** Chamada ao coletar links  
**Função:** Verifica se um elemento `<a>` tem um href válido e utilizável.

**Retorna `false` se:**

- Não tem atributo `href`
- `href` vazio ou apenas "#"
- `href` começa com "javascript:"

---

#### 3.3.7. `isProbablyVisible(el: HTMLElement)`

**Tipo:** `function(el: HTMLElement): boolean`  
**Ordem de execução:** Chamada ao filtrar links  
**Função:** Verifica se um elemento está provavelmente visível na tela, evitando processar links ocultos.

**Verificações:**

1. Elemento está conectado ao DOM (`isConnected`)
2. Tem dimensões visíveis (`getClientRects().length > 0`)
3. `getBoundingClientRect()` tem largura e altura > 0
4. Está dentro da viewport (não está fora da tela)
5. CSS não está ocultando (`display !== 'none'`, `visibility === 'visible'`, `opacity !== '0'`)
6. Não tem `pointer-events: none`

---

#### 3.3.8. `isProbablyClickable(a: HTMLAnchorElement)`

**Tipo:** `function(a: HTMLAnchorElement): boolean`  
**Ordem de execução:** Chamada ao filtrar links  
**Função:** Verifica se um link está realmente clicável, mesmo que não esteja totalmente visível (ex: parcialmente oculto por overflow).

**Fluxo:**

1. Calcula ponto central do elemento
2. Usa `document.elementFromPoint()` para ver qual elemento está no centro
3. Verifica se o elemento no centro é o próprio link ou está dentro dele
4. Retorna `true` se o link está acessível no ponto de clique

---

#### 3.3.9. `acceptAnchor(a: HTMLAnchorElement)`

**Tipo:** `function(a: HTMLAnchorElement): boolean`  
**Ordem de execução:** Chamada ao coletar links  
**Função:** Combina verificações para determinar se um link deve ser processado. Retorna `true` se o link tem href válido E (está visível OU é clicável).

---

#### 3.3.10. `collectAnchorUrlsFast(root?: ParentNode)`

**Tipo:** `function(root?: ParentNode): string[]`  
**Ordem de execução:** Chamada durante varredura da página  
**Função:** Coleta todas as URLs de elementos `<a href>` válidos e visíveis/clicáveis no documento ou em um elemento raiz específico.

**Fluxo:**

1. Busca todos os `<a[href]>` no root (ou `document`)
2. Para cada link:
   - Verifica com `acceptAnchor()`
   - Se aceito, converte href para URL absoluta
   - Adiciona ao array de retorno

---

#### 3.3.11. `collectAreaUrlsFast(root?: ParentNode)`

**Tipo:** `function(root?: ParentNode): string[]`  
**Ordem de execução:** Chamada durante varredura (se `ENABLE_IMAGE_MAPS` estiver ativo)  
**Função:** Coleta URLs de elementos `<area href>` (mapas de imagem). Atualmente desabilitado (`ENABLE_IMAGE_MAPS = false`).

---

#### 3.3.12. `collectAllUrlsFast(root?: ParentNode)`

**Tipo:** `function(root?: ParentNode): string[]`  
**Ordem de execução:** Chamada durante varredura  
**Função:** Coleta todas as URLs da página combinando links de `<a>` e `<area>`, removendo duplicatas.

**Fluxo:**

1. Coleta links de `<a>` com `collectAnchorUrlsFast()`
2. Se `ENABLE_IMAGE_MAPS` ativo, coleta de `<area>`
3. Remove duplicatas usando Set
4. Retorna array único

---

### 3.4. Sistema de Varredura e Envio

#### 3.4.1. `debounce<T>(fn: T, ms: number)`

**Tipo:** `function<T extends (...args: any[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void`  
**Ordem de execução:** Usado para criar versão "debounced" de funções  
**Função:** Cria uma versão da função que só executa após `ms` milissegundos sem novas chamadas. Útil para evitar execuções excessivas durante mudanças rápidas no DOM.

**Exemplo de uso:** Varredura após mudanças no DOM aguarda 500ms de inatividade antes de executar.

---

#### 3.4.2. `scanAndSendBatch()`

**Tipo:** `async function(): Promise<void>`  
**Ordem de execução:** Executada na inicialização e após mudanças no DOM  
**Função:** Função principal de varredura: coleta URLs da página e envia ao background para verificação.

**Fluxo:**

1. Coleta todas as URLs com `collectAllUrlsFast()`
2. Filtra apenas URLs novas com `diffNew()`
3. Se não houver URLs novas, retorna
4. Envia lote ao background via mensagem `PAGE_URLS_BATCH`
5. Atualiza caches locais (`blockedUrlsCache` e `safeUrlsCache`) com os vereditos recebidos

**Importante:** Esta função é envolvida pelo toggle - se `__AP_scanningEnabled` for `false`, não executa.

---

#### 3.4.3. MutationObserver

**Tipo:** `new MutationObserver(debounce(() => { ... }, 500))`  
**Ordem de execução:** Inicializado após primeira varredura, observa mudanças no DOM  
**Função:** Observa mudanças no DOM (SPAs, carregamento dinâmico) e dispara nova varredura após 500ms de inatividade.

**Configuração:**

- Observa `document.documentElement`
- Monitora: `childList`, `subtree`, `attributes` (href, src, style)

**Importante:** Só observa se `__AP_scanningEnabled` estiver ativo.

---

### 3.5. Sistema de Bloqueio de Cliques

#### 3.5.1. `isUrlBlockedSync(url: string)`

**Tipo:** `function(url: string): boolean | null`  
**Ordem de execução:** Chamada durante evento de clique  
**Função:** Verifica síncronamente (rápido) se uma URL está bloqueada usando os caches locais.

**Retorno:**

- `true`: URL está bloqueada (no `blockedUrlsCache`)
- `false`: URL é segura (no `safeUrlsCache`)
- `null`: Não está no cache, precisa verificação assíncrona

---

#### 3.5.2. Event Listener - `mousedown`

**Tipo:** `document.addEventListener('mousedown', async (event) => { ... }, true)`  
**Ordem de execução:** Executado quando usuário pressiona botão do mouse sobre um link  
**Função:** Intercepta cliques em links e bloqueia se a URL for suspeita/maliciosa.

**Fluxo:**

1. Verifica se é botão esquerdo (`event.button === 0`)
2. Encontra o elemento `<a>` mais próximo no caminho do evento
3. Se não encontrar link, retorna
4. **Verificação síncrona:**
   - Se bloqueada no cache → bloqueia imediatamente e exibe alerta
   - Se segura no cache → permite o clique
5. **Verificação assíncrona (se não estiver no cache):**
   - Bloqueia temporariamente o clique
   - Envia mensagem `IS_URL_BLOCKED` ao background
   - Se bloqueada → exibe alerta
   - Se segura → executa `anchorEl.click()` programaticamente

**Importante:** Usa `capture: true` para executar antes de outros handlers.

---

#### 3.5.3. Event Listener - `click` (vazio)

**Tipo:** `addEventListener('click', () => {}, true)`  
**Ordem de execução:** Executado em cliques (capture phase)  
**Função:** Placeholder para garantir que o handler seja registrado na fase de captura. Pode ser usado para debugging ou extensões futuras.

---

## 4. popup.js

### 4.1. Funções Utilitárias

#### 4.1.1. `getActiveTab()`

**Tipo:** `async function(): Promise<chrome.tabs.Tab>`  
**Ordem de execução:** Chamada na inicialização do popup  
**Função:** Obtém a aba ativa atual usando `chrome.tabs.query()`.

---

#### 4.1.2. `byId(id)`

**Tipo:** `function(id: string): HTMLElement | null`  
**Ordem de execução:** Chamada para obter elementos do DOM  
**Função:** Atalho para `document.getElementById()`.

---

### 4.2. Gerenciamento de Estado da UI

#### 4.2.1. Variáveis de Estado

**Tipo:** `let currentTabId = null; let currentOrigin = null;`  
**Ordem de execução:** Inicializadas na inicialização  
**Função:** Armazenam informações da aba atual para comunicação com o background.

---

#### 4.2.2. Elementos UI (Constantes)

**Tipo:** Referências a elementos DOM  
**Ordem de execução:** Obtidas na inicialização  
**Função:** Referências aos elementos de controle:

- `swGlobal`: Switch global
- `swPage`: Switch da página
- `txtGlobal`: Texto de status global
- `txtPage`: Texto de status da página

---

#### 4.2.3. `readStates()`

**Tipo:** `async function(): Promise<{ globalEnabled: boolean, pageEnabled: boolean }>`  
**Ordem de execução:** Chamada para atualizar a UI  
**Função:** Lê o estado atual de verificação (global e da página) do background.

**Fluxo:**

1. Envia `GET_GLOBAL_STATE` para obter estado global
2. Se houver `currentOrigin`, envia `IS_SCANNING_ENABLED` para obter estado da página
3. Retorna objeto com ambos os estados

---

#### 4.2.4. `applyUI({ globalEnabled, pageEnabled })`

**Tipo:** `function({ globalEnabled, pageEnabled }): void`  
**Ordem de execução:** Chamada após ler estados  
**Função:** Atualiza a interface do usuário com os estados lidos.

**Ações:**

1. Atualiza switch global e texto de status
2. Habilita/desabilita switch da página baseado no estado global
3. Atualiza texto de status da página com mensagem apropriada

**Lógica:**

- Se global OFF → switch da página desabilitado
- Se global ON → switch da página reflete estado da página

---

#### 4.2.5. `refreshUI()`

**Tipo:** `async function(): Promise<void>`  
**Ordem de execução:** Chamada para atualizar a UI  
**Função:** Função de conveniência que lê estados e aplica na UI. Tratamento de erros incluído.

---

### 4.3. Event Handlers dos Switches

#### 4.3.1. Event Handler - Switch Global

**Tipo:** `swGlobal.addEventListener('change', async () => { ... })`  
**Ordem de execução:** Executado quando usuário alterna switch global  
**Função:** Alterna o estado global de verificação.

**Fluxo:**

1. Envia mensagem `TOGGLE_GLOBAL` ao background
2. Chama `refreshUI()` para atualizar interface

---

#### 4.3.2. Event Handler - Switch da Página

**Tipo:** `swPage.addEventListener('change', async () => { ... })`  
**Ordem de execução:** Executado quando usuário alterna switch da página  
**Função:** Alterna o estado de verificação para a página atual.

**Fluxo:**

1. Verifica se há `currentOrigin`
2. Envia mensagem `TOGGLE_SCANNING` com origin e tabId
3. Chama `refreshUI()` para atualizar interface

---

### 4.4. Inicialização

#### 4.4.1. `init()` (IIFE)

**Tipo:** `(async function init() { ... })()`  
**Ordem de execução:** Executado imediatamente ao carregar o popup  
**Função:** Inicializa o popup obtendo informações da aba ativa e atualizando a UI.

**Fluxo:**

1. Obtém aba ativa com `getActiveTab()`
2. Extrai `tabId` e `origin` da aba
3. Define textos de carregamento
4. Chama `refreshUI()` para carregar estados

---

### 4.5. Sistema de Modal - Sites Desativados

#### 4.5.1. Referências de Elementos do Modal

**Tipo:** Constantes com referências DOM  
**Ordem de execução:** Obtidas na inicialização  
**Função:** Referências aos elementos do modal:

- `btnOpen`: Botão para abrir modal
- `modal`: Elemento do modal
- `modalOverlay`: Overlay do modal
- `modalClose`: Botão de fechar
- `modalList`: Container da lista
- `modalRefresh`: Botão de atualizar
- `modalClear`: Botão de reativar todos

---

#### 4.5.2. `fetchDisabledSites()`

**Tipo:** `async function(): Promise<string[]>`  
**Ordem de execução:** Chamada ao abrir modal ou atualizar lista  
**Função:** Busca lista de sites desativados do background via mensagem `GET_DISABLED_SITES`.

---

#### 4.5.3. `renderDisabledList(sites)`

**Tipo:** `function(sites: string[]): void`  
**Ordem de execução:** Chamada após buscar sites desativados  
**Função:** Renderiza a lista de sites desativados no modal.

**Fluxo:**

1. Limpa conteúdo anterior
2. Se lista vazia, exibe mensagem
3. Para cada site:
   - Cria elemento de linha com favicon (primeira letra) e nome
   - Adiciona botão "Reativar" que:
     - Envia `SET_SITE_ENABLED` com `enabled: true`
     - Recarrega lista e atualiza UI

---

#### 4.5.4. `loadAndRender()`

**Tipo:** `async function(): Promise<void>`  
**Ordem de execução:** Chamada ao abrir modal ou atualizar  
**Função:** Busca sites desativados e renderiza a lista.

---

#### 4.5.5. Event Handlers do Modal

- **`btnOpen.addEventListener('click')`**: Abre o modal e carrega lista
- **`modalClose.addEventListener('click')`**: Fecha o modal
- **`modalOverlay.addEventListener('click')`**: Fecha o modal ao clicar no overlay
- **`modalRefresh.addEventListener('click')`**: Recarrega a lista
- **`modalClear.addEventListener('click')`**: Reativa todos os sites desativados
  - Para cada site, envia `SET_SITE_ENABLED` com `enabled: true`
  - Recarrega lista e atualiza UI

---

## 🔄 Fluxo de Execução Completo

### 1. Inicialização da Extensão

1. **background.ts** carrega:

   - Inicializa `scanningState` Map
   - Define constantes de cache e storage
   - Registra listeners de mensagens

2. **whitelist.ts** carrega:

   - Cria `WHITELIST_SET` a partir do array de domínios

3. **content.ts** injeta na página:

   - Consulta estado de verificação do domínio
   - Aplica estado inicial
   - Injeta estilos do SweetAlert2
   - Executa primeira varredura (`scanAndSendBatch()`)
   - Inicia MutationObserver

4. **popup.js** (quando aberto):
   - Obtém aba ativa
   - Lê estados global e da página
   - Atualiza UI

### 2. Varredura de Links

1. **content.ts** - `scanAndSendBatch()`:

   - Coleta URLs da página
   - Filtra apenas novas
   - Envia lote ao background

2. **background.ts** - Listener `PAGE_URLS_BATCH`:

   - Separa URLs whitelisted
   - Verifica cache (memória e storage)
   - Faz requisição à API para desconhecidas
   - Aplica regras de bloqueio
   - Retorna vereditos

3. **content.ts** atualiza caches locais com vereditos

### 3. Bloqueio de Clique

1. Usuário clica em link
2. **content.ts** - Event `mousedown`:
   - Verifica cache local (síncrono)
   - Se não encontrado, consulta background (assíncrono)
   - Bloqueia se suspeito/malicioso
   - Exibe alerta SweetAlert2

### 4. Mudanças no DOM

1. MutationObserver detecta mudanças
2. Aguarda 500ms (debounce)
3. Executa nova varredura se verificação ativa

### 5. Controle pelo Usuário (Popup)

1. Usuário alterna switch global:

   - **popup.js** envia `TOGGLE_GLOBAL`
   - **background.ts** atualiza estado global
   - Propaga para todas as abas
   - **content.ts** atualiza flag local

2. Usuário alterna switch da página:
   - **popup.js** envia `TOGGLE_SCANNING`
   - **background.ts** atualiza estado do domínio/aba
   - **content.ts** da aba atual recebe notificação

---

## 📝 Notas Importantes

- **Cache em duas camadas**: Memória (10min) e Storage (72h - 3 dias) para otimizar performance
- **Whitelist**: Domínios confiáveis não são verificados pela API
- **Bloqueio em tempo real**: Declarative Net Request bloqueia requisições automaticamente
- **Toggle hierárquico**: Global → Domínio → Aba (cada nível pode desativar os inferiores)
- **SPA Support**: MutationObserver detecta mudanças dinâmicas no DOM
- **Performance**: Debounce, cache local, e verificação em lote reduzem carga

---

**Fim da Documentação**
