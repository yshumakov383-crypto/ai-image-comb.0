import anime from "animejs";

const ruLetters = [..."АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"];
const enLetters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
  alphabet: "ru",
  model: "1.0",
  tone: "soft",
};

const promptEl = $("#prompt");
const statusEl = $("#status");
const gridEl = $("#grid");

function detectAlphabetFromPrompt(text) {
  return /[а-яё]/i.test(text) ? "ru" : /[a-z]/i.test(text) ? "en" : state.alphabet;
}

function setStatus(msg) { statusEl.textContent = msg || ""; }

function getLetters() { return state.alphabet === "ru" ? ruLetters : enLetters; }

function simpleGenerate(theme, letters) {
  const bank = state.alphabet === "ru" ? simpleBankRu : simpleBankEn;
  const out = [];
  for (let i = 0; i < letters.length; i++) {
    const L = letters[i];
    const words = bank[L] || bank["*"];
    const pick = words[i % words.length];
    const line = state.alphabet === "ru"
      ? `${L} — ${capitalize(theme)}: ${pick}`
      : `${L} — ${capitalize(theme)}: ${pick}`;
    out.push({ letter: L, line });
  }
  return out;
}

function capitalize(s){ return (s||"").trim().replace(/^(.)(.*)$/u,(m,a,b)=>a.toUpperCase()+b); }

async function aiGenerate(theme, letters) {
  // локальная генерация без внешних API
  const rng = (seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2**32)(letters.length + theme.length);
  const bank = state.alphabet === "ru" ? simpleBankRu : simpleBankEn;
  const toneAdj = state.alphabet === "ru"
    ? (state.tone === "hard" ? ["жёстко","дерзко","без фильтра"] : ["аккуратно","вежливо","культурно"])
    : (state.tone === "hard" ? ["bold","gritty","uncut"] : ["polite","subtle","clean"]);
  return letters.map((L, idx) => {
    const words = bank[L] || bank["*"];
    const pick = words[Math.floor(rng()*words.length)] || theme;
    const adj = toneAdj[Math.floor(rng()*toneAdj.length)];
    const line = state.alphabet === "ru"
      ? `${L} — ${capitalize(theme)}: ${pick} • ${adj}`
      : `${L} — ${capitalize(theme)}: ${pick} • ${adj}`;
    return { letter: L, line };
  });
}

function fallbackLine(L, theme){
  const bank = state.alphabet === "ru" ? simpleBankRu : simpleBankEn;
  const words = bank[L] || bank["*"];
  return words[0] || theme;
}

