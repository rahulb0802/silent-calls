import { useCallback, useEffect, useState } from 'react';

export type CopilotFact = { source: 'calendar' | 'email' | 'vocabulary' | 'conversation'; detail: string };
export type CopilotState = {
  replies: { text: string; facts: CopilotFact[] }[];
  forLine: string;
  latencyMs: number | null;
  steps: { tool: string; query: string; results: number }[];
};

export type VoiceState = {
  revision: number;
  connection: 'disconnected' | 'connecting' | 'connected' | 'error';
  phase: 'idle' | 'waiting' | 'cloning' | 'uncertain';
  port: number;
  endpoint: string;
  platform: string;
  message: string;
  lastSpoken: string;
  firstAudioMs: number | null;
  captions: { speaker: string; text: string }[];
  personalVoiceReady: boolean;
  voiceName: string;
  hasVoice: boolean;
  repair?: { utteranceId: string; text: string } | null;
  liveCaption?: { speaker: string; text: string } | null;
  callNames?: string[];
  copilot?: CopilotState | null;
};

const initial: VoiceState = {
  revision: 0,
  connection: 'disconnected',
  phase: 'idle',
  port: 8765,
  endpoint: 'ws://127.0.0.1:8765',
  platform: '',
  message: 'Connect the local voice service to speak.',
  lastSpoken: '',
  firstAudioMs: null,
  captions: [],
  personalVoiceReady: false,
  voiceName: '',
  hasVoice: false,
};

export function useLocalVoice() {
  const [state, setState] = useState<VoiceState>(initial);
  const [error, setError] = useState('');
  const accept = useCallback((next: VoiceState) => {
    setState(previous => next.revision >= previous.revision ? next : previous);
  }, []);

  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop?.getVoiceStatus) return;
    let disposed = false;
    const remove = desktop.onVoiceStatus(next => { if (!disposed) accept(next); });
    void desktop.getVoiceStatus().then(next => { if (!disposed) accept(next); }).catch(() => {
      if (!disposed) setError('Could not read voice service status. Restart the desktop app.');
    });
    return () => { disposed = true; remove(); };
  }, [accept]);

  async function action(operation: () => Promise<VoiceState>) {
    setError('');
    try { accept(await operation()); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Voice request failed.'); return false; }
  }

  function connect(port: number) {
    if (!window.desktop?.connectVoice) { setError('Use the Electron desktop app to connect to local audio.'); return Promise.resolve(false); }
    return action(() => window.desktop!.connectVoice(port));
  }
  function disconnect() {
    if (!window.desktop?.disconnectVoice) return Promise.resolve(false);
    return action(() => window.desktop!.disconnectVoice());
  }
  function speak(text: string) {
    if (!window.desktop?.speakText) { setError('Use the Electron desktop app to speak.'); return Promise.resolve(false); }
    return action(() => window.desktop!.speakText(text));
  }

  return { state, error, connect, disconnect, speak, available: Boolean(window.desktop?.connectVoice) };
}
