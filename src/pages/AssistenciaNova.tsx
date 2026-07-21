import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgId } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Search,
  Car,
  ChevronRight,
  Loader2,
  Wrench,
  Calendar,
  Gauge,
  Droplet,
  X,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Flame,
  Eraser,
} from 'lucide-react';
import { AssistenciaMultimediaUpload } from '@/components/assistencia/AssistenciaMultimediaUpload';
import { matchesSearch } from '@/lib/utils';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';

interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  cor?: string | null;
  ano?: number | null;
  status: string;
  km_atual?: number | null;
  combustivel?: string | null;
}

interface Categoria {
  id: string;
  nome: string;
  cor: string;
}

export default function AssistenciaNova() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const orgId = useOrgId();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [viaturas, setViaturas] = useState<Viatura[]>([]);
  const [filteredViaturas, setFilteredViaturas] = useState<Viatura[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [sortField, setSortField] = useState<string>('matricula');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const [selectedViatura, setSelectedViatura] = useState<Viatura | null>(null);
  const [viaturaSubstituta, setViaturaSubstituta] = useState<Viatura | null>(null);
  const [viaturasDisponiveis, setViaturasDisponiveis] = useState<Viatura[]>([]);
  const [showSubstituteSearch, setShowSubstituteSearch] = useState(false);
  const [substituteSearchTerm, setSubstituteSearchTerm] = useState('');
  const [motoristaId, setMotoristaId] = useState<string | null>(null);
  const [mediaFiles, setMediaFiles] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    categoria_id: '',
    titulo: '',
    descricao: '',
    prioridade: 'media',
    km_inicio: '',
    km_inicio_indisponivel: false,
    combustivel_inicio: 'meio',
    adblue_nivel: 'cheio',
    gpl_qtd: '',
    eletricidade_qtd: '',
    estado_limpeza: 'limpa',
    data_entrada: new Date().toISOString().split('T')[0],
    valor_orcamento: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vRes, cRes] = await Promise.all([
        supabase
          .from('viaturas')
          .select('id, matricula, marca, modelo, cor, ano, status, km_atual, combustivel')
          .neq('status', 'vendida')
          .order('matricula'),
        supabase
          .from('assistencia_categorias')
          .select('id, nome, cor')
          .eq('ativo', true)
          .order('ordem'),
      ]);

      if (vRes.error) throw vRes.error;
      if (cRes.error) throw cRes.error;

      setViaturas(vRes.data || []);
      setFilteredViaturas(vRes.data || []);
      setCategorias(cRes.data || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as viaturas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFilteredViaturas(
      viaturas.filter(
        (v) =>
          matchesSearch(v.matricula, searchTerm) ||
          matchesSearch(v.marca, searchTerm) ||
          matchesSearch(v.modelo, searchTerm)
      )
    );
  }, [searchTerm, viaturas]);

  const sortedViaturas = useMemo(() => {
    const list = [...filteredViaturas];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'matricula') {
        va = a.matricula || '';
        vb = b.matricula || '';
      } else if (sortField === 'status') {
        va = a.status || '';
        vb = b.status || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredViaturas, sortField, sortDir]);

  const handleSelectViatura = async (viatura: Viatura) => {
    setSelectedViatura(viatura);
    setFormData((prev) => ({ ...prev, km_inicio: viatura.km_atual?.toString() || '' }));

    // Buscar motorista associado
    const { data: assoc } = await supabase
      .from('motorista_viaturas')
      .select('motorista_id')
      .eq('viatura_id', viatura.id)
      .eq('status', 'ativo')
      .is('data_fim', null)
      .maybeSingle();
    setMotoristaId(assoc?.motorista_id || null);

    // Buscar viaturas disponíveis para eventual substituta
    const { data: disponiveis } = await supabase
      .from('viaturas')
      .select('id, matricula, marca, modelo, status, km_atual')
      .eq('status', 'disponivel')
      .neq('id', viatura.id)
      .order('matricula');
    setViaturasDisponiveis(disponiveis || []);

    setStep(2); // Vai para Multimédia
  };

  const handleMultimediaComplete = (files: any[]) => {
    setMediaFiles(files);
    setStep(3); // Vai para Estado da Viatura
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedViatura) return;

    if (!formData.titulo.trim()) {
      toast({
        title: 'Erro',
        description: 'Por favor, insira um título descritivo.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.km_inicio_indisponivel && !formData.km_inicio) {
      toast({
        title: 'Erro',
        description: 'Quilometragem é obrigatória (ou marque "KM não disponível").',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);

      // 1. Criar o Ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('assistencia_tickets')
        .insert({
          viatura_id: selectedViatura.id,
          motorista_id: motoristaId || null,
          categoria_id: formData.categoria_id || null,
          titulo: formData.titulo.trim(),
          descricao: formData.descricao.trim(),
          prioridade: formData.prioridade,
          status: 'pendente',
          km_inicio: formData.km_inicio_indisponivel ? null : parseInt(formData.km_inicio) || null,
          km_inicio_indisponivel: formData.km_inicio_indisponivel,
          combustivel_inicio: formData.combustivel_inicio,
          adblue_nivel: formData.adblue_nivel,
          gpl_qtd: formData.gpl_qtd ? parseFloat(formData.gpl_qtd) : null,
          eletricidade_qtd: formData.eletricidade_qtd
            ? parseFloat(formData.eletricidade_qtd)
            : null,
          estado_limpeza: formData.estado_limpeza,
          valor_orcamento: formData.valor_orcamento ? parseFloat(formData.valor_orcamento) : null,
          criado_por: user?.id,
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      // 2. Salvar Anexos (Fotos e Vídeos) na Assistência
      if (mediaFiles.length > 0) {
        const anexos = mediaFiles.map((file) => ({
          ticket_id: ticket.id,
          tipo_ficheiro: file.type === 'image' ? 'foto' : 'video',
          ficheiro_url: file.path,
          nome_ficheiro: file.path.split('/').pop() || 'anexo',
          uploaded_by: user?.id,
          tipo_inspecao: 'checkin',
        }));

        const { error: anexosError } = await supabase.from('assistencia_anexos').insert(anexos);

        if (anexosError) {
          console.error('Erro ao salvar anexos:', anexosError);
          toast({
            title: 'Aviso: fotos não guardadas',
            description:
              'O ticket foi criado mas as fotografias não foram associadas. Abre o ticket e faz upload manualmente.',
            variant: 'destructive',
            duration: 10000,
          });
        }

        // 2.1 TAMBÉM salvar como "Dano" da viatura para histórico centralizado
        const { data: novoDano, error: danoError } = await supabase
          .from('viatura_danos')
          .insert({
            viatura_id: selectedViatura.id,
            motorista_id: motoristaId || null,
            ticket_id: ticket.id,
            descricao: `Check-in de Assistência #${String(ticket.numero).padStart(4, '0')}`,
            localizacao: 'outro',
            estado: 'pendente',
            data_registo: new Date().toISOString().split('T')[0],
            registado_por: user?.id,
            observacoes: `Registado automaticamente na abertura da assistência: ${formData.titulo}`,
          })
          .select()
          .single();

        if (danoError) {
          console.error('Erro ao criar dano:', danoError);
          toast({
            title: 'Aviso',
            description: 'Não foi possível criar histórico de danos: ' + danoError.message,
            variant: 'destructive',
          });
        }

        if (!danoError && novoDano) {
          toast({ title: 'Histórico de danos criado', duration: 2000 });

          const fotosDano = mediaFiles
            .filter((f) => f.type === 'image')
            .map((file) => ({
              dano_id: novoDano.id,
              ficheiro_url: file.path,
              nome_ficheiro: file.path.split('/').pop() || 'foto_checkin',
              uploaded_by: user?.id,
            }));

          if (fotosDano.length > 0) {
            const { error: fotosError } = await supabase
              .from('viatura_dano_fotos')
              .insert(fotosDano);
            if (fotosError) {
              console.error('Erro ao salvar fotos do dano:', fotosError);
              toast({ title: 'Erro ao salvar fotos no histórico', variant: 'destructive' });
            }
          }
        }
      } else {
        console.warn('Nenhum ficheiro multimédia para criar registo de danos');
      }

      // 1.1 Criar mensagem inicial de log
      await supabase.from('assistencia_mensagens').insert({
        ticket_id: ticket.id,
        autor_id: user?.id,
        mensagem: `Ticket criado com check-in completo: 
         - Orçamento Estimado: ${formData.valor_orcamento ? formData.valor_orcamento + '€' : 'Não definido'}
         - KM Inicial: ${formData.km_inicio_indisponivel ? 'não disponível' : formData.km_inicio}
         - Combustível: ${formData.combustivel_inicio}
         - AdBlue: ${formData.adblue_nivel}
         - Limpeza: ${formData.estado_limpeza}
         - Média: ${mediaFiles.length} ficheiros anexados`,
        tipo: 'status_change',
      });

      // 2. Viatura original → manutencao
      const { error: viaturaError } = await supabase
        .from('viaturas')
        .update({ status: 'manutencao' })
        .eq('id', selectedViatura.id);
      if (viaturaError) throw viaturaError;

      // 3. Viatura substituta (se selecionada)
      if (viaturaSubstituta && motoristaId && ticket) {
        await supabase.from('motorista_viaturas').insert({
          motorista_id: motoristaId,
          viatura_id: viaturaSubstituta.id,
          data_inicio: new Date().toISOString().split('T')[0],
          status: 'ativo',
          tipo: 'substituta',
        });
        await supabase.from('viaturas').update({ status: 'em_uso' }).eq('id', viaturaSubstituta.id);
        await supabase
          .from('assistencia_tickets')
          .update({ viatura_substituta_id: viaturaSubstituta.id })
          .eq('id', ticket.id);
      }

      // --- ACESSO AUTOMÁTICO ---
      try {
        const userIdsSet = new Set<string>();
        if (user?.id) userIdsSet.add(user.id);

        const GESTOR_ASSISTENCIA_CARGO_IDS = [
          'd8680e20-5025-47c1-bcc0-ae432f8afb96', // Gestor de Assistência
          '0cf27801-80ff-4480-857e-e90bfb75d5a6', // Supervisor Gestor TVDE
        ];

        // Admins/gestores da ORG ATIVA (papel per-org em user_organizacoes,
        // não profiles legado). Inclui cargo "Gestor de Assistência" por nome.
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
          ticket_id: ticket.id,
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

      toast({
        title: 'Sucesso',
        description: 'Entrada em assistência registada com sucesso.',
      });

      navigate('/assistencia');
    } catch (error: any) {
      console.error('Erro ao criar assistência:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao processar a entrada da viatura.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isElectric =
    selectedViatura?.combustivel?.toLowerCase().includes('elétrico') ||
    selectedViatura?.combustivel?.toLowerCase().includes('híbrido');
  const isGas =
    selectedViatura?.combustivel?.toLowerCase().includes('gpl') ||
    selectedViatura?.combustivel?.toLowerCase().includes('gás');

  return (
    <div className="native-bottom container mx-auto px-3 md:px-4 py-4 md:py-8 max-w-4xl space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (step === 1) navigate('/assistencia');
            else setStep(step - 1);
          }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            <span className="truncate">Nova Entrada em Assistência</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Passo {step} de 4:{' '}
            {step === 1
              ? 'Selecione a viatura'
              : step === 2
                ? 'Documentação Multimédia'
                : step === 3
                  ? 'Estado da Viatura'
                  : 'Detalhes Técnicos'}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex gap-2 h-1.5 w-full">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>

      {step === 1 && (
        <Card className="border-border/50">
          <CardHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por matrícula ou modelo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11"
                autoFocus
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredViaturas.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Car className="h-12 w-12 mx-auto mb-4 opacity-20" />
                Nenhuma viatura encontrada.
              </div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        field="matricula"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Viatura
                      </SortableTableHead>
                      <SortableTableHead
                        field="status"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Status Atual
                      </SortableTableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedViaturas.map((v) => (
                      <TableRow
                        key={v.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSelectViatura(v)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Car className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-mono font-bold">{v.matricula}</p>
                              <p className="text-xs text-muted-foreground">
                                {v.marca} {v.modelo} ({v.combustivel || 'N/I'})
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-1 rounded-full capitalize ${
                              v.status === 'disponivel'
                                ? 'bg-green-100 text-green-700'
                                : v.status === 'manutencao'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {v.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            Selecionar
                            <ChevronRight className="ml-2 h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Documentação Multimédia</CardTitle>
            <CardDescription>
              Carregue fotografias do estado atual e um vídeo de 15 segundos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssistenciaMultimediaUpload
              onComplete={handleMultimediaComplete}
              initialFiles={mediaFiles}
              requiredPhotos={4}
            />
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Estado da Viatura</CardTitle>
            <CardDescription>Registe o estado atual dos consumíveis e limpeza.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="km_inicio" className="flex items-center gap-2">
                    <Gauge className="h-4 w-4" /> Quilometragem
                    {!formData.km_inicio_indisponivel && ' (Obrigatório)'}
                  </Label>
                  <Input
                    id="km_inicio"
                    type="number"
                    placeholder="KM à entrada"
                    value={formData.km_inicio_indisponivel ? '' : formData.km_inicio}
                    disabled={formData.km_inicio_indisponivel}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, km_inicio: e.target.value }))
                    }
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="km_inicio_indisponivel"
                      checked={formData.km_inicio_indisponivel}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, km_inicio_indisponivel: !!checked }))
                      }
                    />
                    <Label
                      htmlFor="km_inicio_indisponivel"
                      className="text-xs font-normal text-muted-foreground cursor-pointer"
                    >
                      KM não disponível (ex.: viatura não liga)
                    </Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adblue" className="flex items-center gap-2">
                    <Droplet className="h-4 w-4" /> Nível AdBlue (Obrigatório)
                  </Label>
                  <Select
                    value={formData.adblue_nivel}
                    onValueChange={(val) => setFormData((prev) => ({ ...prev, adblue_nivel: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cheio">Cheio</SelectItem>
                      <SelectItem value="medio">Médio</SelectItem>
                      <SelectItem value="baixo">Baixo</SelectItem>
                      <SelectItem value="critico">Crítico (Reserva)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="combustivel" className="flex items-center gap-2">
                    <Droplet className="h-4 w-4" /> Nível Combustível (Diesel/Gasolina)
                  </Label>
                  <Select
                    value={formData.combustivel_inicio}
                    onValueChange={(val) =>
                      setFormData((prev) => ({ ...prev, combustivel_inicio: val }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vazio">Vazio</SelectItem>
                      <SelectItem value="reserva">Reserva</SelectItem>
                      <SelectItem value="1/4">1/4</SelectItem>
                      <SelectItem value="meio">1/2 (Meio)</SelectItem>
                      <SelectItem value="3/4">3/4</SelectItem>
                      <SelectItem value="cheio">Cheio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="limpeza" className="flex items-center gap-2">
                    <Eraser className="h-4 w-4" /> Estado de Limpeza
                  </Label>
                  <Select
                    value={formData.estado_limpeza}
                    onValueChange={(val) =>
                      setFormData((prev) => ({ ...prev, estado_limpeza: val }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="limpa">Limpa</SelectItem>
                      <SelectItem value="aceitavel">Aceitável</SelectItem>
                      <SelectItem value="suja">Suja</SelectItem>
                      <SelectItem value="muito_suja">Muito Suja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isGas && (
                  <div className="space-y-2 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900/50">
                    <Label
                      htmlFor="gpl_qtd"
                      className="flex items-center gap-2 text-orange-700 dark:text-orange-400"
                    >
                      <Flame className="h-4 w-4" /> Quantidade GPL (%)
                    </Label>
                    <Input
                      id="gpl_qtd"
                      type="number"
                      placeholder="Ex: 75"
                      value={formData.gpl_qtd}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, gpl_qtd: e.target.value }))
                      }
                      className="bg-background"
                    />
                  </div>
                )}

                {isElectric && (
                  <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900/50">
                    <Label
                      htmlFor="eletricidade_qtd"
                      className="flex items-center gap-2 text-blue-700 dark:text-blue-400"
                    >
                      <Zap className="h-4 w-4" /> Carga Elétrica (%)
                    </Label>
                    <Input
                      id="eletricidade_qtd"
                      type="number"
                      placeholder="Ex: 85"
                      value={formData.eletricidade_qtd}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, eletricidade_qtd: e.target.value }))
                      }
                      className="bg-background"
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button
              onClick={() => {
                if (!formData.km_inicio_indisponivel && !formData.km_inicio) {
                  toast({
                    title: 'Campo Obrigatório',
                    description: 'Insira a quilometragem ou marque "KM não disponível".',
                    variant: 'destructive',
                  });
                  return;
                }
                setStep(4);
              }}
            >
              Continuar
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 4 && (
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Detalhes da Assistência</CardTitle>
                  <CardDescription>Qual o motivo desta entrada?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="titulo">
                      Título da Assistência <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="titulo"
                      placeholder="Ex: Revisão Anual, Barulho no motor..."
                      value={formData.titulo}
                      onChange={(e) => setFormData((prev) => ({ ...prev, titulo: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categoria">Categoria</Label>
                    <Select
                      value={formData.categoria_id}
                      onValueChange={(val) =>
                        setFormData((prev) => ({ ...prev, categoria_id: val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma categoria..." />
                      </SelectTrigger>
                      <SelectContent>
                        {categorias.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="descricao">Descrição (opcional)</Label>
                    <Textarea
                      id="descricao"
                      placeholder="Detalhes adicionais sobre o estado da viatura ou pedido..."
                      className="min-h-[100px]"
                      value={formData.descricao}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, descricao: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prioridade">Prioridade</Label>
                    <Select
                      value={formData.prioridade}
                      onValueChange={(val) => setFormData((prev) => ({ ...prev, prioridade: val }))}
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
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg">Resumo Check-in</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="data_entrada" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Data Entrada
                    </Label>
                    <Input
                      id="data_entrada"
                      type="date"
                      value={formData.data_entrada}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, data_entrada: e.target.value }))
                      }
                    />
                  </div>

                  {/* Viatura Substituta */}
                  {motoristaId && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Car className="h-4 w-4" /> Viatura Substituta (opcional)
                      </Label>
                      {viaturaSubstituta ? (
                        <div className="flex items-center gap-2 p-2 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/20">
                          <Car className="h-4 w-4 text-amber-600 shrink-0" />
                          <span className="flex-1 text-sm font-mono font-bold">
                            {viaturaSubstituta.matricula}
                          </span>
                          <button
                            type="button"
                            onClick={() => setViaturaSubstituta(null)}
                            className="ml-1 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {!showSubstituteSearch ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => setShowSubstituteSearch(true)}
                            >
                              <Car className="h-4 w-4 mr-2" /> Atribuir substituta
                            </Button>
                          ) : (
                            <div className="space-y-2">
                              <Input
                                placeholder="Pesquisar..."
                                value={substituteSearchTerm}
                                onChange={(e) => setSubstituteSearchTerm(e.target.value)}
                                className="h-8 text-sm"
                              />
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {viaturasDisponiveis
                                  .filter((v) => matchesSearch(v.matricula, substituteSearchTerm))
                                  .map((v) => (
                                    <button
                                      key={v.id}
                                      type="button"
                                      onClick={() => {
                                        setViaturaSubstituta(v);
                                        setShowSubstituteSearch(false);
                                      }}
                                      className="w-full text-left px-2 py-1 text-xs hover:bg-muted rounded"
                                    >
                                      {v.matricula} - {v.marca}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="pt-0">
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      'Finalizar e Salvar'
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
