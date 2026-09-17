export const COLUNA_GANHOS_BRUTOS = 'Ganhos brutos (total)|€';

export interface CsvBolt {
  cabecalho: string[];
  linhas: Record<string, string>[];
}

export type MotivoCabecalhoInvalido =
  | 'sem_cabecalho'
  | 'cabecalho_nao_separado'
  | 'coluna_obrigatoria_em_falta';

export type ResultadoValidacao =
  | { ok: true }
  | { ok: false; motivo: MotivoCabecalhoInvalido; mensagem: string };

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSV(csvContent: string): CsvBolt {
  const texto = (csvContent || '').replace(/^\uFEFF/, '');
  const lines = texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { cabecalho: [], linhas: [] };

  const cabecalho = parseCSVLine(lines[0]).map((h) => h.trim());
  const linhas: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    cabecalho.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    linhas.push(row);
  }

  return { cabecalho, linhas };
}

function resumir(texto: string, max = 300): string {
  return texto.length <= max ? texto : `${texto.slice(0, max)}…`;
}

export function validarCabecalho(cabecalho: string[]): ResultadoValidacao {
  const colunas = (cabecalho || []).map((c) => (c || '').trim()).filter((c) => c.length > 0);

  if (colunas.length === 0) {
    return {
      ok: false,
      motivo: 'sem_cabecalho',
      mensagem: 'CSV da Bolt sem linha de cabeçalho — nada foi gravado.',
    };
  }

  if (colunas.length === 1 && /[,;\t]/.test(colunas[0])) {
    return {
      ok: false,
      motivo: 'cabecalho_nao_separado',
      mensagem:
        'Cabeçalho do CSV da Bolt veio numa única coluna (linha inteira entre aspas ou ' +
        'separador errado) — nenhuma coluna foi reconhecida e nada foi gravado. ' +
        `Cabeçalho lido: "${resumir(colunas[0])}".`,
    };
  }

  if (!colunas.includes(COLUNA_GANHOS_BRUTOS)) {
    return {
      ok: false,
      motivo: 'coluna_obrigatoria_em_falta',
      mensagem:
        `Coluna obrigatória "${COLUNA_GANHOS_BRUTOS}" não existe no CSV da Bolt — nada foi ` +
        `gravado. Colunas lidas (${colunas.length}): ${resumir(colunas.join(' | '))}.`,
    };
  }

  return { ok: true };
}

export function parseNumber(value: string): number {
  if (!value || value === '-' || value === '') return 0;
  const cleaned = value.replace(/\s/g, '');
  let normalized: string;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  } else {
    normalized = cleaned;
  }
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

export function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function construirChaveMotorista(
  identificador?: string | null,
  email?: string | null,
  nome?: string | null
): string | null {
  const id = (identificador ?? '').trim();
  if (id) return id;

  const mail = (email ?? '').trim().toLowerCase();
  if (mail) return mail;

  const nomeNormalizado = nome ? normalizeStr(nome) : '';
  return nomeNormalizado || null;
}

export interface MotoristaConhecido {
  id: string;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  bolt_id?: string | null;
}

export interface MatcherMotoristas {
  porBoltId(boltId?: string | null): string | null;
  encontrar(nome?: string | null, telefone?: string | null, email?: string | null): string | null;
}

function digitosTelefone(telefone?: string | null): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '').slice(-9);
  return digitos.length === 9 ? digitos : null;
}

export function criarMatcherMotoristas(
  motoristas: readonly MotoristaConhecido[]
): MatcherMotoristas {
  const todos = motoristas ?? [];

  const indexar = (pares: Array<[string, string]>): Record<string, string> => {
    const mapa: Record<string, string> = {};
    const ambiguas = new Set<string>();
    for (const [chave, id] of pares) {
      if (ambiguas.has(chave)) continue;
      const jaLa = mapa[chave];
      if (jaLa && jaLa !== id) {
        delete mapa[chave];
        ambiguas.add(chave);
        continue;
      }
      mapa[chave] = id;
    }
    return mapa;
  };

  const paresNome: Array<[string, string]> = [];
  const paresTelefone: Array<[string, string]> = [];
  const paresBolt: Array<[string, string]> = [];

  for (const m of todos) {
    if (!m?.id) continue;

    const nome = normalizeStr(m.nome ?? '');
    if (nome) paresNome.push([nome, m.id]);

    const digitos = digitosTelefone(m.telefone);
    if (digitos) paresTelefone.push([digitos, m.id]);

    const bolt = (m.bolt_id ?? '').trim();
    if (bolt) paresBolt.push([bolt, m.id]);
  }

  const porNome = indexar(paresNome);
  const porTelefone = indexar(paresTelefone);
  const porBolt = indexar(paresBolt);

  return {
    porBoltId(boltId?: string | null): string | null {
      const chave = (boltId ?? '').trim();
      return chave ? (porBolt[chave] ?? null) : null;
    },

    encontrar(
      nome?: string | null,
      telefone?: string | null,
      email?: string | null
    ): string | null {
      if (!nome && !telefone && !email) return null;

      const digitos = digitosTelefone(telefone);
      if (digitos && porTelefone[digitos]) return porTelefone[digitos];

      if (email) {
        const alvo = email.toLowerCase().trim();
        const achados = todos.filter((m) => (m.email ?? '').toLowerCase().trim() === alvo);
        if (achados.length === 1) return achados[0].id;
        if (achados.length > 1) return null;
      }

      const normNome = nome ? normalizeStr(nome) : '';

      if (normNome && porNome[normNome]) return porNome[normNome];

      if (normNome) {
        const partes = normNome.split(' ').filter((p) => p.length > 2);
        if (partes.length >= 2) {
          const achados = todos.filter((m) => {
            const alvo = normalizeStr(m.nome ?? '');
            return alvo ? partes.every((p) => alvo.includes(p)) : false;
          });
          if (achados.length === 1) return achados[0].id;
          if (achados.length > 1) return null;
        }

        const inversos = todos.filter((m) => {
          const partesAlvo = normalizeStr(m.nome ?? '')
            .split(' ')
            .filter((p) => p.length > 2);
          if (partesAlvo.length < 2) return false;
          return partesAlvo.every((p) => normNome.includes(p));
        });
        if (inversos.length === 1) return inversos[0].id;
      }

      return null;
    },
  };
}
