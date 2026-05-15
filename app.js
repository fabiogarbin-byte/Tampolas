const O = '#ff8c00';
const S = { HOME:'home', LIST:'list', ADD:'add', DETAIL:'detail', CROP:'crop' };
const T = {
  bg:'#141210', card:'#1e1a16', card2:'#252018', border:'#2e2618',
  text:'#fff4e8', muted:'#7a6a58', dim:'#3a3028', o2:'#ffaa33',
};

// ── State ──
let st = {
  caps:[], scr:S.HOME, q:'',
  selId:null, edit:null,
  form:{ name:'', brand:'', country:'', color:'', notes:'', quantity:1, photo:null },
  toast:null,
  cropSrc:null, cropScale:1, cropX:0, cropY:0,
  cropDragging:false, cropLastX:0, cropLastY:0, cropPinchDist:0,
};

// ── IndexedDB ──
let db;
function openDB() {
  return new Promise((res,rej)=>{
    const r = indexedDB.open('TampolasDB',2);
    r.onupgradeneeded = e => {
      const d=e.target.result;
      if(!d.objectStoreNames.contains('caps')) d.createObjectStore('caps',{keyPath:'id'});
    };
    r.onsuccess = e => { db=e.target.result; res(); };
    r.onerror = rej;
  });
}
const dbAll = () => new Promise(res=>{ const r=db.transaction('caps','readonly').objectStore('caps').getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>res([]); });
const dbPut = c  => new Promise(res=>{ const tx=db.transaction('caps','readwrite'); tx.objectStore('caps').put(c); tx.oncomplete=res; });
const dbDel = id => new Promise(res=>{ const tx=db.transaction('caps','readwrite'); tx.objectStore('caps').delete(id); tx.oncomplete=res; });

// ── Helpers ──
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2);

// render sem re-renderizar a tela de ADD (evita perda de foco)
function set(patch) {
  st = {...st,...patch};
  if(st.scr===S.ADD) {
    renderNav();
    renderToastEl();
  } else {
    render();
  }
}

function setF(patch) {
  st.form = {...st.form,...patch};
  // só atualiza partes visuais do form sem re-renderizar inputs
  updateFormVisuals();
}

function go(scr) {
  // salva valores dos inputs antes de sair da tela ADD
  if(st.scr===S.ADD) syncFormFromDOM();
  st = {...st, scr};
  render();
  window.scrollTo(0,0);
}

// lê os valores dos inputs do DOM e salva no state
function syncFormFromDOM() {
  const fields = ['name','brand','color','country','quantity','notes'];
  fields.forEach(k => {
    const el = document.getElementById('f-'+k);
    if(el) st.form[k] = k==='quantity' ? (parseInt(el.value)||1) : el.value;
  });
}

// atualiza só partes visuais do form (foto preview, etc) sem mexer nos inputs
function updateFormVisuals() {
  const photoWrap = document.getElementById('photo-wrap');
  if(photoWrap) photoWrap.innerHTML = photoWrapHTML();
}

function toast_(msg,type='ok'){
  st.toast={msg,type};
  renderToastEl();
  setTimeout(()=>{ st.toast=null; renderToastEl(); },2500);
}

function renderToastEl(){
  const el=document.getElementById('toast-el');
  if(!el) return;
  if(!st.toast){ el.innerHTML=''; return; }
  const t={err:['#4a0a0a','#ef4444'],info:['#0a1e2a','#4cc9f0'],ok:['#052010','#22c55e']}[st.toast.type];
  el.innerHTML=`<div style="position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:999;padding:10px 20px;border-radius:24px;font-size:13px;font-weight:600;white-space:nowrap;background:${t[0]};color:${t[1]};border:1px solid ${t[1]};box-shadow:0 4px 20px rgba(0,0,0,.5)">${st.toast.msg}</div>`;
}

function renderNav(){
  const el=document.getElementById('nav-el');
  if(el) el.innerHTML=navHTML();
}

