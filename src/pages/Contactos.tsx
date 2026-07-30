import { Link } from 'react-router-dom';
import { Mail, Phone, Clock, ArrowRight } from 'lucide-react';
import { PaginaInstitucional } from '@/components/site/primitives/PaginaInstitucional';
import { CONTACTOS, CONTACTO } from '@/components/site/content/institucionalContent';

/**
 * Contactos.
 *
 * Duas correções de substância face à versão anterior:
 *
 * 1. **O email estava errado.** O texto mostrava
 *    `motoristas.tvde@rotaliquida.pt` e o `href` enviava para
 *    `motoristas.tvde@distanciaarrojada.pt` — domínios diferentes. Agora ambos
 *    vêm da mesma constante `CONTACTO`, o que torna a divergência impossível.
 * 2. **O destinatário mudou.** Passa a ser a caixa que já recebe os pedidos do
 *    formulário da landing, para que nenhum lead caia numa caixa que ninguém lê.
 *
 * Saíram os três cartões coloridos (verde WhatsApp, azul email) e o cartão
 * "Informações Adicionais": cor por canal era decoração, e o brief exclui
 * grelhas de cartões repetidos. A informação passa a ser uma lista de
 * definição, que é o que de facto é.
 */
const Contactos = () => (
  <PaginaInstitucional
    etiqueta={CONTACTOS.etiqueta}
    titulo={CONTACTOS.titulo}
    descricao={CONTACTOS.descricao}
  >
    <dl className="border-t border-border/50">
      <div className="flex flex-col gap-1 border-b border-border/50 py-6 md:flex-row md:items-baseline md:gap-8">
        <dt className="flex min-w-[9rem] items-center gap-2.5 text-sm font-medium text-muted-foreground">
          <Mail aria-hidden="true" className="h-4 w-4 text-primary" />
          Email
        </dt>
        <dd className="text-[1.0625rem]">
          <a
            href={`mailto:${CONTACTO.email}`}
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CONTACTO.email}
          </a>
          <p className="mt-1 text-sm text-muted-foreground">{CONTACTO.resposta}</p>
        </dd>
      </div>

      <div className="flex flex-col gap-1 border-b border-border/50 py-6 md:flex-row md:items-baseline md:gap-8">
        <dt className="flex min-w-[9rem] items-center gap-2.5 text-sm font-medium text-muted-foreground">
          <Phone aria-hidden="true" className="h-4 w-4 text-primary" />
          Telefone
        </dt>
        <dd className="text-[1.0625rem]">
          <a
            href={`tel:${CONTACTO.telefoneHref}`}
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CONTACTO.telefone}
          </a>
          <p className="mt-1 text-sm text-muted-foreground">
            Fala com a equipa que construiu o sistema.
          </p>
        </dd>
      </div>

      <div className="flex flex-col gap-1 border-b border-border/50 py-6 md:flex-row md:items-baseline md:gap-8">
        <dt className="flex min-w-[9rem] items-center gap-2.5 text-sm font-medium text-muted-foreground">
          <Clock aria-hidden="true" className="h-4 w-4 text-primary" />
          Horário
        </dt>
        <dd className="text-[1.0625rem] text-foreground">{CONTACTO.horario}</dd>
      </div>
    </dl>

    <section className="mt-12 rounded-xl border border-border/70 bg-card p-6 md:p-8">
      <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
        {CONTACTOS.formularioTitulo}
      </h2>
      <p className="mt-3 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
        {CONTACTOS.formularioTexto}
      </p>
      <Link
        to="/#contacto"
        className="group mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[0.9375rem] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {CONTACTOS.formularioCta}
        <ArrowRight
          aria-hidden="true"
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </section>

    <p className="mt-8 text-sm text-muted-foreground">
      Já é cliente e precisa de suporte?{' '}
      <Link to="/entrar" className="font-medium text-primary underline-offset-4 hover:underline">
        Entre no sistema
      </Link>{' '}
      e abra um pedido no módulo de Assistência — fica registado com prioridade e histórico.
    </p>
  </PaginaInstitucional>
);

export default Contactos;
