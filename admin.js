// ===========================================================
// Bergen Tang og Tare AS — Ansattportal
// Autentisering + saksbehandling for ansatte
// ===========================================================

const SUPABASE_URL = 'https://gnzierpfmgfrffypvbkf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImduemllcnBmbWdmcmZmeXB2YmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjMwMzQsImV4cCI6MjA5NzMzOTAzNH0.rWGJ4XviLS1bWL-3CBPJdifKdvn8qdQ1U0M2nfCPblc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const announcer = document.getElementById('aria-announcer');
function announce(msg) {
  announcer.textContent = '';
  requestAnimationFrame(() => { announcer.textContent = msg; });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatDato(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABELS = { ny: 'Ny', under_behandling: 'Under behandling', lost: 'Løst' };

let innloggetAnsatt = null; // rad fra ansatte-tabellen
let aktivSakId = null;
let alleSaker = [];

const viewLogin = document.getElementById('view-login');
const viewSaker = document.getElementById('view-saker');
const viewDetalj = document.getElementById('view-detalj');
const ansattNav = document.getElementById('ansatt-nav');
const innloggetNavnEl = document.getElementById('innlogget-navn');

function visView(view) {
  [viewLogin, viewSaker, viewDetalj].forEach(v => v.hidden = (v !== view));
  view.querySelector('h2')?.focus?.();
}

// ===========================================================
// AUTENTISERING
// ===========================================================
async function sjekkInnloggingVedStart() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    await etterInnlogging(data.session.user);
  }
}

async function tryggSignOut() {
  try {
    await sb.auth.signOut();
  } catch (err) {
    // Server-sesjonen kan allerede være ugyldig (403) - det er greit, vi rydder lokalt uansett
    console.warn('signOut feilet (sesjonen var sannsynligvis allerede ugyldig):', err);
  }
}

async function etterInnlogging(authUser) {
  const { data: ansatt, error } = await sb
    .from('ansatte')
    .select('id, navn, epost, rolle, aktiv')
    .eq('epost', authUser.email)
    .single();

  if (error || !ansatt) {
    document.getElementById('status-login').dataset.state = 'error';
    document.getElementById('status-login').textContent = 'Fant ingen ansattprofil knyttet til denne kontoen. Kontakt administrator.';
    await tryggSignOut();
    return;
  }
  if (!ansatt.aktiv) {
    document.getElementById('status-login').dataset.state = 'error';
    document.getElementById('status-login').textContent = 'Denne kontoen er deaktivert.';
    await tryggSignOut();
    return;
  }

  innloggetAnsatt = ansatt;
  ansattNav.hidden = false;
  innloggetNavnEl.textContent = `${ansatt.navn} (${ansatt.rolle})`;
  await lastSaker();
  visView(viewSaker);
  announce(`Innlogget som ${ansatt.navn}.`);
}

const formLogin = document.getElementById('form-login');
const statusLogin = document.getElementById('status-login');

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusLogin.removeAttribute('data-state');
  statusLogin.textContent = '';

  const epost = document.getElementById('login-epost').value.trim();
  const passord = document.getElementById('login-passord').value;

  const submitBtn = formLogin.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logger inn …';

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: epost, password: passord });
    if (error) throw error;
    await etterInnlogging(data.user);
    formLogin.reset();
  } catch (err) {
    console.error(err);
    statusLogin.dataset.state = 'error';
    statusLogin.textContent = 'Feil e-post eller passord.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Logg inn';
  }
});

document.getElementById('btn-logg-ut').addEventListener('click', async () => {
  await tryggSignOut();
  innloggetAnsatt = null;
  ansattNav.hidden = true;
  visView(viewLogin);
  announce('Logget ut.');
});

// ===========================================================
// SAK-LISTE
// ===========================================================
const sakListeEl = document.getElementById('sak-liste');
const filterStatus = document.getElementById('filter-status');

async function lastSaker() {
  const { data, error } = await sb
    .from('forespørsler')
    .select('*, kunder(navn, epost), kategorier(namn)')
    .order('opprettet_dato', { ascending: false });
  if (error) { console.error(error); return; }
  alleSaker = data || [];
  renderSakListe();
}

