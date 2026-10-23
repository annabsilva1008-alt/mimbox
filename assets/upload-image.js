/* Shared by the existing CRM gallery and the existing site crop editor. No network access. */
(function (global) {
 'use strict';
 const TYPES=new Set(['image/jpeg','image/png','image/webp']);
 const MAX_FILE_BYTES=20*1024*1024;
 const PROFILES={product:{maxEdge:1800,targetBytes:450*1024,maxBytes:950*1024},banner:{maxEdge:1800,targetBytes:550*1024,maxBytes:950*1024}};
 const qualitySteps=[.92,.89,.86];
 function profile(options={}){return PROFILES[options.profile||'product']||PROFILES.product}
 function assertFile(file){if(!file||!TYPES.has(file.type)||!file.size)throw Error('Selecione uma imagem JPG, PNG ou WebP.');if(file.size>MAX_FILE_BYTES)throw Error('A foto deve ter até 20 MB antes do ajuste.');}
 function dimensions(width,height,limit){const scale=Math.min(1,limit/Math.max(width,height));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))}}
 function encode(canvas,quality){return new Promise((resolve,reject)=>{canvas.toBlob(blob=>{if(!blob||blob.type!=='image/webp')reject(Error('Este navegador não conseguiu preparar WebP. Atualize o navegador e tente novamente.'));else resolve(blob)},'image/webp',quality)})}
 async function render(source,rect,options={}){
  const config=profile(options),longEdge=Math.max(rect.width,rect.height);
  if(!Number.isFinite(longEdge)||rect.width<=0||rect.height<=0)throw Error('As dimensões da foto são inválidas.');
  const first=Math.min(config.maxEdge,longEdge);const edges=[...new Set([first,1600,1400,1200].filter(n=>n<=first&&n>0))];let fallback=null;
  for(const edge of edges){
   const size=dimensions(rect.width,rect.height,edge),canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
   const context=canvas.getContext('2d',{alpha:true});if(!context)throw Error('Não foi possível preparar a foto neste navegador.');
   context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,size.width,size.height);
   for(const quality of qualitySteps){
    const blob=await encode(canvas,quality);const result={blob,...size,quality,originalBytes:options.originalBytes||0,optimized:true};
    if(blob.size<=config.targetBytes)return result;
    if(blob.size<=config.maxBytes&&!fallback)fallback=result;
   }
   canvas.width=1;canvas.height=1;
  }
  if(fallback)return fallback;
  throw Error('A foto ainda ficou pesada. Escolha outra imagem ou um recorte mais próximo. O arquivo não foi enviado.');
 }
 async function fromFile(file,options={}){
  assertFile(file);if(typeof createImageBitmap!=='function')throw Error('Atualize o navegador para preparar a foto automaticamente.');
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  try{
   const config=profile(options);
   if(Math.max(bitmap.width,bitmap.height)<=config.maxEdge&&file.size<=config.targetBytes)return {blob:file,width:bitmap.width,height:bitmap.height,quality:null,originalBytes:file.size,optimized:false};
   return await render(bitmap,{x:0,y:0,width:bitmap.width,height:bitmap.height},{...options,originalBytes:file.size});
  }finally{bitmap.close?.()}
 }
 async function fromCrop(source,rect,options={}){return render(source,{x:rect.x??0,y:rect.y??0,width:rect.width,height:rect.height},{...options,profile:'banner'})}
 function toBase64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(Error('Não foi possível ler a foto preparada.'));reader.readAsDataURL(blob)})}
 function describe(result){const kb=Math.round(result.blob.size/1024);const saved=result.originalBytes?Math.max(0,Math.round((1-result.blob.size/result.originalBytes)*100)):0;return result.width+' × '+result.height+' px · '+kb+' KB'+(saved?' · '+saved+'% mais leve':' · nitidez preservada')}
 global.MimboxUpload=Object.freeze({fromFile,fromCrop,toBase64,describe,dimensions,assertFile,MAX_FILE_BYTES});
})(window);
