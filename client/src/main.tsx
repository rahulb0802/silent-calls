import React, {useEffect,useState} from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import './styles.css';
import {AudioSetup} from './audio-setup';
import {Workspace} from './workspace';
import { Onboarding } from './onboarding';
import { MeetingWidget } from './widget';
import { DemoMeetingWidget } from './demo-widget';
function App(){
  const [route,setRoute]=useState(location.hash);
  useEffect(()=>{const update=()=>setRoute(location.hash);window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
  return route==='#/widget'?<MeetingWidget/>:route==='#/demo-widget'?<DemoMeetingWidget/>:route==='#/workspace'?<Workspace/>:route==='#/audio-setup'?<AudioSetup/>:<Onboarding/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
