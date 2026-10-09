import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { hiddenEntryPath } from '../lib/private-path-shape';

// Trois clics rapprochés (ou trois tapotements sur mobile) sur la mention de
// copyright ouvrent un champ discret. L'adresse privée ne figure jamais dans la
// page : seul celui qui la connaît peut la taper, et un mauvais code mène à la
// même page « introuvable » que n'importe quelle adresse inconnue.
const TAPS = 3;
const WINDOW_MS = 800;

export default function HiddenEntry({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const taps = useRef<number[]>([]);

  function tap() {
    const now = Date.now();
    taps.current = [...taps.current.filter((time) => now - time < WINDOW_MS), now];
    if (taps.current.length >= TAPS) {
      taps.current = [];
      setOpen(true);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = hiddenEntryPath(String(new FormData(event.currentTarget).get('code') ?? ''));
    if (path) window.location.assign(path);
    else setOpen(false);
  }

  return (
    <div className="contact-footer__copy">
      <span className="contact-footer__mark" onClick={tap}>{children}</span>
      {open && (
        <form className="contact-footer__entry" onSubmit={submit}>
          <input
            name="code"
            type="password"
            autoComplete="off"
            aria-label="Code"
            autoFocus
            onBlur={() => setOpen(false)}
            onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
          />
        </form>
      )}
    </div>
  );
}