// ── Actions ──
async function saveCap(){
  syncFormFromDOM();
  const {form,edit,caps}=st;
  if(!form.name.trim()) return toast_('Nome obrigatório!','err');
  if(edit){
    const updated=caps.map(c=>c.id===edit?{...c,...form}:c);
    await dbPut(updated.find(c=>c.id===edit));
    st.caps=updated; st.edit=null;
    toast_('Atualizada!'); go(S.DETAIL);
  } else {
    if(caps.find(c=>c.name.toLowerCase()===form.name.toLowerCase())) return toast_('Já existe!','err');
    const cap={id:uid(),...form,addedAt:new Date().toLocaleDateString('pt-BR')};
    await dbPut(cap);
    st.caps=[...caps,cap]; st.edit=null;
    toast_('Adicionada!'); go(S.LIST);
  }
}

async function delCap(id){
  if(!confirm('Remover esta tampola?')) return;
  await dbDel(id);
  st.caps=st.caps.filter(c=>c.id!==id);
  toast_('Removida.','info'); go(S.LIST);
}

function openAdd(){
  st.edit=null;
  st.form={name:'',brand:'',country:'',color:'',notes:'',quantity:1,photo:null};
  go(S.ADD);
}

function openEdit(cap){
  st.edit=cap.id;
  st.form={name:cap.name,brand:cap.brand||'',country:cap.country||'',color:cap.color||'',notes:cap.notes||'',quantity:cap.quantity||1,photo:cap.photo||null};
  go(S.ADD);
}

function openDetail(id){ st.selId=id; go(S.DETAIL); }

// ── Photo ──
function loadPhoto(file){
  if(!file) return;
  const r=new FileReader();
  r.onload=e=>{
    syncFormFromDOM();
    st.cropSrc=e.target.result; st.cropScale=1; st.cropX=0; st.cropY=0;
    go(S.CROP);
  };
  r.readAsDataURL(file);
}

function removePhoto(){
  syncFormFromDOM();
  st.form.photo=null;
  updateFormVisuals();
}

function goToCrop(){
  syncFormFromDOM();
  st.cropSrc=st.form.photo; st.cropScale=1; st.cropX=0; st.cropY=0;
  go(S.CROP);
}

// ── Crop ──
function confirmCrop(){
  const canvas=document.getElementById('crop-canvas');
  const img=document.getElementById('crop-img');
  if(!canvas||!img) return;
  const size=canvas.width;
  const out=document.createElement('canvas');
  out.width=size; out.height=size;
  const ctx=out.getContext('2d');
  ctx.beginPath(); ctx.arc(size/2,size/2,size/2,0,Math.PI*2); ctx.clip();
  const iw=img.naturalWidth, ih=img.naturalHeight;
  const scale=Math.max(size/iw,size/ih)*st.cropScale;
  const sw=iw*scale, sh=ih*scale;
  const x=(size-sw)/2+st.cropX, y=(size-sh)/2+st.cropY;
  ctx.drawImage(img,x,y,sw,sh);
  st.form.photo=out.toDataURL('image/jpeg',0.85);
  go(S.ADD);
}

function cropPointerDown(e){
  e.preventDefault();
  if(e.touches&&e.touches.length===2){
    st.cropPinchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  } else {
    const t=e.touches?e.touches[0]:e;
    st.cropDragging=true; st.cropLastX=t.clientX; st.cropLastY=t.clientY;
  }
}
function cropPointerMove(e){
  e.preventDefault();
  if(e.touches&&e.touches.length===2){
    const dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    st.cropScale=Math.min(4,Math.max(1,st.cropScale+(dist-st.cropPinchDist)*0.01));
    st.cropPinchDist=dist;
    drawCrop();
  } else if(st.cropDragging){
    const t=e.touches?e.touches[0]:e;
    st.cropX+=t.clientX-st.cropLastX; st.cropY+=t.clientY-st.cropLastY;
    st.cropLastX=t.clientX; st.cropLastY=t.clientY;
    drawCrop();
  }
}
function cropPointerUp(){ st.cropDragging=false; }

