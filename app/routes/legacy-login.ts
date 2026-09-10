import { redirect } from 'react-router';

// Ancienne adresse publique : aucun formulaire ni traitement d'authentification
// ne reste ici. Elle conserve seulement les favoris existants sans erreur.
export function loader() { return redirect('/co'); }
export const action = loader;
