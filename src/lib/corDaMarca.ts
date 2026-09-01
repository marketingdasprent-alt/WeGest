import type React from 'react';

// A cor da marca de uma organização, pronta a usar num ecrã público.
//
// O formulário público tinha a paleta escrita à mão — preto e amarelo, com o
// rodapé a dizer "DasPrent". Numa aplicação multi-organização isso mostra a
// marca errada aos leads de toda a gente. A cor passa a vir de
// `organizacoes.cor_primaria`, e é aqui que se decide o que fazer com ela.
//
// A parte que interessa é o CONTRASTE: quem escolhe a cor escolhe uma só, e
// não tem de pensar se o texto do botão fica legível por cima. Um amarelo
// pede texto preto; um azul-escuro pede texto branco. Escolher mal deixa
// botões ilegíveis — e ninguém repara até um lead desistir do formulário.

/**
 * Marca de recurso: a organização que não definiu cor mostra a da WeGest.
 * É o teal de `--primary` em index.css (`174 100% 25%`), em hexadecimal.
 */
export const COR_PADRAO = '#008073';

export interface PaletaDaMarca {
  /** A cor da marca, sempre um `#RRGGBB` válido. */
  cor: string;
  /** Preto ou branco — o que for legível POR CIMA de `cor`. */
  corDoTexto: string;
  /** `cor` a 12% — fundos suaves, realces, barras de progresso por preencher. */
  corSuave: string;
  /** `cor` a 30% — contornos e separadores. */
  corDeContorno: string;
  /** true quando a cor veio da organização, não do recurso. */
  daOrganizacao: boolean;
  /** Estilo a pôr no contentor da página: redefine os tokens `--primary` do
   *  ramo, para os componentes que já usam `bg-primary` seguirem a marca. */
  variaveisCss: React.CSSProperties;
}

const HEX = /^#[0-9a-f]{6}$/i;

function normalizar(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpo = valor.trim();
  return HEX.test(limpo) ? limpo.toUpperCase() : null;
}

function componentes(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Luminância relativa segundo a WCAG. É o que distingue "cor clara" de "cor
 * escura" aos olhos, e não a soma ingénua dos canais: o verde pesa muito mais
 * do que o azul na percepção de brilho.
 */
function luminancia(hex: string): number {
  const canais = componentes(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

/** Contraste WCAG entre duas luminâncias (1 = igual, 21 = preto vs branco). */
function contraste(l1: number, l2: number): number {
  const [claro, escuro] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * Texto legível por cima da cor dada: o que tiver mais contraste, preto ou
 * branco. Não há terceira hipótese — meios-tons por cima de uma cor de marca
 * ficam sempre piores do que qualquer um dos dois extremos.
 */
export function textoLegivelSobre(hex: string): string {
  const l = luminancia(hex);
  const contrasteComPreto = contraste(l, 0);
  const contrasteComBranco = contraste(l, 1);
  return contrasteComPreto >= contrasteComBranco ? '#000000' : '#FFFFFF';
}

/**
 * `#RRGGBB` → `"174 100% 25%"`, o formato que os tokens da aplicação usam
 * (`hsl(var(--primary))`).
 *
 * Serve para redefinir `--primary` num ramo da página: tudo o que já usa
 * `bg-primary` / `text-primary` — o indicador de etapas, por exemplo — passa a
 * seguir a cor da organização sem precisar de saber que ela existe.
 */
export function paraTokenHsl(hex: string): string {
  const [r, g, b] = componentes(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** `#RRGGBB` → `rgba(r, g, b, alfa)`, para fundos e contornos suaves. */
export function comTransparencia(hex: string, alfa: number): string {
  const [r, g, b] = componentes(hex);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/**
 * A paleta completa a partir do que a organização gravou.
 *
 * Aceita `null`, indefinido ou lixo — nesse caso devolve a cor da aplicação,
 * marcada como não sendo da organização. Um ecrã público nunca deve rebentar
 * nem ficar sem cor por causa de um campo mal preenchido.
 */
export function paletaDaMarca(corPrimaria: string | null | undefined): PaletaDaMarca {
  const daOrg = normalizar(corPrimaria);
  const cor = daOrg ?? COR_PADRAO;
  const corDoTexto = textoLegivelSobre(cor);

  return {
    cor,
    corDoTexto,
    corSuave: comTransparencia(cor, 0.12),
    corDeContorno: comTransparencia(cor, 0.3),
    daOrganizacao: daOrg !== null,
    variaveisCss: {
      '--primary': paraTokenHsl(cor),
      '--primary-foreground': paraTokenHsl(corDoTexto),
      '--ring': paraTokenHsl(cor),
    } as React.CSSProperties,
  };
}
