// ===========================================================
// Bergen Tang og Tare AS — Kundeportal
// Autentisering + sak-behandling for innloggede kunder
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

let innloggetKunde = null; // rad fra kunder-tabellen
let kategoriListe = [];
let mineSakerCache = [];
let aktivRedigerId = null;
let aktivSlettId = null;

const heroSeksjon = document.getElementById('hero-seksjon');
const viewLogin = document.getElementById('view-login');
const viewRegistrer = document.getElementById('view-registrer');
const viewNy = document.getElementById('view-ny');
const viewMine = document.getElementById('view-mine');
const kundeNav = document.getElementById('kunde-nav');
const innloggetNavnEl = document.getElementById('innlogget-kunde-navn');

const alleViews = [viewLogin, viewRegistrer, viewNy, viewMine];

function visView(view) {
  alleViews.forEach(v => v.hidden = (v !== view));
  view.querySelector('h2')?.focus?.();
}

// ===========================================================
// KATEGORI-LASTING (delt mellom registrer/innlogget tilstand)
// ===========================================================
async function lastKategorier() {
  const { data, error } = await sb.from('kategorier').select('id, namn').order('namn');
  if (error) { console.error(error); return; }
  kategoriListe = data || [];
  const select = document.getElementById('kategori');
  const redigerSelect = document.getElementById('rediger-kategori');
  const options = kategoriListe.map(k => `<option value="${k.id}">${escapeHtml(k.namn)}</option>`).join('');
  if (select) select.innerHTML = '<option value="">Velg kategori …</option>' + options;
  if (redigerSelect) redigerSelect.innerHTML = '<option value="">Ukategorisert</option>' + options;
}

// ===========================================================
// AUTENTISERING
// ===========================================================
async function sjekkInnloggingVedStart() {
  await lastKategorier();
  const { data } = await sb.auth.getSession();
  if (data.session) {
    await etterInnlogging(data.session.user);
  } else {
    visView(viewLogin);
  }
}

async function etterInnlogging(authUser) {
  let { data: kunde, error } = await sb
    .from('kunder')
    .select('id, navn, epost, telefon, auth_id')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return;
  }

  // Kunde-rad finnes ikke enda (f.eks. rett etter registrering) -> opprett den
  if (!kunde) {
    const navn = authUser.user_metadata?.navn || authUser.email;
    const telefon = authUser.user_metadata?.telefon || null;
    const { data: nyKunde, error: opprettErr } = await sb
      .from('kunder')
      .insert({ navn, epost: authUser.email, telefon, auth_id: authUser.id })
      .select()
      .single();
    if (opprettErr) {
      console.error(opprettErr);
      document.getElementById('status-login').dataset.state = 'error';
      document.getElementById('status-login').textContent = 'Kunne ikke opprette kundeprofil. Kontakt support.';
      return;
    }
    kunde = nyKunde;
  }

  innloggetKunde = kunde;
  heroSeksjon.hidden = true;
  kundeNav.hidden = false;
  innloggetNavnEl.textContent = kunde.navn;
  await lastMineSaker();
  visView(viewMine);
  announce(`Innlogget som ${kunde.navn}.`);
}

// ---------- Logg inn ----------
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

// ---------- Registrer ----------
const formRegistrer = document.getElementById('form-registrer');
const statusRegistrer = document.getElementById('status-registrer');

formRegistrer.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusRegistrer.removeAttribute('data-state');
  statusRegistrer.textContent = '';

  const navn = document.getElementById('reg-navn').value.trim();
  const epost = document.getElementById('reg-epost').value.trim();
  const telefon = document.getElementById('reg-telefon').value.trim();
  const passord = document.getElementById('reg-passord').value;

  document.getElementById('err-reg-navn').textContent = '';
  document.getElementById('err-reg-epost').textContent = '';
  document.getElementById('err-reg-passord').textContent = '';

  let harFeil = false;
  if (navn.length < 2) { document.getElementById('err-reg-navn').textContent = 'Skriv inn fullt navn.'; harFeil = true; }
  if (!epost.includes('@')) { document.getElementById('err-reg-epost').textContent = 'Skriv inn en gyldig e-postadresse.'; harFeil = true; }
  if (passord.length < 6) { document.getElementById('err-reg-passord').textContent = 'Passordet må være minst 6 tegn.'; harFeil = true; }
  if (harFeil) return;

  const submitBtn = formRegistrer.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Registrerer …';

  try {
    const { data, error } = await sb.auth.signUp({
      email: epost,
      password: passord,
      options: { data: { navn, telefon } },
    });
    if (error) throw error;

    if (!data.session) {
      // Skjedde fordi e-postbekreftelse er påkrevd (skal normalt ikke skje, men håndter trygt)
      statusRegistrer.dataset.state = 'ok';
      statusRegistrer.textContent = 'Konto opprettet! Du kan nå logge inn.';
      formRegistrer.reset();
      setTimeout(() => visLogin(), 1500);
      return;
    }

    await etterInnlogging(data.user);
    formRegistrer.reset();
  } catch (err) {
    console.error(err);
    statusRegistrer.dataset.state = 'error';
    if (String(err.message || '').toLowerCase().includes('already registered') || String(err.message || '').toLowerCase().includes('already exists')) {
      statusRegistrer.textContent = 'Denne e-postadressen er allerede registrert. Prøv å logge inn i stedet.';
    } else {
      statusRegistrer.textContent = 'Noe gikk feil under registrering. Prøv igjen.';
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Registrer konto';
  }
});

