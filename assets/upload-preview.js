(function(){
 'use strict';const fileInput=document.getElementById('upload-file'),profile=document.getElementById('upload-profile'),status=document.getElementById('upload-status'),result=document.getElementById('upload-result');let chosen=null,version=0,urls=[];
 const mb=size=>size>=1024*1024?(size/1024/1024).toFixed(2)+' MB':Math.round(size/1024)+' KB';
 async function prepare(){const file=chosen;if(!file)return;const job=++version;result.hidden=true;status.textContent='Preparando a foto...';fileInput.disabled=true;
  try{const prepared=await MimboxUpload.fromFile(file,{profile:profile.value});if(job!==version)return;urls.forEach(URL.revokeObjectURL);urls=[URL.createObjectURL(file),URL.createObjectURL(prepared.blob)];document.getElementById('upload-before').src=urls[0];document.getElementById('upload-after').src=urls[1];document.getElementById('upload-before-size').textContent=mb(file.size);document.getElementById('upload-after-size').textContent=MimboxUpload.describe(prepared);const download=document.getElementById('upload-download');download.href=urls[1];download.download=file.name.replace(/\.[^.]+$/,'')+'-preparada.'+({'image/webp':'webp','image/jpeg':'jpg','image/png':'png'}[prepared.blob.type]||'webp');result.hidden=false;status.textContent='Foto preparada. Confira os detalhes nas duas imagens.';
  }catch(error){if(job===version)status.textContent=error.message||'Não foi possível preparar essa foto.'}finally{if(job===version)fileInput.disabled=false}
 }
 fileInput.addEventListener('change',()=>{chosen=fileInput.files?.[0];prepare()});profile.addEventListener('change',prepare);window.addEventListener('beforeunload',()=>urls.forEach(URL.revokeObjectURL));
})();
