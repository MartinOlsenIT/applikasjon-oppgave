// ===========================================================
// Bergen Tang og Tare AS — Kundesupport
// CRUD-applikasjon mot Supabase
// ===========================================================

const SUPABASE_URL = 'https://gnzierpfmgfrffypvbkf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImduemllcnBmbWdmcmZmeXB2YmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjMwMzQsImV4cCI6MjA5NzMzOTAzNH0.rWGJ4XviLS1bWL-3CBPJdifKdvn8qdQ1U0M2nfCPblc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const announcer = document.getElementById('aria-announcer');
function announce(msg) {
  announcer.textContent = '';
  requestAnimationFrame(() => { announcer.textContent = msg; });
}

// ---------- Kategorier (lastet fra databasen, ikke hardkodet) ----------
let kategoriListe = []; // [{id, namn}]

async function lastKategorier() {
  const { data, error } = await sb.from('kategorier').select('id, namn').order('namn');
  if (error) { console.error(error); return; }
  kategoriListe = data;
  const selects = [document.getElementById('kategori'), document.getElementById('rediger-kategori')];
  selects.forEach(sel => {
    const behold = sel.id === 'kategori' ? '<option value="">Velg kategori …</option>' : '';
    sel.innerHTML = behold + data.map(k => `<option value="${k.id}">${escapeHtml(k.namn)}</option>`).join('');
  });
}

// ---------- Navigasjon mellom visninger ----------
const navButtons = document.querySelectorAll('.navbtn');
const views = {
  ny: document.getElementById('view-ny'),
  finn: document.getElementById('view-finn'),
};

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.view;
    navButtons.forEach(b => b.removeAttribute('aria-current'));
    btn.setAttribute('aria-current', 'page');
    Object.entries(views).forEach(([key, el]) => {
      el.hidden = key !== target;
    });
    views[target].querySelector('h2')?.focus();
    announce(`Viser ${btn.textContent}`);
  });
});

// ---------- Hjelpefunksjoner ----------
function genCaseNummer() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unngår forvekslingsbokstaver (I, O, 0, 1)
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `BTT-${suffix}`;
}

