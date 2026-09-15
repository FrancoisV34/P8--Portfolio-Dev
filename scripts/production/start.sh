#!/bin/sh
set -eu

# Cette commande tourne dans l'unique Machine qui monte le volume SQLite.
# Une migration échouée empêche l'ouverture du serveur, plutôt que d'exposer
# une application incompatible avec sa base.
npm run db:migrate

exec npm start
