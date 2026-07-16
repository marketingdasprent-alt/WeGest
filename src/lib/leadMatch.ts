import { supabase } from '@/integrations/supabase/client';
import { normalizeEmail, normalizePhone } from './normalize';

export interface LeadMatch {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  caucao_valor: number | null;
}

/** Procura o lead mais recente cujo email ou telefone bate com o dado
 *  (normalizado — ver normalize.ts). RLS já restringe à org actual. */
export async function findLeadMatch(
  email: string | null | undefined,
  telefone: string | null | undefined
): Promise<LeadMatch | null> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(telefone);

  const filters: string[] = [];
  if (normalizedEmail) filters.push(`email.ilike.${normalizedEmail}`);
  if (normalizedPhone) filters.push(`telefone.ilike.%${normalizedPhone}%`);
  if (filters.length === 0) return null;

  const { data, error } = await supabase
    .from('leads_dasprent')
    .select('id, nome, email, telefone, caucao_valor')
    .or(filters.join(','))
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data?.[0] as LeadMatch | undefined) ?? null;
}
