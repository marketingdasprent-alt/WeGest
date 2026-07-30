import { PaginaInstitucional } from '@/components/site/primitives/PaginaInstitucional';
import { DocumentoLegal, AvisoRevisaoJuridica } from '@/components/site/primitives/BlocoLegal';
import {
  TERMOS_SECOES,
  TERMOS_ATUALIZADO_EM,
  TERMOS_AVISO,
} from '@/components/site/content/legalTermos';

const Termos = () => (
  <PaginaInstitucional
    etiqueta="Legal"
    titulo="Termos de utilização"
    descricao={`Condições de acesso e utilização da plataforma WeGest. Última atualização: ${TERMOS_ATUALIZADO_EM}.`}
  >
    <AvisoRevisaoJuridica>{TERMOS_AVISO}</AvisoRevisaoJuridica>
    <DocumentoLegal secoes={TERMOS_SECOES} />
  </PaginaInstitucional>
);

export default Termos;