function renderSakListe() {
  const filter = filterStatus.value;
  const synlige = filter ? alleSaker.filter(s => s.status === filter) : alleSaker;

  if (synlige.length === 0) {
    sakListeEl.innerHTML = '<p class="tom-liste">Ingen saker å vise.</p>';
    return;
  }

  sakListeEl.innerHTML = synlige.map(s => `
    <div class="sak-rad" data-id="${s.id}" tabindex="0" role="button" aria-label="Åpne sak ${escapeHtml(s.case_nummer)}: ${escapeHtml(s.tittel)}">
      <div class="sak-rad-main">
        <span class="sak-rad-tittel">${escapeHtml(s.tittel)}</span>
        <span class="sak-rad-meta">${escapeHtml(s.case_nummer)} · ${escapeHtml(s.kunder?.navn || 'Ukjent kunde')} · ${formatDato(s.opprettet_dato)}</span>
      </div>
      <div class="sak-rad-tags">
        <span class="tag tag-status-${s.status}">${STATUS_LABELS[s.status] || s.status}</span>
        <span class="tag">${escapeHtml(s.kategorier?.namn || 'Ukategorisert')}</span>
      </div>
    </div>
  `).join('');

  sakListeEl.querySelectorAll('.sak-rad').forEach(rad => {
    rad.addEventListener('click', () => åpneSakDetalj(rad.dataset.id));
    rad.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); åpneSakDetalj(rad.dataset.id); }
    });
  });
}

filterStatus.addEventListener('change', renderSakListe);

document.getElementById('btn-tilbake-liste').addEventListener('click', () => {
  visView(viewSaker);
});

// ===========================================================
// SAK-DETALJ
// ===========================================================
const detaljInnhold = document.getElementById('detalj-innhold');

async function åpneSakDetalj(sakId) {
  aktivSakId = sakId;
  const sak = alleSaker.find(s => s.id === sakId);
  if (!sak) return;

  const [{ data: svarListe }, { data: interneListe }] = await Promise.all([
    sb.from('svar').select('id, innhold, opprettet_dato, ansatte(navn, rolle)').eq('forespørsel_id', sakId).order('opprettet_dato', { ascending: true }),
    sb.from('interne_kommentarer').select('id, innhold, opprettet_dato, ansatte(navn, rolle)').eq('forespørsel_id', sakId).order('opprettet_dato', { ascending: true }),
  ]);

  renderSakDetalj(sak, svarListe || [], interneListe || []);
  visView(viewDetalj);
}

