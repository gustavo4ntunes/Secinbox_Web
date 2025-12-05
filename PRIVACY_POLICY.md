# Política de Privacidade - SecInbox

**Última atualização:** $(date)

## 1. Introdução

A extensão SecInbox ("nós", "nosso", "a extensão") respeita sua privacidade e está comprometida em proteger seus dados pessoais. Esta política de privacidade explica como coletamos, usamos e protegemos suas informações quando você usa nossa extensão.

## 2. Dados Coletados

### 2.1 URLs de Links
A extensão coleta **apenas URLs de links** presentes nas páginas web que você visita para verificação de segurança. Especificamente:

- **O que coletamos:** URLs completas de links (`<a href>`) encontrados nas páginas visitadas
- **O que NÃO coletamos:**
  - Conteúdo de páginas
  - Dados de formulários
  - Senhas ou credenciais
  - Informações pessoais identificáveis
  - Histórico de navegação completo
  - Cookies ou dados de sessão

### 2.2 Dados Armazenados Localmente
A extensão armazena localmente em seu navegador (via `chrome.storage.local`):

- Configurações de preferências (sites desativados, estado global)
- Cache de resultados de verificação (URLs verificadas e seus vereditos)
- **Nenhum dado é transmitido para servidores externos além das URLs para verificação**

## 3. Como Usamos Seus Dados

### 3.1 Verificação de Segurança
As URLs coletadas são enviadas para nosso serviço de análise (`https://secinbox.onrender.com/analisar/`) **exclusivamente** para:

- Verificar se os links são suspeitos ou maliciosos
- Proteger você contra phishing e sites perigosos
- Bloquear automaticamente URLs identificadas como ameaças

### 3.2 Processamento
- As URLs são processadas em **lote** para eficiência
- Resultados são armazenados em cache local (72 horas) para reduzir requisições
- URLs de domínios confiáveis (whitelist) não são enviadas à API

## 4. Compartilhamento de Dados

### 4.1 Serviço de Análise
As URLs são compartilhadas **apenas** com nosso serviço de análise (`secinbox.onrender.com`) para verificação de segurança.

### 4.2 Terceiros
- **Não vendemos** seus dados
- **Não compartilhamos** com terceiros para publicidade
- **Não usamos** para fins comerciais além da verificação de segurança

## 5. Armazenamento e Retenção

### 5.1 Dados Locais
- Configurações e cache são armazenados **localmente** no seu navegador
- Você pode limpar esses dados a qualquer momento desinstalando a extensão

### 5.2 Dados no Servidor
- URLs enviadas para verificação **não são armazenadas permanentemente** no servidor
- Apenas processamento temporário para análise de segurança

## 6. Segurança

### 6.1 Transmissão
- Todas as comunicações são feitas via **HTTPS/TLS** (criptografadas)
- Nenhum dado é transmitido em texto plano

### 6.2 Armazenamento Local
- Dados locais são protegidos pelo sistema de segurança do Chrome
- Acesso restrito apenas à própria extensão

## 7. Seus Direitos

Você tem o direito de:

- **Desativar a verificação** globalmente ou por site específico
- **Desinstalar a extensão** a qualquer momento (remove todos os dados locais)
- **Não usar a extensão** se não concordar com esta política

## 8. Uso Limitado (Limited Use)

Conforme as políticas do Chrome Web Store, seguimos o princípio de **"Limited Use"**:

- Usamos dados **apenas** para os fins declarados (verificação de segurança)
- **Não** revendemos dados
- **Não** usamos para publicidade
- **Não** compartilhamos com terceiros sem consentimento

## 9. Alterações nesta Política

Podemos atualizar esta política de privacidade ocasionalmente. Alterações significativas serão comunicadas através de atualizações da extensão.

## 10. Contato

Para questões sobre privacidade ou esta política, entre em contato através do repositório do projeto ou suporte da extensão.

---

**Nota:** Esta política está em conformidade com as [Chrome Web Store User Data Policies](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) e os requisitos de privacidade do Google Chrome.

