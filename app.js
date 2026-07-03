'use strict';

// ─── Constants ────────────────────────────────────────────
const LINEAR_GQL = 'https://api.linear.app/graphql';

// ─── Color palette (single source of truth, mirrors styles.css :root) ─
const COLORS = {
  brand:     '#4B6BFF',
  green:     '#22C55E',
  greenInk:  '#16A34A',
  amber:     '#F59E0B',
  red:       '#EF4444',
  ink:       '#111827',
  ink2:      '#374151',
  ink3:      '#6B7280',
  ink4:      '#9CA3AF',
  ink5:      '#D1D5DB',
  track:     '#F3F4F6',
  purple:    '#8B5CF6',
};

// State-pill palette: soft background + readable foreground per status family.
const STATE_STYLES = {
  progress:   { bg: '#DBEAFE', color: '#1D4ED8' },
  review:     { bg: '#EDE9FE', color: '#6D28D9' },
  validation: { bg: '#FEF3C7', color: '#B45309' },
  done:       { bg: '#DCFCE7', color: '#15803D' },
  blocked:    { bg: '#FEE2E2', color: '#B91C1C' },
  neutral:    { bg: COLORS.track, color: COLORS.ink3 },
};

// ─── State ────────────────────────────────────────────────
let API_KEY = '';
let TEAM_KEY = '';
let TEAM_ID_RESOLVED = '';
let TEAM_DISPLAY_NAME = '';
let allCycles = [];
let allIssues = [];
let allDetailed = [];

// ─── GraphQL client ───────────────────────────────────────
async function gql(query, variables = {}) {
  const res = await fetch(LINEAR_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': API_KEY
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
  return json.data;
}

// ─── Setup / connect ──────────────────────────────────────
async function connect() {
  const key     = document.getElementById('api-key-input').value.trim();
  const teamKey = document.getElementById('team-key-input').value.trim();
  const errDiv  = document.getElementById('setup-error');
  const btn     = document.getElementById('connect-btn');

  if (!key)     { errDiv.textContent = 'Insira sua API key.'; return; }
  if (!teamKey) { errDiv.textContent = 'Insira o Team Key.'; return; }

  API_KEY  = key;
  TEAM_KEY = teamKey;
  btn.disabled    = true;
  btn.textContent = 'Conectando...';
  errDiv.textContent = '';

  try {
    const data  = await gql('query { teams { nodes { id name key } } }');
    const teams = data.teams?.nodes || [];
    const team  = teams.find(t => t.key === TEAM_KEY) ||
                  teams.find(t => t.name.toLowerCase().includes(TEAM_KEY.toLowerCase()));

    if (!team) {
      const avail = teams.map(t => t.key).join(', ');
      throw new Error(`Time "${TEAM_KEY}" não encontrado. Times disponíveis: ${avail || '(nenhum)'}`);
    }

    TEAM_ID_RESOLVED  = team.id;
    TEAM_DISPLAY_NAME = team.name;

    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    await init();
  } catch(e) {
    let msg = e.message;
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      msg = 'Erro de rede. Se o arquivo foi aberto diretamente do disco (file://), tente servir via um servidor local ' +
            '(ex: `python3 -m http.server` na pasta do arquivo) e acessar via http://localhost:8000.';
    }
    errDiv.textContent = msg;
    btn.disabled    = false;
    btn.textContent = 'Conectar';
  }
}

// Enter key to connect
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('setup-screen').style.display !== 'none') connect();
});

// ─── Helpers ──────────────────────────────────────────────
// Escape untrusted strings (issue titles, state names, team name, API errors)
// before injecting them into innerHTML.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// Labels in Linear's GraphQL come as { nodes: [{name: "..."}] }
const getLabels  = i => i.labels?.nodes || (Array.isArray(i.labels) ? i.labels : []);
const isOpex     = i => getLabels(i).some(l => /bug|toil|security/i.test(l.name || l || ''));

const issueId    = i => i.identifier || i.key || i.id || '';
const stateType  = i => i.state?.type || '';
const stateName  = i => i.state?.name || '—';

