import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { TicketRaw as Ticket } from '@/types/ticket';
import type { Viatura, Motorista } from '@/components/assistencia/ticket/types';

export interface ClosureFormData {
  km_fim: string;
  combustivel_fim: string;
  adblue_fim: string;
  limpeza_fim: string;
  valor_reparacao: string;
  cobrar_motorista: boolean;
  descricao_reparacao: string;
  numero_fatura: string;
}

export type ClosureDecisao = 'motorista' | 'empresa' | 'aberto' | null;
export type ClosureSubstDecisao = 'devolver' | 'definitivo' | null;

export interface ExitMediaFile {
  url: string;
  path: string;
  type: 'image' | 'video';
}

interface CloseTicketInput {
  closureData: ClosureFormData;
  decisao: ClosureDecisao;
  substDecisao: ClosureSubstDecisao;
  isEditMode: boolean;
  faturaFile: File | null;
  exitMediaFiles: ExitMediaFile[];
}

interface UseTicketClosureArgs {
  ticket: Ticket | null;
  viatura: Viatura | null;
  motorista: Motorista | null;
}

/**
 * Encapsula o fecho de um ticket de assistência:
 *
 *  1. Cria/actualiza `viatura_reparacoes`
 *  2. Upload de fatura (se aplicável)
 *  3. Salva anexos de saída + entrada em `viatura_danos`
 *  4. Lançamento em `motorista_financeiro` (se cobrar motorista)
 *  5. Actualiza `assistencia_tickets` (status='resolvido' + km_fim + ...)
 *  6. Actualiza estado da viatura original
 *  7. Reassociação de motorista e tratamento de viatura substituta
 *  8. Mensagem de status_change com sumário
 *  9. Notificação se ficar sem fatura
 *
 * Mantido como hook (não componente) porque o estado de form vive no caller
 * — aqui só queremos a transacção e o flag `isClosing`.
 */
