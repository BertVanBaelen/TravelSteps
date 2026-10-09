# TravelSteps

Reisblog (PWA) met tijdlijn, kaart en Immich-foto's voor meerdere reizigers. Draait als één
Docker-container (of Home Assistant-add-on) op de Home Assistant-server en wordt via een
Cloudflare Tunnel publiek bereikbaar gemaakt.

Versie **1.0.0**. Geplande uitbreidingen: zie de [V2-roadmap](../V2%20roadmap.md).

## Inhoud

- [Architectuur](#architectuur)
- [Installeren](#installeren-op-de-home-assistant-server)
- [Cloudflare Tunnel](#cloudflare-tunnel)
- [Eerste keer inloggen](#eerste-keer-inloggen)
- [Configuratie](#configuratie)
- [Immich koppelen](#immich-koppelen)
- [Routes (OpenRouteService)](#routes-openrouteservice)
- [Back-ups en herstellen](#back-ups-en-herstellen)
- [Logs en health check](#logs-en-health-check)
- [Upgraden](#upgraden)
- [Ontwikkelen](#ontwikkelen)
- [Nieuwe versie uitbrengen](#nieuwe-versie-uitbrengen)

## Architectuur

| Map       | Inhoud                                                               |
| --------- | -------------------------------------------------------------------- |
| `shared/` | Gedeelde types, Zod-schema's en constanten (server + web)            |
| `server/` | Fastify 5 API (Node 22, TypeScript), SQLite (better-sqlite3), Argon2id |
| `web/`    | React 19 + Vite PWA (Nederlandstalig, offline schrijven met IndexedDB) |
| `docker/` | Entrypoint-script voor de container                                  |

Eén container serveert de API (`/api/...`) en de gebouwde web-app. Foto's blijven in Immich en
worden via `/api/media/...` doorgegeven; routes komen van OpenRouteService, kaarttegels van
OpenStreetMap. Pushmeldingen gebruiken Web Push (VAPID).

Alle data staat in één map (`DATA_DIR`, in de container `/data`):

| Bestand / map       | Inhoud                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| `travelsteps.db`    | SQLite: gebruikers, reizen, posts, reacties, likes, meldingen, sessies |
| `.session-secret`   | Geheim voor sessies **en** de versleuteling van de Immich-sleutels     |
| `.vapid.json`       | Sleutels voor pushmeldingen                                            |
| `uploads/avatars/`  | Profielfoto's                                                          |
| `backups/`          | Nachtelijke databaseback-ups                                           |

## Installeren op de Home Assistant-server

Kies één van de twee manieren.

### Optie A – Docker Compose (HA Supervised/Container, of HA OS met SSH/Portainer)

1. Kopieer de map `code` naar de server, bv. `/share/travelsteps-src`.
2. Maak de configuratie aan:
   ```sh
   cd /share/travelsteps-src
   cp .env.example .env
   nano .env        # minstens TRAVELSTEPS_DATA_DIR, PORT, ADMIN_USERNAME en ADMIN_PASSWORD
   ```
3. Bouwen en starten:
   ```sh
   docker compose up -d --build
   docker compose logs -f
   ```
4. Controle: `curl http://localhost:8080/api/health` → `{"status":"ok","version":"1.0.0"}`.

### Optie B – Home Assistant lokale add-on (HA OS)

1. Installeer in HA de add-on **Samba share** of **Advanced SSH & Web Terminal**.
2. Kopieer de inhoud van de map `code` naar `/addons/travelsteps` (de map met `config.yaml` en
   `Dockerfile`).
3. **Instellingen → Add-ons → Add-on winkel → ⋮ → Controleren op updates**. Onder _Lokale add-ons_
   verschijnt **TravelSteps**. Installeer (bouwen duurt enkele minuten).
4. Vul in het tabblad _Configuratie_ minstens `admin_username` en `admin_password` in en start de
   add-on. De data komt in `/share/travelsteps` (optie `data_dir`).

## Cloudflare Tunnel

1. Installeer de HA-add-on **Cloudflared** of maak een tunnel in het Cloudflare Zero
   Trust-dashboard (**Networks → Tunnels**).
2. Voeg een public hostname toe, bv. `blog.jouwdomein.nl` → service `http://<IP-van-HA>:8080`.
3. Vul `public_url` (`PUBLIC_URL`) in met `https://blog.jouwdomein.nl`; deze wordt als
   contactadres meegestuurd naar de pushdiensten (VAPID).

- Laat `cookie_secure` (`COOKIE_SECURE`) op `true`: Cloudflare levert HTTPS.
- `trust_cloudflare` (`TRUST_CLOUDFLARE`) zorgt dat rate limiting het echte IP gebruikt
  (`CF-Connecting-IP`). De header wordt alleen vertrouwd als de verbinding van localhost of een
  privé-netwerk komt; rechtstreekse verbindingen vanaf internet kunnen hun IP niet vervalsen.
  **Open poort 8080 niet in je router.**
- Testen via `http://<IP-van-HA>:8080` in je LAN zonder HTTPS? Zet dan tijdelijk
  `cookie_secure` op `false`, anders kun je niet inloggen.

## Eerste keer inloggen

Er is geen standaardaccount. De eerste beheerder komt uit de configuratie:

1. Vul vóór de eerste start `admin_username` en `admin_password` (min. 12 tekens) in
   (`ADMIN_USERNAME`/`ADMIN_PASSWORD` in `.env`). Zonder deze waarden start de app niet zolang er
   nog geen gebruikers zijn.
2. Log in; je moet meteen een nieuw wachtwoord kiezen.
3. Via het **profielmenu (avatar rechtsboven) → Gebruikers beheren** maak je gebruikers aan met de
   rol **Reiziger** (reizen en posts maken) of **Kijker** (lezen, liken, reageren). Zij krijgen een
   tijdelijk wachtwoord dat ze bij de eerste login wijzigen.

De admin-opties worden alleen gebruikt als de database leeg is; na de eerste login mag je ze
leegmaken.

Wachtwoord van de enige beheerder kwijt? Stop de app, vul de admin-opties in en verwijder
`travelsteps.db` (alles gaat verloren), of zet een back-up terug.

## Configuratie

| Add-on-optie        | Omgevingsvariabele                 | Standaard            | Uitleg                                                            |
| ------------------- | ---------------------------------- | -------------------- | ----------------------------------------------------------------- |
| –                   | `TRAVELSTEPS_DATA_DIR`             | `/share/travelsteps` | (alleen compose) map op de host voor alle data                    |
| –                   | `PORT`                             | `8080`               | Poort van de webserver                                            |
| `data_dir`          | `DATA_DIR`                         | `/data`              | Datamap (in de container)                                         |
| `admin_username`, `admin_password` | `ADMIN_USERNAME`, `ADMIN_PASSWORD` | –     | Eerste beheerder (alleen bij lege database, wachtwoord ≥ 12)      |
| `public_url`        | `PUBLIC_URL`                       | –                    | Publieke URL (contactadres voor pushdiensten)                     |
| `cookie_secure`     | `COOKIE_SECURE`                    | `true`               | Sessiecookie alleen via HTTPS                                     |
| `trust_cloudflare`  | `TRUST_CLOUDFLARE`                 | `true`               | Client-IP uit `CF-Connecting-IP` halen                            |
| `session_ttl_days`  | `SESSION_TTL_DAYS`                 | `30`                 | Geldigheid sessie (verlengt bij gebruik)                          |
| –                   | `SESSION_SECRET`                   | gegenereerd          | Min. 32 tekens; leeg = willekeurig, bewaard in `.session-secret`  |
| `immich_url`        | `IMMICH_URL`                       | –                    | Adres van Immich (zie hieronder)                                  |
| `ors_api_key`       | `ORS_API_KEY`                      | –                    | OpenRouteService-sleutel voor routes                              |
| `ors_url`           | `ORS_URL`                          | ORS-cloud            | Eigen OpenRouteService-server (optioneel)                         |
| `log_level`         | `LOG_LEVEL`                        | `info`               | `fatal` … `trace`                                                 |
| `backup_keep`       | `BACKUP_KEEP`                      | `7`                  | Aantal nachtelijke back-ups dat bewaard wordt; `0` = uit          |
| –                   | `TZ`                               | –                    | Tijdzone (bepaalt wanneer de nachtelijke back-up draait)          |

In add-on-modus komen de waarden uit de add-on-opties (`/data/options.json`). De actieve waarden
en de status van Immich, routes, push en back-ups staan in **profielmenu → Instellingen**
(alleen-lezen, geheimen gemaskeerd).

## Immich koppelen

Eén Immich-adres voor de hele app; **elke reiziger heeft een eigen API-sleutel**.

1. Vul `immich_url` in: het LAN-adres van Immich, bv. `http://192.168.1.10:2283` (zonder `/api`),
   en herstart.
2. Elke reiziger maakt in Immich een sleutel via **Accountinstellingen → API-sleutels → Nieuwe
   API-sleutel**, met minstens de rechten `asset.read`, `asset.view`, `asset.download`,
   `album.read` en `server.about` (of alle rechten).
3. De reiziger vult de sleutel in bij **Profiel → Immich**, of de beheerder via **Gebruikers
   beheren → Immich-sleutel**. De sleutel wordt versleuteld (AES-GCM, afgeleid van
   `.session-secret`) bewaard.
4. **Instellingen** moet bij Immich "Verbonden" tonen.

Foto's gaan altijd via TravelSteps met de sleutel van wie de foto plaatste. Kijkers hebben geen
toegang tot Immich zelf en zien alleen foto's uit reizen die ze mogen bekijken.

## Routes (OpenRouteService)

1. Maak een gratis account op <https://openrouteservice.org> → **Dashboard → Tokens** en maak
   een sleutel (standaard-quota volstaat).
2. Vul `ors_api_key` (`ORS_API_KEY`) in en herstart.

Wandel-, fiets- en autosegmenten volgen dan paden en wegen; trein, vliegtuig en boot zijn rechte
lijnen. Zonder sleutel (of als ORS onbereikbaar is) worden alle segmenten rechte lijnen. Berekende
routes worden in de post opgeslagen.

## Back-ups en herstellen

**Automatisch:** elke nacht (eerste controle na 03:00 lokale tijd, en bij het starten als die
van vandaag nog ontbreekt) maakt de app een consistente kopie van de database in
`<datamap>/backups/travelsteps-JJJJ-MM-DD.db`. De nieuwste `backup_keep` (standaard 7) blijven
bewaard. De status staat bij **Instellingen**.

**Volledige back-up:** kopieer de hele datamap (bv. `/share/travelsteps`), inclusief
`.session-secret`, `.vapid.json` en `uploads/`. Neem die map mee in de back-ups van Home Assistant
(**Instellingen → Systeem → Back-ups**, map _share_) of je eigen back-upsysteem.

> Zonder `.session-secret` kunnen de opgeslagen Immich-sleutels niet meer ontsleuteld worden en
> moeten reizigers ze opnieuw invullen. Bewaar dat bestand dus samen met de database.

**Herstellen:**

1. Stop de add-on/container.
2. In de datamap: verwijder `travelsteps.db`, `travelsteps.db-wal` en `travelsteps.db-shm`.
3. Kopieer de gewenste back-up: `cp backups/travelsteps-2025-06-01.db travelsteps.db`.
4. Start de app en controleer de inhoud. Iedereen moet opnieuw inloggen als de sessies in de
   back-up verlopen zijn.

## Logs en health check

- Logs (JSON, pino) gaan naar stdout: `docker compose logs -f` of het tabblad _Logboek_ van de
  add-on. Docker Compose roteert ze (`max-size 10m`, 3 bestanden); de Supervisor beheert de logs
  van de add-on zelf.
- `GET /api/health` → `{"status":"ok","version":"…"}`; de container heeft een Docker-`HEALTHCHECK`.

## Upgraden

1. Maak een back-up van de datamap (zie hierboven).
2. Vervang de broncode:
   - **Compose:** kopieer de nieuwe map `code` over de oude (laat `.env` staan) en voer
     `docker compose up -d --build` uit.
   - **Add-on:** kopieer de nieuwe bestanden naar `/addons/travelsteps`, kies in de add-on winkel
     **⋮ → Controleren op updates** en daarna **Bijwerken** bij TravelSteps.
3. Databasemigraties lopen automatisch bij het starten. Controleer de log en **Instellingen**
   (versie).

Opties die niet meer bestaan (zoals `immich_api_key` van vóór 1.0) laat de Supervisor bij de
update vallen. Een Immich-sleutel die nog in die optie stond, vul je in bij **Profiel → Immich**.

Komt je installatie van vóór 0.4 of heette ze nog **BertSteps**? Ook dat gaat automatisch bij
de eerste start: `bertsteps.db` wordt hernoemd naar `travelsteps.db` en Markdown-reizen uit
`<datamap>/travels/` worden in de database gezet (de map wordt `travels.migrated/`). De oude
standaardmap `/share/bertsteps` moet je wel zelf hernoemen naar `/share/travelsteps` (of
`data_dir` erop laten wijzen); de add-on heet anders, dus installeer TravelSteps als nieuwe
add-on, vul de configuratie opnieuw in en verwijder daarna de oude.

## Ontwikkelen

Vereist Node 22+.

```sh
npm install
npm run dev        # API op :8080, Vite op :5173 (proxy naar /api)
npm test           # integratie- en unittests (vitest)
npm run typecheck
npm run lint
npm run build && npm start   # productiebuild lokaal
```

Lokaal draaien zonder Docker: zet `DATA_DIR=./data` en `COOKIE_SECURE=false`.

## Nieuwe versie uitbrengen

Verhoog `version` in `config.yaml` (anders toont de add-on winkel geen update) én `APP_VERSION` in
`server/src/version.ts`. Beide moeten gelijk zijn; een test bewaakt dat.
