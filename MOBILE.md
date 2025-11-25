# 📱 Guida Mobile - Pebble su Android & iOS

Questa guida confronta tutte le opzioni per portare Pebble su smartphone.

---

## 📊 Tabella comparativa

| Opzione | Tempo | Costo | Difficoltà | App Store | Play Store | Funzionalità native |
|---------|-------|-------|------------|-----------|------------|---------------------|
| **PWA** | 2h | €0 | ★☆☆☆☆ | ❌ | ⚠️ (TWA) | ⭐⭐☆☆☆ |
| **Capacitor** | 1-2 giorni | €0-25/anno | ★★☆☆☆ | ✅ | ✅ | ⭐⭐⭐⭐☆ |
| **React Native** | 1-2 settimane | €0-25/anno | ★★★★☆ | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| **Flutter** | 1-2 settimane | €0-25/anno | ★★★★☆ | ✅ | ✅ | ⭐⭐⭐⭐⭐ |

**Costi App Store**:
- 🍎 **Apple**: €99/anno (obbligatorio)
- 🤖 **Google Play**: €25 una tantum (opzionale, puoi usare F-Droid)

---

## ⭐ OPZIONE 1: PWA (Progressive Web App)

### ✅ Vantaggi
- **Installabile** direttamente dal browser
- **Nessun store necessario** (distribuzione diretta)
- **Codice già pronto** (quello che hai)
- **Aggiornamenti istantanei**
- **Funziona offline**
- **Icona home screen** su Android/iOS

### ❌ Svantaggi
- Non nelle ricerche degli store
- Funzionalità limitate (no fotocamera, GPS limitato)
- Notifiche push complicate su iOS

### 🚀 Setup (già fatto!)

Ho già aggiunto i file:
- ✅ `manifest.json` — configurazione PWA
- ✅ `sw.js` — service worker per cache offline
- ✅ Meta tag in `index.html`

**Come testare:**

1. **Pubblica su GitHub Pages** (segui `DEPLOY.md`)

2. **Su Android** (Chrome):
   - Apri il sito
   - Menu → "Aggiungi a schermata Home"
   - L'app si installa!

3. **Su iOS** (Safari):
   - Apri il sito
   - Tap "Condividi" → "Aggiungi a Home"
   - L'app appare come app nativa!

**Distribuzione alternativa (senza store):**
- Condividi il link del sito
- Aggiungi QR code su social/sito web
- Gli utenti la installano da browser

### 📦 Pubblicare su Play Store come TWA (opzionale)

Puoi wrappare la PWA in una "Trusted Web Activity":

```bash
# Installa Bubblewrap
npm install -g @bubblewrap/cli

# Inizializza
bubblewrap init --manifest https://tuosito.github.io/manifest.json

# Genera APK
bubblewrap build

# Upload su Play Console
```

**Costo:** €25 una tantum per account Google Play Developer

---

## ⭐⭐ OPZIONE 2: Capacitor (CONSIGLIATA per te)

### ✅ Perché Capacitor è perfetto per il tuo caso
- Usi il **codice web esistente** (HTML/CSS/JS)
- **Accesso nativo** a fotocamera, notifiche, storage
- **Build per Android + iOS** con un solo progetto
- Mantiene il 95% del codice identico

### 🛠️ Setup Capacitor

```powershell
# 1. Installa Node.js (se non ce l'hai)
# Scarica da: https://nodejs.org

# 2. Inizializza progetto npm
npm init -y

# 3. Installa Capacitor
npm install @capacitor/core @capacitor/cli
npx cap init Pebble com.tuonome.pebble --web-dir .

# 4. Aggiungi piattaforme
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios

# 5. Copia file web nelle app
npx cap sync

# 6. Apri in Android Studio / Xcode
npx cap open android  # Per Android
npx cap open ios      # Per iOS (solo su Mac)
```

### 📱 Aggiungere funzionalità native (esempi)

#### Notifiche Push
```bash
npm install @capacitor/push-notifications
```

```javascript
// In main.js
import { PushNotifications } from '@capacitor/push-notifications';

// Richiedi permesso
await PushNotifications.requestPermissions();

// Notifica quando la lontra ha fame
if(state.hunger < 20){
  PushNotifications.schedule({
    notifications: [{
      title: "La tua lontra ha fame! 🦦",
      body: "Torna a nutrirla!",
      id: 1,
      schedule: { at: new Date(Date.now() + 1000 * 60 * 30) } // 30 min
    }]
  });
}
```

#### Haptic Feedback (vibrazione)
```bash
npm install @capacitor/haptics
```

```javascript
import { Haptics, ImpactStyle } from '@capacitor/haptics';

function feed(){
  // ... existing code
  Haptics.impact({ style: ImpactStyle.Light }); // Vibra!
}
```

#### Condivisione social
```bash
npm install @capacitor/share
```

```javascript
import { Share } from '@capacitor/share';

async function shareOtter(){
  await Share.share({
    title: 'La mia lontra su Pebble!',
    text: `La mia lontra è a livello ${state.level}! 🦦`,
    url: 'https://pebble.app',
  });
}
```

### 📦 Build e pubblicazione

**Android:**
```powershell
# Build APK per testing
cd android
.\gradlew assembleDebug

# Build AAB per Play Store
.\gradlew bundleRelease

# Upload su Play Console
# https://play.google.com/console
```

**iOS (richiede Mac):**
```bash
# Apri in Xcode
npx cap open ios

# In Xcode:
# 1. Seleziona team di sviluppo
# 2. Product → Archive
# 3. Upload su App Store Connect
```

