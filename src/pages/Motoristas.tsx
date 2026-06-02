import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  ChevronUp,
  ChevronDown,
  Plus,
  Check,
  RefreshCw,
  Link2,
  CreditCard,
  Car,
  Fuel,
} from 'lucide-react';
import { startOfWeek, format as formatDate } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MotoristaDialog } from '@/components/motoristas/MotoristaDialog';
import { MotoristasPlataformaNaoAssociados } from '@/components/motoristas/MotoristasPlataformaNaoAssociados';
import { CartoesNaoReconhecidos } from '@/components/motoristas/CartoesNaoReconhecidos';
import { PortagensNaoAssociadas } from '@/components/motoristas/PortagensNaoAssociadas';
import { BpNaoAssociadas } from '@/components/motoristas/BpNaoAssociadas';
import { GenerateDocumentsDialog } from '@/components/motoristas/GenerateDocumentsDialog';
import { MotoristaCard } from '@/components/motoristas/MotoristaCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MotoristaDetailsDrawer } from '@/components/motoristas/MotoristaDetailsDrawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn, normalizeString } from '@/lib/utils';

import type { Motorista } from '@/types/motorista';
export type { Motorista };

type SortColumn =
  | 'codigo'
  | 'nome'
  | 'telefone'
  | 'gestor_responsavel'
  | 'cidade'
  | 'status_ativo'
  | 'bolt_id'
  | 'uber_uuid';

