import { Home, Car, Euro, FileText, type LucideIcon } from 'lucide-react';

/**
 * As quatro secções do painel do motorista. Uma só lista alimenta a barra
 * inferior (telemóvel) e a sidebar (desktop), para nunca divergirem.
 *
 * A secção activa vive no URL (`?tab=`), não em estado local: sobrevive ao
 * refresh, dá para partilhar/ligar directamente (os alertas do Início levam à
 * secção certa) e o botão "voltar" do telemóvel anda pelas secções, que é o
 * que quem usa apps espera.
 */
export type MotoristaTab = 'inicio' | 'viatura' | 'contas' | 'documentos';

export interface MotoristaTabDef {
  id: MotoristaTab;
  label: string;
  icon: LucideIcon;
}

export const MOTORISTA_TABS: readonly MotoristaTabDef[] = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'viatura', label: 'Viatura', icon: Car },
  { id: 'contas', label: 'Contas', icon: Euro },
  { id: 'documentos', label: 'Documentos', icon: FileText },
];

export const TAB_PARAM = 'tab';
export const TAB_POR_DEFEITO: MotoristaTab = 'inicio';
export const ROTA_PAINEL = '/motorista/painel';

export function tabDoParametro(valor: string | null | undefined): MotoristaTab {
  return MOTORISTA_TABS.some((t) => t.id === valor) ? (valor as MotoristaTab) : TAB_POR_DEFEITO;
}

/**
 * Secção activa a partir da localização. As sub-páginas do painel (hoje só o
 * detalhe de um acordo de pagamento) pertencem a uma secção mesmo sem `?tab=`
 * — sem isto a sidebar não acendia nada quando o motorista abria um acordo.
 */
export function tabActivo(pathname: string, search: string): MotoristaTab {
  if (pathname.startsWith(`${ROTA_PAINEL}/acordos`)) return 'contas';
  return tabDoParametro(new URLSearchParams(search).get(TAB_PARAM));
}

/** URL da secção. O Início é o painel sem parâmetros, para o `start_url` do PWA continuar a bater certo. */
export function urlDoTab(tab: MotoristaTab): string {
  return tab === TAB_POR_DEFEITO ? ROTA_PAINEL : `${ROTA_PAINEL}?${TAB_PARAM}=${tab}`;
}
