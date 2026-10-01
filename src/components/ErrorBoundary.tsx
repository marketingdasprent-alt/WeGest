import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Error boundaries do React exigem componente de classe e só capturam renderização.

interface FallbackProps {
  erro: Error;
  reset: () => void;
}

interface Props {
  children: ReactNode;
  resetKey?: string | number;
  origem?: string;
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

// A mudança de rota repõe a fronteira para não prender a navegação no fallback.
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname} origem={`rota ${pathname}`}>
      {children}
    </ErrorBoundary>
  );
}
