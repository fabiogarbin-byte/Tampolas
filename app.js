const COLORS = ['#ff6b00','#ff9500','#ffb347','#e63946','#2a9d8f','#457b9d','#6a4c93','#f72585','#80b918','#9b2226'];
const O = '#ff8c00';
const S = { HOME:'home', LIST:'list', ADD:'add', DETAIL:'detail' };
const T = {
  bg:'#141210', card:'#1e1a16', card2:'#252018', border:'#2e2618',
  text:'#fff4e8', muted:'#7a6a58', dim:'#3a3028',
  green:'#22c55e', gBg:'#052010', gBorder:'#0a4020',
  red:'#ef4444',   rBg:'#200505', rBorder:'#401010',
  o2:'#ffaa33',
};

// ── State ──
let st = {
  caps:[], scr:S.HOME, filter:'all', q:'',
  selId:null, edit:null,
  form:{name:'',brand:'',country:'',color:O,notes:'',quantity:1,photo:null,owned:true},
  toast:null,
};

// ── IndexedDB ──
let db;
function openDB() {
  return new Promise((res,rej)=>{
    const r = indexedDB.open('TampolasDB',1);
    r.onupgradeneeded = e => e.target.result.createObjectStore('caps',{keyPath:'id'});
    r.onsuccess = e => { db=e.target.result; res(); };
    r.onerror = rej;
  });
}
const dbAll = () => new Promise(res=>{ const r=db.transaction('caps','readonly').objectStore('caps').getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>res([]); });
const dbPut = c  => new Promise(res=>{ const tx=db.transaction('caps','readwrite'); tx.objectStore('caps').put(c); tx.oncomplete=res; });
const dbDel = id => new Promise(res=>{ const tx=db.transaction('caps','readwrite'); tx.objectStore('caps').delete(id); tx.oncomplete=res; });

// ── Helpers ──
const uid   = () => Date.now().toString(36)+Math.random().toString(36).slice(2);
const set   = patch => { st={...st,...patch}; render(); };
const setF  = patch => set({form:{...st.form,...patch}});
const go    = scr  => { st={...st,scr}; render(); window.scrollTo(0,0); };

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

async function toggleOwned(id){
  const caps=st.caps.map(c=>c.id===id?{...c,owned:!c.owned}:c);
  await dbPut(caps.find(c=>c.id===id));
  set({caps});
}

function openAdd(){
  set({edit:null,form:{name:'',brand:'',country:'',color:O,notes:'',quantity:1,photo:null,owned:true}});
  go(S.ADD);
}

function openEdit(cap){
  set({edit:cap.id,form:{name:cap.name,brand:cap.brand||'',country:cap.country||'',color:cap.color,notes:cap.notes||'',quantity:cap.quantity||1,photo:cap.photo||null,owned:cap.owned}});
  go(S.ADD);
}

function loadPhoto(file){
  if(!file) return;
  const r=new FileReader();
  r.onload=e=>setF({photo:e.target.result});
  r.readAsDataURL(file);
}

// ── HTML builders ──
function avatar(cap,sz=48){
  const shadow=`box-shadow:0 0 14px ${cap.color}44`;
  if(cap.photo) return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,.08);${shadow};flex-shrink:0"><img src="${cap.photo}" style="width:100%;height:100%;object-fit:cover"/></div>`;
  return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${cap.color};display:flex;align-items:center;justify-content:center;font-size:${sz*.44}px;border:2px solid rgba(255,255,255,.08);${shadow};flex-shrink:0">🍺</div>`;
}

function badge(cap){
  return `<span style="padding:5px 10px;border-radius:20px;font-size:11px;font-weight:800;letter-spacing:.8px;background:${cap.owned?T.gBg:T.rBg};color:${cap.owned?T.green:T.red};border:1.5px solid ${cap.owned?T.gBorder:T.rBorder};flex-shrink:0">${cap.owned?'✓ TENHO':'✕ FALTA'}</span>`;
}

