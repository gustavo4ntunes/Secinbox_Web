// Whitelist de domínios que não serão verificados pela API
// Domínios e subdomínios listados aqui retornarão 'safe' automaticamente
export const WHITELIST_DOMAINS = [
  'google.com',
  'microsoft.com',
  'apple.com',
  'amazon.com',
  'facebook.com',
  'linkedin.com',
  'github.com',
  'gitlab.com',
  'atlassian.net',
  'slack.com',
  'zoom.us',
  'cloudflare.com',
  'wordpress.com',
  'dropbox.com',
  'onedrive.com',
  'outlook.com',
  'yahoo.com',
  'youtube.com',
  'protonmail.com',
  'bradesco.com.br',
  'santander.com.br',
  'caixa.gov.br',
  'paypal.com',
  'visa.com',
  'mastercard.com',
  'gov.br',
  'fazenda.gov.br',
  'receita.fazenda.gov.br',
];

// Set para lookup O(1)
export const WHITELIST_SET = new Set<string>(WHITELIST_DOMAINS);