function drawCrop(){
  const canvas=document.getElementById('crop-canvas');
  const img=document.getElementById('crop-img');
  if(!canvas||!img) return;
  const size=canvas.width;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,size,size);
  const iw=img.naturalWidth,ih=img.naturalHeight;
  const scale=Math.max(size/iw,size/ih)*st.cropScale;
  const sw=iw*scale,sh=ih*scale;
  ctx.drawImage(img,(size-sw)/2+st.cropX,(size-sh)/2+st.cropY,sw,sh);
  ctx.save();
  ctx.globalCompositeOperation='destination-in';
  ctx.beginPath(); ctx.arc(size/2,size/2,size/2,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ── HTML helpers ──
function avatar(cap,sz=48){
  if(cap.photo) return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,.08);box-shadow:0 0 14px rgba(0,0,0,.4);flex-shrink:0"><img src="${cap.photo}" style="width:100%;height:100%;object-fit:cover"/></div>`;
  return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${O};display:flex;align-items:center;justify-content:center;font-size:${sz*.44}px;border:2px solid rgba(255,255,255,.08);box-shadow:0 0 14px rgba(0,0,0,.4);flex-shrink:0">🍺</div>`;
}

function capRow(cap,fn){
  return `<div onclick="${fn}('${cap.id}')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;cursor:pointer;margin:0 16px 8px;border:1px solid ${T.border};background:${T.card}">
    ${avatar(cap,48)}
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cap.name}</div>
      <div style="font-size:12px;color:${T.muted};margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${[cap.brand,cap.color,cap.country].filter(Boolean).join(' · ')||'—'}</div>
    </div>
    <span style="font-size:20px;flex-shrink:0;color:${T.muted}">›</span>
  </div>`;
}

function photoWrapHTML(){
  const {form}=st;
  return form.photo
    ? `<div style="position:relative;width:90px;height:90px;flex-shrink:0">
        <img src="${form.photo}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:2px solid ${O}"/>
        <button onclick="removePhoto()" style="position:absolute;top:-4px;right:-4px;background:#200505;border:1px solid #ef4444;color:#ef4444;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center">✕</button>
      </div>`
    : `<div style="width:90px;height:90px;border-radius:50%;background:${T.card2};border:2px dashed ${T.border};display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0">🍺</div>`;
}

