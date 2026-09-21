import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Registo do KM da viatura por fotografia do odómetro, no portal do motorista.
 *
 * Três passos, cada um com o seu estado: a foto sobe, a IA lê, a pessoa
 * confirma. A leitura é uma sugestão — quem decide o número é sempre o
 * motorista, e é o que ele confirma que fica gravado.
 */

/** Um odómetro não recua. Quando a leitura é inferior ao que a viatura já tem,
 *  ou alguém leu mal, ou trocou de carro — nos dois casos gravar destruía o
 *  histórico de que dependem franquias, limites de contrato e manutenções. */
export function validarKm(km: number | null, kmAtual: number | null): string | null {
  if (km == null || Number.isNaN(km)) return 'Indique os quilómetros.';
  if (!Number.isInteger(km)) return 'Os quilómetros devem ser um número inteiro.';
  if (km <= 0) return 'Os quilómetros devem ser maiores que zero.';
  if (km > 2_000_000) return 'Valor demasiado alto — confirme o número na fotografia.';
  if (kmAtual != null && km < kmAtual) {
    return `O valor indicado (${km.toLocaleString('pt-PT')} km) é inferior ao registado na viatura (${kmAtual.toLocaleString('pt-PT')} km). Confirme o número na fotografia.`;
  }
  return null;
}

/** Salto grande não bloqueia — pode ser real, e travar o registo por suspeita
 *  deixava a viatura com o KM velho, que é pior. Avisa-se e segue. */
export function avisoSalto(km: number, kmAtual: number | null): string | null {
  if (kmAtual == null) return null;
  const diff = km - kmAtual;
  if (diff > 10_000) {
    return `São mais ${diff.toLocaleString('pt-PT')} km do que o último registo. Confirme que leu bem antes de continuar.`;
  }
  return null;
}

interface RegistarParams {
  motoristaId: string;
  viaturaId: string;
  /** KM que a viatura tem agora — para a validação e para congelar o "antes". */
  kmAtual: number | null;
  /** O que a IA leu; null quando falhou e o número foi escrito à mão. */
  kmLido: number | null;
  /** O que o motorista confirmou. É este que conta. */
  kmConfirmado: number;
  fotoPath: string | null;
}

export function useRegistoKm() {
  const [aLer, setALer] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const queryClient = useQueryClient();

  /** Sobe a foto e pede a leitura. Devolve o caminho no storage e o número
   *  lido (null se não deu — aí o motorista escreve à mão, não fica preso). */
  const lerFoto = async (
    file: File,
    motoristaId: string
  ): Promise<{ fotoPath: string | null; km: number | null; erro?: string }> => {
    setALer(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      // Pasta por motorista: é o que a política do bucket usa para o deixar
      // escrever só no que é dele.
      const path = `${motoristaId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('viatura-km')
        .upload(path, file, { contentType: file.type });
      if (upErr) return { fotoPath: null, km: null, erro: upErr.message };

      const { data, error } = await supabase.functions.invoke<{
        km: number | null;
        error?: string;
      }>('ler-km-odometro', { body: { filePath: path, mimeType: file.type } });

      // A foto já está guardada mesmo que a leitura falhe: serve de prova na
      // mesma, e o motorista escreve o número à mão.
      if (error) return { fotoPath: path, km: null, erro: error.message };
      return { fotoPath: path, km: data?.km ?? null, erro: data?.error };
    } finally {
      setALer(false);
    }
  };

  const registar = async (p: RegistarParams): Promise<string | null> => {
    const erro = validarKm(p.kmConfirmado, p.kmAtual);
    if (erro) return erro;

    setAGravar(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      // A viatura é actualizada por gatilho (ver migração 20260918120001) —
      // aqui só se grava a leitura.
      const { error } = await supabase.from('viatura_km_leituras').insert({
        viatura_id: p.viaturaId,
        motorista_id: p.motoristaId,
        km_lido: p.kmLido,
        km_confirmado: p.kmConfirmado,
        km_anterior: p.kmAtual,
        foto_url: p.fotoPath,
        origem: 'motorista_portal',
        created_by: auth.user?.id ?? null,
      });
      if (error) return error.message;

      // O cartão da viatura mostra o KM, e o estado da semana decide se o
      // painel avisa que falta entregar — sem isto ficavam os dois no valor
      // antigo até alguém recarregar a página.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['motorista-viatura'] }),
        queryClient.invalidateQueries({ queryKey: ['km-da-semana'] }),
      ]);
      return null;
    } finally {
      setAGravar(false);
    }
  };

  return { lerFoto, registar, aLer, aGravar };
}