function render(items){
  gridEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  items.forEach(it => {
    const card = document.createElement("div");
    card.className = "card appear";
    const img = state.model!=="1.0" ? `<div class="thumb skeleton" data-letter="${it.letter}"></div>` : "";
    const aud = state.model==="2.5" ? `<div class="audio" data-letter="${it.letter}"></div>` : "";
    card.innerHTML = `${img}<div class="letter">${it.letter}</div><div class="line">${escapeHtml(it.line)}</div>${aud}`;
    frag.appendChild(card);
  });
  gridEl.appendChild(frag);
  if (window.matchMedia("(prefers-reduced-motion: no-preference)").matches){
    anime({
      targets: ".card.appear",
      opacity: [0,1],
      translateY: [6,0],
      delay: anime.stagger(20),
      duration: 260,
      easing: "easeOutQuad",
      complete: () => $$(".card.appear").forEach(el=>el.classList.remove("appear"))
    });
  } else {
    $$(".card.appear").forEach(el=>el.classList.remove("appear"));
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function exportTxt(items){
  const text = items.map(x => x.line).join("\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "alphabet.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function generate(){
  const raw = promptEl.value.trim();
  const theme = raw || (state.alphabet === "ru" ? "без темы" : "no theme");
  const detected = detectAlphabetFromPrompt(theme);
  if (detected !== state.alphabet) selectAlphabet(detected);
  const letters = getLetters();
  setStatus("Генерация...");
  try {
    const items = await aiGenerate(theme, letters);
    render(items);
    if (state.model === "2.0") await generateImagesFor(items, theme);
    if (state.model === "2.5") await Promise.all([generateImagesFor(items, theme), generateAudioFor(items)]);
    setStatus(`Готово: ${items.length} букв${state.model!=="1.0" ? " + фото" : ""}${state.model==="2.5" ? " + озвучка" : ""}`);
    lastResult = items;
  } catch (e){ console.error(e); setStatus(e.message || "Ошибка генерации"); }
}

async function generateImagesFor(items, theme){
  const limit = 4; let idx = 0;
  const run = async () => {
    while (idx < items.length){
      const i = idx++; const L = items[i].letter;
      try {
        const q = `${capitalize(theme)} ${state.alphabet==="ru"?"иллюстрация":"illustration"} ${L}`;
        const url = `https://source.unsplash.com/384x384/?${encodeURIComponent(q)}`;
        const slot = gridEl.querySelector(`.thumb[data-letter="${CSS.escape(L)}"]`);
        if (slot){ slot.classList.remove("skeleton"); slot.innerHTML = `<img alt="" src="${url}">`; }
        if (Math.random() < 0.35) {
          const internetUrl = `https://source.unsplash.com/384x384/?${encodeURIComponent(q + " art")}`;
          const card = gridEl.children[i];
          const extra = document.createElement("div");
          extra.className = "thumb";
          extra.innerHTML = `<img alt="" src="${internetUrl}">`;
          card.appendChild(extra);
        }
      } catch {/* ignore per-item errors */}
    }
  };
  await Promise.all(Array.from({length:limit}, run));
}

async function generateAudioFor(items){
  const lang = state.alphabet === "ru" ? "ru-RU" : "en-US";
  items.forEach(it => {
    const slot = gridEl.querySelector(`.audio[data-letter="${CSS.escape(it.letter)}"]`);
    if (!slot) return;
    const play = document.createElement("button"); play.textContent = "▶︎ Прослушать";
    const stop = document.createElement("button"); stop.textContent = "■ Стоп";
    play.addEventListener("click", ()=> speakText(it.line, lang));
    stop.addEventListener("click", ()=> window.speechSynthesis.cancel());
    slot.innerHTML = ""; slot.appendChild(play); slot.appendChild(stop);
  });
}

function speakText(text, lang){
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1; u.pitch = 1; u.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {/* no-op */}
}

/* UI wiring */
$("#generateBtn").addEventListener("click", generate);
$("#exportBtn").addEventListener("click", ()=> lastResult.length && exportTxt(lastResult));
$("#copyBtn").addEventListener("click", async ()=>{
  if (!lastResult.length) return;
  const text = lastResult.map(x=>x.line).join("\n");
  try { await navigator.clipboard.writeText(text); setStatus("Скопировано"); }
  catch { setStatus("Не удалось скопировать"); }
});

$$('.seg[data-alphabet]').forEach(btn=>{
  btn.addEventListener("click", ()=>{
    $$('.seg[data-alphabet]').forEach(b=>b.setAttribute("aria-selected","false"));
    btn.setAttribute("aria-selected","true");
    state.alphabet = btn.dataset.alphabet;
  });
});

function selectAlphabet(code){
  state.alphabet = code;
  $$('.seg[data-alphabet]').forEach(b=>b.setAttribute("aria-selected", String(b.dataset.alphabet===code)));
}

const modelBtns = $$('.seg.model');

modelBtns.forEach(btn=>{
  btn.addEventListener("click", ()=>{
    modelBtns.forEach(b=>b.setAttribute("aria-selected","false"));
    btn.setAttribute("aria-selected","true");
    state.model = btn.dataset.model;
    setStatus(state.model==="2.5"?"Модель 2.5 (фото+текст+озвучка)":state.model==="2.0"?"Модель 2.0 (фото+текст)":"Модель 1.0 (только текст)");
  });
});

$$('.seg.tone').forEach(btn=>{
  btn.addEventListener("click", ()=>{
    $$('.seg.tone').forEach(b=>b.setAttribute("aria-selected","false"));
    btn.setAttribute("aria-selected","true");
    state.tone = btn.dataset.tone;
    if (state.tone === "hard") {
      const btn20 = document.querySelector('.seg.model[data-model="2.0"]');
      modelBtns.forEach(b=>b.setAttribute("aria-selected","false"));
      btn20.setAttribute("aria-selected","true");
      state.model = "2.0";
      setStatus("Жесткий стиль: фото включены (2.0).");
    }
  });
});

let lastResult = [];

/* Simple banks: lightweight per-letter ideas */
const simpleBankRu = {
  "А": ["астероиды", "артефакты", "алхимия"], "Б": ["баллисты", "барды", "бейджи пилотов"],
  "В": ["варпы", "врата", "выстрел плазмой"], "Г": ["гравитация", "гобелены", "гагаринский дух"],
  "Д": ["дроны", "доспехи", "двигатели"], "Е": ["единороги (кибер)", "экзоскелеты"], "Ё": ["ёлки на Марсе"],
  "Ж": ["жезлы", "журналы бортовые"], "З": ["звёзды", "зелья", "зиккураты"],
  "И": ["искры гипера", "инквизиция лора"], "Й": ["йод в аптечке корабля"], "К": ["квинты квестов","космопорты","катапульты"],
  "Л": ["лучи", "летописи", "линейные крейсеры"], "М": ["магия", "модули", "метеоры"],
  "Н": ["нейтрино", "некроманты", "навигаторы"], "О": ["обсерватории", "оккультизм", "орбитальные кольца"],
  "П": ["порталы", "планерки команды", "повозки"], "Р": ["радар", "руны", "рынки дроидов"],
  "С": ["сабли света", "снаряжение", "стражи"], "Т": ["транспорт", "тролли мостов", "тёмная материя"],
  "У": ["ускорители", "умбра магии"], "Ф": ["фрегаты", "филактерии"], "Х": ["хрономантия", "хабы связи"],
  "Ц": ["цитадели", "циклотрон"], "Ч": ["чертоги", "червоточины"], "Ш": ["шлюзы", "шаманы"],
  "Щ": ["щиты фазовые"], "Ъ": ["твёрдый знак — твёрдая броня"], "Ы": ["ыкающие ящеры"],
  "Ь": ["мягкий ход шафт-лифта"], "Э": ["энергокристаллы", "эманации"], "Ю": ["юстировка лазеров"],
  "Я": ["якоря орбитальные", "ядра кораблей"], "*": ["детали мира", "ключевые образы", "герои и артефакты"]
};

const simpleBankEn = {
  "A":["astral beacons","ancient artifacts","arcane armor"], "B":["bastions","blacksmiths","biome domes"],
  "C":["celestial charts","catapults","cryocores"], "D":["dwarven doors","drone docks","dark matter"],
  "E":["ether engines","enchanted elixirs"], "F":["forges","frigates","floating markets"],
  "G":["gates","galleons","golems"], "H":["hyperlanes","heralds","harbors"],
  "I":["invokers","ion thrusters","ice moons"], "J":["jump points","jade runes"], "K":["keystones","knightly orders"],
  "L":["leviathans","lore libraries","laser lances"], "M":["mana wells","meteor fields","map rooms"],
  "N":["nav beacons","necromancers","nebulae"], "O":["oracles","orbital rings"], "P":["portals","paladins","plasma"],
  "Q":["quantum quarries","quest givers"], "R":["ramparts","runes","reactors"], "S":["starports","spellbooks","signal towers"],
  "T":["teleports","triremes","timekeepers"], "U":["uplinks","undercities"], "V":["vessels","vaults","vortexes"],
  "W":["waystones","warlocks","workshops"], "X":["xeno gardens","xiphos racks"], "Y":["yonder yards","yew bows"],
  "Z":["zephyr sails","zenith towers"], "*":["core motifs","key artifacts","heroes & hubs"]
};

/* On load: demo */
promptEl.placeholder = "Например: «космос», «средневековое фэнтези», «киберпанк-кулинария»";
setStatus("Введите тему и нажмите «Сгенерировать».");