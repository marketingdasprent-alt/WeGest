import { Link } from 'react-router-dom';
import { PaginaInstitucional } from '@/components/site/primitives/PaginaInstitucional';
import { DocumentoLegal, AvisoRevisaoJuridica } from '@/components/site/primitives/BlocoLegal';
import {
  PRIVACIDADE_SECOES,
  PRIVACIDADE_ATUALIZADO_EM,
  PRIVACIDADE_AVISO,
} from '@/components/site/content/legalPrivacidade';

const Privacidade = () => (
  <PaginaInstitucional
    etiqueta="Legal"
    titulo="Política de privacidade"
    descricao={`Que dados tratamos, com que fundamento e durante quanto tempo. Última atualização: ${PRIVACIDADE_ATUALIZADO_EM}.`}
  >
    <AvisoRevisaoJuridica>{PRIVACIDADE_AVISO}</AvisoRevisaoJuridica>
    <DocumentoLegal secoes={PRIVACIDADE_SECOES} />

    {/*
      A política de cookies passou a ter página própria — aqui fica o
      encaminhamento. A âncora #cookies é mantida porque links antigos
      (rodapé anterior, emails, resultados de pesquisa) apontam para ela: sem
      isto, aterrariam no topo desta página sem explicação.
    */}
    <section id="cookies" className="scroll-mt-20 border-t border-border/50 py-9">
      <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-foreground">
        Cookies
      </h2>
      <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted-foreground">
        A descrição das ferramentas que utilizamos, dos cookies que colocam e de como os controlar
        passou a viver numa página própria.
      </p>
      <Link
        to="/cookies"
        className="mt-4 inline-block font-medium text-primary underline-offset-4 hover:underline"
      >
        Ver a Política de Cookies
      </Link>
    </section>
  </PaginaInstitucional>
);

export default Privacidade;
