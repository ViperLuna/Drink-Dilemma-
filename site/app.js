const drinks = [
  {n:"Iced Coffee",e:"🧊☕",t:["cold","caffeine","dry"],tod:["morning","afternoon"],w:"Cold, caffeinated, gets you moving."},
  {n:"Hot Latte",e:"☕",t:["hot","caffeine","sweet"],tod:["morning","afternoon"],w:"Warm and smooth. A hug in a mug."},
  {n:"Green Tea",e:"🍵",t:["hot","caffeine","dry"],tod:["morning","afternoon"],w:"Gentle caffeine without the jitters."},
  {n:"Chamomile Tea",e:"🌼",t:["hot","nocaf","dry"],tod:["night","afternoon"],w:"Wind down mode. Your brain can clock out."},
  {n:"Hot Chocolate",e:"🍫",t:["hot","nocaf","sweet"],tod:["night","afternoon"],w:"Dessert you can sip."},
  {n:"Sparkling Water",e:"🫧",t:["cold","nocaf","dry"],tod:["morning","afternoon","night"],w:"Fizzy, clean, zero drama."},
  {n:"Lemonade",e:"🍋",t:["cold","nocaf","sweet"],tod:["afternoon"],w:"Sweet, sour, and very refreshing."},
  {n:"Orange Juice",e:"🍊",t:["cold","nocaf","sweet"],tod:["morning"],w:"Classic morning move."},
  {n:"Energy Drink",e:"⚡",t:["cold","caffeine","sweet"],tod:["afternoon","morning"],w:"Questionable, but effective."},
  {n:"Cola",e:"🥤",t:["cold","caffeine","sweet"],tod:["afternoon","night"],w:"Fizzy and sweet. You know what it is."},
  {n:"Smoothie",e:"🥭",t:["cold","nocaf","sweet"],tod:["morning","afternoon"],w:"Basically a meal you drink."},
  {n:"Cold Beer",e:"🍺",t:["cold","alcohol","dry"],tod:["afternoon","night"],w:"Crisp, simple, reliable."},
  {n:"Glass of Red Wine",e:"🍷",t:["alcohol","dry"],tod:["night"],w:"Classy. Pinky out optional."},
  {n:"Margarita",e:"🍹",t:["cold","alcohol","sweet"],tod:["afternoon","night"],w:"Salt rim, good vibes."},
  {n:"Whiskey, neat",e:"🥃",t:["alcohol","dry"],tod:["night"],w:"Slow sipper for a slow night."},
  {n:"Hot Toddy",e:"🫖",t:["hot","alcohol","sweet"],tod:["night"],w:"Warm, boozy, great for a rough day."}
];
const qs = [
  {q:"What time is it, vibes-wise?",k:"tod",o:[["Morning","morning"],["Afternoon","afternoon"],["Night","night"]]},
  {q:"Hot or cold?",k:"temp",o:[["Hot","hot"],["Cold","cold"],["Don't care",null]]},
  {q:"Caffeine?",k:"caf",o:[["Yes please","caffeine"],["No thanks","nocaf"],["Don't care",null]]},
  {q:"Alcohol?",k:"alc",o:[["Yes","alcohol"],["No","no"],["Don't care",null]]},
  {q:"Sweet or dry?",k:"sw",o:[["Sweet","sweet"],["Dry","dry"],["Surprise me",null]]}
];
const $ = id => document.getElementById(id);
let step, ans, picks;

function start(){
  step = 0; ans = {}; picks = [];
  $("result").hidden = true; $("quiz").hidden = false; ask();
}
function ask(){
  const q = qs[step];
  $("progress").textContent = `Question ${step+1} of ${qs.length}`;
  $("question").textContent = q.q;
  $("options").replaceChildren(...q.o.map(([label,val]) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => { ans[q.k] = val; ++step < qs.length ? ask() : finish(); };
    return b;
  }));
}
function score(d){
  let s = 0;
  if (ans.tod && d.tod.includes(ans.tod)) s += 2;
  for (const k of ["temp","caf","sw"]) if (ans[k] && d.t.includes(ans[k])) s += 2;
  if (ans.alc === "alcohol") s += d.t.includes("alcohol") ? 4 : -10;
  if (ans.alc === "no") s += d.t.includes("alcohol") ? -10 : 1;
  return s + Math.random();
}
function show(d){
  $("quiz").hidden = true; $("result").hidden = false;
  $("emoji").textContent = d.e; $("name").textContent = d.n; $("why").textContent = d.w;
}
function finish(){
  picks = [...drinks].sort((a,b) => score(b) - score(a));
  show(picks.shift());
}
$("another").onclick = () => picks.length ? show(picks.shift()) : finish();
$("restart").onclick = start;
$("spin").onclick = () => { picks = [...drinks].sort(() => Math.random()-.5); show(picks.shift()); };
start();
