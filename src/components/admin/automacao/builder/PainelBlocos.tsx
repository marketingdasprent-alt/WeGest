import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CATALOGO, type TemplateDeNo } from './catalogo';
import { achatar, agruparBlocos, proximoIndice } from './painelBlocos.pesquisa';

/**
 * Painel "Passo seguinte".
 *
 * Mesma casca do painel de propriedades — `aside` dentro do canvas, sem
 * overlay e sem ocupar a janela toda. Era um Sheet do Radix e destoava: abria
 * por cima da aplicação inteira, incluindo o menu lateral, quando o que se
 * está a fazer é uma acção dentro do editor.
 *
 * Toda a escolha é possível sem rato: setas para navegar, Enter para escolher,
 * Esc para fechar — e o campo de pesquisa recebe foco ao abrir.
 */
export function PainelBlocos({
  onFechar,
  onEscolher,
  moduloFiltro,
  temAccao = false,
}: {
  onFechar: () => void;
  onEscolher: (template: TemplateDeNo) => void;
  /** Restringe os gatilhos ao módulo escolhido. */
  moduloFiltro?: string;
  /** Já existe uma acção no fluxo — esconde a categoria "Ações". */
  temAccao?: boolean;
}) {
  const [pesquisa, setPesquisa] = useState('');
  const [indice, setIndice] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const grupos = useMemo(
    () => agruparBlocos(CATALOGO, pesquisa, moduloFiltro, temAccao),
    [pesquisa, moduloFiltro, temAccao]
  );
  const plano = useMemo(() => achatar(grupos), [grupos]);

  /**
   * Foco na pesquisa, sem arrastar o ecrã.
   *
   * O painel entra deslocado 100% para a direita. Dar foco a um campo que
   * ainda está fora do ecrã faz o browser fazer scroll-into-view e puxar todo
   * o rectângulo — via-se o canvas inteiro a saltar. `preventScroll` corta
   * isso, e o foco só é pedido quando a entrada termina.
   */
  const focarPesquisa = () => campo.current?.focus({ preventScroll: true });

  // Escrever muda a lista debaixo do cursor — sem repor, o Enter escolhia um
  // bloco que já não estava visível.
  useEffect(() => setIndice(0), [pesquisa]);

  // Salta a primeira passagem: na montagem o painel ainda está fora do ecrã,
  // e o scrollIntoView arrastava tudo — a mesma causa do foco automático.
  const jaEntrou = useRef(false);
  useEffect(() => {
    if (!jaEntrou.current) {
      jaEntrou.current = true;
      return;
    }
    listaRef.current?.querySelector('[data-activo="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [indice]);

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onFechar();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setIndice((i) => proximoIndice(i, plano.length, e.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (e.key === 'Enter' && plano[indice]) {
      e.preventDefault();
      onEscolher(plano[indice]);
    }
  };

  return (
    <motion.aside
      initial={{ x: '100%', opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0.6 }}
      transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
      onAnimationComplete={focarPesquisa}
      role="complementary"
      aria-label="Escolher passo seguinte"
      // O Esc é apanhado aqui: sem o Sheet do Radix, ninguém o trata por nós.
      onKeyDown={aoTeclar}
      className="absolute inset-y-0 right-0 z-10 flex w-full max-w-[380px] flex-col border-l border-node-border bg-panel shadow-xl sm:w-[380px]"
    >
      <div className="space-y-3 border-b border-node-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Passo seguinte</h2>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onFechar}>
            <X className="h-4 w-4" />
            <span className="sr-only">Fechar painel</span>
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={campo}
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
            placeholder="Procurar bloco…"
            className="pl-8"
          />
        </div>
      </div>

      <div ref={listaRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {temAccao && (
          // Explica a ausência da categoria "Ações": sem isto parece que o
          // painel perdeu blocos, não que a regra é deliberadamente uma
          // corrente com uma acção só.
          <p className="rounded-lg border border-border bg-card p-2.5 text-[11px] leading-snug text-muted-foreground">
            Esta automação já tem uma acção. Para também notificar ou enviar email por outro canal,
            cria uma nova automação para o mesmo evento.
          </p>
        )}

        {plano.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum bloco corresponde à pesquisa.</p>
        )}

        {grupos.map((grupo) => (
          <div key={grupo.categoria} className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {grupo.categoria}
            </p>
            {grupo.itens.map((t) => {
              const activo = plano[indice]?.chave === t.chave;
              return (
                <button
                  key={t.chave}
                  type="button"
                  data-activo={activo}
                  // O nome acessível não é inferido do texto em spans.
                  aria-label={`Escolher bloco ${t.rotulo}`}
                  onMouseMove={() => setIndice(plano.findIndex((p) => p.chave === t.chave))}
                  onClick={() => onEscolher(t)}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors',
                    activo
                      ? 'border-primary/50 bg-accent/10'
                      : 'border-border bg-card hover:bg-accent/5'
                  )}
                >
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: `hsl(var(${t.cor}) / 0.15)`,
                      color: `hsl(var(${t.cor}))`,
                    }}
                  >
                    <t.Icone className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-foreground">{t.rotulo}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">
                      {t.descricao}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        ↑ ↓ para navegar · Enter para escolher · Esc para fechar
      </p>
    </motion.aside>
  );
}