const cycleDays  = i => {
  if (!i.startedAt || !i.completedAt) return null;
  return (new Date(i.completedAt) - new Date(i.startedAt)) / 86400000;
};

const median = arr => {
  if (!arr.length) return null;
  const s = [...arr].sort((a,b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
};
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a,b) => a - b);
  const i = (p/100) * (s.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const avg = arr => arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : null;

const fmt = d => {
  if (d === null || d === undefined) return '—';
  if (d < 1/24) return `${Math.round(d*24*60)}min`;
  if (d < 1)    return `${(d*24).toFixed(1)}h`;
  return `${d.toFixed(1)}d`;
};
const fmtDate = iso => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
};
const fmtAgo = iso => {
  if (!iso) return '—';
  const h = (Date.now() - new Date(iso)) / 3600000;
  if (h < 1)  return '<1h';
  if (h < 24) return `${Math.round(h)}h`;
  return `${(h/24).toFixed(1)}d`;
};

const stateStyle = name => {
  const n = (name || '').toLowerCase();
  if (n.includes('progress'))                      return STATE_STYLES.progress;
  if (n.includes('review'))                        return STATE_STYLES.review;
  if (n.includes('validation'))                    return STATE_STYLES.validation;
  if (n.includes('done') || n.includes('conclu'))  return STATE_STYLES.done;
  if (n.includes('block') || n.includes('bloque')) return STATE_STYLES.blocked;
  return STATE_STYLES.neutral;
};

// ─── HTML render helpers (escape + shared markup) ─────────
const idLink = iss =>
  `<a class="id-link" href="${esc(iss.url || '#')}" target="_blank">${esc(issueId(iss) || '—')}</a>`;

const statePill = name => {
  const s = stateStyle(name);
  return `<span class="state-pill" style="background:${s.bg};color:${s.color}">${esc(name)}</span>`;
};

const classBadge = iss => {
  const cl = isOpex(iss) ? 'OPEX' : 'CAPEX';
  return `<span class="class-badge badge-${cl.toLowerCase()}">${cl}</span>`;
};

// ─── Init ─────────────────────────────────────────────────
async function init() {
  const dash = document.getElementById('dashboard');
  dash.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando ciclos...</div>';

  try {
    const data = await gql(`
      query($id: String!) {
        team(id: $id) {
          activeCycle { id }
          cycles(first: 50) {
            nodes {
              id name number startsAt endsAt
              completedIssueCountHistory issueCountHistory
            }
          }
        }
      }
    `, { id: TEAM_ID_RESOLVED });

    // The Cycle type has no `title`/`isCurrent`; derive them here so the
    // rest of the code can keep using c.title / c.isCurrent.
    const activeCycleId = data.team?.activeCycle?.id || null;
    (data.team?.cycles?.nodes || []).forEach(c => {
      c.title     = c.name || `Ciclo ${c.number}`;
      c.isCurrent = c.id === activeCycleId;
    });

    const now    = Date.now();
    const cutoff = now - 60 * 86400000;
    allCycles = (data.team?.cycles?.nodes || [])
      .filter(c => {
        if (/ignor/i.test(c.title)) return false;
        if (c.isCurrent) return true;
        if (c.completedIssueCountHistory?.length > 0) return true;
        if (c.endsAt && new Date(c.endsAt).getTime() > cutoff) return true;
        return false;
      })
      .sort((a, b) => b.number - a.number);

    const todayCycle = allCycles.find(c =>
      c.startsAt && c.endsAt &&
      new Date(c.startsAt) <= now && new Date(c.endsAt) >= now
    );
    const current = allCycles.find(c => c.isCurrent) || todayCycle || allCycles[0];

    if (!current) throw new Error('Nenhum ciclo encontrado para este time.');

    renderShell(current);
    await loadCycle(current);
  } catch(e) {
    dash.innerHTML = `<div class="err">Erro ao inicializar: ${esc(e.message)}</div>`;
  }
}

