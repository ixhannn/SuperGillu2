import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  Gift,
  Lock,
  Palette,
  PenLine,
  RotateCw,
  Send,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { CoupleRoomState, ViewState } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { syncEventTarget } from '../services/sync';
import { RoomScene3D } from '../components/room/RoomScene3D';
import { ROOM_SHOP_BY_ID, RoomCatalogItem } from '../components/room/roomCatalog3D';
import {
  normalizeCoupleRoom,
  placeItem,
  removeItem,
  rotateItem,
  moveItem,
  addNote,
  removeNote,
  addGift,
  openGift,
  GIFT_EMOJIS,
  getShopItems,
  isItemMilestoneLocked,
  getMilestoneForItem,
  checkMilestoneUnlocks,
  canPlaceItem,
  MAX_PLACED_ITEMS,
  WALLPAPER_OPTIONS,
  FLOOR_OPTIONS,
  AMBIENT_OPTIONS,
  CATEGORY_LABELS,
  MILESTONE_UNLOCK_RULES,
  RoomCategory,
  MilestoneUnlockRule,
} from '../components/room/roomSoul';

interface OurRoomProps {
  setView: (view: ViewState) => void;
}

type ModalId = 'decorate' | 'note' | 'gift' | 'style' | null;

const loadRoom = (): CoupleRoomState => StorageService.getCoupleRoomState();
const saveRoom = (room: CoupleRoomState): void => StorageService.saveCoupleRoomState(room);

const panelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.76)',
  backdropFilter: 'blur(28px) saturate(145%)',
  WebkitBackdropFilter: 'blur(28px) saturate(145%)',
  border: '1px solid rgba(255,255,255,0.92)',
  boxShadow: '0 18px 44px rgba(87,58,80,0.10)',
};

const softText = 'var(--color-text-secondary, #8D7E87)';
const strongText = 'var(--color-text-primary, #2D1F25)';

const categoryAccent: Record<RoomCategory, string> = {
  romantic: '#ef5da8',
  cozy: '#f59e0b',
  aesthetic: '#8b5cf6',
  fun: '#14b8a6',
  memories: '#3b82f6',
  seasonal: '#10b981',
};

const giftOptionMeta: Record<string, { label: string; tint: string }> = {
  '🎁': { label: 'Ribbon box', tint: '#f9a8d4' },
  '💝': { label: 'Love box', tint: '#f472b6' },
  '🌹': { label: 'Rose', tint: '#fb7185' },
  '💌': { label: 'Letter', tint: '#c084fc' },
  '🧸': { label: 'Plush', tint: '#f59e0b' },
  '🍫': { label: 'Treat', tint: '#8b5e34' },
  '🌸': { label: 'Blossom', tint: '#f9a8d4' },
  '✨': { label: 'Sparkle', tint: '#60a5fa' },
  '🎀': { label: 'Ribbon', tint: '#fb7185' },
  '💎': { label: 'Charm', tint: '#22c55e' },
};

const formatRelativeTime = (iso?: string): string => {
  if (!iso) return 'just now';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const getDaysTogether = (anniversaryDate?: string): number => {
  if (!anniversaryDate) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(anniversaryDate).getTime()) / 86_400_000));
};

const isMilestoneMet = (rule: MilestoneUnlockRule, room: CoupleRoomState, profile: ReturnType<typeof StorageService.getCoupleProfile>) => {
  switch (rule.milestoneType) {
    case 'streak':
      return (profile.streakData?.count || 0) >= rule.threshold;
    case 'date-set':
      return Boolean(profile.anniversaryDate);
    case 'days-together':
      return getDaysTogether(profile.anniversaryDate) >= rule.threshold;
    case 'item-count':
      return room.placedItems.length >= rule.threshold;
    case 'questions-shared':
      return (profile.questions?.length || 0) >= rule.threshold;
    case 'nightlights-shared':
      return ((profile.nightlights?.length || 0) + (profile.presenceTraces?.length || 0)) >= rule.threshold;
    default:
      return false;
  }
};

const getMilestoneProgress = (rule: MilestoneUnlockRule, room: CoupleRoomState, profile: ReturnType<typeof StorageService.getCoupleProfile>) => {
  let current = 0;
  switch (rule.milestoneType) {
    case 'streak':
      current = profile.streakData?.count || 0;
      break;
    case 'date-set':
      current = profile.anniversaryDate ? 1 : 0;
      break;
    case 'days-together':
      current = getDaysTogether(profile.anniversaryDate);
      break;
    case 'item-count':
      current = room.placedItems.length;
      break;
    case 'questions-shared':
      current = profile.questions?.length || 0;
      break;
    case 'nightlights-shared':
      current = (profile.nightlights?.length || 0) + (profile.presenceTraces?.length || 0);
      break;
  }
  return `${Math.min(current, rule.threshold)}/${rule.threshold}`;
};

const getMilestoneSubtitle = (rule: MilestoneUnlockRule, room: CoupleRoomState, profile: ReturnType<typeof StorageService.getCoupleProfile>) => {
  if (isMilestoneMet(rule, room, profile)) return 'Ready to unlock';
  if (rule.milestoneType === 'days-together') {
    const remaining = Math.max(0, rule.threshold - getDaysTogether(profile.anniversaryDate));
    return remaining === 0 ? 'Ready to unlock' : `${remaining} day${remaining === 1 ? '' : 's'} to go`;
  }
  return `${getMilestoneProgress(rule, room, profile)} progress`;
};

