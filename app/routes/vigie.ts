import { consulterVigie } from '../.server/vigie.server.ts';

// API des agents et dashboard de Vigie : 404 sans session du propriétaire ni jeton d'agent.
export function loader({ request }: { request: Request }) {
  return consulterVigie(request);
}

export function action({ request }: { request: Request }) {
  return consulterVigie(request);
}
