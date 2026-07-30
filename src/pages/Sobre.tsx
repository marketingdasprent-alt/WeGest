import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { PaginaInstitucional } from '@/components/site/primitives/PaginaInstitucional';
import { SOBRE } from '@/components/site/content/institucionalContent';
import { metricasPublicaveis } from '@/components/site/content/provaData';

/**
 * Sobre.
 *
 * A versão anterior falava de recrutar motoristas TVDE ("proporcionar aos
 * motoristas TVDE as melhores condições para desenvolverem a sua atividade"),
 * o que é outro negócio: quem chega aqui pelo rodapé da landing está a avaliar
 * software para a frota dele.
 *
 * Saíram também quatro métricas que não foi possível confirmar (500+ motoristas,
 * 200+ veículos, 5 anos, suporte 24/7) e que contradiziam os números reais da
 * landing. Os números mostrados aqui vêm do mesmo `provaData.ts` da secção de
 * Prova — uma só fonte, logo nunca duas páginas com números diferentes.
 *
 * Em vez de "Missão e Valores" (Parceria, Transparência, Excelência,
 * Compromisso — quatro palavras que qualquer empresa do mundo pode assinar),
 * a página conta a história em três capítulos e fecha com compromissos que se
 * podem verificar numa chamada.
 */
const Sobre = () => {
  const metricas = metricasPublicaveis();

  return (
    <PaginaInstitucional
      etiqueta={SOBRE.etiqueta}
      titulo={SOBRE.titulo}
      descricao={SOBRE.descricao}
    >
      {metricas.length > 0 && (
        <div className="flex flex-wrap gap-x-14 gap-y-8 border-y border-border/50 py-8">
          {metricas.map((metrica) => (
            <div key={metrica.key}>
              <p className="font-display text-3xl font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                {metrica.prefixo && (
                  <span className="mr-1.5 align-middle text-sm font-medium text-muted-foreground">
                    {metrica.prefixo}
                  </span>
                )}
                {metrica.valor}
                {metrica.sufixo}
              </p>
              <p className="mt-1.5 max-w-[15rem] text-sm leading-snug text-muted-foreground">
                {metrica.rotulo}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        {SOBRE.capitulos.map((capitulo, index) => (
          <section key={capitulo.titulo} className="border-b border-border/50 py-9">
            <div className="grid gap-4 md:grid-cols-12 md:gap-8">
              <div className="md:col-span-4">
                {/* A numeração é honesta aqui: os capítulos são uma cronologia,
                    logo a ordem transporta informação. */}
                <span className="text-xs font-semibold tabular-nums tracking-[0.12em] text-primary">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h2 className="mt-2 font-display text-xl font-semibold tracking-[-0.01em] text-foreground">
                  {capitulo.titulo}
                </h2>
              </div>

              <div className="md:col-span-8">
                {capitulo.paragrafos.map((paragrafo) => (
                  <p
                    key={paragrafo}
                    className="text-[1.0625rem] leading-relaxed text-muted-foreground [&:not(:first-child)]:mt-4"
                  >
                    {paragrafo}
                  </p>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="py-9">
        <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-foreground">
          {SOBRE.compromissosTitulo}
        </h2>
        <ul className="mt-6 space-y-4">
          {SOBRE.compromissos.map((item) => (
            <li key={item} className="flex gap-3">
              <Check
                aria-hidden="true"
                className="mt-[3px] h-[18px] w-[18px] shrink-0 text-primary"
              />
              <span className="text-[1.0625rem] leading-relaxed text-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border/70 bg-card p-6 md:p-8">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
          {SOBRE.ctaTitulo}
        </h2>
        <Link
          to="/#contacto"
          className="group mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[0.9375rem] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {SOBRE.ctaTexto}
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </section>
    </PaginaInstitucional>
  );
};

export default Sobre;
