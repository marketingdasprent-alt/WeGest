import { PaginaInstitucional } from '@/components/site/primitives/PaginaInstitucional';
import { DocumentoLegal } from '@/components/site/primitives/BlocoLegal';
import { COOKIES_SECOES, COOKIES_ATUALIZADO_EM } from '@/components/site/content/legalCookies';

/**
 * Política de cookies.
 *
 * Antes era o ponto 9 da Política de Privacidade, alcançável por
 * `/privacidade#cookies` — uma lista genérica de quatro categorias
 * ("essenciais, desempenho, funcionalidade, marketing") que não dizia que
 * ferramentas correm de facto no site.
 *
 * Agora tem rota própria e descreve o que está mesmo no código: Google Tag
 * Manager, Meta Pixel (carregado apenas em páginas públicas) e o
 * armazenamento local da sessão — que não é um cookie, e a página di-lo.
 */
const Cookies = () => (
  <PaginaInstitucional
    etiqueta="Legal"
    titulo="Política de cookies"
    descricao={`O que guardamos no seu dispositivo, porquê, e como o pode controlar. Última atualização: ${COOKIES_ATUALIZADO_EM}.`}
  >
    <DocumentoLegal secoes={COOKIES_SECOES} />
  </PaginaInstitucional>
);

export default Cookies;
