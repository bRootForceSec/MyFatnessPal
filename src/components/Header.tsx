import type { ReactNode } from 'react';
import { go, type Route } from '../lib/router';
import { BackIcon } from './Icons';

export function Header({ title, right, back = 'home' }: { title: string; right?: ReactNode; back?: Route }) {
  return (
    <header className="header">
      <button className="icon-btn" onClick={() => go(back)} aria-label="Back">
        <BackIcon size={26} />
      </button>
      <h1>{title}</h1>
      <div className="header-right">{right}</div>
    </header>
  );
}
