import React, {useEffect,useState} from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import './styles.css';
import {PersonalLibrary} from './personal-library';
import {AudioSetup} from './audio-setup';
import {Workspace} from './workspace';
import {loadSettings} from './services/settings';
import {setupComplete} from './services/setup-memory';
import {GestureSetupPage} from './components/gesture-onboarding';
import { Onboarding } from './onboarding';
import { MeetingWidget } from './widget';
import { DemoMeetingWidget } from './demo-widget';
function FinishSetupInMain(){
  const open=async()=>{if(!window.desktop)return;await window.desktop.showMain('onboarding');await window.desktop.closeWidget();};
  useEffect(()=>{void open();},[]);
  return <main className="consumer-setup-required"><h1>Let’s get you ready.</h1><p>Complete setup in the main Silent Calls window. Your companion will be ready afterward.</p><button className="button" disabled={!window.desktop} onClick={()=>void open()}>Open setup in the main app</button></main>;
}
function App(){
  const defaultRoute=()=>setupComplete(loadSettings())?'#/workspace':'#/onboarding';
  const [route,setRoute]=useState(()=>location.hash || defaultRoute());
  const [ready,setReady]=useState(()=>setupComplete(loadSettings()));
  useEffect(()=>{
    const navigate=()=>{setRoute(location.hash || defaultRoute());setReady(setupComplete(loadSettings()));};
    const refresh=()=>setReady(setupComplete(loadSettings()));
    window.addEventListener('hashchange',navigate);
    const events=['storage','silent-calls:setup','silent-calls:settings'];events.forEach(name=>window.addEventListener(name,refresh));
    return()=>{window.removeEventListener('hashchange',navigate);events.forEach(name=>window.removeEventListener(name,refresh));};
  },[]);
  if(route==='#/widget')return ready?<MeetingWidget/>:<FinishSetupInMain/>;
  // Audio help and private gesture practice live in the full main window.
  if(route==='#/audio-setup')return <AudioSetup/>;
  if(route==='#/gestures')return <GestureSetupPage/>;
  if(!ready || route==='#/onboarding')return <Onboarding/>;
  return route==='#/library'?<PersonalLibrary/>:route==='#/demo-widget'?<DemoMeetingWidget/>:<Workspace/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
