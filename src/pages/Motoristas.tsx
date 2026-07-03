import { useState, useMemo } from 'react';
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
import { MotoristaFullModal } from '@/components/motoristas/MotoristaFullModal';
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
import { useToast } from '@/hooks/use-toast';
import { MotoristaDetailsDrawer } from '@/components/motoristas/MotoristaDetailsDrawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';
import { cn, normalizeString } from '@/lib/utils';
import { useMotoristas } from '@/hooks/useMotoristas';
import {
  useCartoesNaoAssociadosCount,
  useBpNaoAssociadasCount,
  usePortagensNaoAssociadasCount,
} from '@/hooks/useMotoristasNaoAssociadosCounts';
import {
  useMotoristasPlataformaNaoAssociadosCount,
  useUnmappedBoltDrivers,
  useMapearMotoristaBolt,
  useSincronizarMotoristasPlataformaIds,
} from '@/hooks/useMotoristasPlataformaSync';

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
  const motoristasQuery = useMotoristas();
  const motoristas = useMemo(() => motoristasQuery.data ?? [], [motoristasQuery.data]);

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
  const unmappedBoltDriversQuery = useUnmappedBoltDrivers(isMappingDialogOpen);
  const unmappedBoltDrivers = unmappedBoltDriversQuery.data ?? [];
  const isMappingLoading = unmappedBoltDriversQuery.isLoading;
  const mapearMotoristaBolt = useMapearMotoristaBolt();
  const sincronizarIds = useSincronizarMotoristasPlataformaIds();
  const [naoAssociadosOpen, setNaoAssociadosOpen] = useState(false);
  const naoAssociadosCountQuery = useMotoristasPlataformaNaoAssociadosCount();
  const naoAssociadosCount = naoAssociadosCountQuery.data ?? 0;
  const [cartoesOpen, setCartoesOpen] = useState(false);
  const cartoesCountQuery = useCartoesNaoAssociadosCount();
  const cartoesCount = cartoesCountQuery.data ?? 0;
  const [portagensOpen, setPortagensOpen] = useState(false);
  const portagensCountQuery = usePortagensNaoAssociadasCount();
  const portagensCount = portagensCountQuery.data ?? 0;
  const [bpNaoAssociadasOpen, setBpNaoAssociadasOpen] = useState(false);
  const bpNaoAssociadasCountQuery = useBpNaoAssociadasCount();
  const bpNaoAssociadasCount = bpNaoAssociadasCountQuery.data ?? 0;
  const [novaFichaPrefill, setNovaFichaPrefill] = useState<{
    nome?: string;
    bolt_id?: string;
    uber_uuid?: string;
  } | null>(null);

  const loading = motoristasQuery.isLoading || sincronizarIds.isPending;

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

  const { page, setPage, totalPages, total, pageItems, start, end } = usePagination(
    filteredMotoristas,
    50,
    `${searchTerm}|${statusFilter}|${cidadeFilter}|${gestorFilter}`
  );

  const handleRowClick = (motorista: Motorista) => {
    navigate(`/motoristas/${motorista.id}`, {
      state: { listaUrl: window.location.pathname + window.location.search },
    });
  };

  const handleMotoristaUpdated = () => {
    motoristasQuery.refetch();
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
      motoristasQuery.refetch();
      naoAssociadosCountQuery.refetch();
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

  const handleOpenMapping = (motorista: Motorista) => {
    setMappingTarget(motorista);
    setIsMappingDialogOpen(true);
  };

  const handleConfirmMapping = (boltId: string) => {
    if (!mappingTarget) return;
    mapearMotoristaBolt.mutate(
      { motoristaId: mappingTarget.id, boltId },
      { onSuccess: () => setIsMappingDialogOpen(false) }
    );
  };

  const handleSyncIDs = () => {
    toast({
      title: 'A iniciar sincronização v2.0',
      description: 'A aplicar lógica de comparação avançada...',
    });
    sincronizarIds.mutate();
  };

  const handleMotoristaCreated = (motorista: Motorista) => {
    // Fechar primeiro o modal de criação (evita dois modais sobrepostos), depois
    // abrir o de gerar documentos já apontado ao motorista recém-criado.
    setIsDialogOpen(false);
    setMotoristaToEdit(null);
    setNovaFichaPrefill(null);
    setNewMotoristaForContract(motorista);
    setContractDialogOpen(true);
    motoristasQuery.refetch();
    // Se foi criado a partir do fluxo "criar ficha" (prefill de bolt_id/uber_uuid),
    // o badge "X sem ficha" tem de refletir que esta pessoa deixou de estar pendente.
    naoAssociadosCountQuery.refetch();
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
          {pageItems.map((motorista) => (
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
              {pageItems.map((motorista) => (
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

      {!loading && total > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          total={total}
          start={start}
          end={end}
          onPageChange={setPage}
          noun={['motorista', 'motoristas']}
        />
      )}

      {/* Modal grande para Adicionar Motorista (mesmo modal da edição, em modo criação) */}
      <MotoristaFullModal
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        motorista={motoristaToEdit}
        isCreating
        prefill={novaFichaPrefill || undefined}
        onMotoristaCreated={handleMotoristaCreated}
      />

      {/* Dialog: motoristas de plataforma sem ficha */}
      <MotoristasPlataformaNaoAssociados
        open={naoAssociadosOpen}
        onOpenChange={setNaoAssociadosOpen}
        onChanged={() => {
          motoristasQuery.refetch();
          naoAssociadosCountQuery.refetch();
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
          cartoesCountQuery.refetch();
        }}
      />

      {/* Dialog: portagens Via Verde sem motorista associado */}
      <PortagensNaoAssociadas
        open={portagensOpen}
        onOpenChange={setPortagensOpen}
        onChanged={() => {
          portagensCountQuery.refetch();
        }}
      />

      {/* Dialog: transações BP sem motorista associado */}
      <BpNaoAssociadas
        open={bpNaoAssociadasOpen}
        onOpenChange={setBpNaoAssociadasOpen}
        onChanged={() => {
          bpNaoAssociadasCountQuery.refetch();
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
