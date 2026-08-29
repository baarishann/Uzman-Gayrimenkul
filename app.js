const DEFAULTS = [
  {id:1,title:"Önerler'de Yatırımlık Arsa",type:"Arsa",location:"Çorlu / Önerler",price:"11.500.000 TL",m2:"1.001",ada:"334",parsel:"15",description:"Yatırım ve proje için değerlendirilebilecek örnek ilan.",image:""},
  {id:2,title:"Projeden Satılık 1+1 Daire",type:"Daire",location:"Çorlu",price:"2.750.000 TL",m2:"45",ada:"",parsel:"",description:"Asansörlü, açık otoparklı, iskanlı örnek daire ilanı.",image:""},
  {id:3,title:"Kat Karşılığı Arsa Fırsatı",type:"Kat Karşılığı",location:"Çorlu / Önerler",price:"Görüşülür",m2:"537",ada:"320",parsel:"3",description:"Müteahhit ve yatırımcılara uygun örnek portföy.",image:""}
];
const KEY="ug_listings_v1";
const getData=()=>JSON.parse(localStorage.getItem(KEY)||"null")||DEFAULTS;
const setData=(x)=>localStorage.setItem(KEY,JSON.stringify(x));
let listings=getData();

const grid=document.querySelector("#listingGrid"), count=document.querySelector("#listingCount"), empty=document.querySelector("#emptyState");
const search=document.querySelector("#searchInput"), filter=document.querySelector("#typeFilter");

function emoji(type){return type==="Arsa"?"🌄":type==="Daire"?"🏢":type==="Kiralık"?"🔑":"🏗️"}
function card(l){
  return `<article class="card" data-id="${l.id}">
    <div class="cardImg">${l.image?`<img src="${l.image}" alt="">`:emoji(l.type)}</div>
    <div class="cardBody"><span class="tag">${l.type}</span><h3>${l.title}</h3><div class="location">📍 ${l.location}</div>
    <div class="price">${l.price}</div><div class="specs">${l.m2?`<span class="spec">${l.m2} m²</span>`:""}${l.ada?`<span class="spec">Ada ${l.ada}</span>`:""}${l.parsel?`<span class="spec">Parsel ${l.parsel}</span>`:""}</div></div>
  </article>`
}
function render(){
  const q=search.value.toLowerCase().trim(), t=filter.value;
  const rows=listings.filter(l=>(!t||l.type===t) && [l.title,l.location,l.ada,l.parsel,l.description].join(" ").toLowerCase().includes(q));
  grid.innerHTML=rows.map(card).join(""); count.textContent=listings.length; empty.classList.toggle("hidden",rows.length>0);
  document.querySelectorAll(".card").forEach(c=>c.onclick=()=>showDetail(Number(c.dataset.id)));
  renderAdmin();
}
function showDetail(id){
  const l=listings.find(x=>x.id===id); if(!l)return;
  document.querySelector("#detailContent").innerHTML=`
    <div class="detailHero">${l.image?`<img src="${l.image}" alt="">`:emoji(l.type)}</div>
    <span class="tag" style="margin-top:14px">${l.type}</span><h2>${l.title}</h2><p class="location">📍 ${l.location}</p>
    <div class="detailPrice">${l.price}</div>
    <div class="detailGrid">${l.m2?`<div><small>Alan</small><b>${l.m2} m²</b></div>`:""}${l.ada?`<div><small>Ada</small><b>${l.ada}</b></div>`:""}${l.parsel?`<div><small>Parsel</small><b>${l.parsel}</b></div>`:""}</div>
    <p>${l.description||"Detaylı bilgi için iletişime geçebilirsiniz."}</p>
    <div class="detailActions"><a class="actionCard" href="tel:+905061347675">📞 Ara</a><a class="actionCard" target="_blank" rel="noopener" href="https://wa.me/905061347675?text=${encodeURIComponent(l.title+' ilanı hakkında bilgi almak istiyorum.')}">💬 WhatsApp</a></div>`;
  detailDialog.showModal();
}
function renderAdmin(){
  const el=document.querySelector("#adminList");

  el.innerHTML=listings.map(l=>`
    <div class="adminItem">
      <div>
        <b>${l.title}</b>
        <div class="muted">${l.location} • ${l.price}</div>
      </div>
      <div>
        <button data-edit="${l.id}">✏️ Düzenle</button>
        <button class="danger" data-del="${l.id}">🗑️ Sil</button>
      </div>
    </div>
  `).join("");

  el.querySelectorAll("[data-del]").forEach(b=>{
    b.onclick=()=>{
      if(confirm("Bu ilan silinsin mi?")){
        listings=listings.filter(x=>x.id!==Number(b.dataset.del));
        setData(listings);
        render();
      }
    };
  });

  el.querySelectorAll("[data-edit]").forEach(b=>{
    b.onclick=()=>{
      const l=listings.find(x=>x.id===Number(b.dataset.edit));
      if(!l)return;

      const yeniBaslik=prompt("İlan başlığı:",l.title);
      if(yeniBaslik===null)return;

      const yeniFiyat=prompt("Fiyat:",l.price);
      if(yeniFiyat===null)return;

      const yeniKonum=prompt("Konum:",l.location);
      if(yeniKonum===null)return;

      l.title=yeniBaslik;
      l.price=yeniFiyat;
      l.location=yeniKonum;

      setData(listings);
      render();
    };
  });
    }
}
search.oninput=render; filter.onchange=render;
document.querySelector("#navListings").onclick=()=>grid.scrollIntoView({behavior:"smooth"});
document.querySelector("[data-scroll=top]").onclick=()=>scrollTo({top:0,behavior:"smooth"});
document.querySelector("#openSellForm").onclick=()=>sellDialog.showModal();
const adminLogin=document.querySelector("#adminLogin");
const adminPassword=document.querySelector("#adminPassword");
const adminError=document.querySelector("#adminError");

