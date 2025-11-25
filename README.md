# Pebble 🦦 — Gioco di cura della lontra

Un adorabile gioco web per prendersi cura di una lontra, ispirato a Pou ma con un'estetica più tenera e meno inquietante.

**🎮 [GIOCA ORA](https://antoniopennino.github.io/Pebble/)** | 📱 Installabile su mobile come app!

## ✨ Caratteristiche

- **Lontra interattiva** in SVG con animazioni morbide e stati emotivi dinamici
- **Statistiche in tempo reale** (fame, felicità, pulizia, energia) con alert visivi e sonori
- **Mini-gioco pesca** a tempo per guadagnare monete e sbloccare ricompense
- **Tutorial guidato** al primo avvio con sovrapposizioni contestuali
- **Analytics locali opt-in** per tracciare le interazioni principali senza inviare dati esterni
- **PWA installabile** con service worker e prompt di aggiornamento automatico
- **Backup locali + Cloud sync** tramite Supabase con codice di recupero

## 🕹️ Gameplay

1. Avvia il gioco e segui il tutorial per imparare le azioni base.
2. Usa i pulsanti nel menù inferiore per nutrire, giocare, lavare o far riposare la lontra.
3. Avvia il mini-gioco dalla sezione *Gioca*: cattura i pesci che appaiono sullo schermo entro 10 secondi.
4. Accedi alla sezione statistiche per controllare lo storico e monitorare gli avvisi critici.
5. Le statistiche decadono lentamente: pianifica le azioni per mantenere la lontra felice.

## 📱 Mobile e PWA

- Installabile direttamente dal browser (Chrome, Edge, Safari mobile) tramite banner PWA.
- Supporto full-screen, caching offline e prompt di aggiornamento quando esce una nuova versione.
- Guida completa per Android/iOS in [`MOBILE.md`](MOBILE.md).

## 🧱 Struttura progetto

```
Pebble/
├── index.html               # Shell dell'app, overlay tutorial, include dist/index.js
├── style.css                # Stili responsive, layout mobile, animazioni
├── sw.js                    # Service worker con cache versionata e skipWaiting
├── manifest.json            # PWA manifest con scope GitHub Pages
├── dist/                    # Output TypeScript (ES modules pronti per il browser)
│   ├── index.js             # Bootstrap UI, eventi service worker
│   ├── state.js             # Stato persistente e tick logica
│   ├── ui.js                # Rendering, navigazione, alert
│   ├── gameActions.js       # Azioni principali e ricompense
│   ├── minigame.js          # Logica mini-gioco pesca
│   ├── audio.js             # Effetti Web Audio
│   └── analytics.js         # Tracker eventi opzionale
├── src/                     # Sorgenti TypeScript equivalenti
│   └── ...
├── tests/basic.spec.ts      # Smoke test Playwright
├── playwright.config.ts     # Config Playwright con web server integrato
├── tsconfig.json            # Config TypeScript (moduleResolution bundler, outDir dist)
├── package.json             # Script npm per build, serve e test
├── CHANGELOG.md             # Cronologia versioni
├── README.md                # Questa documentazione
├── MOBILE.md                # Istruzioni installazione mobile native/PWA
└── LICENSE                  # CC BY-NC-ND 4.0
```

## 🛠️ Ambiente di sviluppo

```powershell
# installa le dipendenze
npm install

# compila TypeScript in dist/
npm run build

# avvia un server statico locale (http://localhost:4173)
npm run serve

# esegui gli smoke test end-to-end
npm test

# verifica che TypeScript compili senza generare output
npm run lint
```

## ☁️ Cloud sync (Supabase)

La sincronizzazione cloud è opzionale e richiede un progetto Supabase (piano free sufficiente per i salvataggi compressi).

1. Crea un progetto su [Supabase](https://supabase.com) e annota `PROJECT_URL` e `ANON_KEY`.
2. Nella sezione SQL esegui:

	 ```sql
	 create table if not exists pebble_saves (
		 id text primary key,
		 state jsonb not null,
		 updated_at timestamptz not null default timezone('utc', now())
	 );

	 alter table pebble_saves enable row level security;

	 create policy "anon upsert" on pebble_saves
		 for insert with check (auth.role() = 'anon');

	 create policy "anon update" on pebble_saves
		 for update using (auth.role() = 'anon')
		 with check (auth.role() = 'anon');

	 create policy "anon select" on pebble_saves
		 for select using (auth.role() = 'anon');

	 create policy "anon delete" on pebble_saves
		 for delete using (auth.role() = 'anon');
	 ```

	 > I salvataggi sono protetti da un codice casuale a 16 byte; conservalo privatamente.

3. Copia `config.example.js` in `config.js` (ignorato da git) e incolla le tue chiavi:

	 ```js
	 window.PEBBLE_CONFIG = {
		 supabaseUrl: "https://<YOUR-ID>.supabase.co",
		 supabaseAnonKey: "ey..."
	 };
	 ```

4. Rifai la build (`npm run build`) e apri l'app: nella sezione **Statistiche → Impostazioni** troverai la card “Sincronizzazione cloud”.

Una volta attivata, Pebble genera un codice (es. `abcd-1234-efgh-5678`): usalo per collegare più dispositivi o ripristinare i progressi dopo un wipe completo. Puoi comunque esportare un backup manuale JSON per ulteriore sicurezza.

## 🤖 Test automatici

I test Playwright ripuliscono automaticamente `localStorage`, mostrano il tutorial
e verificano il corretto avvio del mini-gioco. In esecuzione locale il service worker
non viene registrato: è normale vedere un warning 404 durante i test.

## 🎯 Differenze da Pou

| Aspetto | Pou | Pebble |
|---------|-----|-----------|
| Design | Alieno marrone | Lontra naturalistica |
| Espressioni | Semplici | 4 emozioni con morfing SVG |
| Palette | Scura, satura | Calda, pastello |
| Animazioni | Basilari | Fluide con cubic-bezier |
| Audio | File pre-registrati | Procedurali Web Audio |
| Mobile | App nativa | PWA installabile |
| Codice | Proprietario | Open source (protetto) |

## 📄 Licenza e Copyright

**Copyright © 2025 Antonio Pennino - Tutti i diritti riservati**

Questo progetto è distribuito sotto licenza **Creative Commons BY-NC-ND 4.0**:
- ✅ **Puoi**: condividere e usare per scopi personali/educativi
- ❌ **Non puoi**: usarlo commercialmente, modificarlo o venderlo senza permesso scritto
- 📧 **Per licenze commerciali**: contatta l'autore

Il codice, la grafica SVG della lontra e il concept sono proprietà intellettuale protetta.

Vedi il file [`LICENSE`](LICENSE) per i termini completi.

## 🤝 Contribuire

Per contribuire:
1. Apri una Issue descrivendo la tua idea
2. Aspetta l'approvazione prima di fare modifiche
3. Le PR devono rispettare lo stile di codice esistente
4. Ogni contributo rimane sotto la licenza CC BY-NC-ND 4.0

## 🐛 Bug Report

Hai trovato un bug? Apri una Issue su GitHub con:
- Browser e versione
- Sistema operativo
- Passi per riprodurre il problema
- Screenshot se possibile

## 📞 Contatti

- **GitHub**: [@AntonioPennino](https://github.com/AntonioPennino)
- **Repository**: [Pebble](https://github.com/AntonioPennino/Pebble)
- **Demo live**: [https://antoniopennino.github.io/Pebble/](https://antoniopennino.github.io/Pebble/)

---

**Buon divertimento con la tua lontra! 🦦💙**

*Creato con ❤️ per chi ama gli animali carini e i giochi rilassanti*

> ⚠️ **Nota legale**: Pebble è un progetto originale protetto da copyright. L'uso commerciale, la copia del codice o delle grafiche senza autorizzazione è vietato. Per collaborazioni commerciali, contattare l'autore.
