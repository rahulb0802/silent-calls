import type {Candidate} from './meeting-port';

/** A reviewable spelling correction for an explicit self-introduction, never a new model score.
 * Only the apparent name span changes; the surrounding decoder text remains available for review. */
export function personalIntroduction(id:string,candidates:Candidate[],profileName:string):Candidate[]{
  const name=profileName.trim();
  if(!/^[\p{L}\p{M}'’ -]{2,40}$/u.test(name))return candidates;
  for(const candidate of candidates.slice(0,3)){
    const intro=candidate.text.match(/^(\s*(?:(?:hi|hello|hey)[,.!]?\s+)?my name is\s+)(.+)$/iu);
    if(!intro)continue;
    const tail=intro[2];
    // A common continuation marks the end of the name. Do not invent or discard the rest of the phrase.
    const boundary=tail.search(/\s+(?=(?:and|but|this|that|is|was|i|i'm|we|you|it|it's|from|with|nice|thanks|thank)\b)|[.!?,]/iu);
    const end=boundary<0?tail.length:boundary;
    const span=tail.slice(0,end).trim();
    if(!span || span.split(/\s+/u).length>3)continue;
    if(span.toLocaleLowerCase()===name.toLocaleLowerCase())return candidates;
    const text=intro[1]+name+tail.slice(end);
    if(text.length>5000)continue;
    const existing=candidates.find(item=>item.text.toLocaleLowerCase()===text.toLocaleLowerCase());
    const correction:Candidate=existing || {id:`${id}:own-name`,text,source:'personal'};
    return [correction,...candidates.filter(item=>item.id!==correction.id)].slice(0,10);
  }
  return candidates;
}
