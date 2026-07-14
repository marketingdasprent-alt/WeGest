import { supabase } from '@/integrations/supabase/client';

export const fetchAvailableTemplates = async (empresaId?: string) => {
  const query = supabase
    .from('document_templates')
    .select('id, nome, tipo, empresa_id')
    .eq('ativo', true)
    .order('nome', { ascending: true });

  if (empresaId) {
    query.eq('empresa_id', empresaId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
};
