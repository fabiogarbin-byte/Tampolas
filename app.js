// ── Firebase ──
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCY3JxXACKRdj1b4JyLMK2hI2Rn1upR6Hk",
  authDomain: "tampolas.firebaseapp.com",
  projectId: "tampolas",
  storageBucket: "tampolas.firebasestorage.app",
  messagingSenderId: "594488372191",
  appId: "1:594488372191:web:83f46233b8c4fffe23f26a"
};
const APP_VERSION = 'v5.8';
const COUNTRY_FLAGS = {
  'brasil': '🇧🇷', 'brazil': '🇧🇷',
  'alemanha': '🇩🇪', 'germany': '🇩🇪',
  'estados unidos': '🇺🇸', 'eua': '🇺🇸', 'usa': '🇺🇸',
  'holanda': '🇳🇱', 'netherlands': '🇳🇱',
  'méxico': '🇲🇽', 'mexico': '🇲🇽',
  'argentina': '🇦🇷',
  'portugal': '🇵🇹',
  'espanha': '🇪🇸', 'spain': '🇪🇸',
  'itália': '🇮🇹', 'italy': '🇮🇹',
  'bélgica': '🇧🇪', 'belgium': '🇧🇪',
  'irlanda': '🇮🇪', 'ireland': '🇮🇪',
  'reino unido': '🇬🇧', 'uk': '🇬🇧', 'england': '🇬🇧',
  'japão': '🇯🇵', 'japan': '🇯🇵',
  'china': '🇨🇳',
  'austrália': '🇦🇺', 'australia': '🇦🇺',
  'canadá': '🇨🇦', 'canada': '🇨🇦',
  'rússia': '🇷🇺', 'russia': '🇷🇺',
  'dinamarca': '🇩🇰', 'denmark': '🇩🇰',
  'suécia': '🇸🇪', 'sweden': '🇸🇪',
  'noruega': '🇳🇴', 'norway': '🇳🇴',
  'república tcheca': '🇨🇿', 'czech': '🇨🇿',
  'colômbia': '🇨🇴', 'colombia': '🇨🇴',
  'chile': '🇨🇱',
  'peru': '🇵🇪',
  'uruguai': '🇺🇾', 'uruguay': '🇺🇾',
  'áfrica do sul': '🇿🇦', 'south africa': '🇿🇦',
  'coreia': '🇰🇷', 'korea': '🇰🇷',
  'tailândia': '🇹🇭', 'thailand': '🇹🇭',
  'cuba': '🇨🇺',
  'jamaica': '🇯🇲',
  'escócia': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'frança': '🇫🇷', 'france': '🇫🇷',
  'suíça': '🇨🇭', 'switzerland': '🇨🇭',
};

function countryFlag(country) {
  if (!country) return '🌍';
  const key = country.toLowerCase().trim();
  return COUNTRY_FLAGS[key] || '🌍';
}

const GEMINI_KEY_STORAGE = 'tampolas-gemini-key';
let GEMINI_KEY = '';
function loadGeminiKey() { GEMINI_KEY = localStorage.getItem(GEMINI_KEY_STORAGE) || ''; }

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db   = getFirestore(firebaseApp);

const O = '#ff8c00';
const T = { bg:'#141210', card:'#1e1a16', card2:'#252018', border:'#2e2618', text:'#fff4e8', muted:'#7a6a58', dim:'#3a3028', o2:'#ffaa33' };

// ── State ──
let caps = [], currentUser = null, unsubCaps = null;
let listView = 'list'; // 'list' or 'grid'
let activeFilter = { type: 'all', value: '' };
let activeSort = 'recent';
let currentCapId = null, editingId = null, searchQ = '';
let pendingPhoto = null, pendingPhotoBase64 = null, pendingPhotoMime = null;
let originalPhotoBase64 = null, originalPhotoMime = null;
let aiData = null, aiLoading = false;
let cropSrc = null, cropScale = 1, cropX = 0, cropY = 0, cropRotate = 0;
let cropDragging = false, cropLastX = 0, cropLastY = 0, cropPinchDist = 0;

// ── Firestore ──
const capsCol  = ()       => collection(db, 'users', currentUser.uid, 'caps');
const dbAdd    = data     => addDoc(capsCol(), { ...data, createdAt: Date.now() });
const dbUpdate = (id, d)  => updateDoc(doc(db, 'users', currentUser.uid, 'caps', id), d);
const dbDelete = id       => deleteDoc(doc(db, 'users', currentUser.uid, 'caps', id));

function subscribeCaps() {
  if (unsubCaps) unsubCaps();
  unsubCaps = onSnapshot(query(capsCol(), orderBy('createdAt','desc')), snap => {
    caps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // always refresh home stats when data changes
    renderHome();
    refreshCurrentScreen();
  });
}

// ── Auth ──
async function loginGoogle() {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch(e) { showToast('Erro ao entrar. Tente novamente.','err'); }
}
async function logout() {
  showConfirm({
    icon: '👋',
    title: 'Sair da conta?',
    message: 'Você será desconectado. Sua coleção fica salva na nuvem.',
    okLabel: 'Sim, sair',
    okColor: '#ef4444',
    onConfirm: async () => {
      if (unsubCaps) { unsubCaps(); unsubCaps = null; }
      caps = [];
      await signOut(auth);
    }
  });
}