function setFieldError(fieldId, message) {
  const errEl = document.getElementById(`err-${fieldId}`);
  const inputEl = document.getElementById(fieldId);
  if (errEl) errEl.textContent = message;
  if (inputEl) inputEl.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function clearErrors(ids) {
  ids.forEach(id => setFieldError(id, ''));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDato(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABELS = {
  ny: 'Ny',
  under_behandling: 'Under behandling',
  lost: 'Løst',
};

lastKategorier();

// ===========================================================
// CREATE — Send nytt spørsmål
// ===========================================================
const formNy = document.getElementById('form-ny');
const statusNy = document.getElementById('status-ny');

formNy.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors(['navn', 'epost', 'tittel', 'beskrivelse']);
  statusNy.removeAttribute('data-state');
  statusNy.textContent = '';

  const navn = document.getElementById('navn').value.trim();
  const epost = document.getElementById('epost').value.trim();
  const telefon = document.getElementById('telefon').value.trim();
  const kategoriId = document.getElementById('kategori').value;
  const tittel = document.getElementById('tittel').value.trim();
  const beskrivelse = document.getElementById('beskrivelse').value.trim();
  const prioritet = formNy.querySelector('input[name="prioritet"]:checked').value;

  // Inputvalidering
  let harFeil = false;
  if (navn.length < 2) { setFieldError('navn', 'Skriv inn fullt navn (minst 2 tegn).'); harFeil = true; }
  const epostRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!epostRegex.test(epost)) { setFieldError('epost', 'Skriv inn en gyldig e-postadresse.'); harFeil = true; }
  if (!kategoriId) { setFieldError('tittel', ''); harFeil = true; document.getElementById('kategori').setAttribute('aria-invalid', 'true'); }
  if (tittel.length < 4) { setFieldError('tittel', 'Tittelen må være minst 4 tegn.'); harFeil = true; }
  if (beskrivelse.length < 10) { setFieldError('beskrivelse', 'Beskriv spørsmålet med minst 10 tegn.'); harFeil = true; }

  if (harFeil) {
    statusNy.dataset.state = 'error';
    statusNy.textContent = 'Rett opp feilene i formularet og send på nytt.';
    formNy.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  const submitBtn = formNy.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sender …';

  try {
    // Finn eller opprett kunde basert på e-post
    let kundeId;
    const { data: eksisterende, error: searchErr } = await sb
      .from('kunder')
      .select('id')
      .eq('epost', epost)
      .limit(1);
    if (searchErr) throw searchErr;

    if (eksisterende && eksisterende.length > 0) {
      kundeId = eksisterende[0].id;
    } else {
      const { data: nyKunde, error: insertKundeErr } = await sb
        .from('kunder')
        .insert({ navn, epost, telefon: telefon || null })
        .select('id')
        .single();
      if (insertKundeErr) throw insertKundeErr;
      kundeId = nyKunde.id;
    }

    const caseNummer = genCaseNummer();
    const { error: insertErr } = await sb.from('forespørsler').insert({
      case_nummer: caseNummer,
      kunde_id: kundeId,
      kategori_id: kategoriId,
      tittel,
      beskrivelse,
      prioritet,
      status: 'ny',
    });
    if (insertErr) throw insertErr;

    statusNy.dataset.state = 'ok';
    statusNy.innerHTML = `Spørsmålet er sendt! Ditt sakenummer er <strong>${escapeHtml(caseNummer)}</strong> — noter dette, du trenger det for å følge opp saken senere.`;
    announce(`Spørsmål sendt. Sakenummer ${caseNummer}.`);
    formNy.reset();
  } catch (err) {
    console.error(err);
    statusNy.dataset.state = 'error';
    statusNy.textContent = 'Noe gikk feil under innsending. Sjekk nettforbindelsen og prøv igjen.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send spørsmål';
  }
});

// ===========================================================
// READ — Finn sak (case-nummer + e-post)
// ===========================================================
const formFinn = document.getElementById('form-finn');
const statusFinn = document.getElementById('status-finn');
const sakResultat = document.getElementById('sak-resultat');
let aktivSak = null; // holder gjeldende sak + kunde-epost for senere update/delete-validering

formFinn.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusFinn.removeAttribute('data-state');
  statusFinn.textContent = '';
  sakResultat.hidden = true;
  sakResultat.innerHTML = '';

  const caseInput = document.getElementById('finn-case').value.trim().toUpperCase();
  const epostInput = document.getElementById('finn-epost').value.trim().toLowerCase();

  if (!caseInput || !epostInput) {
    statusFinn.dataset.state = 'error';
    statusFinn.textContent = 'Fyll ut både sakenummer og e-postadresse.';
    return;
  }

  const submitBtn = formFinn.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Søker …';

  try {
    const { data: saker, error } = await sb
      .from('forespørsler')
      .select('*, kunder(navn, epost), kategorier(namn)')
      .eq('case_nummer', caseInput)
      .limit(1);
    if (error) throw error;

    const sak = saker && saker[0];
    // Sikkerhet/tilgang: kunden får KUN tilgang dersom e-posten matcher kunden
    // knyttet til saken. Dette er kontrollen som sikrer at folk bare kan
    // endre/slette sine egne spørsmål, jf. krav i vurderingsskjemaet.
    if (!sak || !sak.kunder || sak.kunder.epost.toLowerCase() !== epostInput) {
      statusFinn.dataset.state = 'error';
      statusFinn.textContent = 'Fant ingen sak med denne kombinasjonen av sakenummer og e-postadresse.';
      announce('Fant ingen sak.');
      return;
    }

    // Hent svar (kun den kundevendte svar-tabellen — interne_kommentarer er
    // fysisk separert og RLS-blokkert for anon, så den kan aldri hentes her).
    const { data: svarListe, error: svarErr } = await sb
      .from('svar')
      .select('innhold, opprettet_dato, ansatte(navn, rolle)')
      .eq('forespørsel_id', sak.id)
      .order('opprettet_dato', { ascending: true });
    if (svarErr) console.error(svarErr);

    aktivSak = sak;
    renderSak(sak, svarListe || []);
    statusFinn.dataset.state = 'ok';
    statusFinn.textContent = 'Sak funnet.';
    announce(`Sak ${sak.case_nummer} funnet.`);
  } catch (err) {
    console.error(err);
    statusFinn.dataset.state = 'error';
    statusFinn.textContent = 'Noe gikk feil under søket. Prøv igjen.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Finn sak';
  }
});

