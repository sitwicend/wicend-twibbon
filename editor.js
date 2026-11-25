const removalModule='https://esm.sh/@imgly/background-removal@1.7.0?bundle&deps=onnxruntime-web@1.21.0-dev.20250206-d981b153d3';
const removalAssets='https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/';

function sampleImage(image,limit){
 const sample=document.createElement('canvas');
 const s=Math.min(1,limit/Math.max(image.naturalWidth,image.naturalHeight));
 sample.width=Math.max(1,Math.round(image.naturalWidth*s));
 sample.height=Math.max(1,Math.round(image.naturalHeight*s));
 const g=sample.getContext('2d',{willReadFrequently:true});
 g.drawImage(image,0,0,sample.width,sample.height);
 return g.getImageData(0,0,sample.width,sample.height);
}

function frameOpening(image){
 try{
  const {data,width:w,height:h}=sampleImage(image,192), seen=new Uint8Array(w*h), queue=new Int32Array(w*h);
  let best=null,largest=0;
  for(let i=0;i<seen.length;i++){
   if(seen[i]||data[i*4+3]>32)continue;
   let count=0,minX=w,minY=h,maxX=0,maxY=0,edge=false,central=false;
   const add=j=>{if(!seen[j]&&data[j*4+3]<=32){seen[j]=1;queue[count++]=j;}};
   add(i);
   for(let k=0;k<count;k++){
    const j=queue[k],u=j%w,v=(j/w)|0;
    minX=Math.min(minX,u);maxX=Math.max(maxX,u);minY=Math.min(minY,v);maxY=Math.max(maxY,v);
    if(u===0||u===w-1||v===0||v===h-1)edge=true;
    if(Math.abs((u+.5)/w-.5)<.25&&Math.abs((v+.5)/h-.5)<.25)central=true;
    if(u>0)add(j-1);if(u<w-1)add(j+1);if(v>0)add(j-w);if(v<h-1)add(j+w);
   }
   if(!edge&&central&&count>Math.max(largest,w*h*.015)){
    largest=count;
    best={x:(minX+maxX+1)/(2*w),y:(minY+maxY+1)/(2*h),w:Math.min(1,(maxX-minX+3)/w),h:Math.min(1,(maxY-minY+3)/h)};
   }
  }
  return best;
 }catch{return null;}
}

