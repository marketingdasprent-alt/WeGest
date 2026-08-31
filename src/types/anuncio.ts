/**
 * Anúncio de uma empresa cliente, do ponto de vista do PERFIL DO CLIENTE.
 *
 * Nasce sem viatura (`viatura_id: null`) — o preço e o período são escritos
 * primeiro, a viatura escolhe-se depois, do lado dela.
 */
export interface ClienteAnuncio {
  id: string;
  cliente_id: string;
  viatura_id: string | null;
  preco: number;
  data_inicio: string;
  data_fim: string;
  created_at: string;
  /** Preenchida só quando há viatura atribuída (join). */
  viatura_matricula?: string | null;
}

/**
 * Um anúncio por atribuir, do ponto de vista do PERFIL DA VIATURA — é o que
 * povoa o seletor "escolher que empresa tem anúncio nesta viatura".
 */
export interface AnuncioPorAtribuir {
  id: string;
  cliente_nome: string;
  preco: number;
  data_inicio: string;
  data_fim: string;
}

/** `date` do Postgres chega como "AAAA-MM-DD" — não precisa de fuso horário. */
export function formatarDataPt(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Rótulo de uma linha do seletor de anúncios por atribuir.
 *
 * Junta tudo o que decide se aquele é o anúncio certo — quem paga, quanto, e
 * quando — porque quem escolhe está a ligar viatura e cliente sem outro
 * contexto à vista.
 */
export function formatarRotuloAnuncio(anuncio: AnuncioPorAtribuir): string {
  const preco = anuncio.preco.toLocaleString('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${anuncio.cliente_nome} — ${preco} € — ${formatarDataPt(anuncio.data_inicio)} a ${formatarDataPt(anuncio.data_fim)}`;
}
