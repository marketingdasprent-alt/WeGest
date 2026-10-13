// Regras puras das chaves de API (Integrações → Chaves de API): permissões por
// escopo, rótulos PT e textos da lista. Sem React nem Supabase, para testar.

export type EscopoApi = 'rent_a_car' | 'contabilidade';

export const PERMISSOES_POR_ESCOPO: Record<EscopoApi, readonly string[]> = {
  rent_a_car: [
    'catalogo:read',
    'disponibilidade:read',
    'reservas:read',
    'reservas:write',
    'tvde:catalogo:read',
    'tvde:candidaturas:read',
    'tvde:candidaturas:write',
  ],
  contabilidade: [
    'clientes:read',
    'clientes:write',
    'contratos:read',
    'faturas:read',
    'faturas:write',
    'recibos:read',
    'recibos:write',
    'contas_correntes:read',
    'contas_correntes:write',
  ],
};

const ROTULOS: Record<string, string> = {
  'catalogo:read': 'Ler catálogo (categorias, modelos, extras, localizações)',
  'disponibilidade:read': 'Consultar disponibilidade e cotações',
  'reservas:read': 'Consultar reservas do site',
  'reservas:write': 'Criar e cancelar reservas',
  'tvde:catalogo:read': 'TVDE: catálogo e disponibilidade',
  'tvde:candidaturas:read': 'TVDE: consultar candidaturas',
  'tvde:candidaturas:write': 'TVDE: enviar candidaturas',
};

export const ROTULO_ESCOPO: Record<EscopoApi, string> = {
  rent_a_car: 'Site (rent-a-car e TVDE)',
  contabilidade: 'Contabilidade (Primavera)',
};

export function validarPermissoes(escopo: EscopoApi, permissoes: string[]): string | null {
  if (permissoes.length === 0) return 'Escolha pelo menos uma permissão.';
  const validas = PERMISSOES_POR_ESCOPO[escopo];
  const errada = permissoes.find((p) => !validas.includes(p));
  return errada ? `Permissão desconhecida: ${errada}.` : null;
}

export function rotuloPermissao(permissao: string): string {
  return ROTULOS[permissao] ?? permissao;
}

/** dd/mm/aaaa em UTC, fixo à mão: toLocaleDateString muda de separador entre ambientes. */
function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function descreverValidade(expiraEm: string | null, agora: Date = new Date()): string {
  if (!expiraEm) return 'Sem validade';
  return new Date(expiraEm) < agora
    ? `Expirada em ${dataCurta(expiraEm)}`
    : `Válida até ${dataCurta(expiraEm)}`;
}

/** As chaves antigas do Primavera podem não ter prefixo. */
export function mostrarPrefixo(prefixo: string | null): string {
  return prefixo ? `${prefixo}…` : '—';
}

const IPV4 = /^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/;

/**
 * Um IP por linha. Normaliza o IPv6 como o servidor (trustedRequestIp) o vê,
 * senão a comparação exacta da whitelist falhava.
 */
function normalizarIp(valor: string): string | null {
  if (IPV4.test(valor)) return valor.split('.').every((p) => Number(p) <= 255) ? valor : null;
  if (valor.includes(':') && /^[a-fA-F0-9:]+$/.test(valor)) {
    try {
      return new URL(`http://[${valor}]`).hostname.slice(1, -1);
    } catch {
      return null;
    }
  }
  return null;
}

export function parseIpWhitelist(texto: string): { ips: string[]; erro: string | null } {
  const ips: string[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const valor = linha.trim();
    if (!valor) continue;
    const ip = normalizarIp(valor);
    if (!ip) return { ips: [], erro: `IP inválido: ${valor}.` };
    ips.push(ip);
  }
  return { ips, erro: null };
}
