/**
 * O tradutor do browser (Google Tradutor no Chrome, tradução do Safari) troca os
 * nós de texto da página pelos seus. Quando o React depois tenta remover ou
 * inserir junto de um nó que já lá não está, o DOM lança NotFoundError e a
 * secção cai no ecrã de erro — motoristas estrangeiros com a página traduzida
 * não conseguiam entrar (10/11/2026). Aqui essas duas operações passam a ignorar
 * o nó desaparecido em vez de rebentar; a tradução continua a funcionar.
 */
export function protegerContraTradutor(proto: Node = Node.prototype): void {
  const marca = proto as Node & { __protegidoTradutor?: boolean };
  if (marca.__protegidoTradutor) return;
  marca.__protegidoTradutor = true;

  const removeChildOriginal = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, filho: T): T {
    if (filho.parentNode !== this) return filho;
    return removeChildOriginal.call(this, filho) as T;
  };

  const insertBeforeOriginal = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(this: Node, novo: T, referencia: Node | null): T {
    if (referencia && referencia.parentNode !== this) {
      return insertBeforeOriginal.call(this, novo, null) as T;
    }
    return insertBeforeOriginal.call(this, novo, referencia) as T;
  };
}