document.querySelector("#openAdmin").onclick=()=>{
  adminPassword.value="";
  adminError.textContent="";
  adminLogin.classList.add("show");
  adminPassword.focus();
};

document.querySelector("#adminLoginBtn").onclick=()=>{
  if(adminPassword.value==="081008"){
    adminLogin.classList.remove("show");
    adminDialog.showModal();
  }else{
    adminError.textContent="Şifre hatalı!";
    adminPassword.value="";
  }
};

document.querySelector("#adminCancelBtn").onclick=()=>{
  adminLogin.classList.remove("show");
};

adminPassword.addEventListener("keydown",e=>{
  if(e.key==="Enter"){
    document.querySelector("#adminLoginBtn").click();
  }
});
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.querySelector("#"+b.dataset.close).close());

document.querySelector("#sellForm").onsubmit=e=>{
  e.preventDefault(); const d=Object.fromEntries(new FormData(e.target));
  const msg=`Merhaba, gayrimenkulümü değerlendirmek istiyorum.%0A%0AAd Soyad: ${encodeURIComponent(d.name)}%0ATelefon: ${encodeURIComponent(d.phone)}%0ATür: ${encodeURIComponent(d.type)}%0AKonum: ${encodeURIComponent(d.location)}%0ABilgi: ${encodeURIComponent(d.note||"-")}`;
  window.open("https://wa.me/905061347675?text="+msg,"_blank");
}
} document.querySelector("#adminForm").onsubmit=e=>{
  e.preventDefault();

  const d=Object.fromEntries(new FormData(e.target));

  listings.unshift({
    id:Date.now(),
    title:d.title,
    type:d.type,
    status:d.status||"Aktif",
    location:d.location,
    price:d.price,
    m2:d.m2,
    ada:d.ada,
    parsel:d.parsel,
    image:d.image,
    description:d.description
  });

  setData(listings);
  e.target.reset();
  render();

  alert("İlan başarıyla eklendi.");
};
let deferredPrompt;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;installBtn.classList.remove("hidden")});
installBtn.onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.classList.add("hidden")}
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
render();
