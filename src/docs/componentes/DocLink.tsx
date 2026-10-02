import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useDocs } from '../contexto';
import { hrefDocs } from '../lib/base';

interface Props {
  /** Slug da página, com '#ancora' opcional. */
  para: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  'aria-current'?: 'page';
}

/** Link interno da documentação, já com a base certa ('' ou '/docs'). */
export function DocLink({ para, children, className, onClick, ...resto }: Props) {
  const { base } = useDocs();
  return (
    <Link to={hrefDocs(base, para)} className={className} onClick={onClick} {...resto}>
      {children}
    </Link>
  );
}
