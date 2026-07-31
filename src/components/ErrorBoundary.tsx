import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Fronteira de erro de render.
 *
 * Antes de existir, um erro a renderizar qualquer componente levava a aplicação
 * inteira a ecrã branco — sem mensagem, sem registo e sem forma de recuperar a
 * não ser recarregar a página.
 *
 * Tem de ser um componente de classe: `componentDidCatch` e
 * `getDerivedStateFromError` não têm equivalente em hooks, e é a única forma
 * suportada em React de apanhar um erro de render.
 *
 * **O que NÃO apanha** — e é importante não prometer ao utilizador o que não
 * cobre: erros em handlers de eventos, em código assíncrono (incluindo o que
 * corre dentro do React Query) e em `setTimeout`. Esses continuam a ser tratados
 * onde acontecem, normalmente por toast.
 */

interface FallbackProps {
  erro: Error;
  reset: () => void;
}

interface Props {
  children: ReactNode;
  /**
   * Quando muda de valor, a fronteira limpa o erro e tenta renderizar de novo.
   * Nas rotas passa-se o pathname: navegar para outro lado recupera sozinho, em
   * vez de deixar o utilizador preso no ecrã de erro.
   */
  resetKey?: string | number;
  /** Identifica a fronteira nos registos — sem isto não se sabe onde rebentou. */
  origem?: string;
  /** Ecrã alternativo. Sem isto usa-se o ecrã por omissão, de página inteira. */
  fallback?: (props: FallbackProps) => ReactNode;
}

interface State {
  erro: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo): void {
    // O React já escreve o erro na consola; o que falta é o contexto de onde
    // aconteceu, que é o que permite reproduzi-lo.
    console.error(`[ErrorBoundary${this.props.origem ? ` · ${this.props.origem}` : ''}]`, erro, {
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(anterior: Props): void {
    if (this.state.erro !== null && anterior.resetKey !== this.props.resetKey) {
      this.setState({ erro: null });
    }
  }

  private reset = (): void => {
    this.setState({ erro: null });
  };

  render(): ReactNode {
    const { erro } = this.state;
    if (erro === null) return this.props.children;

    if (this.props.fallback) return this.props.fallback({ erro, reset: this.reset });

    return <EcraDeErro erro={erro} reset={this.reset} />;
  }
}

/**
 * Ecrã por omissão. Diz o que aconteceu em linguagem de utilizador e oferece as
 * duas saídas que fazem sentido — tentar outra vez, ou sair dali.
 *
 * Nunca mostra a stack trace: não ajuda quem está a usar o produto e passa a
 * ideia de software inacabado. O detalhe técnico vai para a consola.
 */
function EcraDeErro({ erro, reset }: FallbackProps) {
  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>

      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Esta secção não conseguiu abrir</h2>
        <p className="text-sm text-muted-foreground">
          Houve um erro inesperado ao mostrar esta página. O resto da aplicação continua a funcionar
          — pode tentar de novo ou voltar ao início.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset} variant="default">
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Tentar de novo
        </Button>
        <Button onClick={() => (window.location.href = '/')} variant="outline">
          <Home className="mr-2 h-4 w-4" aria-hidden="true" />
          Voltar ao início
        </Button>
      </div>

      {import.meta.env.DEV && (
        <p className="mt-2 max-w-lg font-mono text-xs text-muted-foreground/70">{erro.message}</p>
      )}
    </div>
  );
}

/**
 * Fronteira para usar à volta das rotas.
 *
 * Passa o pathname como `resetKey`, o que faz o erro limpar-se sozinho quando o
 * utilizador navega para outro lado. Sem isto, quem tropeça num erro fica preso
 * no ecrã de erro mesmo depois de clicar noutra entrada do menu — que é
 * exactamente o momento em que o produto parece partido.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname} origem={`rota ${pathname}`}>
      {children}
    </ErrorBoundary>
  );
}
