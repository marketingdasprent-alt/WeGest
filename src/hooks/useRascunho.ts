import { useCallback, useEffect, useRef, useState } from 'react';

import { criarStoreIndexedDB, type RascunhoStore } from '@/utils/rascunhoStore';

const storePadrao = criarStoreIndexedDB();

export interface UseRascunhoOpcoes<T> {
  /**
   * Identifica o rascunho. É por viatura/contrato, nunca global — quem começa
   * a folha do carro X e passa para o Y não pode ver os dados trocados.
   * `null` desliga o hook (ex.: diálogo fechado).
   */
  chave: string | null;
  /** Estado actual do formulário. */
  valor: T;
  /** Chamado uma vez, se houver rascunho guardado. */
  restaurar: (valor: T) => void;
  /** Injectável para testes; por omissão vai para IndexedDB. */
  store?: RascunhoStore;
  debounceMs?: number;
}

/**
 * Guarda o formulário enquanto se escreve e devolve-o depois de um refresh.
 *
 * O caso que isto resolve: alguém a meio de uma folha de danos, com fotos já
 * tiradas, recarrega a página sem querer e perde tudo — e as fotos são o que
 * custa a repor, porque implicam voltar à volta do carro.
 *
 * Guarda em IndexedDB (ver rascunhoStore) para os `File` irem inteiros, sem
 * base64 nem o tecto de 5 MB do localStorage.
 */
export function useRascunho<T>({
  chave,
  valor,
  restaurar,
  store = storePadrao,
  debounceMs = 500,
}: UseRascunhoOpcoes<T>) {
  // Estas três vivem em refs porque quem chama costuma criá-las inline: uma
  // identidade nova a cada render punha os efeitos em ciclo.
  const restaurarRef = useRef(restaurar);
  restaurarRef.current = restaurar;

  const valorRef = useRef(valor);
  valorRef.current = valor;

  const storeRef = useRef(store);
  storeRef.current = store;

  // Estado e não ref: quando a leitura termina, a gravação tem de voltar a ser
  // avaliada. Com uma ref não havia novo render e o rascunho só começava a ser
  // guardado à tecla seguinte — num formulário já preenchido, nunca.
  const [pronto, setPronto] = useState<string | null>(null);

  /** Depois de limpar, não se volta a gravar esta chave. */
  const limpoRef = useRef<string | null>(null);

  // ── Restaurar ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chave) return;
    let cancelado = false;

    // Chave nova: o estado anterior deixa de contar.
    setPronto(null);
    limpoRef.current = null;

    void storeRef.current.ler<T>(chave).then((guardado) => {
      if (cancelado) return;
      if (guardado != null) restaurarRef.current(guardado);
      setPronto(chave);
    });

    return () => {
      cancelado = true;
    };
  }, [chave]);

  // ── Guardar (com debounce) ───────────────────────────────────────────────
  useEffect(() => {
    if (!chave) return;
    // Só depois de a leitura ter terminado: senão o estado vazio inicial
    // gravava por cima do rascunho antes de este chegar a ser lido.
    if (pronto !== chave) return;
    if (limpoRef.current === chave) return;

    const id = setTimeout(() => {
      void storeRef.current.guardar(chave, valorRef.current);
    }, debounceMs);

    return () => clearTimeout(id);
  }, [chave, valor, pronto, debounceMs]);

  /**
   * Apagar o rascunho — a chamar quando a submissão passa. Trava gravações
   * seguintes desta chave: o formulário limpa-se logo a seguir a submeter, e
   * sem isto o debounce ressuscitava-o vazio.
   */
  const limpar = useCallback(async () => {
    if (!chave) return;
    limpoRef.current = chave;
    await storeRef.current.apagar(chave);
  }, [chave]);

  return { limpar };
}