// ── Screens ──
function home(){
  const {caps}=st;
  const countries=[...new Set(caps.map(c=>c.country).filter(Boolean))];
  const brands=[...new Set(caps.map(c=>c.brand).filter(Boolean))];
  const recent=[...caps].reverse().slice(0,3);

  // resumo por cor
  const colorMap={};
  caps.forEach(c=>{ const k=(c.color||'').trim()||'Sem cor'; colorMap[k]=(colorMap[k]||0)+1; });
  const colorList=Object.entries(colorMap).sort((a,b)=>b[1]-a[1]).slice(0,6);

  return `<div style="padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,${O},#c05500);display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 14px ${O}40;flex-shrink:0">🍺</div>
      <div><div style="font-weight:800;font-size:22px;letter-spacing:-.3px">Tampolas</div><div style="font-size:12px;color:${T.muted}">Sua coleção de tampinhas</div></div>
    </div>

    <!-- Hero total -->
    <div onclick="go('${S.LIST}')" style="margin:0 16px 14px;border-radius:20px;overflow:hidden;cursor:pointer">
      <div style="background:linear-gradient(135deg,${O},#ffaa00 55%,#ffcc44);padding:24px 20px;position:relative;overflow:hidden">
        <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(0,0,0,.45);text-transform:uppercase">Total de Tampolas</div>
        <div style="font-size:64px;font-weight:900;color:#fff;line-height:1;margin:4px 0;text-shadow:0 2px 10px rgba(0,0,0,.2)">${caps.length}</div>
        <div style="font-size:13px;color:rgba(0,0,0,.45)">Ver coleção completa →</div>
        <div style="position:absolute;right:-8px;top:50%;transform:translateY(-50%);font-size:90px;opacity:.12">🍺</div>
      </div>
    </div>

    <!-- Países / Marcas -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 16px 12px">
      ${[{l:'PAÍSES',v:countries.length,s:countries.slice(0,2).join(', ')||'Nenhum ainda',ic:'🌍'},{l:'MARCAS',v:brands.length,s:brands.slice(0,2).join(', ')||'Nenhuma ainda',ic:'🏷️'}].map(x=>`
      <div style="background:${T.card};border-radius:16px;padding:16px;border:1px solid ${T.border};position:relative;overflow:hidden">
        <div style="font-size:10px;font-weight:700;color:${T.muted};letter-spacing:2px">${x.l}</div>
        <div style="font-size:36px;font-weight:900;color:${T.o2};line-height:1;margin:4px 0">${x.v}</div>
        <div style="font-size:11px;color:${T.dim};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.s}</div>
        <div style="position:absolute;right:10px;bottom:8px;font-size:24px;opacity:.12">${x.ic}</div>
      </div>`).join('')}
    </div>

    <!-- Resumo por cor -->
    ${colorList.length>0?`
    <div style="margin:0 16px 16px;background:${T.card};border-radius:16px;padding:16px;border:1px solid ${T.border}">
      <div style="font-size:11px;font-weight:700;color:${T.muted};letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px">🎨 Por Cor</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${colorList.map(([cor,qtd])=>{
          const pct=Math.round(qtd/caps.length*100);
          return `<div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:13px;font-weight:600;color:${T.text}">${cor}</span>
              <span style="font-size:13px;font-weight:700;color:${T.o2}">${qtd} <span style="font-size:11px;color:${T.muted};">(${pct}%)</span></span>
            </div>
            <div style="height:6px;background:${T.card2};border-radius:6px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${O},${T.o2});border-radius:6px"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`:''}

    <!-- Recentes -->
    ${recent.length>0?`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0 16px;margin-bottom:8px">
      <span style="font-size:11px;font-weight:700;color:${T.muted};letter-spacing:1px;text-transform:uppercase">Recentes</span>
      <span onclick="go('${S.LIST}')" style="font-size:12px;color:${O};font-weight:700;cursor:pointer">Ver todas</span>
    </div>
    ${recent.map(c=>capRow(c,'openDetail')).join('')}`:''}
  </div>`;
}

function list(){
  const {caps,q}=st;
  const filtered=caps.filter(c=>{
    const lq=q.toLowerCase();
    return !lq||c.name.toLowerCase().includes(lq)||(c.brand||'').toLowerCase().includes(lq)||(c.country||'').toLowerCase().includes(lq)||(c.color||'').toLowerCase().includes(lq);
  });
  return `<div style="padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button onclick="go('${S.HOME}')" style="background:${T.card};border:1px solid ${T.border};color:${T.text};border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
      <div style="flex:1">
        <div style="font-weight:800;font-size:18px">Coleção</div>
        <div style="font-size:11px;color:${T.muted};margin-top:1px">${caps.length} tampola${caps.length!==1?'s':''}</div>
      </div>
    </div>
    <div style="padding:0 16px 12px;position:relative">
      <span style="position:absolute;left:28px;top:50%;transform:translateY(-50%);color:${T.muted};font-size:16px;pointer-events:none">🔍</span>
      <input id="search-input" oninput="st.q=this.value;renderListItems()" value="${q}" placeholder="Buscar nome, marca, cor ou país..." style="width:100%;background:${T.card2};border:1.5px solid ${T.border};color:${T.text};border-radius:12px;padding:11px 14px 11px 40px;font-size:15px;outline:none;font-family:inherit;box-sizing:border-box"/>
    </div>
    <div id="list-items">
      ${renderListItemsHTML(filtered,caps)}
    </div>
  </div>`;
}

function renderListItemsHTML(filtered,caps){
  return filtered.length===0
    ?`<div style="text-align:center;padding:64px 24px;color:${T.dim}"><div style="font-size:52px;margin-bottom:14px">${caps.length===0?'🫙':'🔍'}</div><div style="font-size:14px;line-height:1.6">${caps.length===0?'Coleção vazia!<br>Toque em + para começar.':'Nenhuma encontrada.'}</div></div>`
    :filtered.map(c=>capRow(c,'openDetail')).join('');
}

function renderListItems(){
  const el=document.getElementById('list-items');
  if(!el) return;
  const lq=st.q.toLowerCase();
  const filtered=st.caps.filter(c=>!lq||c.name.toLowerCase().includes(lq)||(c.brand||'').toLowerCase().includes(lq)||(c.country||'').toLowerCase().includes(lq)||(c.color||'').toLowerCase().includes(lq));
  el.innerHTML=renderListItemsHTML(filtered,st.caps);
}

function detail(){
  const cap=st.caps.find(c=>c.id===st.selId);
  if(!cap) return `<div><button onclick="go('${S.LIST}')">←</button></div>`;
  const fields=[['🏷️ Marca',cap.brand],['🎨 Cor',cap.color],['📍 País',cap.country],['🔢 Quantidade',cap.quantity>1?`×${cap.quantity}`:null],['📅 Adicionada',cap.addedAt]].filter(([,v])=>v);
  return `<div style="padding-bottom:100px">
    <div style="position:relative;height:280px;overflow:hidden">
      ${cap.photo?`<img src="${cap.photo}" style="width:100%;height:100%;object-fit:cover"/>`:`<div style="width:100%;height:100%;background:linear-gradient(160deg,${O}55,${T.bg});display:flex;align-items:center;justify-content:center;font-size:110px">🍺</div>`}
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.15),rgba(20,18,16,.97))"></div>
      <button onclick="go('${S.LIST}')" style="position:absolute;top:52px;left:16px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.1);color:${T.text};border-radius:10px;padding:8px 12px;cursor:pointer;font-size:18px">←</button>
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
        <button onclick="delCap('${cap.id}')" style="padding:14px 18px;border-radius:14px;border:1px solid #401010;background:#200505;color:#ef4444;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🗑</button>
      </div>
    </div>
  </div>`;
}

function addForm(){
  const {form,edit}=st;
  // campos sem oninput — lemos do DOM ao salvar
  const inp=`width:100%;background:#1a1510;border:1.5px solid ${T.border};color:${T.text};border-radius:12px;padding:12px 14px;font-size:15px;outline:none;font-family:inherit;box-sizing:border-box`;
  const lbl=`font-size:11px;font-weight:700;color:${T.muted};letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:8px`;

  return `<div style="padding-bottom:100px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button onclick="go('${edit?S.DETAIL:S.LIST}')" style="background:${T.card};border:1px solid ${T.border};color:${T.text};border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
      <div style="font-weight:800;font-size:18px">${edit?'Editar Tampola':'Nova Tampola'}</div>
    </div>

    <div style="padding:0 16px;display:flex;flex-direction:column;gap:16px">

      <!-- Foto -->
      <div>
        <span style="${lbl}">Foto da tampola</span>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
          <div id="photo-wrap">${photoWrapHTML()}</div>
          <div style="display:flex;flex-direction:column;gap:8px;flex:1">
            <button onclick="document.getElementById('cam').click()" style="width:100%;padding:11px;border-radius:12px;border:1px solid ${O}55;background:${O}12;color:${T.o2};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">📷 Câmera</button>
            <button onclick="document.getElementById('gal').click()" style="width:100%;padding:11px;border-radius:12px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🖼️ Galeria</button>
          </div>
        </div>
        ${form.photo?`<button onclick="goToCrop()" style="width:100%;padding:10px;border-radius:12px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">✂️ Ajustar zoom e posição</button>`:''}
        <input id="cam" type="file" accept="image/*" capture="environment" style="display:none" onchange="loadPhoto(this.files[0])"/>
        <input id="gal" type="file" accept="image/*" style="display:none" onchange="loadPhoto(this.files[0])"/>
      </div>

      <!-- Campos de texto — sem oninput, lemos do DOM ao salvar -->
      <div><span style="${lbl}">Nome *</span><input id="f-name" value="${form.name}" placeholder="Ex: Brahma Especial" style="${inp}"/></div>
      <div><span style="${lbl}">Marca</span><input id="f-brand" value="${form.brand}" placeholder="Ex: Brahma" style="${inp}"/></div>
      <div><span style="${lbl}">Cor</span><input id="f-color" value="${form.color}" placeholder="Ex: Vermelha, Dourada, Azul..." style="${inp}"/></div>
      <div><span style="${lbl}">País de origem</span><input id="f-country" value="${form.country}" placeholder="Ex: Brasil" style="${inp}"/></div>
      <div><span style="${lbl}">Quantidade</span><input id="f-quantity" type="number" min="1" value="${form.quantity}" style="${inp}"/></div>
      <div><span style="${lbl}">Notas</span><textarea id="f-notes" placeholder="Raridade, origem, detalhes..." rows="3" style="${inp};resize:vertical;line-height:1.5">${form.notes}</textarea></div>

      <button onclick="saveCap()" style="width:100%;padding:16px;border-radius:14px;border:none;background:linear-gradient(135deg,${O},#c05500);color:#fff;font-weight:800;font-size:16px;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px ${O}40;margin-bottom:8px">
        ${edit?'SALVAR ALTERAÇÕES':'ADICIONAR TAMPOLA'}
      </button>
    </div>
  </div>`;
}

