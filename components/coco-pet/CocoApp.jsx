import React, { useEffect, useState } from 'react';
import { Haptics } from '../../services/haptics';
import { CocoPet, PET_VARIANTS } from './CocoPetCreature.jsx';

// Coco app — refined gameplay, centered feed, expanded shop

const FOOD_ITEMS = [
  { id: 'berry', name: 'Berry', emoji: '🍓', cost: 5, joy: 8, hunger: 10, color: '#e85a72' },
  { id: 'cookie', name: 'Cookie', emoji: '🍪', cost: 12, joy: 18, hunger: 22, color: '#d99a4e' },
  { id: 'cake', name: 'Cake', emoji: '🍰', cost: 25, joy: 35, hunger: 40, color: '#ff9aa8' },
  { id: 'leaf', name: 'Glow Leaf', emoji: '🌿', cost: 8, joy: 12, hunger: 14, color: '#7cc78a' },
  { id: 'star', name: 'Star Fruit', emoji: '⭐', cost: 40, joy: 55, hunger: 60, color: '#f6c344' },
  { id: 'shroom', name: 'Shroom', emoji: '🍄', cost: 18, joy: 24, hunger: 28, color: '#c47a8e' },
];

const SHOP_ITEMS = [
  // Headwear
  { id: 'crown', name: 'Crystal Crown', cost: 220, kind: 'Headwear', icon: '👑' },
  { id: 'flower', name: 'Bloom Wreath', cost: 140, kind: 'Headwear', icon: '🌸' },
  { id: 'beanie', name: 'Cozy Beanie', cost: 95, kind: 'Headwear', icon: '🧶' },
  { id: 'bunny', name: 'Bunny Ears', cost: 110, kind: 'Headwear', icon: '🐰' },
  { id: 'starbow', name: 'Star Bow', cost: 75, kind: 'Headwear', icon: '🎀' },
  // Face
  { id: 'glasses', name: 'Heart Glasses', cost: 60, kind: 'Face', icon: '😎' },
  { id: 'shades', name: 'Cool Shades', cost: 85, kind: 'Face', icon: '🕶️' },
  // Clothing
  { id: 'scarf', name: 'Cozy Scarf', cost: 90, kind: 'Clothing', icon: '🧣' },
  { id: 'bowtie', name: 'Dapper Bow', cost: 70, kind: 'Clothing', icon: '🎩' },
  { id: 'cape', name: 'Hero Cape', cost: 200, kind: 'Clothing', icon: '🦸' },
  // Magic
  { id: 'wings', name: 'Fairy Wings', cost: 320, kind: 'Magic', icon: '🦋' },
  { id: 'lantern', name: 'Firefly Lantern', cost: 180, kind: 'Magic', icon: '🏮' },
  { id: 'sparkle', name: 'Sparkle Trail', cost: 150, kind: 'Magic', icon: '✨' },
];

// Slot system: only one item per slot can be equipped
const SLOT = {
  crown: 'head', flower: 'head', beanie: 'head', bunny: 'head', starbow: 'head',
  glasses: 'face', shades: 'face',
  scarf: 'neck', bowtie: 'neck',
  cape: 'back', wings: 'back',
  lantern: 'side', sparkle: 'side',
};

const STATE_KEY = 'lior_coco_pet_state_v1';

