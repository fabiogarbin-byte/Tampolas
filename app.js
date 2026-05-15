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
  // crop state
  cropSrc:null, cropScale:1, cropX:0, cropY:0,
  cropDragging:false, cropLastX:0, cropLastY:0,
  cropPinchDist:0,
};

// ── IndexedDB ──
let db;
function openDB() {
  return new Promise((res,rej)=>{
    const r = indexedDB.open('TampolasDB',2);
    r.onupgradeneeded = e => {
      const d = e.target.result;
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
const uid  = () => Date.now().toString(36)+Math.random().toString(36).slice(2);
const set  = patch => { st={...st,...patch}; render(); };
const setF = patch => set({form:{...st.form,...patch}});
const go   = scr  => { st={...st,scr}; render(); window.scrollTo(0,0); };

function toast_(msg,type='ok'){
  set({toast:{msg,type}});
  setTimeout(()=>set({toast:null}),2500);
}

// ── Actions ──
async function saveCap(){
  const {form,edit,caps}=st;
  if(!form.name.trim()) return toast_('Nome obrigatório!','err');
  if(edit){
    const updated=caps.map(c=>c.id===edit?{...c,...form}:c);
    await dbPut(updated.find(c=>c.id===edit));
    set({caps:updated,edit:null});
    toast_('Atualizada!'); go(S.DETAIL);
  } else {
    if(caps.find(c=>c.name.toLowerCase()===form.name.toLowerCase())) return toast_('Já existe!','err');
    const cap={id:uid(),...form,addedAt:new Date().toLocaleDateString('pt-BR')};
    await dbPut(cap);
    set({caps:[...caps,cap],edit:null});
    toast_('Adicionada!'); go(S.LIST);
  }
}

async function delCap(id){
  if(!confirm('Remover esta tampola?')) return;
  await dbDel(id);
  set({caps:st.caps.filter(c=>c.id!==id)});
  toast_('Removida.','info'); go(S.LIST);
}

function openAdd(){
  set({edit:null, form:{name:'',brand:'',country:'',color:'',notes:'',quantity:1,photo:null}});
  go(S.ADD);
}

function openEdit(cap){
  set({edit:cap.id, form:{name:cap.name,brand:cap.brand||'',country:cap.country||'',color:cap.color||'',notes:cap.notes||'',quantity:cap.quantity||1,photo:cap.photo||null}});
  go(S.ADD);
}

function openDetail(id){ st.selId=id; go(S.DETAIL); }

// ── Photo: load → go to crop screen ──
function loadPhoto(file){
  if(!file) return;
  const r=new FileReader();
  r.onload=e=>{
    set({ cropSrc:e.target.result, cropScale:1, cropX:0, cropY:0 });
    go(S.CROP);
  };
  r.readAsDataURL(file);
}

// ── Crop: confirm → render canvas → save base64 ──
function confirmCrop(){
  const canvas=document.getElementById('crop-canvas');
  if(!canvas) return;
  const size=300;
  const out=document.createElement('canvas');
  out.width=size; out.height=size;
  const ctx=out.getContext('2d');
  ctx.beginPath(); ctx.arc(size/2,size/2,size/2,0,Math.PI*2); ctx.clip();
  const img=document.getElementById('crop-img');
  if(!img) return;
  // draw image centered with zoom/pan applied
  const iw=img.naturalWidth, ih=img.naturalHeight;
  const sc=st.cropScale;
  const dx=st.cropX, dy=st.cropY;
  const draw=Math.min(iw,ih)*sc;
  const sx=(iw/2 - draw/sc/2) - dx/sc;
  const sy=(ih/2 - draw/sc/2) - dy/sc;
  ctx.drawImage(img, sx, sy, draw/sc, draw/sc, 0, 0, size, size);
  const cropped=out.toDataURL('image/jpeg',0.85);
  setF({photo:cropped});
  go(S.ADD);
}

// ── Touch/mouse handlers for crop ──
function cropPointerDown(e){
  e.preventDefault();
  if(e.touches && e.touches.length===2){
    st.cropPinchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  } else {
    const t=e.touches?e.touches[0]:e;
    st.cropDragging=true; st.cropLastX=t.clientX; st.cropLastY=t.clientY;
  }
}
function cropPointerMove(e){
  e.preventDefault();
  if(e.touches && e.touches.length===2){
    const dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    const delta=dist-st.cropPinchDist;
    st.cropPinchDist=dist;
    st.cropScale=Math.min(4,Math.max(1,st.cropScale+delta*0.01));
    drawCrop();
  } else if(st.cropDragging){
    const t=e.touches?e.touches[0]:e;
    st.cropX+=t.clientX-st.cropLastX;
    st.cropY+=t.clientY-st.cropLastY;
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
  // draw image
  const iw=img.naturalWidth, ih=img.naturalHeight;
  const base=Math.min(size,size); // canvas is square
  const scale=Math.max(size/iw,size/ih)*st.cropScale;
  const sw=iw*scale, sh=ih*scale;
  const x=(size-sw)/2+st.cropX;
  const y=(size-sh)/2+st.cropY;
  ctx.drawImage(img,x,y,sw,sh);
  // circular overlay
  ctx.save();
  ctx.globalCompositeOperation='destination-in';
  ctx.beginPath(); ctx.arc(size/2,size/2,size/2,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ── HTML builders ──
function avatar(cap,sz=48){
  const shadow=`box-shadow:0 0 14px rgba(0,0,0,.4)`;
  if(cap.photo) return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,.08);${shadow};flex-shrink:0"><img src="${cap.photo}" style="width:100%;height:100%;object-fit:cover"/></div>`;
  return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${O};display:flex;align-items:center;justify-content:center;font-size:${sz*.44}px;border:2px solid rgba(255,255,255,.08);${shadow};flex-shrink:0">🍺</div>`;
}

function capRow(cap,clickFn){
  return `<div onclick="${clickFn}('${cap.id}')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;cursor:pointer;margin:0 16px 8px;border:1px solid ${T.border};background:${T.card}">
    ${avatar(cap,48)}
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cap.name}</div>
      <div style="font-size:12px;color:${T.muted};margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${[cap.brand,cap.color,cap.country].filter(Boolean).join(' · ')||'—'}</div>
    </div>
    <span style="font-size:18px;flex-shrink:0">›</span>
  </div>`;
}

// ── Screen: HOME ──
function home(){
  const {caps}=st;
  const countries=[...new Set(caps.map(c=>c.country).filter(Boolean))];
  const brands=[...new Set(caps.map(c=>c.brand).filter(Boolean))];
  const recent=[...caps].reverse().slice(0,3);

  return `<div style="padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,${O},#c05500);display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 14px ${O}40;flex-shrink:0">🍺</div>
      <div><div style="font-weight:800;font-size:22px;letter-spacing:-.3px">Tampolas</div><div style="font-size:12px;color:${T.muted}">Sua coleção de tampinhas</div></div>
    </div>

    <div onclick="go('${S.LIST}')" style="margin:0 16px 14px;border-radius:20px;overflow:hidden;cursor:pointer">
      <div style="background:linear-gradient(135deg,${O},#ffaa00 55%,#ffcc44);padding:24px 20px;position:relative;overflow:hidden">
        <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(0,0,0,.45);text-transform:uppercase">Total de Tampolas</div>
        <div style="font-size:64px;font-weight:900;color:#fff;line-height:1;margin:4px 0;text-shadow:0 2px 10px rgba(0,0,0,.2)">${caps.length}</div>
        <div style="font-size:13px;color:rgba(0,0,0,.45)">Ver coleção completa →</div>
        <div style="position:absolute;right:-8px;top:50%;transform:translateY(-50%);font-size:90px;opacity:.12">🍺</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 16px 16px">
      ${[{l:'PAÍSES',v:countries.length,s:countries.slice(0,2).join(', ')||'Nenhum ainda',ic:'🌍'},{l:'MARCAS',v:brands.length,s:brands.slice(0,2).join(', ')||'Nenhuma ainda',ic:'🏷️'}].map(x=>`
      <div style="background:${T.card};border-radius:16px;padding:16px;border:1px solid ${T.border};position:relative;overflow:hidden">
        <div style="font-size:10px;font-weight:700;color:${T.muted};letter-spacing:2px">${x.l}</div>
        <div style="font-size:36px;font-weight:900;color:${T.o2};line-height:1;margin:4px 0">${x.v}</div>
        <div style="font-size:11px;color:${T.dim};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.s}</div>
        <div style="position:absolute;right:10px;bottom:8px;font-size:24px;opacity:.12">${x.ic}</div>
      </div>`).join('')}
    </div>

    ${recent.length>0?`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0 16px;margin-bottom:8px">
      <span style="font-size:11px;font-weight:700;color:${T.muted};letter-spacing:1px;text-transform:uppercase">Recentes</span>
      <span onclick="go('${S.LIST}')" style="font-size:12px;color:${O};font-weight:700;cursor:pointer">Ver todas</span>
    </div>
    ${recent.map(c=>capRow(c,'openDetail')).join('')}`:''}
  </div>`;
}

// ── Screen: LIST ──
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
        <div style="font-size:11px;color:${T.muted};margin-top:1px">${caps.length} tampola${caps.length!==1?'s':''} cadastrada${caps.length!==1?'s':''}</div>
      </div>
    </div>

    <div style="padding:0 16px 12px;position:relative">
      <span style="position:absolute;left:28px;top:50%;transform:translateY(-50%);color:${T.muted};font-size:16px;pointer-events:none">🔍</span>
      <input oninput="set({q:this.value})" value="${q}" placeholder="Buscar nome, marca, cor ou país..." style="width:100%;background:${T.card2};border:1.5px solid ${T.border};color:${T.text};border-radius:12px;padding:11px 14px 11px 40px;font-size:15px;outline:none;font-family:inherit;box-sizing:border-box"/>
    </div>

    ${filtered.length===0
      ?`<div style="text-align:center;padding:64px 24px;color:${T.dim}"><div style="font-size:52px;margin-bottom:14px">${caps.length===0?'🫙':'🔍'}</div><div style="font-size:14px;line-height:1.6">${caps.length===0?'Coleção vazia!<br>Toque em + para começar.':'Nenhuma tampola encontrada.'}</div></div>`
      :filtered.map(c=>capRow(c,'openDetail')).join('')
    }
  </div>`;
}

// ── Screen: DETAIL ──
function detail(){
  const cap=st.caps.find(c=>c.id===st.selId);
  if(!cap) return `<div><button onclick="go('${S.LIST}')">←</button></div>`;

  const fields=[
    ['🏷️ Marca', cap.brand],
    ['🎨 Cor', cap.color],
    ['📍 País', cap.country],
    ['🔢 Quantidade', cap.quantity>1?`×${cap.quantity}`:null],
    ['📅 Adicionada', cap.addedAt],
  ].filter(([,v])=>v);

  return `<div style="padding-bottom:100px">
    <div style="position:relative;height:280px;overflow:hidden">
      ${cap.photo
        ?`<img src="${cap.photo}" style="width:100%;height:100%;object-fit:cover"/>`
        :`<div style="width:100%;height:100%;background:linear-gradient(160deg,${O}55,${T.bg});display:flex;align-items:center;justify-content:center;font-size:110px">🍺</div>`}
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.15),rgba(20,18,16,.97))"></div>
      <button onclick="go('${S.LIST}')" style="position:absolute;top:52px;left:16px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.1);color:${T.text};border-radius:10px;padding:8px 12px;cursor:pointer;font-size:18px">←</button>
      <div style="position:absolute;bottom:16px;left:16px;right:16px">
        <div style="font-weight:900;font-size:26px;text-shadow:0 2px 8px rgba(0,0,0,.8)">${cap.name}</div>
        ${cap.brand?`<div style="color:rgba(255,255,255,.55);font-size:14px;margin-top:4px">${cap.brand}</div>`:''}
      </div>
    </div>

    <div style="padding:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        ${fields.map(([l,v])=>`
        <div style="background:${T.card};border-radius:14px;padding:14px;border:1px solid ${T.border}">
          <div style="font-size:11px;color:${T.muted};font-weight:600;margin-bottom:5px">${l}</div>
          <div style="font-weight:700;font-size:15px">${v}</div>
        </div>`).join('')}
      </div>

      ${cap.notes?`<div style="background:${T.card};border-radius:14px;padding:14px 16px;border:1px solid ${T.border};margin-bottom:12px"><div style="font-size:11px;color:${T.muted};font-weight:600;margin-bottom:6px">📝 Notas</div><div style="font-size:14px;color:#c0a888;line-height:1.6">${cap.notes}</div></div>`:''}

      <div style="display:flex;gap:10px">
        <button onclick='openEdit(${JSON.stringify(cap).replace(/'/g,"&#39;")})' style="flex:1;padding:14px;border-radius:14px;border:1px solid ${T.border};background:${T.card};color:${T.text};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">✏️ Editar</button>
        <button onclick="delCap('${cap.id}')" style="padding:14px 18px;border-radius:14px;border:1px solid #401010;background:#200505;color:#ef4444;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🗑</button>
      </div>
    </div>
  </div>`;
}

// ── Screen: ADD / EDIT ──
function addForm(){
  const {form,edit}=st;
  const inp=`width:100%;background:#1a1510;border:1.5px solid ${T.border};color:${T.text};border-radius:12px;padding:12px 14px;font-size:15px;outline:none;font-family:inherit;box-sizing:border-box`;
  const lbl=`font-size:11px;font-weight:700;color:${T.muted};letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:8px`;

  return `<div style="padding-bottom:100px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button onclick="go('${edit?S.DETAIL:S.LIST}')" style="background:${T.card};border:1px solid ${T.border};color:${T.text};border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
      <div style="font-weight:800;font-size:18px">${edit?'Editar Tampola':'Nova Tampola'}</div>
    </div>

    <div style="padding:0 16px;display:flex;flex-direction:column;gap:16px">

      <!-- Foto com crop -->
      <div>
        <span style="${lbl}">Foto da tampola</span>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
          ${form.photo
            ?`<div style="position:relative;width:90px;height:90px;flex-shrink:0">
                <img src="${form.photo}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:2px solid ${O}"/>
                <button onclick="setF({photo:null})" style="position:absolute;top:-4px;right:-4px;background:#200505;border:1px solid #ef4444;color:#ef4444;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center">✕</button>
              </div>`
            :`<div style="width:90px;height:90px;border-radius:50%;background:${T.card2};border:2px dashed ${T.border};display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0">🍺</div>`}
          <div style="display:flex;flex-direction:column;gap:8px;flex:1">
            <button onclick="document.getElementById('cam').click()" style="width:100%;padding:11px;border-radius:12px;border:1px solid ${O}55;background:${O}12;color:${T.o2};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">📷 Câmera</button>
            <button onclick="document.getElementById('gal').click()" style="width:100%;padding:11px;border-radius:12px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🖼️ Galeria</button>
          </div>
        </div>
        ${form.photo?`<button onclick="set({cropSrc:st.form.photo,cropScale:1,cropX:0,cropY:0});go('${S.CROP}')" style="width:100%;padding:10px;border-radius:12px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">✂️ Ajustar zoom e posição</button>`:''}
        <input id="cam" type="file" accept="image/*" capture="environment" style="display:none" onchange="loadPhoto(this.files[0])"/>
        <input id="gal" type="file" accept="image/*" style="display:none" onchange="loadPhoto(this.files[0])"/>
      </div>

      <!-- Campos -->
      <div><span style="${lbl}">Nome *</span><input value="${form.name}" oninput="setF({name:this.value})" placeholder="Ex: Brahma Especial" style="${inp}"/></div>
      <div><span style="${lbl}">Marca</span><input value="${form.brand}" oninput="setF({brand:this.value})" placeholder="Ex: Brahma" style="${inp}"/></div>
      <div><span style="${lbl}">Cor</span><input value="${form.color}" oninput="setF({color:this.value})" placeholder="Ex: Vermelha, Dourada, Azul..." style="${inp}"/></div>
      <div><span style="${lbl}">País de origem</span><input value="${form.country}" oninput="setF({country:this.value})" placeholder="Ex: Brasil" style="${inp}"/></div>
      <div><span style="${lbl}">Quantidade</span><input type="number" min="1" value="${form.quantity}" oninput="setF({quantity:parseInt(this.value)||1})" style="${inp}"/></div>
      <div><span style="${lbl}">Notas</span><textarea oninput="setF({notes:this.value})" placeholder="Raridade, origem, detalhes..." rows="3" style="${inp};resize:vertical;line-height:1.5">${form.notes}</textarea></div>

      <button onclick="saveCap()" style="width:100%;padding:16px;border-radius:14px;border:none;background:linear-gradient(135deg,${O},#c05500);color:#fff;font-weight:800;font-size:16px;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px ${O}40;margin-bottom:8px">
        ${edit?'SALVAR ALTERAÇÕES':'ADICIONAR TAMPOLA'}
      </button>
    </div>
  </div>`;
}

// ── Screen: CROP ──
function cropScreen(){
  const SIZE=Math.min(window.innerWidth,480)-32;
  return `<div style="padding-bottom:90px;display:flex;flex-direction:column;align-items:center">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px;width:100%">
      <button onclick="go('${S.ADD}')" style="background:${T.card};border:1px solid ${T.border};color:${T.text};border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
      <div style="font-weight:800;font-size:18px">Ajustar Foto</div>
    </div>

    <div style="font-size:13px;color:${T.muted};margin-bottom:14px;text-align:center;padding:0 16px">
      Arraste para reposicionar · Belisque para dar zoom
    </div>

    <!-- Canvas visível -->
    <div style="position:relative;width:${SIZE}px;height:${SIZE}px;border-radius:50%;overflow:hidden;border:3px solid ${O};box-shadow:0 0 0 2000px rgba(0,0,0,.6);margin:0 16px">
      <canvas id="crop-canvas" width="${SIZE}" height="${SIZE}"
        style="width:${SIZE}px;height:${SIZE}px;display:block;touch-action:none;cursor:grab"
        ontouchstart="cropPointerDown(event)"
        ontouchmove="cropPointerMove(event)"
        ontouchend="cropPointerUp()"
        onmousedown="cropPointerDown(event)"
        onmousemove="cropPointerMove(event)"
        onmouseup="cropPointerUp()">
      </canvas>
    </div>

    <!-- hidden img for drawing -->
    <img id="crop-img" src="${st.cropSrc}" style="display:none" onload="drawCrop()"/>

    <!-- Zoom slider -->
    <div style="width:100%;padding:20px 16px 0">
      <div style="font-size:11px;color:${T.muted};font-weight:700;letter-spacing:1px;margin-bottom:8px">ZOOM</div>
      <input type="range" min="1" max="4" step="0.05" value="${st.cropScale}"
        oninput="st.cropScale=parseFloat(this.value);drawCrop()"
        style="width:100%;accent-color:${O}"/>
    </div>

    <div style="width:100%;padding:16px;display:flex;gap:10px">
      <button onclick="go('${S.ADD}')" style="flex:1;padding:14px;border-radius:14px;border:1px solid ${T.border};background:${T.card};color:${T.muted};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">Cancelar</button>
      <button onclick="confirmCrop()" style="flex:2;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,${O},#c05500);color:#fff;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit">✓ Confirmar</button>
    </div>
  </div>`;
}

// ── Nav ──
function nav(){
  const {scr}=st;
  const show=scr!==S.CROP;
  if(!show) return '';
  return `<div style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:rgba(14,12,10,.96);border-top:1px solid ${T.border};padding:8px 8px 20px;display:flex;align-items:center;z-index:100;backdrop-filter:blur(12px)">
    ${[{k:S.HOME,ic:'🏠',l:'Início'},{k:S.LIST,ic:'📋',l:'Coleção'}].map(n=>`
    <button onclick="go('${n.k}')" style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 0">
      <span style="font-size:22px">${n.ic}</span>
      <span style="font-size:10px;font-weight:700;color:${scr===n.k?O:T.muted}">${n.l}</span>
    </button>`).join('')}
    <div style="flex:1;display:flex;justify-content:center">
      <button onclick="openAdd()" style="width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,${O},#c05500);font-size:26px;color:#fff;box-shadow:0 4px 16px ${O}70;display:flex;align-items:center;justify-content:center">+</button>
    </div>
    <div style="flex:2"></div>
  </div>`;
}

// ── Toast ──
function toastHtml(){
  if(!st.toast) return '';
  const t={err:['#4a0a0a','#ef4444'],info:['#0a1e2a','#4cc9f0'],ok:['#052010','#22c55e']}[st.toast.type];
  return `<div style="position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:999;padding:10px 20px;border-radius:24px;font-size:13px;font-weight:600;white-space:nowrap;background:${t[0]};color:${t[1]};border:1px solid ${t[1]};box-shadow:0 4px 20px rgba(0,0,0,.5)">${st.toast.msg}</div>`;
}

// ── Render ──
function render(){
  const screens={[S.HOME]:home,[S.LIST]:list,[S.ADD]:addForm,[S.DETAIL]:detail,[S.CROP]:cropScreen};
  document.getElementById('app').innerHTML=(screens[st.scr]||home)()+nav()+toastHtml();
}

// ── Boot ──
async function boot(){
  document.getElementById('app').innerHTML=`<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px"><div style="font-size:48px;animation:pulse 1.4s ease infinite">🍺</div><div style="color:${T.muted};font-size:14px">Carregando...</div></div>`;
  try { await openDB(); st.caps=await dbAll(); } catch(e){ console.warn('IndexedDB indisponível'); }
  render();
}

boot();
