import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { X, Search, UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface TicketAccessPanelProps {
  ticketId: string;
  criadoPor: string | undefined;
  canManageAccess: boolean;
  onAcessosChange: (acessos: any[]) => void;
}

export interface TicketAccessPanelRef {
  fetchAcessos: (ticketIdOverride?: string) => Promise<void>;
  openAddDialog: () => void;
  openAllDialog: () => void;
}

const GESTOR_CARGO_IDS = ['d8680e20-5025-47c1-bcc0-ae432f8afb96'];

export const TicketAccessPanel = forwardRef<TicketAccessPanelRef, TicketAccessPanelProps>(
  ({ ticketId, criadoPor, canManageAccess, onAcessosChange }, ref) => {
    const { toast } = useToast();
    const [acessos, setAcessos] = useState<any[]>([]);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [showAllDialog, setShowAllDialog] = useState(false);
    const [searchUser, setSearchUser] = useState('');
    const [allProfiles, setAllProfiles] = useState<any[]>([]);
    const [addingUser, setAddingUser] = useState(false);

    const updateAcessos = (list: any[]) => {
      setAcessos(list);
      onAcessosChange(list);
    };

    const fetchAcessos = async (ticketIdOverride?: string) => {
      const targetId = ticketIdOverride || ticketId;
      if (!targetId) return;
      try {
        const [accessRes, ticketRes, adminsRes, gestoresByIdRes, gestoresByNomeRes] =
          await Promise.all([
            supabase
              .from('assistencia_ticket_acessos')
              .select(`profile_id, profiles!profile_id (id, nome, cargo, is_admin, cargo_id)`)
              .eq('ticket_id', targetId),
            supabase.from('assistencia_tickets').select('criado_por').eq('id', targetId).single(),
            supabase
              .from('profiles')
              .select('id, nome, cargo, is_admin, cargo_id')
              .eq('is_admin', true),
            supabase
              .from('profiles')
              .select('id, nome, cargo, is_admin, cargo_id')
              .in('cargo_id', GESTOR_CARGO_IDS),
            supabase
              .from('profiles')
              .select('id, nome, cargo, is_admin, cargo_id')
              .ilike('cargo', '%Gestor%Assist%'),
          ]);

        const peopleMap = new Map<string, any>();
        adminsRes.data?.forEach((p) => peopleMap.set(p.id, p));
        gestoresByIdRes.data?.forEach((p) => peopleMap.set(p.id, p));
        gestoresByNomeRes.data?.forEach((p) => peopleMap.set(p.id, p));

        if (ticketRes.data?.criado_por) {
          const { data: creator } = await supabase
            .from('profiles')
            .select('id, nome, cargo, is_admin, grupo:cargo_id(nome)')
            .eq('id', ticketRes.data.criado_por)
            .single();
          if (creator) peopleMap.set(creator.id, creator);
        }

        accessRes.data?.forEach((acc: any) => {
          if (acc.profiles) peopleMap.set(acc.profiles.id, acc.profiles);
        });

        updateAcessos(Array.from(peopleMap.values()));
      } catch (error) {
        console.error('Erro ao buscar acessos:', error);
      }
    };

    const fetchAllProfiles = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, nome, is_admin, cargo, created_at')
          .or('is_admin.eq.true,cargo.neq.null')
          .not('cargo', 'ilike', '%motorista%')
          .not('cargo', 'ilike', '%condutor%')
          .order('nome')
          .limit(100);

        const seenNames = new Set<string>();
        const filtered = (data || []).filter((p) => {
          if (!p.nome) return false;
          const isStaff = p.is_admin || (p.cargo && p.cargo.length > 2);
          if (!isStaff) return false;
          if (seenNames.has(p.nome)) return false;
          seenNames.add(p.nome);
          return true;
        });
        setAllProfiles(filtered);
      } catch (error) {
        console.error('Erro ao buscar perfis:', error);
      }
    };

    const handleAddAccess = async (profileId: string) => {
      try {
        setAddingUser(true);
        const { error } = await supabase
          .from('assistencia_ticket_acessos')
          .insert({ ticket_id: ticketId, profile_id: profileId });

        if (error) {
          if (error.code === '42P01') {
            const { error: fallbackError } = await supabase
              .from('assistencia_tickets')
              .update({ atribuido_a: profileId })
              .eq('id', ticketId);
            if (fallbackError) throw fallbackError;
          } else {
            throw error;
          }
        }

        toast({ title: 'Acesso concedido', description: 'O utilizador foi adicionado ao ticket.' });
        setShowAddDialog(false);
        fetchAcessos();
      } catch (error: any) {
        if (error.code === '23505') {
          toast({ title: 'Aviso', description: 'Este utilizador já tem acesso ao ticket.' });
        } else {
          toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        }
      } finally {
        setAddingUser(false);
      }
    };

    const handleRemoveAccess = async (profileId: string) => {
      if (
        !window.confirm('Tem a certeza que quer remover o acesso deste utilizador a este ticket?')
      )
        return;

      try {
        const { error } = await supabase
          .from('assistencia_ticket_acessos')
          .delete()
          .eq('ticket_id', ticketId)
          .eq('profile_id', profileId);
        if (error) throw error;
        toast({ title: 'Acesso removido' });
        fetchAcessos();
      } catch (error: any) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      }
    };

    useImperativeHandle(ref, () => ({
      fetchAcessos,
      openAddDialog: () => {
        fetchAllProfiles();
        setShowAddDialog(true);
      },
      openAllDialog: () => setShowAllDialog(true),
    }));

    return (
      <>
        {/* Modal Adicionar Acesso */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Conceder Acesso ao Ticket</DialogTitle>
              <DialogDescription className="sr-only">
                Pesquise e selecione utilizadores para dar acesso a este ticket.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar utilizador..."
                  className="pl-9"
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                />
              </div>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {allProfiles
                    .filter((p) => p.nome?.toLowerCase().includes(searchUser.toLowerCase()))
                    .map((profile) => (
                      <button
                        key={profile.id}
                        onClick={() => handleAddAccess(profile.id)}
                        disabled={addingUser}
                        className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs">
                            {profile.nome?.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{profile.nome}</p>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-2">
                              <span>
                                {profile.is_admin ? 'Administrador' : profile.cargo || 'Sem Cargo'}
                              </span>
                              {profile.created_at && (
                                <span className="opacity-50 font-normal">
                                  Criado em: {new Date(profile.created_at).toLocaleDateString()}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        {addingUser ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserPlus className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    ))}
                </div>
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Ver Todos os Acessos */}
        <Dialog open={showAllDialog} onOpenChange={setShowAllDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Pessoas com Acesso</DialogTitle>
              <DialogDescription className="sr-only">
                Lista de todos os utilizadores que têm acesso a este ticket.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {acessos.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30"
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center font-bold">
                      {user.nome?.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{user.nome}</p>
                      <p className="text-xs text-muted-foreground uppercase">
                        {user.cargo || 'Colaborador'}
                      </p>
                    </div>
                    {canManageAccess && user.id !== criadoPor && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleRemoveAccess(user.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

TicketAccessPanel.displayName = 'TicketAccessPanel';
