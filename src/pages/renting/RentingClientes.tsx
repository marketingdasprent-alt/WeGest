import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Eraser, Plus, Search, SlidersHorizontal, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useClientes } from '@/hooks/useClientes';

import { cn, matchesSearch } from '@/lib/utils';

import type { ClienteComDocumentos } from '@/types/cliente';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-PT');
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso + 'T00:00:00') < new Date();
}

type TipoFiltro = 'todos' | 'particular' | 'empresa' | 'condutor';
type GeneroFiltro = 'todos' | 'M' | 'F' | 'Outro';
type ExpiradoFiltro = 'todos' | 'expirados';

// Chaves dos filtros disponíveis
type FilterKey =
  | 'codigo'
  | 'tipo'
  | 'pais'
  | 'cidade'
  | 'localidade'
  | 'codigo_postal'
  | 'genero'
  | 'nif'
  | 'email'
  | 'telemovel'
  | 'expirados';

// Filtros visíveis por defeito
const DEFAULT_VISIBLE: FilterKey[] = ['codigo', 'tipo', 'pais'];

// Catálogo de filtros disponíveis (para o menu de selecção)
const FILTER_CATALOG: { key: FilterKey; label: string }[] = [
  { key: 'codigo', label: 'Código' },
  { key: 'tipo', label: 'Tipo Cliente' },
  { key: 'pais', label: 'País' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'localidade', label: 'Localidade' },
  { key: 'codigo_postal', label: 'Cód. Postal' },
  { key: 'genero', label: 'Género' },
  { key: 'nif', label: 'NIF' },
  { key: 'email', label: 'Email' },
  { key: 'telemovel', label: 'Telemóvel' },
  { key: 'expirados', label: 'Documentos expirados' },
];

const STORAGE_KEY = 'wegest:clientes:filters-visible';

function loadVisibleFilters(): FilterKey[] {
  if (typeof window === 'undefined') return DEFAULT_VISIBLE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE;
    const valid = parsed.filter((k): k is FilterKey => FILTER_CATALOG.some((f) => f.key === k));
    return valid.length > 0 ? valid : DEFAULT_VISIBLE;
  } catch {
    return DEFAULT_VISIBLE;
  }
}

// Chip de filtro com dropdown (tipo "Label: Valor ▾")
interface FilterChipProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  isDefault: boolean;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, value, options, onChange, isDefault }) => {
  const selected = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 text-xs uppercase tracking-wide font-medium',
            'px-2 py-1 rounded hover:bg-muted/50 transition-colors',
            !isDefault && 'text-primary'
          )}
        >
          <span className="text-muted-foreground">{label}:</span>
          <span className={cn(!isDefault ? 'text-primary' : 'text-foreground')}>
            {selected?.label ?? '—'}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// Filtro tipo "input" (Label: [input])
interface FilterInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: 'numeric' | 'text' | 'email' | 'tel';
  placeholder?: string;
  width?: string;
}

const FilterInput: React.FC<FilterInputProps> = ({
  label,
  value,
  onChange,
  inputMode = 'text',
  placeholder = '—',
  width = 'w-32',
}) => (
  <div className="flex items-center gap-2">
    <span className="text-xs uppercase tracking-wide font-medium text-muted-foreground">
      {label}:
    </span>
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      className={cn('h-7 text-sm', width)}
    />
  </div>
);

