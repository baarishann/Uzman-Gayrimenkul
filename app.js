import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://tibnefpcmnbjsqczkxcp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NootBhZLEE1KlUY56nxh_Q_4gHKPAae';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = {
  user: null, profile: null, listings: [], favorites: new Set(),
  filters: { deal:'all', category:'all', neighborhood:'all', q:'', sort:'new', minPrice:'', maxPrice:'', minM2:'', maxM2:'', rooms:'', heating:'', ada:'', parsel:'' },
  activeConversation: null, realtime: []
};

const dealLabels = { sale:'Satılık', rent:'Kiralık', exchange:'Takas', land_share:'Kat Karşılığı' };
const statusLabels = { draft:'Taslak', pending:'Onay Bekliyor', active:'Yayında', rejected:'Reddedildi', sold:'Satıldı', rented:'Kiralandı', passive:'Pasif' };
const fmt = new Intl.NumberFormat('tr-TR');

function esc(v=''){ return String(v??'').replace(/[&<>'"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[m])); }
let lastToast={message:'',time:0}; function toast(message,type='ok'){ const now=Date.now(); if(lastToast.message===message && now-lastToast.time<2500)return; lastToast={message,time:now}; const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=message; $('#toastRoot').append(el); setTimeout(()=>el.remove(),3600); }
function money(l){ if(l.price_text) return l.price_text; if(l.price!=null) return `${fmt.format(Number(l.price))} TL${l.deal==='rent'?'/ay':''}`; return 'Fiyat sorunuz'; }
function loc(l){ return [l.neighborhood,l.district,l.city].filter(Boolean).join(' • '); }
function phoneDigits(v=''){ return String(v).replace(/\D/g,'').replace(/^0/,'90').replace(/^5/,'905'); }
function isStaff(){ return ['moderator','admin','owner'].includes(state.profile?.role); }
function canManageUsers(){ return ['admin','owner'].includes(state.profile?.role); }
function statusBadge(s){ return `<span class="status ${esc(s)}">${esc(statusLabels[s]||s)}</span>`; }
function placeholder(){ return `<div class="placeholder-art">UZMAN EMLAK</div>`; }

function factsFor(l){
  const facts=[];
  if(l.gross_m2) facts.push(`${fmt.format(Number(l.gross_m2))} m²`);
  if(l.room_count) facts.push(l.room_count);
  if(l.floor) facts.push(`${l.floor}. Kat`);
  if(l.ada && l.parsel) facts.push(`${l.ada}/${l.parsel}`);
  else if(l.parsel) facts.push(`Parsel ${l.parsel}`);
  if(l.zoning) facts.push(l.zoning);
  if(l.emsal) facts.push(`E:${l.emsal}`);
  return facts.slice(0,4);
}

async function init(){
  bindUI();
  showSkeletons();
  const { data:{ session } } = await supabase.auth.getSession();
  state.user = session?.user || null;
  await hydrateAccount();
  await Promise.all([loadListings(), loadFavorites()]);
  setupRealtime();
  supabase.auth.onAuthStateChange(async (_event,session)=>{
    state.user=session?.user||null;
    await hydrateAccount();
    await loadFavorites();
    setupRealtime();
  });
}

function showSkeletons(){ $('#listingLoading').innerHTML = Array.from({length:6},()=>'<div class="skeleton"></div>').join(''); }

async function loadListings(){
  const { data, error } = await supabase.from('listings').select('*').order('is_featured',{ascending:false}).order('published_at',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false});
  if(error){ console.error(error); $('#listingLoading').innerHTML=''; toast('İlanlar yüklenemedi.','err'); return; }
  const listings=data||[];
  if(listings.length){
    const ids=listings.map(x=>x.id);
    const { data:images }=await supabase.from('listing_images').select('*').in('listing_id',ids).order('sort_order');
    const map={}; (images||[]).forEach(im=>(map[im.listing_id]??=[]).push(im));
    listings.forEach(l=>l.images=map[l.id]||[]);
  }
  state.listings=listings;
  $('#listingLoading').innerHTML='';
  refreshNeighborhoods(); renderListings(); renderRecent();
}

function refreshNeighborhoods(){
  const current=$('#neighborhoodFilter').value;
  const items=[...new Set(state.listings.map(x=>x.neighborhood).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
  $('#neighborhoodFilter').innerHTML='<option value="all">Tüm Mahalleler</option>'+items.map(x=>`<option>${esc(x)}</option>`).join('');
  if(items.includes(current)) $('#neighborhoodFilter').value=current;
}

function filteredListings(){
  let arr=[...state.listings].filter(l=>l.status==='active'); const f=state.filters;
  if(f.deal!=='all') arr=arr.filter(l=>l.deal===f.deal);
  if(f.category!=='all') arr=arr.filter(l=>String(l.category).toLocaleLowerCase('tr')===f.category.toLocaleLowerCase('tr'));
  if(f.neighborhood!=='all') arr=arr.filter(l=>l.neighborhood===f.neighborhood);
  if(f.q){ const q=f.q.toLocaleLowerCase('tr'); arr=arr.filter(l=>[l.listing_no,l.title,l.description,l.neighborhood,l.ada,l.parsel,l.subcategory].some(v=>String(v||'').toLocaleLowerCase('tr').includes(q))); }
  if(f.minPrice) arr=arr.filter(l=>Number(l.price||0)>=Number(f.minPrice));
  if(f.maxPrice) arr=arr.filter(l=>l.price!=null && Number(l.price)<=Number(f.maxPrice));
  if(f.minM2) arr=arr.filter(l=>Number(l.gross_m2||0)>=Number(f.minM2));
  if(f.maxM2) arr=arr.filter(l=>l.gross_m2!=null && Number(l.gross_m2)<=Number(f.maxM2));
  if(f.rooms) arr=arr.filter(l=>String(l.room_count||'').toLowerCase().includes(f.rooms.toLowerCase()));
  if(f.heating) arr=arr.filter(l=>String(l.heating||'').toLocaleLowerCase('tr').includes(f.heating.toLocaleLowerCase('tr')));
  if(f.ada) arr=arr.filter(l=>String(l.ada||'').includes(f.ada));
  if(f.parsel) arr=arr.filter(l=>String(l.parsel||'').includes(f.parsel));
  if(f.sort==='priceAsc') arr.sort((a,b)=>(Number(a.price)||Infinity)-(Number(b.price)||Infinity));
  if(f.sort==='priceDesc') arr.sort((a,b)=>(Number(b.price)||0)-(Number(a.price)||0));
  if(f.sort==='m2Desc') arr.sort((a,b)=>(Number(b.gross_m2)||0)-(Number(a.gross_m2)||0));
  return arr;
}

function renderListings(){
  const arr=filteredListings(); const grid=$('#listingGrid');
  grid.innerHTML=arr.map(listingCard).join(''); $('#listingEmpty').classList.toggle('hidden',arr.length>0);
}

function listingCard(l){
  const img=l.images?.find(x=>x.is_cover)?.image_url || l.images?.[0]?.image_url;
  const fav=state.favorites.has(l.id);
  return `<article class="listing-card" data-open-listing="${l.id}">
    <div class="listing-image">${img?`<img src="${esc(img)}" alt="${esc(l.title)}" loading="lazy"/>`:placeholder()}
      <div class="listing-badges"><span class="chip gold">${esc(dealLabels[l.deal]||l.deal)}</span>${l.is_featured?'<span class="chip">ÖNE ÇIKAN</span>':''}</div>
      <button class="fav-btn ${fav?'active':''}" data-fav="${l.id}" aria-label="Favori">${fav?'♥':'♡'}</button>
    </div>
    <div class="listing-body"><div class="location">${esc(loc(l))}</div><h3>${esc(l.title)}</h3><div class="price">${esc(money(l))}</div>
      <div class="facts">${factsFor(l).map(x=>`<span class="fact">${esc(x)}</span>`).join('')}</div>
      <div class="card-footer"><span>İlan No: ${esc(l.listing_no)}</span><span>${l.view_count||0} görüntülenme</span></div>
    </div></article>`;
}

const RECENT_KEY='uzman-emlak-recent-v1';
function getRecentIds(){try{return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]')}catch{return []}}
function addRecent(id){const ids=[id,...getRecentIds().filter(x=>x!==id)].slice(0,8);localStorage.setItem(RECENT_KEY,JSON.stringify(ids));renderRecent()}
function renderRecent(){const ids=getRecentIds();const arr=ids.map(id=>state.listings.find(x=>x.id===id)).filter(x=>x&&x.status==='active');const sec=$('#recentSection');if(!sec)return;sec.classList.toggle('hidden',!arr.length);$('#recentGrid').innerHTML=arr.map(listingCard).join('')}
function clearRecent(){localStorage.removeItem(RECENT_KEY);renderRecent();}
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function installApp(){if(isStandalone())return toast('Uzman Emlak zaten ana ekranınızda.');if(deferredInstall){deferredInstall.prompt();deferredInstall.userChoice.finally(()=>{deferredInstall=null;$('#installBtn').classList.add('hidden')});return;}if(isIOS())return toast('iPhone: Paylaş → Ana Ekrana Ekle → Ekle');toast('Tarayıcı menüsünden “Ana ekrana ekle / Uygulamayı yükle” seçeneğini kullanabilirsiniz.');}

async function openListing(id){
  let l=state.listings.find(x=>x.id===id);
  if(!l){ const {data}=await supabase.from('listings').select('*').eq('id',id).single(); l=data; }
  if(!l) return;
  addRecent(id);
  const imgs=l.images||[]; const hero=imgs.find(x=>x.is_cover)?.image_url||imgs[0]?.image_url;
  const details=[['İşlem',dealLabels[l.deal]],['Kategori',l.category],['Alt Kategori',l.subcategory],['Brüt m²',l.gross_m2?`${fmt.format(Number(l.gross_m2))} m²`:null],['Net m²',l.net_m2?`${fmt.format(Number(l.net_m2))} m²`:null],['Oda',l.room_count],['Kat',l.floor],['Isıtma',l.heating],['Ada',l.ada],['Parsel',l.parsel],['İmar',l.zoning],['Emsal',l.emsal],['Hmax',l.hmax]].filter(x=>x[1]);
  const phone=l.contact_phone||'05061347675';
  $('#listingDetail').innerHTML=`<div class="detail-hero">${hero?`<img src="${esc(hero)}" alt="${esc(l.title)}">`:placeholder()}</div><div class="detail-content">
    <div class="detail-title"><div class="location">${esc(loc(l))} • İlan No ${esc(l.listing_no)}</div><h2>${esc(l.title)}</h2><div class="detail-price">${esc(money(l))}</div></div>
    <div class="detail-grid"><div><div class="detail-box"><div class="detail-facts">${details.map(([k,v])=>`<div class="detail-fact"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div></div>
      <div class="detail-box" style="margin-top:12px"><h3>Açıklama</h3><div class="detail-description">${esc(l.description||'Detaylı bilgi için iletişime geçebilirsiniz.')}</div></div></div>
      <aside><div class="detail-box contact-card"><div class="eyebrow">İLAN İLETİŞİMİ</div><h3>${esc(l.contact_name||'Uzman Emlak')}</h3><p class="location">${esc(l.contact_phone||'0506 134 76 75')}</p>
        <a class="gold-btn" style="display:block;text-align:center;text-decoration:none" href="tel:${esc(phoneDigits(phone))}">Ara</a>
        <a class="ghost-btn" style="display:block;text-align:center;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${esc(phoneDigits(phone))}?text=${encodeURIComponent(`Merhaba, ${l.listing_no} numaralı ${l.title} ilanı hakkında bilgi almak istiyorum.`)}">WhatsApp</a>
        ${l.owner_id?`<button class="ghost-btn" data-message-owner="${l.id}">Uygulamadan Mesaj At</button>`:''}
        <button class="ghost-btn" data-share-listing="${l.id}">İlanı Paylaş</button>
      </div></aside></div></div>`;
  $('#listingDialog').showModal();
}

async function toggleFavorite(id){
  if(!state.user) return openAuth();
  if(state.favorites.has(id)){
    const {error}=await supabase.from('favorites').delete().eq('user_id',state.user.id).eq('listing_id',id); if(error) return toast(error.message,'err'); state.favorites.delete(id);
  }else{
    const {error}=await supabase.from('favorites').insert({user_id:state.user.id,listing_id:id}); if(error) return toast(error.message,'err'); state.favorites.add(id);
  }
  renderListings(); renderFavoriteView();
}

async function loadFavorites(){
  state.favorites=new Set(); if(!state.user){ renderListings(); return; }
  const {data,error}=await supabase.from('favorites').select('listing_id').eq('user_id',state.user.id); if(!error) state.favorites=new Set((data||[]).map(x=>x.listing_id)); renderListings();
}
function renderFavoriteView(){ const arr=state.listings.filter(l=>state.favorites.has(l.id)&&l.status==='active'); $('#favoritesGrid').innerHTML=arr.map(listingCard).join(''); $('#favoritesEmpty').classList.toggle('hidden',arr.length>0); }

async function hydrateAccount(){
  state.profile=null;
  if(state.user){ const {data}=await supabase.from('profiles').select('*').eq('id',state.user.id).maybeSingle(); state.profile=data||null; }
  updateAuthUI();
  if(state.user){ fillProfile(); if(state.profile?.role==='owner') await claimInitialListings(); await Promise.all([loadMyListings(),loadNotifications()]); if(isStaff()) await loadAdmin('pending'); }
}
function updateAuthUI(){
  $('#authBtn').classList.toggle('hidden',!!state.user); $('#userBtn').classList.toggle('hidden',!state.user);
  if(state.user){ const n=state.profile?.full_name||state.user.email||'U'; $('#userBtn').textContent=n.trim().charAt(0).toLocaleUpperCase('tr'); }
  $('#adminTabBtn').classList.toggle('hidden',!isStaff());
}
function fillProfile(){ $('#profileName').value=state.profile?.full_name||''; $('#profilePhone').value=state.profile?.phone||''; $('#profileCompany').value=state.profile?.company_name||''; $('#profileBio').value=state.profile?.bio||''; }

function openAuth(tab='login'){ $$('.auth-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.authTab===tab)); $('#loginForm').classList.toggle('hidden',tab!=='login'); $('#signupForm').classList.toggle('hidden',tab!=='signup'); $('#authDialog').showModal(); }
async function login(e){ e.preventDefault(); const email=$('#loginEmail').value.trim(), password=$('#loginPassword').value; const {error}=await supabase.auth.signInWithPassword({email,password}); if(error)return toast(error.message,'err'); if($('#authDialog').open) $('#authDialog').close(); e.target.reset(); toast('Giriş yapıldı.'); }
async function signup(e){ e.preventDefault(); const email=$('#signupEmail').value.trim(), password=$('#signupPassword').value, full_name=$('#signupName').value.trim(), phone=$('#signupPhone').value.trim(); const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name,phone}}}); if(error)return toast(error.message,'err'); if(!data.session){ const signed=await supabase.auth.signInWithPassword({email,password}); if(signed.error)return toast('Üyelik oluşturuldu. Şimdi giriş yapabilirsiniz.'); } if($('#authDialog').open) $('#authDialog').close(); e.target.reset(); toast('Üyeliğiniz başarıyla oluşturuldu. Giriş yapıldı.'); }
async function logout(){ await supabase.auth.signOut(); nav('home'); toast('Çıkış yapıldı.'); }
async function saveProfile(e){ e.preventDefault(); if(!state.user)return; const payload={full_name:$('#profileName').value.trim(),phone:$('#profilePhone').value.trim(),company_name:$('#profileCompany').value.trim(),bio:$('#profileBio').value.trim()}; const {data,error}=await supabase.from('profiles').update(payload).eq('id',state.user.id).select().single(); if(error)return toast(error.message,'err'); state.profile=data; updateAuthUI(); toast('Profil güncellendi.'); }


async function claimInitialListings(){
  if(!state.user || state.profile?.role!=='owner') return;
  const {error}=await supabase.from('listings')
    .update({owner_id:state.user.id})
    .is('owner_id',null)
    .in('listing_no',[1,2,3,4,5,6,7,8]);
  if(error) console.warn('İlk ilanlar hesaba bağlanamadı:',error.message);
}

async function loadMyListings(){
  if(!state.user)return; const {data,error}=await supabase.from('listings').select('*').eq('owner_id',state.user.id).order('created_at',{ascending:false}); if(error)return;
  $('#myListings').innerHTML=(data||[]).map(l=>`<div class="manage-row"><div><h3>${esc(l.title)} ${statusBadge(l.status)}</h3><p>${esc(loc(l))} • ${esc(money(l))} • İlan No ${l.listing_no}</p></div><div class="manage-actions"><button class="mini-btn" data-edit-listing="${l.id}">Düzenle</button>${l.status==='active'?`<button class="mini-btn" data-owner-status="${l.id}|sold">Satıldı</button><button class="mini-btn" data-owner-status="${l.id}|rented">Kiralandı</button><button class="mini-btn" data-owner-status="${l.id}|passive">Pasife Al</button>`:''}<button class="mini-btn warn" data-delete-listing="${l.id}">Sil</button></div></div>`).join('') || '<div class="empty-state"><div>⌂</div><h3>Henüz ilanınız yok</h3><p>Yeni ilan vererek başlayabilirsiniz.</p></div>';
}

function openListingForm(listing=null){
  if(!state.user) return openAuth('signup');
  $('#listingForm').reset(); $('#editListingId').value=listing?.id||''; $('#listingFormTitle').textContent=listing?'İlanı Düzenle':'Yeni İlan Ver';
  const vals={lfTitle:'title',lfDeal:'deal',lfCategory:'category',lfSubcategory:'subcategory',lfPrice:'price',lfCity:'city',lfDistrict:'district',lfNeighborhood:'neighborhood',lfAddress:'address_text',lfGross:'gross_m2',lfNet:'net_m2',lfRooms:'room_count',lfFloor:'floor',lfBuildingAge:'building_age',lfHeating:'heating',lfBathroom:'bathroom_count',lfTotalFloors:'total_floors',lfAda:'ada',lfParsel:'parsel',lfZoning:'zoning',lfEmsal:'emsal',lfHmax:'hmax',lfFrontage:'frontage',lfDescription:'description',lfContactName:'contact_name',lfContactPhone:'contact_phone'};
  Object.entries(vals).forEach(([id,key])=>{ const el=$('#'+id); el.value=listing?.[key]??(id==='lfCity'?'':id==='lfDistrict'?'':id==='lfContactName'?(state.profile?.full_name||''):id==='lfContactPhone'?(state.profile?.phone||''):''); });
  ['Balcony','Elevator','Parking','Furnished','Credit'].forEach(x=>{ const key={Balcony:'balcony',Elevator:'elevator',Parking:'parking',Furnished:'furnished',Credit:'credit_eligible'}[x]; $('#lf'+x).checked=!!listing?.[key]; });
  $('#uploadPreview').innerHTML=''; toggleListingFields(); $('#listingFormDialog').showModal();
}
function toggleListingFields(){ const cat=$('#lfCategory').value; $('#landFields').classList.toggle('hidden',cat!=='Arsa'); $('#residentialFields').classList.toggle('hidden',cat==='Arsa'); }
function listingPayload(status='pending'){
  const n=id=>$('#'+id).value.trim(); const num=id=>n(id)===''?null:Number(n(id));
  const payload={title:n('lfTitle'),deal:n('lfDeal'),category:n('lfCategory'),subcategory:n('lfSubcategory')||null,price:num('lfPrice'),price_text:null,currency:'TRY',city:n('lfCity')||null,district:n('lfDistrict')||null,neighborhood:n('lfNeighborhood')||null,address_text:n('lfAddress')||null,gross_m2:num('lfGross'),net_m2:num('lfNet'),room_count:n('lfRooms')||null,floor:n('lfFloor')||null,building_age:n('lfBuildingAge')||null,heating:n('lfHeating')||null,bathroom_count:num('lfBathroom'),total_floors:n('lfTotalFloors')||null,ada:n('lfAda')||null,parsel:n('lfParsel')||null,zoning:n('lfZoning')||null,emsal:n('lfEmsal')||null,hmax:n('lfHmax')||null,frontage:n('lfFrontage')||null,balcony:$('#lfBalcony').checked,elevator:$('#lfElevator').checked,parking:$('#lfParking').checked,furnished:$('#lfFurnished').checked,credit_eligible:$('#lfCredit').checked,description:n('lfDescription'),contact_name:n('lfContactName')||state.profile?.full_name||'Uzman Emlak',contact_phone:n('lfContactPhone')||state.profile?.phone||null,status};
  if(payload.price!=null) payload.price_text=`${fmt.format(payload.price)} TL${payload.deal==='rent'?'/ay':''}`;
  return payload;
}
async function saveListing(e,status='pending'){ if(e)e.preventDefault(); if(!state.user)return openAuth(); const id=$('#editListingId').value; const payload=listingPayload(status); if(!payload.title||!payload.category||!payload.description)return toast('Başlık, kategori ve açıklama zorunlu.','err'); let result;
  if(id) result=await supabase.from('listings').update(payload).eq('id',id).select().single();
  else result=await supabase.from('listings').insert({...payload,owner_id:state.user.id,is_featured:false,view_count:0,favorite_count:0}).select().single();
  if(result.error)return toast(result.error.message,'err');
  const listing=result.data; const files=[...$('#lfImages').files].slice(0,12); if(files.length) await uploadListingImages(listing.id,files);
  $('#listingFormDialog').close(); toast(status==='draft'?'Taslak kaydedildi.':'İlan yönetici onayına gönderildi.'); await loadListings(); await loadMyListings(); if(isStaff())await loadAdmin('pending'); }
async function uploadListingImages(listingId,files){
  let order=0; for(const file of files){ if(file.size>10*1024*1024){toast(`${file.name} 10 MB sınırını aşıyor.`,'err');continue;} const ext=(file.name.split('.').pop()||'jpg').toLowerCase(); const path=`${state.user.id}/${listingId}/${crypto.randomUUID()}.${ext}`; const {data,error}=await supabase.storage.from('listing-images').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type}); if(error){toast(`Fotoğraf yüklenemedi: ${error.message}`,'err');continue;} const {data:urlData}=supabase.storage.from('listing-images').getPublicUrl(data.path); const {error:dbErr}=await supabase.from('listing_images').insert({listing_id:listingId,image_url:urlData.publicUrl,sort_order:order,is_cover:order===0}); if(dbErr)toast(dbErr.message,'err'); order++; }
}
async function deleteListing(id){ if(!confirm('Bu ilanı silmek istediğinize emin misiniz?'))return; const {error}=await supabase.from('listings').delete().eq('id',id); if(error)return toast(error.message,'err'); toast('İlan silindi.'); await loadListings();await loadMyListings(); }
async function ownerStatus(id,status){ const {error}=await supabase.from('listings').update({status}).eq('id',id); if(error)return toast(error.message,'err'); toast('İlan durumu güncellendi.'); await loadListings();await loadMyListings(); }

async function loadNotifications(){ if(!state.user)return; const {data}=await supabase.from('notifications').select('*').eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(100); const arr=data||[]; const unread=arr.filter(x=>!x.read_at).length; $('#notificationBadge').textContent=unread; $('#notificationBadge').classList.toggle('hidden',!unread); $('#notificationList').innerHTML=arr.map(n=>`<div class="notification-item" data-notification="${n.id}"><div><h3 style="margin:0 0 5px">${esc(n.title)} ${!n.read_at?'<span class="chip gold">YENİ</span>':''}</h3><p>${esc(n.body||'')} • ${new Date(n.created_at).toLocaleString('tr-TR')}</p></div>${!n.read_at?`<button class="mini-btn" data-read-notification="${n.id}">Okundu</button>`:''}</div>`).join('')||'<div class="empty-state"><div>♢</div><h3>Bildirim yok</h3></div>'; }
async function readNotification(id){ await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id); await loadNotifications(); }
async function markAllRead(){ if(!state.user)return; await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',state.user.id).is('read_at',null); await loadNotifications(); }

async function conversationPeople(conversationIds){
  const out={}; if(!conversationIds.length)return out;
  const {data:members}=await supabase.from('conversation_members').select('conversation_id,user_id').in('conversation_id',conversationIds);
  const other=(members||[]).filter(m=>m.user_id!==state.user?.id); const ids=[...new Set(other.map(m=>m.user_id))];
  let profiles={}; if(ids.length){ const {data:p}=await supabase.from('profiles').select('id,full_name').in('id',ids); (p||[]).forEach(x=>profiles[x.id]=x); }
  other.forEach(m=>{ if(!out[m.conversation_id]) out[m.conversation_id]=profiles[m.user_id]?.full_name||'Üye'; }); return out;
}
async function loadConversations(){
  if(!state.user)return; const {data,error}=await supabase.from('conversations').select('*').order('updated_at',{ascending:false}); if(error)return toast(error.message,'err'); const arr=data||[]; let listings={}; if(arr.length){ const ids=[...new Set(arr.map(x=>x.listing_id).filter(Boolean))]; if(ids.length){const {data:l}=await supabase.from('listings').select('id,title,listing_no').in('id',ids); (l||[]).forEach(x=>listings[x.id]=x);} }
  const people=await conversationPeople(arr.map(c=>c.id));
  $('#conversationList').innerHTML=arr.map(c=>{const l=listings[c.listing_id], person=people[c.id]||'Üye'; return `<button class="conversation-item ${state.activeConversation===c.id?'active':''}" data-conversation="${c.id}"><b>${esc(person)}</b><small>${esc(l?.title||'İlan görüşmesi')} ${l?`• İlan No ${l.listing_no}`:''} • ${new Date(c.updated_at).toLocaleDateString('tr-TR')}</small></button>`}).join('')||'<div class="empty-state compact"><div>✉</div><h3>Mesaj yok</h3></div>';
}
async function openConversation(id){ state.activeConversation=id; await loadConversations(); const [{data,error},{data:members}]=await Promise.all([supabase.from('messages').select('*').eq('conversation_id',id).order('created_at'),supabase.from('conversation_members').select('user_id').eq('conversation_id',id)]); if(error)return toast(error.message,'err'); const memberIds=[...new Set((members||[]).map(m=>m.user_id).filter(Boolean))]; let profiles={}; if(memberIds.length){const {data:p}=await supabase.from('profiles').select('id,full_name').in('id',memberIds);(p||[]).forEach(x=>profiles[x.id]=x.full_name||'Üye');} const other=(members||[]).find(m=>m.user_id!==state.user.id); $('#chatEmpty').classList.add('hidden'); $('#chatActive').classList.remove('hidden'); $('#chatHeader').textContent=other?(profiles[other.user_id]||'Üye'):'İlan görüşmesi'; $('#messageList').innerHTML=(data||[]).map(m=>`<div class="bubble ${m.sender_id===state.user.id?'mine':''}">${m.sender_id!==state.user.id?`<b class="sender-name">${esc(profiles[m.sender_id]||'Üye')}</b>`:''}${esc(m.body)}<small>${new Date(m.created_at).toLocaleString('tr-TR')}</small></div>`).join(''); $('#messageList').scrollTop=$('#messageList').scrollHeight; }
async function sendMessage(e){ e.preventDefault(); if(!state.activeConversation)return; const body=$('#messageInput').value.trim(); if(!body)return; const {error}=await supabase.from('messages').insert({conversation_id:state.activeConversation,sender_id:state.user.id,body}); if(error)return toast(error.message,'err'); $('#messageInput').value=''; await openConversation(state.activeConversation); }
async function startListingConversation(listingId){ if(!state.user){$('#listingDialog').close();return openAuth();} const l=state.listings.find(x=>x.id===listingId); if(!l?.owner_id)return toast('Bu ilan için uygulama içi mesajlaşma henüz aktif değil.','err'); const {data,error}=await supabase.rpc('start_conversation',{p_listing_id:listingId,p_other_user_id:l.owner_id}); if(error)return toast(error.message,'err'); $('#listingDialog').close(); nav('messages'); await loadConversations(); await openConversation(data); }

async function loadAdmin(section='pending'){
  if(!isStaff())return; let query=supabase.from('listings').select('*').order('created_at',{ascending:false}); if(section==='pending')query=query.eq('status','pending');
  let data=[]; if(['pending','all'].includes(section)){ const r=await query; data=r.data||[]; $('#adminContent').innerHTML=data.map(adminListingRow).join('')||'<div class="empty-state"><div>✓</div><h3>Kayıt yok</h3></div>'; }
  if(section==='users'){ const r=await supabase.from('profiles').select('*').order('created_at',{ascending:false}); data=r.data||[]; $('#adminContent').innerHTML=data.map(adminUserRow).join('')||'<div class="empty-state">Üye yok</div>'; }
  if(section==='reports'){ const r=await supabase.from('reports').select('*').order('created_at',{ascending:false}); data=r.data||[]; $('#adminContent').innerHTML=data.map(x=>`<div class="manage-row"><div><h3>${esc(x.reason)} ${statusBadge(x.status)}</h3><p>${esc(x.details||'')} • ${new Date(x.created_at).toLocaleString('tr-TR')}</p></div><div class="manage-actions"><button class="mini-btn ok" data-report-status="${x.id}|resolved">Çözüldü</button><button class="mini-btn" data-report-status="${x.id}|closed">Kapat</button></div></div>`).join('')||'<div class="empty-state">Şikayet yok</div>'; }
  if(section==='status'){
    const [msgs,allListings,allUsers,allReports]=await Promise.all([supabase.from('messages').select('*',{count:'exact',head:true}),supabase.from('listings').select('*',{count:'exact',head:true}),supabase.from('profiles').select('*',{count:'exact',head:true}),supabase.from('reports').select('*',{count:'exact',head:true})]);
    $('#adminContent').innerHTML=`<div class="admin-stats"><div class="stat-card"><b>${allUsers.count||0}</b><small>Toplam Üye</small></div><div class="stat-card"><b>${allListings.count||0}</b><small>Toplam İlan</small></div><div class="stat-card"><b>${msgs.count||0}</b><small>Mesaj</small></div><div class="stat-card"><b>${allReports.count||0}</b><small>Şikayet / Rapor</small></div></div>`;
  }
  if(section==='audit'){
    const r=await supabase.from('admin_audit_log').select('*').order('created_at',{ascending:false}).limit(100); const a=r.data||[];
    $('#adminContent').innerHTML=a.map(x=>`<div class="manage-row"><div><h3>${esc(x.action||'Yönetici işlemi')}</h3><p>${esc(x.entity_type||x.table_name||'Kayıt')} ${esc(x.entity_id||x.record_id||'')} • ${new Date(x.created_at).toLocaleString('tr-TR')}</p></div></div>`).join('')||'<div class="empty-state"><h3>Henüz yönetici kaydı yok</h3></div>';
  }
  if(section==='stats'){
    const activeListings=state.listings.filter(x=>x.status==='active'), views=activeListings.reduce((a,x)=>a+Number(x.view_count||0),0), favs=activeListings.reduce((a,x)=>a+Number(x.favorite_count||0),0);
    $('#adminContent').innerHTML=`<div class="admin-stats"><div class="stat-card"><b>${views}</b><small>Toplam Görüntülenme</small></div><div class="stat-card"><b>${favs}</b><small>Favori</small></div><div class="stat-card"><b>${activeListings.length}</b><small>Aktif İlan</small></div><div class="stat-card"><b>${state.listings.filter(x=>x.is_featured&&x.status==='active').length}</b><small>Vitrin İlanı</small></div></div>`;
  }
  const [pending,active,users,reports]=await Promise.all([supabase.from('listings').select('*',{count:'exact',head:true}).eq('status','pending'),supabase.from('listings').select('*',{count:'exact',head:true}).eq('status','active'),supabase.from('profiles').select('*',{count:'exact',head:true}),supabase.from('reports').select('*',{count:'exact',head:true}).eq('status','open')]);
  $('#adminStats').innerHTML=[['Onay Bekleyen',pending.count||0],['Yayındaki İlan',active.count||0],['Üye',users.count||0],['Açık Şikayet',reports.count||0]].map(([k,v])=>`<div class="stat-card"><b>${v}</b><small>${k}</small></div>`).join('');
}
function adminListingRow(l){ return `<div class="manage-row"><div><h3>${esc(l.title)} ${statusBadge(l.status)} ${l.is_featured?'<span class="chip gold">ÖNE ÇIKAN</span>':''}</h3><p>${esc(loc(l))} • ${esc(money(l))} • İlan No ${l.listing_no}</p></div><div class="manage-actions"><button class="mini-btn" data-open-listing="${l.id}">Görüntüle</button>${l.status==='pending'?`<button class="mini-btn ok" data-admin-status="${l.id}|active">Onayla</button><button class="mini-btn warn" data-admin-status="${l.id}|rejected">Reddet</button>`:''}<button class="mini-btn" data-feature="${l.id}|${!l.is_featured}">${l.is_featured?'Vitrinden Çıkar':'Vitrine Al'}</button></div></div>`; }
function adminUserRow(p){ const options=['user','agent','moderator','admin','owner'].map(r=>`<option value="${r}" ${p.role===r?'selected':''}>${r}</option>`).join(''); return `<div class="manage-row"><div><h3>${esc(p.full_name||'İsimsiz Üye')} ${p.is_verified?'<span class="chip gold">DOĞRULANMIŞ</span>':''}</h3><p>${esc(p.phone||'Telefon yok')} • Rol: ${esc(p.role)}</p></div><div class="manage-actions">${canManageUsers()?`<select class="mini-btn" data-role-select="${p.id}">${options}</select><button class="mini-btn" data-verify-user="${p.id}|${!p.is_verified}">${p.is_verified?'Doğrulamayı Kaldır':'Doğrula'}</button>`:''}</div></div>`; }
async function adminStatus(id,status){ const {error}=await supabase.from('listings').update({status}).eq('id',id); if(error)return toast(error.message,'err'); toast(status==='active'?'İlan yayına alındı.':'İlan reddedildi.'); await loadListings();await loadAdmin('pending'); }
async function featureListing(id,val){ const {error}=await supabase.from('listings').update({is_featured:val==='true'}).eq('id',id); if(error)return toast(error.message,'err'); toast('Vitrin durumu güncellendi.'); await loadListings();await loadAdmin('all'); }
async function changeUserRole(id,role){ if(!canManageUsers())return; const {error}=await supabase.from('profiles').update({role}).eq('id',id); if(error)return toast(error.message,'err'); toast('Kullanıcı rolü güncellendi.'); await loadAdmin('users'); }
async function verifyUser(id,val){ if(!canManageUsers())return; const {error}=await supabase.from('profiles').update({is_verified:val==='true'}).eq('id',id); if(error)return toast(error.message,'err'); toast('Doğrulama durumu güncellendi.'); await loadAdmin('users'); }
async function reportStatus(id,status){ const {error}=await supabase.from('reports').update({status}).eq('id',id); if(error)return toast(error.message,'err'); await loadAdmin('reports'); }

function nav(name){
  if(['favorites','messages','account'].includes(name)&&!state.user){return openAuth();}
  if(name==='add') return openListingForm();
  $$('.view').forEach(v=>v.classList.remove('active-view')); const id={home:'homeView',favorites:'favoritesView',messages:'messagesView',account:'accountView'}[name]||'homeView'; $('#'+id).classList.add('active-view');
  $$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
  if(name==='favorites')renderFavoriteView(); if(name==='messages')loadConversations(); if(name==='account')hydrateAccount(); window.scrollTo({top:0,behavior:'smooth'});
}
function accountTab(tab){ $$('.account-sidebar button').forEach(b=>b.classList.toggle('active',b.dataset.accountTab===tab)); $$('.account-tab').forEach(x=>x.classList.remove('active-account-tab')); $('#'+tab+'Tab').classList.add('active-account-tab'); if(tab==='admin')loadAdmin('pending'); if(tab==='notifications')loadNotifications(); }

function setupRealtime(){ state.realtime.forEach(c=>supabase.removeChannel(c)); state.realtime=[]; if(!state.user)return; const m=supabase.channel(`messages-${state.user.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{ if(state.activeConversation===payload.new.conversation_id)openConversation(state.activeConversation); loadConversations(); }).subscribe(); const n=supabase.channel(`notifications-${state.user.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${state.user.id}`},payload=>{toast(payload.new.title||'Yeni bildirim');loadNotifications();}).subscribe(); state.realtime=[m,n]; }

let deferredInstall=null;
function applyTheme(theme){
  const selected=theme==='light'?'light':'dark';
  document.documentElement.dataset.theme=selected;
  localStorage.setItem('uzman-emlak-theme',selected);
  const btn=document.getElementById('themeBtn');
  if(btn) btn.textContent=selected==='dark'?'☀️ Aydınlık':'🌙 Karanlık';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content',selected==='dark'?'#071015':'#f5f3ee');
}
function toggleTheme(){ applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light'); }
applyTheme(localStorage.getItem('uzman-emlak-theme')||'dark');
function bindUI(){
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('#installBtn').classList.remove('hidden')});
  $('#themeBtn').addEventListener('click',toggleTheme); $('#installBtn').addEventListener('click',installApp); $('#homeInstallBtn').addEventListener('click',installApp);
  if('serviceWorker'in navigator) navigator.serviceWorker.register('./sw.js?v=43').catch(console.warn);
  document.addEventListener('click',async e=>{
    const close=e.target.closest('[data-close]'); if(close){close.closest('dialog').close();return;}
    const navBtn=e.target.closest('[data-nav]'); if(navBtn){nav(navBtn.dataset.nav);return;}
    const fav=e.target.closest('[data-fav]'); if(fav){e.stopPropagation();await toggleFavorite(fav.dataset.fav);return;}
    const open=e.target.closest('[data-open-listing]'); if(open){await openListing(open.dataset.openListing);return;}
    const edit=e.target.closest('[data-edit-listing]'); if(edit){const l=state.listings.find(x=>x.id===edit.dataset.editListing)||null;openListingForm(l);return;}
    const del=e.target.closest('[data-delete-listing]'); if(del){await deleteListing(del.dataset.deleteListing);return;}
    const os=e.target.closest('[data-owner-status]'); if(os){const[id,s]=os.dataset.ownerStatus.split('|');await ownerStatus(id,s);return;}
    const as=e.target.closest('[data-admin-status]'); if(as){const[id,s]=as.dataset.adminStatus.split('|');await adminStatus(id,s);return;}
    const ft=e.target.closest('[data-feature]'); if(ft){const[id,v]=ft.dataset.feature.split('|');await featureListing(id,v);return;}
    const vu=e.target.closest('[data-verify-user]'); if(vu){const[id,v]=vu.dataset.verifyUser.split('|');await verifyUser(id,v);return;}
    const rs=e.target.closest('[data-report-status]'); if(rs){const[id,s]=rs.dataset.reportStatus.split('|');await reportStatus(id,s);return;}
    const conv=e.target.closest('[data-conversation]'); if(conv){await openConversation(conv.dataset.conversation);return;}
    const rn=e.target.closest('[data-read-notification]'); if(rn){await readNotification(rn.dataset.readNotification);return;}
    const msg=e.target.closest('[data-message-owner]'); if(msg){await startListingConversation(msg.dataset.messageOwner);return;}
    const share=e.target.closest('[data-share-listing]'); if(share){const l=state.listings.find(x=>x.id===share.dataset.shareListing); const text=`${l?.title||'Uzman Emlak'} - ${money(l||{})}`; if(navigator.share) navigator.share({title:'Uzman Emlak',text,url:location.href}); else navigator.clipboard.writeText(`${text} ${location.href}`).then(()=>toast('Bağlantı kopyalandı.')); return;}
    const at=e.target.closest('[data-account-tab]'); if(at){accountTab(at.dataset.accountTab);return;}
    const ad=e.target.closest('[data-admin-section]'); if(ad){$$('[data-admin-section]').forEach(x=>x.classList.toggle('active',x===ad));await loadAdmin(ad.dataset.adminSection);return;}
    const authTab=e.target.closest('[data-auth-tab]'); if(authTab){openAuth(authTab.dataset.authTab);return;}
    const qcat=e.target.closest('[data-cat]'); if(qcat){state.filters.category=qcat.dataset.cat;$('#categoryFilter').value=qcat.dataset.cat;renderListings();return;}
    const qdeal=e.target.closest('[data-deal-quick]'); if(qdeal){state.filters.deal=qdeal.dataset.dealQuick;$$('#dealTabs button').forEach(x=>x.classList.toggle('active',x.dataset.deal===state.filters.deal));renderListings();return;}
  });
  document.addEventListener('change',async e=>{ if(e.target.matches('[data-role-select]')) await changeUserRole(e.target.dataset.roleSelect,e.target.value); });
  $('#authBtn').onclick=()=>openAuth(); $('#userBtn').onclick=()=>nav('account'); $('#loginForm').onsubmit=login; $('#signupForm').onsubmit=signup; $('#logoutBtn').onclick=logout; $('#profileForm').onsubmit=saveProfile; $('#listingForm').onsubmit=e=>saveListing(e,'pending'); $('#saveDraftBtn').onclick=()=>saveListing(null,'draft'); $('#newListingBtn2').onclick=()=>openListingForm(); $('#floatingAddBtn').onclick=()=>openListingForm(); $('#lfCategory').onchange=toggleListingFields; $('#messageForm').onsubmit=sendMessage; $('#markAllReadBtn').onclick=markAllRead; $('#clearRecentBtn').onclick=clearRecent;
  $('#lfImages').onchange=()=>{const files=[...$('#lfImages').files].slice(0,12);$('#uploadPreview').innerHTML=files.map(f=>`<div class="upload-thumb"><img src="${URL.createObjectURL(f)}"></div>`).join('')};
  $$('#dealTabs button').forEach(b=>b.onclick=()=>{state.filters.deal=b.dataset.deal;$$('#dealTabs button').forEach(x=>x.classList.toggle('active',x===b));renderListings()});
  $('#searchBtn').onclick=()=>{state.filters.q=$('#searchInput').value.trim();renderListings()}; $('#searchInput').onkeydown=e=>{if(e.key==='Enter'){$('#searchBtn').click()}};
  $('#categoryFilter').onchange=e=>{state.filters.category=e.target.value;renderListings()}; $('#neighborhoodFilter').onchange=e=>{state.filters.neighborhood=e.target.value;renderListings()}; $('#sortFilter').onchange=e=>{state.filters.sort=e.target.value;renderListings()};
  $('#advancedFilterBtn').onclick=()=>$('#filterDialog').showModal(); $('#applyAdvancedFilter').onclick=()=>{Object.assign(state.filters,{minPrice:$('#fMinPrice').value,maxPrice:$('#fMaxPrice').value,minM2:$('#fMinM2').value,maxM2:$('#fMaxM2').value,rooms:$('#fRooms').value.trim(),heating:$('#fHeating').value.trim(),ada:$('#fAda').value.trim(),parsel:$('#fParsel').value.trim()});$('#filterDialog').close();renderListings()};
  $('#clearFiltersBtn').onclick=()=>{state.filters={deal:'all',category:'all',neighborhood:'all',q:'',sort:'new',minPrice:'',maxPrice:'',minM2:'',maxM2:'',rooms:'',heating:'',ada:'',parsel:''};$('#searchInput').value='';$('#categoryFilter').value='all';$('#neighborhoodFilter').value='all';$('#sortFilter').value='new';$$('#dealTabs button').forEach(x=>x.classList.toggle('active',x.dataset.deal==='all'));renderListings()};
  $$('.brand').forEach(b=>b.onclick=()=>nav('home'));
}

init().catch(err=>{console.error(err);toast('Uygulama başlatılamadı.','err')});
