// supabase/functions/_shared/bolt-import-csv/parse.ts
//
// Parser e validação do CSV semanal da Bolt. Extraído de bolt-import-csv/index.ts
// para poder ser testado (Deno.test) fora do handler da edge function.
//
// Porquê validar o cabeçalho de forma bloqueante: em 2026-06-01 e 2026-06-08
// entraram 204 linhas por semana com ganhos_brutos_total = 0,00 EUR. O ficheiro
// vinha com a linha inteira entre aspas, o cabeçalho colapsou numa única coluna,
// nenhuma coluna do COLUMN_MAP foi reconhecida e gravaram-se 408 registos vazios
// sem que nada se queixasse. Sem a coluna do bruto total o ficheiro não vale
// nada — mais vale devolver 422 e não gravar linha nenhuma.

/** Coluna sem a qual o CSV não serve para nada: é o bruto que alimenta o financeiro. */
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
  // O BOM do Excel cola-se ao nome da primeira coluna e estraga o match do
  // COLUMN_MAP — retirar antes de tudo o resto.
  const texto = (csvContent || '').replace(/^\uFEFF/, '');
  const lines = texto.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
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

/** Corta textos longos para caberem numa mensagem de log sem a tornar ilegível. */
function resumir(texto: string, max = 300): string {
  return texto.length <= max ? texto : `${texto.slice(0, max)}…`;
}

/**
 * Valida o cabeçalho ANTES de se gravar seja o que for. Devolve `ok: false`
 * com uma mensagem pronta a ir para bolt_sync_logs e para a resposta 422.
 */
export function validarCabecalho(cabecalho: string[]): ResultadoValidacao {
  const colunas = (cabecalho || []).map((c) => (c || '').trim()).filter((c) => c.length > 0);

  if (colunas.length === 0) {
    return {
      ok: false,
      motivo: 'sem_cabecalho',
      mensagem: 'CSV da Bolt sem linha de cabeçalho — nada foi gravado.',
    };
  }

  // Linha inteira entre aspas (`"Motorista,Email,…"`), variante duplamente
  // escapada do Excel (`"Motorista,""Email"",…"`) ou separador errado (`;`):
  // em qualquer destes casos o cabeçalho vem numa só coluna que ainda traz os
  // separadores lá dentro. Foi este o defeito das semanas a 0,00 EUR.
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
    // Europeu com milhares: 1.234,56
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    // Europeu sem milhares: 1234,56
    normalized = cleaned.replace(',', '.');
  } else {
    // Internacional: 1234.56
    normalized = cleaned;
  }
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

/** Minúsculas, sem acentos, sem pontuação, espaços colapsados. */
export function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chave estável de upsert: COALESCE(identificador_motorista, email, nome normalizado).
 *
 * A chave antiga era só o identificador_motorista, que vem NULL em ~465 linhas.
 * Como o Postgres trata NULLs como distintos entre si, essas linhas nunca
 * entravam em conflito e cada reimportação da mesma semana criava duplicados.
 *
 * Devolve null quando a linha não tem identificador, nem email, nem nome — nesse
 * caso não há forma de a deduplicar e o chamador trata-a como erro.
 */
export function construirChaveMotorista(
  identificador?: string | null,
  email?: string | null,
  nome?: string | null,
): string | null {
  const id = (identificador ?? '').trim();
  if (id) return id;

  const mail = (email ?? '').trim().toLowerCase();
  if (mail) return mail;

  const nomeNormalizado = nome ? normalizeStr(nome) : '';
  return nomeNormalizado || null;
}

// ---------------------------------------------------------------------------
// Ligação ao motorista da WeGest
// ---------------------------------------------------------------------------
//
// Vive aqui, e não dentro de uma edge function, porque o CSV e a API precisam
// exactamente do mesmo emparelhamento: a Bolt não conhece o id do motorista na
// WeGest, só o nome, o telefone e (no CSV) o email. Duas cópias desta cascata
// significavam, mais cedo ou mais tarde, um motorista ligado por uma fonte e
// não pela outra — e uma linha de ganhos sem dono.