// ── Gemini ──
async function analyzePhotoWithAI(base64, mimeType) {
  const prompt = `Você é especialista em tampinhas de garrafas. Analise esta imagem e retorne APENAS um JSON válido sem markdown:
{"name":"marca + nome ex: Brahma Duplo Malte","brand":"nome da marca","type":"tipo de bebida em português: Cerveja, Refrigerante, Água, Energético, Vinho, Suco, Cachaça, Whisky","color":"cor principal da tampinha em português ex: Vermelha, Dourada, Prata, Azul, Verde, Preta","country":"país de origem — DEDUZA pela marca ex: Brahma=Brasil, Heineken=Holanda, Budweiser=EUA","notes":"descrição do design visual"}
Sempre preencha o country deduzindo pela marca. Retorne SOMENTE o JSON.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }] }] })
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  if (data.promptFeedback?.blockReason) throw new Error('Imagem bloqueada: ' + data.promptFeedback.blockReason);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Resposta vazia da IA');
  const clean = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); }
  catch { const m = clean.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error('Formato inválido: ' + clean.slice(0,60)); }
}

// ── Toast ──
function showToast(msg, type='ok') {
  const el = document.getElementById('toast-el');
  if (!el) return;
  const c = { ok:['#052010','#22c55e'], err:['#4a0a0a','#ef4444'], info:['#0a1e2a','#4cc9f0'], ai:['#1a0a2a','#c084fc'] }[type] || ['#111','#fff'];
  el.innerHTML = `<div style="position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;padding:10px 22px;border-radius:24px;font-size:13px;font-weight:600;white-space:nowrap;background:${c[0]};color:${c[1]};border:1px solid ${c[1]};box-shadow:0 4px 20px rgba(0,0,0,.6)">${msg}</div>`;
  setTimeout(() => { if (el) el.innerHTML = ''; }, 3200);
}

// ── Navigation ──
let activeScreen = '';
function goTo(screen) {
  activeScreen = screen;
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  const el = document.getElementById('scr-' + screen);
  if (el) el.style.display = 'block';
  document.querySelectorAll('.nav-btn').forEach(b => { b.style.color = b.dataset.scr === screen ? O : T.muted; });
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.style.display = (screen === 'login' || screen === 'crop') ? 'none' : 'flex';
  window.scrollTo(0, 0);
}

function refreshCurrentScreen() {
  if (activeScreen === 'home')   renderHome();
  if (activeScreen === 'list')   renderList();
  if (activeScreen === 'detail' && currentCapId) renderDetail(currentCapId);
}

const btnIconStyle = () => `background:${T.card};border:1px solid ${T.border};color:${T.text};border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:inherit`;
const lblStyle     = () => `font-size:11px;font-weight:700;color:${T.muted};letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:8px`;
const inpStyle     = () => `width:100%;background:#1a1510;border:1.5px solid ${T.border};color:${T.text};border-radius:12px;padding:12px 14px;font-size:15px;outline:none;font-family:inherit;box-sizing:border-box`;

// ── Build screens ──
function buildApp() {
  document.getElementById('app').innerHTML = `

  <!-- LOGIN -->
  <div id="scr-login" class="screen" style="display:none;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px">
    <div style="width:80px;height:80px;border-radius:22px;background:linear-gradient(135deg,${O},#c05500);display:flex;align-items:center;justify-content:center;font-size:40px;box-shadow:0 8px 24px ${O}50;margin-bottom:24px">🍺</div>
    <div style="font-weight:900;font-size:32px;letter-spacing:-1px;margin-bottom:8px">Tampolas</div>
    <div style="font-size:14px;color:${T.muted};margin-bottom:48px;text-align:center">Sua coleção de tampinhas,<br/>em qualquer dispositivo</div>
    <button onclick="loginGoogle()" style="width:100%;max-width:320px;padding:16px;border-radius:14px;border:none;background:#fff;color:#1a1a1a;font-weight:800;font-size:16px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:12px;box-shadow:0 4px 16px rgba(0,0,0,.3)">
      <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Entrar com Google
    </button>
  </div>

  <!-- HOME -->
  <div id="scr-home" class="screen" style="display:none;padding-bottom:90px"></div>

  <!-- LIST -->
  <div id="scr-list" class="screen" style="display:none;padding-bottom:90px">
    <div style="padding:52px 16px 10px;display:flex;align-items:center;gap:12px">
      <button data-action="goto-home" style="${btnIconStyle()}">←</button>
      <div style="flex:1"><div style="font-weight:800;font-size:18px">Coleção</div><div id="list-count" style="font-size:11px;color:${T.muted};margin-top:1px"></div></div>
      <button data-action="search-by-photo" style="background:${T.card};border:1px solid ${T.border};color:${T.text};border-radius:10px;width:36px;height:36px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">📷</button>
      <button data-action="goto-museum-list" style="background:${T.card};border:1px solid ${T.border};color:${T.text};border-radius:10px;width:36px;height:36px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">🖼️</button>
      <button id="btn-view-toggle" data-action="toggle-view" style="background:${T.card};border:1px solid ${T.border};color:${T.text};border-radius:10px;width:36px;height:36px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">⊞</button>
    </div>

    <!-- Search -->
    <div style="padding:0 16px 8px;position:relative">
      <span style="position:absolute;left:28px;top:50%;transform:translateY(-50%);color:${T.muted};font-size:16px;pointer-events:none">🔍</span>
      <input id="search-box" placeholder="Buscar nome, marca, cor ou país..." oninput="searchQ=this.value;renderList()"
        style="width:100%;background:${T.card2};border:1.5px solid ${T.border};color:${T.text};border-radius:12px;padding:11px 14px 11px 40px;font-size:15px;outline:none;font-family:inherit;box-sizing:border-box"/>
    </div>

    <!-- Filtro -->
    <div style="padding:0 16px 4px">
      <span style="font-size:11px;color:${T.muted};font-weight:700;white-space:nowrap">Filtro:</span>
    </div>
    <div style="padding:0 16px 10px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none">
      <button data-action="filter-all" style="flex-shrink:0;padding:6px 14px;border-radius:20px;border:1.5px solid #ff8c0055;background:#ff8c0020;color:#ff8c00;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Todas</button>
      <div id="filter-chips" style="display:flex;gap:6px"></div>
    </div>

    <!-- Sort bar -->
    <div style="padding:0 16px 10px;display:flex;gap:6px;align-items:center">
      <span style="font-size:11px;color:${T.muted};font-weight:700;white-space:nowrap">Ordenar:</span>
      <div style="display:flex;gap:4px;overflow-x:auto;scrollbar-width:none">
        ${['recent','az','country','color','rarity'].map(s=>`<button data-sort="${s}" style="flex-shrink:0;padding:5px 10px;border-radius:8px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">${{recent:'🕐 Recente',az:'🔤 A-Z',country:'🌍 País',color:'🎨 Cor',rarity:'⭐ Raridade'}[s]}</button>`).join('')}
      </div>
    </div>

    <div id="list-items"></div>
  </div>

  <!-- ADD/EDIT -->
  <div id="scr-add" class="screen" style="display:none;padding-bottom:100px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button data-action="cancel-add" style="${btnIconStyle()}">←</button>
      <div id="add-title" style="font-weight:800;font-size:18px">Nova Tampola</div>
    </div>
    <div id="dup-alert" style="display:none;margin:0 16px 12px;padding:12px 16px;border-radius:12px;background:#2a1500;border:1.5px solid ${O};color:${T.o2};font-size:13px;font-weight:600;line-height:1.5">
      ⚠️ Você já tem uma tampola parecida:<br/><span id="dup-name" style="font-weight:800;color:${T.text}"></span>
    </div>
    <div style="padding:0 16px;display:flex;flex-direction:column;gap:16px">

      <div>
        <div style="${lblStyle()}">Foto da tampola</div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
          <div id="photo-thumb">
            <div style="width:90px;height:90px;border-radius:50%;background:${T.card2};border:2px dashed ${T.border};display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0">🍺</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;flex:1">
            <button data-action="camera" style="width:100%;padding:11px;border-radius:12px;border:1px solid ${O}55;background:${O}12;color:${T.o2};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">📷 Câmera</button>
            <button data-action="gallery" style="width:100%;padding:11px;border-radius:12px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🖼️ Galeria</button>
          </div>
        </div>
        <div id="ai-btn-wrap" style="display:none;flex-direction:column;gap:8px">
          <button id="btn-ai" style="width:100%;padding:12px;border-radius:12px;border:1px solid #7c3aed55;background:#7c3aed15;color:#c084fc;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">✨ Identificar com IA</button>
          <button id="btn-crop" data-action="open-crop" style="width:100%;padding:10px;border-radius:12px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">✂️ Ajustar zoom, posição e rotação</button>
          <button id="btn-opt" data-action="open-photo-opt" style="display:none;width:100%;padding:10px;border-radius:12px;border:1px solid #7c3aed44;background:#7c3aed12;color:#c084fc;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">✨ Otimizar foto</button>
        </div>
        <input id="inp-cam" type="file" accept="image/*" capture="environment" style="display:none" onchange="loadPhoto(this.files[0]);this.value=''"/>
        <input id="inp-gal" type="file" accept="image/*" style="display:none" onchange="loadPhoto(this.files[0]);this.value=''"/>
      </div>

      <div id="ai-result" style="display:none;background:#1a0a2a;border:1.5px solid #7c3aed55;border-radius:14px;padding:14px">
        <div style="font-size:11px;font-weight:700;color:#c084fc;letter-spacing:1.5px;margin-bottom:10px">✨ IDENTIFICADO PELA IA</div>
        <div id="ai-result-content"></div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button id="btn-dismiss-ai" style="flex:1;padding:10px;border-radius:10px;border:1px solid ${T.border};background:transparent;color:${T.muted};font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">Ignorar</button>
          <button id="btn-apply-ai" style="flex:2;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit">✅ Usar estes dados</button>
        </div>
      </div>

      <div id="ai-debug" style="display:none;background:#0a0a0a;border:1px solid #333;border-radius:10px;padding:12px;font-size:11px;color:#aaa;font-family:monospace;word-break:break-all;line-height:1.6"></div>

      <div><div style="${lblStyle()}">Nome *</div><input id="f-name" placeholder="Ex: Brahma Especial" style="${inpStyle()}" oninput="checkDuplicate()"/></div>
      <div><div style="${lblStyle()}">Marca</div><input id="f-brand" placeholder="Ex: Brahma" style="${inpStyle()}"/></div>
      <div><div style="${lblStyle()}">Tipo de bebida</div><input id="f-type" placeholder="Ex: Cerveja, Refrigerante, Suco..." style="${inpStyle()}"/></div>
      <div><div style="${lblStyle()}">Cor</div><input id="f-color" placeholder="Ex: Vermelha, Dourada, Azul..." style="${inpStyle()}"/></div>
      <div><div style="${lblStyle()}">País de origem</div><input id="f-country" placeholder="Ex: Brasil" style="${inpStyle()}"/></div>
      <div><div style="${lblStyle()}">Notas</div><textarea id="f-notes" placeholder="Origem, detalhes..." rows="3" style="${inpStyle()};resize:vertical;line-height:1.5"></textarea></div>

      <div>
        <div style="${lblStyle()}">Raridade</div>
        <select id="f-rarity" style="${inpStyle()};appearance:none;cursor:pointer">
          <option value="normal">⚪ Normal</option>
          <option value="rara">🟡 Rara</option>
          <option value="muito_rara">🟠 Muito Rara</option>
          <option value="unica">🔴 Única / Especial</option>
        </select>
      </div>

      <div>
        <div style="${lblStyle()}">Data de inclusão</div>
        <input id="f-date" type="date" style="${inpStyle()};color-scheme:dark"/>
      </div>

      <button id="btn-save" style="width:100%;padding:16px;border-radius:14px;border:none;background:linear-gradient(135deg,${O},#c05500);color:#fff;font-weight:800;font-size:16px;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px ${O}40;margin-bottom:8px">SALVAR TAMPOLA</button>
    </div>
  </div>

  <!-- DETAIL -->
  <div id="scr-detail" class="screen" style="display:none;padding-bottom:100px"></div>

  <!-- CROP com rotação -->
  <div id="scr-crop" class="screen" style="display:none;padding-bottom:40px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button data-action="goto-add" style="${btnIconStyle()}">←</button>
      <div style="font-weight:800;font-size:18px">Ajustar Foto</div>
    </div>
    <div style="font-size:12px;color:${T.muted};margin-bottom:14px;text-align:center;padding:0 16px">
      Arraste para mover · Belisque para zoom · Use o controle para girar
    </div>
    <div style="display:flex;justify-content:center">
      <div id="crop-wrap" style="border-radius:50%;overflow:hidden;border:3px solid ${O}"></div>
    </div>
    <img id="crop-img" style="display:none" onload="drawCrop()"/>

    <div style="padding:16px 16px 0;display:flex;flex-direction:column;gap:12px">
      <div>
        <div style="${lblStyle()}">Zoom</div>
        <input id="zoom-slider" type="range" min="1" max="4" step="0.05" value="1"
          data-action="zoom-change"
          style="width:100%;accent-color:${O}"/>
      </div>
      <div>
        <div style="${lblStyle()}">Rotação</div>
        <div style="display:flex;align-items:center;gap:10px">
          <button data-action="rotate-left"
            style="width:44px;height:44px;border-radius:10px;border:1px solid ${T.border};background:${T.card2};color:${T.text};font-size:20px;cursor:pointer;flex-shrink:0;font-family:inherit">↺</button>
          <input id="rotate-slider" type="range" min="-180" max="180" step="1" value="0"
            data-action="rotate-change"
            style="flex:1;accent-color:${O}"/>
          <button data-action="rotate-right"
            style="width:44px;height:44px;border-radius:10px;border:1px solid ${T.border};background:${T.card2};color:${T.text};font-size:20px;cursor:pointer;flex-shrink:0;font-family:inherit">↻</button>
        </div>
        <div style="text-align:center;font-size:12px;color:${T.muted};margin-top:4px" id="rotate-label">0°</div>
      </div>
      <button data-action="reset-crop"
        style="padding:10px;border-radius:10px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">
        ↺ Resetar
      </button>
    </div>

    <div style="padding:16px;display:flex;gap:10px">
      <button data-action="goto-add" style="flex:1;padding:16px;border-radius:14px;border:1px solid ${T.border};background:${T.card};color:${T.muted};font-weight:700;font-size:15px;cursor:pointer;font-family:inherit">Cancelar</button>
      <button id="btn-confirm-crop" style="flex:2;padding:16px;border-radius:14px;border:none;background:linear-gradient(135deg,${O},#c05500);color:#fff;font-weight:800;font-size:16px;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px ${O}50">✓ Confirmar Foto</button>
    </div>
  </div>


  <!-- PROFILE -->
  <div id="scr-profile" class="screen" style="display:none;padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button data-action="goto-home" style="${btnIconStyle()}">←</button>
      <div style="font-weight:800;font-size:18px">Perfil</div>
    </div>
    <div style="padding:0 16px;display:flex;flex-direction:column;gap:14px">

      <!-- User card -->
      <div style="background:${T.card};border-radius:16px;padding:20px;border:1px solid ${T.border};display:flex;align-items:center;gap:16px">
        <div id="profile-avatar" style="width:64px;height:64px;border-radius:50%;background:${T.card2};border:2px solid ${T.border};flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:28px">👤</div>
        <div>
          <div id="profile-name" style="font-weight:800;font-size:17px"></div>
          <div id="profile-email" style="font-size:12px;color:${T.muted};margin-top:3px"></div>
          <div id="profile-stats" style="font-size:12px;color:${T.o2};margin-top:4px"></div>
        </div>
      </div>

      <!-- Gemini API Key -->
      <div style="background:${T.card};border-radius:16px;padding:18px;border:1px solid ${T.border}">
        <div style="font-size:14px;font-weight:800;margin-bottom:6px">🤖 Chave da API Gemini</div>
        <div style="font-size:12px;color:${T.muted};margin-bottom:12px;line-height:1.5">
          Necessária para identificar tampolas por foto com IA.<br/>
          Crie gratuitamente em <b style="color:${T.o2}">aistudio.google.com</b>
        </div>
        <input id="gemini-key-input" type="password" placeholder="Cole sua API key aqui..."
          style="width:100%;background:#1a1510;border:1.5px solid ${T.border};color:${T.text};border-radius:12px;padding:12px 14px;font-size:14px;outline:none;font-family:inherit;box-sizing:border-box;margin-bottom:10px"/>
        <button data-action="save-key" style="width:100%;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,${O},#c05500);color:#fff;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit">SALVAR CHAVE</button>
        <div id="key-status" style="margin-top:10px;font-size:12px;text-align:center"></div>
      </div>

      <!-- Version -->
      <div style="background:${T.card};border-radius:16px;padding:18px;border:1px solid ${T.border}">
        <div style="font-size:14px;font-weight:800;margin-bottom:12px">📱 Versão</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:13px;color:${T.muted}">Instalada no celular</span>
          <span id="profile-version-installed" style="font-size:13px;font-weight:700;color:${T.o2}"></span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:13px;color:${T.muted}">No servidor (GitHub)</span>
          <span id="profile-version-server" style="font-size:13px;font-weight:700;color:${T.muted}">-</span>
        </div>
        <div style="display:flex;gap:8px">
          <button data-action="check-version" style="flex:1;padding:10px;border-radius:10px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">🔄 Verificar</button>
          <button data-action="force-update" style="flex:1;padding:10px;border-radius:10px;border:1px solid #7c3aed44;background:#7c3aed15;color:#c084fc;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">⚡ Forçar update</button>
        </div>
      </div>

      <!-- Logout -->
      <button data-action="logout" style="width:100%;padding:14px;border-radius:14px;border:1px solid #401010;background:#200505;color:#ef4444;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit">
        Sair da conta
      </button>

    </div>
  </div>


  <!-- PHOTO SEARCH -->
  <div id="scr-photo-search" class="screen" style="display:none;padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button data-action="goto-list" style="${btnIconStyle()}">←</button>
      <div><div style="font-weight:800;font-size:18px">Buscar por Foto</div>
      <div style="font-size:11px;color:${T.muted}">IA compara com sua coleção</div></div>
    </div>
    <div style="padding:0 16px;display:flex;flex-direction:column;gap:14px">
      <div id="ps-thumb" style="width:100%;height:200px;border-radius:16px;border:2px dashed #2e2618;background:#1e1a16;display:flex;align-items:center;justify-content:center;overflow:hidden">
        <div style="text-align:center;color:#3a3028"><div style="font-size:40px;margin-bottom:8px">📷</div><div style="font-size:13px;color:#7a6a58">Tire ou selecione uma foto</div></div>
      </div>
      <div style="display:flex;gap:10px">
        <button data-action="ps-camera"  style="flex:1;padding:12px;border-radius:12px;border:1px solid #ff8c0055;background:#ff8c0012;color:#ffaa33;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">📷 Câmera</button>
        <button data-action="ps-gallery" style="flex:1;padding:12px;border-radius:12px;border:1px solid #2e2618;background:#252018;color:#7a6a58;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🖼️ Galeria</button>
      </div>
      <input id="ps-cam" type="file" accept="image/*" capture="environment" style="display:none" data-input="ps-cam"/>
      <input id="ps-gal" type="file" accept="image/*" style="display:none" data-input="ps-gal"/>
      <button id="ps-btn-search" data-action="ps-search" style="display:none;width:100%;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit">🔍 Buscar na coleção</button>
      <div id="ps-result" style="display:none"></div>
    </div>
  </div>

  <!-- STATS DETAIL -->
  <div id="scr-stats" class="screen" style="display:none;padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button data-action="goto-home" style="${btnIconStyle()}">←</button>
      <div style="flex:1;font-weight:800;font-size:18px">Estatísticas</div>
      <button data-action="export-pdf" style="background:#1e1a16;border:1px solid #2e2618;color:#ffaa33;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">📄 Exportar</button>
    </div>
    <div id="stats-content" style="padding:0 16px;display:flex;flex-direction:column;gap:14px"></div>
  </div>


  <!-- ACHIEVEMENTS -->
  <div id="scr-achievements" class="screen" style="display:none;padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button data-action="goto-home" style="${btnIconStyle()}">←</button>
      <div style="font-weight:800;font-size:18px">🏆 Conquistas</div>
    </div>
    <div id="achievements-content" style="padding:0 16px"></div>
  </div>

  <!-- MUSEUM -->
  <div id="scr-museum" class="screen" style="display:none;background:#0a0806;min-height:100vh;overflow:hidden">
    <!-- Fixed header with filters -->
    <div style="position:fixed;top:0;left:0;right:0;z-index:10;background:rgba(10,8,6,.97);border-bottom:1px solid #1a1510">
      <div style="padding:max(52px,16px) 16px 10px;display:flex;align-items:center;gap:10px">
        <button data-action="goto-list" style="${btnIconStyle()}">←</button>
        <div style="flex:1;position:relative">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px;pointer-events:none">🔍</span>
          <input id="museum-search" placeholder="Buscar tampola..."
            style="width:100%;background:#1a1510;border:1px solid #2e2618;color:#fff4e8;border-radius:10px;padding:9px 12px 9px 34px;font-size:14px;outline:none;font-family:inherit;box-sizing:border-box"/>
        </div>
      </div>
      <div style="padding:0 16px 10px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none">
        <button data-museum-filter="all" style="flex-shrink:0;padding:5px 12px;border-radius:16px;border:1px solid #ff8c0055;background:#ff8c0020;color:#ff8c00;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">Todas</button>
        <div id="museum-filter-chips" style="display:flex;gap:6px"></div>
      </div>
    </div>
    <!-- Scrollable content -->
    <div id="museum-scroll" style="height:100svh;overflow-y:scroll;scroll-snap-type:y mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-top:110px;box-sizing:border-box">
      <div id="museum-content"></div>
    </div>
  </div>

  <!-- MAP -->
  <div id="scr-map" class="screen" style="display:none;padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button data-action="goto-home" style="${btnIconStyle()}">←</button>
      <div style="font-weight:800;font-size:18px">🗺️ Mapa da Coleção</div>
    </div>
    <div id="map-content" style="padding:0 16px"></div>
  </div>


  <!-- PHOTO OPTIMIZE -->
  <div id="scr-photo-opt" class="screen" style="display:none;padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button data-action="back-from-opt" style="${btnIconStyle()}">←</button>
      <div><div style="font-weight:800;font-size:18px">✨ Otimizar Foto</div>
      <div style="font-size:11px;color:${T.muted}">Ajuste brilho, contraste e saturação</div></div>
    </div>
    <div style="padding:0 16px;display:flex;flex-direction:column;gap:14px">
      <!-- Preview -->
      <div style="width:100%;aspect-ratio:1;border-radius:16px;overflow:hidden;background:#1e1a16;border:1px solid #2e2618;display:flex;align-items:center;justify-content:center">
        <canvas id="opt-canvas" style="width:100%;height:100%;object-fit:contain;border-radius:50%"></canvas>
      </div>
      <!-- AI Optimize button -->
      <button id="btn-ai-opt" data-action="ai-optimize-photo" style="width:100%;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
        ✨ Otimizar com IA
      </button>

      <!-- Controls -->
      <div style="background:#1e1a16;border-radius:14px;padding:16px;border:1px solid #2e2618;display:flex;flex-direction:column;gap:14px">
        ${[
          {id:'opt-brightness', label:'☀️ Brilho',     min:50,  max:150, val:100},
          {id:'opt-contrast',   label:'⬛ Contraste',   min:50,  max:150, val:100},
          {id:'opt-saturation', label:'🎨 Saturação',   min:0,   max:200, val:100},
          {id:'opt-sharpness',  label:'🔍 Nitidez',     min:0,   max:5,   val:0, step:0.5},
          {id:'opt-dehaze',     label:'🌫️ Tirar reflexo', min:0, max:100, val:0},
        ].map(s=>`<div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:13px;font-weight:600">${s.label}</span>
            <span id="${s.id}-val" style="font-size:12px;color:#7a6a58">${s.val}${s.max<=5?'':' %'}</span>
          </div>
          <input type="range" data-opt="${s.id}" min="${s.min}" max="${s.max}" step="${s.step||1}" value="${s.val}"
            style="width:100%;accent-color:#ff8c00"/>
        </div>`).join('')}
        <button data-action="opt-reset" style="padding:10px;border-radius:10px;border:1px solid #2e2618;background:#252018;color:#7a6a58;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">↺ Resetar</button>
      </div>
      <button data-action="opt-confirm" style="width:100%;padding:16px;border-radius:14px;border:none;background:linear-gradient(135deg,#ff8c00,#c05500);color:#fff;font-weight:800;font-size:16px;cursor:pointer;font-family:inherit">✓ Aplicar e Salvar</button>
    </div>
  </div>


  <!-- COMPARE -->
  <div id="scr-compare" class="screen" style="display:none;padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button data-action="goto-list" style="${btnIconStyle()}">←</button>
      <div><div style="font-weight:800;font-size:18px">⚖️ Comparar</div>
      <div style="font-size:11px;color:${T.muted}">Selecione duas tampolas</div></div>
    </div>
    <div id="compare-content" style="padding:0 16px"></div>
  </div>

  <!-- NAV -->
  <div id="bottom-nav" style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:rgba(14,12,10,.96);border-top:1px solid ${T.border};padding:10px 8px 22px;display:flex;align-items:center;z-index:100;backdrop-filter:blur(12px)">
    <button class="nav-btn" data-scr="home" data-action="goto-home" style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 0;color:${T.muted}">
      <span style="font-size:28px">🏠</span><span style="font-size:11px;font-weight:700">Início</span>
    </button>
    <button class="nav-btn" data-scr="list" data-action="goto-list" style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 0;color:${T.muted}">
      <span style="font-size:28px">📋</span><span style="font-size:11px;font-weight:700">Coleção</span>
    </button>
    <div style="flex:1;display:flex;justify-content:center">
      <button data-action="open-add" style="width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,${O},#c05500);font-size:30px;color:#fff;box-shadow:0 4px 18px ${O}70;display:flex;align-items:center;justify-content:center">+</button>
    </div>
    <button class="nav-btn" data-scr="profile" data-action="goto-profile" style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 0;color:${T.muted}">
      <div id="nav-avatar" style="width:30px;height:30px;border-radius:50%;overflow:hidden;background:${T.card2};display:flex;align-items:center;justify-content:center;font-size:17px;border:2px solid ${T.border};pointer-events:none">👤</div>
      <span style="font-size:11px;font-weight:700">Perfil</span>
    </button>
  </div>
  <div id="toast-el"></div>

  <!-- Confirm Modal -->
  <div id="confirm-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9998;align-items:center;justify-content:center;padding:32px">
    <div style="background:#1e1a16;border-radius:20px;padding:28px 24px;width:100%;max-width:340px;border:1px solid #2e2618;box-shadow:0 20px 60px rgba(0,0,0,.6)">
      <div id="confirm-icon" style="font-size:40px;text-align:center;margin-bottom:14px"></div>
      <div id="confirm-title" style="font-weight:900;font-size:18px;text-align:center;margin-bottom:8px;color:#fff4e8"></div>
      <div id="confirm-msg" style="font-size:14px;color:#7a6a58;text-align:center;margin-bottom:24px;line-height:1.5"></div>
      <div style="display:flex;gap:10px">
        <button id="confirm-cancel" style="flex:1;padding:14px;border-radius:12px;border:1px solid #2e2618;background:#141210;color:#7a6a58;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit">Cancelar</button>
        <button id="confirm-ok" style="flex:1;padding:14px;border-radius:12px;border:none;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit"></button>
      </div>
    </div>
  </div>
`;
}

// ── AI ──
async function runAI() {
  // force reset any stuck state
  aiLoading = false;
  const btn = document.getElementById('btn-ai');
  if (btn) { btn.disabled = false; }

  // reload key every time
  GEMINI_KEY = localStorage.getItem(GEMINI_KEY_STORAGE) || '';

  if (!GEMINI_KEY) {
    showToast('⚠️ Cole sua chave Gemini em 👤 Perfil', 'err');
    goTo('profile'); renderProfile();
    return;
  }
  if (!pendingPhotoBase64) {
    showToast('Selecione uma foto primeiro', 'err');
    return;
  }

  aiLoading = true;
  if (btn) { btn.textContent='⟳ Analisando...'; btn.disabled=true; }
  const dbg = document.getElementById('ai-debug');
  if (dbg) { dbg.style.display='block'; dbg.textContent='Iniciando... modelo: gemini-2.5-flash | foto: ' + (originalPhotoBase64||pendingPhotoBase64||'').slice(0,20) + '...'; }
  try {
    if (dbg) dbg.textContent += '\nChamando API...';
    const result = await analyzePhotoWithAI(originalPhotoBase64||pendingPhotoBase64, originalPhotoMime||pendingPhotoMime);
    if (dbg) dbg.textContent += '\nSucesso!';
    aiData = result;
    showAIResult(result);
    showToast('✨ IA identificou a tampola!','ai');
    if (dbg) dbg.style.display='none';
  } catch(e) {
    console.error('AI error:', e);
    if (dbg) { dbg.style.display='block'; dbg.textContent = '❌ ERRO:\n' + (e.message||String(e)); }
    showToast('Erro IA: ' + (e.message||'Tente novamente'),'err');
  } finally {
    aiLoading = false;
    if (btn) { btn.textContent='✨ Identificar com IA'; btn.disabled=false; }
  }
}

function showAIResult(r) {
  const el=document.getElementById('ai-result'), c=document.getElementById('ai-result-content');
  if (!el||!c) return;
  c.innerHTML=[['Nome',r.name],['Marca',r.brand],['Tipo',r.type],['Cor',r.color],['País',r.country]].filter(([,v])=>v)
    .map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #2a1a3a"><span style="font-size:12px;color:${T.muted}">${l}</span><span style="font-size:13px;font-weight:700">${v}</span></div>`).join('')
    + (r.notes?`<div style="font-size:12px;color:${T.muted};margin-top:8px;font-style:italic">${r.notes}</div>`:'');
  el.style.display='block';
}

function applyAI() {
  if (!aiData) return;
  const fields = [
    ['f-name',    aiData.name],
    ['f-brand',   aiData.brand],
    ['f-type',    aiData.type || aiData.beverage || aiData.drink],
    ['f-color',   aiData.color],
    ['f-country', aiData.country],
    ['f-notes',   aiData.notes],
  ];
  let filled = 0;
  fields.forEach(([id, v]) => {
    if (v) {
      const el = document.getElementById(id);
      if (el) { el.value = v; filled++; }
    }
  });
  dismissAI();
  checkDuplicate();
  showToast(filled + ' campo(s) preenchido(s)!', 'ok');
}

function dismissAI() { const el=document.getElementById('ai-result'); if(el) el.style.display='none'; aiData=null; }

// ── Duplicate check ──
function checkDuplicate() {
  const nameEl=document.getElementById('f-name'), alertEl=document.getElementById('dup-alert'), dupName=document.getElementById('dup-name');
  if (!nameEl||!alertEl) return;
  const q=nameEl.value.trim().toLowerCase();
  if (q.length<2) { alertEl.style.display='none'; return; }
  const found=caps.find(c=>c.id!==editingId&&c.name.toLowerCase().includes(q));
  if (found) { dupName.textContent=found.name; alertEl.style.display='block'; } else alertEl.style.display='none';
}

// ── Add/Edit ──
function resetForm() {
  ['f-name','f-brand','f-color','f-country','f-notes'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });

  document.getElementById('dup-alert').style.display='none';
  const aiRes=document.getElementById('ai-result'); if(aiRes) aiRes.style.display='none';
}

