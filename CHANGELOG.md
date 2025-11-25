# Changelog - Pebble 🦦

## [v2.0] - 18 novembre 2025

### 🎨 Grafica completamente rinnovata
- **Lontra SVG dettagliata** con anatomia realistica:
  - Corpo con gradiente radiale naturale
  - Zampe anteriori e posteriori
  - Coda animata
  - Orecchie, muso, naso con highlight
  - Punti baffi decorativi
- **Dimensioni aumentate**: da 320x220 a 360x240px per maggiore dettaglio
- Ombre più morbide e profonde (feDropShadow migliorato)

### 😊 Sistema emotivo avanzato
- **4 stati d'animo**: neutrale, felice, triste, assonnato
- **Espressioni facciali dinamiche**:
  - Bocca che cambia forma (sorriso/smorfie)
  - Sopracciglia espressive
  - Guance arrossate quando felice
  - Occhi socchiusi quando assonnato
- **Mood automatico** basato su statistiche vitali
- Animazione coda che scodinzola quando la lontra è felice

### 🎬 Animazioni migliorate
- **Mangiare**: 
  - Salto con bounce effect (cubic-bezier)
  - Animazione "bob" verticale (3 ripetizioni)
  - Icona cibo che fluttua e scompare
- **Bagnare**: scuotimento laterale (4 ripetizioni)
- **Dormire**: filtro grayscale + stato assonnato
- **Blink**: battito ciglia naturale (ogni 4-6 secondi)
- Tail wag infinito in modalità happy
- Transizioni smooth su tutte le animazioni

### 🔊 Sistema audio
- **Web Audio API** per effetti sonori procedurali
- Suoni per:
  - Mangiare (tono discendente)
  - Giocare (tono ascendente)
  - Bagnare (onda quadra)
- Nessuna dipendenza esterna, audio lightweight

### 📊 UI migliorata
- **Barre colorate dinamicamente**:
  - Verde: livello normale (> 30%)
  - Arancione: livello basso (< 30%)
  - Rosso pulsante: livello critico (< 15%)
- Animazione pulse per stati critici
- Transizioni smooth sui cambi di colore (0.4s ease)

### 🎩 Accessori potenziati
- Cappello con drop-shadow per effetto 3D
- Posizionamento assoluto preciso
- Dimensione aumentata (24px)

### 🐛 Fix & ottimizzazioni
- Rimosse animazioni CSS `d:path()` (incompatibili Safari)
- Gestione espressioni via JavaScript (cross-browser)
- Codice più modulare e leggibile
- Performance migliorate con transizioni hardware-accelerated

### 📖 Documentazione
- README espanso con:
  - Screenshot placeholder
  - Istruzioni dettagliate
  - Roadmap future features
  - Struttura file
  - Differenze da Pou
- Aggiunto CHANGELOG.md

---

## [v1.0] - 18 novembre 2025 (versione iniziale)

### Funzionalità base
- Lontra SVG semplice
- Sistema di statistiche (4 barre)
- Azioni: mangia, gioca, bagna, dormi
- Mini-gioco cattura-pesci
- Negozio base
- Salvataggio localStorage
- Animazioni basilari (hop, blink)

---

**Prossimi aggiornamenti pianificati**: 
- v2.1: Più mini-giochi e backgrounds animati
- v2.2: Sistema di livelli e achievements
- v3.0: PWA e sincronizzazione cloud