export interface MotoristaConhecido {
  id: string;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  bolt_id?: string | null;
}

export interface MatcherMotoristas {
  /** Ligação directa e sem ambiguidade: bolt_id === driver_uuid da API. */
  porBoltId(boltId?: string | null): string | null;
  /** Cascata nome exacto → telefone → email → nome parcial. */
  encontrar(nome?: string | null, telefone?: string | null, email?: string | null): string | null;
}

/** Últimos 9 dígitos — o formato português, sem indicativo nem espaços. */
function digitosTelefone(telefone?: string | null): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '').slice(-9);
  return digitos.length === 9 ? digitos : null;
}

/**
 * Índice de emparelhamento sobre os motoristas de UMA organização.
 *
 * Em caso de nomes/telefones repetidos fica o último da lista, como já
 * acontecia — é indiferente qual, porque um nome repetido dentro da mesma org
 * já é um problema de dados a montante.
 */
export function criarMatcherMotoristas(
  motoristas: readonly MotoristaConhecido[],
): MatcherMotoristas {
  const todos = motoristas ?? [];

  // Índices com detecção de colisão. Uma chave que aponta para mais do que um
  // motorista NÃO identifica ninguém e é descartada.
  //
  // Isto não é hipotético: na Década Ousada há 16 telefones repetidos em duas
  // fichas e um (`910225915`) em SETE — provavelmente um número de escritório
  // copiado para várias fichas. Com `mapa[chave] = id`, ganhava o último a ser
  // escrito, em ordem arbitrária, e mandava o dinheiro para uma ficha à sorte.
  // Descartar é o comportamento certo: o motorista fica por ligar e aparece no
  // aviso do sync, em vez de ser ligado a alguém ao calhas.
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
      return chave ? porBolt[chave] ?? null : null;
    },

    // ORDEM: telefone → email → nome exacto → nome parcial (sem ambiguidade).
    //
    // O telefone vem PRIMEIRO de propósito. A Bolt verifica documentos, por
    // isso o número identifica a pessoa; o nome que a API devolve é curto
    // ("Paulo Silva", "Fernando Pereira") e casa com mais do que um motorista.
    //
    // Antes o nome vinha primeiro e o match parcial escolhia `todos.find` — o
    // PRIMEIRO da lista, por ordem arbitrária. Isso juntou pessoas diferentes
    // na mesma ficha (auditoria 2026-08-12): os ganhos do Paulo Sérgio da
    // Silva #480 foram parar ao Paulo Alexandre Mena Antunes #25, e os do
    // Fernando da Silva Pereira #418 ao Fernando Pereira #313 — em ambos os
    // casos o telefone da Bolt apontava, correctamente, para o outro.
    encontrar(nome?: string | null, telefone?: string | null, email?: string | null): string | null {
      if (!nome && !telefone && !email) return null;

      // 1. Telefone — identificador forte.
      const digitos = digitosTelefone(telefone);
      if (digitos && porTelefone[digitos]) return porTelefone[digitos];

      // 2. Email — também só quando é de um só motorista.
      if (email) {
        const alvo = email.toLowerCase().trim();
        const achados = todos.filter((m) => (m.email ?? '').toLowerCase().trim() === alvo);
        if (achados.length === 1) return achados[0].id;
        if (achados.length > 1) return null;
      }

      const normNome = nome ? normalizeStr(nome) : '';

      // 3. Nome exacto (normalizado).
      if (normNome && porNome[normNome]) return porNome[normNome];

      // 4/5. Nome parcial, nos dois sentidos. `filter` em vez de `find`: com
      // mais do que um candidato o nome NAO chega para decidir, e adivinhar
      // manda dinheiro para a ficha errada. Devolve null e o motorista fica
      // por ligar — visível no aviso do sync, que é o comportamento correcto.
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
          const partesAlvo = normalizeStr(m.nome ?? '').split(' ').filter((p) => p.length > 2);
          if (partesAlvo.length < 2) return false;
          return partesAlvo.every((p) => normNome.includes(p));
        });
        if (inversos.length === 1) return inversos[0].id;
      }

      return null;
    },
  };
}