### 💰 Costi
- **Play Store**: €25 una tantum
- **App Store**: €99/anno (obbligatorio)
- **Totale primo anno**: €124

---

## ⭐⭐⭐ OPZIONE 3: React Native / Flutter

### Quando sceglierle
- Vuoi **massime performance** (giochi complessi, animazioni 60fps)
- Hai bisogno di **funzionalità native avanzate**
- Prevedi di **scalare molto** (milioni utenti)

### ⚠️ Svantaggi per il tuo caso
- Devi **riscrivere tutto il codice**
- Curva di apprendimento più ripida
- Tempo sviluppo: 1-2 settimane vs 1-2 giorni con Capacitor

### Setup React Native (se vuoi provare)

```powershell
# Installa React Native CLI
npm install -g react-native-cli

# Crea progetto
npx react-native init Pebble

# Ricostruisci la UI in React
# (dovrai convertire HTML → JSX, CSS → StyleSheet)
```

### Setup Flutter (alternativa)

```powershell
# Scarica Flutter SDK
# https://docs.flutter.dev/get-started/install

# Crea progetto
flutter create pebble

# Ricostruisci la UI in Dart/Flutter widgets
```

**Stima tempo:** 10-15 giorni per ricreare tutto + imparare il framework.

---

## 🆓 OPZIONE 4: Store alternativi (Open Source su iOS)

### F-Droid (Android)
- **100% gratis** e open source
- Nessuna registrazione account
- Community-driven

**Come pubblicare:**
1. Rendi il tuo progetto open source su GitHub
2. Apri issue su [fdroiddata](https://gitlab.com/fdroid/fdroiddata)
3. Loro buildano e pubblicano per te

### AltStore / Sideloadly (iOS)
- **Sideloading gratuito** (senza jailbreak)
- Richiede PC/Mac per installazione
- App deve essere re-installata ogni 7 giorni (limite Apple)

**Meglio:** Usa PWA su iOS (nessun limite di tempo)

---

## 🎯 LA MIA RACCOMANDAZIONE PER TE

### 📱 Strategia in 3 fasi

#### **FASE 1 (Oggi - 2 ore): PWA**
1. ✅ Ho già configurato PWA (manifest + service worker)
2. Genera icone: `.\generate-icons.ps1` (se hai ImageMagick)
3. Pubblica su GitHub Pages: segui `DEPLOY.md`
4. **Risultato**: App installabile gratis su Android/iOS

**Distribuzione:**
- Condividi link sui social
- Gli utenti la installano da browser
- Raccogli feedback

#### **FASE 2 (Tra 1 mese - 2 giorni): Capacitor + Play Store**
1. Setup Capacitor (15 minuti)
2. Build APK Android (30 minuti)
3. Crea account Google Play (€25)
4. Pubblica su Play Store (1 giorno review)
5. **Risultato**: App ufficiale su Play Store

**Vantaggi:** Aumenti visibilità, recensioni, download organici

#### **FASE 3 (Tra 3 mesi - se funziona): App Store iOS**
Se l'app ha successo su Android:
1. Compra Mac (o noleggia Mac in cloud: €20/mese)
2. Iscriviti Apple Developer (€99/anno)
3. Build iOS con Capacitor
4. Pubblica su App Store
5. **Risultato**: App su entrambi gli store

---

## 💡 Suggerimenti extra

### Marketing app mobile
- **Product Hunt** — lancia il prodotto
- **Reddit** r/androidapps, r/iOSGaming
- **IndieHackers** — community indie dev
- **TikTok/Instagram** — video della lontra carina

### Monetizzazione (opzionale futuro)
- **Ads** (Google AdMob) — €0.50-2 per 1000 impression
- **In-app purchases** — accessori premium, rimozione ads
- **Donazioni** — Patreon, Ko-fi per supporter

### Analytics mobile
- **Firebase Analytics** — gratis, completo
- **Amplitude** — free tier generoso

---

## 📋 Checklist rapida

**Per iniziare OGGI (PWA):**
- [x] `manifest.json` creato
- [x] `sw.js` creato
- [x] Meta tag aggiunti
- [ ] Genera icone: `.\generate-icons.ps1`
- [ ] Pubblica su GitHub Pages
- [ ] Testa installazione su telefono

**Per Play Store (dopo):**
- [ ] Installa Node.js
- [ ] Setup Capacitor
- [ ] Build APK
- [ ] Crea account Google Play (€25)
- [ ] Upload app

**Per App Store (molto dopo):**
- [ ] Compra/noleggia Mac
- [ ] Iscriviti Apple Developer (€99/anno)
- [ ] Build iOS
- [ ] Upload app

---

## 🆘 Aiuto e risorse

### Documentazione ufficiale
- [PWA docs](https://web.dev/progressive-web-apps/)
- [Capacitor docs](https://capacitorjs.com/docs)
- [Play Console](https://play.google.com/console)
- [App Store Connect](https://appstoreconnect.apple.com)

### Community
- [Stack Overflow](https://stackoverflow.com/questions/tagged/capacitor)
- [Capacitor Discord](https://discord.gg/UPYYRhtyzp)
- [Reddit r/reactnative](https://reddit.com/r/reactnative)

### Tool utili
- [PWA Builder](https://www.pwabuilder.com) — genera PWA automaticamente
- [App Icon Generator](https://icon.kitchen) — genera tutte le icone
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) — testa PWA

---

**Inizia con PWA oggi stesso, poi scala se vedi trazione! 🚀🦦**
