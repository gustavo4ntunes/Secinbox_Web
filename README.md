🛡️ AntiPhishing – Controle
--------------------------

Extensão para Google Chrome que permite monitorar e bloquear links suspeitos diretamente nas páginas visitadas.  
Desenvolvida para oferecer um controle simples e visual sobre a verificação de segurança, com opções globais e específicas por site.

------------------------------------------------------------

⚙️ Funcionalidades
------------------

✅ Verificação Global: ativa ou desativa o escaneamento de links em todos os sites.  
🌐 Controle por Página: permite habilitar ou desabilitar a verificação apenas no domínio atual.  
📋 Gerenciamento de Exceções: lista todos os sites onde a verificação foi desativada individualmente.  
🚫 Bloqueio Automático: impede o acesso a URLs classificadas como suspeitas ou maliciosas.  
💾 Armazenamento Local: todas as preferências são salvas localmente via chrome.storage.  
🧠 Cache Inteligente: mantém resultados de verificação recentes para melhor desempenho.  
🎨 Interface moderna: desenvolvida com Tailwind CSS, layout responsivo e tema escuro.

------------------------------------------------------------

🧠 Tecnologias Utilizadas
-------------------------

- JavaScript (ES2023+)
- Chrome Extensions API (Manifest V3)
- Tailwind CSS v4
- Vite (build e bundling)
- HTML semântico e responsivo

------------------------------------------------------------

🎨 Tailwind + Vite (Tailwind v4)
--------------------------------

O projeto usa Tailwind v4 integrado ao Vite via plugin oficial @tailwindcss/vite.  

------------------------------------------------------------

🚀 Instalação e Execução
------------------------

1️⃣ Instale as dependências:
   npm install

2️⃣ Gere a build de produção (gera a pasta dist/):
   npm run build

3️⃣ Carregue a extensão no Chrome:
   - Acesse chrome://extensions/
   - Ative o Modo do desenvolvedor
   - Clique em “Carregar sem compactação”
   - Selecione a pasta dist/

4️⃣ (Opcional) Para desenvolvimento contínuo:
   npm run dev

------------------------------------------------------------

👨‍💻 Autor
----------

Desenvolvido por Gustavo Henrique Couto Antunes
Com foco em segurança e experiência de uso em extensões modernas de navegador.
