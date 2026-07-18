# Voice Form Assistant

A Chrome extension that lets you fill online forms by speaking. You open a form, click the mic, say something like "my name is Somil Jain, email is somil@gmail.com, phone 9876543210" — and the fields fill themselves.

Built this because filling the same details on every scholarship/government/job application form is genuinely annoying. Especially on mobile or when you're filling 10 forms in a day.

---

## What it does

- Listens to your voice using the Web Speech API
- Figures out what you said (name, email, phone, DOB, income, etc.) using spaCy NLP on a FastAPI backend
- Matches those values to the actual input fields on the page using fuzzy matching
- Shows you what it's about to fill so you can approve, edit, or reject before anything gets written
- Remembers your details so next time you don't have to speak again — just hit "fill from profile"
- Works in Hindi too. "मेरा नाम सोमिल जैन है" works exactly the same way
- Can read scanned paper forms via OCR (EasyOCR) if you upload an image or PDF

---

## Tech used

**Extension** — React, TypeScript, Vite, Chrome Manifest V3, Web Speech API

**Backend** — FastAPI, spaCy, rapidfuzz, EasyOCR, pdf2image, SQLAlchemy

**Database** — SQLite locally, PostgreSQL in production

**Infra** — Docker, Docker Compose, deployable on Render or Railway

---

## Getting it running locally

You need Node.js 18+, Python 3.11+, and Chrome.

### Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
python -m spacy download en_core_web_sm

cp .env.example .env
uvicorn main:app --reload --port 8000
```

API docs at `http://localhost:8000/docs` once it's running.

### Extension

```bash
cd extension
npm install
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Turn on Developer mode (top right)
3. Click Load unpacked → select `extension/dist/`
4. Pin it from the extensions toolbar

### Mic permission

Chrome won't give the extension popup direct mic access — that's a Chrome security thing. The fix is to grant permission to the actual webpage instead:

1. Open any `https://` page
2. Click the lock icon in the address bar
3. Set Microphone to Allow
4. Refresh the page
5. Now click the extension and Start Listening

---

## How to use it

Open any form — a job application, a scholarship form, a government portal, anything.

Click the extension icon, pick your language, hit Start and just talk:

> "My name is Somil Jain. Email somil@gmail.com. Phone 9876543210. Date of birth 25th march 2005. Annual income three lakh rupees. City Bhopal, Madhya Pradesh."

Click Stop, then "Extract & Review Mappings". It switches to a review screen showing every field it wants to fill and what value it's going to use. Green rows are high-confidence matches that got auto-approved. Lower confidence ones need you to manually approve, edit, or reject.

Once you're happy, click Fill — the fields populate with a brief green highlight so you can see what changed.

Your details get saved automatically after each successful fill. Next time you open a form, go to the Profile tab and hit "Fill from Profile" — skips the voice step entirely.

---

## Hindi

Switch the language dropdown to Hindi before clicking Start.

Works with things like:
- "मेरा नाम सोमिल जैन है"
- "मेरी वार्षिक आय तीन लाख रुपये है"

Mixed Hindi-English also works fine — "मेरा नाम Somil है और my email is somil@gmail.com" gets handled correctly.

---

## OCR (scanned forms)

Some forms are PDFs or scanned images where there are no actual HTML input fields. For those:

1. Go to the OCR tab in the extension
2. Upload the image or PDF
3. It detects the field labels via EasyOCR
4. Then go to Speech, speak your details, and map against the OCR-detected fields

---

## API endpoints

```
POST /api/v1/extract     — takes transcript text, returns extracted entities
POST /api/v1/map         — takes entities + form fields, returns confidence-scored mappings
POST /api/v1/analyze     — validates values, detects missing fields, gives completion %
POST /api/v1/ocr/parse   — takes image/PDF upload, returns detected form fields
GET  /api/v1/profile/:id — fetch saved profile fields
POST /api/v1/profile/save
```

Test all of them at `http://localhost:8000/docs`.

---

## What gets extracted

Handles: name, father's name, mother's name, email, phone, date of birth, annual income, address, city, state, pincode, gender, category, nationality.

Income conversion works for spoken amounts — "three lakh" becomes 300000, "fifty thousand" becomes 50000.

Email handles spoken format — "somil at gmail dot com" normalizes to somil@gmail.com before extraction.

---

## Docker (for production)

```bash
# at project root
cp .env.example .env
# fill in your values in .env

docker-compose up --build
```

Starts PostgreSQL and the FastAPI backend together. Backend at port 8000, Postgres at 5432.

If the build times out (EasyOCR pulls PyTorch which is ~700MB), just run it again — Docker caches completed layers so it picks up where it left off.

Known issue with `requirements.txt`: spaCy pins `typer<0.10.0` but newer FastAPI pulls in `fastapi-cli` which needs `typer>=0.15`. Fixed by using `fastapi==0.109.2` and `typer==0.9.4` explicitly.

---

## Deploying to Render or Railway

Both work fine. The setup is roughly:

1. Push to GitHub
2. Create a PostgreSQL instance on your platform
3. Create a web service pointing to the `backend/` folder, set to Docker mode
4. Set these env vars:
   - `DATABASE_URL` — your postgres connection string (auto-filled on Railway)
   - `ALLOWED_ORIGINS` — `chrome-extension://your-extension-id`
   - `ENVIRONMENT` — `production`
5. Once deployed, update `API_BASE` in `extension/src/services/api.ts` to your live URL and rebuild

Note: Render's free tier spins down after 15 minutes idle, so the first request after a gap takes ~30-60s. Fine for demos, annoying for real use.

---

## Project structure

```
voice-form-assistant/
├── extension/
│   ├── src/
│   │   ├── popup/          # React UI
│   │   ├── content/        # contentScript.ts — form scanner + autofill
│   │   ├── background/     # service worker
│   │   ├── components/     # FieldPanel, ReviewPanel, ProfileTab, OCRPanel, IntelligencePanel
│   │   ├── hooks/          # useSpeechRecognition, useFormScanner, useReview, useProfile
│   │   └── services/       # api.ts, profileStorage.ts
│   ├── public/manifest.json
│   └── popup.html
│
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── routers/            # extract, map, analyze, ocr, profile
│   ├── services/           # nlp, hindi_nlp, mapping, validation, ocr, pdf
│   └── models/             # schemas.py (Pydantic), db_models.py (SQLAlchemy)
│
└── docker-compose.yml
```

---

## Known issues / things I'd improve with more time

- The OCR field detection works well on clean printed forms but struggles with handwriting or low-res scans. A better preprocessing step (deskewing, contrast enhancement) would help.
- Render free tier cold starts are annoying. Worth paying for the $7/mo starter if you're actually using this.
- Profile sync across devices requires the backend to be running. If you're offline, it falls back to Chrome Storage which is local only.
- The spaCy model (`en_core_web_sm`) is pretty lightweight and occasionally gets names wrong if they're uncommon. The intro-pattern matching (`"my name is X"`) compensates for this and usually wins.

---

## Stuff it's been tested on

- W3Schools HTML form examples
- Common scholarship application forms
- Job application portals
- Government registration forms (eSeva type)
- Any form with standard label → input structure

Forms with unusual layouts (tables, floating labels, label-less fields using placeholder only) generally still work because the field scanner checks label, placeholder, name attribute, and id — not just one of them.

---

## License

MIT — do whatever you want with it.