const presenceFromState = (presenceState: any, partnerName: string): boolean => {
  if (!presenceState) return false;
  return Object.values(presenceState).some((entries: any) =>
    Array.isArray(entries) && entries.some((entry) => entry?.user === partnerName),
  );
};

const CatalogArtwork: React.FC<{ item: RoomCatalogItem }> = ({ item }) => {
  const outline = '#362848';
  const deep = `${item.color}33`;
  const shine = 'rgba(255,255,255,0.45)';

  const base = (() => {
    if (['desk', 'tv', 'bookshelf', 'fridge'].includes(item.kind)) {
      return (
        <>
          <polygon points="48,22 70,32 48,42 26,32" fill={shine} />
          <polygon points="26,32 48,42 48,58 26,48" fill={item.color} />
          <polygon points="48,42 70,32 70,48 48,58" fill="#8f6b58" opacity="0.32" />
          <rect x="32" y="18" width="20" height="12" rx="4" fill={item.kind === 'tv' ? '#26314f' : item.color} stroke={outline} strokeWidth="2.5" />
          {item.kind === 'tv' && <rect x="36" y="22" width="12" height="6" rx="2" fill="#8ad8ff" />}
        </>
      );
    }
    if (['couch', 'bed', 'pillows', 'beanbag'].includes(item.kind)) {
      return (
        <>
          <polygon points="24,34 48,24 72,34 48,44" fill={shine} />
          <polygon points="24,34 48,44 48,56 24,46" fill={item.color} />
          <polygon points="48,44 72,34 72,46 48,56" fill="#5f4661" opacity="0.28" />
          <rect x="28" y="18" width="16" height="12" rx="5" fill="#f7dbe8" stroke={outline} strokeWidth="2.5" />
          <rect x="46" y="16" width="18" height="14" rx="5" fill={item.color} stroke={outline} strokeWidth="2.5" />
        </>
      );
    }
    if (['lamp', 'lantern', 'candles', 'disco'].includes(item.kind)) {
      return (
        <>
          <rect x="45" y="18" width="6" height="28" rx="2" fill="#72809e" />
          <circle cx="48" cy="18" r="10" fill={item.color} stroke={outline} strokeWidth="2.5" />
          <rect x="36" y="46" width="24" height="6" rx="3" fill="#605673" />
        </>
      );
    }
    if (['plant', 'bonsai', 'flower', 'sunflower', 'cactus'].includes(item.kind)) {
      return (
        <>
          <rect x="36" y="40" width="24" height="14" rx="4" fill="#9b6344" stroke={outline} strokeWidth="2.5" />
          <ellipse cx="48" cy="28" rx="18" ry="14" fill={item.color} stroke={outline} strokeWidth="2.5" />
          <rect x="46" y="22" width="4" height="18" rx="2" fill="#4e8b56" />
        </>
      );
    }
    if (['frame', 'window', 'neon', 'portal', 'projector'].includes(item.kind)) {
      return (
        <>
          <rect x="28" y="10" width="40" height="40" rx="5" fill="#5b445d" stroke={outline} strokeWidth="2.5" />
          <rect x="34" y="16" width="28" height="28" rx="3" fill={item.color} opacity="0.9" />
          {item.kind === 'window' && (
            <>
              <rect x="47" y="16" width="2" height="28" fill="#e8f4ff" />
              <rect x="34" y="29" width="28" height="2" fill="#e8f4ff" />
            </>
          )}
        </>
      );
    }
    return (
      <>
        <polygon points="24,36 48,26 72,36 48,46" fill={shine} />
        <polygon points="24,36 48,46 48,58 24,48" fill={item.color} />
        <polygon points="48,46 72,36 72,48 48,58" fill="#5f4661" opacity="0.28" />
      </>
    );
  })();

  return (
    <div className="relative h-full w-full">
      <svg viewBox="0 0 96 72" className="h-full w-full">
        <polygon points="48,66 84,52 48,38 12,52" fill={deep} />
        <polygon points="48,60 82,48 48,34 14,48" fill="rgba(255,255,255,0.78)" stroke={outline} strokeWidth="2.5" />
        {base}
      </svg>
    </div>
  );
};

const RoomActionButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  accent: string;
  active?: boolean;
  onClick: () => void;
}> = ({ label, icon, accent, active, onClick }) => (
  <motion.button
    whileTap={{ scale: 0.96 }}
    onClick={onClick}
    className="rounded-[1.4rem] px-2 py-3 flex flex-col items-center justify-center gap-1 min-h-[70px]"
    style={{
      ...panelStyle,
      background: active ? `${accent}1A` : 'rgba(255,255,255,0.72)',
      border: active ? `1px solid ${accent}55` : '1px solid rgba(255,255,255,0.92)',
      boxShadow: active ? `0 18px 32px ${accent}1F` : panelStyle.boxShadow,
    }}
  >
    <div style={{ color: active ? accent : strongText }}>{icon}</div>
    <span className="text-[10px] font-semibold tracking-[0.08em]" style={{ color: active ? accent : strongText }}>
      {label}
    </span>
  </motion.button>
);

