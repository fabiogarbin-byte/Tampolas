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
const APP_VERSION = 'v2.7';
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
    refreshCurrentScreen();
  });
}

// ── Auth ──
async function loginGoogle() {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch(e) { showToast('Erro ao entrar. Tente novamente.','err'); }
}
async function logout() {
  if (unsubCaps) { unsubCaps(); unsubCaps = null; }
  caps = [];
  await signOut(auth);
}

// ── Gemini ──
async function analyzePhotoWithAI(base64, mimeType) {
  const prompt = `Você é especialista em tampinhas de garrafas. Analise esta imagem e retorne APENAS um JSON válido sem markdown:
{"name":"marca + tipo ex: Brahma Duplo Malte","brand":"nome da marca","color":"cor principal da tampinha em português ex: Vermelha Dourada Prata Azul Verde Preta","country":"país de origem — DEDUZA pela marca mesmo que não esteja escrito ex: Brahma=Brasil Heineken=Holanda Budweiser=EUA Corona=México","notes":"design e tipo de bebida"}
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
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button onclick="goTo('home')" style="${btnIconStyle()}">←</button>
      <div style="flex:1"><div style="font-weight:800;font-size:18px">Coleção</div><div id="list-count" style="font-size:11px;color:${T.muted};margin-top:1px"></div></div>
    </div>
    <div style="padding:0 16px 12px;position:relative">
      <span style="position:absolute;left:28px;top:50%;transform:translateY(-50%);color:${T.muted};font-size:16px;pointer-events:none">🔍</span>
      <input id="search-box" placeholder="Buscar nome, marca, cor ou país..." oninput="searchQ=this.value;renderList()"
        style="width:100%;background:${T.card2};border:1.5px solid ${T.border};color:${T.text};border-radius:12px;padding:11px 14px 11px 40px;font-size:15px;outline:none;font-family:inherit;box-sizing:border-box"/>
    </div>
    <div id="list-items"></div>
  </div>

  <!-- ADD/EDIT -->
  <div id="scr-add" class="screen" style="display:none;padding-bottom:100px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button onclick="cancelAdd()" style="${btnIconStyle()}">←</button>
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
            <button onclick="triggerCamera()" style="width:100%;padding:11px;border-radius:12px;border:1px solid ${O}55;background:${O}12;color:${T.o2};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">📷 Câmera</button>
            <button onclick="triggerGallery()" style="width:100%;padding:11px;border-radius:12px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🖼️ Galeria</button>
          </div>
        </div>
        <div id="ai-btn-wrap" style="display:none;flex-direction:column;gap:8px">
          <button id="btn-ai" onclick="runAI()" style="width:100%;padding:12px;border-radius:12px;border:1px solid #7c3aed55;background:#7c3aed15;color:#c084fc;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">✨ Identificar com IA</button>
          <button id="btn-crop" onclick="openCrop()" style="width:100%;padding:10px;border-radius:12px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">✂️ Ajustar zoom, posição e rotação</button>
        </div>
        <input id="inp-cam" type="file" accept="image/*" capture="environment" style="display:none" onchange="loadPhoto(this.files[0]);this.value=''"/>
        <input id="inp-gal" type="file" accept="image/*" style="display:none" onchange="loadPhoto(this.files[0]);this.value=''"/>
      </div>

      <div id="ai-result" style="display:none;background:#1a0a2a;border:1.5px solid #7c3aed55;border-radius:14px;padding:14px">
        <div style="font-size:11px;font-weight:700;color:#c084fc;letter-spacing:1.5px;margin-bottom:10px">✨ IDENTIFICADO PELA IA</div>
        <div id="ai-result-content"></div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick="dismissAI()" style="flex:1;padding:10px;border-radius:10px;border:1px solid ${T.border};background:transparent;color:${T.muted};font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">Ignorar</button>
          <button onclick="applyAI()" style="flex:2;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit">✅ Usar estes dados</button>
        </div>
      </div>

      <div><div style="${lblStyle()}">Nome *</div><input id="f-name" placeholder="Ex: Brahma Especial" style="${inpStyle()}" oninput="checkDuplicate()"/></div>
      <div><div style="${lblStyle()}">Marca</div><input id="f-brand" placeholder="Ex: Brahma" style="${inpStyle()}"/></div>
      <div><div style="${lblStyle()}">Cor</div><input id="f-color" placeholder="Ex: Vermelha, Dourada, Azul..." style="${inpStyle()}"/></div>
      <div><div style="${lblStyle()}">País de origem</div><input id="f-country" placeholder="Ex: Brasil" style="${inpStyle()}"/></div>
      <div><div style="${lblStyle()}">Quantidade</div><input id="f-quantity" type="number" min="1" value="1" style="${inpStyle()}"/></div>
      <div><div style="${lblStyle()}">Notas</div><textarea id="f-notes" placeholder="Raridade, origem, detalhes..." rows="3" style="${inpStyle()};resize:vertical;line-height:1.5"></textarea></div>

      <button id="btn-save" onclick="saveCap()" style="width:100%;padding:16px;border-radius:14px;border:none;background:linear-gradient(135deg,${O},#c05500);color:#fff;font-weight:800;font-size:16px;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px ${O}40;margin-bottom:8px">SALVAR TAMPOLA</button>
    </div>
  </div>

  <!-- DETAIL -->
  <div id="scr-detail" class="screen" style="display:none;padding-bottom:100px"></div>

  <!-- CROP com rotação -->
  <div id="scr-crop" class="screen" style="display:none;padding-bottom:40px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button onclick="goTo('add')" style="${btnIconStyle()}">←</button>
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
          oninput="cropScale=parseFloat(this.value);drawCrop()"
          style="width:100%;accent-color:${O}"/>
      </div>
      <div>
        <div style="${lblStyle()}">Rotação</div>
        <div style="display:flex;align-items:center;gap:10px">
          <button onclick="rotateCrop(-15)"
            style="width:44px;height:44px;border-radius:10px;border:1px solid ${T.border};background:${T.card2};color:${T.text};font-size:20px;cursor:pointer;flex-shrink:0;font-family:inherit">↺</button>
          <input id="rotate-slider" type="range" min="-180" max="180" step="1" value="0"
            oninput="rotateCropTo(parseFloat(this.value))"
            style="flex:1;accent-color:${O}"/>
          <button onclick="rotateCrop(15)"
            style="width:44px;height:44px;border-radius:10px;border:1px solid ${T.border};background:${T.card2};color:${T.text};font-size:20px;cursor:pointer;flex-shrink:0;font-family:inherit">↻</button>
        </div>
        <div style="text-align:center;font-size:12px;color:${T.muted};margin-top:4px" id="rotate-label">0°</div>
      </div>
      <button onclick="resetCrop()"
        style="padding:10px;border-radius:10px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">
        ↺ Resetar
      </button>
    </div>

    <div style="padding:16px;display:flex;gap:10px">
      <button onclick="goTo('add')" style="flex:1;padding:16px;border-radius:14px;border:1px solid ${T.border};background:${T.card};color:${T.muted};font-weight:700;font-size:15px;cursor:pointer;font-family:inherit">Cancelar</button>
      <button onclick="confirmCrop()" style="flex:2;padding:16px;border-radius:14px;border:none;background:linear-gradient(135deg,${O},#c05500);color:#fff;font-weight:800;font-size:16px;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px ${O}50">✓ Confirmar Foto</button>
    </div>
  </div>


  <!-- PROFILE -->
  <div id="scr-profile" class="screen" style="display:none;padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button onclick="goTo('home')" style="${btnIconStyle()}">←</button>
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
        <button onclick="saveGeminiKey()" style="width:100%;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,${O},#c05500);color:#fff;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit">SALVAR CHAVE</button>
        <div id="key-status" style="margin-top:10px;font-size:12px;text-align:center"></div>
      </div>

      <!-- Logout -->
      <button onclick="logout()" style="width:100%;padding:14px;border-radius:14px;border:1px solid #401010;background:#200505;color:#ef4444;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit">
        Sair da conta
      </button>

    </div>
  </div>

  <!-- NAV -->
  <div id="bottom-nav" style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:rgba(14,12,10,.96);border-top:1px solid ${T.border};padding:10px 8px 22px;display:flex;align-items:center;z-index:100;backdrop-filter:blur(12px)">
    <button class="nav-btn" data-scr="home" onclick="goTo('home')" style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 0;color:${T.muted}">
      <span style="font-size:28px">🏠</span><span style="font-size:11px;font-weight:700">Início</span>
    </button>
    <button class="nav-btn" data-scr="list" onclick="goTo('list');renderList()" style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 0;color:${T.muted}">
      <span style="font-size:28px">📋</span><span style="font-size:11px;font-weight:700">Coleção</span>
    </button>
    <div style="flex:1;display:flex;justify-content:center">
      <button onclick="openAdd()" style="width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,${O},#c05500);font-size:30px;color:#fff;box-shadow:0 4px 18px ${O}70;display:flex;align-items:center;justify-content:center">+</button>
    </div>
    <button class="nav-btn" data-scr="profile" onclick="goTo('profile');renderProfile()" style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 0;color:${T.muted}">
      <div id="nav-avatar" style="width:30px;height:30px;border-radius:50%;overflow:hidden;background:${T.card2};display:flex;align-items:center;justify-content:center;font-size:17px;border:2px solid ${T.border}">👤</div>
      <span style="font-size:11px;font-weight:700">Perfil</span>
    </button>
  </div>
  <div id="toast-el"></div>`;
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
  try {
    const result = await analyzePhotoWithAI(originalPhotoBase64||pendingPhotoBase64, originalPhotoMime||pendingPhotoMime);
    aiData = result;
    showAIResult(result);
    showToast('✨ IA identificou a tampola!','ai');
  } catch(e) {
    console.error('AI error:', e);
    showToast('Erro IA: ' + (e.message||'Tente novamente'),'err');
  } finally {
    aiLoading = false;
    if (btn) { btn.textContent='✨ Identificar com IA'; btn.disabled=false; }
  }
}

