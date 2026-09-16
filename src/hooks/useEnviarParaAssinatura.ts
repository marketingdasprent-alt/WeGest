import { useMutation } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { base64Puro } from '@/lib/assinaturaApi';
import { validacaoFalhou, validarSignatarios, type Signatario } from '@/lib/assinaturas';
import { capturarSnapshot } from '@/utils/document-template/snapshot';
import type { ContratoAnexo } from '@/utils/generateContratoPdf';
import type { DocumentTemplate } from '@/utils/document-template/types';

export interface EnviarParaAssinaturaArgs {
  anexos: ContratoAnexo[];
  signatarios: Signatario[];
  orgId: string;
  contratoId?: string | null;
  criadoPor?: string | null;
  validadeDias?: number;
}

export function useEnviarParaAssinatura() {
  return useMutation({
    mutationFn: async ({
      anexos,
      signatarios,
      orgId,
      contratoId,
      criadoPor,
      validadeDias,
    }: EnviarParaAssinaturaArgs) => {
      const validacao = validarSignatarios(signatarios);
      if (validacaoFalhou(validacao)) {
        throw new Error(
          validacao.semEmail.length > 0
            ? `Sem email na ficha: ${validacao.semEmail.join(', ')}`
            : 'Escolha pelo menos uma pessoa para assinar.'
        );
      }

      if (anexos.length === 0) throw new Error('Não há documentos para enviar.');

      // A fotografia usa o template actual para impedir que edições posteriores
      // alterem o documento que a pessoa recebeu para assinar.
      const ids = [...new Set(anexos.map((a) => a.templateId))];
      const { data: templates, error } = await supabase
        .from('document_templates')
        .select('*')
        .in('id', ids);
      if (error) throw error;

      const porId = new Map<string, DocumentTemplate>(
        (templates ?? []).map((t) => [t.id, t as unknown as DocumentTemplate])
      );

      const criadoEm = new Date().toISOString();
      const falharam: string[] = [];

      for (const anexo of anexos) {
        const template = porId.get(anexo.templateId);
        if (!template) throw new Error(`Template do documento "${anexo.fileName}" não encontrado.`);

        const snapshot = capturarSnapshot(
          { ...anexo.doc, templateId: anexo.templateId },
          template,
          criadoEm
        );

        const { data, error: erroInvoke } = await supabase.functions.invoke('assinatura-pedir', {
          body: {
            orgId,
            contratoId: contratoId ?? null,
            templateId: anexo.templateId,
            documentoNome: anexo.fileName.replace(/\.pdf$/i, ''),
            pdfBase64: base64Puro(anexo.pdf.output('datauristring')),
            snapshot,
            signatarios: validacao.signatarios.map((s) => ({
              papel: s.papel,
              nome: s.nome,
              email: s.email,
              clienteId: s.clienteId ?? null,
              motoristaId: s.motoristaId ?? null,
            })),
            validadeDias,
            criadoPor: criadoPor ?? null,
          },
        });

        if (erroInvoke) throw erroInvoke;
        if (data?.error) throw new Error(data.error);
        if (Array.isArray(data?.falharam)) falharam.push(...data.falharam);
      }

      // Pedidos criados não são revertidos por falhas de email, para permitir reenvio.
      return { falharam: [...new Set(falharam)] };
    },
  });
}
