import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Plus,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Trash2,
  ImagePlus,
  X,
  Camera,
  User,
  FileText,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { DanoFotosGallery } from '../DanoFotosGallery';
import { GenerateDocumentsDialog } from '@/components/motoristas/GenerateDocumentsDialog';

interface Dano {
  id: string;
  descricao: string;
  localizacao: string | null;
  created_at: string;
  data_ocorrencia: string | null;
  estado: string;
  observacoes: string | null;
  valor: number;
  motorista_id: string | null;
  contrato_id: string | null;
  motorista?: {
    id: string;
    nome: string;
    codigo: number;
  } | null;
  fotos: Array<{
    id: string;
    ficheiro_url: string;
    nome_ficheiro: string | null;
    descricao: string | null;
  }>;
}

interface MotoristaOption {
  id: string;
  nome: string;
  codigo: number;
  contrato_id: string | null;
}

interface ViaturaTabDanosProps {
  viaturaId: string | undefined;
  matricula?: string;
}

const LOCALIZACOES = [
  { value: 'frente', label: 'Frente' },
  { value: 'traseira', label: 'Traseira' },
  { value: 'lateral_esq', label: 'Lateral Esquerda' },
  { value: 'lateral_dir', label: 'Lateral Direita' },
  { value: 'teto', label: 'Teto' },
  { value: 'interior', label: 'Interior' },
  { value: 'motor', label: 'Motor' },
  { value: 'outro', label: 'Outro' },
];

const ESTADOS = [
  {
    value: 'existente',
    label: 'Existente',
    color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  },
  {
    value: 'em_reparacao',
    label: 'Em Reparação',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  },
  {
    value: 'reparado',
    label: 'Reparado',
    color: 'bg-green-500/10 text-green-500 border-green-500/20',
  },
  {
    value: 'irreparavel',
    label: 'Irreparável',
    color: 'bg-destructive/10 text-destructive border-destructive/20',
  },
];

