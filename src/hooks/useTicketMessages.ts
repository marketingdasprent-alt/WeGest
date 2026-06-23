import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type {
  TicketRaw as Ticket,
  TicketMensagem as Mensagem,
  TicketAnexo as Anexo,
} from '@/types/ticket';

interface SendMessageInput {
  text: string;
  files: File[];
  ticket: Ticket | null;
}

interface UpdateLegendaInput {
  id: string;
  legenda: string;
}

/**
 * Gere mensagens e anexos de um ticket de assistência.
 *
 * - Faz fetch inicial + subscreve realtime (`assistencia_mensagens`, `assistencia_anexos`)
 * - Expõe `sendMessage` (insere mensagem + anexos, dispara webhook) e
 *   `updateLegenda`
 * - Mantém estado local (não usa React Query porque o realtime já funciona
 *   como invalidação push; converter exigiria refazer a subscription)
 */
export function useTicketMessages(ticketId: string | undefined) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [sending, setSending] = useState(false);
  const [updatingLegenda, setUpdatingLegenda] = useState(false);

  const fetchMensagensAndAnexos = useCallback(
    async (ticketIdOverride?: string) => {
      const targetId = ticketIdOverride || ticketId;
      if (!targetId) return;

      try {
        const [mensagensRes, anexosRes] = await Promise.all([
          supabase
            .from('assistencia_mensagens')
            .select('id, mensagem, tipo, created_at, autor_id')
            .eq('ticket_id', targetId)
            .order('created_at', { ascending: true }),
          supabase
            .from('assistencia_anexos')
            .select('*')
            .eq('ticket_id', targetId)
            .order('created_at', { ascending: false }),
        ]);

        if (mensagensRes.error) console.error('Erro mensagens:', mensagensRes.error);
        if (anexosRes.error) console.error('Erro anexos:', anexosRes.error);

        // Normalizar URLs dos anexos consoante a origem (storage do ticket vs bucket viaturas)
        const rawAnexos = anexosRes.data || [];
        const formattedAnexos = rawAnexos.map((a) => {
          let url = a.ficheiro_url;
          let bucket = 'assistencia-anexos';

          if (!url) {
            console.warn(`Anexo ${a.id} sem URL.`);
          } else if (url.startsWith('blob:')) {
            if (a.nome_ficheiro) {
              const pathCheckin = `assistencia/${a.uploaded_by || 'unknown'}/${a.nome_ficheiro}`;
              const {
                data: { publicUrl },
              } = supabase.storage.from('assistencia-anexos').getPublicUrl(pathCheckin);
              url = publicUrl;
            }
          } else if (url.startsWith('http')) {
            const bucketMatch = url.match(
              /\/storage\/v1\/object\/(?:public|authenticated|sign)\/([^/]+)\/(.+)$/
            );
            if (bucketMatch) {
              bucket = bucketMatch[1];
              const path = bucketMatch[2].split('?')[0];
              const {
                data: { publicUrl },
              } = supabase.storage.from(bucket).getPublicUrl(path);
              url = publicUrl;
            }
          } else {
            if (!url.startsWith('assistencia/') && !url.includes('/')) {
              url = `${targetId}/${url}`;
            }
            if (!url.startsWith('assistencia/')) {
              bucket = 'viaturas';
            }
            const {
              data: { publicUrl },
            } = supabase.storage.from(bucket).getPublicUrl(url);
            url = publicUrl;
          }

          let tipo = (a as any).tipo_inspecao;
          if (!tipo) {
            if (
              a.nome_ficheiro?.toLowerCase().includes('saida') ||
              a.nome_ficheiro?.toLowerCase().includes('checkout')
            ) {
              tipo = 'checkout';
            } else {
              tipo = 'checkin';
            }
          }
          return { ...a, ficheiro_url: url, tipo_inspecao: tipo };
        });

        setAnexos(formattedAnexos as Anexo[]);

        if (mensagensRes.data) {
          const autorIds = [...new Set(mensagensRes.data.map((m) => m.autor_id).filter(Boolean))];
          const { data: autores } = await supabase
            .from('profiles')
            .select('id, nome, cargo, grupo:cargo_id(nome)')
            .in('id', autorIds);

          const msgsComAutor = mensagensRes.data.map((m) => {
            let msgAnexos = formattedAnexos.filter((a) => a.mensagem_id === m.id);

            // Mensagem inicial de check-in herda anexos checkin órfãos
            if (
              m.mensagem.startsWith('Ticket criado com check-in completo') &&
              msgAnexos.length === 0
            ) {
              msgAnexos = formattedAnexos.filter(
                (a) => a.tipo_inspecao === 'checkin' && !a.mensagem_id
              );
            }

            // Mensagem de checkout herda anexos checkout órfãos
            if (m.mensagem.toLowerCase().startsWith('viatura reparada') && msgAnexos.length === 0) {
              msgAnexos = formattedAnexos.filter(
                (a) => a.tipo_inspecao === 'checkout' && !a.mensagem_id
              );
            }

            return {
              ...m,
              anexos: msgAnexos,
              autor: autores?.find((a) => a.id === m.autor_id) || null,
            };
          });

          setMensagens(msgsComAutor as any);
        }
      } catch (error) {
        console.error('Erro ao atualizar mensagens e anexos:', error);
      }
    },
    [ticketId]
  );

  // Fetch inicial + realtime
  useEffect(() => {
    if (!ticketId) return;
    fetchMensagensAndAnexos(ticketId);

    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assistencia_mensagens',
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => {
          fetchMensagensAndAnexos();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assistencia_anexos',
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => {
          fetchMensagensAndAnexos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, fetchMensagensAndAnexos]);

  const sendMessage = useCallback(
    async ({ text, files, ticket }: SendMessageInput): Promise<boolean> => {
      if (!text.trim() && files.length === 0) return false;
      if (!ticketId) return false;

      try {
        setSending(true);

        const textoMensagem = text.trim() || (files.length > 0 ? 'Enviou ficheiro(s)' : '');
        const tipoMensagem = text.trim() ? 'mensagem' : 'anexo';

        const { data: mensagemInserida, error: msgError } = await supabase
          .from('assistencia_mensagens')
          .insert({
            ticket_id: ticketId,
            autor_id: user?.id,
            mensagem: textoMensagem,
            tipo: tipoMensagem,
          })
          .select()
          .single();

        if (msgError) throw msgError;

        if (files.length > 0 && mensagemInserida) {
          for (const file of files) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${ticketId}/${Date.now()}-${Math.random()
              .toString(36)
              .substring(7)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
              .from('assistencia-anexos')
              .upload(fileName, file);

            if (uploadError) throw uploadError;

            await supabase.from('assistencia_anexos').insert({
              ticket_id: ticketId,
              mensagem_id: mensagemInserida.id,
              nome_ficheiro: file.name,
              ficheiro_url: fileName,
              tipo_ficheiro: file.type,
              tamanho: file.size,
              uploaded_by: user?.id,
            });
          }
        }

        // Webhook ticket_resposta (fire-and-forget)
        if (mensagemInserida && ticket) {
          const [{ data: ticketCompleto }, { data: autorProfile }, { data: criadorProfile }] =
            await Promise.all([
              supabase
                .from('assistencia_tickets')
                .select(
                  `
                *,
                viatura:viaturas(id, matricula, marca, modelo, cor, ano),
                motorista:motoristas_ativos(id, nome, email, telefone, codigo),
                categoria:assistencia_categorias(id, nome, cor)
              `
                )
                .eq('id', ticketId)
                .single(),
              supabase.from('profiles').select('nome, cargo').eq('id', user?.id).single(),
              supabase.from('profiles').select('nome, cargo').eq('id', ticket.criado_por).single(),
            ]);

          supabase.functions
            .invoke('send-webhook', {
              body: {
                evento: 'ticket_criado',
                dados: {
                  acao: 'resposta',
                  ticket: ticketCompleto,
                  mensagem: {
                    id: mensagemInserida.id,
                    texto: mensagemInserida.mensagem,
                    created_at: mensagemInserida.created_at,
                    tem_anexos: files.length > 0,
                  },
                  criado_por: {
                    id: ticket.criado_por,
                    nome: criadorProfile?.nome || null,
                    cargo: criadorProfile?.cargo || null,
                  },
                  respondido_por: {
                    id: user?.id,
                    email: user?.email,
                    nome: autorProfile?.nome || null,
                    cargo: autorProfile?.cargo || null,
                    tipo: ticket.criado_por === user?.id ? 'Gestor' : 'Assistência',
                  },
                },
              },
            })
            .catch((err) => console.error('Erro ao enviar webhook ticket_resposta:', err));
        }

        toast({ title: 'Sucesso', description: 'Mensagem enviada com sucesso.' });
        return true;
      } catch (error: unknown) {
        console.error('Erro ao enviar mensagem:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível enviar a mensagem.',
          variant: 'destructive',
        });
        return false;
      } finally {
        setSending(false);
      }
    },
    [ticketId, user, toast]
  );

  const updateLegenda = useCallback(
    async ({ id, legenda }: UpdateLegendaInput): Promise<boolean> => {
      setUpdatingLegenda(true);
      try {
        const { error } = await supabase
          .from('assistencia_anexos')
          .update({ legenda })
          .eq('id', id);

        if (error) throw error;

        toast({ title: 'Sucesso', description: 'Legenda atualizada.' });
        await fetchMensagensAndAnexos();
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro inesperado';
        toast({ title: 'Erro', description: message, variant: 'destructive' });
        return false;
      } finally {
        setUpdatingLegenda(false);
      }
    },
    [fetchMensagensAndAnexos, toast]
  );

  return {
    mensagens,
    anexos,
    refetch: fetchMensagensAndAnexos,
    sendMessage,
    updateLegenda,
    sending,
    updatingLegenda,
  };
}