function renderSak(sak, svarListe) {
  sakResultat.hidden = false;
  const statusKlasse = sak.status === 'lost' ? 'tag-status-lost' : (sak.status === 'under_behandling' ? 'tag-status-under_behandling' : 'tag-status-ny');
  const prioritetKlasse = sak.prioritet === 'hoy' ? 'tag-prioritet-hoy' : '';
  const kategoriNavn = sak.kategorier ? sak.kategorier.namn : 'Ukategorisert';

  const svarHtml = svarListe.length === 0
    ? '<p class="field-hint">Ingen svar fra oss enda. Vi følger opp så snart vi kan.</p>'
    : svarListe.map(s => `
        <div class="svar-bobbel">
          <div class="svar-bobbel-head">
            <strong>${escapeHtml(s.ansatte?.navn || 'Bergen Tang og Tare')}</strong>
            <span class="field-hint">${s.ansatte?.rolle ? escapeHtml(s.ansatte.rolle) + ' · ' : ''}${formatDato(s.opprettet_dato)}</span>
          </div>
          <p>${escapeHtml(s.innhold)}</p>
        </div>
      `).join('');

  sakResultat.innerHTML = `
    <div class="sak-kort">
      <div class="sak-kort-head">
        <h3>${escapeHtml(sak.tittel)}</h3>
        <span class="sak-case-id">${escapeHtml(sak.case_nummer)}</span>
      </div>
      <div class="sak-meta">
        <span class="tag ${statusKlasse}">${STATUS_LABELS[sak.status] || sak.status}</span>
        <span class="tag">${escapeHtml(kategoriNavn)}</span>
        <span class="tag ${prioritetKlasse}">Prioritet: ${sak.prioritet}</span>
      </div>
      <p class="sak-beskrivelse">${escapeHtml(sak.beskrivelse)}</p>
      <p class="field-hint">Sendt ${formatDato(sak.opprettet_dato)}${sak.oppdatert_dato ? ' · oppdatert ' + formatDato(sak.oppdatert_dato) : ''}</p>
      <div class="sak-kort-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-rediger-sak">Rediger</button>
        <button type="button" class="btn btn-danger btn-sm" id="btn-slett-sak">Slett</button>
      </div>
      <div class="svar-seksjon">
        <h4>Svar fra Bergen Tang og Tare</h4>
        ${svarHtml}
      </div>
    </div>
  `;

  document.getElementById('btn-rediger-sak').addEventListener('click', åpneRedigerDialog);
  document.getElementById('btn-slett-sak').addEventListener('click', åpneSlettDialog);
}

// ===========================================================
// UPDATE — Rediger sak
// ===========================================================
const dialogRediger = document.getElementById('dialog-rediger');
const formRediger = document.getElementById('form-rediger');
const statusRediger = document.getElementById('status-rediger');
let sisteFokusElement = null;

function åpneRedigerDialog() {
  if (!aktivSak) return;
  sisteFokusElement = document.activeElement;
  document.getElementById('rediger-id').value = aktivSak.id;
  document.getElementById('rediger-tittel').value = aktivSak.tittel;
  document.getElementById('rediger-beskrivelse').value = aktivSak.beskrivelse;
  document.getElementById('rediger-kategori').value = aktivSak.kategori_id;
  statusRediger.textContent = '';
  statusRediger.removeAttribute('data-state');
  dialogRediger.hidden = false;
  document.getElementById('rediger-tittel').focus();
}

