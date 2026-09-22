/**
 * A app está a correr instalada (PWA), e não num separador do browser?
 *
 * O PWA do WeGest é do motorista: o `start_url` abre em `/motorista/painel` e
 * é esse o único ecrã que faz sentido num telemóvel instalado no bolso de
 * quem conduz. O backoffice continua a viver no browser.
 *
 * `display-mode: standalone` cobre Android e desktop; o Safari do iOS só
 * responde ao `navigator.standalone`, que é proprietário e não existe na
 * tipagem padrão — daí o acesso indirecto.
 */
export function estaInstaladoComoApp(): boolean {
  if (typeof window === 'undefined') return false;
  const porMediaQuery = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const porSafariIOS =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return porMediaQuery || porSafariIOS;
}

interface AcessoNoPwa {
  /** `estaInstaladoComoApp()` — separado para a decisão ser testável sem `window`. */
  instalado: boolean;
  /** Sessão/permissões ainda a carregar: não se decide nada. */
  loading: boolean;
  temSessao: boolean;
  /**
   * O perfil foi mesmo lido (há org activa), ou `tipoUtilizador` é só o valor
   * por omissão? O `PermissionsContext` cai em `DEFAULT_STATE` — que diz
   * `'colaborador'` — em três sítios: sem `orgId`, com erro a ler o membership
   * e no `catch` final. Em qualquer deles `loading` fica `false`, por isso
   * `loading` sozinho não distingue "é colaborador" de "não sei".
   */
  perfilResolvido: boolean;
  tipoUtilizador: 'motorista' | 'colaborador';
  /**
   * Tem ficha de motorista em alguma org (RPC `get_minha_org_motorista`)?
   * Cobre as contas duplas — staff que também conduz — cujo `tipoUtilizador`
   * diz `colaborador`. `undefined` = ainda não se sabe: não se bloqueia.
   */
  ehMotorista: boolean | undefined;
}

/**
 * Deve a app instalada recusar esta rota e mostrar o aviso "App de motorista"?
 *
 * O critério é o `tipoUtilizador` e não o recurso da rota. Testar pelo recurso
 * falha nas duas pontas: o cargo Motorista não tem `motorista_painel` nas
 * permissões (chega lá por ser a sua rota-padrão), logo o motorista era
 * barrado; e o `isAdmin` dá acesso a tudo, logo o administrador escapava.
 *
 * Na dúvida deixa passar. O engano barato é um utilizador de backoffice ver o
 * painel do motorista; o caro é o motorista ficar preso num ecrã que lhe diz
 * para abrir o navegador, dentro de uma app que não tem barra de endereço.
 */
export function deveBloquearNoPwa({
  instalado,
  loading,
  temSessao,
  perfilResolvido,
  tipoUtilizador,
  ehMotorista,
}: AcessoNoPwa): boolean {
  if (!instalado || loading || !temSessao || !perfilResolvido) return false;
  if (tipoUtilizador === 'motorista') return false;
  // Colaborador no perfil, mas só se bloqueia quando a BD CONFIRMA que não
  // tem ficha de motorista. Um administrador que também conduz entra.
  return ehMotorista === false;
}