// ─── Shell ────────────────────────────────────────────────
function renderShell(cycle) {
  document.getElementById('dashboard').innerHTML = `
    <div class="header">
      <div class="header-row">
        <div>
          <h1 id="h-title">${esc(cycle.title)} — ${esc(TEAM_DISPLAY_NAME)}</h1>
          <div class="meta" id="h-meta">${headerMeta(cycle)}</div>
        </div>
        <div class="header-actions">
          <select class="cycle-selector" id="cycle-select" onchange="onSelect(this.value)">
            ${allCycles.map(c =>
              `<option value="${esc(c.id)}" ${c.id === cycle.id ? 'selected' : ''}>
                ${esc(c.title)}${c.isCurrent ? ' (atual)' : ''}
              </option>`
            ).join('')}
          </select>
          <button class="export-btn" onclick="window.print()">⬇ Exportar PDF</button>
        </div>
      </div>
    </div>
    <div id="content">
      <div class="loading"><div class="spinner"></div>Carregando issues...</div>
    </div>
  `;
}

function headerMeta(cycle) {
  const ref = cycle.endsAt
    ? `Ref: ${new Date(cycle.endsAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })}`
    : '';
  return `${fmtDate(cycle.startsAt)} – ${fmtDate(cycle.endsAt)}&nbsp;&nbsp;·&nbsp;&nbsp;${ref}` +
    (cycle.isCurrent ? `&nbsp;&nbsp;·&nbsp;&nbsp;<strong>Ciclo atual</strong>` : '');
}

// ─── Cycle change ─────────────────────────────────────────
async function onSelect(id) {
  const cycle = allCycles.find(c => c.id === id);
  if (!cycle) return;
  document.getElementById('h-title').textContent = `${cycle.title} — ${TEAM_DISPLAY_NAME}`;
  document.getElementById('h-meta').innerHTML = headerMeta(cycle);
  document.getElementById('content').innerHTML =
    '<div class="loading"><div class="spinner"></div>Carregando issues...</div>';
  await loadCycle(cycle);
}

// ─── Load issues ──────────────────────────────────────────
async function loadCycle(cycle) {
  try {
    allIssues = await fetchCycleIssues(cycle.id);
    allDetailed = [];
    renderContent(allIssues, cycle);
  } catch(e) {
    document.getElementById('content').innerHTML =
      `<div class="err">Erro ao carregar issues: ${esc(e.message)}</div>`;
  }
}

