import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { guardar, lerGuardado } from './useEstadoPersistido';

interface Parametros {
  /** Guardados na sessão: pesquisa e filtros. */
  filtros: readonly string[];
  /** Guardados para sempre: coluna e sentido da ordenação. */
  ordenacao: readonly string[];
}

/**
 * Junta ao endereço os filtros e a ordenação guardados. Cada grupo só se repõe
 * se o endereço não trouxer nenhum dele: uma ligação com ?search=… não ganha
 * filtros antigos que escondessem o que se procura.
 */
export function parametrosARestaurar(
  actuais: URLSearchParams,
  sessao: string | null,
  local: string | null,
  { filtros, ordenacao }: Parametros
): URLSearchParams | null {
  const guardadosSessao = new URLSearchParams(sessao ?? '');
  const guardadosLocal = new URLSearchParams(local ?? '');
  const proximos = new URLSearchParams(actuais);
  let mudou = false;
  const repor = (nomes: readonly string[], origem: URLSearchParams) => {
    if (nomes.some((nome) => actuais.has(nome))) return;
    for (const nome of nomes) {
      const valor = origem.get(nome);
      if (valor) {
        proximos.set(nome, valor);
        mudou = true;
      }
    }
  };
  repor(filtros, guardadosSessao);
  repor(ordenacao, guardadosLocal);
  return mudou ? proximos : null;
}

/** Só os parâmetros listados, para nunca trazer de volta outra coisa (ex.: um diálogo aberto). */
export function soEstes(params: URLSearchParams, nomes: readonly string[]): string {
  const filtrados = new URLSearchParams();
  for (const nome of nomes) {
    const valor = params.get(nome);
    if (valor) filtrados.set(nome, valor);
  }
  return filtrados.toString();
}

/**
 * Para páginas que guardam os filtros no endereço (?search=…&sort=…). O
 * endereço sobrevive ao "voltar" do browser, mas não a entrar pelo menu, que
 * abre a página limpa. Aqui guarda-se cada mudança e, ao entrar com o
 * endereço limpo, repõe-se o que estava.
 */
export function useFiltrosDaUrlPersistidos(chave: string, parametros: Parametros): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const restaurou = useRef(false);

  useEffect(() => {
    if (!restaurou.current) {
      restaurou.current = true;
      const proximos = parametrosARestaurar(
        searchParams,
        lerGuardado(chave, 'sessao'),
        lerGuardado(`${chave}:ordenacao`, 'local'),
        parametros
      );
      if (proximos) {
        setSearchParams(proximos, { replace: true });
        return;
      }
    }
    guardar(chave, 'sessao', soEstes(searchParams, parametros.filtros));
    const ordem = soEstes(searchParams, parametros.ordenacao);
    if (ordem) guardar(`${chave}:ordenacao`, 'local', ordem);
    // `parametros` é uma lista fixa de cada página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, searchParams, setSearchParams]);
}
