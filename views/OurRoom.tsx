import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Clock3, Coins, Gift, Heart, Palette, RotateCw, Share2, ShoppingBag, Sparkles, Target, Trash2, TrendingUp, Users, Wand2, X } from 'lucide-react';
import { RoomPlacedItem, RoomState, ViewState } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { RoomScene3D } from '../components/room/RoomScene3D';
import { Category, PropKind, ROOM_SHOP_BY_ID, gridToPercent, percentToGrid } from '../components/room/roomCatalog3D';
import {
  DEFAULT_ROOM_STATE,
  RoomActionId,
  applyAction,
  applyPurchase,
  buyUpgrade,
  claimCollectionReward,
  claimDailyReward,
  claimOfflineRewards,
  claimTaskReward,
  getActionCards,
  getBondLevelFromXp,
  getCollectionCards,
  getDailyReward,
  getLevelFromXp,
  getOfflineRewards,
  getRoomLevelFromXp,
  getRoomMetrics,
  getShopSummary,
  getTaskCards,
  getThemeUnlocks,
  getUpgradeCards,
  normalizeRoomState,
  performCoupleVisit,
  performGift,
} from '../components/room/roomGameplay';

interface OurRoomProps { setView: (v: ViewState) => void; }
type SheetId = 'shop' | 'progress' | 'tasks' | 'customize' | null;

const OUTLINE = '#2a2345';
const CAT_LABEL: Record<Category, string> = {
  furniture: 'Furniture',
  decor: 'Decor',
  plants: 'Plants',
  lighting: 'Lighting',
  cozy: 'Cozy',
  special: 'Special',
};

const WALL_OPTIONS: Array<{ value: RoomState['wallpaper']; label: string; swatch: string }> = [
  { value: 'plain', label: 'Plain', swatch: 'linear-gradient(135deg,#e4d6ca,#d9c8ba)' },
  { value: 'stripes', label: 'Stripe', swatch: 'repeating-linear-gradient(90deg,#e1d3c5 0 10px,#cdbcad 10px 16px)' },
  { value: 'polka', label: 'Polka', swatch: 'radial-gradient(circle at 30% 30%,#f7ecde 0 10%,transparent 11%), #dfd0c4' },
  { value: 'hearts', label: 'Heart', swatch: 'linear-gradient(135deg,#dfd0c4,#e8bfd0)' },
  { value: 'stars', label: 'Star', swatch: 'linear-gradient(135deg,#e6d6c6,#f5eadb)' },
  { value: 'wood', label: 'Wood', swatch: 'repeating-linear-gradient(90deg,#c29066 0 12px,#aa774f 12px 20px)' },
];

const FLOOR_OPTIONS: Array<{ value: RoomState['floor']; label: string; swatch: string }> = [
  { value: 'hardwood', label: 'Wood', swatch: 'repeating-linear-gradient(90deg,#bc8961 0 12px,#9b6c4b 12px 20px)' },
  { value: 'carpet', label: 'Carpet', swatch: 'linear-gradient(135deg,#7586d5,#5666af)' },
  { value: 'tiles', label: 'Tiles', swatch: 'linear-gradient(135deg,#9aa8ed,#7180c7)' },
  { value: 'cloud', label: 'Cloud', swatch: 'linear-gradient(135deg,#d0e4ff,#b7d4ff)' },
  { value: 'grass', label: 'Grass', swatch: 'linear-gradient(135deg,#8cd174,#6bac59)' },
  { value: 'marble', label: 'Marble', swatch: 'linear-gradient(135deg,#f2f4fb,#d6ddee)' },
];

const AMBIENT_OPTIONS: Array<{ value: RoomState['ambient']; label: string; color: string }> = [
  { value: 'warm', label: 'Warm', color: '#f59e0b' },
  { value: 'cool', label: 'Cool', color: '#60a5fa' },
  { value: 'rainbow', label: 'Dream', color: '#f472b6' },
];

const preferredSlots: Array<[number, number]> = [[2, 3], [3, 3], [2, 2], [3, 2], [4, 3], [1, 3], [2, 4], [3, 4], [4, 2], [1, 2], [4, 4], [5, 3]];

const playTone = (ctx: AudioContext, freq: number, duration = 0.08, type: OscillatorType = 'square', gain = 0.08) => {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0.001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
};