export function ViaturaTabDanos({ viaturaId, matricula }: ViaturaTabDanosProps) {
  const [danos, setDanos] = useState<Dano[]>([]);
  const [motoristas, setMotoristas] = useState<MotoristaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [folhaDanosOpen, setFolhaDanosOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [descricao, setDescricao] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [estado, setEstado] = useState('existente');
  const [observacoes, setObservacoes] = useState('');
  const [valor, setValor] = useState('');
  const [dataOcorrencia, setDataOcorrencia] = useState('');
  const [motoristaId, setMotoristaId] = useState('');
  const [contratoId, setContratoId] = useState<string | null>(null);

  // Fotos temporárias (antes de guardar)
  const [fotosTemp, setFotosTemp] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    if (viaturaId) {
      loadDanos();
      loadMotoristasDisponiveis();
    }
  }, [viaturaId]);

  // Auto-preencher contrato quando motorista é selecionado
  useEffect(() => {
    if (motoristaId) {
      const motorista = motoristas.find((m) => m.id === motoristaId);
      setContratoId(motorista?.contrato_id || null);
    } else {
      setContratoId(null);
    }
  }, [motoristaId, motoristas]);

  const loadMotoristasDisponiveis = async () => {
    if (!viaturaId) return;

    try {
      // Buscar motoristas que têm/tiveram esta viatura atribuída
      const { data: atribuicoes, error: atribError } = await supabase
        .from('motorista_viaturas')
        .select(
          `
          motorista_id,
          motoristas_ativos (
            id,
            nome,
            codigo
          )
        `
        )
        .eq('viatura_id', viaturaId);

      if (atribError) throw atribError;

      const motoristaIds = [...new Set(atribuicoes?.map((a) => a.motorista_id) || [])];

      // Buscar contratos ativos para cada motorista
      const motoristasComContrato: MotoristaOption[] = [];

      for (const atrib of atribuicoes || []) {
        if (!atrib.motoristas_ativos) continue;

        const motorista = atrib.motoristas_ativos as any;

        // Verificar se já adicionamos este motorista
        if (motoristasComContrato.some((m) => m.id === motorista.id)) continue;

        // Buscar contrato ativo
        const { data: contrato } = await supabase
          .from('contratos')
          .select('id')
          .eq('motorista_id', motorista.id)
          .eq('status', 'ativo')
          .maybeSingle();

        motoristasComContrato.push({
          id: motorista.id,
          nome: motorista.nome,
          codigo: motorista.codigo,
          contrato_id: contrato?.id || null,
        });
      }

      setMotoristas(motoristasComContrato);
    } catch (error) {
      console.error('Erro ao carregar motoristas:', error);
    }
  };

  const loadDanos = async () => {
    if (!viaturaId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('viatura_danos')
        .select(
          `
          *,
          motoristas_ativos (
            id,
            nome,
            codigo
          )
        `
        )
        .eq('viatura_id', viaturaId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Buscar fotos para cada dano
      const danosComFotos: Dano[] = [];
      for (const dano of data || []) {
        const { data: fotos } = await supabase
          .from('viatura_dano_fotos')
          .select('id, ficheiro_url, nome_ficheiro, descricao')
          .eq('dano_id', dano.id);

        danosComFotos.push({
          ...dano,
          motorista: dano.motoristas_ativos as Dano['motorista'],
          fotos: fotos || [],
        });
      }

      setDanos(danosComFotos);
    } catch (error) {
      console.error('Erro ao carregar danos:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handlers para fotos temporárias
  const handleFotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);
    setFotosTemp((prev) => [...prev, ...newFiles]);

    // Criar previews
    newFiles.forEach((file) => {
      const url = URL.createObjectURL(file);
      setPreviewUrls((prev) => [...prev, url]);
    });

    // Limpar input para permitir selecionar mesma foto novamente
    e.target.value = '';
  };

  const removeFotoTemp = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setFotosTemp((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFotosParaDano = async (danoId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    for (const file of fotosTemp) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${danoId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('viatura-documentos')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Erro ao fazer upload:', uploadError);
        continue;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('viatura-documentos').getPublicUrl(fileName);

      await supabase.from('viatura_dano_fotos').insert({
        dano_id: danoId,
        ficheiro_url: publicUrl,
        nome_ficheiro: file.name,
        uploaded_by: user?.id,
      });
    }
  };

  const handleSubmit = async () => {
    if (!viaturaId || !descricao.trim()) {
      toast.error('Descrição é obrigatória');
      return;
    }

    setSaving(true);
    try {
      const valorNumerico = valor ? parseFloat(valor.replace(',', '.')) : 0;

      const { data: novoDano, error } = await supabase
        .from('viatura_danos')
        .insert({
          viatura_id: viaturaId,
          descricao: descricao.trim(),
          localizacao: localizacao || null,
          estado,
          observacoes: observacoes.trim() || null,
          valor: valorNumerico,
          data_ocorrencia: dataOcorrencia || null,
          motorista_id: motoristaId || null,
          contrato_id: contratoId,
        })
        .select()
        .single();

      if (error) throw error;

      // Upload das fotos temporárias
      if (fotosTemp.length > 0) {
        await uploadFotosParaDano(novoDano.id);
      }

      // Se há motorista e valor > 0, criar movimento financeiro
      if (motoristaId && valorNumerico > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        await supabase.from('motorista_financeiro').insert({
          motorista_id: motoristaId,
          tipo: 'debito',
          valor: valorNumerico,
          descricao: `Dano em viatura ${matricula || ''} - ${descricao.trim().substring(0, 50)}`,
          categoria: 'dano',
          data_movimento: dataOcorrencia || new Date().toISOString().split('T')[0],
          status: 'pendente',
          referencia: novoDano.id,
          dano_id: novoDano.id,
          criado_por: user?.id,
        });
      }

      toast.success('Dano registado com sucesso!');
      setDialogOpen(false);
      resetForm();
      loadDanos();
    } catch (error) {
      console.error('Erro ao registar dano:', error);
      toast.error('Erro ao registar dano');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEstado = async (danoId: string, novoEstado: string) => {
    try {
      const { error } = await supabase
        .from('viatura_danos')
        .update({ estado: novoEstado, updated_at: new Date().toISOString() })
        .eq('id', danoId);

      if (error) throw error;
      toast.success('Estado atualizado!');
      loadDanos();
    } catch (error) {
      console.error('Erro ao atualizar estado:', error);
      toast.error('Erro ao atualizar estado');
    }
  };

  const handleDelete = async (danoId: string) => {
    if (
      !confirm(
        'Tem certeza que deseja eliminar este dano? O movimento financeiro associado também será afetado.'
      )
    )
      return;

    try {
      // Primeiro eliminar movimento financeiro associado
      await supabase.from('motorista_financeiro').delete().eq('dano_id', danoId);

      // Depois eliminar o dano (fotos são eliminadas em cascata)
      const { error } = await supabase.from('viatura_danos').delete().eq('id', danoId);

      if (error) throw error;
      toast.success('Dano eliminado!');
      loadDanos();
    } catch (error) {
      console.error('Erro ao eliminar dano:', error);
      toast.error('Erro ao eliminar dano');
    }
  };

  const resetForm = () => {
    setDescricao('');
    setLocalizacao('');
    setEstado('pendente');
    setObservacoes('');
    setValor('');
    setDataOcorrencia('');
    setMotoristaId('');
    setContratoId(null);
    // Limpar fotos temporárias
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    setFotosTemp([]);
    setPreviewUrls([]);
  };

  const getEstadoConfig = (estado: string) => {
    return ESTADOS.find((e) => e.value === estado) || ESTADOS[0];
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  if (!viaturaId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Guarde a viatura primeiro para registar danos.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Registo de Danos
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setFolhaDanosOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Gerar Folha de Danos
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Registar Dano
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Registar Novo Dano</DialogTitle>
                <DialogDescription className="sr-only">
                  Preencha os detalhes para registar um novo dano na viatura.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <Label htmlFor="descricao">
                    Descrição <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="descricao"
                    placeholder="Descreva o dano..."
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Localização</Label>
                    <Select value={localizacao} onValueChange={setLocalizacao}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {LOCALIZACOES.map((loc) => (
                          <SelectItem key={loc.value} value={loc.value}>
                            {loc.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Estado</Label>
                    <Select value={estado} onValueChange={setEstado}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS.map((est) => (
                          <SelectItem key={est.value} value={est.value}>
                            {est.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dataOcorrencia">Data de Ocorrência</Label>
                    <Input
                      id="dataOcorrencia"
                      type="date"
                      value={dataOcorrencia}
                      onChange={(e) => setDataOcorrencia(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="valor">Valor (€)</Label>
                    <Input
                      id="valor"
                      type="text"
                      placeholder="0,00"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label>Motorista Responsável</Label>
                  <Select
                    value={motoristaId || 'none'}
                    onValueChange={(val) => setMotoristaId(val === 'none' ? '' : val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar motorista (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {motoristas.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          #{m.codigo} - {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {motoristaId && contratoId && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      Contrato ativo associado automaticamente
                    </p>
                  )}
                  {motoristaId && !contratoId && (
                    <p className="text-xs text-yellow-600 mt-1">Motorista sem contrato ativo</p>
                  )}
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

                {/* Secção de Fotografias */}
                <div className="space-y-3">
                  <Label>Fotografias do Dano</Label>

                  {/* Preview das fotos selecionadas */}
                  {previewUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {previewUrls.map((url, i) => (
                        <div
                          key={i}
                          className="relative w-20 h-20 rounded-lg overflow-hidden border bg-muted"
                        >
                          <img
                            src={url}
                            alt={`Preview ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="destructive"
                            className="absolute top-1 right-1 h-5 w-5"
                            onClick={() => removeFotoTemp(i)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Botões de upload */}
                  <div className="flex flex-wrap gap-2">
                    {/* Câmera (abre diretamente no mobile) */}
                    <Label
                      htmlFor="foto-camera"
                      className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium"
                    >
                      <Camera className="h-4 w-4" />
                      Tirar Foto
                    </Label>
                    <input
                      id="foto-camera"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFotoSelect}
                    />

                    {/* Galeria (permite múltiplas) */}
                    <Label
                      htmlFor="foto-galeria"
                      className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium"
                    >
                      <ImagePlus className="h-4 w-4" />
                      Galeria
                    </Label>
                    <input
                      id="foto-galeria"
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleFotoSelect}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {fotosTemp.length > 0
                      ? `${fotosTemp.length} foto(s) selecionada(s)`
                      : 'Pode adicionar fotos do dano (opcional)'}
                  </p>
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
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-8">
            {danos.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum dano registado.</p>
                <p className="text-sm">A viatura está em bom estado!</p>
              </div>
            )}

            {/* Danos Registados Manualmente */}
            {danos.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Danos Manuais
                </h4>
                {danos.map((dano) => {
                  const estadoConfig = getEstadoConfig(dano.estado);
                  const locLabel = LOCALIZACOES.find((l) => l.value === dano.localizacao)?.label;
                  const dataDisplay = dano.data_ocorrencia || dano.created_at;

                  return (
                    <div key={dano.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{dano.descricao}</p>
                            {dano.descricao.includes('Check-in') && (
                              <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-[10px] h-5 px-1.5 uppercase font-bold">
                                Entrada
                              </Badge>
                            )}
                            {dano.descricao.includes('Check-out') && (
                              <Badge className="bg-green-600 hover:bg-green-700 text-white text-[10px] h-5 px-1.5 uppercase font-bold">
                                Saída
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                            {locLabel && <span>{locLabel}</span>}
                            {locLabel && <span>•</span>}
                            <span>
                              {dataDisplay
                                ? format(new Date(dataDisplay), "d 'de' MMMM 'de' yyyy", {
                                    locale: pt,
                                  })
                                : 'Data N/D'}
                            </span>
                            {dano.valor > 0 && (
                              <>
                                <span>•</span>
                                <span className="font-semibold text-destructive">
                                  {formatCurrency(dano.valor)}
                                </span>
                              </>
                            )}
                          </div>
                          {dano.motorista && (
                            <div className="flex items-center gap-1 mt-1 text-sm text-primary">
                              <User className="h-3 w-3" />
                              <span>
                                #{dano.motorista.codigo} - {dano.motorista.nome}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={dano.estado}
                            onValueChange={(v) => handleUpdateEstado(dano.id, v)}
                          >
                            <SelectTrigger className="w-[140px]">
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
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDelete(dano.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {dano.observacoes && (
                        <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                          {dano.observacoes}
                        </p>
                      )}

                      <DanoFotosGallery
                        danoId={dano.id}
                        fotos={dano.fotos}
                        onFotosChange={loadDanos}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
      {viaturaId && (
        <GenerateDocumentsDialog
          open={folhaDanosOpen}
          onOpenChange={setFolhaDanosOpen}
          viaturaId={viaturaId}
        />
      )}
    </Card>
  );
}
