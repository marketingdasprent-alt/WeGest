import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Calendar, Loader2, Trash2, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isFuture, isPast } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { pt } from 'date-fns/locale';

interface Reserva {
  id: string;
  motorista_id: string | null;
  data_inicio: string;
  data_fim: string | null;
  motivo: string | null;
  estado: string;
  motorista?: {
    nome: string;
  };
}

interface Motorista {
  id: string;
  nome: string;
}

interface ViaturaTabReservasProps {
  viaturaId: string | undefined;
}

const ESTADOS = [
  { value: 'ativa', label: 'Ativa', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  { value: 'concluida', label: 'Concluída', color: 'bg-muted text-muted-foreground border-border' },
  {
    value: 'cancelada',
    label: 'Cancelada',
    color: 'bg-destructive/10 text-destructive border-destructive/20',
  },
];

export function ViaturaTabReservas({ viaturaId }: ViaturaTabReservasProps) {
  const { canEdit } = usePermissions();
  const podeEditar = canEdit(RECURSOS.VIATURAS_EDITAR);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [motoristaId, setMotoristaId] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (viaturaId) {
      loadReservas();
      loadMotoristas();
    }
  }, [viaturaId]);

  const loadReservas = async () => {
    if (!viaturaId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('viatura_reservas')
        .select(
          `
          *,
          motorista:motoristas_ativos(nome)
        `
        )
        .eq('viatura_id', viaturaId)
        .order('data_inicio', { ascending: false });

      if (error) throw error;
      setReservas(data || []);
    } catch (error) {
      console.error('Erro ao carregar reservas:', error);
      toast.error('Erro ao carregar reservas');
    } finally {
      setLoading(false);
    }
  };

  const loadMotoristas = async () => {
    try {
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select('id, nome')
        .eq('status_ativo', true)
        .order('nome');

      if (error) throw error;
      setMotoristas(data || []);
    } catch (error) {
      console.error('Erro ao carregar motoristas:', error);
    }
  };

  const handleSubmit = async () => {
    if (!viaturaId || !dataInicio) {
      toast.error('Data de início é obrigatória');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('viatura_reservas').insert({
        viatura_id: viaturaId,
        motorista_id: motoristaId || null,
        data_inicio: dataInicio,
        data_fim: dataFim || null,
        motivo: motivo.trim() || null,
        estado: 'ativa',
      });

      if (error) throw error;

      toast.success('Reserva criada com sucesso!');
      setDialogOpen(false);
      resetForm();
      loadReservas();
    } catch (error) {
      console.error('Erro ao criar reserva:', error);
      toast.error('Erro ao criar reserva');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEstado = async (reservaId: string, novoEstado: string) => {
    try {
      const { error } = await supabase
        .from('viatura_reservas')
        .update({ estado: novoEstado, updated_at: new Date().toISOString() })
        .eq('id', reservaId);

      if (error) throw error;
      toast.success('Estado atualizado!');
      loadReservas();
    } catch (error) {
      console.error('Erro ao atualizar estado:', error);
      toast.error('Erro ao atualizar estado');
    }
  };

  const handleDelete = async (reservaId: string) => {
    if (!podeEditar) return;
    if (!confirm('Tem certeza que deseja eliminar esta reserva?')) return;

    try {
      const { error } = await supabase.from('viatura_reservas').delete().eq('id', reservaId);

      if (error) throw error;
      toast.success('Reserva eliminada!');
      loadReservas();
    } catch (error) {
      console.error('Erro ao eliminar reserva:', error);
      toast.error('Erro ao eliminar reserva');
    }
  };

  const resetForm = () => {
    setMotoristaId('');
    setDataInicio('');
    setDataFim('');
    setMotivo('');
  };

  const getEstadoConfig = (estado: string) => {
    return ESTADOS.find((e) => e.value === estado) || ESTADOS[0];
  };

  if (!viaturaId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Guarde a viatura primeiro para criar reservas.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Reservas
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nova Reserva
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Reserva</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Motorista</Label>
                <Select value={motoristaId} onValueChange={setMotoristaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar motorista (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {motoristas.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="data_inicio">
                    Data Início <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="data_inicio"
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="data_fim">Data Fim</Label>
                  <Input
                    id="data_fim"
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="motivo">Motivo</Label>
                <Textarea
                  id="motivo"
                  placeholder="Motivo da reserva..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar Reserva
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : reservas.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma reserva registada.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reservas.map((reserva) => {
              const estadoConfig = getEstadoConfig(reserva.estado);
              const isUpcoming = isFuture(new Date(reserva.data_inicio));

              return (
                <div
                  key={reserva.id}
                  className={`border rounded-lg p-4 space-y-3 ${isUpcoming ? 'border-primary/30 bg-primary/5' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {reserva.data_inicio
                            ? format(new Date(reserva.data_inicio), "d 'de' MMMM", { locale: pt })
                            : 'Data N/D'}
                          {reserva.data_fim &&
                            ` — ${format(new Date(reserva.data_fim), "d 'de' MMMM", { locale: pt })}`}
                        </span>
                        {isUpcoming && (
                          <Badge variant="secondary" className="text-xs">
                            Futura
                          </Badge>
                        )}
                      </div>
                      {reserva.motorista && (
                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>{reserva.motorista.nome}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={reserva.estado}
                        onValueChange={(v) => handleUpdateEstado(reserva.id, v)}
                      >
                        <SelectTrigger className="w-[130px]">
                          <Badge variant="outline" className={estadoConfig.color}>
                            {estadoConfig.label}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {ESTADOS.map((est) => (
                            <SelectItem key={est.value} value={est.value}>
                              {est.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {podeEditar && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleDelete(reserva.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {reserva.motivo && (
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                      {reserva.motivo}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