function showAIResult(r) {
  const el=document.getElementById('ai-result'), c=document.getElementById('ai-result-content');
  if (!el||!c) return;
  c.innerHTML=[['Nome',r.name],['Marca',r.brand],['Cor',r.color],['País',r.country]].filter(([,v])=>v)
    .map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #2a1a3a"><span style="font-size:12px;color:${T.muted}">${l}</span><span style="font-size:13px;font-weight:700">${v}</span></div>`).join('')
    + (r.notes?`<div style="font-size:12px;color:${T.muted};margin-top:8px;font-style:italic">${r.notes}</div>`:'');
  el.style.display='block';
}

function applyAI() {
  if (!aiData) return;
  [['f-name',aiData.name],['f-brand',aiData.brand],['f-color',aiData.color],['f-country',aiData.country],['f-notes',aiData.notes]].forEach(([id,v])=>{ if(v){ const el=document.getElementById(id); if(el) el.value=v; } });
  dismissAI(); checkDuplicate(); showToast('Dados preenchidos!','ok');
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
  const q=document.getElementById('f-quantity'); if(q) q.value=1;
  document.getElementById('dup-alert').style.display='none';
  const aiRes=document.getElementById('ai-result'); if(aiRes) aiRes.style.display='none';
}

function openAdd() {
  editingId=null; pendingPhoto=null; pendingPhotoBase64=null; pendingPhotoMime=null;
  originalPhotoBase64=null; originalPhotoMime=null; aiData=null;
  document.getElementById('add-title').textContent='Nova Tampola';
  document.getElementById('btn-save').textContent='SALVAR TAMPOLA';
  resetForm(); updatePhotoThumb(); goTo('add');
}

