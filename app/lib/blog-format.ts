// « 4 octobre 2026 ». Midi UTC : la date ne glisse pas d'un jour selon le fuseau.
export const dateLongue = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
