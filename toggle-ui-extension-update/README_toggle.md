# AntiPhishing – Toggle de verificação via popup

Este pacote adiciona uma interface visual na extensão (popup) com um botão para **ativar/desativar** a verificação de links **por página (origin)**.

## O que foi adicionado
- `popup.html` e `popup.js`: UI simples com um botão que alterna o estado.
- Alterações em `background.ts`: suporte a mensagens `GET_SCANNING_STATE`, `TOGGLE_SCANNING`, `IS_SCANNING_ENABLED` com persistência em `chrome.storage.local` por origin.
- Alterações em `content.ts`: variáveis e listeners para respeitar o estado, e um *wrapper* opcional para a função `scanAndSendBatch` se ela existir.
- `manifest.json`: adiciona o `action.default_popup` e permissões mínimas (`storage`, `tabs`, `activeTab`).

## Como integrar
1. **Manifest**: Una o conteúdo do `manifest.json` com o seu (ou substitua se for um template). Garanta `manifest_version: 3`, `background.service_worker`, `content_scripts` e `action.default_popup`.
2. **Background**: Copie o bloco marcado como `Toggle de verificação` para o **topo** do seu `background.ts` ou substitua pelo arquivo `background_with_toggle.ts` inteiro.
3. **Content**: Copie os blocos `Toggle de verificação no content script` (topo) e `Garante que qualquer bloqueio de clique respeite o toggle` (fim) para o seu `content.ts` ou substitua por `content_with_toggle.ts`.
4. **Popup**: Adicione `popup.html` e `popup.js` ao diretório raiz do *build* da extensão.
5. **Build**: Transpile seus TS para JS (ex.: `tsc`/Vite) e carregue a pasta *dist* em `chrome://extensions` como **Unpacked**.

## Como funciona
- O estado é salvo em `chrome.storage.local` com a chave `scanEnabled:<origin>`.
- Padrão: **ativado**. O botão alterna o estado para o *origin* da aba ativa e notifica o content script.
- O content script guarda o estado e evita executar envios/ bloqueios quando desativado.

## Observação
O *wrapper* da função global `scanAndSendBatch` é defensivo: se sua função já existir, ela passa a respeitar o toggle. Se sua lógica de bloqueio estiver em *event listeners*, o *guard* global garante que o estado seja considerado.
