import { supabase } from '@/integrations/supabase/client';
import { empresaDocData, empresaFooterText, type EmpresaConfig } from '@/config/empresas';
import { resolveCartaoFrota } from './document-template/resolveCartaoFrota';

import {
  generateDocumentosCombinados,
  type DocumentoCombinado,
} from './generateDocumentFromTemplate';

import type { Motorista } from '@/types/motorista';
import type { ViaturaBasic } from '@/hooks/useViaturas';

export interface GenerateContratoPrestacaoPdfParams {
  motorista: Motorista;
  /** Viatura do motorista (carro slot). */
  viatura?: ViaturaBasic | null;
  /** Valor semanal cobrado pelo slot (por carro). */
  valorSemanal: number | null;
  /** Data de início do slot (ISO ou yyyy-mm-dd). */
  dataInicio: string | null;
  /** Número/código do contrato de prestação (se já gravado). */
  numeroContrato?: number | null;
  empresa: EmpresaConfig | null;
  action?: 'print' | 'download';
  /** Cidade de assinatura escolhida no dialog (normalmente a cidade de uma
   *  estação). Manda sobre o fallback (sede da empresa / cidade do motorista). */
  cidadeAssinatura?: string;
}

/**
 * Gera o PDF do Contrato de Prestação de Serviços (regime slot) a partir
 * do template `contrato_prestacao` da empresa. Reusa o motor genérico
 * `generateDocumentFromTemplate` — os placeholders {{motorista_*}} são
 * preenchidos com os dados do motorista, e {{valor_semanal}} com o slot.
 */
export const generateContratoPrestacaoPdf = async ({
  motorista,
  viatura,
  valorSemanal,
  dataInicio,
  numeroContrato,
  empresa,
  action = 'print',
  cidadeAssinatura,
}: GenerateContratoPrestacaoPdfParams): Promise<void> => {
  if (!empresa) {
    throw new Error('Empresa não definida — impossível gerar o contrato de prestação.');
  }

  // 1) Templates desta empresa: prestação (sempre) + aluguer (anexado a seguir,
  //    com folha branca a separar — mesmo padrão do TVDE).
  const { data: templates, error: templatesErr } = await supabase
    .from('document_templates')
    .select('id, nome, tipo, cliente_empresa_id, versao')
    .eq('ativo', true)
    .eq('cliente_empresa_id', empresa.id)
    .in('tipo', ['contrato_prestacao', 'contrato_aluguer'])
    .order('versao', { ascending: false });

  if (templatesErr) throw templatesErr;

  const prestacaoTemplate = (templates ?? []).find((t) => t.tipo === 'contrato_prestacao');
  const aluguerTemplate = (templates ?? []).find((t) => t.tipo === 'contrato_aluguer');
  if (!prestacaoTemplate) {
    throw new Error(
      `Sem template de prestação activo para a empresa "${empresa.nome}". ` +
        `Cria um "Contrato Prestação - ${empresa.nome}" em Configurações do Sistema → Documentos.`
    );
  }

  // 2) Dados do motorista (placeholders {{motorista_*}}, {{carta_*}}).
  const motoristaData: Record<string, unknown> = {
    nome: motorista.nome,
    nif: motorista.nif ?? '',
    documento_tipo: motorista.documento_tipo ?? '',
    documento_numero: motorista.documento_numero ?? '',
    documento_validade: motorista.documento_validade ?? '',
    carta_conducao: motorista.carta_conducao ?? '',
    carta_categorias: motorista.carta_categorias?.join(', ') ?? '',
    carta_validade: motorista.carta_validade ?? '',
    morada: motorista.morada ?? '',
    email: motorista.email ?? '',
    telefone: motorista.telefone ?? '',
    cidade: motorista.cidade ?? '',
    iban: motorista.iban ?? '',
  };

  // 3) Dados do contrato (slot).
  const today = new Date().toISOString().split('T')[0];
  const eur = (n: number | null | undefined) =>
    n != null && !Number.isNaN(Number(n)) ? `${Number(n).toFixed(2)} €` : '—';

  // Cartão de combustível do motorista (placeholders {{cartao_frota_*}}).
  const cartaoFrota = await resolveCartaoFrota(motorista.id ?? null);

  const documentData = {
    data_inicio: dataInicio ?? today,
    data_assinatura: today,
    cidade_assinatura:
      cidadeAssinatura || empresa.sede || (motoristaData.cidade as string) || 'Leiria',
    numero_contrato: numeroContrato != null ? String(numeroContrato) : '',
    viatura_matricula: viatura?.matricula ?? '—',
    viatura_data_matricula: viatura?.data_matricula ?? '',
    viatura_marca_modelo: viatura ? `${viatura.marca} ${viatura.modelo}`.trim() : '—',
    valor_semanal: eur(valorSemanal),
    cartao_frota_marca: cartaoFrota.marca,
    cartao_frota_numero: cartaoFrota.numero,
    cartao_frota_validade: cartaoFrota.validade,
    cartao_frota_limite: cartaoFrota.limite,
    empresaData: empresaDocData(empresa),
  };

  const footerText = empresaFooterText(empresa);

  // Slot: Prestação + Aluguer (o carro é do motorista, por isso o Aluguer sai
  // com os campos financeiros/estações em branco). Um PDF, folha branca a
  // separar.
  const docs: DocumentoCombinado[] = [
    {
      templateId: prestacaoTemplate.id,
      motoristaData,
      documentData,
      headerLogoUrl: '/Logo.png',
      footerText,
    },
  ];
  if (aluguerTemplate) {
    docs.push({
      templateId: aluguerTemplate.id,
      motoristaData,
      documentData,
      headerLogoUrl: '/Logo.png',
      footerText,
    });
  }

  const fileName = `Prestacao_${numeroContrato ?? ''}_${motorista.nome ?? ''}`.trim();
  await generateDocumentosCombinados(docs, { action, fileName });
};
