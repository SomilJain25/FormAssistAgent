# What was fixed

## Backend (FastAPI)
- Spoken-email rule turned every " at " into "@" ("I live at Indore" -> "I live@Indore"). Now only real "x at y dot z" patterns convert, incl. dots in the name part.
- Dates normalised to DD-MM-YYYY (12/05/2001, 5-3-99, 15th August 1999); validator accepts them.
- Income: robust parsing of "three lakh rupees", "2.5 lakh", "Rs 250000", "two crore fifty lakh"; value no longer swallows the whole sentence.
- City detection ("I live in Indore", "from Bhopal"); name no longer taken from "I am female from ..." or from "father's name is ...".
- Income digits are no longer mistaken for a PIN code.
- Field mapping: single-letter ids no longer match everything ("d" in "date of birth"); "name" no longer claims Father/Mother fields.
- /analyze: "missing fields" now based on fields that really exist on the form (it compared entity types to HTML input types before); no longer errors on empty entities.
- easyocr imported lazily (app starts even if OCR deps are heavy/absent); Dockerfile uses CPU-only torch and Render's $PORT; CORS no longer combines "*" with credentials.

## Extension
- Fill results always showed 0 (returned before fills ran) - fixed, fills are synchronous.
- React/Vue controlled inputs ignored filled values - now uses the native value setter.
- Date inputs get YYYY-MM-DD; number inputs digits only; radios/checkboxes use click().
- Fields without id/name could never be filled - every scanned element is tagged; ids are CSS-escaped; radio groups listed once.
- Transcript/listening state kept in chrome.storage via the service worker, so closing the popup no longer loses it.
- Mic errors no longer loop forever; clear messages for blocked mic / http pages.
- Double injection guard; no more "message port closed" errors.
- API client: 70 s timeout + retry and a wake-up ping for Render's sleeping free tier.
- Popup cleanup: duplicate tab buttons, stray characters and unused Vite template files removed.
