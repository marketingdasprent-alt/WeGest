import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgId } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Car, Wrench } from 'lucide-react';

interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
}

interface Categoria {
  id: string;
  nome: string;
  cor: string;
  icone: string;
}

interface MotoristaDaViatura {
  motorista_id: string;
  motorista: {
    id: string;
    nome: string;
  };
}

interface NovoTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  viaturaId?: string; // Para pré-selecionar viatura
}

export const NovoTicketDialog: React.FC<NovoTicketDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
  viaturaId,
}) => {
  const { user } = useAuth();
  const orgId = useOrgId();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viaturas, setViaturas] = useState<Viatura[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [formData, setFormData] = useState({
    viatura_id: viaturaId || '',
    categoria_id: '',
    titulo: '',
    descricao: '',
    prioridade: 'media',
  });

  const [motoristaId, setMotoristaId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchData();
      if (viaturaId) {
        setFormData((prev) => ({ ...prev, viatura_id: viaturaId }));
        fetchMotoristaFromViatura(viaturaId);
      }
    }
  }, [open, viaturaId]);

  useEffect(() => {
    if (formData.viatura_id && formData.viatura_id !== viaturaId) {
      fetchMotoristaFromViatura(formData.viatura_id);
    }
  }, [formData.viatura_id]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [viaturasRes, categoriasRes] = await Promise.all([
        supabase.from('viaturas').select('id, matricula, marca, modelo').order('matricula'),
        supabase
          .from('assistencia_categorias')
          .select('id, nome, cor, icone')
          .eq('ativo', true)
          .order('ordem'),
      ]);

      if (viaturasRes.error) throw viaturasRes.error;
      if (categoriasRes.error) throw categoriasRes.error;

      setViaturas(viaturasRes.data || []);
      setCategorias(categoriasRes.data || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMotoristaFromViatura = async (viaturaId: string) => {
    try {
      const { data, error } = await supabase
        .from('motorista_viaturas')
        .select('motorista_id, motorista:motoristas_ativos(id, nome)')
        .eq('viatura_id', viaturaId)
        .eq('status', 'ativo')
        .single();

      if (!error && data?.motorista_id) {
        setMotoristaId(data.motorista_id);
      } else {
        setMotoristaId(null);
      }
    } catch (error) {
      setMotoristaId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.viatura_id) {
      toast({
        title: 'Erro',
        description: 'Selecione uma viatura.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.titulo.trim()) {
      toast({
        title: 'Erro',
        description: 'Preencha o título do ticket.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);

      const { data: insertedTicket, error } = await supabase
        .from('assistencia_tickets')
        .insert({
          viatura_id: formData.viatura_id,
          motorista_id: motoristaId,
          categoria_id: formData.categoria_id || null,
          titulo: formData.titulo.trim(),
          descricao: formData.descricao.trim() || null,
          prioridade: formData.prioridade,
          criado_por: user?.id,
          status: 'pendente',
        })
        .select('id')
        .single();

      if (error) throw error;

      const ticketId = insertedTicket?.id;

      // --- ACESSO AUTOMÁTICO ---
      try {
        const userIdsSet = new Set<string>();
        if (user?.id) userIdsSet.add(user.id);

        const GESTOR_ASSISTENCIA_CARGO_IDS = ['d8680e20-5025-47c1-bcc0-ae432f8afb96'];

        // Admins/gestores da ORG ATIVA (papel per-org em user_organizacoes).
        const { data: orgStaff } = await supabase
          .from('user_organizacoes')
          .select('user_id, is_admin, cargo_id, cargos(nome)')
          .eq('org_id', orgId);

        (orgStaff || []).forEach((m: any) => {
          const cargoNome = (m.cargos?.nome || '').toLowerCase();
          if (
            m.is_admin ||
            GESTOR_ASSISTENCIA_CARGO_IDS.includes(m.cargo_id) ||
            (cargoNome.includes('gestor') && cargoNome.includes('assist'))
          ) {
            userIdsSet.add(m.user_id);
          }
        });

        if (motoristaId) {
          const { data: motorista } = await supabase
            .from('motoristas_ativos')
            .select('gestor_responsavel')
            .eq('id', motoristaId)
            .maybeSingle();

          if (motorista?.gestor_responsavel) {
            const { data: gestorProfile } = await supabase
              .from('profiles')
              .select('id')
              .eq('nome', motorista.gestor_responsavel)
              .maybeSingle();
            if (gestorProfile) userIdsSet.add(gestorProfile.id);
          }
        }

        const accessEntries = Array.from(userIdsSet).map((uid) => ({
          ticket_id: ticketId,
          profile_id: uid,
        }));

        if (accessEntries.length > 0) {
          const { error: accessError } = await supabase
            .from('assistencia_ticket_acessos')
            .insert(accessEntries);
          if (accessError) console.error('Erro ao configurar acessos automáticos:', accessError);
        }
      } catch (accessErr) {
        console.error('Erro silencioso na configuração de acessos:', accessErr);
      }
      // --- FIM ACESSO AUTOMÁTICO ---

      // Buscar dados completos do ticket para enviar ao webhook
      if (insertedTicket?.id) {
        const [{ data: ticketCompleto }, { data: gestorProfile }] = await Promise.all([
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
            .eq('id', insertedTicket.id)
            .single(),
          supabase.from('profiles').select('nome, cargo').eq('id', user?.id).single(),
        ]);

        // Enviar para webhooks configurados (fire and forget)
        supabase.functions
          .invoke('send-webhook', {
            body: {
              evento: 'ticket_criado',
              dados: {
                acao: 'criacao',
                ticket: ticketCompleto,
                criado_por: {
                  id: user?.id,
                  email: user?.email,
                  nome: gestorProfile?.nome || null,
                  cargo: gestorProfile?.cargo || null,
                },
              },
            },
          })
          .catch((err) => console.error('Erro ao enviar webhook:', err));
      }

      toast({
        title: 'Sucesso',
        description: 'Ticket de assistência criado com sucesso.',
      });

      // Reset form
      setFormData({
        viatura_id: '',
        categoria_id: '',
        titulo: '',
        descricao: '',
        prioridade: 'media',
      });
      setMotoristaId(null);

      onSuccess();
    } catch (error: any) {
      console.error('Erro ao criar ticket:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível criar o ticket.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedViatura = viaturas.find((v) => v.id === formData.viatura_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Novo Ticket de Assistência
          </DialogTitle>
          <DialogDescription>
            Abra um ticket para solicitar reparação ou assistência para uma viatura.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Viatura */}
            <div className="space-y-2">
              <Label htmlFor="viatura">
                Viatura <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.viatura_id}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, viatura_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a viatura" />
                </SelectTrigger>
                <SelectContent>
                  {viaturas.map((viatura) => (
                    <SelectItem key={viatura.id} value={viatura.id}>
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4" />
                        {viatura.matricula} - {viatura.marca} {viatura.modelo}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Categoria */}
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria</Label>
              <Select
                value={formData.categoria_id}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, categoria_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: cat.cor }}
                        />
                        {cat.nome}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Prioridade */}
            <div className="space-y-2">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select
                value={formData.prioridade}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, prioridade: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Título */}
            <div className="space-y-2">
              <Label htmlFor="titulo">
                Título <span className="text-destructive">*</span>
              </Label>
              <Input
                id="titulo"
                placeholder="Descreva brevemente o problema..."
                value={formData.titulo}
                onChange={(e) => setFormData((prev) => ({ ...prev, titulo: e.target.value }))}
              />
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                placeholder="Detalhe o problema, sintomas, quando começou..."
                value={formData.descricao}
                onChange={(e) => setFormData((prev) => ({ ...prev, descricao: e.target.value }))}
                rows={4}
              />
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Ticket
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