// ---------- Bytt mellom login/registrer ----------
function visLogin() { visView(viewLogin); }
function visRegistrer() { visView(viewRegistrer); }

document.getElementById('btn-vis-registrer').addEventListener('click', visRegistrer);
document.getElementById('btn-vis-login').addEventListener('click', visLogin);

// ---------- Logg ut ----------
document.getElementById('btn-logg-ut').addEventListener('click', async () => {
  await sb.auth.signOut();
  innloggetKunde = null;
  kundeNav.hidden = true;
  heroSeksjon.hidden = false;
  visView(viewLogin);
  announce('Logget ut.');
});

// ---------- Navigasjon (Mine saker / Send spørsmål) ----------
kundeNav.querySelectorAll('.navbtn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    kundeNav.querySelectorAll('.navbtn[data-view]').forEach(b => b.removeAttribute('aria-current'));
    btn.setAttribute('aria-current', 'page');
    if (btn.dataset.view === 'ny') {
      visView(viewNy);
    } else {
      visView(viewMine);
      lastMineSaker();
    }
  });
});

// ===========================================================
// SEND NYTT SPØRSMÅL
// ===========================================================
const formNy = document.getElementById('form-ny');
const statusNy = document.getElementById('status-ny');

function genererCaseNummer() {
  const tegn = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += tegn[Math.floor(Math.random() * tegn.length)];
  return `BTT-${suffix}`;
}

formNy.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusNy.removeAttribute('data-state');
  statusNy.textContent = '';

  const kategoriId = document.getElementById('kategori').value;
  const tittel = document.getElementById('tittel').value.trim();
  const beskrivelse = document.getElementById('beskrivelse').value.trim();
  const prioritet = formNy.querySelector('input[name="prioritet"]:checked').value;

  document.getElementById('err-tittel').textContent = '';
  document.getElementById('err-beskrivelse').textContent = '';
  document.getElementById('err-kategori').textContent = '';

  let harFeil = false;
  if (tittel.length < 3) { document.getElementById('err-tittel').textContent = 'Skriv en tittel på minst 3 tegn.'; harFeil = true; }
  if (beskrivelse.length < 10) { document.getElementById('err-beskrivelse').textContent = 'Beskriv spørsmålet med minst 10 tegn.'; harFeil = true; }
  if (!kategoriId) { document.getElementById('err-kategori').textContent = 'Velg en kategori.'; harFeil = true; }
  if (harFeil) return;

  const submitBtn = formNy.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sender …';

  try {
    const { error } = await sb.from('forespørsler').insert({
      kunde_id: innloggetKunde.id,
      kategori_id: kategoriId,
      case_nummer: genererCaseNummer(),
      tittel,
      beskrivelse,
      prioritet,
      status: 'ny',
    });
    if (error) throw error;

    statusNy.dataset.state = 'ok';
    statusNy.textContent = 'Spørsmålet er sendt! Du finner det under «Mine saker».';
    announce('Spørsmål sendt.');
    formNy.reset();
    formNy.querySelector('input[name="prioritet"][value="medium"]').checked = true;
  } catch (err) {
    console.error(err);
    statusNy.dataset.state = 'error';
    statusNy.textContent = 'Kunne ikke sende spørsmålet. Prøv igjen.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send spørsmål';
  }
});

// ===========================================================
// MINE SAKER
// ===========================================================
const mineSakerListe = document.getElementById('mine-saker-liste');

async function lastMineSaker() {
  if (!innloggetKunde) return;
  mineSakerListe.innerHTML = '<p class="field-hint">Laster …</p>';

  const { data, error } = await sb
    .from('forespørsler')
    .select('*, kategorier(namn), svar(id, innhold, opprettet_dato)')
    .eq('kunde_id', innloggetKunde.id)
    .order('opprettet_dato', { ascending: false });

  if (error) {
    console.error(error);
    mineSakerListe.innerHTML = '<p class="field-hint">Kunne ikke laste sakene dine.</p>';
    return;
  }

  mineSakerCache = data || [];
  renderMineSaker();
}