const shopIcon = (kind: PropKind, color: string) => {
  if (kind === 'desk' || kind === 'tv' || kind === 'bookshelf' || kind === 'fridge') return <svg viewBox="0 0 64 64" className="h-full w-full"><rect x="10" y="20" width="44" height="30" rx="3" fill={color} stroke={OUTLINE} strokeWidth="3" /><rect x="16" y="26" width="32" height="8" fill="#fff" opacity="0.2" /></svg>;
  if (kind === 'couch' || kind === 'bed' || kind === 'pillows' || kind === 'beanbag') return <svg viewBox="0 0 64 64" className="h-full w-full"><rect x="8" y="30" width="48" height="18" rx="6" fill={color} stroke={OUTLINE} strokeWidth="3" /><rect x="10" y="22" width="20" height="10" rx="4" fill="#fff" opacity="0.28" /><rect x="34" y="22" width="20" height="10" rx="4" fill="#fff" opacity="0.28" /></svg>;
  if (kind === 'lamp' || kind === 'lantern' || kind === 'disco' || kind === 'candles') return <svg viewBox="0 0 64 64" className="h-full w-full"><rect x="29" y="20" width="6" height="24" fill="#8892aa" /><circle cx="32" cy="18" r="8" fill={color} stroke={OUTLINE} strokeWidth="3" /><rect x="24" y="44" width="16" height="7" fill="#5d677f" /></svg>;
  if (kind === 'plant' || kind === 'bonsai' || kind === 'flower' || kind === 'sunflower' || kind === 'cactus') return <svg viewBox="0 0 64 64" className="h-full w-full"><rect x="22" y="42" width="20" height="12" fill="#8a4f29" stroke={OUTLINE} strokeWidth="3" /><circle cx="32" cy="30" r="11" fill={color} stroke={OUTLINE} strokeWidth="3" /></svg>;
  if (kind === 'frame' || kind === 'window' || kind === 'neon' || kind === 'portal') return <svg viewBox="0 0 64 64" className="h-full w-full"><rect x="16" y="10" width="32" height="44" fill="#3d2f4f" stroke={OUTLINE} strokeWidth="4" /><rect x="20" y="14" width="24" height="36" fill={color} opacity="0.85" /></svg>;
  return <svg viewBox="0 0 64 64" className="h-full w-full"><rect x="12" y="16" width="40" height="36" rx="6" fill={color} stroke={OUTLINE} strokeWidth="3" /></svg>;
};

const pct = (progress: number, next: number) => `${Math.min(100, Math.max(6, (progress / Math.max(1, next)) * 100))}%`;

const ACTION_HUD: Record<RoomActionId, { icon: React.ReactNode; color: string }> = {
  create: { icon: <Sparkles size={15} />, color: 'pixel-orange' },
  cozy: { icon: <Heart size={15} />, color: 'pixel-pink' },
  memory: { icon: <Gift size={15} />, color: 'pixel-aqua' },
  couple: { icon: <Users size={15} />, color: 'pixel-green' },
};