async function fetchCycleIssues(cycleId) {
  let issues = [];
  let after  = null;
  do {
    const data = await gql(`
      query($cycleId: String!, $after: String) {
        cycle(id: $cycleId) {
          issues(first: 250, after: $after, includeArchived: true) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id identifier title url
              createdAt startedAt completedAt canceledAt
              state { name type }
              labels { nodes { name } }
            }
          }
        }
      }
    `, { cycleId, after });

    const page = data?.cycle?.issues;
    if (!page) break;
    issues.push(...page.nodes);
    after = page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return issues;
}

// ─── Render ───────────────────────────────────────────────
function renderContent(issues, cycle) {
  const done      = issues.filter(i => stateType(i) === 'completed');
  const active    = issues.filter(i => stateType(i) !== 'cancelled');
  const open      = issues.filter(i => stateType(i) !== 'completed' && stateType(i) !== 'cancelled');

  const capex     = active.filter(i => !isOpex(i));
  const opex      = active.filter(isOpex);
  const capexDone = capex.filter(i => stateType(i) === 'completed');
  const opexDone  = opex.filter(i => stateType(i) === 'completed');

  const total     = active.length;
  const compRate  = total > 0 ? done.length / total * 100 : 0;
  const capexRate = capex.length > 0 ? capexDone.length / capex.length * 100 : 0;
  const opexRate  = opex.length  > 0 ? opexDone.length  / opex.length  * 100 : 0;
  const capexPct  = total > 0 ? capex.length / total * 100 : 50;
  const opexPct   = 100 - capexPct;

  const ctAll   = done.map(cycleDays).filter(v => v !== null && v >= 0);
  const ctCapex = capexDone.map(cycleDays).filter(v => v !== null && v >= 0);
  const ctOpex  = opexDone.map(cycleDays).filter(v => v !== null && v >= 0);

  const statusMap = {};
  open.forEach(i => {
    const n = stateName(i);
    statusMap[n] = (statusMap[n] || 0) + 1;
  });
  const statusEntries = Object.entries(statusMap).sort((a,b) => b[1] - a[1]);
  const maxCnt = Math.max(...statusEntries.map(e => e[1]), 1);

  const compColor = compRate >= 85 ? COLORS.green : compRate >= 65 ? COLORS.amber : COLORS.red;

  document.getElementById('content').innerHTML = `

    <!-- KPI Row -->
    <div class="kpi-row">
      <div class="kpi blue">
        <div class="kpi-name">Cards no ciclo</div>
        <div class="kpi-val">${total}</div>
        <div class="kpi-sub"><strong>${done.length}</strong> concluídos · <strong>${open.length}</strong> abertos</div>
      </div>
      <div class="kpi green">
        <div class="kpi-name">Taxa de conclusão</div>
        <div class="kpi-val" style="color:${compColor}">${compRate.toFixed(1)}%</div>
        <div class="kpi-sub">CAPEX ${capexRate.toFixed(0)}% · OPEX ${opexRate.toFixed(0)}%</div>
      </div>
      <div class="kpi orange">
        <div class="kpi-name">Cycle Time mediano</div>
        <div class="kpi-val">${fmt(median(ctAll))}</div>
        <div class="kpi-sub">CAPEX ${fmt(median(ctCapex))} · OPEX ${fmt(median(ctOpex))}</div>
      </div>
      <div class="kpi red">
        <div class="kpi-name">Blocked no ciclo</div>
        <div class="kpi-val" id="blocked-kpi-val" style="color:${COLORS.ink}">—</div>
        <div class="kpi-sub" id="blocked-kpi-sub">carregue o histórico</div>
      </div>
    </div>

    <!-- CAPEX vs OPEX -->
    <div class="card">
      <div class="card-title">CAPEX vs OPEX</div>
      <div class="split-bar">
        <div class="sb-capex" style="width:${capexPct.toFixed(1)}%">
          ${capexPct > 8 ? `CAPEX ${capexPct.toFixed(1)}%` : ''}
        </div>
        <div class="sb-opex" style="width:${opexPct.toFixed(1)}%">
          ${opexPct > 8 ? `OPEX ${opexPct.toFixed(1)}%` : ''}
        </div>
      </div>
      <div class="legend">
        <div class="legend-item">
          <div class="legend-dot" style="background:${COLORS.brand}"></div>
          <span class="legend-txt">CAPEX: <span class="legend-count">${capex.length} cards</span> (${capexDone.length}/${capex.length} — ${capexRate.toFixed(0)}%)</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot" style="background:${COLORS.green}"></div>
          <span class="legend-txt">OPEX: <span class="legend-count">${opex.length} cards</span> (${opexDone.length}/${opex.length} — ${opexRate.toFixed(0)}%)</span>
        </div>
      </div>
    </div>

    <!-- Cycle Time breakdown -->
    <div class="ct-grid">
      ${ctCard('Geral', ctAll, COLORS.amber, done.length)}
      ${ctCard('CAPEX', ctCapex, COLORS.brand, capexDone.length)}
      ${ctCard('OPEX',  ctOpex,  COLORS.green, opexDone.length)}
    </div>

    <!-- Status distribution (open) -->
    ${statusEntries.length ? `
    <div class="card">
      <div class="card-title">Issues em aberto por status <span class="card-meta">${open.length} cards</span></div>
      <div class="status-bars">
        ${statusEntries.map(([name, count]) => {
          const s = stateStyle(name);
          return `
          <div class="status-row">
            <div class="status-lbl">${esc(name)}</div>
            <div class="status-bar-wrap">
              <div class="status-bar-fill"
                style="width:${(count/maxCnt*100).toFixed(0)}%;background:${s.bg};border-left:3px solid ${s.color}">
              </div>
            </div>
            <div class="status-cnt" style="color:${s.color};font-weight:600">${count} card${count !== 1 ? 's' : ''}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Tempo médio por Status -->
    <div class="card" id="tempo-status-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div class="card-title" style="margin-bottom:0">
          Tempo médio por Status
          <span class="card-meta">(dias por card)</span>
        </div>
        <button class="load-btn" onclick="loadTempoStatus()" id="tempo-btn">Carregar</button>
      </div>
      <div id="tempo-status-content" class="empty" style="padding:12px 0">
        Clique em "Carregar" para buscar o histórico de estados de cada issue.
      </div>
    </div>

    <!-- Bottom: Blocked + Não Concluídos -->
    <div class="bottom-grid">

      <div class="card" style="margin-bottom:0">
        <div class="card-title">
          Blocked — durante o ciclo
          <span class="card-meta" id="blocked-meta"></span>
        </div>
        <div id="blocked-history-content">
          <div class="empty" style="font-size:12px">
            Clique em <strong>Carregar</strong> (Tempo por Status) para ver o histórico de bloqueios.
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:0">
        <div class="card-title">
          Não Concluídos
          <span class="card-meta">${open.length} card${open.length !== 1 ? 's' : ''}</span>
        </div>
        ${open.length === 0
          ? '<div class="empty">🎉 Todos os issues foram concluídos!</div>'
          : `<div class="table-wrap"><table>
            <thead><tr><th>ID</th><th>Status</th><th>Aberto há</th><th>Classe</th></tr></thead>
            <tbody>
            ${open.slice(0, 25).map(i => `<tr>
                <td>${idLink(i)}</td>
                <td>${statePill(stateName(i))}</td>
                <td style="color:${COLORS.ink3}">${fmtAgo(i.startedAt || i.createdAt)}</td>
                <td>${classBadge(i)}</td>
              </tr>`).join('')}
            ${open.length > 25
              ? `<tr><td colspan="4" style="color:${COLORS.ink4};padding-top:8px;font-size:12px">+${open.length - 25} cards adicionais</td></tr>`
              : ''}
            </tbody>
          </table></div>`
        }
      </div>
    </div>
  `;
}

function ctCard(label, data, color, n) {
  const m   = median(data);
  const a   = avg(data);
  const p75 = pct(data, 75);
  const p90 = pct(data, 90);
  return `
    <div class="ct-card">
      <div class="ct-tag" style="color:${color}">${label} (n=${n})</div>
      <div class="ct-val" style="color:${color}">${fmt(m)}</div>
      <div class="ct-sub">
        média <span>${fmt(a)}</span> &nbsp;·&nbsp; p75 <span>${fmt(p75)}</span> &nbsp;·&nbsp; p90 <span>${fmt(p90)}</span>
      </div>
    </div>`;
}

// ─── State History reconstruction ─────────────────────────
// Linear's GraphQL history API returns state-transition events.
// We reconstruct contiguous periods from those events.
function buildStateHistory(issue, historyNodes) {
  const stateChanges = historyNodes
    .filter(h => h.toState)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (!stateChanges.length) {
    return issue.state
      ? [{ state: issue.state, startedAt: issue.createdAt, endedAt: issue.completedAt || null }]
      : [];
  }

  const periods = [];

  // Period before the first recorded change
  const first = stateChanges[0];
  if (first.fromState) {
    periods.push({ state: first.fromState, startedAt: issue.createdAt, endedAt: first.createdAt });
  }

  // Periods between consecutive changes
  for (let i = 0; i < stateChanges.length - 1; i++) {
    periods.push({
      state:     stateChanges[i].toState,
      startedAt: stateChanges[i].createdAt,
      endedAt:   stateChanges[i + 1].createdAt
    });
  }

  // Final (current) period
  const last = stateChanges[stateChanges.length - 1];
  periods.push({ state: last.toState, startedAt: last.createdAt, endedAt: issue.completedAt || null });

  return periods;
}

// ─── Fetch single issue with history ──────────────────────
async function fetchIssueWithHistory(issueUUID) {
  const data = await gql(`
    query($id: String!) {
      issue(id: $id) {
        id identifier url
        createdAt startedAt completedAt canceledAt
        state { name type }
        labels { nodes { name } }
        history(first: 100) {
          nodes {
            createdAt
            fromState { name type }
            toState   { name type }
          }
        }
      }
    }
  `, { id: issueUUID });

  const iss = data?.issue;
  if (!iss) return null;
  iss.stateHistory = buildStateHistory(iss, iss.history?.nodes || []);
  return iss;
}

// ─── Tempo por Status ─────────────────────────────────────
const EXCLUDE_STATES = /^(triage|cancelled|done|conclu|backlog)/i;

async function loadTempoStatus() {
  const btn = document.getElementById('tempo-btn');
  const box = document.getElementById('tempo-status-content');
  if (!btn || !box) return;

  btn.disabled    = true;
  btn.textContent = 'Carregando...';

  const total = allIssues.length;
  box.innerHTML = `
    <div style="font-size:12px;color:#6B7280;margin-bottom:6px">
      Buscando histórico de <span id="prog-count">0</span>/${total} issues…
    </div>
    <div class="progress-wrap"><div class="progress-fill" id="prog-bar" style="width:0%"></div></div>
  `;

  const BATCH = 3;    // parallel requests per batch
  const DELAY = 400;  // ms between batches (rate limit safety)
  const detailed = [];

  for (let i = 0; i < allIssues.length; i += BATCH) {
    if (i > 0) await new Promise(r => setTimeout(r, DELAY));
    const batch   = allIssues.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(iss => fetchIssueWithHistory(iss.id).catch(() => null))
    );
    detailed.push(...results.filter(Boolean));
    const done    = Math.min(i + BATCH, total);
    const pctDone = Math.round(done / total * 100);
    const pc = document.getElementById('prog-count');
    const pb = document.getElementById('prog-bar');
    if (pc) pc.textContent = done;
    if (pb) pb.style.width = pctDone + '%';
  }

  allDetailed = detailed;
  renderTempoStatus(detailed);
  renderBlockedHistory(detailed);
  btn.textContent = 'Recarregar';
  btn.disabled    = false;
}

const barColor = name => {
  const n = (name || '').toLowerCase();
  if (n.includes('validation')) return COLORS.red;
  if (n.includes('progress'))   return COLORS.ink3;
  if (n === 'todo' || n.includes('todo')) return COLORS.ink3;
  if (n.includes('block') || n.includes('bloque')) return COLORS.amber;
  if (n.includes('review'))     return COLORS.brand;
  if (n.includes('refinement')) return COLORS.purple;
  return COLORS.ink4;
};

function renderTempoStatus(issues) {
  const box = document.getElementById('tempo-status-content');
  if (!box) return;

  const stateData = {};
  const now = Date.now();

  issues.forEach(iss => {
    (iss.stateHistory || []).forEach(entry => {
      const name = entry.state?.name;
      if (!name || EXCLUDE_STATES.test(name)) return;
      const start = entry.startedAt ? new Date(entry.startedAt).getTime() : null;
      const end   = entry.endedAt   ? new Date(entry.endedAt).getTime()   : now;
      if (!start || end <= start) return;
      const days = (end - start) / 86400000;
      if (!stateData[name]) stateData[name] = { totalDays: 0, count: 0 };
      stateData[name].totalDays += days;
      stateData[name].count     += 1;
    });
  });

  const entries = Object.entries(stateData)
    .map(([name, d]) => ({ name, avg: d.totalDays / d.count, total: d.totalDays, count: d.count }))
    .filter(e => e.avg > 0)
    .sort((a, b) => b.avg - a.avg);

  if (!entries.length) {
    box.innerHTML = '<div class="empty">Nenhum dado de histórico encontrado.</div>';
    return;
  }

  const MAX_SCALE = 6;

  box.innerHTML = `
    <div style="font-size:11px;color:#9CA3AF;margin-bottom:14px">
      Barra = média de dias por card &nbsp;·&nbsp; escala max = ${MAX_SCALE}d
    </div>
    ${entries.map(e => {
      const color  = barColor(e.name);
      const w      = Math.min(e.avg / MAX_SCALE * 100, 100).toFixed(1);
      const sumFmt = e.total < 1 ? `${(e.total*24).toFixed(1)}h` : `${Math.round(e.total)}d`;
      return `
      <div style="display:flex;align-items:center;gap:0;margin-bottom:10px">
        <div style="width:110px;flex-shrink:0;font-size:12px;color:#374151;text-align:right;padding-right:12px;white-space:nowrap">${esc(e.name)}</div>
        <div style="flex:1;position:relative;height:28px;background:#F3F4F6;border-radius:4px;overflow:hidden">
          <div style="position:absolute;left:0;top:0;height:100%;width:${w}%;background:${color};border-radius:4px;transition:width 0.5s"></div>
          <div style="position:absolute;left:${w}%;top:0;height:100%;display:flex;align-items:center;padding-left:8px;white-space:nowrap">
            <span style="font-size:12px;font-weight:700;color:#374151">${fmt(e.avg)}</span>
            <span style="font-size:11px;color:#9CA3AF;margin-left:8px">${e.count} card${e.count !== 1 ? 's' : ''} · soma ${sumFmt}</span>
          </div>
        </div>
      </div>`;
    }).join('')}
    <div style="font-size:11px;color:#D1D5DB;margin-top:4px">
      ${issues.length} issues analisadas · média = dias acumulados ÷ passagens pelo status
    </div>
  `;
}

// ─── Blocked History ──────────────────────────────────────
const BLOCKED_RE = /bloqueado|blocked/i;

function renderBlockedHistory(issues) {
  const box  = document.getElementById('blocked-history-content');
  const meta = document.getElementById('blocked-meta');
  if (!box) return;

  const now           = Date.now();
  const blockedIssues = [];

  issues.forEach(iss => {
    let totalMs = 0;
    (iss.stateHistory || []).forEach(entry => {
      if (!BLOCKED_RE.test(entry.state?.name || '')) return;
      const start = entry.startedAt ? new Date(entry.startedAt).getTime() : null;
      const end   = entry.endedAt   ? new Date(entry.endedAt).getTime()   : now;
      if (start && end > start) totalMs += (end - start);
    });
    if (totalMs > 0) blockedIssues.push({ iss, hours: totalMs / 3600000 });
  });

  blockedIssues.sort((a, b) => b.hours - a.hours);

  if (meta) meta.textContent = `${blockedIssues.length} card${blockedIssues.length !== 1 ? 's' : ''}`;

  const kpiVal = document.getElementById('blocked-kpi-val');
  const kpiSub = document.getElementById('blocked-kpi-sub');
  if (kpiVal) {
    kpiVal.textContent  = blockedIssues.length;
    kpiVal.style.color  = blockedIssues.length > 0 ? COLORS.red : COLORS.ink;
  }
  if (kpiSub && blockedIssues.length) {
    const avgH = blockedIssues.reduce((s, b) => s + b.hours, 0) / blockedIssues.length;
    kpiSub.textContent = `${avgH.toFixed(1)}h média`;
  }

  if (!blockedIssues.length) {
    box.innerHTML = '<div class="empty">Nenhum issue passou pelo estado Blocked neste ciclo.</div>';
    return;
  }

  const fmtH = h =>
    h < 1    ? `${Math.round(h*60)}min`
    : h < 24 ? `${h.toFixed(1)}h`
    : `${(h/24).toFixed(1)}d`;

  box.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Tempo bloqueado</th><th>Status atual</th><th>Classe</th></tr></thead>
      <tbody>
      ${blockedIssues.map(({ iss, hours }) => `<tr>
          <td>${idLink(iss)}</td>
          <td style="font-weight:600;color:${COLORS.ink2}">${fmtH(hours)}</td>
          <td>${statePill(stateName(iss))}</td>
          <td>${classBadge(iss)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  `;
}