function cropScreen(){
  const SIZE=Math.min(window.innerWidth,480)-32;
  return `<div style="padding-bottom:90px;display:flex;flex-direction:column;align-items:center">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px;width:100%">
      <button onclick="go('${S.ADD}')" style="background:${T.card};border:1px solid ${T.border};color:${T.text};border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
      <div style="font-weight:800;font-size:18px">Ajustar Foto</div>
    </div>
    <div style="font-size:13px;color:${T.muted};margin-bottom:14px;text-align:center;padding:0 16px">Arraste para reposicionar · Belisque para dar zoom</div>
    <div style="position:relative;width:${SIZE}px;height:${SIZE}px;border-radius:50%;overflow:hidden;border:3px solid ${O};margin:0 16px">
      <canvas id="crop-canvas" width="${SIZE}" height="${SIZE}" style="width:${SIZE}px;height:${SIZE}px;display:block;touch-action:none;cursor:grab"
        ontouchstart="cropPointerDown(event)" ontouchmove="cropPointerMove(event)" ontouchend="cropPointerUp()"
        onmousedown="cropPointerDown(event)" onmousemove="cropPointerMove(event)" onmouseup="cropPointerUp()"></canvas>
    </div>
    <img id="crop-img" src="${st.cropSrc}" style="display:none" onload="drawCrop()"/>
    <div style="width:100%;padding:20px 16px 0">
      <div style="font-size:11px;color:${T.muted};font-weight:700;letter-spacing:1px;margin-bottom:8px">ZOOM</div>
      <input type="range" min="1" max="4" step="0.05" value="${st.cropScale}" oninput="st.cropScale=parseFloat(this.value);drawCrop()" style="width:100%;accent-color:${O}"/>
    </div>
    <div style="width:100%;padding:16px;display:flex;gap:10px">
      <button onclick="go('${S.ADD}')" style="flex:1;padding:14px;border-radius:14px;border:1px solid ${T.border};background:${T.card};color:${T.muted};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">Cancelar</button>
      <button onclick="confirmCrop()" style="flex:2;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,${O},#c05500);color:#fff;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit">✓ Confirmar</button>
    </div>
  </div>`;
}