function openAdd() {
  editingId=null; pendingPhoto=null; pendingPhotoBase64=null; pendingPhotoMime=null;
  originalPhotoBase64=null; originalPhotoMime=null; aiData=null;
  document.getElementById('add-title').textContent='Nova Tampola';
  const bsave = document.getElementById('btn-save');
  if (bsave) { bsave.textContent='SALVAR TAMPOLA'; bsave.disabled=false; }
  const dEl = document.getElementById('f-date'); if (dEl) dEl.value = todayISO();
  resetForm(); updatePhotoThumb(); goTo('add');
}

function openEdit(cap) {
  editingId=cap.id; pendingPhoto=cap.photo||null; pendingPhotoBase64=null; pendingPhotoMime=null;
  originalPhotoBase64=null; originalPhotoMime=null; aiData=null;
  document.getElementById('add-title').textContent='Editar Tampola';
  const bsave = document.getElementById('btn-save');
  if (bsave) { bsave.textContent='SALVAR ALTERAÇÕES'; bsave.disabled=false; }
  document.getElementById('f-name').value    = cap.name    ||'';
  document.getElementById('f-brand').value   = cap.brand   ||'';
  document.getElementById('f-type').value    = cap.type    ||'';
  document.getElementById('f-color').value   = cap.color   ||'';
  document.getElementById('f-country').value = cap.country ||'';
  document.getElementById('f-notes').value   = cap.notes   ||'';
  const rEl=document.getElementById('f-rarity'); if(rEl) rEl.value=cap.rarity||'normal';
  const dEl=document.getElementById('f-date'); if(dEl) dEl.value=cap.dateISO||todayISO();
  document.getElementById('dup-alert').style.display='none';
  const aiRes=document.getElementById('ai-result'); if(aiRes) aiRes.style.display='none';
  updatePhotoThumb(); goTo('add');
}

function cancelAdd() { if(editingId){renderDetail(editingId);goTo('detail');}else{renderList();goTo('list');} }

function getFormValues() {
  return {
    name:    (document.getElementById('f-name')?.value    ||'').trim(),
    brand:   (document.getElementById('f-brand')?.value   ||'').trim(),
    type:    (document.getElementById('f-type')?.value    ||'').trim(),
    color:   (document.getElementById('f-color')?.value   ||'').trim(),
    country: (document.getElementById('f-country')?.value ||'').trim(),
    notes:   (document.getElementById('f-notes')?.value   ||'').trim(),
    rarity:  document.getElementById('f-rarity')?.value || 'normal',
    dateISO: document.getElementById('f-date')?.value || todayISO(),
    photo:   pendingPhoto,
  };
}

async function saveCap() {
  const form=getFormValues();
  if (!form.name) return showToast('Nome obrigatório!','err');
  const btn=document.getElementById('btn-save');
  if (btn) { btn.disabled=true; btn.textContent='Salvando...'; }

  // timeout de segurança: se travar por mais de 10s libera o botão
  const timeout = setTimeout(() => {
    if (btn) { btn.disabled=false; btn.textContent=editingId?'SALVAR ALTERAÇÕES':'SALVAR TAMPOLA'; }
    showToast('Tempo esgotado. Verifique sua conexão.', 'err');
  }, 10000);

  try {
    // foto grande demais pode travar — reduz se necessário
    if (form.photo && form.photo.length > 500000) {
      form.photo = await compressPhoto(form.photo);
    }
    if (editingId) {
      form.addedAt = formatDateBR(form.dateISO);
      await dbUpdate(editingId, form); clearTimeout(timeout);
      showToast('Atualizada!');
      currentCapId=editingId; editingId=null; goTo('detail');
    } else {
      form.addedAt = formatDateBR(form.dateISO);
      await dbAdd(form); clearTimeout(timeout);
      showToast('Tampola adicionada!');
      editingId=null; goTo('list');
    }
  } catch(e) {
    clearTimeout(timeout);
    console.error('Save error:', e);
    showToast('Erro: ' + (e.message||'Tente novamente'), 'err');
    if (btn) { btn.disabled=false; btn.textContent=editingId?'SALVAR ALTERAÇÕES':'SALVAR TAMPOLA'; }
  }
}

// comprime foto para menos de 500kb
function compressPhoto(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 600;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  });
}

async function deleteCap(id) {
  const cap = caps.find(c => c.id === id);
  showConfirm({
    icon: '🗑️',
    title: 'Remover tampola?',
    message: cap ? ('"' + cap.name + '" será removida permanentemente da sua coleção.') : 'Esta tampola será removida permanentemente.',
    okLabel: 'Sim, remover',
    okColor: '#ef4444',
    onConfirm: async () => {
      try { await dbDelete(id); showToast('Removida.','info'); goTo('list'); }
      catch(e) { showToast('Erro ao remover.','err'); }
    }
  });
}

// ── Photo / Crop ──
function loadPhoto(file) {
  if (!file) return;
  const mime = file.type||'image/jpeg';
  const r = new FileReader();
  r.onload = e => {
    const dataUrl = e.target.result;
    originalPhotoBase64 = dataUrl.split(',')[1];
    originalPhotoMime   = mime;
    pendingPhotoBase64  = originalPhotoBase64;
    pendingPhotoMime    = mime;
    cropSrc=dataUrl; cropScale=1; cropX=0; cropY=0; cropRotate=0;
    openCropScreen(dataUrl);
  };
  r.readAsDataURL(file);
}

function openCrop() {
  if (!pendingPhoto) return;
  cropSrc=pendingPhoto; cropScale=1; cropX=0; cropY=0; cropRotate=0;
  openCropScreen(pendingPhoto);
}

function openCropScreen(src) {
  const SIZE=Math.min(window.innerWidth,480)-48;
  const wrap=document.getElementById('crop-wrap');
  wrap.style.width=SIZE+'px'; wrap.style.height=SIZE+'px';
  wrap.innerHTML=`<canvas id="crop-canvas" width="${SIZE}" height="${SIZE}"
    style="width:${SIZE}px;height:${SIZE}px;display:block;touch-action:none;cursor:grab"
    ontouchstart="cropDown(event)" ontouchmove="cropMove(event)" ontouchend="cropUp()"
    onmousedown="cropDown(event)" onmousemove="cropMove(event)" onmouseup="cropUp()"></canvas>`;
  document.getElementById('crop-img').src=src;
  document.getElementById('zoom-slider').value=1;
  document.getElementById('rotate-slider').value=0;
  document.getElementById('rotate-label').textContent='0°';
  goTo('crop');
}

function confirmCrop() {
  const canvas=document.getElementById('crop-canvas');
  const img=document.getElementById('crop-img');
  if (!canvas||!img) return;
  const SIZE=canvas.width;
  const out=document.createElement('canvas');
  out.width=SIZE; out.height=SIZE;
  const ctx=out.getContext('2d');
  ctx.beginPath(); ctx.arc(SIZE/2,SIZE/2,SIZE/2,0,Math.PI*2); ctx.clip();
  ctx.save();
  ctx.translate(SIZE/2+cropX, SIZE/2+cropY);
  ctx.rotate(cropRotate*Math.PI/180);
  const iw=img.naturalWidth, ih=img.naturalHeight;
  const scale=Math.max(SIZE/iw,SIZE/ih)*cropScale;
  ctx.drawImage(img, -iw*scale/2, -ih*scale/2, iw*scale, ih*scale);
  ctx.restore();
  // optimize: resize to 400px max for efficient storage
  const FINAL_SIZE = Math.min(SIZE, 400);
  const final = document.createElement('canvas');
  final.width = FINAL_SIZE; final.height = FINAL_SIZE;
  final.getContext('2d').drawImage(out, 0, 0, FINAL_SIZE, FINAL_SIZE);
  pendingPhoto = final.toDataURL('image/jpeg', 0.82);
  pendingPhotoBase64 = pendingPhoto.split(',')[1];
  pendingPhotoMime = 'image/jpeg';
  updatePhotoThumb(); goTo('add');
}

function updatePhotoThumb() {
  const thumb=document.getElementById('photo-thumb');
  const aiBtnWrap=document.getElementById('ai-btn-wrap');
  if (!thumb) return;
  if (pendingPhoto) {
    thumb.innerHTML=`<div style="position:relative;width:90px;height:90px;flex-shrink:0">
      <img src="${pendingPhoto}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:2px solid ${O}"/>
      <button data-action="remove-photo" style="position:absolute;top:-4px;right:-4px;background:#200505;border:1px solid #ef4444;color:#ef4444;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;font-family:inherit">✕</button>
    </div>`;
    if (aiBtnWrap) aiBtnWrap.style.display='flex';
    const btnOpt = document.getElementById('btn-opt');
    if (btnOpt) btnOpt.style.display='block';
  } else {
    thumb.innerHTML=`<div style="width:90px;height:90px;border-radius:50%;background:${T.card2};border:2px dashed ${T.border};display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0">🍺</div>`;
    if (aiBtnWrap) aiBtnWrap.style.display='none';
    const btnOpt2 = document.getElementById('btn-opt');
    if (btnOpt2) btnOpt2.style.display='none';
  }
}

function drawCrop() {
  const canvas=document.getElementById('crop-canvas');
  const img=document.getElementById('crop-img');
  if (!canvas||!img) return;
  const SIZE=canvas.width;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,SIZE,SIZE);
  ctx.save();
  ctx.translate(SIZE/2+cropX, SIZE/2+cropY);
  ctx.rotate(cropRotate*Math.PI/180);
  const iw=img.naturalWidth, ih=img.naturalHeight;
  const scale=Math.max(SIZE/iw,SIZE/ih)*cropScale;
  ctx.drawImage(img, -iw*scale/2, -ih*scale/2, iw*scale, ih*scale);
  ctx.restore();
  // circular mask
  ctx.save();
  ctx.globalCompositeOperation='destination-in';
  ctx.beginPath(); ctx.arc(SIZE/2,SIZE/2,SIZE/2,0,Math.PI*2); ctx.fill();
  ctx.restore();
  // update label
  const lbl=document.getElementById('rotate-label');
  if (lbl) lbl.textContent=Math.round(cropRotate)+'°';
}