const readSavedState = () => {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeSavedState = (state) => {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
};

export function CocoApp({ onClose }) {
  const saved = readSavedState();
  const [screen, setScreen] = useState('home');
  const [variant, setVariant] = useState(saved.variant || 'rose');
  const [name, setName] = useState(saved.name || 'Coco');
  const [harmony, setHarmony] = useState(Number.isFinite(saved.harmony) ? saved.harmony : 80);
  const [hunger, setHunger] = useState(Number.isFinite(saved.hunger) ? saved.hunger : 60);
  const [energy, setEnergy] = useState(Number.isFinite(saved.energy) ? saved.energy : 85);
  const [coins, setCoins] = useState(Number.isFinite(saved.coins) ? saved.coins : 340);
  const [level, setLevel] = useState(Number.isFinite(saved.level) ? saved.level : 2);
  const [xp, setXp] = useState(Number.isFinite(saved.xp) ? saved.xp : 20);
  const [adoreCount, setAdoreCount] = useState(Number.isFinite(saved.adoreCount) ? saved.adoreCount : 0);
  const [pulse, setPulse] = useState(0);
  const [hearts, setHearts] = useState([]);
  const [eating, setEating] = useState(false);
  const [flyingFood, setFlyingFood] = useState(null);
  const [crumbs, setCrumbs] = useState([]);
  const [owned, setOwned] = useState(Array.isArray(saved.owned) ? saved.owned : ['glasses']);
  const [equipped, setEquipped] = useState(Array.isArray(saved.equipped) ? saved.equipped : ['glasses']);
  const [feedOpen, setFeedOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [floatGain, setFloatGain] = useState([]);

  // Hunger decays over time (gameplay loop)
  useEffect(() => {
    const t = setInterval(() => {
      setHunger(h => Math.max(0, h - 1));
      setEnergy(e => Math.max(0, e - 0.5));
    }, 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    writeSavedState({ variant, name, harmony, hunger, energy, coins, level, xp, adoreCount, owned, equipped });
  }, [variant, name, harmony, hunger, energy, coins, level, xp, adoreCount, owned, equipped]);

  // Mood derived from stats
  const mood = (() => {
    if (hunger < 25) return { label: 'Hungry', tint: 'amber' };
    if (energy < 25) return { label: 'Sleepy', tint: 'sky' };
    if (harmony > 80) return { label: 'Joyful', tint: 'rose' };
    return { label: 'Happy', tint: 'rose' };
  })();

  const moodLines = {
    Hungry: ["Tummy rumbles… got a snack?", "I could eat a star…", "Feed me, please?"],
    Sleepy: ["A nap sounds lovely…", "Yawn… so cozy.", "Quiet time?"],
    Joyful: ["You make my horns sparkle!", "Best day ever!", "Let's adventure!"],
    Happy: ["Thinking of you both! ✨", "Feeling fluffy today 🌸", "What's our quest?"],
  };
  const [moodIdx, setMoodIdx] = useState(0);
  const moodLine = moodLines[mood.label][moodIdx % moodLines[mood.label].length];

  const showToast = (msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 1600);
  };

  const showFloatGain = (text, color) => {
    const id = Date.now() + Math.random();
    setFloatGain(g => [...g, { id, text, color, x: 35 + Math.random() * 30 }]);
    setTimeout(() => setFloatGain(g => g.filter(x => x.id !== id)), 1200);
  };

  const addXp = (amount) => {
    setXp(x => {
      const next = x + amount;
      if (next >= 100) {
        setLevel(l => l + 1);
        setCoins(c => c + 50);
        showToast(`Level up! +50 coins`, 'levelup');
        return next - 100;
      }
      return next;
    });
  };

  const onAdore = () => {
    void Haptics.softTap();
    setAdoreCount(c => c + 1);
    setPulse(p => p + 1);
    setHarmony(h => Math.min(100, h + 3));
    setCoins(c => c + 2);
    setMoodIdx(i => i + 1);
    addXp(4);
    const id = Date.now() + Math.random();
    setHearts(h => [...h, { id, x: 40 + Math.random() * 20 }]);
    setTimeout(() => setHearts(h => h.filter(x => x.id !== id)), 1400);
    showFloatGain('+2 ♥', '#a83f5e');
  };

  const onFeed = (item) => {
    void Haptics.tap();
    if (coins < item.cost) { showToast('Not enough coins!'); setFeedOpen(false); return; }
    setCoins(c => c - item.cost);
    setFeedOpen(false);
    setFlyingFood({ emoji: item.emoji, color: item.color, key: Date.now() });
    setTimeout(() => {
      setFlyingFood(null);
      setEating(true);
      setPulse(p => p + 1);
      setHarmony(h => Math.min(100, h + Math.round(item.joy / 4)));
      setHunger(h => Math.min(100, h + item.hunger));
      addXp(8);
      const newCrumbs = Array.from({length: 10}).map((_,i) => ({
        id: Date.now() + i + Math.random(),
        x: 44 + Math.random() * 12,
        dx: (Math.random() - 0.5) * 120,
        dy: -Math.random() * 50 - 30,
        emoji: ['✨','💖','⭐','🌟'][Math.floor(Math.random()*4)],
      }));
      setCrumbs(c => [...c, ...newCrumbs]);
      setTimeout(() => setCrumbs(c => c.filter(x => !newCrumbs.find(n => n.id === x.id))), 1400);
      setTimeout(() => setEating(false), 1400);
      void Haptics.success();
      showFloatGain(`+${item.joy} joy`, '#a83f5e');
    }, 700);
  };

  const onBuy = (item) => {
    void Haptics.press();
    if (coins < item.cost) { showToast('Not enough coins!'); return; }
    if (owned.includes(item.id)) return;
    setCoins(c => c - item.cost);
    setOwned(o => [...o, item.id]);
    showToast(`${item.name} acquired!`, 'success');
  };

  const onToggleEquip = (item) => {
    void Haptics.select();
    const slot = SLOT[item.id];
    if (equipped.includes(item.id)) {
      setEquipped(e => e.filter(x => x !== item.id));
    } else {
      setEquipped(e => [...e.filter(x => SLOT[x] !== slot), item.id]);
    }
  };

  return (
    <div className="screen">
      <div className="bg-grad" />
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-grain" />

      {screen === 'home' && (
        <HomeScreen
          name={name} variant={variant}
          harmony={harmony} hunger={hunger} energy={energy}
          coins={coins} level={level} xp={xp}
          adoreCount={adoreCount} pulse={pulse} hearts={hearts}
          crumbs={crumbs} eating={eating} flyingFood={flyingFood}
          floatGain={floatGain}
          equipped={equipped}
          mood={mood} moodLine={moodLine}
          onAdore={onAdore}
          feedOpen={feedOpen} setFeedOpen={setFeedOpen} onFeed={onFeed}
          onSettings={() => setScreen('settings')}
          onClose={onClose}
          onTab={setScreen}
        />
      )}
      {screen === 'quest' && (
        <QuestScreen onBack={() => setScreen('home')} coins={coins} adoreCount={adoreCount} />
      )}
      {screen === 'shop' && (
        <ShopScreen
          coins={coins} owned={owned} equipped={equipped}
          onBuy={onBuy} onToggleEquip={onToggleEquip}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          name={name} setName={setName}
          variant={variant} setVariant={setVariant}
          equipped={equipped}
          onBack={() => setScreen('home')}
        />
      )}

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}

/* ============= HOME ============= */
function HomeScreen({ name, variant, harmony, hunger, energy, coins, level, xp, adoreCount, pulse, hearts, crumbs, eating, flyingFood, floatGain, equipped, mood, moodLine, onAdore, feedOpen, setFeedOpen, onFeed, onSettings, onClose, onTab }) {
  return (
    <>
      <header className="topbar">
        <button className="iconbtn" onClick={onClose} aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="namepill">
          <h1 className="petname">{name}</h1>
          <div className="petsub">
            <span className="dot" />
            <span className="age">Lv {level}</span>
            <span className="bullet">·</span>
            <span className={`mood-pill mood-${mood.tint}`}>{mood.label}</span>
          </div>
        </div>
        <div className="topbar-right">
          <button className="iconbtn" onClick={onSettings} aria-label="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </header>

      <div className="stage">
        <div className="stage-glow" />
        <CocoPet pulse={pulse} variant={variant} eating={eating} equipped={equipped} />
        {flyingFood && (
          <span key={flyingFood.key} className="flying-food">{flyingFood.emoji}</span>
        )}
        <div className="hearts-layer">
          {hearts.map(h => <span key={h.id} className="float-heart" style={{left: `${h.x}%`}}>♥</span>)}
          {crumbs.map(c => (
            <span key={c.id} className="crumb" style={{left: `${c.x}%`, '--dx': `${c.dx}px`, '--dy': `${c.dy}px`}}>{c.emoji}</span>
          ))}
          {floatGain.map(g => (
            <span key={g.id} className="float-gain" style={{left: `${g.x}%`, color: g.color}}>{g.text}</span>
          ))}
        </div>
      </div>

      <section className="card">
        <div className="speech-row">
          <div className="speech-bubble">
            <p className="speech">{moodLine}</p>
            <span className="speech-tail" />
          </div>
        </div>

        {/* Triple stat bars */}
        <div className="bars">
          <StatBar icon="heart" value={harmony} label="Joy" tint="rose" />
          <StatBar icon="meal" value={hunger} label="Hunger" tint="amber" />
          <StatBar icon="bolt" value={energy} label="Energy" tint="sky" />
        </div>

        <div className="bottom-row">
          <button className="adore-btn" onClick={onAdore}>
            <span className="adore-glow" />
            <span className="adore-content">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z" /></svg>
              <span>Adore</span>
            </span>
          </button>
          <div className="xpbar">
            <div className="xpbar-track">
              <div className="xpbar-fill" style={{width: `${xp}%`}} />
              <span className="xpbar-label">Lv {level} · {xp}/100 XP</span>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom action row: Quests | Feed (center FAB) | Shop */}
      <nav className="actionbar">
        <TabBtn onClick={() => onTab('quest')} label="Quests">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z"/></svg>
        </TabBtn>

        <div className="feed-wrap">
          {feedOpen && (
            <>
              <div className="feed-backdrop" onClick={() => setFeedOpen(false)} />
              <div className="feed-fan">
                {FOOD_ITEMS.map((item, i) => {
                  const angle = (i / (FOOD_ITEMS.length - 1)) * 160 - 80;
                  const rad = angle * Math.PI / 180;
                  const r = 115;
                  const tx = Math.sin(rad) * r;
                  const ty = -Math.cos(rad) * r - 20;
                  return (
                    <button
                      key={item.id}
                      className="feed-fan-item"
                      style={{
                        '--i': i,
                        '--tx': `${tx}px`,
                        '--ty': `${ty}px`,
                        '--food-color': item.color,
                      }}
                      onClick={() => onFeed(item)}
                    >
                      <span className="feed-fan-emoji">{item.emoji}</span>
                      <span className="feed-fan-cost">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>
                        {item.cost}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <button
            className={`fab ${feedOpen ? 'fab-open' : ''}`}
            onClick={() => setFeedOpen(o => !o)}
            aria-label="Feed"
          >
            <span className="fab-pulse" />
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {feedOpen
                ? <path d="M18 6L6 18M6 6l12 12"/>
                : <><path d="M3 2v7c0 1.1.9 2 2 2h2v11M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></>
              }
            </svg>
            <span className="fab-label">{feedOpen ? 'Close' : 'Feed'}</span>
          </button>
        </div>

        <TabBtn onClick={() => onTab('shop')} label="Shop">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.5-5h15L21 9M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18M9 13h6"/></svg>
        </TabBtn>
      </nav>
    </>
  );
}

/* ============= QUEST ============= */
function QuestScreen({ onBack, coins, adoreCount }) {
  const quests = [
    { id: 1, title: 'Adore Coco 5 times', reward: 20, progress: Math.min(adoreCount, 5), total: 5, icon: '💖' },
    { id: 2, title: 'Feed a Cake', reward: 50, progress: 0, total: 1, icon: '🍰' },
    { id: 3, title: 'Reach Level 3', reward: 100, progress: 0, total: 1, icon: '⭐' },
    { id: 4, title: 'Equip 3 wearables', reward: 30, progress: 1, total: 3, icon: '👑' },
    { id: 5, title: 'Keep hunger above 50', reward: 25, progress: 1, total: 1, icon: '🍓' },
  ];
  return (
    <>
      <SubHeader title="Quests" subtitle="Daily adventures" coins={coins} onBack={onBack} />
      <section className="card card-list">
        {quests.map(q => {
          const done = q.progress >= q.total;
          return (
            <div key={q.id} className={`quest-row ${done ? 'quest-done' : ''}`}>
              <div className="quest-icon">{q.icon}</div>
              <div className="quest-body">
                <div className="quest-title">{q.title}</div>
                <div className="quest-progress">
                  <div className="quest-track"><div className="quest-fill" style={{width: `${(q.progress/q.total)*100}%`}}/></div>
                  <span>{q.progress}/{q.total}</span>
                </div>
              </div>
              <div className={`quest-reward ${done ? 'quest-reward-claim' : ''}`}>
                {done ? 'CLAIM' : `+${q.reward}`}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}

/* ============= SHOP ============= */
function ShopScreen({ coins, owned, equipped, onBuy, onToggleEquip, onBack }) {
  const [tab, setTab] = useState('all');
  const filtered = tab === 'all' ? SHOP_ITEMS : SHOP_ITEMS.filter(i => i.kind.toLowerCase() === tab);
  const cats = ['all', 'headwear', 'face', 'clothing', 'magic'];

  return (
    <>
      <SubHeader title="Shop" subtitle="Treats & treasures" coins={coins} onBack={onBack} />

      <div className="shop-cats">
        {cats.map(c => (
          <button key={c} className={`shop-cat ${tab === c ? 'shop-cat-active' : ''}`} onClick={() => setTab(c)}>
            {c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>

      <section className="card card-shop">
        <div className="shop-grid">
          {filtered.map(item => {
            const isOwned = owned.includes(item.id);
            const isEquipped = equipped.includes(item.id);
            const canAfford = coins >= item.cost;
            return (
              <div key={item.id} className={`shop-item ${isEquipped ? 'shop-equipped' : ''}`}>
                {isEquipped && <div className="shop-tag">EQUIPPED</div>}
                <div className="shop-icon">{item.icon}</div>
                <div className="shop-name">{item.name}</div>
                <div className="shop-kind">{item.kind}</div>
                {isOwned ? (
                  <button
                    className={`shop-buy ${isEquipped ? 'shop-buy-equipped' : 'shop-buy-equip'}`}
                    onClick={() => onToggleEquip(item)}
                  >
                    {isEquipped ? 'Remove' : 'Equip'}
                  </button>
                ) : (
                  <button
                    className={`shop-buy ${!canAfford ? 'shop-buy-locked' : ''}`}
                    onClick={() => onBuy(item)}
                    disabled={!canAfford}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>
                    {item.cost}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

/* ============= SETTINGS ============= */
function SettingsScreen({ name, setName, variant, setVariant, equipped, onBack }) {
  const [draft, setDraft] = useState(name);
  const [section, setSection] = useState('pet');
  const variants = Object.keys(PET_VARIANTS);

  const save = () => {
    setName(draft.trim() || 'Coco');
    onBack();
  };

  return (
    <>
      <SubHeader title="Settings" subtitle="Customize your friend" onBack={onBack} />

      <div className="set-tabs">
        <button className={`set-tab ${section === 'pet' ? 'set-tab-active' : ''}`} onClick={() => setSection('pet')}>Pet</button>
        <button className={`set-tab ${section === 'app' ? 'set-tab-active' : ''}`} onClick={() => setSection('app')}>App</button>
      </div>

      <div className="settings-scroll">
        {section === 'pet' && (
          <>
            <section className="card card-settings">
              <div className="set-preview">
                <div className="set-preview-pet">
                  <CocoPet variant={variant} equipped={equipped} />
                </div>
                <div className="set-preview-side">
                  <label className="set-label">Name</label>
                  <div className="name-input-wrap">
                    <input
                      className="name-input"
                      value={draft}
                      onChange={e => setDraft(e.target.value.slice(0, 14))}
                      placeholder="Name your friend"
                    />
                    <span className="name-count">{draft.length}/14</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="card card-settings">
              <label className="set-label">Choose a Pet</label>
              <div className="pet-picker">
                {variants.map(key => {
                  const v = PET_VARIANTS[key];
                  return (
                    <button
                      key={key}
                      className={`pet-option ${variant === key ? 'pet-active' : ''}`}
                      onClick={() => setVariant(key)}
                      style={{'--pet-c1': v.body[0], '--pet-c2': v.body[2], '--pet-accent': v.cheek}}
                    >
                      <div className="pet-thumb">
                        <PetThumb variant={key} />
                      </div>
                      <span className="pet-name">{v.label}</span>
                      {variant === key && <span className="pet-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {section === 'app' && (
          <section className="card card-settings">
            <SettingRow icon="🔔" label="Notifications" rightControl={<Toggle initial={true} />} />
            <SettingRow icon="🌙" label="Dark Mode" rightControl={<Toggle initial={false} />} />
            <SettingRow icon="🔊" label="Sound Effects" rightControl={<Toggle initial={true} />} />
            <SettingRow icon="✨" label="Haptic Feedback" rightControl={<Toggle initial={true} />} />
            <SettingRow icon="🌐" label="Language" rightValue="English" />
            <SettingRow icon="❓" label="Help & Support" rightArrow />
            <SettingRow icon="📜" label="Privacy Policy" rightArrow />
            <SettingRow icon="ℹ️" label="About" rightValue="v2.1.0" />
          </section>
        )}

        <button className="adore-btn save-btn" onClick={save}>
          <span className="adore-glow" />
          <span className="adore-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            <span>Save Changes</span>
          </span>
        </button>
      </div>
    </>
  );
}

function SettingRow({ icon, label, rightValue, rightArrow, rightControl }) {
  return (
    <div className="set-row">
      <span className="set-row-icon">{icon}</span>
      <span className="set-row-label">{label}</span>
      <span className="set-row-right">
        {rightValue && <span className="set-row-value">{rightValue}</span>}
        {rightControl}
        {rightArrow && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>}
      </span>
    </div>
  );
}

function Toggle({ initial }) {
  const [on, setOn] = useState(initial);
  return (
    <button className={`toggle ${on ? 'toggle-on' : ''}`} onClick={() => setOn(o => !o)}>
      <span className="toggle-knob" />
    </button>
  );
}

/* ============= COMMON ============= */
function SubHeader({ title, subtitle, coins, onBack }) {
  return (
    <header className="topbar">
      <button className="iconbtn" onClick={onBack} aria-label="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <div className="namepill">
        <h1 className="petname sub-title">{title}</h1>
        <div className="petsub"><span className="age">{subtitle}</span></div>
      </div>
      <div className="topbar-right">
        {coins !== undefined ? (
          <div className="coin-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>
            {coins}
          </div>
        ) : <div style={{width: 44}} />}
      </div>
    </header>
  );
}

function PetThumb({ variant }) {
  const v = PET_VARIANTS[variant];
  return (
    <svg viewBox="0 0 80 80" width="100%" height="100%">
      <defs>
        <radialGradient id={`tb-${variant}`} cx="0.4" cy="0.3" r="0.85">
          <stop offset="0%" stopColor={v.body[0]} />
          <stop offset="100%" stopColor={v.body[2]} />
        </radialGradient>
      </defs>
      <path d="M 26 24 Q 20 8 22 4 Q 30 12 32 24 Z" fill={v.horn[1]} stroke={v.line} strokeWidth="0.6" />
      <path d="M 54 24 Q 60 8 58 4 Q 50 12 48 24 Z" fill={v.horn[1]} stroke={v.line} strokeWidth="0.6" />
      <ellipse cx="40" cy="44" rx="26" ry="24" fill={`url(#tb-${variant})`} stroke={v.stroke} strokeWidth="1" />
      <ellipse cx="32" cy="46" rx="4" ry="5" fill="#1a0710" />
      <ellipse cx="48" cy="46" rx="4" ry="5" fill="#1a0710" />
      <circle cx="33" cy="44" r="1.5" fill="#fff" />
      <circle cx="49" cy="44" r="1.5" fill="#fff" />
      <ellipse cx="26" cy="54" rx="4" ry="2" fill={v.cheek} opacity="0.7" />
      <ellipse cx="54" cy="54" rx="4" ry="2" fill={v.cheek} opacity="0.7" />
      <path d="M 35 56 Q 40 60 45 56" stroke={v.line} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function StatBar({ icon, value, label, tint }) {
  const icons = {
    heart: <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z"/></svg>,
    meal: <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>,
    bolt: <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>,
  };
  return (
    <div className={`statbar statbar-${tint}`}>
      <span className="statbar-icon">{icons[icon]}</span>
      <div className="statbar-body">
        <div className="statbar-row">
          <span className="statbar-lbl">{label}</span>
          <span className="statbar-val">{Math.round(value)}</span>
        </div>
        <div className="statbar-track">
          <div className="statbar-fill" style={{width: `${value}%`}} />
        </div>
      </div>
    </div>
  );
}

function TabBtn({ onClick, label, children }) {
  return (
    <button className="tab" onClick={onClick}>
      <span className="tab-icon">{children}</span>
      <span className="tab-lbl">{label}</span>
    </button>
  );
}