// ── Nav ──
function navHTML(){
  const {scr}=st;
  if(scr===S.CROP) return '';
  return `<div style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:rgba(14,12,10,.96);border-top:1px solid ${T.border};padding:10px 8px 22px;display:flex;align-items:center;z-index:100;backdrop-filter:blur(12px)">
    ${[{k:S.HOME,ic:'🏠',l:'Início'},{k:S.LIST,ic:'📋',l:'Coleção'}].map(n=>`
    <button onclick="go('${n.k}')" style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 0">
      <span style="font-size:28px">${n.ic}</span>
      <span style="font-size:11px;font-weight:700;color:${scr===n.k?O:T.muted}">${n.l}</span>
    </button>`).join('')}
    <div style="flex:1;display:flex;justify-content:center">
      <button onclick="openAdd()" style="width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,${O},#c05500);font-size:30px;color:#fff;box-shadow:0 4px 18px ${O}70;display:flex;align-items:center;justify-content:center">+</button>
    </div>
    <div style="flex:2"></div>
  </div>`;
}

// ── Render ──
function render(){
  const screens={[S.HOME]:home,[S.LIST]:list,[S.ADD]:addForm,[S.DETAIL]:detail,[S.CROP]:cropScreen};
  document.getElementById('app').innerHTML=
    `<div id="screen-wrap">${(screens[st.scr]||home)()}</div>`+
    `<div id="nav-el">${navHTML()}</div>`+
    `<div id="toast-el"></div>`;
}

// ── Boot ──
async function boot(){
  document.getElementById('app').innerHTML=`<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px"><div style="font-size:48px;animation:pulse 1.4s ease infinite">🍺</div><div style="color:${T.muted};font-size:14px">Carregando...</div></div>`;
  try { await openDB(); st.caps=await dbAll(); } catch(e){ console.warn('IndexedDB indisponível'); }
  render();
}

boot();