function renderSakDetalj(sak, svarListe, interneListe) {
  // Slå sammen svar og interne kommentarer i kronologisk rekkefølge, merket etter type
  const tråd = [
    ...svarListe.map(s => ({ ...s, type: 'svar' })),
    ...interneListe.map(s => ({ ...s, type: 'internt' })),
  ].sort((a, b) => new Date(a.opprettet_dato) - new Date(b.opprettet_dato));

  const trådHtml = tråd.length === 0
    ? '<p class="field-hint">Ingen svar eller notater enda.</p>'
    : tråd.map(t => `
        <div class="svar-bobbel-admin ${t.type === 'internt' ? 'internt' : ''}">
          <div class="svar-bobbel-admin-head">
            <strong>${escapeHtml(t.ansatte?.navn || 'Ukjent')}${t.type === 'internt' ? ' · internt notat' : ''}</strong>
            <span>${formatDato(t.opprettet_dato)}</span>
          </div>
          <p>${escapeHtml(t.innhold)}</p>
        </div>
      `).join('');

  detaljInnhold.innerHTML = `
    <div class="detalj-head">
      <h2 tabindex="-1">${escapeHtml(sak.tittel)}</h2>
      <span class="sak-case-id">${escapeHtml(sak.case_nummer)}</span>
    </div>
    <div class="detalj-kunde">
      <strong>${escapeHtml(sak.kunder?.navn || 'Ukjent kunde')}</strong> · ${escapeHtml(sak.kunder?.epost || '')}
      ${sak.kunder?.telefon ? ' · ' + escapeHtml(sak.kunder.telefon) : ''}
    </div>
    <p class="sak-beskrivelse">${escapeHtml(sak.beskrivelse)}</p>
    <p class="field-hint">Kategori: ${escapeHtml(sak.kategorier?.namn || 'Ukategorisert')} · Prioritet: ${escapeHtml(sak.prioritet)} · Sendt ${formatDato(sak.opprettet_dato)}</p>

    <div class="detalj-status-row">
      <label for="velg-status">Status:</label>
      <select id="velg-status">
        <option value="ny" ${sak.status === 'ny' ? 'selected' : ''}>Ny</option>
        <option value="under_behandling" ${sak.status === 'under_behandling' ? 'selected' : ''}>Under behandling</option>
        <option value="lost" ${sak.status === 'lost' ? 'selected' : ''}>Løst</option>
      </select>
      <span class="form-status" id="status-endre-status" role="status" aria-live="polite"></span>
    </div>

    <div class="svar-tråd-admin">
      <h3>Samtale og notater</h3>
      ${trådHtml}
    </div>

    <div class="svar-skriv">
      <h3>Skriv svar eller notat</h3>
      <div class="svar-type-toggle" role="radiogroup" aria-label="Velg type melding">
        <label class="radio-pill"><input type="radio" name="meldingstype" value="svar" checked> Svar til kunde</label>
        <label class="radio-pill"><input type="radio" name="meldingstype" value="internt"> Internt notat</label>
      </div>
      <form id="form-svar" novalidate>
        <div class="field">
          <label for="svar-innhold" class="sr-only">Meldingsinnhold</label>
          <textarea id="svar-innhold" rows="4" required aria-required="true" placeholder="Skriv meldingen her …"></textarea>
          <p class="field-error" id="err-svar-innhold" role="alert"></p>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Send</button>
        </div>
        <p class="form-status" id="status-svar" role="status" aria-live="polite"></p>
      </form>
    </div>
  `;

  document.getElementById('velg-status').addEventListener('change', async (e) => {
    await endreStatus(sak.id, e.target.value);
  });

  document.getElementById('form-svar').addEventListener('submit', async (e) => {
    e.preventDefault();
    await sendMelding(sak.id);
  });
}

async function endreStatus(sakId, nyStatus) {
  const statusEl = document.getElementById('status-endre-status');
  try {
    const { error } = await sb
      .from('forespørsler')
      .update({ status: nyStatus, oppdatert_dato: new Date().toISOString(), lost_dato: nyStatus === 'lost' ? new Date().toISOString() : null })
      .eq('id', sakId);
    if (error) throw error;
    statusEl.dataset.state = 'ok';
    statusEl.textContent = 'Status lagret.';
    announce('Status oppdatert.');
    await lastSaker();
  } catch (err) {
    console.error(err);
    statusEl.dataset.state = 'error';
    statusEl.textContent = 'Kunne ikke lagre status.';
  }
}

async function sendMelding(sakId) {
  const innholdEl = document.getElementById('svar-innhold');
  const innhold = innholdEl.value.trim();
  const erIntern = document.querySelector('input[name="meldingstype"]:checked').value === 'internt';
  const statusSvar = document.getElementById('status-svar');
  const errEl = document.getElementById('err-svar-innhold');

  errEl.textContent = '';
  if (innhold.length < 3) {
    errEl.textContent = 'Skriv en melding på minst 3 tegn.';
    innholdEl.setAttribute('aria-invalid', 'true');
    return;
  }
  innholdEl.setAttribute('aria-invalid', 'false');

  const submitBtn = document.querySelector('#form-svar button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sender …';

  try {
    const tabell = erIntern ? 'interne_kommentarer' : 'svar';
    const { error } = await sb.from(tabell).insert({
      forespørsel_id: sakId,
      ansatt_id: innloggetAnsatt.id,
      innhold,
    });
    if (error) throw error;

    statusSvar.dataset.state = 'ok';
    statusSvar.textContent = erIntern ? 'Internt notat lagret.' : 'Svar sendt til kunden.';
    announce(erIntern ? 'Internt notat lagret.' : 'Svar sendt.');
    await åpneSakDetalj(sakId); // rerender med ny melding i tråden
  } catch (err) {
    console.error(err);
    statusSvar.dataset.state = 'error';
    statusSvar.textContent = 'Kunne ikke sende meldingen.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send';
  }
}

sjekkInnloggingVedStart();
