import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { headPose, mouthMovement, type FaceSample } from './hands-free';
export function useMouthTracking(enabled:boolean,modelBuffer:Uint8Array|null,onSample?:(sample:FaceSample)=>void) {
  const model=useRef<FaceLandmarker|null>(null);
  const last=useRef(0), previous=useRef(0), smoothed=useRef(0), shapes=useRef<Record<string,number>|null>(null), lastMeter=useRef(0);
  const listener=useRef(onSample);listener.current=onSample;
  const [tracking,setTracking]=useState({level:0,coaching:'Enable your camera for mouth tracking.',available:false});
  useEffect(()=>{
    let disposed=false;previous.current=0;smoothed.current=0;last.current=0;shapes.current=null;
    if(!enabled){setTracking({level:0,coaching:'Camera is off.',available:false});return;}
    if(!modelBuffer){setTracking({level:0,coaching:'Choose a local MediaPipe face landmark model to enable mouth tracking.',available:false});return;}
    setTracking({level:0,coaching:'Loading mouth tracking…',available:false});
    void (async()=>{
      try{
        const {FaceLandmarker,FilesetResolver}=await import('@mediapipe/tasks-vision');
        const base=new URL(import.meta.env.BASE_URL,location.href);
        const vision=await FilesetResolver.forVisionTasks(new URL('vendor/vision',base).href);
        const tracker=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetBuffer:modelBuffer,delegate:'CPU'},runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true});
        if(disposed){tracker.close();return;}
        model.current=tracker;setTracking({level:0,coaching:'Center your face in the camera.',available:true});
      }catch{if(!disposed)setTracking({level:0,coaching:'Mouth tracking unavailable. Run npm run prepare:assets; camera capture still works.',available:false});}
    })();
    return ()=>{disposed=true;model.current?.close();model.current=null;};
  },[enabled,modelBuffer]);
  const sample=useCallback((video:HTMLVideoElement,now:number)=>{
    // About 15 landmark passes per second: fast enough for hands-free start/stop and head gestures. The
    // meter on screen still updates five times a second.
    if(!model.current || now-last.current<60)return;
    const dt=now-last.current;last.current=now;
    try{
      const result=model.current.detectForVideo(video,now);
      const face=result.faceLandmarks[0];
      if(!face){
        previous.current=0;smoothed.current=0;shapes.current=null;
        listener.current?.({t:now,face:false,mouth:0,yaw:0,pitch:0,brows:0,blink:0});
        if(now-lastMeter.current>=200){lastMeter.current=now;setTracking({level:0,coaching:'No face found. Face the camera in good light.',available:true});}
        return;
      }
      const current:Record<string,number>={};
      for(const category of result.faceBlendshapes?.[0]?.categories||[])current[category.categoryName]=category.score;
      const matrix=result.facialTransformationMatrixes?.[0]?.data;
      listener.current?.({t:now,face:true,mouth:mouthMovement(shapes.current,current,dt),...(matrix?headPose(Array.from(matrix)):{yaw:0,pitch:0}),
        brows:((current.browInnerUp??0)+(current.browOuterUpLeft??0)+(current.browOuterUpRight??0))/3,
        blink:Math.min(current.eyeBlinkLeft??0,current.eyeBlinkRight??0)});
      shapes.current=current;
      if(now-lastMeter.current<200)return;
      lastMeter.current=now;
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