function rotateCrop(delta) {
  cropRotate += delta;
  if (cropRotate > 180) cropRotate -= 360;
  if (cropRotate < -180) cropRotate += 360;
  const slider = document.getElementById('rotate-slider');
  const label  = document.getElementById('rotate-label');
  if (slider) slider.value = cropRotate;
  if (label)  label.textContent = Math.round(cropRotate) + '°';
  drawCrop();
}

function rotateCropTo(val) {
  cropRotate = val;
  const label = document.getElementById('rotate-label');
  if (label) label.textContent = Math.round(cropRotate) + '°';
  drawCrop();
}

function resetCrop() {
  cropRotate = 0; cropScale = 1; cropX = 0; cropY = 0;
  const zSlider = document.getElementById('zoom-slider');
  const rSlider = document.getElementById('rotate-slider');
  const label   = document.getElementById('rotate-label');
  if (zSlider) zSlider.value = 1;
  if (rSlider) rSlider.value = 0;
  if (label)   label.textContent = '0°';
  drawCrop();
}

function triggerCamera() {
  const el = document.getElementById('inp-cam');
  if (el) { el.value = ''; el.click(); }
}

function triggerGallery() {
  const el = document.getElementById('inp-gal');
  if (el) { el.value = ''; el.click(); }
}

function cropDown(e) {
  e.preventDefault();
  if (e.touches&&e.touches.length===2) {
    cropPinchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  } else {
    const t=e.touches?e.touches[0]:e;
    cropDragging=true; cropLastX=t.clientX; cropLastY=t.clientY;
  }
}
function cropMove(e) {
  e.preventDefault();
  if (e.touches&&e.touches.length===2) {
    const dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    cropScale=Math.min(4,Math.max(1,cropScale+(dist-cropPinchDist)*0.01));
    cropPinchDist=dist;
    document.getElementById('zoom-slider').value=cropScale;
    drawCrop();
  } else if (cropDragging) {
    const t=e.touches?e.touches[0]:e;
    cropX+=t.clientX-cropLastX; cropY+=t.clientY-cropLastY;
    cropLastX=t.clientX; cropLastY=t.clientY;
    drawCrop();
  }
}
function cropUp() { cropDragging=false; }

// ── Render: Home ──
function renderHome() {
  const countries=[...new Set(caps.map(c=>c.country).filter(Boolean))];
  const brands=[...new Set(caps.map(c=>c.brand).filter(Boolean))];
  const recent=caps.slice(0,3);
  const colorMap={};
  caps.forEach(c=>{ const k=(c.color||'').trim()||'Sem cor'; colorMap[k]=(colorMap[k]||0)+1; });
  const colorList=Object.entries(colorMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const el=document.getElementById('scr-home'); if(!el) return;
  el.innerHTML=`
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,${O},#c05500);display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 14px ${O}40;flex-shrink:0">🍺</div>
      <div style="flex:1"><div style="font-weight:800;font-size:22px;letter-spacing:-.3px">Tampolas</div><div style="font-size:12px;color:${T.muted}">${currentUser?.displayName||'Minha coleção'}</div></div><div style="font-size:10px;font-weight:700;color:${T.dim};background:${T.card2};border:1px solid ${T.border};border-radius:8px;padding:3px 8px;flex-shrink:0">${APP_VERSION}</div>
    </div>
    <div data-action="goto-list" style="margin:0 16px 14px;border-radius:20px;overflow:hidden;cursor:pointer">
      <div style="background:linear-gradient(135deg,${O},#ffaa00 55%,#ffcc44);padding:24px 20px;position:relative;overflow:hidden">
        <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(0,0,0,.45);text-transform:uppercase">Total de Tampolas</div>
        <div style="font-size:64px;font-weight:900;color:#fff;line-height:1;margin:4px 0;text-shadow:0 2px 10px rgba(0,0,0,.2)">${caps.length}</div>
        <div style="font-size:13px;color:rgba(0,0,0,.45)">Ver coleção completa →</div>
        <div style="position:absolute;right:-8px;top:50%;transform:translateY(-50%);font-size:90px;opacity:.12">🍺</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 16px 12px">
      ${[{l:'PAÍSES',v:countries.length,s:countries.slice(0,2).join(', ')||'Nenhum ainda',ic:'🌍'},{l:'MARCAS',v:brands.length,s:brands.slice(0,2).join(', ')||'Nenhuma ainda',ic:'🏷️'}].map(x=>`
      <div style="background:${T.card};border-radius:16px;padding:16px;border:1px solid ${T.border};position:relative;overflow:hidden">
        <div style="font-size:10px;font-weight:700;color:${T.muted};letter-spacing:2px">${x.l}</div>
        <div style="font-size:36px;font-weight:900;color:${T.o2};line-height:1;margin:4px 0">${x.v}</div>
        <div style="font-size:11px;color:${T.dim};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.s}</div>
        <div style="position:absolute;right:10px;bottom:8px;font-size:24px;opacity:.12">${x.ic}</div>
      </div>`).join('')}
    </div>
    <!-- Quick access row -->
    <div style="display:flex;gap:10px;margin:0 16px 12px;overflow-x:auto;scrollbar-width:none">
      ${[
        {a:'goto-achievements', ic:'🏆', l:'Conquistas'},
        {a:'goto-map',          ic:'🗺️', l:'Mapa'},
        {a:'goto-stats',        ic:'📊', l:'Stats'},
        {a:'goto-compare',       ic:'⚖️', l:'Comparar'},
      ].map(x=>`<button data-action="${x.a}" style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 16px;border-radius:14px;border:1px solid #2e2618;background:#1e1a16;color:#fff4e8;cursor:pointer;font-family:inherit">
        <span style="font-size:22px">${x.ic}</span>
        <span style="font-size:11px;font-weight:700;color:#7a6a58">${x.l}</span>
      </button>`).join('')}
    </div>

    ${colorList.length?`
    <div style="margin:0 16px 14px;background:${T.card};border-radius:16px;padding:16px;border:1px solid ${T.border}">
      <div style="font-size:11px;font-weight:700;color:${T.muted};letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px">🎨 Por Cor</div>
      ${colorList.map(([cor,qtd])=>{const pct=Math.round(qtd/caps.length*100);return`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:600">${cor}</span><span style="font-size:13px;font-weight:700;color:${T.o2}">${qtd} <span style="font-size:11px;color:${T.muted}">(${pct}%)</span></span></div><div style="height:6px;background:${T.card2};border-radius:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${O},${T.o2});border-radius:6px"></div></div></div>`;}).join('')}
    </div>`:''}
    ${recent.length?`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0 16px;margin-bottom:8px">
      <span style="font-size:11px;font-weight:700;color:${T.muted};letter-spacing:1px;text-transform:uppercase">Recentes</span>
      <span data-action="goto-list" style="font-size:12px;color:${O};font-weight:700;cursor:pointer">Ver todas</span>
    </div>
    ${recent.map(c=>capRowHTML(c)).join('')}`:''}`;
}

// ── Render: List ──
function getFilteredSorted() {
  const lq = searchQ.toLowerCase();
  let result = caps.filter(c => {
    const matchQ = !lq || c.name.toLowerCase().includes(lq) ||
      (c.brand||'').toLowerCase().includes(lq) ||
      (c.country||'').toLowerCase().includes(lq) ||
      (c.color||'').toLowerCase().includes(lq) ||
      (c.type||'').toLowerCase().includes(lq);
    let matchF = true;
    if (activeFilter.type === 'country') matchF = (c.country||'') === activeFilter.value;
    if (activeFilter.type === 'color')   matchF = (c.color||'')   === activeFilter.value;
    if (activeFilter.type === 'brand')   matchF = (c.brand||'')   === activeFilter.value;
    if (activeFilter.type === 'type')    matchF = (c.type||'')    === activeFilter.value;
    if (activeFilter.type === 'rarity')  matchF = (c.rarity||'normal') === activeFilter.value;
    return matchQ && matchF;
  });
  // Sort
  if (activeSort === 'az')      result.sort((a,b) => a.name.localeCompare(b.name));
  if (activeSort === 'country') result.sort((a,b) => (a.country||'').localeCompare(b.country||''));
  if (activeSort === 'color')   result.sort((a,b) => (a.color||'').localeCompare(b.color||''));
  if (activeSort === 'rarity') {
    const order = {unica:0, muito_rara:1, rara:2, normal:3};
    result.sort((a,b) => (order[a.rarity||'normal']||3) - (order[b.rarity||'normal']||3));
  }
  // recent = default (createdAt desc, already ordered from Firebase)
  return result;
}

function renderFilterChips() {
  const el = document.getElementById('filter-chips');
  if (!el) return;
  const rarityLabels = {normal:'⚪ Normal',rara:'🟡 Rara',muito_rara:'🟠 Muito Rara',unica:'🔴 Única'};
  const filters = [
    ...[ ...new Set(caps.map(c=>c.country).filter(Boolean)) ].map(v=>({ type:'country', value:v, label: countryFlag(v)+' '+v })),
    ...[ ...new Set(caps.map(c=>c.color).filter(Boolean))   ].map(v=>({ type:'color',   value:v, label:'🎨 '+v })),
    ...[ ...new Set(caps.map(c=>c.type).filter(Boolean))    ].map(v=>({ type:'type',    value:v, label:'🥤 '+v })),
    ...[ ...new Set(caps.map(c=>c.rarity).filter(v=>v&&v!=='normal')) ].map(v=>({ type:'rarity', value:v, label: rarityLabels[v] })),
  ];
  el.innerHTML = filters.map(f => {
    const active = activeFilter.type===f.type && activeFilter.value===f.value;
    return `<button data-filter-type="${f.type}" data-filter-value="${f.value}"
      style="flex-shrink:0;padding:6px 14px;border-radius:20px;border:1.5px solid ${active?'#ff8c00':'#2e2618'};background:${active?'#ff8c0020':'#252018'};color:${active?'#ff8c00':'#7a6a58'};font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">${f.label}</button>`;
  }).join('');
}

function updateSortButtons() {
  document.querySelectorAll('[data-sort]').forEach(b => {
    const active = b.dataset.sort === activeSort;
    b.style.background = active ? '#ff8c0020' : '#252018';
    b.style.color       = active ? '#ff8c00'   : '#7a6a58';
    b.style.borderColor = active ? '#ff8c0055' : '#2e2618';
  });
}

function groupKeyFor(cap) {
  if (activeSort === 'country') return cap.country || 'Sem país';
  if (activeSort === 'color')   return cap.color   || 'Sem cor';
  if (activeSort === 'rarity')  return {normal:'⚪ Normal',rara:'🟡 Rara',muito_rara:'🟠 Muito Rara',unica:'🔴 Única'}[cap.rarity||'normal'];
  return null; // no grouping for 'recent' and 'az'
}

function groupIconFor(key) {
  if (activeSort === 'country' && key !== 'Sem país') return countryFlag(key) + ' ';
  return '';
}

function renderList() {
  const el  = document.getElementById('list-items');
  const cnt = document.getElementById('list-count');
  if (!el) return;
  renderFilterChips();
  updateSortButtons();
  const filtered = getFilteredSorted();
  if (cnt) cnt.textContent = `${caps.length} tampola${caps.length!==1?'s':''}`;

  if (filtered.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:64px 24px;color:${T.dim}"><div style="font-size:52px;margin-bottom:14px">${caps.length===0?'🫙':'🔍'}</div><div style="font-size:14px;line-height:1.6">${caps.length===0?'Coleção vazia!<br>Toque em + para começar.':'Nenhuma encontrada.'}</div></div>`;
    return;
  }

  const groupable = ['country', 'color', 'rarity'].includes(activeSort);

  if (!groupable) {
    // No grouping — render flat (recent / az)
    if (listView === 'grid') {
      el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 16px">${filtered.map(c => capGridHTML(c)).join('')}</div>`;
    } else {
      el.innerHTML = filtered.map(c => capRowHTML(c)).join('');
    }
    return;
  }

  // Grouped rendering with section dividers
  const groups = {};
  filtered.forEach(c => {
    const key = groupKeyFor(c);
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  const groupKeys = Object.keys(groups).sort((a,b) => groups[b].length - groups[a].length);

  el.innerHTML = groupKeys.map(key => {
    const items = groups[key];
    const header = `<div style="padding:14px 16px 8px;display:flex;align-items:center;gap:8px">
      <div style="font-size:13px;font-weight:800;color:#ffaa33;letter-spacing:.5px">${groupIconFor(key)}${key}</div>
      <div style="flex:1;height:1px;background:#2e2618"></div>
      <div style="font-size:11px;color:#7a6a58;font-weight:700">${items.length}</div>
    </div>`;
    const body = listView === 'grid'
      ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 16px 4px">${items.map(c => capGridHTML(c)).join('')}</div>`
      : items.map(c => capRowHTML(c)).join('');
    return header + body;
  }).join('');
}

function rarityBadge(cap) {
  const r = cap.rarity || 'normal';
  if (r === 'normal') return '';
  const map = { rara:'🟡', muito_rara:'🟠', unica:'🔴' };
  return `<span style="position:absolute;top:4px;right:4px;font-size:14px">${map[r]||''}</span>`;
}

function capGridHTML(cap) {
  const thumb = cap.photo
    ? `<img src="${cap.photo}" style="width:100%;height:100%;object-fit:cover"/>`
    : `<div style="width:100%;height:100%;background:${cap.color||'#ff8c00'};display:flex;align-items:center;justify-content:center;font-size:28px">🍺</div>`;
  return `<div style="border-radius:12px;overflow:hidden;background:#1e1a16;border:1px solid #2e2618;aspect-ratio:1;position:relative">
    <div data-action="open-detail" data-id="${cap.id}" style="width:100%;height:100%;cursor:pointer;position:absolute;inset:0">
      ${thumb}
    </div>
    ${rarityBadge(cap)}
    ${cap.photo ? `<button data-action="expand-photo" data-capid="${cap.id}"
      style="position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:6px;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2">⛶</button>` : ''}
    <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.85));padding:6px 6px 5px;pointer-events:none">
      <div style="font-size:10px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cap.name}</div>
    </div>
  </div>`;
}

function capRowHTML(cap) {
  const thumb=cap.photo
    ?`<div style="width:50px;height:50px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,.08);flex-shrink:0"><img src="${cap.photo}" style="width:100%;height:100%;object-fit:cover"/></div>`
    :`<div style="width:50px;height:50px;border-radius:50%;background:${O};display:flex;align-items:center;justify-content:center;font-size:22px;border:2px solid rgba(255,255,255,.08);flex-shrink:0">🍺</div>`;
  const rarityIcon = {rara:'🟡',muito_rara:'🟠',unica:'🔴'}[cap.rarity||''] || '';
  return `<div data-action="open-detail" data-id="${cap.id}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;cursor:pointer;margin:0 16px 8px;border:1px solid ${T.border};background:${T.card}">
    ${thumb}
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cap.name} ${rarityIcon}</div>
      <div style="font-size:12px;color:${T.muted};margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${[cap.brand,cap.type,cap.color].filter(Boolean).join(' · ')||'—'}</div>
    </div>
    <span style="font-size:20px;color:${T.muted};flex-shrink:0">›</span>
  </div>`;
}

// ── Render: Detail ──
function openDetail(id) { currentCapId=id; renderDetail(id); goTo('detail'); }

function renderDetail(id) {
  const cap=caps.find(c=>c.id===id); if(!cap) return;
  const fields=[['🏷️ Marca',cap.brand],['🥤 Tipo',cap.type],['🎨 Cor',cap.color],['📍 País',cap.country],['⭐ Raridade',{normal:'⚪ Normal',rara:'🟡 Rara',muito_rara:'🟠 Muito Rara',unica:'🔴 Única'}[cap.rarity||'normal']],['📅 Adicionada',cap.dateISO ? formatDateBR(cap.dateISO) : cap.addedAt]].filter(([,v])=>v);
  const el=document.getElementById('scr-detail'); if(!el) return;
  el.innerHTML=`
    <div style="position:relative;height:280px;overflow:hidden">
      ${cap.photo
        ?`<img src="${cap.photo}" data-action="expand-photo" data-capid="${cap.id}" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in"/>`
        :`<div style="width:100%;height:100%;background:linear-gradient(160deg,${O}55,${T.bg});display:flex;align-items:center;justify-content:center;font-size:110px">🍺</div>`}
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.15),rgba(20,18,16,.97))"></div>
      <button data-action="goto-list" style="position:absolute;top:52px;left:16px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.1);color:${T.text};border-radius:10px;padding:8px 12px;cursor:pointer;font-size:18px">←</button>
      <div style="position:absolute;bottom:16px;left:16px;right:16px">
        <div style="font-weight:900;font-size:26px;text-shadow:0 2px 8px rgba(0,0,0,.8)">${cap.name}</div>
        ${cap.brand?`<div style="color:rgba(255,255,255,.55);font-size:14px;margin-top:4px">${cap.brand}</div>`:''}
      </div>
    </div>
    <div style="padding:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        ${fields.map(([l,v])=>`<div style="background:${T.card};border-radius:14px;padding:14px;border:1px solid ${T.border}"><div style="font-size:11px;color:${T.muted};font-weight:600;margin-bottom:5px">${l}</div><div style="font-weight:700;font-size:15px">${v}</div></div>`).join('')}
      </div>
      ${cap.notes?`<div style="background:${T.card};border-radius:14px;padding:14px 16px;border:1px solid ${T.border};margin-bottom:12px"><div style="font-size:11px;color:${T.muted};font-weight:600;margin-bottom:6px">📝 Notas</div><div style="font-size:14px;color:#c0a888;line-height:1.6">${cap.notes}</div></div>`:''}
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <button data-action="share-cap" data-id="${cap.id}" style="flex:1;padding:13px;border-radius:14px;border:1px solid #ff8c0044;background:#ff8c0012;color:#ffaa33;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">📤 Compartilhar</button>
        <button data-action="compare-cap" data-id="${cap.id}" style="flex:1;padding:13px;border-radius:14px;border:1px solid #2e2618;background:#1e1a16;color:#7a6a58;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">⚖️ Comparar</button>
        <button data-action="museum-from-detail" data-id="${cap.id}" style="flex:1;padding:13px;border-radius:14px;border:1px solid #2e2618;background:#1e1a16;color:#7a6a58;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🖼️ Museu</button>
      </div>
      <div style="display:flex;gap:10px">
        <button data-action="edit-cap" data-id="${cap.id}" style="flex:1;padding:14px;border-radius:14px;border:1px solid ${T.border};background:${T.card};color:${T.text};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">✏️ Editar</button>
        <button data-action="delete-cap" data-id="${cap.id}" style="padding:14px 18px;border-radius:14px;border:1px solid #401010;background:#200505;color:#ef4444;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🗑</button>
      </div>
    </div>`;
}

// ── Settings ──
function saveGeminiKey() {
  const input = document.getElementById('gemini-key-input');
  if (!input) return;
  const key = input.value.trim();
  if (!key) return showToast('Cole uma chave válida!', 'err');
  localStorage.setItem(GEMINI_KEY_STORAGE, key);
  loadGeminiKey();
  input.value = '';
  showToast('Chave salva com sucesso!', 'ok');
  updateKeyStatus();
}

function updateKeyStatus() {
  const el = document.getElementById('key-status');
  if (!el) return;
  const key = localStorage.getItem(GEMINI_KEY_STORAGE) || '';
  if (key) {
    el.innerHTML = '<span style="color:#22c55e">✓ Chave configurada (' + key.slice(0,8) + '...)</span>';
  } else {
    el.innerHTML = '<span style="color:#ef4444">✕ Nenhuma chave configurada</span>';
  }
}

async function checkServerVersion() {
  const elServer = document.getElementById('profile-version-server');
  if (elServer) { elServer.textContent = 'verificando...'; elServer.style.color = '#7a6a58'; }
  try {
    const res  = await fetch('./app.js?nocache=' + Date.now());
    const text = await res.text();
    const m    = text.match(/APP_VERSION\s*=\s*'(v[\d.]+)'/);
    const serverVer = m ? m[1] : '?';
    if (elServer) {
      elServer.textContent = serverVer;
      elServer.style.color = serverVer === APP_VERSION ? '#22c55e' : '#ef4444';
    }
    if (serverVer !== APP_VERSION) {
      showToast('Nova versão disponível! Limpe o cache.', 'info');
    } else {
      showToast('Você está na versão mais recente! ✅', 'ok');
    }
  } catch(e) {
    if (elServer) { elServer.textContent = 'erro'; }
    showToast('Erro ao verificar versão.', 'err');
  }
}

let psPhotoBase64 = null, psPhotoMime = null;

function loadPsPhoto(file) {
  if (!file) return;
  const mime = file.type || 'image/jpeg';
  const r = new FileReader();
  r.onload = e => {
    psPhotoBase64 = e.target.result.split(',')[1];
    psPhotoMime   = mime;
    const thumb = document.getElementById('ps-thumb');
    if (thumb) thumb.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover"/>`;
    const btn = document.getElementById('ps-btn-search');
    if (btn) btn.style.display = 'block';
  };
  r.readAsDataURL(file);
}

