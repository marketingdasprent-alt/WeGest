/**
 * Armazenamento de rascunhos de formulários.
 *
 * PORQUE INDEXEDDB E NÃO localStorage
 * O padrão que já existia (utils/entrega.ts, página do QR) guarda fotos em
 * localStorage como base64. Uma foto de telemóvel são ~3 MB, que em base64
 * passam a ~4 MB, e o localStorage tem um tecto de ~5 MB por origem — ou seja,
 * numa folha de danos com meia dúzia de fotos aquele cache estoira em silêncio.
 *
 * O IndexedDB guarda objectos `File` e `Blob` nativamente, por structured
 * clone: sem conversão, sem inflação de 33%, sem tecto prático. É a razão de
 * ser deste módulo.
 *
 * O acesso é por interface para o hook poder ser testado contra memória — o
 * jsdom não implementa IndexedDB e não vale a pena uma dependência só para
 * isso.
 */

export interface RascunhoStore {
  ler<T>(chave: string): Promise<T | null>;
  guardar<T>(chave: string, valor: T): Promise<void>;
  apagar(chave: string): Promise<void>;
}

const DB_NOME = 'wegest-rascunhos';
const DB_VERSAO = 1;
const LOJA = 'rascunhos';

/** Quanto tempo um rascunho sobrevive sem ser tocado. */
export const VALIDADE_DIAS = 7;

interface Envelope<T> {
  valor: T;
  guardadoEm: number;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(LOJA)) req.result.createObjectStore(LOJA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transacao<T>(
  modo: IDBTransactionMode,
  fn: (loja: IDBObjectStore) => IDBRequest
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(LOJA, modo);
        const req = fn(tx.objectStore(LOJA));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      })
  );
}

/**
 * Store real. Nunca rejeita: um rascunho perdido é um contratempo, um ecrã em
 * branco por causa de uma excepção de armazenamento é um bug. Em navegação
 * privada ou com quota esgotada, degrada para "não guarda" em silêncio.
 */
export function criarStoreIndexedDB(): RascunhoStore {
  const disponivel = typeof indexedDB !== 'undefined';

  return {
    async ler<T>(chave: string): Promise<T | null> {
      if (!disponivel) return null;
      try {
        const env = await transacao<Envelope<T> | undefined>('readonly', (l) => l.get(chave));
        if (!env) return null;
        if (Date.now() - env.guardadoEm > VALIDADE_DIAS * 24 * 60 * 60 * 1000) {
          void this.apagar(chave);
          return null;
        }
        return env.valor;
      } catch {
        return null;
      }
    },

    async guardar<T>(chave: string, valor: T): Promise<void> {
      if (!disponivel) return;
      try {
        const env: Envelope<T> = { valor, guardadoEm: Date.now() };
        await transacao('readwrite', (l) => l.put(env, chave));
      } catch {
        /* quota cheia ou navegação privada — o formulário continua a funcionar */
      }
    },

    async apagar(chave: string): Promise<void> {
      if (!disponivel) return;
      try {
        await transacao('readwrite', (l) => l.delete(chave));
      } catch {
        /* idem */
      }
    },
  };
}

/** Store em memória — para testes, e para quando o IndexedDB não existe. */
export function criarStoreMemoria(): RascunhoStore {
  const mapa = new Map<string, unknown>();
  return {
    ler: <T>(chave: string) => Promise.resolve((mapa.get(chave) as T) ?? null),
    guardar: <T>(chave: string, valor: T) => {
      mapa.set(chave, valor);
      return Promise.resolve();
    },
    apagar: (chave: string) => {
      mapa.delete(chave);
      return Promise.resolve();
    },
  };
}
