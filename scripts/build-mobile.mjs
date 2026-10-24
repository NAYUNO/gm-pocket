// Prépare le dossier www/ embarqué dans l'appli Android à partir de public/.
// L'adresse du serveur vient de la variable API_URL, sinon de mobile.config.json.
import { cpSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');

const fileConfig = JSON.parse(readFileSync(path.join(root, 'mobile.config.json'), 'utf8'));
const apiUrl = String(process.env.API_URL || fileConfig.apiUrl || '').trim().replace(/\/$/, '');
if (!/^https:\/\/[^/]+$/.test(apiUrl)) {
  console.error(`Adresse du serveur invalide : « ${apiUrl} ». Mets l'adresse Render (https://….onrender.com) dans mobile.config.json.`);
  process.exit(1);
}

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
cpSync(path.join(root, 'public'), www, {
  recursive: true,
  // Le service worker et le manifeste ne servent qu'à la version web.
  filter: (src) => !/[\\/](sw\.js|manifest\.webmanifest)$/.test(src),
});
writeFileSync(
  path.join(www, 'config.js'),
  `// Généré par scripts/build-mobile.mjs\nwindow.GM_CONFIG = { apiUrl: ${JSON.stringify(apiUrl)} };\n`
);
console.log(`www/ prêt — API : ${apiUrl}`);