function openEdit(cap) {
  editingId=cap.id; pendingPhoto=cap.photo||null; pendingPhotoBase64=null; pendingPhotoMime=null;
  originalPhotoBase64=null; originalPhotoMime=null; aiData=null;
  document.getElementById('add-title').textContent='Editar Tampola';
  document.getElementById('btn-save').textContent='SALVAR ALTERAÇÕES';
  document.getElementById('f-name').value    = cap.name    ||'';
  document.getElementById('f-brand').value   = cap.brand   ||'';
  document.getElementById('f-color').value   = cap.color   ||'';
  document.getElementById('f-country').value = cap.country ||'';
  document.getElementById('f-quantity').value= cap.quantity||1;
  document.getElementById('f-notes').value   = cap.notes   ||'';
  document.getElementById('dup-alert').style.display='none';
  const aiRes=document.getElementById('ai-result'); if(aiRes) aiRes.style.display='none';
  updatePhotoThumb(); goTo('add');
}

function cancelAdd() { if(editingId){renderDetail(editingId);goTo('detail');}else{renderList();goTo('list');} }

function getFormValues() {
  return {
    name:    (document.getElementById('f-name')?.value    ||'').trim(),
    brand:   (document.getElementById('f-brand')?.value   ||'').trim(),
    color:   (document.getElementById('f-color')?.value   ||'').trim(),
    country: (document.getElementById('f-country')?.value ||'').trim(),
    quantity:parseInt(document.getElementById('f-quantity')?.value)||1,
    notes:   (document.getElementById('f-notes')?.value   ||'').trim(),
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
      await dbUpdate(editingId, form); clearTimeout(timeout);
      showToast('Atualizada!');
      currentCapId=editingId; editingId=null; goTo('detail');
    } else {
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
  if (!confirm('Remover esta tampola?')) return;
  try { await dbDelete(id); showToast('Removida.','info'); goTo('list'); }
  catch(e) { showToast('Erro ao remover.','err'); }
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
  pendingPhoto=out.toDataURL('image/jpeg',0.85);
  pendingPhotoBase64=pendingPhoto.split(',')[1];
  pendingPhotoMime='image/jpeg';
  updatePhotoThumb(); goTo('add');
}

function updatePhotoThumb() {
  const thumb=document.getElementById('photo-thumb');
  const aiBtnWrap=document.getElementById('ai-btn-wrap');
  if (!thumb) return;
  if (pendingPhoto) {
    thumb.innerHTML=`<div style="position:relative;width:90px;height:90px;flex-shrink:0">
      <img src="${pendingPhoto}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:2px solid ${O}"/>
      <button onclick="pendingPhoto=null;pendingPhotoBase64=null;originalPhotoBase64=null;updatePhotoThumb()" style="position:absolute;top:-4px;right:-4px;background:#200505;border:1px solid #ef4444;color:#ef4444;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;font-family:inherit">✕</button>
    </div>`;
    if (aiBtnWrap) aiBtnWrap.style.display='flex';
  } else {
    thumb.innerHTML=`<div style="width:90px;height:90px;border-radius:50%;background:${T.card2};border:2px dashed ${T.border};display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0">🍺</div>`;
    if (aiBtnWrap) aiBtnWrap.style.display='none';
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
    <div onclick="goTo('list');renderList()" style="margin:0 16px 14px;border-radius:20px;overflow:hidden;cursor:pointer">
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
    ${colorList.length?`
    <div style="margin:0 16px 14px;background:${T.card};border-radius:16px;padding:16px;border:1px solid ${T.border}">
      <div style="font-size:11px;font-weight:700;color:${T.muted};letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px">🎨 Por Cor</div>
      ${colorList.map(([cor,qtd])=>{const pct=Math.round(qtd/caps.length*100);return`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:600">${cor}</span><span style="font-size:13px;font-weight:700;color:${T.o2}">${qtd} <span style="font-size:11px;color:${T.muted}">(${pct}%)</span></span></div><div style="height:6px;background:${T.card2};border-radius:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${O},${T.o2});border-radius:6px"></div></div></div>`;}).join('')}
    </div>`:''}
    ${recent.length?`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0 16px;margin-bottom:8px">
      <span style="font-size:11px;font-weight:700;color:${T.muted};letter-spacing:1px;text-transform:uppercase">Recentes</span>
      <span onclick="goTo('list');renderList()" style="font-size:12px;color:${O};font-weight:700;cursor:pointer">Ver todas</span>
    </div>
    ${recent.map(c=>capRowHTML(c)).join('')}`:''}`;
}

// ── Render: List ──
function renderList() {
  const el=document.getElementById('list-items'), cnt=document.getElementById('list-count');
  if (!el) return;
  const lq=searchQ.toLowerCase();
  const filtered=caps.filter(c=>!lq||c.name.toLowerCase().includes(lq)||(c.brand||'').toLowerCase().includes(lq)||(c.country||'').toLowerCase().includes(lq)||(c.color||'').toLowerCase().includes(lq));
  if (cnt) cnt.textContent=`${caps.length} tampola${caps.length!==1?'s':''}`;
  el.innerHTML=filtered.length===0
    ?`<div style="text-align:center;padding:64px 24px;color:${T.dim}"><div style="font-size:52px;margin-bottom:14px">${caps.length===0?'🫙':'🔍'}</div><div style="font-size:14px;line-height:1.6">${caps.length===0?'Coleção vazia!<br>Toque em + para começar.':'Nenhuma encontrada.'}</div></div>`
    :filtered.map(c=>capRowHTML(c)).join('');
}

function capRowHTML(cap) {
  const thumb=cap.photo
    ?`<div style="width:50px;height:50px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,.08);flex-shrink:0"><img src="${cap.photo}" style="width:100%;height:100%;object-fit:cover"/></div>`
    :`<div style="width:50px;height:50px;border-radius:50%;background:${O};display:flex;align-items:center;justify-content:center;font-size:22px;border:2px solid rgba(255,255,255,.08);flex-shrink:0">🍺</div>`;
  return `<div onclick="openDetail('${cap.id}')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;cursor:pointer;margin:0 16px 8px;border:1px solid ${T.border};background:${T.card}">
    ${thumb}
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cap.name}</div>
      <div style="font-size:12px;color:${T.muted};margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${[cap.brand,cap.color,cap.country].filter(Boolean).join(' · ')||'—'}</div>
    </div>
    <span style="font-size:20px;color:${T.muted};flex-shrink:0">›</span>
  </div>`;
}

// ── Render: Detail ──
function openDetail(id) { currentCapId=id; renderDetail(id); goTo('detail'); }

function renderDetail(id) {
  const cap=caps.find(c=>c.id===id); if(!cap) return;
  const fields=[['🏷️ Marca',cap.brand],['🎨 Cor',cap.color],['📍 País',cap.country],['🔢 Quantidade',cap.quantity>1?`×${cap.quantity}`:null],['📅 Adicionada',cap.addedAt]].filter(([,v])=>v);
  const el=document.getElementById('scr-detail'); if(!el) return;
  el.innerHTML=`
    <div style="position:relative;height:280px;overflow:hidden">
      ${cap.photo?`<img src="${cap.photo}" style="width:100%;height:100%;object-fit:cover"/>`:`<div style="width:100%;height:100%;background:linear-gradient(160deg,${O}55,${T.bg});display:flex;align-items:center;justify-content:center;font-size:110px">🍺</div>`}
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.15),rgba(20,18,16,.97))"></div>
      <button onclick="goTo('list');renderList()" style="position:absolute;top:52px;left:16px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.1);color:${T.text};border-radius:10px;padding:8px 12px;cursor:pointer;font-size:18px">←</button>
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
      <div style="display:flex;gap:10px">
        <button onclick='openEdit(${JSON.stringify(cap).replace(/'/g,"&#39;")})' style="flex:1;padding:14px;border-radius:14px;border:1px solid ${T.border};background:${T.card};color:${T.text};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">✏️ Editar</button>
        <button onclick="deleteCap('${cap.id}')" style="padding:14px 18px;border-radius:14px;border:1px solid #401010;background:#200505;color:#ef4444;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🗑</button>
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
}

function updateNavAvatar() {
  const el = document.getElementById('nav-avatar');
  if (!el) return;
  if (currentUser?.photoURL) {
    el.innerHTML = '<img src="' + currentUser.photoURL + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
    el.style.border = '2px solid ' + O;
  }
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
window.saveGeminiKey=saveGeminiKey; window.loadGeminiKey=loadGeminiKey; window.triggerCamera=triggerCamera; window.triggerGallery=triggerGallery; window.renderProfile=renderProfile; window.updateNavAvatar=updateNavAvatar; window.renderSettings=renderSettings;
window.rotateCrop=rotateCrop; window.rotateCropTo=rotateCropTo; window.resetCrop=resetCrop;
window.runAI=runAI; window.applyAI=applyAI; window.dismissAI=dismissAI;
