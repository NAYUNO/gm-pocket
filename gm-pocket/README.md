# GM Pocket — les règles de nos jeux, à l'écrit et à l'oral

GM Pocket est une appli web installable sur téléphone (PWA). Elle sert à :

- **importer les règles** d'un jeu de société en photo (une page par photo) ou en PDF : l'IA les transcrit et les range par sections ;
- **poser des questions** à l'écrit ou au micro, avec une réponse lue à voix haute et la section des règles citée ;
- utiliser des **raccourcis** : Résumé express, Mise en place, Comment on gagne ?, Explique à un débutant, Mon tour ;
- noter vos **règles maison**, dont l'IA tient compte dans ses réponses ;
- garder l'**historique** des questions posées par chacun.

V1 : réservée à la famille. On crée un compte avec un **code famille** et toutes les questions passent par **ta** clé API.

---

## Déployer gratuitement : Render + Neon (≈ 20 min)

Le serveur tourne sur **Render (gratuit)** et la base de données sur **Neon (gratuit)**. La base gratuite de Render est supprimée au bout de 30 jours, celle de Neon n'expire pas.

### 1. Prérequis
- Une clé API Anthropic : https://console.anthropic.com → *API Keys*. Pense à fixer une **limite de dépense mensuelle** (*Settings → Limits*), par exemple 10 €. C'est la seule chose payante, à l'usage.
- Un compte GitHub (NAYUNO), un compte Render et un compte Neon (https://neon.com, connexion possible avec GitHub).

### 2. Créer la base de données sur Neon
1. Neon → **New Project** → nom `gm-pocket`, région **Europe (Frankfurt)**.
2. Sur le tableau de bord du projet, clique sur **Connect** et copie la **chaîne de connexion**. Remplace la fin `?sslmode=require&channel_binding=require` par `?sslmode=verify-full`. Elle ressemble alors à `postgresql://neondb_owner:xxxx@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full`.
3. Garde-la de côté pour l'étape 4. Les tables se créent toutes seules au premier démarrage de l'appli.

### 3. Mettre le code sur GitHub
```bash
cd gm-pocket
git init && git add . && git commit -m "GM Pocket V1"
git branch -M main
git remote add origin https://github.com/NAYUNO/gm-pocket.git   # crée d'abord le dépôt (privé) sur GitHub
git push -u origin main
```

### 4. Créer le Blueprint sur Render
1. Render → **New → Blueprint** → choisis le dépôt `gm-pocket`.
2. Render lit `render.yaml` et prévoit le service web `gm-pocket` (gratuit, Francfort).
3. Il demande 3 secrets :
   - `DATABASE_URL` : la chaîne de connexion Neon de l'étape 2 ;
   - `ANTHROPIC_API_KEY` : ta clé API ;
   - `FAMILY_CODE` : un code à donner à la famille (ex. `cerise-dé-47`).
4. **Apply**. Le premier déploiement prend 2 à 4 minutes.

### Ce que change le gratuit
- **Mise en veille** : le serveur s'endort après 15 min sans visite. La première ouverture après une pause prend jusqu'à une minute, et l'appli affiche « Le maître du jeu se réveille… ». Ensuite, tout est rapide. Astuce : ouvre l'appli en sortant la boîte de jeu, elle sera prête au moment de la première question.
- **Quotas** : 750 h de serveur par mois chez Render, assez pour un service. Chez Neon, 1 Go de stockage, de quoi garder des centaines de livrets en texte.
- **Passer au payant plus tard** : dans `render.yaml`, remplace `plan: free` par `plan: starter` (~7 $/mois). Le serveur ne s'endort plus, et la base Neon reste la même.

### 5. Installer sur les téléphones
- Ouvre l'adresse `https://gm-pocket-xxxx.onrender.com`.
- **Android / Chrome** : menu ⋮ → *Ajouter à l'écran d'accueil*.
- **iPhone / Safari** : bouton Partager → *Sur l'écran d'accueil*.
- Chacun choisit **Créer un compte** (prénom, mot de passe, code famille).

---

## Appli Android (APK)

L'appli Android est compilée **automatiquement par GitHub** à chaque mise à jour du dépôt. Tu n'as pas besoin d'Android Studio.

### Une seule fois : l'adresse du serveur
Dans `mobile.config.json`, mets l'adresse de ton serveur Render :
```json
{ "apiUrl": "https://gm-pocket-xxxx.onrender.com" }
```
Elle est affichée en haut de la page du service sur Render, sans `/` à la fin.

### Récupérer l'APK
1. Après chaque envoi sur GitHub, l'onglet **Actions** montre la compilation « Appli Android », qui dure 5 à 8 minutes.
2. Sur le téléphone, ouvre `https://github.com/NAYUNO/gm-pocket/releases/latest`.
3. Télécharge **GM-Pocket-1.0.X.apk** et ouvre-le. La première fois, Android demande d'autoriser l'installation depuis le navigateur.
4. Les mises à jour s'installent par-dessus l'ancienne version, sans rien perdre, car elles sont toujours signées avec la même clé (`mobile/gmpocket.keystore`).

### Ce que l'appli apporte par rapport à la version web
- Elle démarre instantanément : l'interface est dans l'appli, seules les données viennent du serveur.
- La reconnaissance vocale et la lecture à voix haute sont celles d'Android, plus fiables.
- Un bouton **Prendre une page en photo** ouvre directement l'appareil photo.
- Un écran de démarrage aux couleurs GM Pocket s'affiche pendant le réveil du serveur.

### Personnaliser
- **Icône et écran de démarrage** : remplace les images de `mobile/assets/` (`icon-only.png`, `icon-foreground.png` et `icon-background.png` en 1024×1024, `splash.png` en 2732×2732, `splash-icon.png` pour le splash Android 12+).
- **Logo** (écran de connexion et de démarrage dans l'appli) : `public/icons/logo.png`, version claire pour fond bleu.
- **Couleurs Android** : `mobile/colors.xml` et `mobile/styles.xml`.
- **Compiler en local** (avec Android SDK et Java 21) : `npm run apk`.

## Bien utiliser l'import
- Une photo **par page**, à plat, bien éclairée, sans reflet.
- 20 fichiers maximum par envoi. Pour un gros livret, importe une partie, puis utilise **Règles → + Ajouter des pages** : l'IA fusionne les nouvelles pages avec les règles existantes.
- Le PDF officiel de l'éditeur, quand il existe, donne le meilleur résultat.
- Vérifie la transcription dans l'onglet **Règles**. Tu peux corriger le texte à la main avec **Corriger le texte**.

## Voix
- **Micro** : marche dans Chrome (Android, PC) et dans Safari récent (iPhone). Le navigateur demande l'autorisation la première fois.
- **Lecture à voix haute** : voix française du téléphone. Elle se coupe avec la case « Lire les réponses à voix haute ».

## Coûts IA (ordre de grandeur, modèle Claude Sonnet 5.5)
- Import d'un livret de 12 pages : environ 0,10 à 0,30 €, une seule fois par jeu.
- Question : environ 1 à 4 centimes. Les règles sont mises en cache, donc les questions qui s'enchaînent sur le même jeu coûtent moins cher.
- Pour réduire les coûts des questions, mets `MODEL_ASK=claude-haiku-5-5` dans Render. C'est moins cher, mais un peu moins fin sur les règles ambiguës.
- Garde-fous : `DAILY_QUESTION_LIMIT` (150/jour/personne) et `DAILY_IMPORT_LIMIT` (20/jour/personne).

## Lancer en local
```bash
npm install
cp .env.example .env          # puis remplis ANTHROPIC_API_KEY (ou MOCK_AI=1 pour tester sans IA)
node --env-file=.env server/index.js
# → http://localhost:3000
npm test                      # test de bout en bout (base en mémoire + IA simulée)
```
Avec `DATABASE_URL=pglite`, la base est en mémoire : tout est effacé à l'arrêt. C'est fait pour tester.

## Structure
```
server/index.js   API Express (comptes, jeux, import, questions, quotas)
server/ai.js      Prompts et appels à l'API Claude (transcription, réponses)
server/db.js      Postgres + création automatique des tables
server/auth.js    Sessions par cookie signé, code famille
public/           Appli (HTML/CSS/JS sans framework), manifest, service worker, icônes
render.yaml       Blueprint Render (service web gratuit)
capacitor.config.json, mobile.config.json   Réglages de l'appli Android
mobile/           Icônes, splash, thème et clé de signature Android
scripts/          Préparation de l'appli Android (utilisé par GitHub)
.github/workflows/android.yml   Compilation automatique de l'APK
```

## Limites connues de la V1
- Les photos et PDF d'origine ne sont pas conservés, seul le texte transcrit l'est.
- Pas de mot de passe oublié : en cas d'oubli, supprime la ligne de l'utilisateur dans la base (Neon → SQL Editor : `DELETE FROM users WHERE name = 'Prénom';`) et il recrée son compte.
- Si l'IA bloque sur un livret très long, découpe-le en plusieurs imports.

## Pistes pour la V2
Comptes « amis » avec leur propre clé API, bibliothèque commune (fiches, liens vers les PDF officiels, FAQ des joueurs), conservation des sources (Cloudflare R2).
