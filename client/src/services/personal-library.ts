import {useEffect,useState} from 'react';

export type VocabularyEntry = {id:string;term:string;aliases:string[]};
export type SavedPhrase = {id:string;text:string};
export type PersonalLibrary = {version:1;vocabulary:VocabularyEntry[];phrases:SavedPhrase[]};
const KEY = 'silent-calls:personal-library:v1';
const CHANGED = 'silent-calls:personal-library-changed';
const empty = ():PersonalLibrary => ({version:1,vocabulary:[],phrases:[]});
const clean = (value:string) => value.trim();
function validate(library:PersonalLibrary) {
  if (library?.version !== 1 || !Array.isArray(library.vocabulary) || !Array.isArray(library.phrases) || library.vocabulary.length > 100 || library.phrases.length > 50) throw new Error('The saved personal library could not be read. Your stored data has not been changed.');
  for (const entry of library.vocabulary) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.term !== 'string' || !entry.term.trim() || entry.term.length > 120 || !Array.isArray(entry.aliases) || entry.aliases.length > 8 || entry.aliases.some(alias=>typeof alias !== 'string' || !alias.trim() || alias.length > 120)) throw new Error('A saved vocabulary entry is invalid. Your stored data has not been changed.');
  }
  for (const phrase of library.phrases) if (!phrase || typeof phrase.id !== 'string' || typeof phrase.text !== 'string' || !phrase.text.trim() || phrase.text.length > 5000) throw new Error('A saved phrase is invalid. Your stored data has not been changed.');
  return library;
}
function read():PersonalLibrary {
  const raw = localStorage.getItem(KEY);
  if (!raw) return empty();
  try { return validate(JSON.parse(raw)); }
  catch { throw new Error('Your personal library could not be loaded. Stored data has not been overwritten.'); }
}
function update(edit:(current:PersonalLibrary)=>PersonalLibrary) {
  const next = validate(edit(read()));
  localStorage.setItem(KEY,JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGED));
}
function snapshot() {
  try { return {library:read(),error:''}; }
  catch (reason) { return {library:empty(),error:reason instanceof Error ? reason.message : 'Local storage is unavailable.'}; }
}
export function usePersonalLibrary() {
  const [state,setState] = useState(snapshot);
  useEffect(()=>{
    const refresh=()=>setState(snapshot());
    const storage=(event:StorageEvent)=>{if(event.key===KEY || event.key===null)refresh();};
    window.addEventListener(CHANGED,refresh);window.addEventListener('storage',storage);
    refresh();
    return()=>{window.removeEventListener(CHANGED,refresh);window.removeEventListener('storage',storage);};
  },[]);
  function saveVocabulary(id:string|undefined,term:string,aliasText:string) {
    const entry:VocabularyEntry={id:id||crypto.randomUUID(),term:clean(term),aliases:[...new Set(aliasText.split(/[,\n]/).map(clean).filter(Boolean))]};
    if (!entry.term || entry.term.length>120 || entry.aliases.length>8 || entry.aliases.some(alias=>alias.length>120)) throw new Error('Enter a term up to 120 characters and no more than eight alternate readings.');
    update(current=>{
      if(current.vocabulary.some(item=>item.id!==id && item.term.toLocaleLowerCase()===entry.term.toLocaleLowerCase()))throw new Error('That vocabulary term is already saved. Edit its existing entry.');
      if(id && !current.vocabulary.some(item=>item.id===id))throw new Error('This entry was removed in another window. Add it again.');
      if(!id && current.vocabulary.length>=100)throw new Error('You can save up to 100 vocabulary entries.');
      return {...current,vocabulary:id?current.vocabulary.map(item=>item.id===id?entry:item):[...current.vocabulary,entry]};
    });
  }
  function savePhrase(id:string|undefined,text:string) {
    const phrase:SavedPhrase={id:id||crypto.randomUUID(),text:clean(text)};
    if(!phrase.text || phrase.text.length>5000)throw new Error('Enter a phrase between 1 and 5000 characters.');
    update(current=>{
      if(current.phrases.some(item=>item.id!==id && item.text===phrase.text))throw new Error('That phrase is already saved.');
      if(id && !current.phrases.some(item=>item.id===id))throw new Error('This phrase was removed in another window. Add it again.');
      if(!id && current.phrases.length>=50)throw new Error('You can save up to 50 phrases.');
      return {...current,phrases:id?current.phrases.map(item=>item.id===id?phrase:item):[...current.phrases,phrase]};
    });
  }
  function remove(kind:'vocabulary'|'phrases',id:string) {
    update(current=>kind==='vocabulary'?{...current,vocabulary:current.vocabulary.filter(item=>item.id!==id)}:{...current,phrases:current.phrases.filter(item=>item.id!==id)});
  }
  return {...state,saveVocabulary,savePhrase,remove};
}

/** Explicit alternate readings only: offer a suggestion, never silently rewrite speech. */
export function vocabularySuggestions(candidates:{text:string}[],entries:VocabularyEntry[]) {
  const suggestions:string[]=[];
  for(const candidate of candidates.slice(0,3)) {
    let corrected=candidate.text;
    for(const entry of entries)for(const alias of entry.aliases) {
      const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const pattern=new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`,'giu');
      corrected=corrected.replace(pattern,(_match,prefix:string)=>prefix+entry.term);
    }
    if(corrected!==candidate.text && corrected.length<=5000 && !suggestions.includes(corrected))suggestions.push(corrected);
  }
  return suggestions;
}
