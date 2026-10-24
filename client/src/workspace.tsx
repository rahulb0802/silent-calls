import {useState} from 'react';
import {ArrowLeft,Check,Save,Waves} from 'lucide-react';
import {loadSettings,saveSettings,type ServiceSettings} from './services/settings';
import {EnrollmentFlow} from './components/enrollment-flow';

export function Workspace(){
  const [settings,setSettings]=useState<ServiceSettings>(loadSettings);
  const [locked,setLocked]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  function save(){try{saveSettings(settings);setError('');setNotice('Settings saved. Reconnect the meeting widget to use a changed profile or endpoint.');}catch(reason){setError(reason instanceof Error?reason.message:'Could not save settings.');}}
  return <main className="workspace"><header className="workspace-header"><a href="#"><ArrowLeft size={16}/> Back to setup</a><a className="text-button" href="#/audio-setup">Meeting audio setup</a><a className="text-button" href="#/library">Vocabulary & saved phrases</a><span><Waves size={20}/> silent calls.</span><button className="button" onClick={()=>window.desktop?.openWidget()}>Open meeting widget</button></header>
    <div className="workspace-heading"><h1>Make it yours.</h1><p>Enroll with your webcam, train your personal adapter, and see what changes on held-out sentences. Keep your port-8000 SSH tunnel open.</p></div>
    <details className="training-connection-settings"><summary>Connection settings · {settings.profileId}</summary><fieldset disabled={locked} className="service-settings"><legend className="sr-only">GPU service settings</legend><p>The current profile is used for both enrollment and lip-reading. Connecting saves these settings. Disconnect enrollment before changing them.</p><div className="training-settings-grid"><div><label htmlFor="profile-id">Profile ID</label><input id="profile-id" value={settings.profileId} onChange={event=>setSettings({...settings,profileId:event.target.value})}/></div><div><label htmlFor="ws-endpoint">Lip-reading WebSocket URL</label><input id="ws-endpoint" type="url" placeholder="ws://127.0.0.1:8000/ws/session" value={settings.websocketUrl} onChange={event=>setSettings({...settings,websocketUrl:event.target.value})}/></div><div><label htmlFor="api-endpoint">Enrollment API URL · optional</label><input id="api-endpoint" type="url" placeholder="Derived from the WebSocket URL" value={settings.apiUrl} onChange={event=>setSettings({...settings,apiUrl:event.target.value})}/></div></div><button className="button" onClick={save}><Save size={15}/> Save settings</button><p className="small">Camera and hold-key selection live in the widget. The current GPU service relies on access through your SSH tunnel; the profile ID is not authentication.</p></fieldset>{notice && <p className="success" role="status"><Check size={15}/>{notice}</p>}{error && <p className="error" role="alert">{error}</p>}</details>
    <EnrollmentFlow settings={settings} onLockChange={setLocked}/>
  </main>;
}
