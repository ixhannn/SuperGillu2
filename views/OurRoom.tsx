import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
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
type ToolbarAction = {
  id: string;
  label: string;
  icon: React.ReactElement<{ size?: number; strokeWidth?: number }>;
  accent: string;
  modal?: Exclude<ModalId, null>;
  onClick?: () => void | Promise<void>;
};

const loadRoom = (): CoupleRoomState => StorageService.getCoupleRoomState();
const saveRoom = (room: CoupleRoomState): void => StorageService.saveCoupleRoomState(room);

const strongText = '#1c2750';
const softText = '#8a8a9a';

/* ─── Pixel toolbar constants ─── */
const PIXEL_BORDER = '2px solid #5c3d2e';
const PIXEL_SHADOW = '4px 4px 0px #3a2518';
const NAV_CLEARANCE = 96; // BottomNav = 76px + padding buffer

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

const presenceFromState = (presenceState: any, partnerNames: readonly string[]): boolean => {
  if (!presenceState) return false;
  return Object.values(presenceState).some((entries: any) =>
    Array.isArray(entries) && entries.some((entry) => partnerNames.includes(entry?.user)),
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

// Actions rendered via floating pill + slide-up sheet

export const OurRoom: React.FC<OurRoomProps> = ({ setView }) => {
  const [profile, setProfile] = useState(() => StorageService.getCoupleProfile());
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
  const [knownSelfNames, setKnownSelfNames] = useState<string[]>(() => (profile.myName ? [profile.myName] : []));
  const [knownPartnerNames, setKnownPartnerNames] = useState<string[]>(() => (profile.partnerName ? [profile.partnerName] : []));
  const stateRef = useRef(room);
  const presenceSnapshotRef = useRef<any>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const pushToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  }, []);

  const isMyKnownName = useCallback((name?: string | null) => {
    return Boolean(name && knownSelfNames.includes(name));
  }, [knownSelfNames]);

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
    setRemoteActivity('');
    setRoom(normalized);
    saveRoom(normalized);
  }, [profile.myName]);

  useEffect(() => {
    stateRef.current = room;
    if (!editingName) {
      setDraftRoomName(room.roomName);
    }
  }, [editingName, room]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const onStorage = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      let nextKnownSelfNames = knownSelfNames;
      if (detail?.table === 'couple_profile' || detail?.table === 'init') {
        const nextProfile = StorageService.getCoupleProfile();
        setProfile(nextProfile);
        if (nextProfile.myName) {
          nextKnownSelfNames = nextKnownSelfNames.includes(nextProfile.myName)
            ? nextKnownSelfNames
            : [...nextKnownSelfNames, nextProfile.myName];
          setKnownSelfNames(nextKnownSelfNames);
        }
        if (nextProfile.partnerName) {
          setKnownPartnerNames((current) => (current.includes(nextProfile.partnerName) ? current : [...current, nextProfile.partnerName]));
        }
      }
      if (detail?.table !== 'our_room_state' && detail?.table !== 'init') return;
      const previous = stateRef.current;
      const synced = loadRoom();
      stateRef.current = synced;
      setRoom(synced);
      if (
        synced.lastTouchedAt &&
        synced.lastTouchedAt !== previous.lastTouchedAt &&
        synced.lastActorName &&
        !nextKnownSelfNames.includes(synced.lastActorName)
      ) {
        const activity = `${synced.lastActorName} ${synced.lastActionText || 'updated the room'}`;
        setRemoteActivity(activity);
        pushToast(activity);
      }
    };
    storageEventTarget.addEventListener('storage-update', onStorage);
    return () => storageEventTarget.removeEventListener('storage-update', onStorage);
  }, [knownSelfNames, pushToast]);

  useEffect(() => {
    const onPresence = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      presenceSnapshotRef.current = detail;
      setPartnerPresent(presenceFromState(detail, knownPartnerNames));
    };
    syncEventTarget.addEventListener('presence-update', onPresence);
    return () => syncEventTarget.removeEventListener('presence-update', onPresence);
  }, [knownPartnerNames]);

  useEffect(() => {
    if (!presenceSnapshotRef.current) return;
    setPartnerPresent(presenceFromState(presenceSnapshotRef.current, knownPartnerNames));
  }, [knownPartnerNames]);

  useEffect(() => {
    if (selectedId && !room.placedItems.some((item) => item.uid === selectedId)) {
      setSelectedId(null);
    }
  }, [room.placedItems, selectedId]);

  useEffect(() => {
    const unlocks = checkMilestoneUnlocks(room, profile);
    if (!unlocks.length) return;
    const current = stateRef.current;
    const nextMilestones = [
      ...current.milestoneItems,
      ...unlocks.map((itemId) => ({
        milestoneId: itemId,
        unlockedAt: new Date().toISOString(),
        itemId,
      })),
    ];
    persist({ ...current, milestoneItems: nextMilestones }, 'unlocked something special');
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
    () => room.gifts.filter((gift) => !gift.opened && !isMyKnownName(gift.from)),
    [isMyKnownName, room.gifts],
  );
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
  const incomingSignals = unopenedGifts.length;


  const handlePlace = (itemId: string) => {
    const current = stateRef.current;
    const item = ROOM_SHOP_BY_ID[itemId];
    if (!item) return;
    if (isItemMilestoneLocked(item, current)) {
      const rule = getMilestoneForItem(itemId);
      pushToast(rule ? `Unlocks with ${rule.title.toLowerCase()}` : 'This unlocks later');
      return;
    }
    const next = placeItem(current, item, profile.myName);
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
    persist(removeItem(stateRef.current, selectedId), `removed ${selectedItemName || 'an item'}`);
    setSelectedId(null);
  };

  const handleRotate = () => {
    if (!selectedId) return;
    persist(rotateItem(stateRef.current, selectedId), `rotated ${selectedItemName || 'an item'}`);
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
    setRemoteActivity('');
    setRoom(stamped);
    saveRoom(stamped);
  }, [profile.myName, selectedId]);

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    persist(addNote(stateRef.current, noteText, profile.myName), 'left a note');
    setNoteText('');
    setActiveModal(null);
    pushToast('Note left in your room');
  };

  const handleSendGift = () => {
    if (!giftMsg.trim()) return;
    persist(addGift(stateRef.current, profile.myName, giftEmoji, giftMsg), 'left a gift');
    setGiftMsg('');
    setGiftEmoji(GIFT_EMOJIS[0]);
    setActiveModal(null);
    pushToast('Gift waiting in the room');
  };

  const handleOpenGift = (giftId: string) => {
    persist(openGift(stateRef.current, giftId), 'opened a gift');
    pushToast('Gift opened');
  };

  const applyTheme = (kind: 'wallpaper' | 'floor' | 'ambient', value: string) => {
    const actionLabel = kind === 'wallpaper' ? 'changed the walls' : kind === 'floor' ? 'changed the floor' : 'changed the lighting';
    persist({ ...stateRef.current, [kind]: value }, actionLabel);
  };

  const commitRoomName = () => {
    const current = stateRef.current;
    const nextName = draftRoomName.trim();
    setEditingName(false);
    if (!nextName || nextName === current.roomName) {
      setDraftRoomName(current.roomName);
      return;
    }
    persist({ ...current, roomName: nextName }, 'renamed the room');
  };

  const handleShare = async () => {
    const current = stateRef.current;
    const shareText = `${current.roomName} is where ${profile.myName} and ${profile.partnerName} keep leaving notes, little gifts, and new memories for each other.`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: current.roomName,
          text: shareText,
        });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
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

  const actions: ToolbarAction[] = [
    { id: 'decorate', label: 'Build', icon: <Sparkles size={18} />, accent: '#ff8c42', modal: 'decorate' as const },
    { id: 'note', label: 'Notes', icon: <PenLine size={18} />, accent: '#ef5da8', modal: 'note' as const },
    { id: 'gift', label: 'Gifts', icon: <Gift size={18} />, accent: '#4cc98b', modal: 'gift' as const },
    { id: 'style', label: 'Style', icon: <Palette size={18} />, accent: '#8b5cf6', modal: 'style' as const },
    { id: 'share', label: 'Share', icon: <Share2 size={18} />, accent: '#ffd54f', onClick: handleShare },
  ];

  return (
    <div className="relative" style={{ height: '100dvh', overflow: 'hidden', background: '#0f1219' }}>
      {/* ─── Room Scene (full viewport) ─── */}
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

      {/* Soft vignette edge */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 30%, transparent 55%, rgba(10,12,20,0.3) 100%)' }}
      />

      {/* ─── Floating Header ─── */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 px-3"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
      >
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => setView('us')}
          className="flex h-9 w-9 shrink-0 items-center justify-center"
          style={{
            background: 'linear-gradient(180deg, #f2d4a0, #dbb580)',
            border: PIXEL_BORDER,
            boxShadow: '2px 2px 0 #3a2518',
          }}
        >
          <ArrowLeft size={15} color="#5c3d2e" strokeWidth={2.5} />
        </motion.button>

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
            className="px-3 py-1.5 text-sm font-extrabold outline-none"
            style={{
              color: '#5c3d2e',
              background: '#faf6f0',
              border: PIXEL_BORDER,
              borderRadius: 0,
            }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="flex items-center gap-2 px-3 py-1.5"
            style={{
              background: 'linear-gradient(180deg, #f2d4a0, #dbb580)',
              border: PIXEL_BORDER,
              boxShadow: '2px 2px 0 #3a2518',
            }}
          >
            <h1 className="text-[0.82rem] font-extrabold" style={{ color: '#5c3d2e' }}>{room.roomName}</h1>
            <span className="text-[0.6rem] font-bold" style={{ color: '#8a6d4a' }}>{profile.myName} & {profile.partnerName}</span>
          </button>
        )}

        <div className="flex-1" />

        {partnerPresent && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5"
            style={{
              background: 'linear-gradient(180deg, #a8e6c0, #78d4a0)',
              border: '2px solid #2d7a4e',
              boxShadow: '2px 2px 0 #1a5535',
            }}
          >
            <span className="h-2 w-2" style={{ background: '#2d7a4e' }} />
            <span className="text-[0.68rem] font-extrabold" style={{ color: '#1a5535' }}>{profile.partnerName}</span>
          </div>
        )}
      </div>

      {/* ─── Incoming Signals Badge ─── */}
      {incomingSignals > 0 && (
        <motion.button
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setActiveModal(unopenedGifts.length > 0 ? 'gift' : 'note')}
          className="absolute right-3 z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1.5"
          style={{ top: 'calc(max(12px, env(safe-area-inset-top)) + 48px)', background: 'rgba(244,63,94,0.85)', backdropFilter: 'blur(12px)' }}
        >
          <Gift size={12} color="#fff" />
          <span className="text-[0.68rem] font-bold text-white">{incomingSignals}</span>
        </motion.button>
      )}

      {/* ─── Empty Room Hint ─── */}
      <AnimatePresence>
        {room.placedItems.length === 0 && !activeModal && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-6 bottom-24 z-10 px-4 py-3 text-center"
            style={{
              background: 'linear-gradient(180deg, #f2d4a0, #dbb580)',
              border: PIXEL_BORDER,
              boxShadow: PIXEL_SHADOW,
            }}
          >
            <p className="text-[0.85rem] font-extrabold" style={{ color: '#5c3d2e' }}>Your room is empty</p>
            <p className="mt-1 text-[0.72rem] font-bold" style={{ color: '#8a6d4a' }}>Tap ✨ below to start building together</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Selected Item Controls ─── */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute inset-x-3 z-10 flex items-center gap-2"
            style={{ bottom: `calc(${NAV_CLEARANCE + 62}px + env(safe-area-inset-bottom, 0px))` }}
          >
            <div
              className="min-w-0 flex-1 px-4 py-2"
              style={{
                background: 'linear-gradient(180deg, #f2d4a0, #dbb580)',
                border: PIXEL_BORDER,
                boxShadow: '2px 2px 0 #3a2518',
              }}
            >
              <p className="truncate text-[0.78rem] font-extrabold" style={{ color: '#5c3d2e' }}>{selectedItemName}</p>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleRotate}
              className="flex h-10 w-10 items-center justify-center"
              style={{
                background: 'linear-gradient(180deg, #f2d4a0, #dbb580)',
                border: PIXEL_BORDER,
                boxShadow: '2px 2px 0 #3a2518',
              }}
            >
              <RotateCw size={14} color="#5c3d2e" strokeWidth={2.5} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleRemove}
              className="flex h-10 w-10 items-center justify-center"
              style={{
                background: 'linear-gradient(180deg, #f0a0a0, #d47070)',
                border: '2px solid #7a2020',
                boxShadow: '2px 2px 0 #5a1515',
              }}
            >
              <Trash2 size={14} color="#5a1515" strokeWidth={2.5} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Backdrop (when sheet open) ─── */}
      <AnimatePresence>
        {activeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20"
            style={{ background: 'rgba(0,0,0,0.3)' }}
            onClick={() => setActiveModal(null)}
          />
        )}
      </AnimatePresence>

      {/* ─── Action Sheet ─── */}
      <AnimatePresence>
        {activeModal && (
          <motion.div
            key={activeModal}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="absolute inset-x-0 bottom-0 z-30 flex flex-col"
            style={{
              maxHeight: '55vh',
              paddingBottom: `calc(${NAV_CLEARANCE + 58}px + env(safe-area-inset-bottom, 0px))`,
            }}
          >
            <div
              className="flex flex-col overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #faf6f0 0%, #f0e8d8 100%)',
                flex: '1 1 auto',
                maxHeight: '100%',
                borderTop: PIXEL_BORDER,
                borderLeft: PIXEL_BORDER,
                borderRight: PIXEL_BORDER,
                boxShadow: '0 -4px 0 #3a2518',
              }}
            >
              {/* Drag handle — pixel style */}
              <div className="flex justify-center pb-1 pt-2.5">
                <div style={{ width: 24, height: 4, background: '#c9a06a', border: '1px solid #5c3d2e' }} />
              </div>

              {/* Tab row — pixel buttons */}
              <div className="flex gap-1.5 px-3 pb-2">
                {([
                  { id: 'decorate' as const, label: 'Build' },
                  { id: 'note' as const, label: 'Notes' },
                  { id: 'gift' as const, label: 'Gifts' },
                  { id: 'style' as const, label: 'Style' },
                ] as const).map((tab) => {
                  const isTabActive = activeModal === tab.id;
                  const accent = actions.find(a => a.id === tab.id)?.accent || '#ff8c42';
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveModal(tab.id)}
                      className="px-3 py-1.5 text-[0.7rem] font-extrabold uppercase tracking-wider transition-colors"
                      style={{
                        background: isTabActive ? accent : 'rgba(0,0,0,0.04)',
                        color: isTabActive ? '#fff' : '#5c3d2e',
                        border: isTabActive ? '2px solid #3a2518' : '2px solid transparent',
                        borderRadius: 0,
                        boxShadow: isTabActive ? '2px 2px 0 #3a2518' : 'none',
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Scrollable content */}
              <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto px-3 pb-3" style={{ scrollbarWidth: 'none' }}>

                {activeModal === 'decorate' && (
                  <div className="space-y-3">
                    {/* Category chips */}
                    <div data-lenis-prevent className="lenis-inner flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                      {(Object.keys(CATEGORY_LABELS) as RoomCategory[]).map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setCategory(cat)}
                          className="shrink-0 px-3 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-wider transition-colors"
                          style={{
                            background: category === cat ? categoryAccent[cat] : 'rgba(0,0,0,0.04)',
                            color: category === cat ? '#fff' : '#5c3d2e',
                            border: category === cat ? '2px solid #3a2518' : '2px solid transparent',
                            borderRadius: 0,
                            boxShadow: category === cat ? '2px 2px 0 #3a2518' : 'none',
                          }}
                        >
                          {CATEGORY_LABELS[cat]}
                        </button>
                      ))}
                    </div>

                    {/* Stats + milestone hint */}
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[0.68rem]" style={{ color: softText }}>
                        {room.placedItems.length}/{MAX_PLACED_ITEMS} placed
                      </span>
                      {upcomingMilestones[0] && (
                        <span className="text-[0.68rem]" style={{ color: softText }}>
                          Next: {ROOM_SHOP_BY_ID[upcomingMilestones[0].itemId]?.name || upcomingMilestones[0].title}
                        </span>
                      )}
                    </div>

                    {/* Item grid */}
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {shopItems.map(({ item, locked }) => (
                        <motion.button
                          key={item.id}
                          whileTap={{ scale: locked ? 1 : 0.96 }}
                          onClick={() => !locked && handlePlace(item.id)}
                          disabled={locked || !canPlaceItem(room)}
                          className="relative overflow-hidden rounded-2xl p-2 text-left"
                          style={{
                            background: locked ? 'rgba(0,0,0,0.02)' : '#fff',
                            border: '1.5px solid rgba(0,0,0,0.06)',
                            opacity: locked ? 0.5 : 1,
                          }}
                        >
                          <div className="rounded-xl p-1" style={{ background: `${item.color}12` }}>
                            <div className="h-14">
                              <CatalogArtwork item={item} />
                            </div>
                          </div>
                          <p className="mt-1 truncate text-[0.68rem] font-bold" style={{ color: strongText }}>
                            {item.name}
                          </p>
                          {locked && <Lock size={10} className="absolute right-1.5 top-1.5" color={softText} />}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {activeModal === 'note' && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <textarea
                        value={noteText}
                        onChange={(event) => setNoteText(event.target.value)}
                        placeholder={`A note for ${profile.partnerName}...`}
                        maxLength={200}
                        rows={2}
                        className="flex-1 resize-none rounded-xl bg-white px-3 py-2 text-[0.82rem] outline-none"
                        style={{ color: strongText, border: '1.5px solid rgba(0,0,0,0.08)' }}
                      />
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={handleAddNote}
                        disabled={!noteText.trim()}
                        className="self-end rounded-xl p-2.5"
                        style={{ background: noteText.trim() ? '#ef5da8' : '#e0d8d0', color: '#fff' }}
                      >
                        <Send size={14} />
                      </motion.button>
                    </div>

                    {room.notes.length === 0 && (
                      <p className="px-1 text-[0.72rem]" style={{ color: softText }}>
                        Notes appear here. Leave something warm.
                      </p>
                    )}

                    {room.notes.map((note) => (
                      <div key={note.id} className="rounded-xl px-3 py-2.5" style={{ background: note.color || '#fff5e6', border: '1.5px solid rgba(0,0,0,0.05)' }}>
                        <p className="text-[0.78rem] leading-relaxed" style={{ color: strongText }}>{note.text}</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-[0.65rem]" style={{ color: softText }}>
                            {note.author} • {formatRelativeTime(note.createdAt)}
                          </span>
                          <button
                            onClick={() => persist(removeNote(stateRef.current, note.id), 'cleared a note')}
                            className="p-1 opacity-40 hover:opacity-100"
                          >
                            <X size={11} color={softText} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeModal === 'gift' && (
                  <div className="space-y-3">
                    {/* Unopened gifts */}
                    {unopenedGifts.map((gift) => (
                      <div
                        key={gift.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                        style={{ background: 'rgba(16,185,129,0.08)', border: '1.5px solid rgba(16,185,129,0.15)' }}
                      >
                        <span className="text-xl">{gift.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.78rem] font-bold" style={{ color: strongText }}>From {gift.from}</p>
                          <p className="truncate text-[0.7rem]" style={{ color: softText }}>{gift.message}</p>
                        </div>
                        <button
                          onClick={() => handleOpenGift(gift.id)}
                          className="shrink-0 rounded-full bg-emerald-500 px-3 py-1 text-[0.68rem] font-bold text-white"
                        >
                          Open
                        </button>
                      </div>
                    ))}

                    {/* Emoji picker row */}
                    <div data-lenis-prevent className="lenis-inner flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                      {GIFT_EMOJIS.map((emoji) => {
                        const active = giftEmoji === emoji;
                        return (
                          <button
                            key={emoji}
                            onClick={() => setGiftEmoji(emoji)}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition-transform"
                            style={{
                              background: active ? (giftOptionMeta[emoji]?.tint || '#f9a8d4') : 'rgba(0,0,0,0.04)',
                              border: active ? '2px solid rgba(0,0,0,0.08)' : '2px solid transparent',
                              transform: active ? 'scale(1.15)' : 'scale(1)',
                            }}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </div>

                    {/* Message + send */}
                    <div className="flex gap-2">
                      <textarea
                        value={giftMsg}
                        onChange={(event) => setGiftMsg(event.target.value)}
                        placeholder={`Message for ${profile.partnerName}...`}
                        maxLength={200}
                        rows={2}
                        className="flex-1 resize-none rounded-xl bg-white px-3 py-2 text-[0.82rem] outline-none"
                        style={{ color: strongText, border: '1.5px solid rgba(0,0,0,0.08)' }}
                      />
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={handleSendGift}
                        disabled={!giftMsg.trim()}
                        className="self-end rounded-xl p-2.5"
                        style={{ background: giftMsg.trim() ? '#4cc98b' : '#e0d8d0', color: '#fff' }}
                      >
                        <Gift size={14} />
                      </motion.button>
                    </div>
                  </div>
                )}

                {activeModal === 'style' && (
                  <div className="space-y-4">
                    {/* Walls */}
                    <div>
                      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: softText }}>Walls</p>
                      <div data-lenis-prevent className="lenis-inner flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                        {WALLPAPER_OPTIONS.map((opt) => {
                          const active = room.wallpaper === opt.value;
                          return (
                            <button key={opt.value} onClick={() => applyTheme('wallpaper', opt.value)} className="shrink-0">
                              <div
                                className="h-14 w-14 rounded-xl transition-transform"
                                style={{
                                  background: opt.swatch,
                                  border: active ? '3px solid #ef5da8' : '2px solid rgba(0,0,0,0.06)',
                                  transform: active ? 'scale(1.12)' : 'scale(1)',
                                }}
                              />
                              <p className="mt-1 text-center text-[0.58rem] font-semibold" style={{ color: active ? strongText : softText }}>
                                {opt.label}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Floor */}
                    <div>
                      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: softText }}>Floor</p>
                      <div data-lenis-prevent className="lenis-inner flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                        {FLOOR_OPTIONS.map((opt) => {
                          const active = room.floor === opt.value;
                          return (
                            <button key={opt.value} onClick={() => applyTheme('floor', opt.value)} className="shrink-0">
                              <div
                                className="h-14 w-14 rounded-xl transition-transform"
                                style={{
                                  background: opt.swatch,
                                  border: active ? '3px solid #3b82f6' : '2px solid rgba(0,0,0,0.06)',
                                  transform: active ? 'scale(1.12)' : 'scale(1)',
                                }}
                              />
                              <p className="mt-1 text-center text-[0.58rem] font-semibold" style={{ color: active ? strongText : softText }}>
                                {opt.label}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Lighting */}
                    <div>
                      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: softText }}>Lighting</p>
                      <div data-lenis-prevent className="lenis-inner flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                        {AMBIENT_OPTIONS.map((opt) => {
                          const active = room.ambient === opt.value;
                          return (
                            <button key={opt.value} onClick={() => applyTheme('ambient', opt.value)} className="shrink-0">
                              <div
                                className="h-14 w-14 rounded-full transition-transform"
                                style={{
                                  background: opt.color,
                                  border: active ? `3px solid ${opt.color}` : '2px solid rgba(0,0,0,0.06)',
                                  boxShadow: active ? `0 0 16px ${opt.color}55` : 'none',
                                  transform: active ? 'scale(1.12)' : 'scale(1)',
                                }}
                              />
                              <p className="mt-1 text-center text-[0.58rem] font-semibold" style={{ color: active ? strongText : softText }}>
                                {opt.label}
                              </p>
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
        )}
      </AnimatePresence>

      {/* ─── Pixel Action Toolbar ─── */}
      <div
        className="fixed inset-x-0 z-[55] flex justify-center pointer-events-none"
        style={{ bottom: `calc(${NAV_CLEARANCE}px + env(safe-area-inset-bottom, 0px))` }}
      >
        <div
          className="pointer-events-auto flex items-stretch"
          style={{
            background: 'linear-gradient(180deg, #f2d4a0 0%, #dbb580 60%, #c9a06a 100%)',
            border: PIXEL_BORDER,
            boxShadow: PIXEL_SHADOW,
            borderRadius: 0,
            imageRendering: 'pixelated',
          }}
        >
          {actions.map((action, i) => {
            const isActive = action.modal ? activeModal === action.modal : false;
            return (
              <motion.button
                key={action.id}
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  if (action.modal) {
                    setActiveModal(activeModal === action.modal ? null : action.modal);
                  } else {
                    action.onClick?.();
                  }
                }}
                className="relative flex flex-col items-center justify-center gap-0.5 outline-none touch-manipulation select-none"
                style={{
                  width: 56,
                  height: 52,
                  background: isActive
                    ? 'linear-gradient(180deg, #ffe8c2 0%, #f5d09a 100%)'
                    : 'transparent',
                  borderRight: i < actions.length - 1 ? '2px solid #5c3d2e' : 'none',
                  boxShadow: isActive ? 'inset 0 -3px 0 #b8883e' : 'inset 0 -2px 0 #c9a06a',
                }}
              >
                <div style={{ color: isActive ? action.accent : '#5c3d2e' }}>
                  {React.cloneElement(action.icon, { size: 18, strokeWidth: 2.5 })}
                </div>
                <span
                  style={{
                    fontSize: '0.55rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase' as const,
                    color: isActive ? action.accent : '#5c3d2e',
                    lineHeight: 1,
                  }}
                >
                  {action.label}
                </span>
                {isActive && (
                  <div
                    className="absolute -top-1 left-1/2 -translate-x-1/2"
                    style={{
                      width: 6, height: 6,
                      background: action.accent,
                      border: '1px solid #5c3d2e',
                    }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ─── Toast ─── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            className="absolute left-1/2 z-[90] -translate-x-1/2 px-4 py-2"
            style={{
              top: 'calc(max(12px, env(safe-area-inset-top)) + 48px)',
              background: 'linear-gradient(180deg, #f2d4a0, #dbb580)',
              border: PIXEL_BORDER,
              boxShadow: '2px 2px 0 #3a2518',
            }}
          >
            <span className="text-[0.72rem] font-extrabold" style={{ color: '#5c3d2e' }}>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
