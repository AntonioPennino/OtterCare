# OtterCare 🦦 — Gioco di cura della lontra

Un adorabile gioco web per prendersi cura di una lontra, ispirato a Pou ma con un'estetica più tenera e meno inquietante.

**🎮 [GIOCA ORA](https://antoniopennino.github.io/OtterCare/)** | 📱 Installabile su mobile come app!

## ✨ Caratteristiche

### Sistema di cura completo
- **Statistiche vitali**: Fame, Felicità, Pulizia, Energia (con barre colorate dinamiche)
- **Azioni interattive**: 
  - 🍎 Dai da mangiare (aumenta fame & felicità, costa 5 monete)
  - 🎮 Gioca (mini-gioco con pesci, guadagna monete)
  - 💧 Bagna (aumenta pulizia & felicità)
  - 😴 Fai dormire (recupera energia & felicità)

### Lontra animata avanzata (100% custom SVG)
- **SVG dettagliata** disegnata a mano con corpo, testa, zampe, coda e orecchie
- **Espressioni facciali dinamiche**: felice 😊, triste 😢, assonnato 😴, neutrale 😐
- **Animazioni fluide**:
  - Salto quando mangia
  - Scuotimento quando si bagna
  - Battito ciglia periodico
  - Movimento della coda quando è felice
  - Effetto sonno con filtro grayscale
  - Icona cibo che appare e scompare

### Sistema emotivo intelligente
- La lontra cambia espressione **automaticamente** in base alle sue statistiche
- Guance arrossate quando è molto felice (>70%)
- Sopracciglia espressive che si muovono
- Stati d'animo realistici (tiene conto di fame, felicità ed energia)

### Audio procedurale
- Effetti sonori generati in tempo reale con **Web Audio API**
- Suoni per mangiare, giocare, fare il bagno
- Nessun file audio esterno necessario

### Mini-gioco "Cattura Pesci"
- **Cattura pesci**: clicca i pesci 🐟 che appaiono per guadagnare monete e felicità
- Timer di 10 secondi
- Spawn dinamico di pesci
- +2 monete e +4 felicità per ogni pesce catturato

### Negozio
- Compra accessori con le monete guadagnate
- 🎩 Cappello decorativo (50 monete)
- Sistema espandibile per futuri oggetti

### Navigazione mobile-first
- **Barra di navigazione inferiore** (stile iOS/Android)
- 3 pagine: 🦦 Lontra, 🏪 Negozio, 📊 Statistiche
- Switching fluido tra le viste
- Layout ottimizzato per schermi piccoli

### Pagina Statistiche
- Monete totali guadagnate
- Partite giocate al mini-gioco
- Pesci catturati
- Oggetti acquistati
- Tracking automatico di tutte le azioni

### Salvataggio automatico
- Persistenza automatica con `localStorage`
- Salvataggio ogni 4 secondi
- Caricamento automatico all'avvio
- Pulsante "Reset" per ricominciare da capo

### PWA (Progressive Web App)
- **Installabile su Android e iOS** come app nativa
- Funziona offline
- Icone e manifest configurati
- Service Worker per caching
- Guida completa in [`MOBILE.md`](MOBILE.md)

## 🎮 Come giocare

### Online (consigliato)
Vai su **[https://antoniopennino.github.io/OtterCare/](https://antoniopennino.github.io/OtterCare/)** e inizia a giocare!

### Locale
1. Scarica il repository
2. Apri `index.html` nel browser (Chrome, Firefox, Safari, Edge)
3. Inizia a curare la tua lontra!

### Su mobile
1. Apri il link nel browser mobile
2. Menu → "Aggiungi a schermata Home" / "Installa app"
3. L'app si apre come un'app nativa!

Leggi [`MOBILE.md`](MOBILE.md) per istruzioni dettagliate su iOS/Android.

## 📋 Meccaniche di gioco

### Decadimento automatico
Le statistiche calano gradualmente ogni 5 secondi:
- **Fame**: -0.5/tick
- **Felicità**: -0.25/tick (aumenta se fame o pulizia sono basse)
- **Pulizia**: -0.15/tick
- **Energia**: -0.4/tick

### Codifica colori barre
- 🟢 Verde: > 30%
- 🟠 Arancione: 15-30% (classe `.low`)
- 🔴 Rosso: < 15% (classe `.critical`)

### Conseguenze delle statistiche basse
- Fame < 20%: felicità cala più velocemente (-0.5/tick extra)
- Pulizia < 20%: felicità cala più velocemente (-0.3/tick extra)

### Sistema di ricompense
- 🐟 Ogni pesce catturato: +2 monete, +4 felicità
- 🎮 Mini-gioco tracciato nelle statistiche
- 🛒 Acquisti tracciati permanentemente

## 🎨 Design e UX

- **Palette colori**: toni caldi e naturali (marrone #8B6F47, beige #F5E6D3, verde acqua #66CDAA)
- **Animazioni smooth**: cubic-bezier per rimbalzi realistici
- **Responsive**: media queries per 820px, 480px, landscape
- **Typography fluida**: `clamp()` per dimensioni adattive
- **Touch-friendly**: pulsanti grandi (min 44x44px)
- **Accessibilità**: contrasti adeguati, no animazioni invasive

## 🔧 Stack tecnologico

- **HTML5** con SVG inline (220 righe di codice)
- **CSS3** con animazioni keyframe, grid, flexbox
- **Vanilla JavaScript** (zero dipendenze, 375+ righe)
- **Web Audio API** per effetti sonori procedurali
- **LocalStorage API** per persistenza
- **PWA** con Service Worker e manifest.json
- **GitHub Pages** per hosting

## 🚀 Roadmap futura

### Grafica
- [ ] Più pose per la lontra (nuotare, correre, saltare)
- [ ] Sfondi animati (stagioni, giorno/notte, meteo)
- [ ] Sistema particellare (bolle, cuori, stelle)
- [ ] Più accessori (occhiali da sole, sciarpe, papillon)
- [ ] Generazione PNG icons reali (attualmente emoji)

### Gameplay
- [ ] Più mini-giochi (puzzle, memory, corsa)
- [ ] Sistema di livelli/esperienza/progressione
- [ ] Missioni giornaliere con ricompense
- [ ] Achievements/sblocchi
- [ ] Sistema di cibo varietà (mela, pesce, granchio)

### Social
- [ ] Condivisione screenshot della lontra
- [ ] Classifiche globali
- [ ] Modalità multiplayer (visita lontre amici)
- [ ] Sistema di regali tra giocatori

### Tecnico
- [ ] Sincronizzazione cloud (Firebase/Supabase)
- [ ] Notifiche push (quando la lontra ha bisogno di cure)
- [ ] Versione native app (Capacitor) per store
- [ ] Internazionalizzazione (i18n)
- [ ] Dark mode

## 📦 Struttura progetto

```
OtterCare/
├── index.html              # Struttura HTML + SVG lontra inline
├── style.css              # Stili, animazioni, responsive
├── main.js                # Game logic, stato, audio, UI
├── manifest.json          # PWA config
├── sw.js                  # Service Worker per offline
├── README.md              # Questa documentazione
├── CHANGELOG.md           # Storia versioni
├── MOBILE.md              # Guida installazione mobile
├── RESOURCES.md           # Risorse e crediti
├── EXAMPLES.md            # Esempi di codice
├── TEST-PWA.md            # Test PWA
├── DEPLOY.md              # Guida deploy
├── LICENSE                # CC BY-NC-ND 4.0
├── deploy.ps1             # Script deploy automatico
├── generate-icons.ps1     # Genera icone PNG (ImageMagick)
└── generate-icons-simple.ps1  # Genera icone (.NET)
```

## 🎯 Differenze da Pou

| Aspetto | Pou | OtterCare |
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
- **Repository**: [OtterCare](https://github.com/AntonioPennino/OtterCare)
- **Demo live**: [https://antoniopennino.github.io/OtterCare/](https://antoniopennino.github.io/OtterCare/)

---

**Buon divertimento con la tua lontra! 🦦💙**

*Creato con ❤️ per chi ama gli animali carini e i giochi rilassanti*

> ⚠️ **Nota legale**: OtterCare è un progetto originale protetto da copyright. L'uso commerciale, la copia del codice o delle grafiche senza autorizzazione è vietato. Per collaborazioni commerciali, contattare l'autore.


## ✨ Caratteristiche

### Sistema di cura completo
- **Statistiche vitali**: Fame, Felicità, Pulizia, Energia (con barre colorate dinamiche)
- **Azioni interattive**: 
  - 🍎 Dai da mangiare (aumenta fame & felicità)
  - 🎮 Gioca (mini-gioco con pesci, guadagna monete)
  - 💧 Bagna (aumenta pulizia)
  - 😴 Fai dormire (recupera energia)

### Lontra animata avanzata
- **SVG dettagliata** con corpo, testa, zampe, coda e orecchie
- **Espressioni facciali dinamiche**: felice, triste, assonnato, neutrale
- **Animazioni fluide**:
  - Salto quando mangia
  - Scuotimento quando si bagna
  - Battito ciglia periodico
  - Movimento della coda quando è felice
  - Effetto sonno con filtro grayscale

### Sistema emotivo
- La lontra cambia espressione in base alle sue statistiche
- Guance arrossate quando è molto felice
- Sopracciglia espressive
- Stati d'animo realistici

### Audio
- Effetti sonori semplici usando Web Audio API
- Suoni per mangiare, giocare, bagnare

### Mini-gioco
- **Cattura pesci**: clicca i pesci che appaiono per guadagnare monete e felicità
- Timer di 10 secondi
- Ricompense dinamiche

### Negozio
- Compra accessori con le monete guadagnate
- Cappello decorativo (demo)
- Espandibile con più oggetti

### Salvataggio
- Persistenza automatica con `localStorage`
- Salvataggio ogni 4 secondi
- Caricamento automatico all'avvio

## 🎮 Come giocare

1. Apri `index.html` nel browser (compatibile con tutti i browser moderni)
2. Interagisci con i pulsanti per curare la lontra
3. Gioca al mini-gioco per guadagnare monete
4. Compra accessori nel negozio
5. I tuoi progressi vengono salvati automaticamente!

### 📱 Vuoi giocare su smartphone?
L'app è **installabile su Android e iOS**! Leggi la guida completa in [`MOBILE.md`](MOBILE.md) per:
- PWA (installazione diretta dal browser - gratis)
- Pubblicazione su Play Store e App Store
- Alternative open source (F-Droid)

### Comandi rapidi (Windows PowerShell)
```powershell
# Apri nel browser predefinito
Start-Process .\index.html

# Oppure usa un server locale (opzionale)
python -m http.server 8000
# Poi apri http://localhost:8000
```

## 📋 Meccaniche di gioco

### Decadimento automatico
- Le statistiche calano lentamente nel tempo (ogni 5 secondi)
- Fame, felicità, pulizia ed energia diminuiscono gradualmente
- Se la fame è troppo bassa, la felicità cala più rapidamente
- Barre rosse indicano livelli critici (< 15%)
- Barre arancioni indicano livelli bassi (< 30%)

### Sistema di ricompense
- Giocare al mini-gioco dà monete
- Le monete possono essere spese nel negozio
- Interazioni aumentano la felicità della lontra

## 🎨 Design e UX

- **Palette colori**: toni caldi e naturali (marrone, beige, verde acqua)
- **Animazioni smooth**: cubic-bezier per rimbalzi realistici
- **Responsive**: si adatta a schermi mobili e desktop
- **Accessibilità**: etichette ARIA, contrasti adeguati

## 🔧 Tecnologie utilizzate

- **HTML5** per la struttura
- **CSS3** con animazioni keyframe avanzate
- **Vanilla JavaScript** (nessuna dipendenza)
- **SVG** per grafica vettoriale scalabile
- **Web Audio API** per effetti sonori
- **LocalStorage API** per persistenza

## 🚀 Espansioni future suggerite

### Grafica
- [ ] Più sprite/pose per la lontra (nuotare, correre)
- [ ] Sfondi animati (stagioni, giorno/notte)
- [ ] Particelle (bolle, cuori, stelle)
- [ ] Più accessori (occhiali, sciarpe, cappelli)

### Gameplay
- [ ] Più mini-giochi (puzzle, memory, catch)
- [ ] Sistema di livelli/esperienza
- [ ] Missioni giornaliere
- [ ] Sblocchi progressivi
- [ ] Tavola di classifiche

### Audio/Visual
- [ ] Musica di sottofondo rilassante
- [ ] Più effetti sonori (libreria Howler.js)
- [ ] Animazioni con anime.js o GSAP
- [ ] Temi personalizzabili

### Tecniche
- [ ] PWA (Progressive Web App) per installazione
- [ ] Sincronizzazione cloud (Firebase)
- [ ] Multiplayer/social (condividi la tua lontra)
- [ ] Versione mobile nativa (Capacitor/Cordova)

## 📦 Struttura file

```
Otter/
├── index.html      # Struttura principale e SVG lontra
├── style.css       # Stili e animazioni
├── main.js         # Logica di gioco e gestione stato
└── README.md       # Documentazione
```

## 🎯 Differenze da Pou

- ✅ Design più tenero e naturalistico
- ✅ Espressioni facciali più varie e delicate
- ✅ Palette colori calda e accogliente
- ✅ Animazioni fluide e non brusche
- ✅ Suoni soft e non invasivi
- ✅ Nessun elemento inquietante o disturbante

## 🤝 Contribuire

Questo è un progetto open-source! Sentiti libero di:
- Aggiungere nuove funzionalità
- Migliorare le animazioni
- Creare più mini-giochi
- Ottimizzare le performance
- Tradurre in altre lingue

## 📄 Licenza

Questo progetto è libero da usare per scopi personali ed educativi.

---

**Buon divertimento con la tua lontra! 🦦💙**

*Creato con ❤️ per chi ama gli animali carini e i giochi rilassanti*