const RentingClientes = () => {
  // Pesquisa global
  const [search, setSearch] = useState('');

  // Filtros disponíveis (todos têm estado, mas só os visíveis são renderizados)
  const [codigoFiltro, setCodigoFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos');
  const [paisFiltro, setPaisFiltro] = useState<string>('todos');
  const [cidadeFiltro, setCidadeFiltro] = useState<string>('todos');
  const [localidadeFiltro, setLocalidadeFiltro] = useState<string>('todos');
  const [codigoPostalFiltro, setCodigoPostalFiltro] = useState('');
  const [generoFiltro, setGeneroFiltro] = useState<GeneroFiltro>('todos');
  const [nifFiltro, setNifFiltro] = useState('');
  const [emailFiltro, setEmailFiltro] = useState('');
  const [telemovelFiltro, setTelemovelFiltro] = useState('');
  const [expiradosFiltro, setExpiradosFiltro] = useState<ExpiradoFiltro>('todos');

  // Filtros visíveis na barra (persistido em localStorage)
  const [visibleFilters, setVisibleFilters] = useState<FilterKey[]>(() => loadVisibleFilters());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleFilters));
    } catch {
      // localStorage indisponível — silenciar
    }
  }, [visibleFilters]);

  const toggleFilter = (key: FilterKey) => {
    setVisibleFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const navigate = useNavigate();

  const { data: clientes = [], isLoading } = useClientes();

  // Opções dinâmicas dos selects (extraídas dos dados existentes)
  const paisOptions = useMemo(() => {
    const paises = new Set(clientes.map((c) => c.pais).filter(Boolean) as string[]);
    return [
      { value: 'todos', label: 'Todos' },
      ...Array.from(paises)
        .sort()
        .map((p) => ({ value: p, label: p })),
    ];
  }, [clientes]);

  const cidadeOptions = useMemo(() => {
    const cidades = new Set(clientes.map((c) => c.cidade).filter(Boolean) as string[]);
    return [
      { value: 'todos', label: 'Todas' },
      ...Array.from(cidades)
        .sort()
        .map((c) => ({ value: c, label: c })),
    ];
  }, [clientes]);

  const localidadeOptions = useMemo(() => {
    const locs = new Set(clientes.map((c) => c.localidade).filter(Boolean) as string[]);
    return [
      { value: 'todos', label: 'Todas' },
      ...Array.from(locs)
        .sort()
        .map((l) => ({ value: l, label: l })),
    ];
  }, [clientes]);

  const tipoOptions = [
    { value: 'todos', label: 'Todos' },
    { value: 'particular', label: 'Particular' },
    { value: 'empresa', label: 'Empresa' },
    { value: 'condutor', label: 'Condutor' },
  ];

  const generoOptions = [
    { value: 'todos', label: 'Todos' },
    { value: 'M', label: 'Masculino' },
    { value: 'F', label: 'Feminino' },
    { value: 'Outro', label: 'Outro' },
  ];

  const expiradosOptions = [
    { value: 'todos', label: 'Todos' },
    { value: 'expirados', label: 'Apenas expirados' },
  ];

  // Aplicação dos filtros (só os visíveis afectam o resultado)
  const filtered = useMemo(() => {
    const isVisible = (k: FilterKey) => visibleFilters.includes(k);

    return clientes.filter((c) => {
      if (isVisible('codigo') && codigoFiltro && !c.codigo.toString().includes(codigoFiltro.trim()))
        return false;
      if (isVisible('tipo') && tipoFiltro !== 'todos') {
        const tc = c.tipo_cliente ?? (c.is_empresa ? 'empresa' : 'particular');
        if (tc !== tipoFiltro) return false;
      }
      if (isVisible('pais') && paisFiltro !== 'todos' && c.pais !== paisFiltro) return false;
      if (isVisible('cidade') && cidadeFiltro !== 'todos' && c.cidade !== cidadeFiltro)
        return false;
      if (
        isVisible('localidade') &&
        localidadeFiltro !== 'todos' &&
        c.localidade !== localidadeFiltro
      )
        return false;
      if (
        isVisible('codigo_postal') &&
        codigoPostalFiltro &&
        !(c.codigo_postal || '').includes(codigoPostalFiltro.trim())
      )
        return false;
      if (isVisible('genero') && generoFiltro !== 'todos' && c.genero !== generoFiltro)
        return false;
      if (isVisible('nif') && nifFiltro && !(c.nif || '').includes(nifFiltro.trim())) return false;
      if (isVisible('email') && emailFiltro && !matchesSearch(c.email, emailFiltro)) return false;
      if (
        isVisible('telemovel') &&
        telemovelFiltro &&
        !(c.telefone || '').includes(telemovelFiltro.trim())
      )
        return false;
      if (isVisible('expirados') && expiradosFiltro === 'expirados') {
        const docExpirado = isExpired(c.documentoIdentificacao?.validade ?? null);
        const cartaExpirada = !c.is_empresa && isExpired(c.cartaConducao?.validade ?? null);
        if (!docExpirado && !cartaExpirada) return false;
      }

      // Pesquisa global (sempre activa)
      if (search.trim()) {
        const hit =
          c.codigo.toString().includes(search) ||
          matchesSearch(c.nome, search) ||
          matchesSearch(c.nome_comercial, search) ||
          (c.nif && c.nif.includes(search)) ||
          (c.telefone && c.telefone.includes(search)) ||
          matchesSearch(c.email, search) ||
          matchesSearch(c.morada, search);
        if (!hit) return false;
      }
      return true;
    });
  }, [
    clientes,
    search,
    visibleFilters,
    codigoFiltro,
    tipoFiltro,
    paisFiltro,
    cidadeFiltro,
    localidadeFiltro,
    codigoPostalFiltro,
    generoFiltro,
    nifFiltro,
    emailFiltro,
    telemovelFiltro,
    expiradosFiltro,
  ]);

  const filtrosActivos =
    (visibleFilters.includes('codigo') && !!codigoFiltro.trim()) ||
    (visibleFilters.includes('tipo') && tipoFiltro !== 'todos') ||
    (visibleFilters.includes('pais') && paisFiltro !== 'todos') ||
    (visibleFilters.includes('cidade') && cidadeFiltro !== 'todos') ||
    (visibleFilters.includes('localidade') && localidadeFiltro !== 'todos') ||
    (visibleFilters.includes('codigo_postal') && !!codigoPostalFiltro.trim()) ||
    (visibleFilters.includes('genero') && generoFiltro !== 'todos') ||
    (visibleFilters.includes('nif') && !!nifFiltro.trim()) ||
    (visibleFilters.includes('email') && !!emailFiltro.trim()) ||
    (visibleFilters.includes('telemovel') && !!telemovelFiltro.trim()) ||
    (visibleFilters.includes('expirados') && expiradosFiltro !== 'todos');

  const limparFiltros = () => {
    setCodigoFiltro('');
    setTipoFiltro('todos');
    setPaisFiltro('todos');
    setCidadeFiltro('todos');
    setLocalidadeFiltro('todos');
    setCodigoPostalFiltro('');
    setGeneroFiltro('todos');
    setNifFiltro('');
    setEmailFiltro('');
    setTelemovelFiltro('');
    setExpiradosFiltro('todos');
  };

  const handleNew = () => {
    navigate('/renting/clientes/novo');
  };

  const handleEdit = (cliente: ClienteComDocumentos) => {
    navigate(`/renting/clientes/${cliente.id}`);
  };

  const generoLabel = (g: 'M' | 'F' | 'Outro' | null): string => {
    if (g === 'M') return 'Masc.';
    if (g === 'F') return 'Fem.';
    if (g === 'Outro') return 'Outro';
    return '—';
  };

  // Renderiza um filtro pelo nome (se estiver visível)
  const renderFilter = (key: FilterKey, withSeparator: boolean) => {
    if (!visibleFilters.includes(key)) return null;
    let content: React.ReactNode = null;

    switch (key) {
      case 'codigo':
        content = (
          <FilterInput
            label="Código"
            value={codigoFiltro}
            onChange={setCodigoFiltro}
            inputMode="numeric"
            width="w-24"
          />
        );
        break;
      case 'tipo':
        content = (
          <FilterChip
            label="Tipo Cliente"
            value={tipoFiltro}
            options={tipoOptions}
            onChange={(v) => setTipoFiltro(v as TipoFiltro)}
            isDefault={tipoFiltro === 'todos'}
          />
        );
        break;
      case 'pais':
        content = (
          <FilterChip
            label="País"
            value={paisFiltro}
            options={paisOptions}
            onChange={setPaisFiltro}
            isDefault={paisFiltro === 'todos'}
          />
        );
        break;
      case 'cidade':
        content = (
          <FilterChip
            label="Cidade"
            value={cidadeFiltro}
            options={cidadeOptions}
            onChange={setCidadeFiltro}
            isDefault={cidadeFiltro === 'todos'}
          />
        );
        break;
      case 'localidade':
        content = (
          <FilterChip
            label="Localidade"
            value={localidadeFiltro}
            options={localidadeOptions}
            onChange={setLocalidadeFiltro}
            isDefault={localidadeFiltro === 'todos'}
          />
        );
        break;
      case 'codigo_postal':
        content = (
          <FilterInput
            label="Cód. Postal"
            value={codigoPostalFiltro}
            onChange={setCodigoPostalFiltro}
            inputMode="numeric"
            width="w-28"
          />
        );
        break;
      case 'genero':
        content = (
          <FilterChip
            label="Género"
            value={generoFiltro}
            options={generoOptions}
            onChange={(v) => setGeneroFiltro(v as GeneroFiltro)}
            isDefault={generoFiltro === 'todos'}
          />
        );
        break;
      case 'nif':
        content = (
          <FilterInput
            label="NIF"
            value={nifFiltro}
            onChange={setNifFiltro}
            inputMode="numeric"
            width="w-28"
          />
        );
        break;
      case 'email':
        content = (
          <FilterInput
            label="Email"
            value={emailFiltro}
            onChange={setEmailFiltro}
            inputMode="email"
            width="w-40"
          />
        );
        break;
      case 'telemovel':
        content = (
          <FilterInput
            label="Telemóvel"
            value={telemovelFiltro}
            onChange={setTelemovelFiltro}
            inputMode="tel"
            width="w-32"
          />
        );
        break;
      case 'expirados':
        content = (
          <FilterChip
            label="Documentos"
            value={expiradosFiltro}
            options={expiradosOptions}
            onChange={(v) => setExpiradosFiltro(v as ExpiradoFiltro)}
            isDefault={expiradosFiltro === 'todos'}
          />
        );
        break;
    }

    return (
      <>
        {withSeparator && <div className="h-5 w-px bg-border" />}
        {content}
      </>
    );
  };

  // Ordem em que os filtros aparecem (segue ordem do catálogo)
  const renderableFilters = FILTER_CATALOG.filter((f) => visibleFilters.includes(f.key));

  return (
    <div className="w-full">
      <StickyPageHeader
        title="Clientes"
        description={
          isLoading
            ? 'A carregar...'
            : `${filtered.length} cliente${filtered.length !== 1 ? 's' : ''}`
        }
        icon={Users}
      >
        <Button onClick={handleNew} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Novo Cliente
        </Button>
      </StickyPageHeader>

      {/* Pesquisa global */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por nome, NIF, telemóvel, email ou morada..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {/* Barra de filtros — scroll horizontal quando muitos filtros activos */}
      <div className="mb-4 border rounded-lg bg-muted/20 flex items-center">
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="flex items-center gap-3 py-2 px-3 whitespace-nowrap">
            {renderableFilters.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">
                Sem filtros activos — usa o botão "Filtros" à direita para adicionar.
              </span>
            ) : (
              renderableFilters.map((f, idx) => (
                <span key={f.key} className="flex items-center gap-3 shrink-0">
                  {renderFilter(f.key, idx > 0)}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Acções (Limpar + Filtros) — sempre visíveis à direita */}
        <div className="flex items-center gap-2 px-3 border-l shrink-0">
          {filtrosActivos && (
            <button
              type="button"
              onClick={limparFiltros}
              className="flex items-center gap-1.5 text-xs uppercase tracking-wide font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted/50"
            >
              <Eraser className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Limpar</span>
            </button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs uppercase tracking-wide font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted/50"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filtros</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {visibleFilters.length}
                </Badge>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={4}
              collisionPadding={16}
              className="w-60 p-0 flex flex-col max-h-[280px]"
            >
              <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground px-3 py-2 border-b shrink-0">
                Mostrar filtros
              </p>
              <div className="overflow-y-auto p-2 space-y-0.5">
                {FILTER_CATALOG.map((f) => {
                  const checked = visibleFilters.includes(f.key);
                  return (
                    <label
                      key={f.key}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleFilter(f.key)} />
                      <span>{f.label}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Estados */}
      {isLoading ? (
        <div className="border rounded-lg overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-b-0">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg flex flex-col items-center justify-center py-16 gap-3">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {search || filtrosActivos
              ? 'Nenhum cliente encontrado com estes filtros'
              : 'Ainda não há clientes registados'}
          </p>
          {!search && !filtrosActivos && (
            <Button onClick={handleNew} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar primeiro cliente
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto w-full max-w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Cód.</TableHead>
                <TableHead className="w-24">Tipo</TableHead>
                <TableHead className="min-w-[180px]">Nome</TableHead>
                <TableHead className="w-20">Género</TableHead>
                <TableHead className="min-w-[180px]">Morada</TableHead>
                <TableHead className="w-24">Cód. Postal</TableHead>
                <TableHead className="min-w-[120px]">Localidade</TableHead>
                <TableHead className="min-w-[120px]">Cidade</TableHead>
                <TableHead className="w-24">País</TableHead>
                <TableHead className="min-w-[140px]">Telemóvel</TableHead>
                <TableHead className="min-w-[160px]">Email</TableHead>
                <TableHead className="w-24">NIF</TableHead>
                <TableHead className="w-28">Val. Doc.</TableHead>
                <TableHead className="w-28">Val. Carta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cliente) => (
                <TableRow
                  key={cliente.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleEdit(cliente)}
                >
                  <TableCell className="font-mono text-sm">{cliente.codigo}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        cliente.tipo_cliente === 'empresa'
                          ? 'default'
                          : cliente.tipo_cliente === 'condutor'
                            ? 'outline'
                            : 'secondary'
                      }
                      className="text-xs"
                    >
                      {cliente.tipo_cliente === 'empresa'
                        ? 'Empresa'
                        : cliente.tipo_cliente === 'condutor'
                          ? 'Condutor'
                          : 'Particular'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {cliente.nome}
                    {cliente.is_empresa && cliente.nome_comercial && (
                      <span className="block text-xs text-muted-foreground">
                        {cliente.nome_comercial}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {cliente.is_empresa ? (
                      <span className="text-xs">N/A</span>
                    ) : (
                      generoLabel(cliente.genero)
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {cliente.morada || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {cliente.codigo_postal || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {cliente.localidade || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {cliente.cidade || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {cliente.pais || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {cliente.telefone || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {cliente.email || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {cliente.nif || '—'}
                  </TableCell>
                  <TableCell>
                    {cliente.documentoIdentificacao?.validade ? (
                      isExpired(cliente.documentoIdentificacao.validade) ? (
                        <Badge variant="destructive" className="text-xs">
                          {formatDate(cliente.documentoIdentificacao.validade)}
                        </Badge>
                      ) : (
                        <span className="text-sm">
                          {formatDate(cliente.documentoIdentificacao.validade)}
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {cliente.is_empresa ? (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    ) : cliente.cartaConducao?.validade ? (
                      isExpired(cliente.cartaConducao.validade) ? (
                        <Badge variant="destructive" className="text-xs">
                          {formatDate(cliente.cartaConducao.validade)}
                        </Badge>
                      ) : (
                        <span className="text-sm">
                          {formatDate(cliente.cartaConducao.validade)}
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default RentingClientes;