export function useTicketClosure({ ticket, viatura, motorista }: UseTicketClosureArgs) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isClosing, setIsClosing] = useState(false);

  const closeTicket = useCallback(
    async ({
      closureData,
      decisao,
      substDecisao,
      isEditMode,
      faturaFile,
      exitMediaFiles,
    }: CloseTicketInput): Promise<boolean> => {
      if (!ticket || !viatura) return false;

      // Validações
      if (!closureData.km_fim) {
        toast({
          title: 'Erro',
          description: 'Informe a quilometragem final.',
          variant: 'destructive',
        });
        return false;
      }
      if (ticket.km_inicio != null && parseInt(closureData.km_fim) < ticket.km_inicio) {
        toast({
          title: 'Erro',
          description: `A KM final (${closureData.km_fim}) não pode ser inferior à KM inicial (${ticket.km_inicio}).`,
          variant: 'destructive',
        });
        return false;
      }
      if (!decisao) {
        toast({
          title: 'Erro',
          description: 'Indique a responsabilidade financeira da reparação.',
          variant: 'destructive',
        });
        return false;
      }
      if (ticket.viatura_substituta_id && !substDecisao) {
        toast({
          title: 'Erro',
          description: 'Indique o destino da viatura substituta.',
          variant: 'destructive',
        });
        return false;
      }
      if (!closureData.numero_fatura || !closureData.numero_fatura.trim()) {
        toast({
          title: 'Erro',
          description: 'Informe o número de fatura.',
          variant: 'destructive',
        });
        return false;
      }
      if (!faturaFile) {
        toast({
          title: 'Erro',
          description: 'Anexe o ficheiro da fatura (PDF ou imagem).',
          variant: 'destructive',
        });
        return false;
      }

      try {
        setIsClosing(true);
        const valor = closureData.valor_reparacao ? parseFloat(closureData.valor_reparacao) : 0;
        const kmFim = parseInt(closureData.km_fim);
        const ticketId = ticket.id;

        let reparacaoId = (ticket as any).reparacao_id;

        // 1. Criar/actualizar reparação
        if (isEditMode && reparacaoId) {
          const { error: repError } = await supabase
            .from('viatura_reparacoes')
            .update({
              descricao: closureData.descricao_reparacao || ticket.titulo,
              custo: valor,
              km_entrada: ticket.km_inicio,
              registado_por: user?.id,
              motorista_responsavel_id: motorista?.id || null,
              cobrar_motorista: decisao === 'motorista',
              status_financeiro: decisao,
            })
            .eq('id', reparacaoId);
          if (repError) throw repError;
        } else {
          const { data: novoReparacao, error: repError } = await supabase
            .from('viatura_reparacoes')
            .insert({
              viatura_id: viatura.id,
              descricao: closureData.descricao_reparacao || ticket.titulo,
              custo: valor,
              data_entrada: ticket.created_at,
              data_saida: new Date().toISOString(),
              km_entrada: ticket.km_inicio,
              registado_por: user?.id,
              motorista_responsavel_id: motorista?.id || null,
              cobrar_motorista: decisao === 'motorista',
              valor_a_cobrar: decisao === 'motorista' ? valor : null,
              data_inicio_cobranca:
                decisao === 'motorista' ? new Date().toISOString().split('T')[0] : null,
              status_financeiro: decisao,
            })
            .select()
            .single();
          if (repError) throw repError;
          reparacaoId = novoReparacao?.id;
        }

        // 2. Upload fatura
        let faturaUrl: string | null = (ticket as any).fatura_url || null;
        if (faturaFile) {
          const fileExt = faturaFile.name.split('.').pop();
          const fileName = `faturas/${ticketId}/${Date.now()}.${fileExt}`;
          const { error: uploadErr } = await supabase.storage
            .from('viatura-documentos')
            .upload(fileName, faturaFile);
          if (uploadErr) throw uploadErr;

          const {
            data: { publicUrl },
          } = supabase.storage.from('viatura-documentos').getPublicUrl(fileName);
          faturaUrl = publicUrl;
        }

        // 3. Anexos de saída + dano de checkout
        if (exitMediaFiles.length > 0) {
          const anexosSaida = exitMediaFiles.map((file) => ({
            ticket_id: ticketId,
            tipo_ficheiro: file.type === 'image' ? 'foto' : 'video',
            ficheiro_url: file.path,
            nome_ficheiro: file.path.split('/').pop() || 'anexo_saida',
            uploaded_by: user?.id,
            tipo_inspecao: 'checkout',
          }));
          const { error: anexosSaidaError } = await supabase
            .from('assistencia_anexos')
            .insert(anexosSaida);
          if (anexosSaidaError) throw anexosSaidaError;

          const { data: novoDano, error: danoError } = await supabase
            .from('viatura_danos')
            .insert({
              viatura_id: viatura.id,
              motorista_id: motorista?.id || null,
              ticket_id: ticketId,
              descricao: `Check-out de Assistência #${String(ticket.numero).padStart(4, '0')}`,
              localizacao: 'outro',
              estado: 'reparado',
              data_registo: new Date().toISOString().split('T')[0],
              registado_por: user?.id,
              observacoes: `Registado automaticamente no fecho da assistência: ${ticket.titulo}`,
            })
            .select()
            .single();

          if (!danoError && novoDano) {
            const fotosDano = exitMediaFiles
              .filter((f) => f.type === 'image')
              .map((file) => ({
                dano_id: novoDano.id,
                ficheiro_url: file.path,
                nome_ficheiro: file.path.split('/').pop() || 'foto_checkout',
                uploaded_by: user?.id,
              }));

            // Adicionar fatura também aos danos
            if (faturaUrl) {
              fotosDano.push({
                dano_id: novoDano.id,
                ficheiro_url: faturaUrl,
                nome_ficheiro: `Fatura_${closureData.numero_fatura}.pdf`,
                uploaded_by: user?.id,
              });
            }

            if (fotosDano.length > 0) {
              const { error: fotosDanoError } = await supabase
                .from('viatura_dano_fotos')
                .insert(fotosDano);
              if (fotosDanoError) throw fotosDanoError;
            }
          }
        }

        // 4. Lançamento financeiro
        if (reparacaoId) {
          if (isEditMode) {
            const { data: existingFin } = await supabase
              .from('motorista_financeiro')
              .select('id')
              .eq('reparacao_id', reparacaoId)
              .maybeSingle();

            if (existingFin && decisao === 'motorista' && valor > 0) {
              await supabase
                .from('motorista_financeiro')
                .update({
                  valor,
                  descricao: `Reparação Viatura: ${viatura.matricula} - ${closureData.descricao_reparacao || ticket.titulo}`,
                  referencia: faturaUrl
                    ? `Ticket #${ticket.numero} | ${faturaUrl}`
                    : `Ticket #${ticket.numero}`,
                })
                .eq('id', existingFin.id);
            } else if (!existingFin && decisao === 'motorista' && valor > 0) {
              await supabase.from('motorista_financeiro').insert({
                motorista_id: motorista?.id,
                tipo: 'debito',
                categoria: 'reparacao',
                descricao: `Reparação Viatura: ${viatura.matricula} - ${closureData.descricao_reparacao || ticket.titulo}`,
                valor,
                data_movimento: new Date().toISOString().split('T')[0],
                status: 'pendente',
                reparacao_id: reparacaoId,
                referencia: faturaUrl
                  ? `Ticket #${ticket.numero} | ${faturaUrl}`
                  : `Ticket #${ticket.numero}`,
              });
            } else if (existingFin && decisao !== 'motorista') {
              await supabase.from('motorista_financeiro').delete().eq('id', existingFin.id);
            }
          } else if (decisao === 'motorista' && motorista?.id && valor > 0) {
            const refBase = `Ticket #${ticket.numero}`;
            await supabase.from('motorista_financeiro').insert({
              motorista_id: motorista.id,
              tipo: 'debito',
              categoria: 'reparacao',
              descricao: `Reparação Viatura: ${viatura.matricula} - ${closureData.descricao_reparacao || ticket.titulo}`,
              valor,
              data_movimento: new Date().toISOString().split('T')[0],
              status: 'pendente',
              reparacao_id: reparacaoId,
              referencia: faturaUrl ? `${refBase} | ${faturaUrl}` : refBase,
            });
          }
        }

        // 5. Actualizar ticket
        const ticketUpdates: any = {
          km_fim: kmFim,
          combustivel_fim: closureData.combustivel_fim,
          valor_reparacao: valor,
          cobrar_motorista: decisao === 'motorista',
          numero_fatura: closureData.numero_fatura.trim() || null,
          fatura_url: faturaUrl,
          reparacao_id: reparacaoId,
        };
        if (!isEditMode) {
          ticketUpdates.status = 'resolvido';
          ticketUpdates.data_resolucao = new Date().toISOString();
        }

        const { error: ticketUpdateError } = await supabase
          .from('assistencia_tickets')
          .update(ticketUpdates)
          .eq('id', ticketId);
        if (ticketUpdateError) throw ticketUpdateError;

        // 6 + 7 + 8. Viatura, reassociação e log (apenas se não for edit)
        if (!isEditMode) {
          const viaturaOriginalStatus = motorista?.id ? 'em_uso' : 'disponivel';
          const { error: viaturaUpdateError } = await supabase
            .from('viaturas')
            .update({ status: viaturaOriginalStatus, km_atual: kmFim })
            .eq('id', viatura.id);
          if (viaturaUpdateError) throw viaturaUpdateError;

          // 7a. Reassociar motorista
          if (motorista?.id) {
            const { data: existingAssoc } = await supabase
              .from('motorista_viaturas')
              .select('id')
              .eq('motorista_id', motorista.id)
              .eq('viatura_id', viatura.id)
              .eq('status', 'ativo')
              .is('data_fim', null)
              .maybeSingle();

            if (!existingAssoc) {
              const { error: reassocError } = await supabase.from('motorista_viaturas').insert({
                motorista_id: motorista.id,
                viatura_id: viatura.id,
                data_inicio: new Date().toISOString().split('T')[0],
                status: 'ativo',
                tipo: 'normal',
              });
              if (reassocError) throw reassocError;
            }
          }

          // 7b. Tratar viatura substituta
          if (ticket.viatura_substituta_id && motorista?.id) {
            if (substDecisao === 'devolver') {
              const { error: encerraSubstitutaError } = await supabase
                .from('motorista_viaturas')
                .update({
                  data_fim: new Date().toISOString().split('T')[0],
                  status: 'encerrado',
                })
                .eq('viatura_id', ticket.viatura_substituta_id)
                .eq('motorista_id', motorista.id)
                .eq('tipo', 'substituta')
                .is('data_fim', null);
              if (encerraSubstitutaError) throw encerraSubstitutaError;

              const { error: liberaSubstitutaError } = await supabase
                .from('viaturas')
                .update({ status: 'disponivel' })
                .eq('id', ticket.viatura_substituta_id);
              if (liberaSubstitutaError) throw liberaSubstitutaError;
            } else if (substDecisao === 'definitivo') {
              const { error: definitivoError } = await supabase
                .from('motorista_viaturas')
                .update({ tipo: 'normal' })
                .eq('viatura_id', ticket.viatura_substituta_id)
                .eq('motorista_id', motorista.id)
                .eq('tipo', 'substituta')
                .is('data_fim', null);
              if (definitivoError) throw definitivoError;
            }
          }

          // 8. Mensagem de status_change
          const checkoutMessage =
            `Viatura reparada com check-out completo - ` +
            `KM Final: ${kmFim} - ` +
            `Combustível: ${closureData.combustivel_fim} - ` +
            `Valor Total: ${valor}€ - ` +
            `Responsabilidade: ${decisao === 'motorista' ? 'Motorista' : 'Empresa'}` +
            (closureData.descricao_reparacao
              ? ` - Descrição: ${closureData.descricao_reparacao}`
              : '');

          const { error: mensagemError } = await supabase.from('assistencia_mensagens').insert({
            ticket_id: ticketId,
            autor_id: user?.id,
            mensagem: checkoutMessage,
            tipo: 'status_change',
          });
          if (mensagemError) throw mensagemError;
        }

        toast({
          title: isEditMode ? 'Atualizado' : 'Sucesso',
          description: isEditMode
            ? 'Detalhes da reparação atualizados.'
            : 'Viatura reparada e assistência concluída.',
        });

        // 9. Notificar gestores se ficar sem fatura
        if (!isEditMode && !faturaUrl && !faturaFile) {
          supabase.functions
            .invoke('send-assistance-notification', {
              body: { ticket_id: ticketId, tipo: 'falta_fatura' },
            })
            .catch((err) => console.error('Erro ao enviar notificação de falta de fatura:', err));
        }

        return true;
      } catch (error: unknown) {
        console.error('Erro ao concluir reparação:', error);
        const message =
          error instanceof Error ? error.message : 'Não foi possível concluir a reparação.';
        toast({ title: 'Erro', description: message, variant: 'destructive' });
        return false;
      } finally {
        setIsClosing(false);
      }
    },
    [ticket, viatura, motorista, user, toast]
  );

  return { closeTicket, isClosing };
}
