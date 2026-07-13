import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { UploadDocumentParams } from './types';
import { generateDocumentFromTemplate } from './generate-document';

/**
 * Upload document to Supabase Storage and return the URL.
 */
export const uploadDocumentToStorage = async (
  params: UploadDocumentParams
): Promise<string | null> => {
  const { templateId, motoristaData, documentData = {}, contratoId, action = 'print' } = params;

  try {
    const pdf = await generateDocumentFromTemplate({
      templateId,
      motoristaData,
      documentData,
      action,
    });

    if (!pdf) return null;

    const sanitizeFileName = (name: string): string => {
      return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    };

    const { data: template } = await supabase
      .from('document_templates')
      .select('nome')
      .eq('id', templateId)
      .single();

    const templateName = template?.nome || 'documento';
    const sanitizedTemplate = sanitizeFileName(templateName);
    const sanitizedNome = sanitizeFileName(motoristaData.nome || 'motorista');
    const fileName = `${contratoId}/${sanitizedTemplate}_${sanitizedNome}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;

    const pdfBlob = pdf.output('blob');

    const { data, error } = await supabase.storage.from('documentos').upload(fileName, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });

    if (error) {
      console.error('Erro ao fazer upload do documento:', error);
      return null;
    }

    return data.path;
  } catch (error) {
    console.error('Erro ao fazer upload do documento:', error);
    return null;
  }
};