export const OurRoom: React.FC<OurRoomProps> = ({ setView }) => {
  const profile = StorageService.getCoupleProfile();
  const audioRef = useRef<AudioContext | null>(null);
  const stateRef = useRef<RoomState>(DEFAULT_ROOM_STATE);
  const [room, setRoom] = useState<RoomState>(() => normalizeRoomState({ ...DEFAULT_ROOM_STATE, ...StorageService.getRoomState() }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>('furniture');
  const [activeSheet, setActiveSheet] = useState<SheetId>(null);
  const [editingName, setEditingName] = useState(false);
  const [toast, setToast] = useState('');

  const getAudio = () => { if (!audioRef.current) { const Ctx = window.AudioContext || (window as any).webkitAudioContext; if (!Ctx) return null; audioRef.current = new Ctx(); } return audioRef.current; };
  const playSuccess = (pitch = 820) => { const ctx = getAudio(); if (!ctx) return; playTone(ctx, pitch, 0.08, 'triangle', 0.08); setTimeout(() => playTone(ctx, pitch + 220, 0.1, 'triangle', 0.08), 50); };
  const pushToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 1500); };
  const saveRoom = useCallback((next: RoomState) => { const normalized = normalizeRoomState(next); stateRef.current = normalized; setRoom(normalized); StorageService.saveRoomState(normalized); }, []);

  useEffect(() => { stateRef.current = room; }, [room]);
  useEffect(() => {
    const onStorage = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.table === 'our_room_state' || detail?.table === 'init') {
        const synced = normalizeRoomState({ ...DEFAULT_ROOM_STATE, ...StorageService.getRoomState() });
        setRoom(synced);
        stateRef.current = synced;
      }
    };
    storageEventTarget.addEventListener('storage-update', onStorage);
    return () => storageEventTarget.removeEventListener('storage-update', onStorage);
  }, []);
  useEffect(() => { if (selectedId && !room.placedItems.some((entry) => entry.uid === selectedId)) setSelectedId(null); }, [room.placedItems, selectedId]);

  const metrics = useMemo(() => getRoomMetrics(room, profile), [room, profile]);
  const playerLevel = useMemo(() => getLevelFromXp(room.xp || 0), [room.xp]);
  const roomLevel = useMemo(() => getRoomLevelFromXp(room.roomXp || 0), [room.roomXp]);
  const bondLevel = useMemo(() => getBondLevelFromXp(room.bondXp || 0), [room.bondXp]);
  const actionCards = useMemo(() => getActionCards(room, profile), [room, profile]);
  const offline = useMemo(() => getOfflineRewards(room, profile), [room, profile]);
  const dailyReward = useMemo(() => getDailyReward(room), [room]);
  const upgradeCards = useMemo(() => getUpgradeCards(room), [room]);
  const taskCards = useMemo(() => getTaskCards(room, profile), [room, profile]);
  const collectionCards = useMemo(() => getCollectionCards(room), [room]);
  const shopEntries = useMemo(() => getShopSummary(room).filter((entry) => entry.item.category === category), [room, category]);
  const themeUnlocks = useMemo(() => getThemeUnlocks(room), [room]);
  const selectedItem = useMemo(() => room.placedItems.find((entry) => entry.uid === selectedId) || null, [room.placedItems, selectedId]);
  const selectedItemName = selectedItem ? (ROOM_SHOP_BY_ID[selectedItem.itemId]?.name || 'Item') : null;
  const taskBadge = taskCards.filter((entry) => !entry.claimed && entry.progress >= entry.goal).length + collectionCards.filter((entry) => !entry.claimed && entry.progress >= entry.goal).length + (dailyReward.eligible ? 1 : 0) + (offline.claimable ? 1 : 0);

  const getNextSlot = () => {
    const occupied = new Set(stateRef.current.placedItems.map((entry) => { const { gx, gy } = percentToGrid(entry); return `${gx}:${gy}`; }));
    const match = preferredSlots.find(([gx, gy]) => !occupied.has(`${gx}:${gy}`));
    return match || [2, 3];
  };

  const runAction = (actionId: RoomActionId) => { const outcome = applyAction(room, actionId, profile); saveRoom(outcome.next); playSuccess(actionId === 'couple' ? 720 : 840); pushToast(`+${outcome.reward.coins} coins | +${outcome.reward.love} love`); };
  const claimIdle = () => { const outcome = claimOfflineRewards(room, profile); saveRoom(outcome.next); playSuccess(760); pushToast(`Claimed ${outcome.reward.coins} coins from offline time`); };
  const claimDaily = () => { const outcome = claimDailyReward(room); saveRoom(outcome.next); playSuccess(880); pushToast(`Daily reward claimed: +${outcome.reward.coins} coins`); };
  const visitPartner = () => { const outcome = performCoupleVisit(room, profile); if (!outcome) return pushToast('Partner visit already done today'); saveRoom(outcome.next); playSuccess(700); pushToast(`Visit complete: +${outcome.reward.love} love`); };
  const sendGift = () => { const outcome = performGift(room); if (!outcome) return pushToast('Gift already sent today'); if ('error' in outcome) return pushToast(outcome.error); saveRoom(outcome.next); playSuccess(740); pushToast('Gift sent and bond increased'); };
  const upgrade = (key: Parameters<typeof buyUpgrade>[1]) => { const next = buyUpgrade(room, key); if (!next) return pushToast('Upgrade is maxed or too expensive'); saveRoom(next); playSuccess(900); pushToast('Upgrade purchased'); };
  const claimTask = (taskId: string) => { const outcome = claimTaskReward(room, taskId, profile); if (!outcome) return pushToast('Task not ready yet'); saveRoom(outcome.next); playSuccess(920); pushToast('Task reward claimed'); };
  const claimCollection = (collectionId: string) => { const outcome = claimCollectionReward(room, collectionId); if (!outcome) return pushToast('Collection reward not ready yet'); saveRoom(outcome.next); playSuccess(940); pushToast('Collection bonus claimed'); };
  const placeNewItem = (itemId: string) => {
    const entry = shopEntries.find((value) => value.item.id === itemId);
    if (!entry) return;
    if (!entry.unlocked) return pushToast('This item unlocks later');
    if (!entry.affordable) return pushToast('Not enough resources');
    const [gx, gy] = getNextSlot();
    const pos = gridToPercent(gx, gy);
    const newItem: RoomPlacedItem = { uid: crypto.randomUUID(), itemId: entry.item.id, x: pos.x, y: pos.y, z: Date.now(), scale: 1, rotation: 0, placedBy: profile.myName };
    const outcome = applyPurchase(room, entry.item, newItem);
    if ('error' in outcome) return pushToast(outcome.error);
    saveRoom(outcome.next); setSelectedId(newItem.uid); playSuccess(820); pushToast(`Placed ${entry.item.name}`);
  };
  const rotateSelected = () => { if (!selectedId) return; saveRoom({ ...room, placedItems: room.placedItems.map((entry) => (entry.uid === selectedId ? { ...entry, rotation: ((entry.rotation || 0) + 90) % 360, z: Date.now() } : entry)) }); };
  const deleteItem = () => {
    if (!selectedId) return;
    const target = room.placedItems.find((entry) => entry.uid === selectedId);
    if (!target) return;
    const fallbackCost = ROOM_SHOP_BY_ID[target.itemId]?.cost || 40;
    const refund = Math.max(8, Math.round((target.purchasePrice || fallbackCost) * 0.45));
    saveRoom({ ...room, coins: room.coins + refund, placedItems: room.placedItems.filter((entry) => entry.uid !== selectedId) });
    setSelectedId(null);
    pushToast(`Refunded ${refund} coins`);
  };
  const onMoveItemGrid = useCallback((id: string, gx: number, gy: number) => { setRoom((prev) => normalizeRoomState({ ...prev, placedItems: prev.placedItems.map((entry) => entry.uid === id ? { ...entry, ...gridToPercent(gx, gy), z: Date.now() } : entry) })); }, []);
  const onDragCommit = useCallback(() => { saveRoom(stateRef.current); }, [saveRoom]);
  const shareRoom = async () => { try { const payload = `ROOM:${btoa(unescape(encodeURIComponent(JSON.stringify(room))))}`; await navigator.clipboard.writeText(payload); pushToast('Room code copied'); } catch { pushToast('Copy failed'); } };
  const onNameSave = (value: string) => { const trimmed = value.trim().slice(0, 32) || 'P1 Room'; saveRoom({ ...room, roomName: trimmed }); setEditingName(false); };
  const applyTheme = (kind: 'wallpaper' | 'floor' | 'ambient', value: string) => { if (kind === 'wallpaper') saveRoom({ ...room, wallpaper: value as RoomState['wallpaper'] }); if (kind === 'floor') saveRoom({ ...room, floor: value as RoomState['floor'] }); if (kind === 'ambient') saveRoom({ ...room, ambient: value as RoomState['ambient'] }); };
  const renderCost = (coins: number, love: number, stars: number) => <div className="flex flex-wrap items-center gap-2 text-[11px] font-black text-white/92"><span className="inline-flex items-center gap-1"><Coins size={11} /> {coins}</span>{love > 0 && <span className="inline-flex items-center gap-1"><Heart size={11} /> {love}</span>}{stars > 0 && <span className="inline-flex items-center gap-1"><Sparkles size={11} /> {stars}</span>}</div>;

  return (
    <div className="relative h-screen overflow-hidden" style={{ background: '#ffcf98', fontFamily: '"Nunito", "Baloo 2", "Nunito Sans", system-ui, sans-serif' }}>
      <style>{`.pixel-frame{border:2px solid #243766;box-shadow:0 4px 0 #17254c}.pixel-blue{background:linear-gradient(180deg,#3d5dad,#2f4c8f)}.pixel-orange{background:linear-gradient(180deg,#ffb12e,#e58a00)}.pixel-green{background:linear-gradient(180deg,#77cf4d,#46a32b)}.pixel-pink{background:linear-gradient(180deg,#f06da8,#d94c83)}.pixel-purple{background:linear-gradient(180deg,#8f78ff,#6f57eb)}.pixel-aqua{background:linear-gradient(180deg,#49d3db,#2098b1)}.pixel-hud{border:2px solid #243766;background:linear-gradient(180deg,#2f4b92,#243b72);box-shadow:0 4px 0 #17254c,inset 0 1px 0 rgba(255,255,255,.14)}.pixel-square{border:2px solid #243766;box-shadow:0 4px 0 rgba(23,37,76,.95), inset 0 1px 0 rgba(255,255,255,.18);image-rendering:pixelated}.pixel-tab{border:2px solid #243766;box-shadow:0 4px 0 rgba(23,37,76,.95), inset 0 1px 0 rgba(255,255,255,.18)}.pixel-dock{border:2px solid #243766;background:linear-gradient(180deg,#2f4b92,#253d74);box-shadow:0 -4px 0 #17254c,inset 0 1px 0 rgba(255,255,255,.12)}.pixel-overlay{background:linear-gradient(180deg,rgba(20,33,69,.84),rgba(20,33,69,.72));border:2px solid #243766;box-shadow:0 4px 0 rgba(23,37,76,.95)}.room-scroll::-webkit-scrollbar{width:10px}.room-scroll::-webkit-scrollbar-track{background:#d8dcff;border-radius:999px}.room-scroll::-webkit-scrollbar-thumb{background:#6f84ff;border:2px solid #d8dcff;border-radius:999px}`}</style>
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(90deg, rgba(243,153,83,.26) 1px, transparent 1px), linear-gradient(rgba(243,153,83,.26) 1px, transparent 1px)', backgroundSize: '72px 72px' }} />
      <div className="absolute inset-0">
        <RoomScene3D room={room} catalogById={ROOM_SHOP_BY_ID} selectedId={selectedId} onSelect={setSelectedId} onMoveItemGrid={onMoveItemGrid} onDragCommit={onDragCommit} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_38%,rgba(255,203,143,.18)_66%,rgba(255,183,116,.42)_100%)]" />

      <div className="relative z-20 flex h-screen flex-col justify-between p-2 sm:p-3">
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <button onClick={() => setView('us')} className="pixel-square pixel-orange flex h-[54px] w-[54px] flex-col items-center justify-center text-[#1f2c52]">
              <ArrowLeft size={18} />
              <span className="text-[9px] font-black leading-none">EXIT</span>
            </button>

            <div className="pixel-hud min-w-0 flex-1 px-2 py-1.5 text-white">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  {!editingName ? (
                    <button onClick={() => setEditingName(true)} className="block max-w-full truncate text-left text-[14px] font-black">
                      {room.roomName}
                    </button>
                  ) : (
                    <input autoFocus defaultValue={room.roomName} onBlur={(e) => onNameSave(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onNameSave((e.target as HTMLInputElement).value); }} className="w-full bg-black/20 px-2 py-1 text-[13px] font-bold outline-none" />
                  )}
                  <div className="truncate text-[9px] font-black text-white/75">{profile.myName} + {profile.partnerName}</div>
                </div>
                <div className="shrink-0 text-right text-[9px] font-black text-white/70">Lv {playerLevel.level}</div>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-white">
                <div className="bg-black/18 px-2 py-1"><div className="flex items-center gap-1 text-[12px] font-black"><Coins size={11} />{room.coins}</div></div>
                <div className="bg-black/18 px-2 py-1"><div className="flex items-center gap-1 text-[12px] font-black"><Heart size={11} />{room.love || 0}</div></div>
                <div className="bg-black/18 px-2 py-1"><div className="flex items-center gap-1 text-[12px] font-black"><Sparkles size={11} />{room.stars || 0}</div></div>
              </div>
            </div>

            <div className="pixel-hud flex h-[54px] w-[54px] flex-col items-center justify-center text-white">
              <div className="text-[18px] font-black leading-none">{bondLevel.level}</div>
              <div className="text-[8px] font-black text-white/72">BOND</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {[{ id: 'shop' as SheetId, icon: <ShoppingBag size={18} />, color: 'pixel-orange', badge: 0 }, { id: 'progress' as SheetId, icon: <TrendingUp size={18} />, color: 'pixel-purple', badge: 0 }, { id: 'tasks' as SheetId, icon: <Target size={18} />, color: 'pixel-pink', badge: taskBadge }, { id: 'customize' as SheetId, icon: <Palette size={18} />, color: 'pixel-green', badge: 0 }, { id: 'progress' as SheetId, icon: <Share2 size={18} />, color: 'pixel-aqua', badge: 0, action: shareRoom }].map((tab, index) => (
              <div key={`${tab.id}-${index}`} className="relative">
                <button onClick={tab.action || (() => setActiveSheet((prev) => (prev === tab.id ? null : tab.id)))} className={`pixel-square ${tab.color} flex h-[46px] w-[46px] flex-col items-center justify-center text-white ${activeSheet === tab.id && !tab.action ? 'translate-y-[1px]' : ''}`}>
                  {tab.icon}
                </button>
                {tab.badge > 0 && <div className="pixel-square absolute -right-1 -top-1 grid h-5 w-5 place-items-center bg-[#90d34d] text-[9px] font-black text-[#17254c]">{tab.badge}</div>}
              </div>
            ))}
          </div>

          <div className="pixel-hud px-2 py-1 text-white">
            <div className="grid grid-cols-3 gap-2">
              {[{ label: 'Player', data: playerLevel, accent: '#f7b339' }, { label: 'Room', data: roomLevel, accent: '#67c4ff' }, { label: 'Bond', data: bondLevel, accent: '#ff6ea7' }].map((entry) => (
                <div key={entry.label}>
                  <div className="flex items-center justify-between text-[9px] font-black"><span>{entry.label}</span><span>{entry.data.level}</span></div>
                  <div className="mt-1 h-1.5 bg-black/25"><div className="h-full" style={{ width: pct(entry.data.progress, entry.data.next), background: entry.accent }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <div className="pixel-overlay max-w-[170px] px-2 py-1 text-white">
              <div className="text-[10px] font-black text-white/74">ROOM</div>
              <div className="truncate text-[12px] font-black">{selectedItemName || room.roomName}</div>
            </div>
            <div className="pixel-overlay px-2 py-1 text-[11px] font-black text-white">{metrics.passiveCoinsPerHour}/h</div>
          </div>

          <AnimatePresence>
            {selectedItem && (
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} className="flex items-center justify-center gap-2">
                <div className="pixel-overlay px-3 py-2 text-[11px] font-black text-white">{selectedItemName}</div>
                <button onClick={rotateSelected} className="pixel-tab pixel-blue inline-flex h-11 items-center gap-1 px-3 text-[11px] font-black text-white"><RotateCw size={13} />Rotate</button>
                <button onClick={deleteItem} className="pixel-tab pixel-pink inline-flex h-11 items-center gap-1 px-3 text-[11px] font-black text-white"><Trash2 size={13} />Remove</button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pixel-dock px-2 py-2">
            <div className="grid grid-cols-4 gap-2">
              {actionCards.map((action) => {
                const hud = ACTION_HUD[action.id];
                return (
                  <button key={action.id} disabled={!action.unlocked} onClick={() => runAction(action.id)} className={`pixel-tab ${hud.color} flex min-h-[62px] flex-col items-center justify-center px-1 text-center text-white disabled:opacity-45`}>
                    <span className="mb-1">{hud.icon}</span>
                    <span className="text-[11px] font-black">{action.label}</span>
                    <span className="mt-0.5 text-[9px] font-black text-white/82">+{action.rewards.coins}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>{toast && <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="fixed left-1/2 top-24 z-[90] -translate-x-1/2 border-2 border-[#243766] bg-[#20335f] px-4 py-2 text-sm font-black text-white shadow-[0_4px_0_#17254c]">{toast}</motion.div>}</AnimatePresence>

      <AnimatePresence>
        {activeSheet && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setActiveSheet(null)} className="fixed inset-0 z-40 bg-[#0f1026]/45 backdrop-blur-[1px]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 240, damping: 28 }} className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[430px] px-2 pb-2">
              <div className="pixel-frame overflow-hidden bg-[linear-gradient(180deg,#233a7e,#1d2e66)] text-white">
                <div className="flex items-center justify-between border-b-2 border-[#243766] bg-[#2c4687] px-3 py-3">
                  <div>
                    <div className="text-[15px] font-black">{activeSheet === 'shop' ? 'Room Shop' : activeSheet === 'progress' ? 'Progress' : activeSheet === 'tasks' ? 'Tasks' : 'Customize'}</div>
                    <div className="text-[11px] font-bold text-white/62">{activeSheet === 'shop' ? 'Buy items and place them into your room' : activeSheet === 'progress' ? 'Upgrades, room power, and milestones' : activeSheet === 'tasks' ? 'Claim rewards and keep momentum going' : 'Pick wallpaper, floor, and lighting'}</div>
                  </div>
                  <button onClick={() => setActiveSheet(null)} className="pixel-square pixel-pink grid h-9 w-9 place-items-center text-white"><X size={14} /></button>
                </div>
                <div className="room-scroll max-h-[74vh] overflow-y-auto px-4 py-4">
                  {activeSheet === 'shop' && (
                    <div className="space-y-3">
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {(Object.keys(CAT_LABEL) as Category[]).map((cat) => (
                          <button key={cat} onClick={() => setCategory(cat)} className="room-chip shrink-0 rounded-full px-3 py-2 text-[11px] font-black text-white" style={{ background: category === cat ? '#f0a631' : '#3553aa' }}>
                            {CAT_LABEL[cat]}
                          </button>
                        ))}
                      </div>
                      <div className="space-y-2">
                        {shopEntries.map(({ item, cost, unlocked, affordable }) => (
                          <button key={item.id} onClick={() => placeNewItem(item.id)} disabled={!unlocked || !affordable} className="room-soft flex w-full items-start gap-3 rounded-[20px] px-3 py-3 text-left text-white disabled:opacity-45" style={{ background: unlocked ? 'linear-gradient(180deg,#2f4fa7,#27428b)' : 'linear-gradient(180deg,#44538c,#394576)' }}>
                            <div className="room-chip h-16 w-16 shrink-0 rounded-[16px] bg-white/8 p-2">{shopIcon(item.kind, item.color)}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-[14px] font-black">{item.name}</div>
                                  <div className="mt-1 text-[11px] font-semibold text-white/72">{item.effectText || 'Adds room value and utility.'}</div>
                                </div>
                                <div className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black">{unlocked ? 'Place' : 'Locked'}</div>
                              </div>
                              <div className="mt-2">{renderCost(cost.coins, cost.love, cost.stars)}</div>
                              {!unlocked && <div className="mt-2 text-[10px] font-black text-[#ffd6a0]">Unlocks at {item.playerLevelReq ? `Player ${item.playerLevelReq}` : item.roomLevelReq ? `Room ${item.roomLevelReq}` : `Bond ${item.bondLevelReq}`}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeSheet === 'progress' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        {[{ label: 'Room score', value: metrics.roomScore }, { label: 'Idle coins', value: `${metrics.passiveCoinsPerHour}/h` }, { label: 'Love gain', value: `${metrics.passiveLovePerHour}/h` }, { label: 'Idle cap', value: `${metrics.idleCapHours.toFixed(0)}h` }].map((card) => (
                          <div key={card.label} className="room-soft rounded-[20px] bg-[linear-gradient(180deg,#314f9f,#29448a)] px-3 py-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/66">{card.label}</div>
                            <div className="mt-1 text-xl font-black">{card.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="room-soft rounded-[22px] bg-[linear-gradient(180deg,#2e4a9b,#284386)] px-3 py-3">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <div className="text-[14px] font-black">Upgrades</div>
                            <div className="text-[11px] font-semibold text-white/68">Keep your core loop getting stronger</div>
                          </div>
                          <button onClick={shareRoom} className="room-chip inline-flex items-center gap-1 rounded-full bg-[#5a75e5] px-3 py-2 text-[11px] font-black text-white"><Share2 size={12} />Share</button>
                        </div>
                        <div className="space-y-2">
                          {upgradeCards.map((upgradeCard) => (
                            <button key={upgradeCard.key} onClick={() => upgrade(upgradeCard.key)} disabled={!upgradeCard.affordable} className="room-soft flex w-full items-start justify-between gap-3 rounded-[18px] bg-[linear-gradient(180deg,#395cb8,#2f4fa6)] px-3 py-3 text-left text-white disabled:opacity-45">
                              <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-black">{upgradeCard.label}</div>
                                <div className="mt-1 text-[11px] font-semibold text-white/72">{upgradeCard.description}</div>
                                <div className="mt-2">{renderCost(upgradeCard.cost.coins, upgradeCard.cost.love, upgradeCard.cost.stars)}</div>
                              </div>
                              <div className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] font-black">Lv. {upgradeCard.level}/{upgradeCard.maxLevel}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
                        {[{ label: 'Unique items', value: metrics.uniqueItems }, { label: 'Collections ready', value: collectionCards.filter((entry) => !entry.claimed && entry.progress >= entry.goal).length }, { label: 'Synergy', value: `${Math.round(metrics.synergyMultiplier * 100)}%` }, { label: 'Theme unlocks', value: themeUnlocks.unlockedWallpapers.length + themeUnlocks.unlockedFloors.length + themeUnlocks.unlockedAmbient.length }].map((card) => (
                          <div key={card.label} className="room-soft rounded-[18px] bg-[linear-gradient(180deg,#314f9f,#29448a)] px-3 py-3">
                            <div className="text-white/62">{card.label}</div>
                            <div className="mt-1 text-lg font-black text-white">{card.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeSheet === 'tasks' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={claimDaily} disabled={!dailyReward.eligible} className="room-soft rounded-[20px] bg-[linear-gradient(180deg,#3356b2,#29438d)] px-3 py-3 text-left text-white disabled:opacity-45"><div className="inline-flex items-center gap-2 text-[13px] font-black"><Target size={14} />Daily reward</div><div className="mt-1 text-[11px] font-semibold text-white/74">Streak {dailyReward.streak}</div><div className="mt-2 text-[12px] font-black">+{dailyReward.reward.coins} coins</div></button>
                        <button onClick={claimIdle} disabled={!offline.claimable} className="room-soft rounded-[20px] bg-[linear-gradient(180deg,#3356b2,#29438d)] px-3 py-3 text-left text-white disabled:opacity-45"><div className="inline-flex items-center gap-2 text-[13px] font-black"><Clock3 size={14} />Offline</div><div className="mt-1 text-[11px] font-semibold text-white/74">{offline.hours.toFixed(1)}h stored</div><div className="mt-2 text-[12px] font-black">+{offline.rewards.coins} coins</div></button>
                        <button onClick={visitPartner} className="room-soft rounded-[20px] bg-[linear-gradient(180deg,#8f59d6,#7342bb)] px-3 py-3 text-left text-white"><div className="inline-flex items-center gap-2 text-[13px] font-black"><Users size={14} />Visit</div><div className="mt-1 text-[11px] font-semibold text-white/74">Daily joint bonus</div></button>
                        <button onClick={sendGift} className="room-soft rounded-[20px] bg-[linear-gradient(180deg,#df5d8f,#c84777)] px-3 py-3 text-left text-white"><div className="inline-flex items-center gap-2 text-[13px] font-black"><Gift size={14} />Gift</div><div className="mt-1 text-[11px] font-semibold text-white/74">Spend 90 coins for bond</div></button>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[14px] font-black">Goals</div>
                        {taskCards.map((task) => (
                          <button key={task.id} onClick={() => claimTask(task.id)} disabled={task.claimed || task.progress < task.goal} className="room-soft flex w-full items-start justify-between gap-3 rounded-[18px] px-3 py-3 text-left text-white disabled:opacity-45" style={{ background: task.tier === 'short' ? 'linear-gradient(180deg,#345fbe,#2c519f)' : task.tier === 'mid' ? 'linear-gradient(180deg,#7c53c3,#6642a8)' : 'linear-gradient(180deg,#d64d78,#bc3e66)' }}>
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-black">{task.title}</div>
                              <div className="mt-1 text-[11px] font-semibold text-white/76">{task.description}</div>
                            </div>
                            <div className="shrink-0 rounded-full bg-white/12 px-2 py-1 text-[10px] font-black">{task.progress}/{task.goal}</div>
                          </button>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <div className="text-[14px] font-black">Collection rewards</div>
                        {collectionCards.map((collection) => (
                          <button key={collection.id} onClick={() => claimCollection(collection.id)} disabled={collection.claimed || collection.progress < collection.goal} className="room-soft flex w-full items-start justify-between gap-3 rounded-[18px] bg-[linear-gradient(180deg,#375fc2,#2e509f)] px-3 py-3 text-left text-white disabled:opacity-45">
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-black">{collection.title}</div>
                              <div className="mt-1 text-[11px] font-semibold text-white/76">{collection.description}</div>
                            </div>
                            <div className="shrink-0 rounded-full bg-white/12 px-2 py-1 text-[10px] font-black">{collection.progress}/{collection.goal}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeSheet === 'customize' && (
                    <div className="space-y-4">
                      {[{ title: 'Wallpaper', kind: 'wallpaper' as const, options: WALL_OPTIONS, unlocked: themeUnlocks.unlockedWallpapers, active: room.wallpaper }, { title: 'Floor', kind: 'floor' as const, options: FLOOR_OPTIONS, unlocked: themeUnlocks.unlockedFloors, active: room.floor }].map((section) => (
                        <div key={section.title}>
                          <div className="mb-2 text-[14px] font-black">{section.title}</div>
                          <div className="grid grid-cols-3 gap-2">
                            {section.options.map((option) => {
                              const unlocked = section.unlocked.includes(option.value);
                              const active = section.active === option.value;
                              return (
                                <button key={option.value} disabled={!unlocked} onClick={() => applyTheme(section.kind, option.value)} className="room-soft rounded-[18px] p-2 text-[11px] font-black text-white disabled:opacity-40" style={{ background: active ? 'linear-gradient(180deg,#f0a631,#d98d10)' : 'linear-gradient(180deg,#3555ad,#2c468f)' }}>
                                  <div className="h-14 rounded-[12px] border-2 border-[#2a2345]" style={{ background: option.swatch }} />
                                  <div className="mt-2">{unlocked ? option.label : 'Locked'}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      <div>
                        <div className="mb-2 text-[14px] font-black">Lighting</div>
                        <div className="grid grid-cols-3 gap-2">
                          {AMBIENT_OPTIONS.map((option) => {
                            const unlocked = themeUnlocks.unlockedAmbient.includes(option.value);
                            const active = room.ambient === option.value;
                            return (
                              <button key={option.value} disabled={!unlocked} onClick={() => applyTheme('ambient', option.value)} className="room-soft rounded-[18px] p-2 text-[11px] font-black text-white disabled:opacity-40" style={{ background: active ? 'linear-gradient(180deg,#f0a631,#d98d10)' : 'linear-gradient(180deg,#3555ad,#2c468f)' }}>
                                <div className="flex h-14 items-center justify-center rounded-[12px] border-2 border-[#2a2345]" style={{ background: 'rgba(255,255,255,.08)' }}>
                                  <div className="h-8 w-8 rounded-full border-2 border-[#2a2345]" style={{ background: option.color }} />
                                </div>
                                <div className="mt-2">{unlocked ? option.label : 'Locked'}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="room-soft rounded-[20px] bg-[linear-gradient(180deg,#314f9f,#29448a)] px-3 py-3">
                        <div className="inline-flex items-center gap-2 text-[13px] font-black"><Wand2 size={14} />Theme unlocks</div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] font-black">
                          <div className="rounded-[14px] bg-white/8 px-2 py-3">{themeUnlocks.unlockedWallpapers.length} walls</div>
                          <div className="rounded-[14px] bg-white/8 px-2 py-3">{themeUnlocks.unlockedFloors.length} floors</div>
                          <div className="rounded-[14px] bg-white/8 px-2 py-3">{themeUnlocks.unlockedAmbient.length} lights</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
