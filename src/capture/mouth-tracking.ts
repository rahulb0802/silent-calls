import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
export function useMouthTracking(enabled:boolean,modelBuffer:Uint8Array|null) {
  const model=useRef<FaceLandmarker|null>(null);
  const last=useRef(0), previous=useRef(0), smoothed=useRef(0);
  const [tracking,setTracking]=useState({level:0,coaching:'Enable your camera for mouth tracking.',available:false});
  useEffect(()=>{
    let disposed=false;previous.current=0;smoothed.current=0;last.current=0;
    if(!enabled){setTracking({level:0,coaching:'Camera is off.',available:false});return;}
    if(!modelBuffer){setTracking({level:0,coaching:'Choose a local MediaPipe face landmark model to enable mouth tracking.',available:false});return;}
    setTracking({level:0,coaching:'Loading mouth tracking…',available:false});
    void (async()=>{
      try{
        const {FaceLandmarker,FilesetResolver}=await import('@mediapipe/tasks-vision');
        const base=new URL(import.meta.env.BASE_URL,location.href);
        const vision=await FilesetResolver.forVisionTasks(new URL('vendor/vision',base).href);
        const tracker=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetBuffer:modelBuffer,delegate:'CPU'},runningMode:'VIDEO',numFaces:1});
        if(disposed){tracker.close();return;}
        model.current=tracker;setTracking({level:0,coaching:'Center your face in the camera.',available:true});
      }catch{if(!disposed)setTracking({level:0,coaching:'Mouth tracking unavailable. Run npm run prepare:assets; camera capture still works.',available:false});}
    })();
    return ()=>{disposed=true;model.current?.close();model.current=null;};
  },[enabled,modelBuffer]);
  const sample=useCallback((video:HTMLVideoElement,now:number)=>{
    // Five landmark passes per second keep the meter independent of the 25fps capture target.
    if(!model.current || now-last.current<200)return;
    last.current=now;
    try{
      const face=model.current.detectForVideo(video,now).faceLandmarks[0];
      if(!face){previous.current=0;smoothed.current=0;setTracking({level:0,coaching:'No face found. Face the camera in good light.',available:true});return;}
      const distance=(a:number,b:number)=>Math.hypot(face[a].x-face[b].x,face[a].y-face[b].y);
      const opening=distance(13,14)/Math.max(.001,distance(78,308));
      const movement=Math.min(1,Math.abs(opening-previous.current)*12);
      smoothed.current=.55*smoothed.current+.45*movement;previous.current=opening;
      const height=distance(10,152),nose=face[1];
      const coaching=height<.25?'Move a little closer.':height>.85?'Move a little farther back.':nose.x<.25 || nose.x>.75 || nose.y<.2 || nose.y>.8?'Center your face in the frame.':'Face in view. Mouth naturally; no whispering needed.';
      setTracking({level:Math.round(smoothed.current*100),coaching,available:true});
    }catch{setTracking({level:0,coaching:'Mouth tracking paused. Camera capture is still available.',available:false});}
  },[]);
  return {...tracking,sample};
}