function renderMineSaker() {
  if (mineSakerCache.length === 0) {
    mineSakerListe.innerHTML = `
      <p class="tom-liste">Du har ikke sendt noen spørsmål enda.</p>
    `;
    return;
  }

  mineSakerListe.innerHTML = mineSakerCache.map(s => {
    const svarHtml = (s.svar && s.svar.length > 0)
      ? `<div class="svar-tråd">${s.svar.map(sv => `
          <div class="svar-bobbel">
            <div class="svar-bobbel-head"><strong>Svar fra support</strong> · ${formatDato(sv.opprettet_dato)}</div>
            <p>${escapeHtml(sv.innhold)}</p>
          </div>
        `).join('')}</div>`
      : '';

    return `
      <article class="sak-kort">
        <div class="sak-kort-head">
          <div>
            <h3>${escapeHtml(s.tittel)}</h3>
            <p class="sak-kort-meta">${escapeHtml(s.case_nummer)} · ${escapeHtml(s.kategorier?.namn || 'Ukategorisert')} · Sendt ${formatDato(s.opprettet_dato)}</p>
          </div>
          <span class="tag tag-status-${s.status}">${STATUS_LABELS[s.status] || s.status}</span>
        </div>
        <p class="sak-kort-beskrivelse">${escapeHtml(s.beskrivelse)}</p>
        ${svarHtml}
        <div class="sak-kort-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-rediger="${s.id}">Rediger</button>
          <button type="button" class="btn btn-ghost btn-sm btn-danger-text" data-slett="${s.id}">Slett</button>
        </div>
      </article>
    `;
  }).join('');

  mineSakerListe.querySelectorAll('[data-rediger]').forEach(btn => {
    btn.addEventListener('click', () => åpneRedigerDialog(btn.dataset.rediger));
  });
  mineSakerListe.querySelectorAll('[data-slett]').forEach(btn => {
    btn.addEventListener('click', () => åpneSlettDialog(btn.dataset.slett));
  });
}

// ===========================================================
// REDIGER-DIALOG
// ===========================================================
const dialogRediger = document.getElementById('dialog-rediger');
const formRediger = document.getElementById('form-rediger');
const statusRediger = document.getElementById('status-rediger');

function åpneRedigerDialog(sakId) {
  const sak = mineSakerCache.find(s => s.id === sakId);
  if (!sak) return;
  aktivRedigerId = sakId;
  document.getElementById('rediger-id').value = sakId;
  document.getElementById('rediger-tittel').value = sak.tittel;
  document.getElementById('rediger-beskrivelse').value = sak.beskrivelse;
  document.getElementById('rediger-kategori').value = sak.kategori_id;
  statusRediger.textContent = '';
  statusRediger.removeAttribute('data-state');
  dialogRediger.hidden = false;
  document.getElementById('rediger-tittel').focus();
}

function lukkRedigerDialog() {
  dialogRediger.hidden = true;
  aktivRedigerId = null;
}

document.getElementById('btn-avbryt-rediger').addEventListener('click', lukkRedigerDialog);

formRediger.addEventListener('submit', async (e) => {
  e.preventDefault();
  const tittel = document.getElementById('rediger-tittel').value.trim();
  const beskrivelse = document.getElementById('rediger-beskrivelse').value.trim();
  const kategoriIdRaw = document.getElementById('rediger-kategori').value;
  const kategoriId = kategoriIdRaw === '' ? null : kategoriIdRaw;

  if (tittel.length < 3 || beskrivelse.length < 10) {
    statusRediger.dataset.state = 'error';
    statusRediger.textContent = 'Fyll ut tittel og beskrivelse korrekt.';
    return;
  }

  const submitBtn = formRediger.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Lagrer …';

  try {
    const { error } = await sb
      .from('forespørsler')
      .update({ tittel, beskrivelse, kategori_id: kategoriId, oppdatert_dato: new Date().toISOString() })
      .eq('id', aktivRedigerId);
    if (error) throw error;

    announce('Endringer lagret.');
    lukkRedigerDialog();
    await lastMineSaker();
  } catch (err) {
    console.error(err);
    statusRediger.dataset.state = 'error';
    statusRediger.textContent = 'Kunne ikke lagre endringene.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Lagre endringer';
  }
});

// ===========================================================
// SLETT-DIALOG
// ===========================================================
const dialogSlett = document.getElementById('dialog-slett');

function åpneSlettDialog(sakId) {
  aktivSlettId = sakId;
  dialogSlett.hidden = false;
  document.getElementById('btn-bekreft-slett').focus();
}

function lukkSlettDialog() {
  dialogSlett.hidden = true;
  aktivSlettId = null;
}

document.getElementById('btn-avbryt-slett').addEventListener('click', lukkSlettDialog);

document.getElementById('btn-bekreft-slett').addEventListener('click', async () => {
  if (!aktivSlettId) return;
  const btn = document.getElementById('btn-bekreft-slett');
  btn.disabled = true;
  btn.textContent = 'Sletter …';

  try {
    const { error } = await sb.from('forespørsler').delete().eq('id', aktivSlettId);
    if (error) throw error;
    announce('Saken er slettet.');
    lukkSlettDialog();
    await lastMineSaker();
  } catch (err) {
    console.error(err);
    announce('Kunne ikke slette saken.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Slett saken';
  }
});

sjekkInnloggingVedStart();
