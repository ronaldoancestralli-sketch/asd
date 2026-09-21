/* Identidade visual do ranking. Apenas lê o texto/rank já renderizado. */
function readRank(text=''){const match=String(text).match(/#\s*(\d+)/);return match?Number(match[1]):null}
function setRank(el,rank){if(!el||!rank)return;el.dataset.rank=String(rank)}
function getRankColor(rank){return ({1:'#f5c451',2:'#b9c5d6',3:'#d78b55',4:'#9d82ff',5:'#53d6e8'})[rank]||'#b39aff'}
function getRankRgb(rank){return ({1:'245,196,81',2:'185,197,214',3:'215,139,85',4:'157,130,255',5:'83,214,232'})[rank]||'179,154,255'}
function applyRankVisuals(){
  const rankTag=document.getElementById('rank-tag');
  const selectorRank=document.getElementById('selector-rank');
  const modalRank=document.getElementById('modal-rank');
  const communityCard=document.querySelector('.build-community');
  const activeRank=readRank(rankTag?.textContent)||readRank(selectorRank?.textContent);
  if(activeRank){
    [rankTag,selectorRank,modalRank,communityCard].forEach(el=>setRank(el,activeRank));
    const selector=document.querySelector('.build-selector');
    selector?.style.setProperty('--rank-rgb',getRankRgb(activeRank));
    selector?.style.setProperty('--rank-color',getRankColor(activeRank));
  }
  document.querySelectorAll('#build-options button').forEach(button=>{
    const rank=readRank(button.querySelector('.option-rank')?.textContent);
    if(!rank)return;
    setRank(button,rank);setRank(button.querySelector('.option-rank'),rank);
    button.style.setProperty('--rank-rgb',getRankRgb(rank));
    button.style.setProperty('--rank-color',getRankColor(rank));
  });
}
const observer=new MutationObserver(()=>requestAnimationFrame(applyRankVisuals));
['rank-tag','selector-rank','build-options','modal-rank'].forEach(id=>{const el=document.getElementById(id);if(el)observer.observe(el,{childList:true,subtree:true,characterData:true})});
applyRankVisuals();
