import { supabase } from '@/integrations/supabase/client';

export interface ColaboradorQueImprime {
  nome: string;
  /** data:image da assinatura desenhada em "Minha conta"; vazio sem assinatura. */
  assinatura: string;
}

const NINGUEM: ColaboradorQueImprime = { nome: '', assinatura: '' };

/** Quem gera o documento assina-o e rubrica-o com a assinatura do seu perfil. */
export async function carregarColaboradorQueImprime(): Promise<ColaboradorQueImprime> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NINGUEM;
    const { data: perfil, error } = await supabase
      .from('profiles')
      .select('nome, assinatura_url')
      .eq('id', auth.user.id)
      .maybeSingle();
    if (error) throw error;
    return { nome: perfil?.nome ?? '', assinatura: perfil?.assinatura_url ?? '' };
  } catch (error: unknown) {
    // Sem a assinatura o documento continua a imprimir-se, só sai por assinar.
    console.warn('[documentos] Não foi possível ler a assinatura de quem imprime.', error);
    return NINGUEM;
  }
}
