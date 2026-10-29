(function(root){
  'use strict';
  const PINYIN=root.DWSS_HANZI_PINYIN||{};
  const INITIALS=['zh','ch','sh','b','p','m','f','d','t','n','l','g','k','h','j','q','x','r','z','c','s','y','w'];
  const VOWELS=new Set(['a','e','i','o','u','v','ü']);
  const INITIAL_GROUPS=[['zh','z'],['ch','c'],['sh','s'],['l','n'],['f','h'],['r','l']];
  const FINAL_GROUPS=[['ai','ei'],['ao','ou'],['an','ang'],['en','eng'],['in','ing'],['iao','iu'],['ian','iang'],['ie','ye'],['ong','eng'],['u','ü','v'],['uo','ou'],['ui','uei'],['un','uen'],['iong','yong']];
  function toSyllables(text,requireHanzi){
    const output=[];let foundHanzi=false;
    for(const character of Array.from(String(text||'').normalize('NFKC'))){
      const pinyin=PINYIN[character];
      if(pinyin){output.push(String(pinyin).toLowerCase().replace(/[^a-zvü]/g,''));foundHanzi=true;continue;}
      if(/[\s\u3000，。！？；：、,.!?;:（）()“”"'‘’·—\-_/0-9]/.test(character))continue;
      if(/[A-Za-z]/.test(character))continue;
    }
    if(requireHanzi&&!foundHanzi)return [];
    return output.filter(Boolean);
  }
  function splitSyllable(value){
    const s=String(value||'').toLowerCase();
    for(const initial of INITIALS)if(s.startsWith(initial))return {initial,final:s.slice(initial.length)};
    return {initial:'',final:s};
  }
  function sameGroup(a,b,groups){return groups.some(group=>group.includes(a)&&group.includes(b));}
  function charEditCost(a,b){
    if(a===b)return 0;
    if(VOWELS.has(a)&&VOWELS.has(b))return 0.7;
    if((a==='n'&&b==='g')||(a==='g'&&b==='n'))return 0.32;
    if((a==='h'&&b==='g')||(a==='g'&&b==='h'))return 0.65;
    return 0.9;
  }
  function weightedEditDistance(a,b){
    if(a===b)return 0;if(!a||!b)return 1;
    const dp=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
    for(let i=1;i<=a.length;i++)dp[i][0]=dp[i-1][0]+(VOWELS.has(a[i-1])?0.38:0.78);
    for(let j=1;j<=b.length;j++)dp[0][j]=dp[0][j-1]+(VOWELS.has(b[j-1])?0.38:0.78);
    for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
      const del=dp[i-1][j]+(VOWELS.has(a[i-1])?0.38:0.78);
      const ins=dp[i][j-1]+(VOWELS.has(b[j-1])?0.38:0.78);
      const sub=dp[i-1][j-1]+charEditCost(a[i-1],b[j-1]);
      dp[i][j]=Math.min(del,ins,sub);
    }
    return Math.min(1,dp[a.length][b.length]/Math.max(a.length,b.length,2));
  }
  function syllableDistance(a,b){
    if(a===b)return 0;
    const left=splitSyllable(a),right=splitSyllable(b);
    const initial=left.initial===right.initial?0:(sameGroup(left.initial,right.initial,INITIAL_GROUPS)?0.18:0.92);
    const final=left.final===right.final?0:(sameGroup(left.final,right.final,FINAL_GROUPS)?0.15:weightedEditDistance(left.final,right.final));
    return Math.min(1,initial*0.43+final*0.57);
  }
  function bestWindow(query,candidate){
    if(!query.length||candidate.length<query.length)return null;
    let best=null;
    for(let start=0;start<=candidate.length-query.length;start++){
      let total=0;for(let i=0;i<query.length;i++)total+=syllableDistance(query[i],candidate[start+i]);
      const distance=total/query.length;
      if(!best||distance<best.distance)best={distance,start,end:start+query.length};
      if(distance===0)break;
    }
    return best;
  }
  function search(query,entries,options){
    const q=toSyllables(query,true);if(!q.length||q.length>30)return [];
    const maxResults=Math.max(1,Math.min(50,Number(options&&options.limit)||20));
    const minScore=q.length===1?0.97:q.length===2?0.88:0.84;
    const results=[];
    for(const item of Array.isArray(entries)?entries:[]){
      let best=null;
      for(const variant of Array.isArray(item.variants)?item.variants:[]){
        const reading=String(variant.reading||'').trim();if(!reading)continue;
        const window=bestWindow(q,toSyllables(reading,false));if(!window)continue;
        const score=1-window.distance;
        if(!best||score>best.score)best={score,reading,variant};
      }
      if(best&&best.score>=minScore)results.push({
        zh:String(item.zh||''),category:String(item.category||'其他'),score:best.score,
        matchedReading:best.reading,variant:best.variant,latin:best.variant.latin||'',
        source:best.variant.source||'词库记录'
      });
    }
    results.sort((a,b)=>b.score-a.score||a.zh.localeCompare(b.zh,'zh-CN'));
    return results.slice(0,maxResults);
  }
  root.DWSSPronunciationSearch={search,toSyllables,syllableDistance};
})(typeof window!=='undefined'?window:globalThis);
