import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { TicketMediaLightbox } from '@/components/assistencia/TicketMediaLightbox';
import { TicketGalleryDialog } from '@/components/assistencia/TicketGalleryDialog';
import { TicketSidebar } from '@/components/assistencia/ticket/TicketSidebar';
import { TicketClosureDialog } from '@/components/assistencia/ticket/TicketClosureDialog';
import { TicketSubstitutaModal } from '@/components/assistencia/ticket/TicketSubstitutaModal';
import { TicketLegendaDialog } from '@/components/assistencia/ticket/TicketLegendaDialog';
import { TicketHeader } from '@/components/assistencia/ticket/TicketHeader';
import { TicketChat } from '@/components/assistencia/ticket/TicketChat';
import { useTicket } from '@/hooks/useTicket';
import { useTicketMessages } from '@/hooks/useTicketMessages';
import { useTicketClosure } from '@/hooks/useTicketClosure';
import {
  TicketAccessPanel,
  type TicketAccessPanelRef,
} from '@/components/assistencia/TicketAccessPanel';
import { Button } from '@/components/ui/button';
import { statusConfig } from '@/lib/ticketsConfig';

interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  km_atual?: number | null;
}

interface Motorista {
  id: string;
  nome: string;
  telefone: string | null;
}

const TicketDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isFromMeusTickets = location.pathname.startsWith('/meus-tickets');
  const { user } = useAuth();
  const { isAdmin, hasAccessToResource } = usePermissions();
  const { toast } = useToast();

  const { data: ticketData, isLoading: loading, refetch: refetchTicket } = useTicket(id);
  const ticket = ticketData?.ticket ?? null;
  const viatura = ticketData?.viatura ?? null;
  const motorista = ticketData?.motorista ?? null;
  const categoria = ticketData?.categoria ?? null;
  const criador = ticketData?.criador ?? null;

  const {
    mensagens,
    anexos,
    refetch: refetchMessages,
    sendMessage,
    updateLegenda,
    sending,
    updatingLegenda,
  } = useTicketMessages(id);

  const refreshAll = () => {
    refetchTicket();
    refetchMessages();
  };
  const [novaMensagem, setNovaMensagem] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [currentMediaList, setCurrentMediaList] = useState<any[]>([]);
  const [acessos, setAcessos] = useState<any[]>([]);
  const accessPanelRef = useRef<TicketAccessPanelRef>(null);
  const [showGalleryDialog, setShowGalleryDialog] = useState(false);
  const [editingLegenda, setEditingLegenda] = useState<{ id: string; legenda: string } | null>(
    null
  );
  const [isEditMode, setIsEditMode] = useState(false);

  const handleOpenEditMode = () => {
    if (!ticket) return;
    setClosureData({
      km_fim: ticket.km_fim?.toString() || '',
      combustivel_fim: ticket.combustivel_fim || 'meio',
      adblue_fim: 'Cheio',
      limpeza_fim: 'Limpa',
      valor_reparacao: ticket.valor_reparacao?.toString() || '',
      cobrar_motorista: ticket.cobrar_motorista,
      descricao_reparacao: ticket.descricao || '',
      numero_fatura: (ticket as any).numero_fatura || '',
    });
    setClosureDecisao(ticket.cobrar_motorista ? 'motorista' : 'empresa');
    setIsEditMode(true);
    setShowClosureForm(true);
  };

  const downloadMedia = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      window.open(url, '_blank');
    }
  };

  const openLightbox = (mediaList: any[], index: number) => {
    const list = mediaList.filter(
      (a) =>
        a.tipo_ficheiro === 'foto' ||
        a.tipo_ficheiro === 'video' ||
        a.ficheiro_url?.match(/\.(jpg|jpeg|png|webp|mp4|webm|mov|ogg)$/i)
    );
    const newIndex = list.findIndex((a) => a.id === mediaList[index].id);
    if (newIndex === -1) return;

    setCurrentMediaList(list);
    setCurrentMediaIndex(newIndex);
    setLightboxOpen(true);
  };

  const nextMedia = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentMediaIndex((prev) => (prev + 1) % currentMediaList.length);
  };

  const prevMedia = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentMediaIndex((prev) => (prev - 1 + currentMediaList.length) % currentMediaList.length);
  };

  // closure states
  const { closeTicket, isClosing: closureLoading } = useTicketClosure({
    ticket,
    viatura,
    motorista,
  });
  const [showClosureForm, setShowClosureForm] = useState(false);
  const [closureData, setClosureData] = useState({
    km_fim: '',
    combustivel_fim: 'meio',
    adblue_fim: 'Cheio',
    limpeza_fim: 'Limpa',
    valor_reparacao: '',
    cobrar_motorista: true,
    descricao_reparacao: '',
    numero_fatura: '',
  });
  const [faturaFile, setFaturaFile] = useState<File | null>(null);
  const [exitMediaFiles, setExitMediaFiles] = useState<
    { url: string; path: string; type: 'image' | 'video' }[]
  >([]);
  const faturaInputRef = useRef<HTMLInputElement>(null);

  // Substituta
  const [viaturaSubstituta, setViaturaSubstituta] = useState<Viatura | null>(null);
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
  const [viaturasDisponiveis, setViaturasDisponiveis] = useState<Viatura[]>([]);
  const [substituteSearch, setSubstituteSearch] = useState('');
  const [assigningSubstitute, setAssigningSubstitute] = useState(false);

  // Decisões de fecho
  const [closureDecisao, setClosureDecisao] = useState<'motorista' | 'empresa' | 'aberto' | null>(
    'empresa'
  );
  const [closureSubstDecisao, setClosureSubstDecisao] = useState<'devolver' | 'definitivo' | null>(
    null
  );

  // Permission logic is calculated after ticket loads in the return section

  useEffect(() => {
    if (id) accessPanelRef.current?.fetchAcessos(id);
  }, [id]);

  const handleSendMessage = async () => {
    const ok = await sendMessage({ text: novaMensagem, files: selectedFiles, ticket });
    if (ok) {
      setNovaMensagem('');
      setSelectedFiles([]);
      refreshAll();
    }
  };

  const handleUpdateLegenda = async () => {
    if (!editingLegenda) return;
    const ok = await updateLegenda({ id: editingLegenda.id, legenda: editingLegenda.legenda });
    if (ok) setEditingLegenda(null);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id || !ticket) return;

    // Se o novo status for 'resolvido', abrir o formulário de conclusão em vez de atualizar direto
    if (newStatus === 'resolvido') {
      setIsEditMode(false);
      setClosureData((prev) => ({
        ...prev,
        km_fim: viatura?.km_atual?.toString() || '',
        cobrar_motorista: !!motorista,
      }));
      setShowClosureForm(true);
      return;
    }

    try {
      const updates: any = { status: newStatus };

      const { error } = await supabase.from('assistencia_tickets').update(updates).eq('id', id);

      if (error) throw error;

      // Log status change
      await supabase.from('assistencia_mensagens').insert({
        ticket_id: id,
        autor_id: user?.id,
        mensagem: `Estado alterado para: ${statusConfig[newStatus]?.label || newStatus}`,
        tipo: 'status_change',
      });

      toast({
        title: 'Sucesso',
        description: 'Estado do ticket atualizado.',
      });

      refreshAll();
    } catch (error: any) {
      console.error('Erro ao atualizar estado:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o estado.',
        variant: 'destructive',
      });
    }
  };

  const handleAceitarTicket = async () => {
    if (!ticket || !viatura) return;
    try {
      await supabase
        .from('assistencia_tickets')
        .update({ status: 'em_andamento' })
        .eq('id', ticket.id);

      await supabase.from('viaturas').update({ status: 'manutencao' }).eq('id', viatura.id);

      await supabase.from('assistencia_mensagens').insert({
        ticket_id: ticket.id,
        autor_id: user?.id,
        mensagem: 'Ticket aceite. Viatura colocada em manutenção.',
        tipo: 'status_change',
      });
      toast({ title: 'Ticket aceite', description: 'Viatura colocada em manutenção.' });
      refreshAll();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const fetchViaturasDisponiveis = async () => {
    const { data } = await supabase
      .from('viaturas')
      .select('id, matricula, marca, modelo, km_atual')
      .eq('status', 'disponivel')
      .order('matricula');
    setViaturasDisponiveis(data || []);
  };

  const handleAtribuirSubstituta = async (viaturaId: string) => {
    if (!ticket || !motorista) return;
    try {
      setAssigningSubstitute(true);
      await supabase.from('motorista_viaturas').insert({
        motorista_id: motorista.id,
        viatura_id: viaturaId,
        data_inicio: new Date().toISOString().split('T')[0],
        status: 'ativo',
        tipo: 'substituta',
      });
      await supabase.from('viaturas').update({ status: 'em_uso' }).eq('id', viaturaId);
      await supabase
        .from('assistencia_tickets')
        .update({ viatura_substituta_id: viaturaId })
        .eq('id', ticket.id);
      await supabase.from('assistencia_mensagens').insert({
        ticket_id: ticket.id,
        autor_id: user?.id,
        mensagem: `Viatura substituta atribuída ao motorista durante a reparação.`,
        tipo: 'status_change',
      });
      setShowSubstituteModal(false);
      toast({ title: 'Viatura substituta atribuída.' });
      refreshAll();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setAssigningSubstitute(false);
    }
  };

  const handleViaturaReparada = async () => {
    const ok = await closeTicket({
      closureData,
      decisao: closureDecisao,
      substDecisao: closureSubstDecisao,
      isEditMode,
      faturaFile,
      exitMediaFiles,
    });
    if (ok) {
      setShowClosureForm(false);
      setFaturaFile(null);
      setClosureDecisao('empresa');
      setClosureSubstDecisao(null);
      refreshAll();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Ticket não encontrado</h2>
        <Button variant="outline" onClick={() => navigate('/assistencia')}>
          Voltar
        </Button>
      </div>
    );
  }

  const isTicketOwner = ticket.criado_por === user?.id;
  const isAssistanceManager = hasAccessToResource('assistencia_tickets');
  const hasExplicitAccess = acessos.some((a) => a.id === user?.id);

  // Qualquer pessoa com acesso (Dono, Manager, Admin ou Acesso Explícito)
  const hasAccess = isTicketOwner || isAssistanceManager || isAdmin || hasExplicitAccess;

  const canReply = hasAccess;
  const canManageAccess = hasAccess; // Agora qualquer pessoa com acesso pode convidar outros
  const canChangeStatus = isAssistanceManager || isAdmin; // Manter a alteração de estado para gestores/admin

  return (
    <div className="flex flex-col p-4 md:p-6 gap-6 bg-background lg:h-[calc(100vh-64px)] lg:overflow-hidden">
      <TicketHeader
        ticket={ticket}
        categoria={categoria}
        acessos={acessos}
        canChangeStatus={canChangeStatus}
        canManageAccess={canManageAccess}
        onBack={() => navigate(isFromMeusTickets ? '/meus-tickets' : '/assistencia')}
        onOpenAccesses={() => accessPanelRef.current?.openAllDialog()}
        onAddAccess={() => accessPanelRef.current?.openAddDialog()}
        onOpenEditMode={handleOpenEditMode}
        onStatusChange={handleStatusChange}
      />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:flex-1 lg:min-h-0">
        <div className="lg:col-span-3 flex flex-col lg:min-h-0">
          <TicketChat
            ticket={ticket}
            mensagens={mensagens}
            userId={user?.id}
            canReply={canReply}
            canEditLegenda={isAdmin || isAssistanceManager}
            novaMensagem={novaMensagem}
            onNovaMensagemChange={setNovaMensagem}
            selectedFiles={selectedFiles}
            onFilesSelect={(files) => setSelectedFiles((prev) => [...prev, ...files])}
            onRemoveFile={(index) => setSelectedFiles((prev) => prev.filter((_, i) => i !== index))}
            sending={sending}
            onSend={handleSendMessage}
            onOpenLightbox={openLightbox}
            onEditLegenda={(id, legenda) => setEditingLegenda({ id, legenda })}
          />
        </div>

        <TicketSidebar
          ticket={ticket}
          anexos={anexos}
          viatura={viatura}
          motorista={motorista}
          criador={criador}
          onOpenGallery={() => setShowGalleryDialog(true)}
        />
      </div>

      <TicketAccessPanel
        ref={accessPanelRef}
        ticketId={id!}
        criadoPor={ticket.criado_por}
        canManageAccess={canManageAccess}
        onAcessosChange={setAcessos}
      />

      {/* Modal de seleção de viatura substituta */}
      <TicketSubstitutaModal
        open={showSubstituteModal}
        onOpenChange={setShowSubstituteModal}
        viaturasDisponiveis={viaturasDisponiveis}
        search={substituteSearch}
        onSearchChange={setSubstituteSearch}
        assigning={assigningSubstitute}
        onSelect={handleAtribuirSubstituta}
      />
      <TicketMediaLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        mediaList={currentMediaList}
        currentIndex={currentMediaIndex}
        onNext={nextMedia}
        onPrev={prevMedia}
        onDownload={downloadMedia}
      />

      {/* Modal Editar Legenda */}
      <TicketLegendaDialog
        open={!!editingLegenda}
        legenda={editingLegenda?.legenda || ''}
        saving={updatingLegenda}
        onLegendaChange={(legenda) =>
          setEditingLegenda((prev) => (prev ? { ...prev, legenda } : null))
        }
        onSave={handleUpdateLegenda}
        onClose={() => setEditingLegenda(null)}
      />

      {/* Modal Concluir / Editar Reparação */}
      <TicketClosureDialog
        open={showClosureForm}
        isEditMode={isEditMode}
        closureLoading={closureLoading}
        closureData={closureData}
        closureDecisao={closureDecisao}
        closureSubstDecisao={closureSubstDecisao}
        ticket={ticket}
        viatura={viatura}
        viaturaSubstituta={viaturaSubstituta}
        faturaFile={faturaFile}
        onClosureDataChange={(data) => setClosureData((prev) => ({ ...prev, ...data }))}
        onDecisaoChange={setClosureDecisao}
        onSubstDecisaoChange={setClosureSubstDecisao}
        onFaturaChange={setFaturaFile}
        onExitMediaChange={setExitMediaFiles}
        onSubmit={handleViaturaReparada}
        onClose={() => {
          setShowClosureForm(false);
          setIsEditMode(false);
          setClosureDecisao('empresa');
          setClosureSubstDecisao(null);
        }}
      />

      <TicketGalleryDialog
        open={showGalleryDialog}
        onOpenChange={setShowGalleryDialog}
        anexos={anexos}
        ticketNumero={ticket.numero}
        onOpenLightbox={openLightbox}
      />
    </div>
  );
};

export default TicketDetails;