export const OurRoom: React.FC<OurRoomProps> = ({ setView }) => {
  const profile = StorageService.getCoupleProfile();
  const [room, setRoom] = useState<CoupleRoomState>(loadRoom);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ModalId>(null);
  const [toast, setToast] = useState('');
  const [category, setCategory] = useState<RoomCategory>('romantic');
  const [noteText, setNoteText] = useState('');
  const [giftEmoji, setGiftEmoji] = useState(GIFT_EMOJIS[0]);
  const [giftMsg, setGiftMsg] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [draftRoomName, setDraftRoomName] = useState(room.roomName);
  const [partnerPresent, setPartnerPresent] = useState(false);
  const [remoteActivity, setRemoteActivity] = useState('');
  const stateRef = useRef(room);
  const toastTimer = useRef<number | undefined>(undefined);

  const pushToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  }, []);

  const persist = useCallback((next: CoupleRoomState, actionText?: string) => {
    const stamped = actionText
      ? {
          ...next,
          lastActorName: profile.myName,
          lastActionText: actionText,
          lastTouchedAt: new Date().toISOString(),
        }
      : next;
    const normalized = normalizeCoupleRoom(stamped);
    stateRef.current = normalized;
    setRoom(normalized);
    saveRoom(normalized);
  }, [profile.myName]);

  useEffect(() => {
    stateRef.current = room;
    setDraftRoomName(room.roomName);
  }, [room]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const onStorage = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.table !== 'our_room_state' && detail?.table !== 'init') return;
      const previous = stateRef.current;
      const synced = loadRoom();
      stateRef.current = synced;
      setRoom(synced);
      if (
        synced.lastTouchedAt &&
        synced.lastTouchedAt !== previous.lastTouchedAt &&
        synced.lastActorName &&
        synced.lastActorName !== profile.myName
      ) {
        const activity = `${synced.lastActorName} ${synced.lastActionText || 'updated the room'}`;
        setRemoteActivity(activity);
        pushToast(activity);
      }
    };
    storageEventTarget.addEventListener('storage-update', onStorage);
    return () => storageEventTarget.removeEventListener('storage-update', onStorage);
  }, [profile.myName, pushToast]);

  useEffect(() => {
    const onPresence = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setPartnerPresent(presenceFromState(detail, profile.partnerName));
    };
    syncEventTarget.addEventListener('presence-update', onPresence);
    return () => syncEventTarget.removeEventListener('presence-update', onPresence);
  }, [profile.partnerName]);

  useEffect(() => {
    if (selectedId && !room.placedItems.some((item) => item.uid === selectedId)) {
      setSelectedId(null);
    }
  }, [room.placedItems, selectedId]);

  useEffect(() => {
    const unlocks = checkMilestoneUnlocks(room, profile);
    if (!unlocks.length) return;
    const nextMilestones = [
      ...room.milestoneItems,
      ...unlocks.map((itemId) => ({
        milestoneId: itemId,
        unlockedAt: new Date().toISOString(),
        itemId,
      })),
    ];
    persist({ ...room, milestoneItems: nextMilestones }, 'unlocked something special');
    const names = unlocks.map((itemId) => ROOM_SHOP_BY_ID[itemId]?.name || itemId).join(', ');
    pushToast(`Unlocked: ${names}`);
  }, [
    room.placedItems.length,
    room.milestoneItems.length,
    profile.anniversaryDate,
    profile.questions?.length,
    profile.nightlights?.length,
    profile.presenceTraces?.length,
    profile.streakData?.count,
    persist,
    pushToast,
  ]);

  const selectedItem = useMemo(
    () => room.placedItems.find((item) => item.uid === selectedId) || null,
    [room.placedItems, selectedId],
  );

  const selectedItemName = selectedItem ? ROOM_SHOP_BY_ID[selectedItem.itemId]?.name || 'Item' : null;
  const unopenedGifts = useMemo(
    () => room.gifts.filter((gift) => !gift.opened && gift.from !== profile.myName),
    [room.gifts, profile.myName],
  );
  const partnerNotes = useMemo(
    () => room.notes.filter((note) => note.author !== profile.myName),
    [room.notes, profile.myName],
  );
  const latestPartnerNote = partnerNotes[0];
  const latestGiftForMe = unopenedGifts[0];
  const togetherDays = getDaysTogether(profile.anniversaryDate);
  const shopItems = useMemo(() => getShopItems(room, category), [room, category]);
  const roomSceneState = useMemo(() => ({
    placedItems: room.placedItems,
    coins: 0,
    roomName: room.roomName,
    wallpaper: room.wallpaper as any,
    floor: room.floor as any,
    ambient: room.ambient as any,
  }), [room]);

  const upcomingMilestones = useMemo(
    () =>
      MILESTONE_UNLOCK_RULES
        .filter((rule) => !room.milestoneItems.some((milestone) => milestone.itemId === rule.itemId))
        .slice(0, 3),
    [room.milestoneItems],
  );

  const handlePlace = (itemId: string) => {
    const item = ROOM_SHOP_BY_ID[itemId];
    if (!item) return;
    if (isItemMilestoneLocked(item, room)) {
      const rule = getMilestoneForItem(itemId);
      pushToast(rule ? `Unlocks with ${rule.title.toLowerCase()}` : 'This unlocks later');
      return;
    }
    const next = placeItem(room, item, profile.myName);
    if ('error' in next) {
      pushToast(next.error);
      return;
    }
    persist(next, `placed ${item.name}`);
    const placed = next.placedItems[next.placedItems.length - 1];
    setSelectedId(placed.uid);
    setActiveModal(null);
  };

  const handleRemove = () => {
    if (!selectedId) return;
    persist(removeItem(room, selectedId), `removed ${selectedItemName || 'an item'}`);
    setSelectedId(null);
  };

  const handleRotate = () => {
    if (!selectedId) return;
    persist(rotateItem(room, selectedId), `rotated ${selectedItemName || 'an item'}`);
  };

  const onMoveItemGrid = useCallback((id: string, gx: number, gy: number) => {
    setRoom((previous) => {
      const moved = normalizeCoupleRoom(moveItem(previous, id, gx, gy));
      stateRef.current = moved;
      return moved;
    });
  }, []);

  const onDragCommit = useCallback(() => {
    const current = stateRef.current;
    const movedItem = current.placedItems.find((item) => item.uid === selectedId);
    const movedName = movedItem ? ROOM_SHOP_BY_ID[movedItem.itemId]?.name || 'an item' : 'an item';
    const stamped = normalizeCoupleRoom({
      ...current,
      lastActorName: profile.myName,
      lastActionText: `moved ${movedName}`,
      lastTouchedAt: new Date().toISOString(),
    });
    stateRef.current = stamped;
    setRoom(stamped);
    saveRoom(stamped);
  }, [profile.myName, selectedId]);

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    persist(addNote(room, noteText, profile.myName), 'left a note');
    setNoteText('');
    setActiveModal(null);
    pushToast('Note left in your room');
  };

  const handleSendGift = () => {
    if (!giftMsg.trim()) return;
    persist(addGift(room, profile.myName, giftEmoji, giftMsg), 'left a gift');
    setGiftMsg('');
    setGiftEmoji(GIFT_EMOJIS[0]);
    setActiveModal(null);
    pushToast('Gift waiting in the room');
  };

  const handleOpenGift = (giftId: string) => {
    persist(openGift(room, giftId), 'opened a gift');
    pushToast('Gift opened');
  };

  const applyTheme = (kind: 'wallpaper' | 'floor' | 'ambient', value: string) => {
    const actionLabel = kind === 'wallpaper' ? 'changed the walls' : kind === 'floor' ? 'changed the floor' : 'changed the lighting';
    persist({ ...room, [kind]: value }, actionLabel);
  };

  const commitRoomName = () => {
    const nextName = draftRoomName.trim();
    setEditingName(false);
    if (!nextName || nextName === room.roomName) {
      setDraftRoomName(room.roomName);
      return;
    }
    persist({ ...room, roomName: nextName }, 'renamed the room');
  };

  const handleShare = async () => {
    const shareText = `${room.roomName} is where ${profile.myName} and ${profile.partnerName} keep leaving notes, little gifts, and new memories for each other.`;
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({
          title: room.roomName,
          text: shareText,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        pushToast('Room story copied');
      } else {
        pushToast('Sharing is not available here');
        return;
      }
      pushToast('Shared');
    } catch {
      pushToast('Share cancelled');
    }
  };

  const actions = [
    { id: 'decorate', label: 'Decorate', icon: <Sparkles size={18} />, accent: '#8b5cf6', modal: 'decorate' as const },
    { id: 'note', label: 'Notes', icon: <PenLine size={18} />, accent: '#ef5da8', modal: 'note' as const },
    { id: 'gift', label: 'Gifts', icon: <Gift size={18} />, accent: '#f59e0b', modal: 'gift' as const },
    { id: 'style', label: 'Style', icon: <Palette size={18} />, accent: '#14b8a6', modal: 'style' as const },
    { id: 'share', label: 'Share', icon: <Share2 size={18} />, accent: '#3b82f6', onClick: handleShare },
  ];

  return (
    <div className="min-h-full px-4 pb-8 pt-4">
      <div className="flex items-start justify-between gap-3">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => setView('us')}
          className="h-11 w-11 shrink-0 rounded-[1.2rem] flex items-center justify-center"
          style={panelStyle}
        >
          <ArrowLeft size={18} style={{ color: strongText }} />
        </motion.button>

        <div className="min-w-0 flex-1 text-center px-1">
          {editingName ? (
            <input
              value={draftRoomName}
              onChange={(event) => setDraftRoomName(event.target.value)}
              onBlur={commitRoomName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRoomName();
                if (event.key === 'Escape') {
                  setDraftRoomName(room.roomName);
                  setEditingName(false);
                }
              }}
              autoFocus
              className="mx-auto w-full max-w-[220px] rounded-2xl border border-white/90 bg-white/90 px-3 py-2 text-center text-sm font-semibold outline-none"
              style={{ color: strongText }}
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="mx-auto block max-w-full">
              <p className="truncate text-[1rem] font-semibold tracking-[0.02em]" style={{ color: strongText }}>
                {room.roomName}
              </p>
              <p className="mt-1 text-[0.74rem] font-medium" style={{ color: softText }}>
                {profile.myName} and {profile.partnerName}
              </p>
            </button>
          )}
        </div>

        <div
          className="shrink-0 rounded-[1.2rem] px-3 py-2.5 text-right"
          style={panelStyle}
        >
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em]" style={{ color: softText }}>
            Decor
          </p>
          <p className="mt-1 text-[0.84rem] font-semibold" style={{ color: strongText }}>
            {room.placedItems.length}/{MAX_PLACED_ITEMS}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-[1.35rem] px-4 py-3" style={panelStyle}>
          <div className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: partnerPresent ? '#10b981' : '#f59e0b', boxShadow: partnerPresent ? '0 0 0 4px rgba(16,185,129,0.12)' : '0 0 0 4px rgba(245,158,11,0.12)' }}
            />
            <p className="text-[0.77rem] font-semibold" style={{ color: strongText }}>
              {partnerPresent ? `${profile.partnerName} is here` : `${togetherDays} days together`}
            </p>
          </div>
          <p className="mt-1 text-[0.68rem]" style={{ color: softText }}>
            {partnerPresent ? 'Both of you are in the room right now.' : 'Your shared place keeps growing with you.'}
          </p>
        </div>

        <div className="rounded-[1.35rem] px-4 py-3" style={panelStyle}>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em]" style={{ color: softText }}>
            Recent touch
          </p>
          <p className="mt-1 text-[0.77rem] font-semibold leading-snug" style={{ color: strongText }}>
            {remoteActivity || (room.lastActorName ? `${room.lastActorName} ${room.lastActionText || 'updated the room'}` : 'The room is ready for your next little touch.')}
          </p>
          <p className="mt-1 text-[0.68rem]" style={{ color: softText }}>
            {room.lastTouchedAt ? formatRelativeTime(room.lastTouchedAt) : 'Waiting for the next memory'}
          </p>
        </div>
      </div>

      <div
        className="relative mt-4 overflow-hidden rounded-[2rem]"
        style={{
          ...panelStyle,
          minHeight: '420px',
          height: '56vh',
          maxHeight: '620px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(255,245,248,0.72) 100%)',
        }}
      >
        <div className="absolute inset-0">
          <RoomScene3D
            room={roomSceneState}
            catalogById={ROOM_SHOP_BY_ID}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMoveItemGrid={onMoveItemGrid}
            onDragCommit={onDragCommit}
          />
        </div>

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(255,248,250,0.24) 0%, rgba(255,248,250,0) 18%, rgba(255,241,245,0.18) 100%)',
          }}
        />

        <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
          <div className="max-w-[78%] rounded-[1.2rem] px-3.5 py-2.5" style={panelStyle}>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em]" style={{ color: softText }}>
              Our place
            </p>
            <p className="mt-1 text-[0.8rem] font-medium leading-snug" style={{ color: strongText }}>
              {selectedItemName ? `Selected: ${selectedItemName}` : 'Drag to decorate. Tap to select, rotate, or remove.'}
            </p>
          </div>

          {(partnerNotes.length > 0 || unopenedGifts.length > 0) && (
            <div className="rounded-[1.2rem] px-3 py-2.5 text-right" style={panelStyle}>
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em]" style={{ color: softText }}>
                For you
              </p>
              <p className="mt-1 text-[0.8rem] font-semibold" style={{ color: strongText }}>
                {partnerNotes.length > 0 ? `${partnerNotes.length} note${partnerNotes.length === 1 ? '' : 's'}` : `${unopenedGifts.length} gift${unopenedGifts.length === 1 ? '' : 's'}`}
              </p>
            </div>
          )}
        </div>

        <AnimatePresence>
          {room.placedItems.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute inset-x-4 bottom-28 rounded-[1.5rem] px-4 py-3"
              style={panelStyle}
            >
              <p className="text-[0.82rem] font-semibold" style={{ color: strongText }}>
                Start with one piece you both love.
              </p>
              <p className="mt-1 text-[0.72rem] leading-relaxed" style={{ color: softText }}>
                Add a sofa, a bed, a memory frame, or a soft little lamp and build the room from there.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedItem && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute inset-x-4 bottom-4 flex items-center gap-2"
            >
              <div className="min-w-0 flex-1 rounded-[1.5rem] px-4 py-3" style={panelStyle}>
                <p className="truncate text-[0.8rem] font-semibold" style={{ color: strongText }}>
                  {selectedItemName}
                </p>
                <p className="mt-1 text-[0.68rem]" style={{ color: softText }}>
                  Move it anywhere on the room grid.
                </p>
              </div>
              <motion.button whileTap={{ scale: 0.96 }} onClick={handleRotate} className="rounded-[1.35rem] px-4 py-3" style={panelStyle}>
                <RotateCw size={16} style={{ color: strongText }} />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleRemove}
                className="rounded-[1.35rem] px-4 py-3"
                style={{ ...panelStyle, background: 'rgba(255,241,244,0.88)', border: '1px solid rgba(251,113,133,0.22)' }}
              >
                <Trash2 size={16} color="#e11d48" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {actions.map((action) => (
          <RoomActionButton
            key={action.id}
            label={action.label}
            icon={action.icon}
            accent={action.accent}
            active={action.modal ? activeModal === action.modal : false}
            onClick={() => {
              if (action.modal) {
                setActiveModal(activeModal === action.modal ? null : action.modal);
              } else {
                action.onClick?.();
              }
            }}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-[1.6rem] p-4" style={panelStyle}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em]" style={{ color: softText }}>
                For each other
              </p>
              <p className="mt-1 text-[0.92rem] font-semibold" style={{ color: strongText }}>
                {latestPartnerNote
                  ? `${profile.partnerName} left you a note`
                  : latestGiftForMe
                    ? `${profile.partnerName} left you a gift`
                    : 'Leave something thoughtful in the room today'}
              </p>
            </div>
            {(latestPartnerNote || latestGiftForMe) && (
              <button
                onClick={() => setActiveModal(latestGiftForMe ? 'gift' : 'note')}
                className="rounded-full px-3 py-1.5 text-[0.68rem] font-semibold"
                style={{ background: 'rgba(236,72,153,0.10)', color: '#db2777' }}
              >
                Open
              </button>
            )}
          </div>
          <p className="mt-2 text-[0.76rem] leading-relaxed" style={{ color: softText }}>
            {latestPartnerNote?.text ||
              latestGiftForMe?.message ||
              'Notes, little gifts, and room changes all show up here so the space keeps feeling alive.'}
          </p>
          <div className="mt-3 flex items-center gap-3 text-[0.68rem]" style={{ color: softText }}>
            <span>{partnerNotes.length} notes</span>
            <span>{room.gifts.length} gifts</span>
            <span>{room.placedItems.length} decor pieces</span>
          </div>
        </div>

        {upcomingMilestones[0] && (
          <div className="rounded-[1.6rem] p-4" style={panelStyle}>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em]" style={{ color: softText }}>
              Next meaningful unlock
            </p>
            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.92rem] font-semibold" style={{ color: strongText }}>
                  {upcomingMilestones[0].title}
                </p>
                <p className="mt-1 text-[0.76rem] leading-relaxed" style={{ color: softText }}>
                  {upcomingMilestones[0].description}
                </p>
              </div>
              <div className="rounded-full px-3 py-1.5 text-[0.68rem] font-semibold" style={{ background: 'rgba(139,92,246,0.10)', color: '#7c3aed' }}>
                {getMilestoneSubtitle(upcomingMilestones[0], room, profile)}
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            className="fixed left-1/2 top-20 z-[90] -translate-x-1/2 rounded-full px-4 py-2.5 text-[0.78rem] font-semibold"
            style={panelStyle}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveModal(null)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(32,18,27,0.18)', backdropFilter: 'blur(5px)' }}
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="fixed inset-x-0 bottom-[5.75rem] z-50 mx-auto w-full max-w-md px-4"
            >
              <div className="overflow-hidden rounded-[2rem]" style={{ ...panelStyle, background: 'rgba(255,255,255,0.92)' }}>
                <div className="flex items-center justify-between px-5 pb-3 pt-5">
                  <div>
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em]" style={{ color: softText }}>
                      {activeModal === 'decorate'
                        ? 'Decorate'
                        : activeModal === 'note'
                          ? 'Notes'
                          : activeModal === 'gift'
                            ? 'Gifts'
                            : 'Style'}
                    </p>
                    <h3 className="mt-1 text-[1rem] font-semibold" style={{ color: strongText }}>
                      {activeModal === 'decorate'
                        ? 'Build your room together'
                        : activeModal === 'note'
                          ? 'Leave a soft little message'
                          : activeModal === 'gift'
                            ? 'Place something sweet for your partner'
                            : 'Choose the mood of the room'}
                    </h3>
                  </div>
                  <motion.button whileTap={{ scale: 0.94 }} onClick={() => setActiveModal(null)} className="rounded-full p-2" style={{ background: 'rgba(0,0,0,0.05)' }}>
                    <X size={16} style={{ color: softText }} />
                  </motion.button>
                </div>

                <div className="max-h-[65vh] overflow-y-auto px-5 pb-5" style={{ scrollbarWidth: 'none' }}>
                  {activeModal === 'decorate' && (
                    <div className="space-y-4">
                      <div className="rounded-[1.35rem] p-4" style={{ background: 'rgba(255,247,250,0.9)', border: '1px solid rgba(236,72,153,0.10)' }}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[0.8rem] font-semibold" style={{ color: strongText }}>
                              {canPlaceItem(room) ? 'Choose a piece for the room' : 'The room is full for now'}
                            </p>
                            <p className="mt-1 text-[0.72rem]" style={{ color: softText }}>
                              {room.placedItems.length}/{MAX_PLACED_ITEMS} pieces placed
                            </p>
                          </div>
                          <div className="rounded-full px-3 py-1.5 text-[0.68rem] font-semibold" style={{ background: 'rgba(139,92,246,0.10)', color: '#7c3aed' }}>
                            Long-term space
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                        {(Object.keys(CATEGORY_LABELS) as RoomCategory[]).map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setCategory(cat)}
                            className="shrink-0 rounded-full px-3.5 py-2 text-[0.74rem] font-semibold"
                            style={{
                              background: category === cat ? `${categoryAccent[cat]}16` : 'rgba(0,0,0,0.04)',
                              border: category === cat ? `1px solid ${categoryAccent[cat]}35` : '1px solid transparent',
                              color: category === cat ? categoryAccent[cat] : strongText,
                            }}
                          >
                            {CATEGORY_LABELS[cat]}
                          </button>
                        ))}
                      </div>

                      {upcomingMilestones[0] && (
                        <div className="rounded-[1.35rem] p-4" style={{ background: 'rgba(243,244,255,0.92)', border: '1px solid rgba(99,102,241,0.12)' }}>
                          <p className="text-[0.76rem] font-semibold" style={{ color: strongText }}>
                            Coming next: {ROOM_SHOP_BY_ID[upcomingMilestones[0].itemId]?.name || upcomingMilestones[0].title}
                          </p>
                          <p className="mt-1 text-[0.7rem]" style={{ color: softText }}>
                            {getMilestoneSubtitle(upcomingMilestones[0], room, profile)}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        {shopItems.map(({ item, locked, lockReason }) => (
                          <motion.button
                            key={item.id}
                            whileTap={{ scale: locked ? 1 : 0.98 }}
                            onClick={() => !locked && handlePlace(item.id)}
                            disabled={locked || !canPlaceItem(room)}
                            className="relative rounded-[1.5rem] p-3 text-left"
                            style={{
                              background: locked ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.94)',
                              border: locked ? '1px solid rgba(0,0,0,0.05)' : `1px solid ${item.color}22`,
                              boxShadow: locked ? 'none' : '0 10px 24px rgba(72,50,67,0.06)',
                              opacity: locked ? 0.68 : 1,
                            }}
                          >
                            <div className="h-20 rounded-[1.2rem] p-2" style={{ background: `linear-gradient(180deg, ${item.color}16 0%, rgba(255,255,255,0.9) 100%)` }}>
                              <CatalogArtwork item={item} />
                            </div>
                            <p className="mt-3 text-[0.8rem] font-semibold leading-tight" style={{ color: strongText }}>
                              {item.name}
                            </p>
                            <p className="mt-1 text-[0.66rem] leading-relaxed" style={{ color: softText }}>
                              {locked ? lockReason : 'Tap to place'}
                            </p>
                            {locked && (
                              <div className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.62rem] font-semibold" style={{ background: 'rgba(255,255,255,0.82)', color: softText }}>
                                <Lock size={10} /> Locked for now
                              </div>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeModal === 'note' && (
                    <div className="space-y-4">
                      <div className="rounded-[1.35rem] p-4" style={{ background: 'rgba(255,246,250,0.9)', border: '1px solid rgba(236,72,153,0.10)' }}>
                        <textarea
                          value={noteText}
                          onChange={(event) => setNoteText(event.target.value)}
                          placeholder={`Leave something warm for ${profile.partnerName}...`}
                          maxLength={200}
                          rows={4}
                          className="w-full resize-none bg-transparent text-[0.86rem] leading-relaxed outline-none"
                          style={{ color: strongText }}
                        />
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-[0.68rem]" style={{ color: softText }}>
                            {noteText.length}/200
                          </span>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={handleAddNote}
                            disabled={!noteText.trim()}
                            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[0.74rem] font-semibold text-white"
                            style={{
                              background: noteText.trim() ? 'linear-gradient(135deg, #ef5da8, #d946ef)' : '#d1d5db',
                              boxShadow: noteText.trim() ? '0 10px 20px rgba(239,93,168,0.22)' : 'none',
                            }}
                          >
                            <Send size={13} /> Leave note
                          </motion.button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {room.notes.length === 0 && (
                          <div className="rounded-[1.35rem] p-4 text-[0.76rem]" style={{ background: 'rgba(0,0,0,0.03)', color: softText }}>
                            No notes yet. This is a lovely place to start.
                          </div>
                        )}

                        {room.notes.map((note) => (
                          <div key={note.id} className="rounded-[1.35rem] px-4 py-3" style={{ background: note.color, border: '1px solid rgba(255,255,255,0.92)' }}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[0.82rem] leading-relaxed" style={{ color: strongText }}>
                                  {note.text}
                                </p>
                                <p className="mt-2 text-[0.66rem]" style={{ color: softText }}>
                                  {note.author} - {formatRelativeTime(note.createdAt)}
                                </p>
                              </div>
                              <button onClick={() => persist(removeNote(room, note.id), 'cleared a note')} className="shrink-0 rounded-full p-1.5" style={{ background: 'rgba(255,255,255,0.55)' }}>
                                <X size={12} style={{ color: softText }} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeModal === 'gift' && (
                    <div className="space-y-4">
                      {unopenedGifts.length > 0 && (
                        <div className="space-y-2">
                          {unopenedGifts.map((gift) => (
                            <div key={gift.id} className="rounded-[1.35rem] p-4" style={{ background: 'rgba(255,250,240,0.96)', border: '1px solid rgba(245,158,11,0.12)' }}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[0.8rem] font-semibold" style={{ color: strongText }}>
                                    From {gift.from}
                                  </p>
                                  <p className="mt-1 text-[0.76rem] leading-relaxed" style={{ color: softText }}>
                                    {gift.message}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleOpenGift(gift.id)}
                                  className="rounded-full px-3 py-1.5 text-[0.68rem] font-semibold"
                                  style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}
                                >
                                  Open
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div>
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em]" style={{ color: softText }}>
                          Pick a little gift
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {GIFT_EMOJIS.map((emoji) => {
                            const option = giftOptionMeta[emoji];
                            const active = giftEmoji === emoji;
                            return (
                              <button
                                key={emoji}
                                onClick={() => setGiftEmoji(emoji)}
                                className="rounded-[1.25rem] px-3 py-3 text-left"
                                style={{
                                  background: active ? `${option.tint}16` : 'rgba(0,0,0,0.03)',
                                  border: active ? `1px solid ${option.tint}44` : '1px solid transparent',
                                }}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-[0.8rem] font-semibold" style={{ color: strongText }}>
                                      {option.label}
                                    </p>
                                    <p className="mt-1 text-[0.66rem]" style={{ color: softText }}>
                                      Something small and thoughtful
                                    </p>
                                  </div>
                                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-xl" style={{ background: `${option.tint}20` }}>
                                    {emoji}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-[1.35rem] p-4" style={{ background: 'rgba(255,251,240,0.92)', border: '1px solid rgba(245,158,11,0.10)' }}>
                        <textarea
                          value={giftMsg}
                          onChange={(event) => setGiftMsg(event.target.value)}
                          placeholder={`Add a message for ${profile.partnerName}...`}
                          maxLength={200}
                          rows={4}
                          className="w-full resize-none bg-transparent text-[0.86rem] leading-relaxed outline-none"
                          style={{ color: strongText }}
                        />
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-[0.68rem]" style={{ color: softText }}>
                            {giftMsg.length}/200
                          </span>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={handleSendGift}
                            disabled={!giftMsg.trim()}
                            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[0.74rem] font-semibold text-white"
                            style={{
                              background: giftMsg.trim() ? 'linear-gradient(135deg, #f59e0b, #fb7185)' : '#d1d5db',
                              boxShadow: giftMsg.trim() ? '0 10px 20px rgba(245,158,11,0.24)' : 'none',
                            }}
                          >
                            <Gift size={13} /> Leave gift
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeModal === 'style' && (
                    <div className="space-y-5">
                      <div>
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em]" style={{ color: softText }}>
                          Walls
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          {WALLPAPER_OPTIONS.map((option) => {
                            const active = room.wallpaper === option.value;
                            return (
                              <button
                                key={option.value}
                                onClick={() => applyTheme('wallpaper', option.value)}
                                className="rounded-[1.35rem] p-3 text-left"
                                style={{
                                  background: active ? 'rgba(239,93,168,0.10)' : 'rgba(0,0,0,0.03)',
                                  border: active ? '1px solid rgba(239,93,168,0.24)' : '1px solid transparent',
                                }}
                              >
                                <div className="h-14 rounded-[1rem]" style={{ background: option.swatch }} />
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <span className="text-[0.76rem] font-semibold" style={{ color: strongText }}>
                                    {option.label}
                                  </span>
                                  {active && <Check size={14} color="#db2777" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em]" style={{ color: softText }}>
                          Floor
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          {FLOOR_OPTIONS.map((option) => {
                            const active = room.floor === option.value;
                            return (
                              <button
                                key={option.value}
                                onClick={() => applyTheme('floor', option.value)}
                                className="rounded-[1.35rem] p-3 text-left"
                                style={{
                                  background: active ? 'rgba(59,130,246,0.10)' : 'rgba(0,0,0,0.03)',
                                  border: active ? '1px solid rgba(59,130,246,0.24)' : '1px solid transparent',
                                }}
                              >
                                <div className="h-14 rounded-[1rem]" style={{ background: option.swatch }} />
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <span className="text-[0.76rem] font-semibold" style={{ color: strongText }}>
                                    {option.label}
                                  </span>
                                  {active && <Check size={14} color="#2563eb" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em]" style={{ color: softText }}>
                          Lighting
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          {AMBIENT_OPTIONS.map((option) => {
                            const active = room.ambient === option.value;
                            return (
                              <button
                                key={option.value}
                                onClick={() => applyTheme('ambient', option.value)}
                                className="rounded-[1.35rem] p-3 text-center"
                                style={{
                                  background: active ? `${option.color}16` : 'rgba(0,0,0,0.03)',
                                  border: active ? `1px solid ${option.color}36` : '1px solid transparent',
                                }}
                              >
                                <div className="mx-auto h-11 w-11 rounded-full" style={{ background: option.color, boxShadow: `0 8px 18px ${option.color}33` }} />
                                <div className="mt-2 flex items-center justify-center gap-1.5">
                                  <span className="text-[0.76rem] font-semibold" style={{ color: strongText }}>
                                    {option.label}
                                  </span>
                                  {active && <Check size={14} color={option.color} />}
                                </div>
                              </button>
                            );
                          })}
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
