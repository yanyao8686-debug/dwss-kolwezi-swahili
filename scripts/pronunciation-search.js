(function(root){
  'use strict';
  function getPinyinMap(){return root.DWSS_HANZI_PINYIN||{};}
  const INITIALS=['zh','ch','sh','b','p','m','f','d','t','n','l','g','k','h','j','q','x','r','z','c','s','y','w'];
  const VOWELS=new Set(['a','e','i','o','u','v','ü']);
  const INITIAL_GROUPS=[['zh','z'],['ch','c'],['sh','s'],['l','n'],['f','h'],['r','l']];
  const FINAL_GROUPS=[['ai','ei'],['ao','ou'],['an','ang'],['en','eng'],['in','ing'],['iao','iu'],['ian','iang'],['ie','ye'],['ong','eng'],['u','ü','v'],['uo','ou'],['ui','uei'],['un','uen'],['iong','yong']];
  const SEPARATORS=/[\s\u3000，。！？；：、,.!?;:（）()“”"'‘’·—\-_/\\[\]{}（）【】]/;
  const LATIN=/[A-Za-z0-9]/;

  function toSyllables(text,requireHanzi){
    const output=[];
    let foundHanzi=false;
    for(const character of Array.from(String(text||'').normalize('NFKC'))){
      const pinyin=getPinyinMap()[character];
      if(pinyin){
        const syllable=String(pinyin).toLowerCase().replace(/[^a-zvü]/g,'');
        if(syllable)output.push(syllable);
        foundHanzi=true;
        continue;
      }
      if(SEPARATORS.test(character))continue;
      if(LATIN.test(character))continue;
      return [];
    }
    if(requireHanzi&&!foundHanzi)return [];
    return output;
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
    if(a===b)return 0;
    if(!a||!b)return 1;
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
  function fullSequenceMatch(query,candidate){
    if(!query.length||query.length!==candidate.length)return null;
    let total=0,worst=0;
    for(let i=0;i<query.length;i++){
      const distance=syllableDistance(query[i],candidate[i]);
      total+=distance;
      if(distance>worst)worst=distance;
    }
    return {distance:total/query.length,worst};
  }
  // Merge phrase-level public translation corrections into reverse pronunciation
  // search. These are not necessarily dictionary headwords, so they must be searchable
  // as independent entries for same-/near-sound Chinese input (e.g. 看满大 -> 砍蛮打).
  function includeTranslationOverrides(entries,overrides){
    const output=(Array.isArray(entries)?entries:[]).map(item=>Object.assign({},item,{
      variants:Array.isArray(item&&item.variants)?item.variants.slice():[]
    }));
    const rows=overrides&&typeof overrides.values==='function'
      ?Array.from(overrides.values()):(Array.isArray(overrides)?overrides:[]);
    const normalizeMeaning=value=>String(value||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
    const byMeaning=new Map();
    for(const item of output){
      const key=normalizeMeaning(item&&item.zh);
      if(key&&!byMeaning.has(key))byMeaning.set(key,item);
    }
    for(const row of rows){
      if(!row||row.source_kind!=='translation')continue;
      const zh=String(row.chinese_text||'').trim();
      const reading=String(row.local_pronunciation_cn||'').trim();
      const key=normalizeMeaning(zh);
      if(!key||!reading)continue;
      let item=byMeaning.get(key);
      if(!item){
        item={zh,category:'新增斯语修正',variants:[]};
        output.push(item);
        byMeaning.set(key,item);
      }
      const readingKey=reading.normalize('NFKC').replace(/\s+/g,'');
      if(item.variants.some(variant=>String(variant&&variant.reading||'').normalize('NFKC').replace(/\s+/g,'')===readingKey))continue;
      item.variants.push({
        reading,latin:'',source:'公共翻译修正',kind:'用户新增短语修正'
      });
    }
    return output;
  }
  function search(query,entries,options){
    const q=toSyllables(query,true);
    if(!q.length||q.length>30)return [];
    const maxResults=Math.max(1,Math.min(50,Number(options&&options.limit)||20));
    const minScore=q.length===1?0.97:0.90;
    const maxSyllableDistance=0.38;
    const unique=new Map();

    for(const item of Array.isArray(entries)?entries:[]){
      let best=null;
      for(const variant of Array.isArray(item.variants)?item.variants:[]){
        const reading=String(variant.reading||'').trim();
        if(!reading)continue;
        const candidate=toSyllables(reading,false);
        const match=fullSequenceMatch(q,candidate);
        if(!match||match.worst>maxSyllableDistance)continue;
        const score=1-match.distance;
        if(!best||score>best.score)best={score,reading,variant,match,pinyin:candidate.join(' ')};
      }
      if(!best||best.score<minScore)continue;

      const zh=String(item.zh||'');
      const category=String(item.category||'其他');
      const result={
        zh,category,score:best.score,matchedReading:best.reading,
        matchedPinyin:best.pinyin,variant:best.variant,
        latin:best.variant.latin||'',source:best.variant.source||'词库记录'
      };

      // Repeated source rows for the same meaning and same spoken reading are
      // one search result. Different meanings with the same sound stay visible.
      const meaningKey=zh.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
      const key=meaningKey+'\u0000'+best.pinyin;
      const previous=unique.get(key);
      if(!previous||result.score>previous.score)unique.set(key,result);
    }

    const results=Array.from(unique.values());
    results.sort((a,b)=>b.score-a.score||a.zh.localeCompare(b.zh,'zh-CN'));
    return results.slice(0,maxResults);
  }
  root.DWSSPronunciationSearch={search,toSyllables,syllableDistance,fullSequenceMatch,includeTranslationOverrides};
})(typeof window!=='undefined'?window:globalThis);