async function searchByPhoto() {
  if (!psPhotoBase64) return;
  GEMINI_KEY = localStorage.getItem(GEMINI_KEY_STORAGE) || '';
  if (!GEMINI_KEY) { showToast('Configure a chave Gemini em 👤 Perfil', 'err'); return; }
  const btn = document.getElementById('ps-btn-search');
  const resEl = document.getElementById('ps-result');
  if (btn) { btn.textContent = '⟳ Analisando...'; btn.disabled = true; }
  try {
    const result = await analyzePhotoWithAI(psPhotoBase64, psPhotoMime);
    // compare with collection
    const name  = (result.name  || '').toLowerCase();
    const brand = (result.brand || '').toLowerCase();
    const matches = caps.filter(c => {
      const cn = c.name.toLowerCase(), cb = (c.brand||'').toLowerCase();
      return (name && (cn.includes(name.split(' ')[0]) || name.includes(cn.split(' ')[0])))
          || (brand && brand.length > 2 && cb.includes(brand));
    });
    if (resEl) {
      if (matches.length > 0) {
        resEl.style.display = 'block';
        resEl.innerHTML = `
          <div style="background:#052010;border:1.5px solid #0a4020;border-radius:14px;padding:16px">
            <div style="font-size:13px;font-weight:800;color:#22c55e;margin-bottom:12px">✅ Encontrada na coleção!</div>
            ${matches.map(c => `<div data-action="open-detail" data-id="${c.id}"
              style="display:flex;align-items:center;gap:10px;padding:10px;background:#0a2010;border-radius:10px;cursor:pointer;margin-bottom:6px">
              ${c.photo ? `<img src="${c.photo}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0"/>` : `<div style="width:40px;height:40px;border-radius:50%;background:${c.color||'#ff8c00'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🍺</div>`}
              <div><div style="font-weight:700;font-size:14px">${c.name}</div><div style="font-size:12px;color:#7a6a58">${c.brand||''}</div></div>
            </div>`).join('')}
          </div>`;
      } else {
        resEl.style.display = 'block';
        resEl.innerHTML = `
          <div style="background:#200505;border:1.5px solid #401010;border-radius:14px;padding:16px;text-align:center">
            <div style="font-size:32px;margin-bottom:8px">❌</div>
            <div style="font-weight:800;color:#ef4444;margin-bottom:4px">Não encontrada!</div>
            <div style="font-size:13px;color:#7a6a58">A IA identificou: <b style="color:#fff4e8">${result.name||'?'}</b></div>
            <div style="font-size:12px;color:#7a6a58;margin-top:4px">Esta tampola não está na sua coleção.</div>
          </div>`;
      }
    }
  } catch(e) {
    showToast('Erro ao analisar: ' + e.message, 'err');
  } finally {
    if (btn) { btn.textContent = '🔍 Buscar na coleção'; btn.disabled = false; }
  }
}

