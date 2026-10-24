import {cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
// Install the local WASM runtime and prepare the default gesture model.
await mkdir('public/vendor',{recursive:true});
await cp(path.join('node_modules','@mediapipe','tasks-vision','wasm'),'public/vendor/vision',{recursive:true});
console.log('Installed MediaPipe WASM runtime copied locally.');
const {ensureFaceModel}=await import('./fetch-face-model.mjs');
try{await ensureFaceModel();}catch(error){console.warn(`Hands-free model not ready: ${error.message} Run npm run fetch:face-model when online.`);}
