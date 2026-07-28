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
import { Plus, Receipt, Loader2, Trash2, Euro, Calendar, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

interface Multa {
  id: string;
  motorista_id: string | null;
  data_infracao: string;
  descricao: string | null;
  valor: number | null;
  estado: string;
  data_pagamento: string | null;
  observacoes: string | null;
  motorista?: {
    nome: string;
  };
}

interface Motorista {
  id: string;
  nome: string;
}

interface ViaturaTabMultasProps {
  viaturaId: string | undefined;
}

const ESTADOS = [
  {
    value: 'pendente',
    label: 'Pendente',
    color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  },
  { value: 'paga', label: 'Paga', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  {
    value: 'contestada',
    label: 'Contestada',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  },
  { value: 'anulada', label: 'Anulada', color: 'bg-muted text-muted-foreground border-border' },
];

export function ViaturaTabMultas({ viaturaId }: ViaturaTabMultasProps) {
  const { canEdit } = usePermissions();
  const podeEditar = canEdit(RECURSOS.VIATURAS_EDITAR);
  const [multas, setMultas] = useState<Multa[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [motoristaId, setMotoristaId] = useState('');
  const [dataInfracao, setDataInfracao] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [observacoes, setObservacoes] = useState('');

  useEffect(() => {
    if (viaturaId) {
      loadMultas();
      loadMotoristas();
    }
  }, [viaturaId]);

  const loadMultas = async () => {
    if (!viaturaId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('viatura_multas')
        .select(
          `
          *,
          motorista:motoristas_ativos(nome)
        `
        )
        .eq('viatura_id', viaturaId)
        .order('data_infracao', { ascending: false });

      if (error) throw error;
      setMultas(data || []);
    } catch (error) {
      console.error('Erro ao carregar multas:', error);
      toast.error('Erro ao carregar multas');
    } finally {
      setLoading(false);
    }
  };

  const loadMotoristas = async () => {
    try {
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select('id, nome')
        .order('nome');

      if (error) throw error;
      setMotoristas(data || []);
    } catch (error) {
      console.error('Erro ao carregar motoristas:', error);
    }
  };

  const handleSubmit = async () => {
    if (!viaturaId || !dataInfracao) {
      toast.error('Data da infração é obrigatória');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('viatura_multas').insert({
        viatura_id: viaturaId,
        motorista_id: motoristaId || null,
        data_infracao: dataInfracao,
        descricao: descricao.trim() || null,
        valor: valor ? parseFloat(valor) : null,
        observacoes: observacoes.trim() || null,
        estado: 'pendente',
      });

      if (error) throw error;

      toast.success('Multa registada com sucesso!');
      setDialogOpen(false);
      resetForm();
      loadMultas();
    } catch (error) {
      console.error('Erro ao registar multa:', error);
      toast.error('Erro ao registar multa');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEstado = async (multaId: string, novoEstado: string) => {
    try {
      const updates: any = {
        estado: novoEstado,
        updated_at: new Date().toISOString(),
      };

      if (novoEstado === 'paga') {
        updates.data_pagamento = new Date().toISOString().split('T')[0];
      }

      const { error } = await supabase.from('viatura_multas').update(updates).eq('id', multaId);

      if (error) throw error;
      toast.success('Estado atualizado!');
      loadMultas();
    } catch (error) {
      console.error('Erro ao atualizar estado:', error);
      toast.error('Erro ao atualizar estado');
    }
  };

  const handleDelete = async (multaId: string) => {
    if (!podeEditar) return;
    if (!confirm('Tem certeza que deseja eliminar esta multa?')) return;

    try {
      const { error } = await supabase.from('viatura_multas').delete().eq('id', multaId);

      if (error) throw error;
      toast.success('Multa eliminada!');
      loadMultas();
    } catch (error) {
      console.error('Erro ao eliminar multa:', error);
      toast.error('Erro ao eliminar multa');
    }
  };

  const resetForm = () => {
    setMotoristaId('');
    setDataInfracao('');
    setDescricao('');
    setValor('');
    setObservacoes('');
  };

  const getEstadoConfig = (estado: string) => {
    return ESTADOS.find((e) => e.value === estado) || ESTADOS[0];
  };

  const totalPendente = multas
    .filter((m) => m.estado === 'pendente')
    .reduce((acc, m) => acc + (m.valor || 0), 0);

  if (!viaturaId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Guarde a viatura primeiro para registar multas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {multas.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{multas.length}</div>
              <p className="text-sm text-muted-foreground">Total Multas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">
                {multas.filter((m) => m.estado === 'pendente').length}
              </div>
              <p className="text-sm text-muted-foreground">Pendentes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-destructive">
                {totalPendente.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}€
              </div>
              <p className="text-sm text-muted-foreground">Valor Pendente</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Registo de Multas
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nova Multa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registar Nova Multa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="data_infracao">
                      Data da Infração <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="data_infracao"
                      type="date"
                      value={dataInfracao}
                      onChange={(e) => setDataInfracao(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="valor">Valor (€)</Label>
                    <Input
                      id="valor"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label>Motorista Responsável</Label>
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
                <div>
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea
                    id="descricao"
                    placeholder="Tipo de infração..."
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    placeholder="Notas adicionais..."
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSubmit} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Registar
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
          ) : multas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma multa registada.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {multas.map((multa) => {
                const estadoConfig = getEstadoConfig(multa.estado);

                return (
                  <div key={multa.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {multa.data_infracao
                              ? format(new Date(multa.data_infracao), "d 'de' MMMM 'de' yyyy", {
                                  locale: pt,
                                })
                              : 'Data N/D'}
                          </span>
                        </div>
                        {multa.descricao && (
                          <p className="text-sm text-muted-foreground mt-1">{multa.descricao}</p>
                        )}
                        {multa.motorista && (
                          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span>{multa.motorista.nome}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {multa.valor !== null && (
                          <Badge variant="secondary" className="font-mono">
                            <Euro className="h-3 w-3 mr-1" />
                            {multa.valor.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                          </Badge>
                        )}
                        <Select
                          value={multa.estado}
                          onValueChange={(v) => handleUpdateEstado(multa.id, v)}
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
                            onClick={() => handleDelete(multa.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {multa.observacoes && (
                      <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                        {multa.observacoes}
                      </p>
                    )}
                    {multa.data_pagamento && (
                      <p className="text-xs text-green-600">
                        Paga em{' '}
                        {format(new Date(multa.data_pagamento), "d 'de' MMMM 'de' yyyy", {
                          locale: pt,
                        })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