export default function Motoristas() {
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. O URL é o ÚNICO dono da verdade
  const [searchParams, setSearchParams] = useSearchParams();

  const searchTerm = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || 'todos';
  const cidadeFilter = searchParams.get('cidade') || 'todas';
  const gestorFilter = searchParams.get('gestor') || 'todos';
  const sortColumn = (searchParams.get('sort') as SortColumn) || 'codigo';
  const sortDirection = (searchParams.get('dir') as 'asc' | 'desc') || 'asc';

  const updateFilters = (updates: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== '' && value !== 'todos' && value !== 'todas') {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    setSearchParams(newParams, { replace: true });
  };

  const handleSort = (column: SortColumn) => {
    const newDir = sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc';
    updateFilters({ sort: column, dir: newDir });
  };

  const [selectedMotorista, setSelectedMotorista] = useState<Motorista | null>(null);
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [motoristaToEdit, setMotoristaToEdit] = useState<Motorista | null>(null);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [newMotoristaForContract, setNewMotoristaForContract] = useState<Motorista | null>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
  const [mappingTarget, setMappingTarget] = useState<Motorista | null>(null);
  const [unmappedBoltDrivers, setUnmappedBoltDrivers] = useState<{ name: string; id: string }[]>(
    []
  );
  const [isMappingLoading, setIsMappingLoading] = useState(false);
  const [naoAssociadosOpen, setNaoAssociadosOpen] = useState(false);
  const [naoAssociadosCount, setNaoAssociadosCount] = useState<number>(0);
  const [cartoesOpen, setCartoesOpen] = useState(false);
  const [cartoesCount, setCartoesCount] = useState<number>(0);
  const [portagensOpen, setPortagensOpen] = useState(false);
  const [portagensCount, setPortagensCount] = useState<number>(0);
  const [bpNaoAssociadasOpen, setBpNaoAssociadasOpen] = useState(false);
  const [bpNaoAssociadasCount, setBpNaoAssociadasCount] = useState<number>(0);
  const [novaFichaPrefill, setNovaFichaPrefill] = useState<{
    nome?: string;
    bolt_id?: string;
    uber_uuid?: string;
  } | null>(null);

  useEffect(() => {
    loadMotoristas();
    loadNaoAssociadosCount();
    loadCartoesCount();
    loadPortagensCount();
    loadBpNaoAssociadasCount();
  }, []);

  const loadCartoesCount = async () => {
    try {
      const desde = formatDate(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const { data } = await (supabase as any).rpc('get_cartoes_combustivel_nao_associados', {
        p_desde: desde,
      });
      setCartoesCount((data as any[] | null)?.length ?? 0);
    } catch {
      /* silencioso */
    }
  };

  const loadBpNaoAssociadasCount = async () => {
    try {
      const { count } = await supabase
        .from('bp_transacoes')
        .select('card_number', { count: 'exact', head: false })
        .is('motorista_id', null);
      const { data } = await supabase
        .from('bp_transacoes')
        .select('card_number')
        .is('motorista_id', null);
      const unique = new Set<string>(
        (data || []).map((r: any) => r.card_number || '__sem_cartao__')
      );
      setBpNaoAssociadasCount(unique.size);
    } catch {
      /* silencioso */
    }
  };

  const loadPortagensCount = async () => {
    try {
      const { data } = await (supabase as any)
        .from('via_verde_transacoes')
        .select('matricula', { count: 'exact', head: false })
        .is('motorista_id', null)
        .not('matricula', 'is', null);
      const unique = new Set<string>(((data as any[]) || []).map((r: any) => r.matricula));
      setPortagensCount(unique.size);
    } catch {
      /* silencioso */
    }
  };

  const loadNaoAssociadosCount = async () => {
    try {
      const desde = new Date();
      desde.setDate(desde.getDate() - 56);
      const desdeDate = desde.toISOString().slice(0, 10);

      // IDs de plataforma já "ligados" — via ficha OU via motorista_id em qualquer registo.
      const { data: crm } = await supabase.from('motoristas_ativos').select('uber_uuid, bolt_id');
      const uberLigados = new Set<string>(
        (crm || []).map((m: any) => m.uber_uuid).filter((x: any) => !!x)
      );
      const boltLigados = new Set<string>(
        (crm || []).map((m: any) => m.bolt_id).filter((x: any) => !!x)
      );

      const [uberDrv, boltRows, uberLigDb, boltLigDb] = await Promise.all([
        supabase.from('uber_drivers').select('uber_driver_id, full_name').is('motorista_id', null),
        supabase
          .from('bolt_resumos_semanais')
          .select('identificador_motorista, motorista_nome')
          .is('motorista_id', null)
          .gte('periodo_inicio', desdeDate)
          .not('identificador_motorista', 'is', null),
        supabase
          .from('uber_transactions')
          .select('uber_driver_id')
          .not('motorista_id', 'is', null)
          .not('uber_driver_id', 'is', null),
        supabase
          .from('bolt_resumos_semanais')
          .select('identificador_motorista')
          .not('motorista_id', 'is', null)
          .not('identificador_motorista', 'is', null),
      ]);
      (uberLigDb.data || []).forEach((r: any) => uberLigados.add(r.uber_driver_id));
      (boltLigDb.data || []).forEach((r: any) => boltLigados.add(r.identificador_motorista));

      // Contar PESSOAS (nome normalizado distinto), não registos — alinha com a lista unificada.
      const norm = (s: string) =>
        (s || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9 ]/g, ' ')
          .trim()
          .replace(/\s+/g, ' ');
      const nomes = new Set<string>();
      (uberDrv.data || []).forEach((d: any) => {
        if (d.uber_driver_id && !uberLigados.has(d.uber_driver_id)) {
          nomes.add(norm(d.full_name) || d.uber_driver_id);
        }
      });
      (boltRows.data || []).forEach((r: any) => {
        if (r.identificador_motorista && !boltLigados.has(r.identificador_motorista)) {
          nomes.add(norm(r.motorista_nome) || r.identificador_motorista);
        }
      });
      setNaoAssociadosCount(nomes.size);
    } catch {
      /* silencioso */
    }
  };

  const loadMotoristas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select('*')
        .order('codigo', { ascending: true });

      if (error) throw error;
      setMotoristas(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar motoristas:', error);
      toast({
        title: 'Erro ao carregar motoristas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Get unique cities for filter
  const availableCities = useMemo(() => {
    const cities = motoristas.map((m) => m.cidade).filter((c): c is string => !!c);
    return [...new Set(cities)].sort();
  }, [motoristas]);

  // Get unique gestores for filter
  const availableGestores = useMemo(() => {
    const gestores = motoristas.map((m) => m.gestor_responsavel).filter((g): g is string => !!g);
    return [...new Set(gestores)].sort();
  }, [motoristas]);

  // Sortable header component
  const SortableHeader = ({
    column,
    label,
    className,
  }: {
    column: SortColumn;
    label: string;
    className?: string;
  }) => (
    <TableHead
      className={cn(
        'h-10 cursor-pointer select-none hover:bg-muted/50 transition-colors',
        className
      )}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortColumn === column ? (
          sortDirection === 'asc' ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )
        ) : (
          <ChevronDown className="h-4 w-4 opacity-30" />
        )}
      </div>
    </TableHead>
  );

  // Combined filtering and sorting logic
  const filteredMotoristas = useMemo(() => {
    const searchNormalized = normalizeString(searchTerm);
    // Pesquisa por palavras: cada palavra do termo tem de aparecer no nome
    const searchWords = searchNormalized.split(' ').filter(Boolean);

    const result = motoristas.filter((m) => {
      // Text search (code, name, NIF, phone)
      const nomeNorm = normalizeString(m.nome);
      const matchesSearch =
        searchTerm.trim() === '' ||
        m.codigo.toString().includes(searchTerm) ||
        searchWords.every((w) => nomeNorm.includes(w)) ||
        (m.nif && m.nif.includes(searchTerm)) ||
        (m.bolt_id && m.bolt_id.includes(searchTerm)) ||
        (m.uber_uuid && m.uber_uuid.includes(searchTerm)) ||
        (m.telefone && m.telefone.includes(searchTerm));

      // Status filter
      const matchesStatus =
        statusFilter === 'todos' ||
        (statusFilter === 'ativo' && m.status_ativo) ||
        (statusFilter === 'inativo' && !m.status_ativo);

      // City filter
      const matchesCidade = cidadeFilter === 'todas' || m.cidade === cidadeFilter;

      // Gestor filter
      const matchesGestor = gestorFilter === 'todos' || m.gestor_responsavel === gestorFilter;

      return matchesSearch && matchesStatus && matchesCidade && matchesGestor;
    });

    // Apply sorting
    result.sort((a, b) => {
      let aValue = a[sortColumn];
      let bValue = b[sortColumn];

      // Handle nulls
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';

      // Number comparison (codigo)
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        const comparison = aValue - bValue;
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      // Boolean comparison (status_ativo)
      if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
        const comparison = aValue === bValue ? 0 : aValue ? -1 : 1;
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      // String comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue, 'pt');
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      return 0;
    });

    return result;
  }, [motoristas, searchTerm, statusFilter, cidadeFilter, gestorFilter, sortColumn, sortDirection]);

  const handleRowClick = (motorista: Motorista) => {
    navigate(`/motoristas/${motorista.id}`, {
      state: { listaUrl: window.location.pathname + window.location.search },
    });
  };

  const handleMotoristaUpdated = () => {
    loadMotoristas();
  };

  const handleAddMotorista = () => {
    setMotoristaToEdit(null);
    setNovaFichaPrefill(null);
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setIsDialogOpen(false);
      setMotoristaToEdit(null);
      setNovaFichaPrefill(null);
      loadMotoristas();
      loadNaoAssociadosCount();
    }
  };

  const normalizeStr = (str: string): string => {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ') // Remove pontuação
      .trim()
      .replace(/\s+/g, ' '); // Normaliza espaços
  };

  const handleOpenMapping = async (motorista: Motorista) => {
    setMappingTarget(motorista);
    setIsMappingDialogOpen(true);
    setIsMappingLoading(true);
    try {
      // Buscar todos os nomes únicos da Bolt que não estão mapeados
      const { data, error } = await supabase
        .from('bolt_resumos_semanais')
        .select('motorista_nome, identificador_motorista')
        .is('motorista_id', null)
        .not('identificador_motorista', 'is', null);

      if (error) throw error;

      // Deduplicar por identificador
      const unique = data.reduce((acc: any[], current) => {
        if (!acc.find((i) => i.id === current.identificador_motorista)) {
          acc.push({ name: current.motorista_nome, id: current.identificador_motorista });
        }
        return acc;
      }, []);

      setUnmappedBoltDrivers(unique);
    } catch (error) {
      console.error('Erro ao carregar motoristas Bolt:', error);
    } finally {
      setIsMappingLoading(false);
    }
  };

  const handleConfirmMapping = async (boltId: string) => {
    if (!mappingTarget) return;
    try {
      setLoading(true);
      const { error } = await supabase
        .from('motoristas_ativos')
        .update({ bolt_id: boltId })
        .eq('id', mappingTarget.id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Motorista mapeado com sucesso!',
      });
      setIsMappingDialogOpen(false);
      loadMotoristas();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncIDs = async () => {
    try {
      setLoading(true);
      toast({
        title: 'A iniciar sincronização v2.0',
        description: 'A aplicar lógica de comparação avançada...',
      });

      // 1. Buscar todos os motoristas
      const { data: currentMotoristas, error: motError } = await supabase
        .from('motoristas_ativos')
        .select('id, nome, email, telefone, bolt_id, uber_uuid');

      if (motError) throw motError;

      // 2. Buscar resumos Bolt com IDs
      const { data: resumos, error: resError } = await supabase
        .from('bolt_resumos_semanais')
        .select('motorista_nome, identificador_motorista, telefone, email, motorista_id')
        .not('identificador_motorista', 'is', null);

      if (resError) throw resError;

      // 3. Buscar Uber Drivers mapeados
      const { data: uberDrivers, error: uberError } = await supabase
        .from('uber_drivers')
        .select('full_name, uber_driver_id, motorista_id')
        .not('uber_driver_id', 'is', null);

      if (uberError) throw uberError;

      let totalMapped = 0;
      const updates = [];
      const particles = ['de', 'da', 'do', 'das', 'dos', 'e'];

      for (const m of currentMotoristas) {
        if (m.bolt_id && m.uber_uuid) continue;

        const mClean = normalizeStr(m.nome);
        const mWords = mClean.split(' ').filter((w) => w.length > 2 && !particles.includes(w));
        const mPhone = m.telefone ? m.telefone.replace(/\D/g, '').slice(-9) : null;
        const mEmail = m.email?.toLowerCase().trim();

        const updatedData: any = {};
        let needsUpdate = false;

        // Tentar encontrar na Bolt
        if (!m.bolt_id || !m.email || !m.telefone) {
          const match = resumos.find((r) => {
            const rClean = normalizeStr(r.motorista_nome || '');
            const rWords = rClean.split(' ').filter((w) => w.length > 2 && !particles.includes(w));
            const rPhone = r.telefone ? r.telefone.replace(/\D/g, '').slice(-9) : null;
            const rEmail = r.email?.toLowerCase().trim();

            // Prioridade 1: Match por Telefone ou Email (Confiança Total)
            if (mEmail && rEmail && mEmail === rEmail) return true;
            if (mPhone && rPhone && mPhone === rPhone) return true;

            // Prioridade 2: Match por Nome
            if (rClean === mClean) return true;
            if (mWords.length >= 2 && rWords.length >= 2) {
              const mFirstLast = `${mWords[0]} ${mWords[mWords.length - 1]}`;
              const rFirstLast = `${rWords[0]} ${rWords[rWords.length - 1]}`;
              if (mFirstLast === rFirstLast) return true;

              const intersection = mWords.filter((w) => rWords.includes(w));
              const score = intersection.length / Math.min(mWords.length, rWords.length);
              if (score >= 0.8) return true; // Confiança alta para enriquecer dados
            }

            return false;
          });

          if (match) {
            if (!m.bolt_id) {
              updatedData.bolt_id = match.identificador_motorista;
              needsUpdate = true;
            }
            // Enriquecer email se estiver vazio
            if (!m.email && match.email) {
              updatedData.email = match.email.toLowerCase().trim();
              needsUpdate = true;
            }
            // Enriquecer telefone se estiver vazio
            if (!m.telefone && match.telefone) {
              updatedData.telefone = match.telefone.trim();
              needsUpdate = true;
            }
          }
        }

        // Tentar encontrar na Uber
        if (!m.uber_uuid) {
          const matchUber = uberDrivers.find((u) => {
            const uClean = normalizeStr(u.full_name || '');
            const uWords = uClean.split(' ').filter((w) => w.length > 2 && !particles.includes(w));

            if (uClean === mClean) return true;

            if (mWords.length >= 2 && uWords.length >= 2) {
              const intersection = mWords.filter((w) => uWords.includes(w));
              const score = intersection.length / Math.min(mWords.length, uWords.length);
              if (score >= 0.8) return true;
            }
            return false;
          });

          if (matchUber) {
            updatedData.uber_uuid = matchUber.uber_driver_id;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          updates.push(supabase.from('motoristas_ativos').update(updatedData).eq('id', m.id));
          totalMapped++;
        }
      }

      if (updates.length > 0) {
        // Executar em grupos de 10 para evitar timeouts
        for (let i = 0; i < updates.length; i += 10) {
          await Promise.all(updates.slice(i, i + 10));
        }
      }

      toast({
        title: 'Sincronização concluída',
        description: `${totalMapped} motoristas mapeados com sucesso!`,
      });
      loadMotoristas();
    } catch (error: any) {
      console.error('Erro ao sincronizar IDs:', error);
      toast({
        title: 'Erro na sincronização',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMotoristaCreated = (motorista: Motorista) => {
    setNewMotoristaForContract(motorista);
    setContractDialogOpen(true);
    loadMotoristas();
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Motoristas Ativos</h1>
          <p className="text-muted-foreground text-sm">
            {filteredMotoristas.length} motorista{filteredMotoristas.length !== 1 ? 's' : ''}{' '}
            encontrado{filteredMotoristas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          {naoAssociadosCount > 0 && (
            <Button
              variant="outline"
              onClick={() => setNaoAssociadosOpen(true)}
              className="w-full sm:w-auto gap-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
            >
              <Link2 className="h-4 w-4" />
              {naoAssociadosCount} sem ficha
              <Badge
                variant="secondary"
                className="ml-1 bg-amber-500/20 text-amber-700 dark:text-amber-300"
              >
                associar
              </Badge>
            </Button>
          )}
          {cartoesCount > 0 && (
            <Button
              variant="outline"
              onClick={() => setCartoesOpen(true)}
              className="w-full sm:w-auto gap-2 border-orange-500/50 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400"
            >
              <CreditCard className="h-4 w-4" />
              {cartoesCount} cartões
              <Badge
                variant="secondary"
                className="ml-1 bg-orange-500/20 text-orange-700 dark:text-orange-300"
              >
                associar
              </Badge>
            </Button>
          )}
          {portagensCount > 0 && (
            <Button
              variant="outline"
              onClick={() => setPortagensOpen(true)}
              className="w-full sm:w-auto gap-2 border-blue-500/50 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
            >
              <Car className="h-4 w-4" />
              {portagensCount} sem portagens
              <Badge
                variant="secondary"
                className="ml-1 bg-blue-500/20 text-blue-700 dark:text-blue-300"
              >
                associar
              </Badge>
            </Button>
          )}
          {bpNaoAssociadasCount > 0 && (
            <Button
              variant="outline"
              onClick={() => setBpNaoAssociadasOpen(true)}
              className="w-full sm:w-auto gap-2 border-green-500/50 text-green-700 hover:bg-green-500/10 dark:text-green-400"
            >
              <Fuel className="h-4 w-4" />
              {bpNaoAssociadasCount} BP sem motorista
              <Badge
                variant="secondary"
                className="ml-1 bg-green-500/20 text-green-700 dark:text-green-300"
              >
                associar
              </Badge>
            </Button>
          )}
          <Button onClick={handleAddMotorista} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Motorista
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card text-card-foreground border rounded-xl p-4 sm:p-5 shadow-sm">
        <h2 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
          Filtros de Pesquisa
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 space-y-1.5">
            <label className="text-sm font-medium">Pesquisa Rápida</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Código, nome, NIF ou telefone..."
                value={searchTerm}
                onChange={(e) => updateFilters({ search: e.target.value })}
                className="pl-9 h-10 bg-background"
              />
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Estado</label>
              <Select value={statusFilter} onValueChange={(v) => updateFilters({ status: v })}>
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativo">Ativos</SelectItem>
                  <SelectItem value="inativo">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Cidade</label>
              <Select value={cidadeFilter} onValueChange={(v) => updateFilters({ cidade: v })}>
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {availableCities.map((cidade) => (
                    <SelectItem key={cidade} value={cidade}>
                      {cidade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Gestor</label>
              <Select value={gestorFilter} onValueChange={(v) => updateFilters({ gestor: v })}>
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {availableGestores.map((gestor) => (
                    <SelectItem key={gestor} value={gestor}>
                      {gestor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Content - Mobile Cards or Desktop Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">A carregar...</div>
      ) : filteredMotoristas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {searchTerm ||
          statusFilter !== 'todos' ||
          cidadeFilter !== 'todas' ||
          gestorFilter !== 'todos'
            ? 'Nenhum motorista encontrado com os filtros aplicados'
            : 'Nenhum motorista cadastrado'}
        </div>
      ) : isMobile ? (
        /* Mobile: Card Grid */
        <div className="grid gap-3">
          {filteredMotoristas.map((motorista) => (
            <MotoristaCard
              key={motorista.id}
              motorista={motorista}
              onClick={() => handleRowClick(motorista)}
            />
          ))}
        </div>
      ) : (
        /* Desktop: Table */
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableHeader column="codigo" label="Cód." className="w-[70px]" />
                <SortableHeader column="nome" label="Nome" />
                <SortableHeader column="telefone" label="Telefone" className="w-[130px]" />
                <SortableHeader
                  column="gestor_responsavel"
                  label="Gestor"
                  className="w-[140px] hidden md:table-cell"
                />
                <SortableHeader
                  column="bolt_id"
                  label="ID Bolt"
                  className="w-[120px] hidden xl:table-cell"
                />
                <SortableHeader
                  column="cidade"
                  label="Cidade"
                  className="w-[120px] hidden lg:table-cell"
                />
                <SortableHeader column="status_ativo" label="Status" className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMotoristas.map((motorista) => (
                <TableRow
                  key={motorista.id}
                  className="cursor-pointer h-10"
                  onClick={() => handleRowClick(motorista)}
                >
                  <TableCell className="py-2 font-mono text-sm text-muted-foreground">
                    {motorista.codigo}
                  </TableCell>
                  <TableCell className="py-2 font-medium">{motorista.nome}</TableCell>
                  <TableCell className="py-2 text-muted-foreground">
                    {motorista.telefone || '-'}
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground hidden md:table-cell">
                    {motorista.gestor_responsavel || '-'}
                  </TableCell>
                  <TableCell className="py-2 text-xs font-mono hidden xl:table-cell">
                    {motorista.bolt_id ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <Check className="h-3 w-3" /> {motorista.bolt_id}
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenMapping(motorista);
                        }}
                      >
                        Não Mapeado
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground hidden lg:table-cell">
                    {motorista.cidade || '-'}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <Badge
                      variant={motorista.status_ativo ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {motorista.status_ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog para Adicionar Motorista */}
      <MotoristaDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        motorista={motoristaToEdit}
        prefill={novaFichaPrefill || undefined}
        onMotoristaCreated={handleMotoristaCreated}
      />

      {/* Dialog: motoristas de plataforma sem ficha */}
      <MotoristasPlataformaNaoAssociados
        open={naoAssociadosOpen}
        onOpenChange={setNaoAssociadosOpen}
        onChanged={() => {
          loadMotoristas();
          loadNaoAssociadosCount();
        }}
        onCriarFicha={({ nome, uberId, boltId }) => {
          setNaoAssociadosOpen(false);
          setMotoristaToEdit(null);
          setNovaFichaPrefill({ nome, bolt_id: boltId, uber_uuid: uberId });
          setIsDialogOpen(true);
        }}
      />

      {/* Dialog: cartões de combustível não reconhecidos */}
      <CartoesNaoReconhecidos
        open={cartoesOpen}
        onOpenChange={setCartoesOpen}
        onChanged={() => {
          loadCartoesCount();
        }}
      />

      {/* Dialog: portagens Via Verde sem motorista associado */}
      <PortagensNaoAssociadas
        open={portagensOpen}
        onOpenChange={setPortagensOpen}
        onChanged={() => {
          loadPortagensCount();
        }}
      />

      {/* Dialog: transações BP sem motorista associado */}
      <BpNaoAssociadas
        open={bpNaoAssociadasOpen}
        onOpenChange={setBpNaoAssociadasOpen}
        onChanged={() => {
          loadBpNaoAssociadasCount();
        }}
      />

      {/* Dialog para Gerar Documentos após criar motorista */}
      <GenerateDocumentsDialog
        open={contractDialogOpen}
        onOpenChange={setContractDialogOpen}
        motorista={newMotoristaForContract}
      />

      {/* Dialog para Mapeamento Manual */}
      <Dialog open={isMappingDialogOpen} onOpenChange={setIsMappingDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mapear Motorista Bolt</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione o nome correspondente que aparece nos relatórios da Bolt para{' '}
              <strong>{mappingTarget?.nome}</strong>.
            </p>

            <div className="max-h-[300px] overflow-y-auto border rounded-md">
              {isMappingLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />A carregar motoristas
                  Bolt...
                </div>
              ) : unmappedBoltDrivers.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum motorista Bolt não mapeado encontrado.
                </div>
              ) : (
                <div className="grid divide-y">
                  {unmappedBoltDrivers
                    .filter((d) => {
                      const mNorm = normalizeStr(mappingTarget?.nome || '');
                      const dNorm = normalizeStr(d.name || '');
                      return (
                        dNorm.includes(mNorm.split(' ')[0]) || mNorm.includes(dNorm.split(' ')[0])
                      );
                    })
                    .map((driver) => (
                      <button
                        key={driver.id}
                        className="p-3 text-left hover:bg-muted transition-colors flex justify-between items-center"
                        onClick={() => handleConfirmMapping(driver.id)}
                      >
                        <span className="text-sm font-medium">{driver.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted-foreground/10 px-1 rounded">
                          {driver.id}
                        </span>
                      </button>
                    ))}
                  {/* Option to show all if no results */}
                  {unmappedBoltDrivers.length > 0 && (
                    <div className="p-2 bg-muted/30 text-[10px] text-center text-muted-foreground">
                      A mostrar apenas sugestões semelhantes.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
