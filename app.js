// ── Constants ──
const COLORS = ['#ff6b00','#ff9500','#ffb347','#e63946','#2a9d8f','#457b9d','#6a4c93','#f72585','#80b918','#9b2226'];
const O = '#ff8c00', O2 = '#ffaa33';
const DB_KEY = 'tampolas-db';
const SCREENS = { HOME: 'home', LIST: 'list', ADD: 'add', DETAIL: 'detail' };

// ── State ──
let state = {
  caps: [],
  screen: SCREENS.HOME,
  filter: 'all',
  search: '',
  selectedId: null,
  editing: null,
  form: { name: '', brand: '', country: '', color: O, notes: '', quantity: 1, photo: null },
  toast: null,
};

// ── DB (IndexedDB for larger storage with photos) ──
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('TampolasDB', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('caps', { keyPath: 'id' });
    };
    req.onsuccess = e => { db = e.target.result; resolve(); };
    req.onerror = () => reject();
  });
}

function dbGetAll() {
  return new Promise((resolve) => {
    const tx = db.transaction('caps', 'readonly');
    const req = tx.objectStore('caps').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

function dbPut(cap) {
  return new Promise((resolve) => {
    const tx = db.transaction('caps', 'readwrite');
    tx.objectStore('caps').put(cap);
    tx.oncomplete = resolve;
  });
}

function dbDelete(id) {
  return new Promise((resolve) => {
    const tx = db.transaction('caps', 'readwrite');
    tx.objectStore('caps').delete(id);
    tx.oncomplete = resolve;
  });
}

// ── Helpers ──
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

function showToast(msg, type = 'ok') {
  setState({ toast: { msg, type } });
  setTimeout(() => setState({ toast: null }), 2500);
}

function go(screen) { setState({ screen }); window.scrollTo(0, 0); }

// ── Computed ──
function getFiltered() {
  const q = state.search.toLowerCase();
  return state.caps.filter(c => {
    const ms = !q || c.name.toLowerCase().includes(q) || (c.brand||'').toLowerCase().includes(q) || (c.country||'').toLowerCase().includes(q);
    const mf = state.filter === 'all' || (state.filter === 'owned' && c.owned) || (state.filter === 'missing' && !c.owned);
    return ms && mf;
  });
}

function getSelected() { return state.caps.find(c => c.id === state.selectedId); }

// ── Actions ──
async function saveCap() {
  const { form, editing, caps } = state;
  if (!form.name.trim()) return showToast('Nome obrigatório!', 'err');

  if (editing) {
    const updated = caps.map(c => c.id === editing ? { ...c, ...form } : c);
    const cap = updated.find(c => c.id === editing);
    await dbPut(cap);
    setState({ caps: updated, editing: null });
    showToast('Tampola atualizada!');
    go(SCREENS.DETAIL);
  } else {
    if (caps.find(c => c.name.toLowerCase() === form.name.toLowerCase())) return showToast('Já existe!', 'err');
    const newCap = { id: genId(), ...form, owned: true, addedAt: new Date().toLocaleDateString('pt-BR') };
    await dbPut(newCap);
    setState({ caps: [...caps, newCap], editing: null });
    showToast('Tampola adicionada!');
    go(SCREENS.LIST);
  }
}

async function deleteCap(id) {
  if (!confirm('Remover esta tampola?')) return;
  await dbDelete(id);
  setState({ caps: state.caps.filter(c => c.id !== id) });
  showToast('Removida.', 'info');
  go(SCREENS.LIST);
}

async function toggleOwned(id) {
  const caps = state.caps.map(c => c.id === id ? { ...c, owned: !c.owned } : c);
  const cap = caps.find(c => c.id === id);
  await dbPut(cap);
  setState({ caps });
}

function openAdd() {
  setState({ editing: null, form: { name: '', brand: '', country: '', color: O, notes: '', quantity: 1, photo: null } });
  go(SCREENS.ADD);
}

function openEdit(cap) {
  setState({ editing: cap.id, form: { name: cap.name, brand: cap.brand||'', country: cap.country||'', color: cap.color, notes: cap.notes||'', quantity: cap.quantity||1, photo: cap.photo||null } });
  go(SCREENS.ADD);
}

function openDetail(id) {
  setState({ selectedId: id });
  go(SCREENS.DETAIL);
}

// ── Photo handling ──
function handlePhoto(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => setState({ form: { ...state.form, photo: e.target.result } });
  reader.readAsDataURL(file);
}

// ── Render helpers ──
function capAvatarHTML(cap, size = 48, fontSize = 22) {
  if (cap.photo) {
    return `<div class="cap-avatar" style="width:${size}px;height:${size}px;box-shadow:0 0 14px ${cap.color}55"><img src="${cap.photo}" alt="${cap.name}" /></div>`;
  }
  return `<div class="cap-avatar" style="width:${size}px;height:${size}px;background:${cap.color};font-size:${fontSize}px;box-shadow:0 0 14px ${cap.color}55">🍺</div>`;
}

function badgeHTML(cap) {
  return cap.owned
    ? `<span class="badge badge-owned">TENHO</span>`
    : `<span class="badge badge-missing">FALTA</span>`;
}

// ── Screen renderers ──
function renderHome() {
  const { caps } = state;
  const owned = caps.filter(c => c.owned).length;
  const missing = caps.length - owned;
  const countries = [...new Set(caps.map(c => c.country).filter(Boolean))];
  const usedColors = [...new Set(caps.map(c => c.color).filter(Boolean))];
  const recent = [...caps].reverse().slice(0, 3);

  return `
  <div class="screen">
    <div class="header">
      <div class="header-logo">🍺</div>
      <div>
        <div class="header-title">Tampolas</div>
        <div class="header-sub">Sua coleção de tampinhas</div>
      </div>
    </div>

    <div class="hero" onclick="go('${SCREENS.LIST}')">
      <div class="hero-inner">
        <div class="hero-label">Total de Tampolas</div>
        <div class="hero-number">${caps.length}</div>
        <div class="hero-sub">Toque para ver todas →</div>
        <div class="hero-icon">🍺</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">TENHO</div>
        <div class="stat-value" style="color:#2a9d8f">${owned}</div>
        <div class="stat-sub">${caps.length ? Math.round(owned/caps.length*100) : 0}% da coleção</div>
        <div class="stat-icon">✅</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">FALTA</div>
        <div class="stat-value" style="color:#e63946">${missing}</div>
        <div class="stat-sub">${caps.length ? Math.round(missing/caps.length*100) : 0}% da coleção</div>
        <div class="stat-icon">❌</div>
      </div>
    </div>

    <div class="stats-grid" style="margin-top:0">
      <div class="stat-card">
        <div class="stat-label">PAÍSES</div>
        <div class="stat-value" style="color:${O2}">${countries.length}</div>
        <div class="stat-sub">${countries.length === 0 ? 'Nenhum ainda' : countries.slice(0,2).join(', ')}</div>
        <div class="stat-icon">🌍</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">CORES</div>
        <div class="stat-value" style="color:${O2}">${usedColors.length}</div>
        <div class="color-dots">
          ${usedColors.slice(0,5).map(c => `<span class="color-dot" style="background:${c}"></span>`).join('')}
          ${usedColors.length === 0 ? '<span style="font-size:11px;color:var(--dim)">Nenhuma ainda</span>' : ''}
        </div>
        <div class="stat-icon">🎨</div>
      </div>
    </div>

    ${recent.length > 0 ? `
    <div class="recent-section">
      <div class="section-title">ADICIONADAS RECENTEMENTE</div>
      ${recent.map(cap => `
        <div class="cap-row" onclick="openDetail('${cap.id}')">
          ${capAvatarHTML(cap, 40, 18)}
          <div class="cap-info">
            <div class="cap-name">${cap.name}</div>
            <div class="cap-meta">${cap.brand || cap.country || '—'}</div>
          </div>
          ${badgeHTML(cap)}
        </div>
      `).join('')}
    </div>` : ''}
  </div>`;
}

function renderList() {
  const filtered = getFiltered();
  return `
  <div class="screen">
    <div class="header">
      <button class="back-btn" onclick="go('${SCREENS.HOME}')">←</button>
      <div class="header-title">Coleção</div>
      <span class="header-count">${state.caps.length} tampolas</span>
    </div>

    <div class="search-wrap">
      <input class="search-input" placeholder="🔍 Buscar..." value="${state.search}" oninput="setState({search:this.value})" />
    </div>

    <div class="filter-tabs">
      <button class="filter-btn ${state.filter==='all'?'active':''}" onclick="setState({filter:'all'})">Todas</button>
      <button class="filter-btn ${state.filter==='owned'?'active':''}" onclick="setState({filter:'owned'})">Tenho</button>
      <button class="filter-btn ${state.filter==='missing'?'active':''}" onclick="setState({filter:'missing'})">Falta</button>
    </div>

    <div style="padding:0 16px">
      ${filtered.length === 0 ? `
        <div class="empty">
          <div class="empty-icon">🫙</div>
          <div class="empty-text">${state.caps.length === 0 ? 'Coleção vazia! Toque em + para começar.' : 'Nenhuma encontrada.'}</div>
        </div>` :
        filtered.map(cap => `
          <div class="cap-row" style="border-color:${cap.owned ? cap.color+'44' : 'var(--border)'}" onclick="openDetail('${cap.id}')">
            ${capAvatarHTML(cap, 48, 22)}
            <div class="cap-info">
              <div class="cap-name">${cap.name}</div>
              <div class="cap-meta">${[cap.brand, cap.country].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            ${badgeHTML(cap)}
          </div>
        `).join('')
      }
    </div>
  </div>`;
}

function renderDetail() {
  const cap = getSelected();
  if (!cap) return '<div class="screen"><div class="header"><button class="back-btn" onclick="go(\'list\')">←</button></div></div>';

  const colorDot = `<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${cap.color};box-shadow:0 0 6px ${cap.color}"></span>`;

  return `
  <div class="screen" style="padding-bottom:100px">
    <div class="detail-hero">
      ${cap.photo
        ? `<img src="${cap.photo}" alt="${cap.name}" />`
        : `<div class="detail-hero-bg" style="background:linear-gradient(160deg,${cap.color}88,var(--bg))">🍺</div>`
      }
      <div class="detail-overlay"></div>
      <button class="detail-back" onclick="go('${SCREENS.LIST}')">←</button>
      <div class="detail-title-wrap">
        <div class="detail-name">${cap.name}</div>
        ${cap.brand ? `<div class="detail-brand">${cap.brand}</div>` : ''}
      </div>
    </div>

    <div class="detail-body">
      <button class="toggle-btn" style="background:${cap.owned?'#0a2a1a':`${O}22`};color:${cap.owned?'#2a9d8f':O2};border:1px solid ${cap.owned?'#1a5a3a':O+'66'}" onclick="toggleOwned('${cap.id}')">
        ${cap.owned ? '✓ Tenho esta tampola' : '+ Marcar como tenho'}
      </button>

      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">📍 País</div>
          <div class="info-value">${cap.country || '—'}</div>
        </div>
        <div class="info-card">
          <div class="info-label">🔢 Quantidade</div>
          <div class="info-value">×${cap.quantity || 1}</div>
        </div>
        <div class="info-card">
          <div class="info-label">📅 Adicionada</div>
          <div class="info-value">${cap.addedAt || '—'}</div>
        </div>
        <div class="info-card">
          <div class="info-label">🎨 Cor</div>
          <div class="info-value">${colorDot}</div>
        </div>
      </div>

      ${cap.notes ? `
      <div class="notes-card">
        <div class="info-label">📝 Notas</div>
        <div class="notes-text">${cap.notes}</div>
      </div>` : ''}

      <div class="action-row">
        <button class="btn-edit" onclick="openEdit(state.caps.find(c=>c.id==='${cap.id}'))">✏️ Editar</button>
        <button class="btn-delete" onclick="deleteCap('${cap.id}')">🗑</button>
      </div>
    </div>
  </div>`;
}

function renderAdd() {
  const { form, editing } = state;
  return `
  <div class="screen">
    <div class="header">
      <button class="back-btn" onclick="go('${editing ? SCREENS.DETAIL : SCREENS.LIST}')">←</button>
      <div class="header-title">${editing ? 'Editar Tampola' : 'Nova Tampola'}</div>
    </div>

    <div class="form-body">

      <!-- Photo -->
      <div>
        <label class="field-label">FOTO DA TAMPOLA</label>
        <div class="photo-preview" style="border-color:${form.photo ? O+'88' : 'var(--border)'}">
          ${form.photo
            ? `<img src="${form.photo}" alt="foto" /><button class="photo-remove" onclick="setState({form:{...state.form,photo:null}})">✕</button>`
            : `<div class="photo-placeholder"><div class="ph-icon">📷</div><div class="ph-text">Nenhuma foto selecionada</div></div>`
          }
        </div>
        <div class="photo-btns">
          <button class="btn-camera" onclick="document.getElementById('input-camera').click()">📷 Câmera</button>
          <button class="btn-gallery" onclick="document.getElementById('input-gallery').click()">🖼️ Galeria</button>
        </div>
        <input id="input-camera" type="file" accept="image/*" capture="environment" style="display:none" onchange="handlePhoto(this.files[0])" />
        <input id="input-gallery" type="file" accept="image/*" style="display:none" onchange="handlePhoto(this.files[0])" />
      </div>

      <!-- Nome -->
      <div>
        <label class="field-label">NOME *</label>
        <input class="field-input" placeholder="Ex: Brahma Especial" value="${form.name}" oninput="setState({form:{...state.form,name:this.value}})" />
      </div>

      <!-- Marca -->
      <div>
        <label class="field-label">MARCA</label>
        <input class="field-input" placeholder="Ex: Brahma" value="${form.brand}" oninput="setState({form:{...state.form,brand:this.value}})" />
      </div>

      <!-- País -->
      <div>
        <label class="field-label">PAÍS</label>
        <input class="field-input" placeholder="Ex: Brasil" value="${form.country}" oninput="setState({form:{...state.form,country:this.value}})" />
      </div>

      <!-- Quantidade -->
      <div>
        <label class="field-label">QUANTIDADE</label>
        <input class="field-input" type="number" min="1" value="${form.quantity}" oninput="setState({form:{...state.form,quantity:parseInt(this.value)||1}})" />
      </div>

      <!-- Cor -->
      <div>
        <label class="field-label">COR DA TAMPOLA</label>
        <div class="color-picker">
          ${COLORS.map(c => `
            <div class="color-swatch ${form.color===c?'selected':''}" style="background:${c};box-shadow:${form.color===c?`0 0 12px ${c}`:'none'}" onclick="setState({form:{...state.form,color:'${c}'}})"></div>
          `).join('')}
        </div>
      </div>

      <!-- Notas -->
      <div>
        <label class="field-label">NOTAS</label>
        <textarea class="field-input" rows="3" placeholder="Observações, raridade, origem..." oninput="setState({form:{...state.form,notes:this.value}})">${form.notes}</textarea>
      </div>

      <button class="btn-submit" onclick="saveCap()">
        ${editing ? 'SALVAR ALTERAÇÕES' : 'ADICIONAR TAMPOLA'}
      </button>

    </div>
  </div>`;
}

function renderNav() {
  const { screen } = state;
  return `
  <div class="bottom-nav">
    <button class="nav-btn" onclick="go('${SCREENS.HOME}')">
      <span class="nav-icon">🏠</span>
      <span class="nav-label" style="color:${screen===SCREENS.HOME?O:'var(--muted)'}">Início</span>
    </button>
    <button class="nav-btn" onclick="go('${SCREENS.LIST}')">
      <span class="nav-icon">📋</span>
      <span class="nav-label" style="color:${screen===SCREENS.LIST?O:'var(--muted)'}">Coleção</span>
    </button>
    <div class="nav-fab-wrap">
      <button class="nav-fab" onclick="openAdd()">+</button>
    </div>
    <div class="nav-spacer"></div>
  </div>`;
}

function renderToast() {
  const { toast } = state;
  if (!toast) return '';
  const colors = {
    err:  { bg: '#4a0a0a', border: '#e63946', color: '#e63946' },
    info: { bg: '#0a1e2a', border: '#457b9d', color: '#4cc9f0' },
    ok:   { bg: '#1a2a0a', border: '#4a9d2a', color: '#7dcc4a' },
  }[toast.type] || {};
  return `<div class="toast" style="background:${colors.bg};border:1px solid ${colors.border};color:${colors.color}">${toast.msg}</div>`;
}

// ── Main render ──
function render() {
  const { screen } = state;
  let content = '';
  if (screen === SCREENS.HOME)   content = renderHome();
  if (screen === SCREENS.LIST)   content = renderList();
  if (screen === SCREENS.DETAIL) content = renderDetail();
  if (screen === SCREENS.ADD)    content = renderAdd();

  document.getElementById('app').innerHTML = content + renderNav() + renderToast();
}

// ── Boot ──
async function boot() {
  document.getElementById('app').innerHTML = `
    <div class="loading">
      <div class="loading-icon">🍺</div>
      <div class="loading-text">Carregando coleção...</div>
    </div>`;

  try {
    await openDB();
    state.caps = await dbGetAll();
  } catch (e) {
    console.warn('IndexedDB não disponível, usando memória.');
  }

  render();
}

boot();