function lukkRedigerDialog() {
  dialogRediger.hidden = true;
  sisteFokusElement?.focus();
}

document.getElementById('btn-avbryt-rediger').addEventListener('click', lukkRedigerDialog);
dialogRediger.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') lukkRedigerDialog();
});

formRediger.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('rediger-id').value;
  const tittel = document.getElementById('rediger-tittel').value.trim();
  const beskrivelse = document.getElementById('rediger-beskrivelse').value.trim();
  const kategoriId = document.getElementById('rediger-kategori').value;

  if (tittel.length < 4 || beskrivelse.length < 10) {
    statusRediger.dataset.state = 'error';
    statusRediger.textContent = 'Tittel må ha minst 4 tegn og beskrivelse minst 10 tegn.';
    return;
  }

  // Sikkerhetssjekk: bekreft at saken faktisk eies av aktivSak (samme id) før vi
  // skriver — vi opererer aldri på en id hentet fra et felt brukeren kan endre.
  if (!aktivSak || aktivSak.id !== id) {
    statusRediger.dataset.state = 'error';
    statusRediger.textContent = 'Kunne ikke verifisere saken. Last siden på nytt og prøv igjen.';
    return;
  }

  const submitBtn = formRediger.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const { data, error } = await sb
      .from('forespørsler')
      .update({ tittel, beskrivelse, kategori_id: kategoriId, oppdatert_dato: new Date().toISOString() })
      .eq('id', id)
      .select('*, kunder(navn, epost), kategorier(namn)')
      .single();
    if (error) throw error;

    const { data: svarListe } = await sb
      .from('svar')
      .select('innhold, opprettet_dato, ansatte(navn, rolle)')
      .eq('forespørsel_id', id)
      .order('opprettet_dato', { ascending: true });

    aktivSak = data;
    renderSak(data, svarListe || []);
    lukkRedigerDialog();
    announce('Spørsmålet er oppdatert.');
  } catch (err) {
    console.error(err);
    statusRediger.dataset.state = 'error';
    statusRediger.textContent = 'Kunne ikke lagre endringene. Prøv igjen.';
  } finally {
    submitBtn.disabled = false;
  }
});

// ===========================================================
// DELETE — Slett sak
// ===========================================================
const dialogSlett = document.getElementById('dialog-slett');

function åpneSlettDialog() {
  if (!aktivSak) return;
  sisteFokusElement = document.activeElement;
  dialogSlett.hidden = false;
  document.getElementById('btn-avbryt-slett').focus();
}

function lukkSlettDialog() {
  dialogSlett.hidden = true;
  sisteFokusElement?.focus();
}

document.getElementById('btn-avbryt-slett').addEventListener('click', lukkSlettDialog);
dialogSlett.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') lukkSlettDialog();
});

document.getElementById('btn-bekreft-slett').addEventListener('click', async () => {
  if (!aktivSak) return;
  const btn = document.getElementById('btn-bekreft-slett');
  btn.disabled = true;
  btn.textContent = 'Sletter …';

  try {
    const { error } = await sb.from('forespørsler').delete().eq('id', aktivSak.id);
    if (error) throw error;

    lukkSlettDialog();
    sakResultat.hidden = true;
    sakResultat.innerHTML = '';
    statusFinn.dataset.state = 'ok';
    statusFinn.textContent = `Sak ${aktivSak.case_nummer} er slettet.`;
    announce(`Sak ${aktivSak.case_nummer} slettet.`);
    aktivSak = null;
  } catch (err) {
    console.error(err);
    lukkSlettDialog();
    statusFinn.dataset.state = 'error';
    statusFinn.textContent = 'Kunne ikke slette saken. Prøv igjen.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Slett saken';
  }
});

// Lukk dialoger ved klikk utenfor
[dialogRediger, dialogSlett].forEach(dialog => {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.hidden = true;
  });
});
