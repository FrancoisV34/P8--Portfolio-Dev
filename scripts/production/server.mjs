import { createRequestHandler } from '@react-router/express';
import { Console } from 'node:console';
import express from 'express';
import { join, posix } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import * as build from '../../build/server/index.js';

const console = new Console({ stdout: process.stdout, stderr: process.stderr });
const app = express();
app.disable('x-powered-by');
// Fly place l'application derrière un seul proxy TLS. Cette confiance bornée
// permet à React Router de comparer l'origine HTTPS publique à la requête.
app.set('trust proxy', 1);

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