function renderStats() {
  const el = document.getElementById('stats-content');
  if (!el) return;

  // Countries
  const countryMap = {};
  caps.forEach(c => {
    const k = (c.country||'Desconhecido').trim();
    countryMap[k] = (countryMap[k]||0) + 1;
  });
  const countries = Object.entries(countryMap).sort((a,b)=>b[1]-a[1]);

  // Colors
  const colorMap = {};
  caps.forEach(c => {
    const k = (c.color||'Sem cor').trim();
    colorMap[k] = (colorMap[k]||0) + 1;
  });
  const colors = Object.entries(colorMap).sort((a,b)=>b[1]-a[1]);

  // Brands
  const brandMap = {};
  caps.forEach(c => {
    const k = (c.brand||'Sem marca').trim();
    brandMap[k] = (brandMap[k]||0) + 1;
  });
  const brands = Object.entries(brandMap).sort((a,b)=>b[1]-a[1]);

  // Types
  const typeMap = {};
  caps.forEach(c => {
    const k = (c.type||'Não informado').trim();
    typeMap[k] = (typeMap[k]||0) + 1;
  });
  const types = Object.entries(typeMap).sort((a,b)=>b[1]-a[1]);

  const barRow = (label, count, total, extra='') => {
    const pct = Math.round(count/total*100);
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;align-items:center">
        <span style="font-size:14px;font-weight:600">${extra}${label}</span>
        <span style="font-size:13px;font-weight:700;color:#ffaa33">${count} <span style="font-size:11px;color:#7a6a58">(${pct}%)</span></span>
      </div>
      <div style="height:7px;background:#252018;border-radius:6px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#ff8c00,#ffaa33);border-radius:6px"></div>
      </div>
    </div>`;
  };

  const section = (title, icon, rows) => `
    <div style="background:#1e1a16;border-radius:16px;padding:16px;border:1px solid #2e2618">
      <div style="font-size:14px;font-weight:800;margin-bottom:14px">${icon} ${title}</div>
      ${rows}
    </div>`;

  el.innerHTML = [
    section('Países', '🌍', countries.map(([k,v]) =>
      barRow(k, v, caps.length, countryFlag(k) + ' ')).join('')),
    section('Cores', '🎨', colors.map(([k,v]) =>
      barRow(k, v, caps.length)).join('')),
    section('Marcas', '🏷️', brands.slice(0,10).map(([k,v]) =>
      barRow(k, v, caps.length)).join('')),
    section('Tipo de bebida', '🥤', types.map(([k,v]) =>
      barRow(k, v, caps.length)).join('')),
  ].join('');
}


// ── Conquistas ──
const ACHIEVEMENTS = [
  { id:'first',       icon:'🍺', title:'Primeira Tampola',      desc:'Cadastrou sua primeira tampola',              check: c => c.length >= 1 },
  { id:'ten',         icon:'🔟', title:'10 Tampolas',           desc:'10 tampolas na coleção',                      check: c => c.length >= 10 },
  { id:'fifty',       icon:'5️⃣0️⃣', title:'50 Tampolas',          desc:'50 tampolas na coleção',                      check: c => c.length >= 50 },
  { id:'hundred',     icon:'💯', title:'100 Tampolas',          desc:'100 tampolas na coleção',                     check: c => c.length >= 100 },
  { id:'countries3',  icon:'🌍', title:'3 Países',              desc:'Tampolas de 3 países diferentes',             check: c => new Set(c.map(x=>x.country).filter(Boolean)).size >= 3 },
  { id:'countries10', icon:'🗺️', title:'10 Países',             desc:'Tampolas de 10 países diferentes',            check: c => new Set(c.map(x=>x.country).filter(Boolean)).size >= 10 },
  { id:'continents',  icon:'🌐', title:'Todos os Continentes',  desc:'Tampolas dos 6 continentes',                  check: c => {
    const eu=['alemanha','bélgica','dinamarca','espanha','frança','holanda','irlanda','itália','noruega','portugal','reino unido','rússia','suécia','suíça','república tcheca','escócia'];
    const am=['argentina','brasil','canadá','chile','colômbia','cuba','eua','estados unidos','jamaica','méxico','peru','uruguai'];
    const as=['china','coreia','japão','tailândia'];
    const af=['áfrica do sul'];
    const oc=['austrália'];
    const countries = c.map(x=>(x.country||'').toLowerCase());
    return [eu,am,as,af,oc].every(cont => cont.some(p => countries.includes(p)));
  }},
  { id:'brands5',     icon:'🏷️', title:'5 Marcas',              desc:'Tampolas de 5 marcas diferentes',             check: c => new Set(c.map(x=>x.brand).filter(Boolean)).size >= 5 },
  { id:'brands20',    icon:'🏪', title:'20 Marcas',             desc:'Tampolas de 20 marcas diferentes',            check: c => new Set(c.map(x=>x.brand).filter(Boolean)).size >= 20 },
  { id:'rare',        icon:'🟡', title:'Caçador de Raras',      desc:'Tem uma tampola rara',                        check: c => c.some(x=>x.rarity==='rara'||x.rarity==='muito_rara'||x.rarity==='unica') },
  { id:'unique',      icon:'🔴', title:'Peça Única',            desc:'Tem uma tampola única/especial',              check: c => c.some(x=>x.rarity==='unica') },
  { id:'photo',       icon:'📸', title:'Fotógrafo',             desc:'Tem 10 tampolas com foto',                    check: c => c.filter(x=>x.photo).length >= 10 },
  { id:'types3',      icon:'🥤', title:'Diversidade',           desc:'3 tipos de bebida diferentes',                check: c => new Set(c.map(x=>x.type).filter(Boolean)).size >= 3 },
  { id:'brazil10',    icon:'🇧🇷', title:'Orgulho Brasileiro',   desc:'10 tampolas do Brasil',                       check: c => c.filter(x=>(x.country||'').toLowerCase()==='brasil').length >= 10 },
];

function getUnlockedAchievements() {
  return ACHIEVEMENTS.map(a => ({ ...a, unlocked: a.check(caps) }));
}

function renderAchievements() {
  const el = document.getElementById('achievements-content');
  if (!el) return;
  const list = getUnlockedAchievements();
  const unlocked = list.filter(a=>a.unlocked).length;
  el.innerHTML = `
    <div style="text-align:center;padding:16px;background:#1e1a16;border-radius:16px;border:1px solid #2e2618;margin-bottom:14px">
      <div style="font-size:36px;font-weight:900;color:#ffaa33">${unlocked}/${list.length}</div>
      <div style="font-size:12px;color:#7a6a58;margin-top:2px">conquistas desbloqueadas</div>
      <div style="height:6px;background:#252018;border-radius:6px;overflow:hidden;margin-top:8px">
        <div style="height:100%;width:${Math.round(unlocked/list.length*100)}%;background:linear-gradient(90deg,#ff8c00,#ffaa33);border-radius:6px"></div>
      </div>
    </div>
    ${list.map(a => `
    <div style="display:flex;align-items:center;gap:12px;padding:14px;background:${a.unlocked?'#1e1a16':'#141210'};border-radius:14px;border:1px solid ${a.unlocked?'#ff8c0044':'#2e2618'};margin-bottom:8px;opacity:${a.unlocked?1:0.5}">
      <div style="font-size:32px;flex-shrink:0">${a.icon}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px;color:${a.unlocked?'#fff4e8':'#7a6a58'}">${a.title} ${a.unlocked?'✅':''}</div>
        <div style="font-size:12px;color:#7a6a58;margin-top:2px">${a.desc}</div>
      </div>
    </div>`).join('')}`;
}


// ── Modo Museu ──
let museumIndex = 0;

function openMuseum(startId) {
  museumFilter = {type:'all',value:''}; museumSearchQ = '';
  const filtered = getMuseumCaps();
  museumIndex = filtered.findIndex(c => c.id === startId);
  if (museumIndex < 0) museumIndex = 0;
  goTo('museum');
  setTimeout(() => { renderMuseum(); attachMuseumSwipe(); }, 50);
}

function attachMuseumSwipe() {
  const scr = document.getElementById('scr-museum');
  if (!scr || scr._swipeAttached) return;
  scr._swipeAttached = true;
  let startX = 0, startY = 0;
  scr.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive:true });
  scr.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = Math.abs(e.changedTouches[0].clientY - startY);
    if (Math.abs(dx) > 50 && dy < 80) {
      if (dx < 0) { museumIndex++; renderMuseum(); }
      else        { museumIndex--; renderMuseum(); }
    }
  }, { passive:true });
}

let museumFilter = { type:'all', value:'' };
let museumSearchQ = '';

function getMuseumCaps() {
  let result = caps;
  const q = museumSearchQ.toLowerCase();
  if (q) result = result.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.brand||'').toLowerCase().includes(q) ||
    (c.country||'').toLowerCase().includes(q)
  );
  if (museumFilter.type === 'country') result = result.filter(c => (c.country||'') === museumFilter.value);
  if (museumFilter.type === 'brand')   result = result.filter(c => (c.brand||'')   === museumFilter.value);
  return result;
}

function renderMuseumChips() {
  const el = document.getElementById('museum-filter-chips');
  if (!el) return;
  const countries = [...new Set(caps.map(c=>c.country).filter(Boolean))];
  const brands    = [...new Set(caps.map(c=>c.brand).filter(Boolean))];
  const chips = [
    ...countries.map(v=>({ type:'country', value:v, label: countryFlag(v)+' '+v })),
    ...brands.map(v=>({ type:'brand', value:v, label:'🏷️ '+v })),
  ];
  el.innerHTML = chips.map(f => {
    const active = museumFilter.type===f.type && museumFilter.value===f.value;
    return `<button data-museum-filter-type="${f.type}" data-museum-filter-value="${f.value}"
      style="flex-shrink:0;padding:5px 12px;border-radius:16px;border:1px solid ${active?'#ff8c00':'#2e2618'};background:${active?'#ff8c0020':'#1a1510'};color:${active?'#ff8c00':'#7a6a58'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">${f.label}</button>`;
  }).join('');
}

function renderMuseum() {
  renderMuseumChips();
  const filtered = getMuseumCaps();
  museumIndex = Math.max(0, Math.min(museumIndex, Math.max(0, filtered.length-1)));
  const el = document.getElementById('museum-content');
  if (!el) return;
  const rarityMap = {normal:'',rara:'🟡 Rara',muito_rara:'🟠 Muito Rara',unica:'🔴 Única'};

  if (!filtered.length) { el.innerHTML = '<div style="height:100svh;display:flex;align-items:center;justify-content:center;color:#3a3028;font-size:14px">Nenhuma tampola encontrada</div>'; return; }
  el.innerHTML = filtered.map((cap, i) => `
    <div style="height:100svh;min-height:600px;scroll-snap-align:start;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 24px 40px;box-sizing:border-box">
      <div style="font-size:11px;color:#7a6a58;margin-bottom:20px;letter-spacing:2px">${i+1} / ${filtered.length}</div>
      <div data-action="expand-photo" data-capid="${cap.id}"
        style="width:220px;height:220px;border-radius:50%;overflow:hidden;border:4px solid #ff8c0044;box-shadow:0 0 60px #ff8c0033;margin-bottom:24px;cursor:${cap.photo?'zoom-in':'default'}">
        ${cap.photo
          ? `<img src="${cap.photo}" data-action="expand-photo" data-capid="${cap.id}" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in"/>`
          : `<div style="width:100%;height:100%;background:${cap.color||'#ff8c00'};display:flex;align-items:center;justify-content:center;font-size:80px">🍺</div>`}
      </div>
      <div style="font-size:24px;font-weight:900;text-align:center;margin-bottom:6px;color:#fff4e8">${cap.name}</div>
      ${cap.brand?`<div style="font-size:15px;color:#7a6a58;margin-bottom:4px">${cap.brand}</div>`:''}
      ${cap.type?`<div style="font-size:13px;color:#ffaa33;margin-bottom:8px">🥤 ${cap.type}</div>`:''}
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:8px">
        ${cap.country?`<span style="font-size:13px;color:#fff4e8">${countryFlag(cap.country)} ${cap.country}</span>`:''}
        ${cap.color?`<span style="font-size:13px;color:#fff4e8">🎨 ${cap.color}</span>`:''}
        ${cap.rarity&&cap.rarity!=='normal'?`<span style="font-size:13px">${rarityMap[cap.rarity]}</span>`:''}
      </div>
      ${cap.notes?`<div style="font-size:12px;color:#7a6a58;text-align:center;font-style:italic;max-width:280px;line-height:1.5">${cap.notes}</div>`:''}
      <button data-action="museum-edit" data-id="${cap.id}" style="margin-top:20px;padding:10px 24px;border-radius:12px;border:1px solid #ff8c0044;background:#ff8c0012;color:#ffaa33;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">✏️ Editar</button>
    </div>`).join('');

  // scroll to current index
  setTimeout(() => {
    const scroll = document.getElementById('museum-scroll');
    if (scroll) scroll.scrollTop = museumIndex * window.innerHeight;
  }, 50);
}


// ── Mapa Mundi ──
const COUNTRY_COORDS = {
  'brasil':[-14,-51],'brazil':[-14,-51],
  'alemanha':[51,10],'germany':[51,10],
  'estados unidos':[38,-97],'eua':[38,-97],'usa':[38,-97],
  'holanda':[52,5],'netherlands':[52,5],
  'méxico':[-23,-102],'mexico':[23,-102],
  'argentina':[-34,-64],
  'portugal':[39,-8],
  'espanha':[40,-4],'spain':[40,-4],
  'itália':[42,12],'italy':[42,12],
  'bélgica':[50,4],'belgium':[50,4],
  'irlanda':[53,-8],'ireland':[53,-8],
  'reino unido':[55,-3],'uk':[55,-3],
  'japão':[36,138],'japan':[36,138],
  'china':[35,105],
  'austrália':[-25,133],'australia':[-25,133],
  'canadá':[56,-106],'canada':[56,-106],
  'rússia':[60,100],'russia':[60,100],
  'dinamarca':[56,10],'denmark':[56,10],
  'suécia':[62,15],'sweden':[62,15],
  'noruega':[65,13],'norway':[65,13],
  'república tcheca':[50,15],'czech':[50,15],
  'colômbia':[4,-72],'colombia':[4,-72],
  'chile':[-30,-71],
  'peru':[-10,-76],
  'uruguai':[-33,-56],'uruguay':[-33,-56],
  'áfrica do sul':[-29,25],'south africa':[-29,25],
  'coreia':[37,127],'korea':[37,127],
  'tailândia':[15,101],'thailand':[15,101],
  'cuba':[22,-80],
  'jamaica':[18,-77],
  'escócia':[57,-4],'scotland':[57,-4],
  'frança':[46,2],'france':[46,2],
  'suíça':[47,8],'switzerland':[47,8],
};

function renderMap() {
  const el = document.getElementById('map-content');
  if (!el) return;

  const countryMap = {};
  caps.forEach(c => {
    const k = (c.country||'').trim();
    if (k) countryMap[k] = (countryMap[k]||0) + 1;
  });

  const countries = Object.entries(countryMap).sort((a,b)=>b[1]-a[1]);
  const hasCountry = countries.length > 0;

  // Continent grouping
  const CONTINENTS = {
    'América do Sul': ['brasil','argentina','colômbia','chile','peru','uruguai','venezuela','equador','bolívia','paraguai'],
    'América do Norte': ['estados unidos','eua','usa','canadá','méxico','mexico'],
    'América Central/Caribe': ['cuba','jamaica','panamá','costa rica','república dominicana'],
    'Europa': ['alemanha','espanha','frança','itália','portugal','holanda','bélgica','irlanda','reino unido','rússia','dinamarca','suécia','noruega','república tcheca','suíça','escócia','áustria','polônia','grécia'],
    'Ásia': ['china','japão','coreia','tailândia','índia','vietnã','indonésia'],
    'África': ['áfrica do sul','egito','marrocos','nigéria'],
    'Oceania': ['austrália','nova zelândia'],
  };

  function getContinent(country) {
    const lc = country.toLowerCase();
    for (const [cont, list] of Object.entries(CONTINENTS)) {
      if (list.includes(lc)) return cont;
    }
    return 'Outros';
  }

  const continentGroups = {};
  countries.forEach(([country, count]) => {
    const cont = getContinent(country);
    if (!continentGroups[cont]) continentGroups[cont] = [];
    continentGroups[cont].push([country, count]);
  });

  const continentIcons = {
    'América do Sul': '🌎', 'América do Norte': '🌎', 'América Central/Caribe': '🌎',
    'Europa': '🌍', 'Ásia': '🌏', 'África': '🌍', 'Oceania': '🌏', 'Outros': '🌐',
  };

  // Summary cards
  const totalCountries = countries.length;
  const totalContinents = Object.keys(continentGroups).filter(c => c !== 'Outros' || continentGroups[c].length).length;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div style="background:#1e1a16;border-radius:16px;padding:16px;border:1px solid #2e2618;text-align:center">
        <div style="font-size:32px;font-weight:900;color:#ffaa33">${totalCountries}</div>
        <div style="font-size:11px;color:#7a6a58;font-weight:700;margin-top:2px">PAÍSES</div>
      </div>
      <div style="background:#1e1a16;border-radius:16px;padding:16px;border:1px solid #2e2618;text-align:center">
        <div style="font-size:32px;font-weight:900;color:#ffaa33">${totalContinents}</div>
        <div style="font-size:11px;color:#7a6a58;font-weight:700;margin-top:2px">CONTINENTES</div>
      </div>
    </div>

    ${hasCountry ? Object.entries(continentGroups).sort((a,b)=>b[1].length-a[1].length).map(([cont, list]) => `
      <div style="background:#1e1a16;border-radius:16px;padding:16px;border:1px solid #2e2618;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span style="font-size:20px">${continentIcons[cont]||'🌐'}</span>
          <span style="font-size:14px;font-weight:800;color:#fff4e8">${cont}</span>
          <div style="flex:1;height:1px;background:#2e2618"></div>
          <span style="font-size:11px;color:#7a6a58;font-weight:700">${list.reduce((s,[,n])=>s+n,0)} tampolas</span>
        </div>
        ${list.sort((a,b)=>b[1]-a[1]).map(([country, count]) => {
          const pct = Math.round(count / caps.length * 100);
          return `<div style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="font-size:13px">${countryFlag(country)} ${country}</span>
              <span style="font-size:12px;font-weight:700;color:#ffaa33">${count}</span>
            </div>
            <div style="height:5px;background:#252018;border-radius:5px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#ff8c00,#ffaa33);border-radius:5px"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `).join('') : `
      <div style="text-align:center;padding:48px 24px;color:#3a3028">
        <div style="font-size:48px;margin-bottom:12px">🗺️</div>
        <div style="font-size:14px;line-height:1.6">Nenhum país cadastrado ainda.<br>Adicione o país de origem das suas tampolas!</div>
      </div>
    `}
  `;
}

async function shareCap(cap) {
  // Generate share card as canvas
  const canvas = document.createElement('canvas');
  canvas.width = 600; canvas.height = 600;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#141210';
  ctx.fillRect(0, 0, 600, 600);

  // Orange circle bg
  ctx.fillStyle = '#ff8c0015';
  ctx.beginPath(); ctx.arc(300, 220, 200, 0, Math.PI*2); ctx.fill();

  // Photo or emoji
  if (cap.photo) {
    await new Promise(res => {
      const img = new Image();
      img.onload = () => {
        ctx.save();
        ctx.beginPath(); ctx.arc(300, 220, 160, 0, Math.PI*2); ctx.clip();
        ctx.drawImage(img, 140, 60, 320, 320);
        ctx.restore(); res();
      };
      img.src = cap.photo;
    });
  } else {
    ctx.font = '120px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🍺', 300, 270);
  }

  // Circle border
  ctx.strokeStyle = '#ff8c00';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(300, 220, 160, 0, Math.PI*2); ctx.stroke();

  // Name
  ctx.fillStyle = '#fff4e8';
  ctx.font = 'bold 28px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(cap.name, 300, 430);

  // Brand + country
  ctx.fillStyle = '#7a6a58';
  ctx.font = '18px system-ui';
  const sub = [cap.brand, cap.type, cap.country ? countryFlag(cap.country.toLowerCase())+' '+cap.country : ''].filter(Boolean).join(' · ');
  ctx.fillText(sub, 300, 462);

  // Rarity
  if (cap.rarity && cap.rarity !== 'normal') {
    const rMap = {rara:'🟡 Rara', muito_rara:'🟠 Muito Rara', unica:'🔴 Única'};
    ctx.font = '16px system-ui';
    ctx.fillStyle = '#ffaa33';
    ctx.fillText(rMap[cap.rarity]||'', 300, 492);
  }

  // Watermark
  ctx.fillStyle = '#3a3028';
  ctx.font = '14px system-ui';
  ctx.fillText('Tampolas App', 300, 570);

  // Share or download
  const dataUrl = canvas.toDataURL('image/png');
  if (navigator.share && navigator.canShare) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], cap.name+'.png', { type:'image/png' });
      if (navigator.canShare({ files:[file] })) {
        await navigator.share({ files:[file], title:cap.name, text:'Olha essa tampola da minha coleção!' });
        return;
      }
    } catch(e) {}
  }
  // Fallback: download
  const a = document.createElement('a');
  a.href = dataUrl; a.download = cap.name+'.png'; a.click();
  showToast('Imagem salva!', 'ok');
}

function renderProfile() {
  loadGeminiKey();
  // user info
  if (currentUser) {
    const nameEl  = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const statsEl = document.getElementById('profile-stats');
    const avatarEl= document.getElementById('profile-avatar');
    if (nameEl)  nameEl.textContent  = currentUser.displayName || 'Usuário';
    if (emailEl) emailEl.textContent = currentUser.email || '';
    if (statsEl) statsEl.textContent = caps.length + ' tampola' + (caps.length!==1?'s':'') + ' na coleção';
    if (avatarEl && currentUser.photoURL) {
      avatarEl.innerHTML = '<img src="' + currentUser.photoURL + '" style="width:100%;height:100%;object-fit:cover"/>';
    }
  }
  const input = document.getElementById('gemini-key-input');
  if (input) input.value = '';
  updateKeyStatus();
  const verInstalled = document.getElementById('profile-version-installed');
  const verServer    = document.getElementById('profile-version-server');
  if (verInstalled) verInstalled.textContent = APP_VERSION;
  if (verServer)    verServer.textContent = 'toque em verificar';
}

function updateNavAvatar() {
  const el = document.getElementById('nav-avatar');
  if (!el) return;
  if (currentUser?.photoURL) {
    el.innerHTML = '<img src="' + currentUser.photoURL + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none"/>';
    el.style.border = '2px solid ' + O;
  }
}

// ── Event delegation — handles dynamically created buttons ──
document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action],[data-filter-type],[data-sort],[data-id],[data-museum-filter],[data-museum-filter-type],[id]');
  if (!el) return;

  const action = el.dataset.action;
  const id     = el.id;

  // Handle data-action
  switch(action) {
    case 'goto-home':    goTo('home'); return;
    case 'goto-list':    goTo('list'); renderList(); return;
    case 'goto-add':     goTo('add'); return;
    case 'goto-profile': goTo('profile'); renderProfile(); return;
    case 'cancel-add':   cancelAdd(); return;
    case 'open-add':     openAdd(); return;
    case 'camera':       triggerCamera(); return;
    case 'gallery':      triggerGallery(); return;
    case 'open-crop':    openCrop(); return;
    case 'rotate-left':  rotateCrop(-15); return;
    case 'rotate-right': rotateCrop(15); return;
    case 'reset-crop':   resetCrop(); return;
    case 'save-key':     saveGeminiKey(); return;
    case 'logout':       logout(); return;
    case 'remove-photo':      pendingPhoto=null; pendingPhotoBase64=null; originalPhotoBase64=null; updatePhotoThumb(); return;
    case 'open-photo-opt':    openPhotoOpt(); return;
    case 'ai-optimize-photo': aiOptimizePhoto(); return;
    case 'opt-reset':         optFilters={brightness:100,contrast:100,saturation:100,sharpness:0,dehaze:0}; document.querySelectorAll('[data-opt]').forEach(s=>{const k=s.dataset.opt.replace('opt-','');const def={brightness:100,contrast:100,saturation:100,sharpness:0,dehaze:0};s.value=def[k]??100;const v=document.getElementById(s.dataset.opt+'-val');if(v)v.textContent=s.value+(parseFloat(s.max)<=5?'':' %');}); drawOptPreview(); return;
    case 'opt-confirm':       applyOptFilters(); return;
    case 'back-from-opt':     goTo('add'); return;
  }

  // data-action with dynamic id
  const dataId = el.dataset.id;
  if (action === 'open-detail' && dataId) { openDetail(dataId); return; }
  if (action === 'edit-cap'    && dataId) {
    const cap = caps.find(c => c.id === dataId);
    if (cap) openEdit(cap);
    return;
  }
  if (action === 'delete-cap' && dataId) { deleteCap(dataId); return; }

  if (action === 'goto-stats')    { goTo('stats'); renderStats(); return; }
  if (action === 'export-pdf')        { exportPDF(); return; }
  if (action === 'compare-cap')      { if(dataId) openCompare(dataId); return; }
  if (action === 'goto-compare')     { openCompare(null); return; }
  if (action === 'pick-compare-slot'){ showComparePicker(el.dataset.slot); return; }
  if (action === 'select-compare-cap') {
    compareIds[activeCompareSlot] = dataId;
    const picker = document.getElementById('compare-picker');
    if (picker) picker.style.display = 'none';
    renderCompare(); return;
  }
  if (action === 'goto-achievements') { goTo('achievements'); renderAchievements(); return; }
  if (action === 'goto-map')         { goTo('map'); renderMap(); return; }
  if (action === 'opt-reset') {
    optFilters = {brightness:100,contrast:100,saturation:100,sharpness:0};
    document.querySelectorAll('[data-opt]').forEach(s => {
      const def = {brightness:100,contrast:100,saturation:100,sharpness:0};
      const key = s.dataset.opt.replace('opt-','');
      s.value = def[key] ?? 100;
      const vEl = document.getElementById(s.dataset.opt+'-val');
      if(vEl) vEl.textContent = s.value+(parseFloat(s.max)<=5?'':' %');
    });
    drawOptPreview(); return;
  }
  if (action === 'opt-confirm')     { applyOptFilters(); return; }
  if (action === 'goto-museum-list') { museumIndex=0; renderMuseum(); goTo('museum'); return; }
  if (action === 'museum-prev')      { museumIndex--; renderMuseum(); return; }
  if (action === 'museum-next')      { museumIndex++; renderMuseum(); return; }
  if (action === 'museum-edit')      { if(dataId){ const c=caps.find(x=>x.id===dataId); if(c) openEdit(c); } return; }
  if (action === 'museum-from-detail'){ if(dataId){ openMuseum(dataId); } return; }
  if (action === 'expand-photo') {
    // look up photo by cap id (avoids passing huge base64 in HTML attribute)
    const capId = el.dataset.capid;
    const cap = caps.find(c => c.id === capId);
    const src = cap?.photo || el.dataset.src;
    if (!src) return;
    const overlay = document.createElement('div');
    overlay.id = 'photo-lightbox';
    overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;animation:fadeIn .2s ease';
    overlay.innerHTML = `
      <div style="position:absolute;top:0;left:0;right:0;padding:max(52px,env(safe-area-inset-top,52px)) 16px 12px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,.8),transparent);z-index:1">
        <button id="lightbox-back" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:10px;padding:8px 16px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;backdrop-filter:blur(8px)">← Voltar</button>
      </div>
      <img src="${src}" style="max-width:100%;max-height:100vh;object-fit:contain" id="lightbox-img"/>
      <div style="position:absolute;bottom:24px;font-size:12px;color:rgba(255,255,255,.4)">Toque para fechar</div>`;
    // Close on back button
    overlay.querySelector('#lightbox-back').addEventListener('click', e => { e.stopPropagation(); overlay.remove(); });
    // Close on tap outside image
    overlay.addEventListener('click', e => { if (e.target.id !== 'lightbox-back') overlay.remove(); });
    // Handle pinch zoom on image
    document.body.appendChild(overlay);
    return;
  }
  if (action === 'share-cap')        { if(dataId){ const c=caps.find(x=>x.id===dataId); if(c) shareCap(c); } return; }
  if (action === 'search-by-photo') { psPhotoBase64=null; psPhotoMime=null; const t=document.getElementById('ps-thumb'); if(t) t.innerHTML='<div style="text-align:center;color:#3a3028"><div style="font-size:40px;margin-bottom:8px">📷</div><div style="font-size:13px;color:#7a6a58">Tire ou selecione uma foto</div></div>'; const b=document.getElementById('ps-btn-search'); if(b){b.style.display='none';b.disabled=false;} const r=document.getElementById('ps-result'); if(r)r.style.display='none'; goTo('photo-search'); return; }
  if (action === 'ps-camera')  { const el=document.getElementById('ps-cam'); if(el){el.value='';el.click();} return; }
  if (action === 'ps-gallery') { const el=document.getElementById('ps-gal'); if(el){el.value='';el.click();} return; }
  if (action === 'ps-search')  { searchByPhoto(); return; }
  // museum filter chips
  const mfType = el.dataset.museumFilterType, mfVal = el.dataset.museumFilterValue;
  if (mfType && mfVal) {
    museumFilter = museumFilter.type===mfType && museumFilter.value===mfVal
      ? {type:'all',value:''} : {type:mfType,value:mfVal};
    renderMuseum(); return;
  }
  const mfAll = el.dataset.museumFilter;
  if (mfAll === 'all') { museumFilter={type:'all',value:''}; renderMuseum(); return; }
  if (action === 'toggle-view')  {
    listView = listView === 'list' ? 'grid' : 'list';
    const btn = document.getElementById('btn-view-toggle');
    if (btn) btn.textContent = listView === 'grid' ? '☰' : '⊞';
    renderList(); return;
  }
  if (action === 'filter-all') { activeFilter = {type:'all',value:''}; renderList(); return; }
  // filter chip
  const fType = el.dataset.filterType, fVal = el.dataset.filterValue;
  if (fType && fVal) {
    activeFilter = activeFilter.type===fType && activeFilter.value===fVal
      ? {type:'all',value:''}
      : {type:fType, value:fVal};
    renderList(); return;
  }
  // sort
  const sortVal = el.dataset.sort;
  if (sortVal) { activeSort = sortVal; renderList(); return; }
  if (action === 'check-version') { checkServerVersion(); return; }
  if (action === 'force-update')  { forceUpdate(); return; }

  // Handle id-based buttons
  switch(id) {
    case 'btn-ai':          runAI(); return;
    case 'btn-save':        saveCap(); return;
    case 'btn-crop':        openCrop(); return;
    case 'btn-apply-ai':    applyAI(); return;
    case 'btn-dismiss-ai':  dismissAI(); return;
    case 'btn-confirm-crop':confirmCrop(); return;
  }
});

// Slider input delegation
document.addEventListener('change', function(e) {
  const inp = e.target.dataset.input;
  if (inp === 'ps-cam' || inp === 'ps-gal') { loadPsPhoto(e.target.files[0]); e.target.value=''; }
});

document.addEventListener('input', function(e) {
  // museum search
  if (e.target.id === 'museum-search') {
    museumSearchQ = e.target.value;
    renderMuseum();
    return;
  }
  const optKey = e.target.dataset.opt;
  if (optKey) {
    const key = optKey.replace('opt-','');
    optFilters[key] = parseFloat(e.target.value);
    const vEl = document.getElementById(optKey+'-val');
    if (vEl) vEl.textContent = e.target.value+(parseFloat(e.target.max)<=5?'':' %');
    drawOptPreview();
    return;
  }
  const action = e.target.dataset.action;
  if (action === 'zoom-change')   { cropScale = parseFloat(e.target.value); drawCrop(); }
  if (action === 'rotate-change') { rotateCropTo(parseFloat(e.target.value)); }
});


// ── Photo Optimization ──
let optFilters = { brightness:100, contrast:100, saturation:100, sharpness:0, dehaze:0 };

function openPhotoOpt() {
  if (!pendingPhoto) return;
  optFilters = { brightness:100, contrast:100, saturation:100, sharpness:0 };
  goTo('photo-opt');
  setTimeout(() => {
    drawOptPreview();
    // reset sliders
    ['opt-brightness','opt-contrast','opt-saturation','opt-sharpness'].forEach(id => {
      const el = document.getElementById(id); // these use data-opt, not id
    });
    document.querySelectorAll('[data-opt]').forEach(s => {
      const def = {brightness:100,contrast:100,saturation:100,sharpness:0};
      s.value = def[s.dataset.opt.replace('opt-','')] ?? 100;
      const vEl = document.getElementById(s.dataset.opt+'-val');
      if(vEl) vEl.textContent = s.value + (parseFloat(s.max)<=5?'':' %');
    });
  }, 50);
}

function drawOptPreview() {
  const canvas = document.getElementById('opt-canvas');
  if (!canvas || !pendingPhoto) return;
  const img = new Image();
  img.onload = () => {
    const size = Math.min(img.width, img.height);
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    // circular clip
    ctx.beginPath(); ctx.arc(size/2,size/2,size/2,0,Math.PI*2); ctx.clip();
    ctx.drawImage(img, (img.width-size)/2, (img.height-size)/2, size, size, 0, 0, size, size);
    // apply filters via CSS filter string
    const sharp  = optFilters.sharpness || 0;
    const dehaze = optFilters.dehaze    || 0;
    // Base filters
    let filter = `brightness(${optFilters.brightness}%) contrast(${optFilters.contrast}%) saturate(${optFilters.saturation}%)`;
    // Sharpness: boost contrast
    if (sharp > 0) filter += ` contrast(${100 + sharp * 12}%)`;
    // Dehaze/anti-reflection: reduce brightness of highlights by dimming + boosting contrast
    if (dehaze > 0) {
      const dimAmount  = 100 - (dehaze * 0.25);   // reduce overall brightness
      const contBoost  = 100 + (dehaze * 0.4);     // boost contrast to recover darks
      filter += ` brightness(${dimAmount}%) contrast(${contBoost}%)`;
    }
    canvas.style.filter = filter;
  };
  img.src = pendingPhoto;
}

function applyOptFilters() {
  if (!pendingPhoto) return;
  // Re-draw from original photo with filters baked in via CSS filter on canvas
  const img = new Image();
  img.onload = () => {
    const size = Math.min(img.width, img.height);
    const out = document.createElement('canvas');
    out.width = size; out.height = size;
    const ctx = out.getContext('2d');

    // Build filter string
    const sharp  = optFilters.sharpness || 0;
    const dehaze = optFilters.dehaze    || 0;
    let filter = `brightness(${optFilters.brightness}%) contrast(${optFilters.contrast}%) saturate(${optFilters.saturation}%)`;
    if (sharp  > 0) filter += ` contrast(${100 + sharp * 12}%)`;
    if (dehaze > 0) filter += ` brightness(${100 - dehaze*0.25}%) contrast(${100 + dehaze*0.4}%)`;

    ctx.filter = filter;
    ctx.beginPath(); ctx.arc(size/2, size/2, size/2, 0, Math.PI*2); ctx.clip();
    ctx.drawImage(img, (img.width-size)/2, (img.height-size)/2, size, size, 0, 0, size, size);

    pendingPhoto      = out.toDataURL('image/jpeg', 0.85);
    pendingPhotoBase64= pendingPhoto.split(',')[1];
    pendingPhotoMime  = 'image/jpeg';
    updatePhotoThumb();
    showToast('Foto otimizada!', 'ok');
    goTo('add');
  };
  img.src = pendingPhoto;
}


async function aiOptimizePhoto() {
  if (!pendingPhotoBase64) return;
  GEMINI_KEY = localStorage.getItem(GEMINI_KEY_STORAGE) || '';
  if (!GEMINI_KEY) { showToast('Configure a chave Gemini em 👤 Perfil', 'err'); return; }

  const btn = document.getElementById('btn-ai-opt');
  if (btn) { btn.textContent = '⟳ Analisando foto...'; btn.disabled = true; }

  try {
    const prompt = `Analise esta foto de uma tampinha de garrafa. Avalie brilho, contraste, saturação e nitidez e retorne APENAS um JSON com ajustes ideais, sem markdown:
{"brightness": <60-130>, "contrast": <90-150>, "saturation": <80-170>, "sharpness": <0-4>, "dehaze": <0-100 só se houver reflexo/claridade>, "reason": "<explicação em português do que foi ajustado>"}
Regras: se houver claridade excessiva/reflexo, reduza brilho abaixo de 100. Se imagem desbotada, aumente saturação. Se sem nitidez, aumente contraste e sharpness. Se boa qualidade, ajuste levemente. Retorne SOMENTE o JSON.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [
        { inline_data: { mime_type: pendingPhotoMime||'image/jpeg', data: pendingPhotoBase64 } },
        { text: prompt }
      ]}]})
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean.match(/\{[\s\S]*\}/)[0]);

    // Apply suggested values
    const newFilters = {
      brightness: Math.min(150, Math.max(50,  result.brightness  || 100)),
      contrast:   Math.min(150, Math.max(50,  result.contrast    || 100)),
      saturation: Math.min(200, Math.max(0,   result.saturation  || 100)),
      sharpness:  Math.min(5,   Math.max(0,   result.sharpness   || 0)),
      dehaze:     Math.min(100, Math.max(0,   result.dehaze      || 0)),
    };
    optFilters = newFilters;

    // Update sliders visually
    document.querySelectorAll('[data-opt]').forEach(s => {
      const key = s.dataset.opt.replace('opt-', '');
      if (newFilters[key] !== undefined) {
        s.value = newFilters[key];
        const vEl = document.getElementById(s.dataset.opt + '-val');
        if (vEl) vEl.textContent = newFilters[key] + (parseFloat(s.max) <= 5 ? '' : ' %');
      }
    });

    drawOptPreview();
    showToast(result.reason ? '✨ ' + result.reason : '✨ Foto otimizada pela IA!', 'ai');

  } catch(e) {
    console.error('AI opt error:', e);
    showToast('Erro: ' + (e.message || 'Tente novamente'), 'err');
  } finally {
    if (btn) { btn.textContent = '✨ Otimizar com IA'; btn.disabled = false; }
  }
}