export async function editor(app,slug,{api,esc,toast,copy}){
 const endpoint='/api/campaigns/'+encodeURIComponent(slug), c=await api(endpoint), url=new URL('#/c/'+encodeURIComponent(slug),location.href.split(/[?#]/)[0]).href;
 document.title=c.title+' — wicend-twibbon';
 const visitKey='view:'+slug;let viewed=false;try{viewed=!!sessionStorage.getItem(visitKey);}catch{}if(!viewed && c.published)api(endpoint+'/view',{method:'POST'}).then(()=>{try{sessionStorage.setItem(visitKey,'1');}catch{}}).catch(()=>{});
 const settings=[['zoom','Zoom',0.5,4,0.01,1],['rotate','Putar',-180,180,1,0],['brightness','Kecerahan',40,180,1,100],['contrast','Kontras',40,180,1,100]];
 app.innerHTML=`<section class="wrap editpage"><a class="back" href="#/jelajah">← Kembali ke jelajah</a><div class="edithead"><span class="pill ${esc(c.theme)}">${esc(c.category)}</span><h1>${esc(c.title)}</h1><p>${esc(c.description)}</p><small>Oleh ${esc(c.ownerName||'wicend-twibbon')}</small></div><div class="editgrid"><div class="stage"><canvas width="720" height="720" tabindex="0" aria-label="Pratinjau. Gunakan tombol panah untuk menggeser foto."></canvas><p>↔ Geser foto langsung pada pratinjau</p></div><div class="editpanel"><h2>Pasang fotomu</h2><p>Foto diproses di perangkatmu, bukan diunggah ke server.</p><div class="uploads"><label class="btn primary">↑ Pilih Foto<input type="file" id="photo" accept="image/jpeg,image/png,image/webp"></label><label class="btn outline">Kamera<input type="file" id="camera" accept="image/jpeg,image/png,image/webp" capture="user"></label></div><p id="photo-status" role="status" class="file-status">JPG, PNG, atau WebP · Maks. 20 MB</p><h3>Pilihan bingkai</h3><div class="reel">${c.frames.map((f,i)=>`<button type="button" data-frame="${i}" aria-label="Bingkai ${i+1}" aria-pressed="${i===0}"><img src="${esc(f)}" alt=""></button>`).join('')}</div><fieldset id="adjust" disabled><legend>Sesuaikan foto</legend><div class="ranges">${settings.map(([k,l,min,max,step,val])=>`<label>${l}<output for="${k}">${val}</output><input id="${k}" type="range" min="${min}" max="${max}" step="${step}" value="${val}"></label>`).join('')}</div><div class="edittools"><label>Filter <select id="filter"><option value="none">Asli</option><option value="grayscale(1)">Hitam Putih</option><option value="sepia(.55)">Hangat</option><option value="saturate(1.45)">Cerah</option></select></label><button type="button" id="reset" class="btn outline sm">Reset</button></div></fieldset><div class="editactions"><button id="download" class="btn primary" disabled>↓ Unduh PNG HD</button><button id="share-file" class="btn outline" disabled>Bagikan hasil</button></div></div></div><div class="sharepanel"><h2>Sebarkan kampanye</h2><p class="caption">${esc(c.caption||'Ajak temanmu memasang bingkai ini!')}</p><div class="actions" id="sharelinks"><button class="btn outline sm" data-copy="link">Salin tautan</button><button class="btn outline sm" data-copy="caption" ${c.caption?'':'disabled'}>Salin caption</button></div><p class="sharetip">Untuk Instagram dan TikTok, simpan gambar lalu unggah dari aplikasi, atau gunakan menu Bagikan hasil jika didukung.</p></div></section>`;
 const ratios=[[1,1],[4,5],[9,16],[16,9],[3,2],[2,3]];
 app.querySelector('.reel').insertAdjacentHTML('afterend',`<div class="editratio"><label for="ratio">Rasio hasil</label><select id="ratio" aria-describedby="ratio-help"><option value="native">Rasio asli bingkai</option>${ratios.map(([w,h],i)=>`<option value="${i}">${w}:${h}</option>`).join('')}</select><p id="ratio-help">Jika rasio berbeda, bingkai tetap utuh tanpa diregangkan. Ruang di luar bingkai transparan pada PNG. Rasio asli bisa dibulatkan ke piksel terdekat agar sisi terpanjang tetap 1200–2400 px.</p></div>`);
 app.querySelector('.edittools').insertAdjacentHTML('afterend',`<div class="edittools edit-auto"><button type="button" id="auto-fit" class="btn outline sm">Pas ke bukaan</button><button type="button" id="auto-tone" class="btn outline sm">Perbaiki cahaya</button><button type="button" id="undo-tone" class="btn outline sm" disabled>Urungkan cahaya</button></div><section class="edit-cutout" aria-labelledby="cutout-title"><h3 id="cutout-title">Latar foto</h3><p id="cutout-help">Saat pertama dipakai, browser mengunduh model dan mesin pemrosesan sekitar 56 MB dari CDN. Gunakan Wi-Fi bila perlu. Proses bisa lama dan boros memori, terutama di ponsel. Foto diproses di browser dan tidak dikirim ke CDN atau server.</p><div class="edittools"><button type="button" id="cutout" class="btn outline sm" aria-describedby="cutout-help">Hapus latar</button><button type="button" id="restore-photo" class="btn outline sm" disabled>Kembalikan foto asli</button></div><p id="cutout-status" class="cutout-status" role="status"></p></section>`);
 const $=s=>app.querySelector(s), canvas=$('canvas'), ctx=canvas.getContext('2d');
 let photo=null,original=null,frame=null,opening=null,fit=true,toneUndo=null,busy=false,loadingPhoto=false;
 let x=0,y=0,frameSeq=0,photoSeq=0,drag=null,queued=false;
 const active=()=>canvas.isConnected&&app.contains(canvas);
 const status=text=>{$('#cutout-status').textContent=text;};
 const bitmap=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Gambar tidak dapat dibaca.'));if(src.startsWith("https:")) im.crossOrigin="anonymous";im.src=src;});
 const v=k=>Number($('#'+k).value);
 const gcd=(a,b)=>b?gcd(b,a%b):a;
 function dimensions(){
  const min=1200,max=2400,target=Math.max(frame?.naturalWidth||min,frame?.naturalHeight||min);
  let fw=frame?.naturalWidth||1,fh=frame?.naturalHeight||1;
  if($('#ratio').value!=='native')[fw,fh]=ratios[$('#ratio').value];
  const d=gcd(fw,fh),w=fw/d,h=fh/d,long=Math.max(w,h);
  const low=Math.ceil(min/long),high=Math.floor(max/long);
  if(high>=low){const k=Math.min(high,Math.max(low,Math.round(target/long)));return [w*k,h*k];}
  // Some native ratios cannot fit exactly in the allowed integer pixel dimensions.
  return [Math.max(1,Math.round(max*w/long)),Math.max(1,Math.round(max*h/long))];
 }
 function paint(g,width,height,preview){
  g.clearRect(0,0,width,height);
  const scale=frame?Math.min(width/frame.naturalWidth,height/frame.naturalHeight):1;
  const fw=frame?frame.naturalWidth*scale:width,fh=frame?frame.naturalHeight*scale:height;
  const left=(width-fw)/2,top=(height-fh)/2;
  if(photo){const o=fit&&opening?opening:{x:.5,y:.5,w:1,h:1};const ratio=Math.max(fw*o.w/photo.naturalWidth,fh*o.h/photo.naturalHeight)*v('zoom'),w=photo.naturalWidth*ratio,h=photo.naturalHeight*ratio;g.save();g.beginPath();g.rect(left,top,fw,fh);g.clip();g.translate(left+fw*o.x+width*x,top+fh*o.y+height*y);g.rotate(v('rotate')*Math.PI/180);g.filter=`brightness(${v('brightness')}%) contrast(${v('contrast')}%) ${$('#filter').value==='none'?'':$('#filter').value}`.trim();g.drawImage(photo,-w/2,-h/2,w,h);g.restore();}
  else if(preview){g.fillStyle='#42675e';g.textAlign='center';g.font=`650 ${Math.min(width,height)*.029}px system-ui`;g.fillText('Tempat fotomu',width/2,height/2);}
  if(frame)g.drawImage(frame,left,top,fw,fh);
 }
 const render=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(!active())return;const [w,h]=dimensions(),s=Math.min(1,900/Math.max(w,h));const pw=Math.max(1,Math.round(w*s)),ph=Math.max(1,Math.round(h*s));if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;ctx.setTransform(pw/w,0,0,ph/h,0,0);paint(ctx,w,h,true);});};
 $('#ratio').addEventListener('change',render);
 const toggle=()=>{
  const locked=busy||loadingPhoto;
  $('#adjust').disabled=!photo||locked;
  $('#download').disabled=$('#share-file').disabled=locked||!(photo&&frame);
  $('#auto-fit').disabled=!frame;
  $('#undo-tone').disabled=!toneUndo;
  $('#cutout').disabled=locked||!original||photo!==original;
  $('#restore-photo').disabled=locked||!original||photo===original;
 };
 async function selectFrame(i){const seq=++frameSeq;frame=opening=null;toggle();app.querySelectorAll('[data-frame]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.frame)===i));render();try{const im=await bitmap(c.frames[i]);if(active()&&seq===frameSeq){frame=im;opening=frameOpening(im);toggle();render();}}catch(e){if(active()&&seq===frameSeq)toast(e.message);}}
 function setRange(k,val){$('#'+k).value=val;$( `output[for="${k}"]`).textContent=$('#'+k).value;}
 function reset(auto=false){fit=auto;x=y=0;toneUndo=null;for(const [k,,,,val] of settings)setRange(k,val);$('#filter').value='none';toggle();render();}
 async function decodeBlob(blob){const src=URL.createObjectURL(blob);try{return await bitmap(src);}finally{URL.revokeObjectURL(src);}}
 async function upload(file){
  if(!file)return;
  if(!(/\.(jpe?g|png|webp)$/i.test(file.name)||/^image\/(jpeg|png|webp)$/.test(file.type))||file.size>20*1024*1024){toast('Gunakan JPG, PNG, atau WebP maksimal 20 MB.');return;}
  const seq=++photoSeq;
  loadingPhoto=true;drag=null;status(busy?'Hasil proses lama akan diabaikan.':'');toggle();
  try{const im=await decodeBlob(file);if(active()&&seq===photoSeq){original=photo=im;$('#photo-status').textContent=file.name;reset(true);}}
  catch(e){if(active()&&seq===photoSeq)toast(e.message);}
  finally{if(active()&&seq===photoSeq){loadingPhoto=false;toggle();}}
 }
 $('#auto-fit').onclick=()=>{fit=true;x=y=0;setRange('zoom',1);setRange('rotate',0);render();if(!opening)toast('Bukaan tidak terdeteksi; foto dipaskan ke seluruh bingkai.');};
 $('#auto-tone').onclick=()=>{
  try{
   const {data}=sampleImage(photo,96);
   let n=0,sum=0,squares=0;
   for(let i=0;i<data.length;i+=4){if(data[i+3]<192)continue;const y=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];n++;sum+=y;squares+=y*y;}
   if(n<16)throw new Error();
   const mean=sum/n,spread=Math.sqrt(Math.max(0,squares/n-mean*mean));
   if(!toneUndo)toneUndo=[v('brightness'),v('contrast')];
   setRange('brightness',Math.round(100+Math.max(-8,Math.min(12,(128-mean)*.23))));
   setRange('contrast',Math.round(100+Math.max(-4,Math.min(8,(48-spread)*.22))));
   toggle();render();
  }catch{toast('Cahaya foto tidak dapat dianalisis.');}
 };
 $('#undo-tone').onclick=()=>{if(!toneUndo)return;setRange('brightness',toneUndo[0]);setRange('contrast',toneUndo[1]);toneUndo=null;toggle();render();};
 $('#restore-photo').onclick=()=>{photo=original;status('Foto asli dipulihkan.');toggle();render();};
 $('#cutout').onclick=async()=>{
  if(busy||loadingPhoto||!original||photo!==original)return;
  const seq=photoSeq, source=original, current=()=>active()&&seq===photoSeq;
  busy=true;drag=null;toggle();status('Memuat alat dan model penghapus latar…');
  try{
   if(typeof WebAssembly==='undefined')throw new Error('WebAssembly unavailable');
   const {removeBackground}=await import(removalModule);
   if(!current())return;
   const {data,width,height}=sampleImage(source,2400);
   const input=new Blob([data],{type:`image/x-rgba8;width=${width};height=${height}`});
   const result=await removeBackground(input,{
    publicPath:removalAssets,model:'isnet_quint8',device:'cpu',output:{format:'image/png'},
    progress:key=>{if(current()&&key.startsWith('compute:'))status('Memproses foto di perangkatmu…');}
   });
   if(!current())return;
   const im=await decodeBlob(result);
   if(current()){photo=im;status('Latar dihapus. Kamu bisa mengembalikan foto asli.');render();}
  }catch{if(current())status('Latar gagal dihapus. Cek koneksi, coba browser terbaru atau foto lebih kecil. Foto asli tetap tersedia.');}
  finally{busy=false;if(active()){if(!current())status('');toggle();}}
 };
 for(const id of ['photo','camera'])$('#'+id).addEventListener('change',e=>{upload(e.target.files[0]);e.target.value='';});
 canvas.addEventListener('dragover',e=>e.preventDefault());canvas.addEventListener('drop',e=>{e.preventDefault();upload(e.dataTransfer.files[0]);});
 canvas.addEventListener('pointerdown',e=>{if(!photo||busy||loadingPhoto||drag)return;canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY};});
 canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;const {width,height}=canvas.getBoundingClientRect();if(!width||!height)return;x+=(e.clientX-drag.x)/width;y+=(e.clientY-drag.y)/height;drag.x=e.clientX;drag.y=e.clientY;render();});
 canvas.addEventListener('lostpointercapture',()=>{drag=null;});
 canvas.addEventListener('keydown',e=>{const dirs={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};if(!photo||busy||loadingPhoto||!dirs[e.key])return;e.preventDefault();const [dx,dy]=dirs[e.key],s=e.shiftKey?.05:.01;x+=dx*s;y+=dy*s;render();});
 $('#adjust').addEventListener('input',e=>{const out=$( `output[for="${e.target.id}"]`);if(out)out.textContent=e.target.value;render();});$('#reset').onclick=()=>reset();$('.reel').onclick=e=>{const b=e.target.closest('[data-frame]');if(b)selectFrame(Number(b.dataset.frame));};
 for(const [name,target] of [['WhatsApp','https://wa.me/?text='+encodeURIComponent([c.caption,url].filter(Boolean).join('\n'))],['Facebook','https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url)],['X','https://x.com/intent/tweet?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(c.caption||c.title)],['Instagram','https://www.instagram.com/'],['TikTok','https://www.tiktok.com/']]){const a=document.createElement('a');a.className='btn outline sm';a.href=target;a.target='_blank';a.rel='noopener noreferrer';a.textContent=name+' ↗';$('#sharelinks').append(a);}
 $('#sharelinks').addEventListener('click',e=>{if(e.target.dataset.copy)copy(e.target.dataset.copy==='link'?url:c.caption);});
 const name=`${slug}-twibbon.png`;
 const exportBlob=()=>{const out=document.createElement('canvas');const [w,h]=dimensions();out.width=w;out.height=h;paint(out.getContext('2d'),w,h,false);return new Promise((resolve,reject)=>out.toBlob(blob=>blob?resolve(blob):reject(new Error('Tidak dapat membuat PNG.')),'image/png'));};
 $('#download').onclick=async()=>{try{const b=await exportBlob();const link=document.createElement('a');link.href=URL.createObjectURL(b);link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),30000);api(endpoint+'/download',{method:'POST',keepalive:true}).catch(()=>{});toast('PNG siap diunduh.');}catch(e){toast(e.message);}};
 $('#share-file').onclick=async()=>{try{const f=new File([await exportBlob()],name,{type:'image/png'});if(navigator.canShare?.({files:[f]})&&navigator.share){await navigator.share({files:[f],title:c.title});api(endpoint+'/download',{method:'POST'}).catch(()=>{});}else toast('Browser ini tidak mendukung bagikan file. Unduh PNG lalu unggah dari aplikasi tujuan.');}catch(e){if(e.name!=='AbortError')toast('Bagikan belum berhasil. Unduh PNG lalu unggah dari aplikasi tujuan.');}};
 selectFrame(0);
}
