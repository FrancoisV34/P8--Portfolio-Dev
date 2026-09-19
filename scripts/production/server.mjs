import { createRequestHandler } from '@react-router/express';
import { Console } from 'node:console';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { join, posix } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import * as build from '../../build/server/index.js';
import { securityHeaders } from '../../app/.server/security/headers.server.ts';

const console = new Console({ stdout: process.stdout, stderr: process.stderr });
const app = express();
app.disable('x-powered-by');
// Fly place l'application derrière un seul proxy TLS. Cette confiance bornée
// permet à React Router de comparer l'origine HTTPS publique à la requête.
app.set('trust proxy', 1);

// Un nonce par requête autorise les scripts d'hydratation de React Router sans
// ouvrir `unsafe-inline`. L'en-tête est écrit ici, donc une valeur envoyée par
// le navigateur est systématiquement écrasée avant d'atteindre l'application.
app.use((req, res, next) => {
  const nonce = randomBytes(16).toString('base64');
  req.headers['x-nonce'] = nonce;
  res.set(securityHeaders({ nonce, secure: req.secure }));
  next();
});

const publicPath = new URL(build.publicPath, 'http://localhost').pathname;
app.use(posix.join(publicPath, 'assets'), express.static(join(build.assetsBuildDirectory, 'assets'), {
  immutable: true,
  maxAge: '1y',
}));
app.use(publicPath, express.static(build.assetsBuildDirectory));
app.all('/{*splat}', createRequestHandler({ build, mode: process.env.NODE_ENV }));

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST;
const server = app.listen(port, host, () => {
  console.log(`[finance] écoute sur http://${host ?? 'localhost'}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