function openLightbox(src) {
  const existing = document.getElementById('photo-lightbox');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'photo-lightbox';
  overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column';
  overlay.innerHTML = `
    <div style="padding:max(52px,16px) 16px 12px;display:flex;align-items:center;background:rgba(0,0,0,.6);flex-shrink:0">
      <button onclick="document.getElementById('photo-lightbox').remove()" 
        style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:10px;padding:9px 18px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">
        ← Voltar
      </button>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:16px"
      onclick="document.getElementById('photo-lightbox').remove()">
      <img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px"/>
    </div>`;
  document.body.appendChild(overlay);
}


// ── Export PDF ──
async function exportPDF() {
  if (!caps.length) { showToast('Coleção vazia!', 'err'); return; }
  showToast('Gerando PDF...', 'info');

  const COLS = 3, CELL = 220, PAD = 20, HEADER = 80;
  const pageW = COLS * CELL + (COLS + 1) * PAD;
  const ROWS_PER_PAGE = 4;
  const pageH = ROWS_PER_PAGE * CELL + (ROWS_PER_PAGE + 1) * PAD + HEADER;

  const pages = [];
  const totalPages = Math.ceil(caps.length / (COLS * ROWS_PER_PAGE));

  for (let p = 0; p < totalPages; p++) {
    const canvas = document.createElement('canvas');
    canvas.width = pageW; canvas.height = pageH;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#141210';
    ctx.fillRect(0, 0, pageW, pageH);

    // Header
    ctx.fillStyle = '#ff8c00';
    ctx.fillRect(0, 0, pageW, HEADER);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🍺 Tampolas — Minha Coleção', PAD, 48);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillText(`${caps.length} tampola${caps.length!==1?'s':''} • Página ${p+1}/${totalPages}`, PAD, 68);

    const startIdx = p * COLS * ROWS_PER_PAGE;
    const pageCaps = caps.slice(startIdx, startIdx + COLS * ROWS_PER_PAGE);

    for (let i = 0; i < pageCaps.length; i++) {
      const cap = pageCaps[i];
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = PAD + col * (CELL + PAD);
      const y = HEADER + PAD + row * (CELL + PAD);

      // Card background
      ctx.fillStyle = '#1e1a16';
      roundRect(ctx, x, y, CELL, CELL, 12);

      // Rarity border color
      const rarityColor = {rara:'#ffd700',muito_rara:'#ff8c00',unica:'#ef4444'}[cap.rarity||''] || '#2e2618';
      ctx.strokeStyle = rarityColor;
      ctx.lineWidth = cap.rarity && cap.rarity!=='normal' ? 2.5 : 1;
      roundRect(ctx, x, y, CELL, CELL, 12, true);

      const PHOTO_SIZE = 120;
      const photoX = x + (CELL - PHOTO_SIZE) / 2;
      const photoY = y + 10;

      if (cap.photo) {
        await new Promise(res => {
          const img = new Image();
          img.onload = () => {
            ctx.save();
            ctx.beginPath();
            ctx.arc(photoX + PHOTO_SIZE/2, photoY + PHOTO_SIZE/2, PHOTO_SIZE/2, 0, Math.PI*2);
            ctx.clip();
            ctx.drawImage(img, photoX, photoY, PHOTO_SIZE, PHOTO_SIZE);
            ctx.restore(); res();
          };
          img.onerror = res;
          img.src = cap.photo;
        });
      } else {
        ctx.fillStyle = cap.color ? colorToHex(cap.color) : '#ff8c00';
        ctx.beginPath();
        ctx.arc(photoX + PHOTO_SIZE/2, photoY + PHOTO_SIZE/2, PHOTO_SIZE/2, 0, Math.PI*2);
        ctx.fill();
        ctx.font = '40px serif';
        ctx.textAlign = 'center';
        ctx.fillText('🍺', photoX + PHOTO_SIZE/2, photoY + PHOTO_SIZE/2 + 14);
      }

      // Text below photo
      ctx.textAlign = 'center';
      const cx = x + CELL/2;

      ctx.fillStyle = '#fff4e8';
      ctx.font = 'bold 13px system-ui, sans-serif';
      const name = cap.name.length > 18 ? cap.name.slice(0,16)+'…' : cap.name;
      ctx.fillText(name, cx, photoY + PHOTO_SIZE + 18);

      if (cap.brand) {
        ctx.fillStyle = '#7a6a58';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(cap.brand, cx, photoY + PHOTO_SIZE + 34);
      }

      const tags = [cap.type, cap.country ? countryFlag(cap.country)+' '+cap.country : ''].filter(Boolean);
      if (tags.length) {
        ctx.fillStyle = '#ffaa33';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(tags.join(' · '), cx, photoY + PHOTO_SIZE + 48);
      }
    }

    pages.push(canvas.toDataURL('image/png'));
  }

  // Build HTML PDF page
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Tampolas — Minha Coleção</title>
<style>
  body { margin:0; background:#141210; }
  img  { display:block; width:100%; page-break-after:always; }
  @media print { img { page-break-after:always; width:100%; } }
</style></head><body>
${pages.map(src => `<img src="${src}"/>`).join('')}
<script>window.onload=()=>window.print();<\/script>
</body></html>`;

  const blob = new Blob([html], { type:'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'tampolas-colecao.html'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  showToast('PDF gerado! Abra o arquivo e imprima.', 'ok');
}

function roundRect(ctx, x, y, w, h, r, stroke=false) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
  if (stroke) ctx.stroke(); else ctx.fill();
}

function colorToHex(colorName) {
  const map = {
    'vermelha':'#e53e3e','vermelho':'#e53e3e',
    'azul':'#3182ce','azul claro':'#63b3ed',
    'verde':'#38a169','verde claro':'#68d391',
    'dourada':'#d69e2e','dourado':'#d69e2e',
    'prata':'#a0aec0','prateada':'#a0aec0',
    'preta':'#2d3748','preto':'#2d3748',
    'branca':'#f7fafc','branco':'#f7fafc',
    'amarela':'#ecc94b','amarelo':'#ecc94b',
    'laranja':'#ed8936',
    'roxa':'#805ad5','roxo':'#805ad5',
    'rosa':'#ed64a6',
  };
  return map[colorName.toLowerCase()] || '#ff8c00';
}


// ── Compare ──
let compareIds = [null, null];

function openCompare(fromId) {
  compareIds = [fromId || null, null];
  renderCompare();
  goTo('compare');
}

function renderCompare() {
  const el = document.getElementById('compare-content');
  if (!el) return;

  const cap0 = caps.find(c => c.id === compareIds[0]);
  const cap1 = caps.find(c => c.id === compareIds[1]);

  const slotHTML = (cap, slot) => {
    if (!cap) return `
      <div data-action="pick-compare-slot" data-slot="${slot}"
        style="flex:1;min-height:200px;border-radius:16px;border:2px dashed #2e2618;background:#1a1510;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;cursor:pointer;padding:16px">
        <div style="font-size:36px">+</div>
        <div style="font-size:13px;color:#7a6a58;text-align:center">Toque para selecionar</div>
      </div>`;

    const rarityMap = {normal:'⚪',rara:'🟡',muito_rara:'🟠',unica:'🔴'};
    return `
      <div style="flex:1;border-radius:16px;border:1px solid #2e2618;background:#1e1a16;padding:14px;display:flex;flex-direction:column;align-items:center;gap:8px">
        <div style="width:90px;height:90px;border-radius:50%;overflow:hidden;border:2px solid #ff8c0055;flex-shrink:0">
          ${cap.photo
            ? `<img src="${cap.photo}" style="width:100%;height:100%;object-fit:cover"/>`
            : `<div style="width:100%;height:100%;background:#ff8c00;display:flex;align-items:center;justify-content:center;font-size:36px">🍺</div>`}
        </div>
        <div style="font-weight:800;font-size:13px;text-align:center;color:#fff4e8">${cap.name}</div>
        <div style="font-size:11px;color:#7a6a58;text-align:center">${cap.brand||'—'}</div>
        <button data-action="pick-compare-slot" data-slot="${slot}" style="font-size:11px;color:#7a6a58;background:none;border:1px solid #2e2618;border-radius:8px;padding:4px 10px;cursor:pointer;font-family:inherit">Trocar</button>
      </div>`;
  };

  const fields = ['brand','type','color','country','rarity'];
  const labels = { brand:'Marca', type:'Tipo', color:'Cor', country:'País', rarity:'Raridade' };
  const rarityLabel = { normal:'Normal', rara:'Rara', muito_rara:'Muito Rara', unica:'Única' };

  const comparisonRows = cap0 && cap1 ? `
    <div style="background:#1e1a16;border-radius:16px;padding:16px;border:1px solid #2e2618;margin-top:14px">
      <div style="font-size:12px;font-weight:700;color:#7a6a58;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">Comparação</div>
      ${fields.map(f => {
        const v0 = f === 'rarity' ? rarityLabel[cap0[f]||'normal'] : (cap0[f]||'—');
        const v1 = f === 'rarity' ? rarityLabel[cap1[f]||'normal'] : (cap1[f]||'—');
        const same = v0.toLowerCase() === v1.toLowerCase();
        return `<div style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid #252018">
          <div style="flex:1;font-size:12px;text-align:center;color:${same?'#7a6a58':'#fff4e8'}">${v0}</div>
          <div style="width:60px;text-align:center;font-size:11px;color:#7a6a58;font-weight:700">${labels[f]}</div>
          <div style="flex:1;font-size:12px;text-align:center;color:${same?'#7a6a58':'#fff4e8'}">${v1}</div>
        </div>`;
      }).join('')}
    </div>` : '';

  el.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:4px">
      ${slotHTML(cap0, 0)}
      <div style="display:flex;align-items:center;font-size:20px;color:#3a3028;flex-shrink:0">vs</div>
      ${slotHTML(cap1, 1)}
    </div>
    ${comparisonRows}
    <div id="compare-picker" style="display:none;margin-top:14px">
      <div style="font-size:12px;font-weight:700;color:#7a6a58;letter-spacing:1px;margin-bottom:10px">ESCOLHA UMA TAMPOLA</div>
      <div id="compare-picker-list"></div>
    </div>`;
}

let activeCompareSlot = 0;
function showComparePicker(slot) {
  activeCompareSlot = parseInt(slot);
  const picker = document.getElementById('compare-picker');
  const list   = document.getElementById('compare-picker-list');
  if (!picker || !list) return;
  picker.style.display = 'block';
  list.innerHTML = caps.map(c => `
    <div data-action="select-compare-cap" data-id="${c.id}"
      style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;cursor:pointer;border:1px solid #2e2618;background:#1a1510;margin-bottom:6px">
      ${c.photo
        ? `<img src="${c.photo}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0"/>`
        : `<div style="width:36px;height:36px;border-radius:50%;background:#ff8c00;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🍺</div>`}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name}</div>
        <div style="font-size:12px;color:#7a6a58">${c.brand||'—'}</div>
      </div>
    </div>`).join('');
}


// ── Confirm Modal ──
function showConfirm({ icon='❓', title, message, okLabel='Confirmar', okColor='#ef4444', onConfirm }) {
  const modal   = document.getElementById('confirm-modal');
  const iconEl  = document.getElementById('confirm-icon');
  const titleEl = document.getElementById('confirm-title');
  const msgEl   = document.getElementById('confirm-msg');
  const okBtn   = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');
  if (!modal) return;

  iconEl.textContent  = icon;
  titleEl.textContent = title;
  msgEl.textContent   = message;
  okBtn.textContent   = okLabel;
  okBtn.style.background = okColor;
  okBtn.style.color   = '#fff';

  modal.style.display = 'flex';

  const close = () => { modal.style.display = 'none'; okBtn.onclick = null; cancelBtn.onclick = null; };
  okBtn.onclick     = () => { close(); onConfirm(); };
  cancelBtn.onclick = () => close();
}


async function forceUpdate() {
  showConfirm({
    icon: '⚡',
    title: 'Forçar atualização?',
    message: 'O app será recarregado completamente, limpando o cache. Sua coleção não será afetada.',
    okLabel: 'Sim, atualizar',
    okColor: '#7c3aed',
    onConfirm: () => {
      // Clear caches and hard reload
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
          regs.forEach(r => r.unregister());
        });
      }
      if ('caches' in window) {
        caches.keys().then(keys => {
          keys.forEach(k => caches.delete(k));
        });
      }
      // Hard reload with cache bust
      window.location.href = window.location.pathname + '?nocache=' + Date.now();
    }
  });
}


function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function formatDateBR(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── Boot ──
document.getElementById('app').innerHTML=`<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:${T.bg}"><div style="font-size:48px;animation:pulse 1.4s ease infinite">🍺</div><div style="color:${T.muted};font-size:14px;font-family:system-ui">Carregando...</div></div>`;

loadGeminiKey();
onAuthStateChanged(auth, user => {
  currentUser=user; buildApp();
  if (user) { subscribeCaps(); renderHome(); goTo('home'); setTimeout(updateNavAvatar, 500); }
  else { if(unsubCaps){unsubCaps();unsubCaps=null;} caps=[]; goTo('login'); }
});

window.loginGoogle=loginGoogle; window.logout=logout; window.goTo=goTo;
window.openAdd=openAdd; window.openEdit=openEdit; window.openDetail=openDetail;
window.cancelAdd=cancelAdd; window.saveCap=saveCap; window.deleteCap=deleteCap;
window.checkDuplicate=checkDuplicate; window.loadPhoto=loadPhoto;
window.openCrop=openCrop; window.confirmCrop=confirmCrop; window.drawCrop=drawCrop;
window.cropDown=cropDown; window.cropMove=cropMove; window.cropUp=cropUp;
window.updatePhotoThumb=updatePhotoThumb; window.renderList=renderList;
window.openLightbox=openLightbox; window.showConfirm=showConfirm; window.forceUpdate=forceUpdate; window.exportPDF=exportPDF; window.openCompare=openCompare; window.renderCompare=renderCompare; window.showComparePicker=showComparePicker; window.saveGeminiKey=saveGeminiKey; window.openPhotoOpt=openPhotoOpt; window.applyOptFilters=applyOptFilters; window.drawOptPreview=drawOptPreview; window.aiOptimizePhoto=aiOptimizePhoto; window.checkServerVersion=checkServerVersion; window.renderStats=renderStats; window.searchByPhoto=searchByPhoto; window.loadPsPhoto=loadPsPhoto; window.renderAchievements=renderAchievements; window.renderMap=renderMap; window.openMuseum=openMuseum; window.shareCap=shareCap; window.loadGeminiKey=loadGeminiKey; window.triggerCamera=triggerCamera; window.triggerGallery=triggerGallery; window.renderProfile=renderProfile; window.updateNavAvatar=updateNavAvatar; window.renderSettings=renderSettings;
window.rotateCrop=rotateCrop; window.rotateCropTo=rotateCropTo; window.resetCrop=resetCrop;
window.runAI=runAI; window.applyAI=applyAI; window.dismissAI=dismissAI;