function capRow(cap,clickFn){
  return `<div onclick="${clickFn}('${cap.id}')" style="display:flex;align-items:center;gap:12px;padding:12px 14px 12px 18px;border-radius:16px;cursor:pointer;margin:0 16px 8px;border:1.5px solid ${cap.owned?'#22c55e22':'#ef444422'};background:${T.card};position:relative;overflow:hidden">
    <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${cap.owned?T.green:T.red};border-radius:4px 0 0 4px"></div>
    ${avatar(cap,48)}
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cap.name}</div>
      <div style="font-size:12px;color:${T.muted};margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${[cap.brand,cap.country].filter(Boolean).join(' · ')||'—'}</div>
    </div>
    ${badge(cap)}
  </div>`;
}

// ── Screens ──
function home(){
  const {caps}=st;
  const owned=caps.filter(c=>c.owned).length;
  const missing=caps.length-owned;
  const pct=caps.length?Math.round(owned/caps.length*100):0;
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

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 16px 10px">
      <div onclick="st.filter='owned';go('${S.LIST}')" style="background:${T.card};border-radius:16px;padding:16px;border:1.5px solid ${T.gBorder};position:relative;overflow:hidden;cursor:pointer">
        <div style="font-size:10px;font-weight:700;color:${T.green};letter-spacing:2px">TENHO</div>
        <div style="font-size:40px;font-weight:900;color:${T.green};line-height:1;margin:4px 0">${owned}</div>
        <div style="font-size:11px;color:${T.dim}">${pct}% da coleção</div>
        <div style="position:absolute;right:10px;bottom:8px;font-size:26px;opacity:.15">✅</div>
      </div>
      <div onclick="st.filter='missing';go('${S.LIST}')" style="background:${T.card};border-radius:16px;padding:16px;border:1.5px solid ${T.rBorder};position:relative;overflow:hidden;cursor:pointer">
        <div style="font-size:10px;font-weight:700;color:${T.red};letter-spacing:2px">FALTA</div>
        <div style="font-size:40px;font-weight:900;color:${T.red};line-height:1;margin:4px 0">${missing}</div>
        <div style="font-size:11px;color:${T.dim}">${100-pct}% faltando</div>
        <div style="position:absolute;right:10px;bottom:8px;font-size:26px;opacity:.15">❌</div>
      </div>
    </div>

    ${caps.length>0?`<div style="margin:0 16px 10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:11px;font-weight:700;color:${T.muted};letter-spacing:1px;text-transform:uppercase">Progresso</span>
        <span style="font-size:12px;font-weight:700;color:${T.green}">${pct}% completa</span>
      </div>
      <div style="height:8px;background:${T.card2};border-radius:10px;overflow:hidden">
        <div style="height:100%;width:${pct}%;border-radius:10px;background:linear-gradient(90deg,${T.green},#16a34a)"></div>
      </div>
    </div>`:''}

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

function list(){
  const {caps,filter,q}=st;
  const owned=caps.filter(c=>c.owned).length;
  const missing=caps.length-owned;
  const filtered=caps.filter(c=>{
    const lq=q.toLowerCase();
    const ms=!lq||c.name.toLowerCase().includes(lq)||(c.brand||'').toLowerCase().includes(lq)||(c.country||'').toLowerCase().includes(lq);
    const mf=filter==='all'||(filter==='owned'&&c.owned)||(filter==='missing'&&!c.owned);
    return ms&&mf;
  });

  return `<div style="padding-bottom:90px">
    <div style="padding:52px 16px 14px;display:flex;align-items:center;gap:12px">
      <button onclick="go('${S.HOME}')" style="background:${T.card};border:1px solid ${T.border};color:${T.text};border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
      <div style="flex:1">
        <div style="font-weight:800;font-size:18px">Coleção</div>
        <div style="font-size:11px;color:${T.muted};margin-top:1px">${caps.length} tampolas &nbsp;·&nbsp; <span style="color:${T.green}">✓ ${owned}</span> &nbsp;·&nbsp; <span style="color:${T.red}">✕ ${missing}</span></div>
      </div>
    </div>

    <div style="padding:0 16px 10px;position:relative">
      <span style="position:absolute;left:28px;top:50%;transform:translateY(-50%);color:${T.muted};font-size:16px;pointer-events:none">🔍</span>
      <input oninput="set({q:this.value})" value="${q}" placeholder="Buscar nome, marca ou país..." style="width:100%;background:${T.card2};border:1.5px solid ${T.border};color:${T.text};border-radius:12px;padding:11px 14px 11px 40px;font-size:15px;outline:none;font-family:inherit;box-sizing:border-box"/>
    </div>

    <div style="display:flex;gap:8px;padding:0 16px 12px">
      ${[{k:'all',l:`Todas (${caps.length})`,ac:O,abg:O+'20',ab:O+'55'},{k:'owned',l:`✓ Tenho (${owned})`,ac:T.green,abg:T.gBg,ab:T.gBorder},{k:'missing',l:`✕ Falta (${missing})`,ac:T.red,abg:T.rBg,ab:T.rBorder}].map(f=>`
      <button onclick="set({filter:'${f.k}'})" style="flex:1;padding:8px 0;border-radius:10px;border:1.5px solid ${filter===f.k?f.ab:T.border};background:${filter===f.k?f.abg:T.card2};color:${filter===f.k?f.ac:T.muted};font-weight:700;font-size:11px;cursor:pointer;font-family:inherit">${f.l}</button>`).join('')}
    </div>

    ${filtered.length===0
      ?`<div style="text-align:center;padding:64px 24px;color:${T.dim}"><div style="font-size:52px;margin-bottom:14px">${caps.length===0?'🫙':'🔍'}</div><div style="font-size:14px;line-height:1.6">${caps.length===0?'Coleção vazia!<br>Toque em + para começar.':'Nenhuma tampola encontrada.'}</div></div>`
      :filtered.map(c=>capRow(c,'openDetail')).join('')
    }
  </div>`;
}

function detail(){
  const cap=st.caps.find(c=>c.id===st.selId);
  if(!cap) return `<div><button onclick="go('${S.LIST}')">←</button></div>`;
  return `<div style="padding-bottom:100px">
    <div style="position:relative;height:260px;overflow:hidden">
      ${cap.photo?`<img src="${cap.photo}" style="width:100%;height:100%;object-fit:cover"/>`:`<div style="width:100%;height:100%;background:linear-gradient(160deg,${cap.color}77,${T.bg});display:flex;align-items:center;justify-content:center;font-size:100px">🍺</div>`}
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.2),rgba(20,18,16,.97))"></div>
      <button onclick="go('${S.LIST}')" style="position:absolute;top:52px;left:16px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.1);color:${T.text};border-radius:10px;padding:8px 12px;cursor:pointer;font-size:18px">←</button>
      <div style="position:absolute;bottom:16px;left:16px;right:16px">
        <div style="font-weight:900;font-size:26px;text-shadow:0 2px 8px rgba(0,0,0,.8)">${cap.name}</div>
        ${cap.brand?`<div style="color:rgba(255,255,255,.55);font-size:14px;margin-top:4px">${cap.brand}</div>`:''}
      </div>
    </div>
    <div style="padding:16px">
      <button onclick="toggleOwned('${cap.id}')" style="width:100%;padding:16px;border-radius:14px;cursor:pointer;font-weight:800;font-size:17px;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:10px;background:${cap.owned?T.gBg:T.rBg};color:${cap.owned?T.green:T.red};border:2px solid ${cap.owned?T.gBorder:T.rBorder};font-family:inherit">
        ${cap.owned?'✓  Tenho esta tampola':'✕  Não tenho — toque para marcar como tenho'}
      </button>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        ${[['📍 País',cap.country||'—'],['🔢 Qtd',`×${cap.quantity||1}`],['📅 Adicionada',cap.addedAt||'—'],['🎨 Cor',`<span style="width:18px;height:18px;border-radius:50%;background:${cap.color};display:inline-block;box-shadow:0 0 8px ${cap.color}"></span>`]].map(([l,v])=>`
        <div style="background:${T.card};border-radius:14px;padding:14px;border:1px solid ${T.border}">
          <div style="font-size:11px;color:${T.muted};font-weight:600;margin-bottom:5px">${l}</div>
          <div style="font-weight:700;font-size:15px">${v}</div>
        </div>`).join('')}
      </div>
      ${cap.notes?`<div style="background:${T.card};border-radius:14px;padding:14px 16px;border:1px solid ${T.border};margin-bottom:12px"><div style="font-size:11px;color:${T.muted};font-weight:600;margin-bottom:6px">📝 Notas</div><div style="font-size:14px;color:#c0a888;line-height:1.6">${cap.notes}</div></div>`:''}
      <div style="display:flex;gap:10px">
        <button onclick='openEdit(${JSON.stringify(cap).replace(/'/g,"&#39;")})' style="flex:1;padding:14px;border-radius:14px;border:1px solid ${T.border};background:${T.card};color:${T.text};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">✏️ Editar</button>
        <button onclick="delCap('${cap.id}')" style="padding:14px 18px;border-radius:14px;border:1px solid ${T.rBorder};background:${T.rBg};color:${T.red};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🗑</button>
      </div>
    </div>
  </div>`;
}

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

      <div>
        <span style="${lbl}">Status na coleção</span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div onclick="setF({owned:true})" style="padding:14px;border-radius:12px;background:${form.owned?T.gBg:T.card};border:2px solid ${form.owned?T.gBorder:T.border};color:${form.owned?T.green:T.muted};cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:13px;font-weight:700"><span style="font-size:24px">✓</span>Tenho</div>
          <div onclick="setF({owned:false})" style="padding:14px;border-radius:12px;background:${!form.owned?T.rBg:T.card};border:2px solid ${!form.owned?T.rBorder:T.border};color:${!form.owned?T.red:T.muted};cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:13px;font-weight:700"><span style="font-size:24px">✕</span>Falta</div>
        </div>
      </div>

      <div>
        <span style="${lbl}">Foto da tampola</span>
        <div style="width:100%;height:180px;border-radius:14px;border:2px dashed ${form.photo?O+'88':T.border};overflow:hidden;background:${T.card};position:relative;display:flex;align-items:center;justify-content:center;margin-bottom:10px">
          ${form.photo
            ?`<img src="${form.photo}" style="width:100%;height:100%;object-fit:cover"/><button onclick="setF({photo:null})" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.65);border:none;color:#fff;border-radius:50%;width:30px;height:30px;cursor:pointer;font-size:14px">✕</button>`
            :`<div style="text-align:center;color:${T.dim}"><div style="font-size:38px;margin-bottom:8px">📷</div><div style="font-size:13px;color:${T.muted}">Nenhuma foto</div></div>`}
        </div>
        <div style="display:flex;gap:10px">
          <button onclick="document.getElementById('cam').click()" style="flex:1;padding:12px;border-radius:12px;border:1px solid ${O}55;background:${O}12;color:${T.o2};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">📷 Câmera</button>
          <button onclick="document.getElementById('gal').click()" style="flex:1;padding:12px;border-radius:12px;border:1px solid ${T.border};background:${T.card2};color:${T.muted};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🖼️ Galeria</button>
        </div>
        <input id="cam" type="file" accept="image/*" capture="environment" style="display:none" onchange="loadPhoto(this.files[0])"/>
        <input id="gal" type="file" accept="image/*" style="display:none" onchange="loadPhoto(this.files[0])"/>
      </div>

      ${[{k:'name',l:'Nome *',p:'Ex: Brahma Especial'},{k:'brand',l:'Marca',p:'Ex: Brahma'},{k:'country',l:'País',p:'Ex: Brasil'}].map(f=>`
      <div>
        <span style="${lbl}">${f.l}</span>
        <input value="${form[f.k]}" oninput="setF({${f.k}:this.value})" placeholder="${f.p}" style="${inp}"/>
      </div>`).join('')}

      <div>
        <span style="${lbl}">Quantidade</span>
        <input type="number" min="1" value="${form.quantity}" oninput="setF({quantity:parseInt(this.value)||1})" style="${inp}"/>
      </div>

      <div>
        <span style="${lbl}">Cor da tampola</span>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:2px">
          ${COLORS.map(c=>`<div onclick="setF({color:'${c}'})" style="width:34px;height:34px;border-radius:50%;background:${c};cursor:pointer;border:${form.color===c?'3px solid #fff':'3px solid transparent'};transform:${form.color===c?'scale(1.22)':'scale(1)'};box-shadow:${form.color===c?`0 0 10px ${c}`:'none'};transition:all .15s"></div>`).join('')}
        </div>
      </div>

      <div>
        <span style="${lbl}">Notas</span>
        <textarea oninput="setF({notes:this.value})" placeholder="Raridade, origem, detalhes..." rows="3" style="${inp};resize:vertical;line-height:1.5">${form.notes}</textarea>
      </div>

      <button onclick="saveCap()" style="width:100%;padding:16px;border-radius:14px;border:none;background:linear-gradient(135deg,${O},#c05500);color:#fff;font-weight:800;font-size:16px;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px ${O}40;margin-bottom:8px">
        ${edit?'SALVAR ALTERAÇÕES':'ADICIONAR TAMPOLA'}
      </button>
    </div>
  </div>`;
}

function nav(){
  const {scr}=st;
  return `<div style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:rgba(14,12,10,.96);border-top:1px solid ${T.border};padding:8px 8px 20px;display:flex;align-items:center;z-index:100;backdrop-filter:blur(12px)">
    ${[{k:S.HOME,ic:'🏠',l:'Início'},{k:S.LIST,ic:'📋',l:'Coleção'}].map(n=>`
    <button onclick="go('${n.k}')" style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 0">
      <span style="font-size:22px">${n.ic}</span>
      <span style="font-size:10px;font-weight:700;color:${scr===n.k?O:T.muted}">${n.l}</span>
    </button>`).join('')}
    <div style="flex:1;display:flex;justify-content:center">
      <button onclick="openAdd()" style="width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,${O},#c05500);font-size:26px;color:#fff;box-shadow:0 4px 16px ${O}70;display:flex;align-items:center;justify-content:center">+</button>
    </div>
    <button onclick="st.filter='owned';go('${S.LIST}')" style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 0">
      <span style="font-size:20px">✓</span>
      <span style="font-size:10px;font-weight:700;color:${T.green}">Tenho</span>
    </button>
    <button onclick="st.filter='missing';go('${S.LIST}')" style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 0">
      <span style="font-size:20px">✕</span>
      <span style="font-size:10px;font-weight:700;color:${T.red}">Falta</span>
    </button>
  </div>`;
}

function toastHtml(){
  if(!st.toast) return '';
  const t={err:['#4a0a0a','#ef4444'],info:['#0a1e2a','#4cc9f0'],ok:['#052010','#22c55e']}[st.toast.type];
  return `<div style="position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:999;padding:10px 20px;border-radius:24px;font-size:13px;font-weight:600;white-space:nowrap;background:${t[0]};color:${t[1]};border:1px solid ${t[1]};box-shadow:0 4px 20px rgba(0,0,0,.5)">${st.toast.msg}</div>`;
}

// ── Open actions (global scope for inline handlers) ──
function openDetail(id){ st.selId=id; go(S.DETAIL); }

// ── Render ──
function render(){
  const screens={[S.HOME]:home,[S.LIST]:list,[S.ADD]:addForm,[S.DETAIL]:detail};
  document.getElementById('app').innerHTML=(screens[st.scr]||home)()+nav()+toastHtml();
}

// ── Boot ──
async function boot(){
  document.getElementById('app').innerHTML=`<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px"><div style="font-size:48px;animation:pulse 1.4s ease infinite">🍺</div><div style="color:${T.muted};font-size:14px">Carregando coleção...</div></div>`;
  try { await openDB(); st.caps=await dbAll(); } catch(e){ console.warn('IndexedDB indisponível'); }
  render();
}

boot();
