import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type SearchEntity = 'motorista' | 'viatura' | 'contrato' | 'reserva' | 'cliente';

export interface SearchResult {
  id: string;
  label: string;
  /** Texto secundário (ex.: matrícula, NIF) */
  subtitle?: string;
  entity: SearchEntity;
  /** Rota de navegação para o detalhe da entidade */
  href: string;
}

export type GlobalSearchResults = Record<SearchEntity, SearchResult[]>;

// ─── Configuração por entidade (pure data — testável) ───────────────────────

interface EntityConfig {
  /** Tabela/view no Supabase */
  table: string;
  /** Coluna de pesquisa (ILIKE). Para números, usa cast `coluna::text`. */
  searchColumn: string;
  /** Colunas a seleccionar (mínimo para label + id) */
  select: string;
  /** Heading do grupo no CommandMenu */
  heading: string;
  /** Constrói o label a partir da row */
  label: (row: Record<string, unknown>) => string;
  /** Constrói o subtitle opcional */
  subtitle?: (row: Record<string, unknown>) => string | undefined;
  /** Constrói a rota de navegação */
  href: (id: string) => string;
}

export const ENTITY_CONFIG: Record<SearchEntity, EntityConfig> = {
  motorista: {
    table: 'motoristas_ativos',
    searchColumn: 'nome',
    select: 'id, nome, nif',
    heading: 'Motoristas',
    label: (row) => String(row.nome ?? ''),
    subtitle: (row) => {
      const nif = row.nif as string | null;
      return nif ? `NIF: ${nif}` : undefined;
    },
    href: (id) => `/motoristas/${id}`,
  },
  viatura: {
    table: 'viaturas',
    searchColumn: 'matricula',
    select: 'id, matricula, marca, modelo',
    heading: 'Viaturas',
    label: (row) => String(row.matricula ?? ''),
    subtitle: (row) => {
      const marca = row.marca as string | null;
      const modelo = row.modelo as string | null;
      return [marca, modelo].filter(Boolean).join(' ') || undefined;
    },
    href: (id) => `/viaturas/${id}`,
  },
  contrato: {
    table: 'contratos_renting',
    searchColumn: 'codigo::text',
    select: 'id, codigo, matricula, cliente_id',
    heading: 'Contratos',
    label: (row) => `Contrato #${row.codigo}`,
    subtitle: (row) => {
      const matricula = row.matricula as string | null;
      return matricula ?? undefined;
    },
    href: (id) => `/renting/contratos/${id}`,
  },
  reserva: {
    table: 'reservas',
    searchColumn: 'codigo::text',
    select: 'id, codigo, cliente_nome, matricula',
    heading: 'Reservas',
    label: (row) => `Reserva #${row.codigo}`,
    subtitle: (row) => {
      const nome = row.cliente_nome as string | null;
      return nome ?? undefined;
    },
    href: (id) => `/renting/reservas/${id}`,
  },
  cliente: {
    table: 'clientes',
    searchColumn: 'nome',
    select: 'id, nome, nif',
    heading: 'Clientes',
    label: (row) => String(row.nome ?? ''),
    subtitle: (row) => {
      const nif = row.nif as string | null;
      return nif ? `NIF: ${nif}` : undefined;
    },
    href: (id) => `/renting/clientes/${id}`,
  },
};

/** Todas as entidades pesquisáveis, por ordem de prioridade */
export const ALL_ENTITIES: SearchEntity[] = [
  'motorista',
  'viatura',
  'contrato',
  'reserva',
  'cliente',
];

// ─── Funções puras (testáveis) ──────────────────────────────────────────────

/**
 * Constrói o pattern ILIKE a partir do termo de pesquisa.
 * Escapa caracteres especiais de SQL LIKE (_, %) e envolve em wildcards.
 */
export function buildSearchPattern(term: string): string {
  // Escapa wildcards de SQL LIKE para correspondência literal
  const escaped = term.replace(/[%_\\]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}

/**
 * Mapeia uma row da BD para um SearchResult.
 * Retorna null se a row não tiver id (ignora resultados inválidos).
 */
export function mapRowToSearchResult(
  entity: SearchEntity,
  row: Record<string, unknown>
): SearchResult | null {
  const config = ENTITY_CONFIG[entity];
  const id = row.id as string | null | undefined;
  if (!id) return null;

  return {
    id,
    label: config.label(row),
    subtitle: config.subtitle?.(row),
    entity,
    href: config.href(id),
  };
}

/**
 * Conta o total de resultados em todos os grupos.
 */
export function countResults(results: GlobalSearchResults): number {
  return ALL_ENTITIES.reduce((sum, entity) => sum + results[entity].length, 0);
}

// ─── Hook ───────────────────────────────────────────────────────────────────

const MAX_RESULTS_PER_ENTITY = 5;
const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 300;

interface UseGlobalSearchOptions {
  /** Termo de pesquisa (será debounced internamente) */
  term: string;
  /** Entidades a pesquisar (default: todas) */
  entities?: SearchEntity[];
  /** Se false, a query não executa */
  enabled?: boolean;
}

/**
 * Pesquisa global em 5 entidades (motorista, viatura, contrato, reserva, cliente).
 *
 * Usa debounce (300ms) + React Query com `enabled: term.length >= 2`.
 * Retorna resultados agrupados por entidade, máx 5 por entidade.
 */
export function useGlobalSearch(options: UseGlobalSearchOptions) {
  const { term, entities = ALL_ENTITIES, enabled = true } = options;
  const debouncedTerm = useDebouncedValue(term, DEBOUNCE_MS);

  const searchEnabled = enabled && debouncedTerm.trim().length >= MIN_SEARCH_LENGTH;

  return useQuery({
    queryKey: ['search', debouncedTerm, entities] as const,
    queryFn: async (): Promise<GlobalSearchResults> => {
      const pattern = buildSearchPattern(debouncedTerm.trim());

      // Pesquisa todas as entidades em paralelo — allSettled para que uma falha
      // não impeça as outras de retornarem
      const settled = await Promise.allSettled(
        entities.map(async (entity) => {
          const config = ENTITY_CONFIG[entity];
          const { data, error } = await supabase
            .from(config.table as never)
            .select(config.select)
            .ilike(config.searchColumn, pattern)
            .is('deleted_at', null)
            .limit(MAX_RESULTS_PER_ENTITY);

          if (error) throw error;

          const rows = (data ?? []) as unknown as Record<string, unknown>[];
          return rows
            .map((row) => mapRowToSearchResult(entity, row))
            .filter((r): r is SearchResult => r !== null);
        })
      );

      // Monta o resultado agrupado — entidades que falharam ficam com array vazio
      const results = {} as GlobalSearchResults;
      for (const entity of ALL_ENTITIES) {
        results[entity] = [];
      }

      entities.forEach((entity, index) => {
        const result = settled[index];
        if (result?.status === 'fulfilled') {
          results[entity] = result.value;
        }
        // rejected → fica com [] (já inicializado)
      });

      return results;
    },
    enabled: searchEnabled,
  });
}
