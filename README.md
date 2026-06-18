# Bergen Tang og Tare AS — Kundesupport-applikasjon

Prototype for kundesupport-portal, bygd til ITK2004 tverrfaglig eksamen 18.06.2026.

## Funksjonalitet
- Kunder kan sende inn spørsmål/henvendelser (Create)
- Kunder finner igjen sin sak via sakenummer + e-post, og ser eventuelle svar fra ansatte (Read)
- Kunder kan redigere tittel, beskrivelse og kategori på egne saker (Update)
- Kunder kan slette egne saker (Delete)
- Universell utforming: skip-link, synlig fokusring, ARIA-live status, semantisk HTML, kontrastfarger

## Teknisk
- Frontend: vanilla HTML/CSS/JS, ingen build-steg
- Backend: Supabase (Postgres) med Row Level Security
- Datamodell: 8 tabeller (kunder, ansatte, kategorier, forespørsler, svar, interne_kommentarer, vedlegg, vurderinger) — se `database/btt-support.dbml`
- `interne_kommentarer` er fysisk separert fra `svar` og RLS-blokkert for anon-rollen — kundeportalen kan aldri lese interne notater, uavhengig av applikasjonskode (innebygd personvern)

## Kjøre lokalt
Åpne `index.html` direkte i nettleser, eller:
```
python -m http.server 8000
```
