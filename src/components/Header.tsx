import type { ReactNode } from 'react';
import { go } from '../lib/router';
import { BackIcon } from './Icons';

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="header">
      <button className="icon-btn" onClick={() => go('home')} aria-label="Back">
        <BackIcon size={26} />
      </button>
      <h1>{title}</h1>
      <div className="header-right">{right}</div>
    </header>
  );
}
