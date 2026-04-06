import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Check, Sparkles, ShoppingCart, Eye } from 'lucide-react';
import { PetStats, ShopItem } from '../types';
import { StorageService } from '../services/storage';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';

const PET_SHOP_ITEMS: ShopItem[] = [
    { id: 'hat_crown', name: 'Tiny Crown', price: 70, category: 'hat', emoji: '👑' },
    { id: 'hat_party', name: 'Party Hat', price: 45, category: 'hat', emoji: '🥳' },
    { id: 'hat_cowboy', name: 'Cowboy Hat', price: 55, category: 'hat', emoji: '🤠' },
    { id: 'hat_wizard', name: 'Wizard Hat', price: 65, category: 'hat', emoji: '🧙‍♂️' },
    { id: 'hat_halo', name: 'Angel Halo', price: 80, category: 'hat', emoji: '😇' },
    { id: 'acc_glasses', name: 'Cool Glasses', price: 50, category: 'accessory', emoji: '🕶️' },
    { id: 'acc_scarf', name: 'Soft Scarf', price: 45, category: 'accessory', emoji: '🧣' },
    { id: 'acc_bow', name: 'Sweet Bow', price: 40, category: 'accessory', emoji: '🎀' },
    { id: 'env_forest', name: 'Forest Mood', price: 95, category: 'environment', emoji: '🌲' },
    { id: 'env_beach', name: 'Beach Mood', price: 95, category: 'environment', emoji: '🏖️' },
    { id: 'env_space', name: 'Space Mood', price: 120, category: 'environment', emoji: '🌌' },
];

interface PetShopProps {
    stats: PetStats;
    onClose: () => void;
    onUpdateStats: (newStats: PetStats) => void;
}

export const PetShop: React.FC<PetShopProps> = ({ stats, onClose, onUpdateStats }) => {
    const [activeTab, setActiveTab] = useState<'hat' | 'accessory' | 'environment'>('hat');
    const [purchasingId, setPurchasingId] = useState<string | null>(null);
    const [showAffordableFirst, setShowAffordableFirst] = useState(true);

    const previewItem = useMemo(() => {
        const equippedId = stats.equipped[activeTab as keyof typeof stats.equipped];
        return PET_SHOP_ITEMS.find(item => item.id === equippedId);
    }, [activeTab, stats.equipped]);

    const visibleItems = useMemo(() => {
        const items = PET_SHOP_ITEMS.filter(i => i.category === activeTab);
        if (!showAffordableFirst) return items;
        return [...items].sort((a, b) => {
            const aOwned = stats.inventory.includes(a.id);
            const bOwned = stats.inventory.includes(b.id);
            const aAffordable = stats.coins >= a.price || aOwned;
            const bAffordable = stats.coins >= b.price || bOwned;
            if (aAffordable !== bAffordable) return aAffordable ? -1 : 1;
            return a.price - b.price;
        });
    }, [activeTab, showAffordableFirst, stats.coins, stats.inventory]);

    const handleBuy = (item: ShopItem) => {
        if (stats.coins < item.price) {
            feedback.error();
            toast.show("Not enough Love Coins!", "error");
            return;
        }

        feedback.playPop();
        setPurchasingId(item.id);

        setTimeout(() => {
            feedback.celebrate();
            const newStats = {
                ...stats,
                coins: stats.coins - item.price,
                inventory: [...stats.inventory, item.id]
            };
            StorageService.savePetStats(newStats);
            onUpdateStats(newStats);
            setPurchasingId(null);
            toast.show(`Purchased ${item.name}!`, "success");
        }, 600);
    };

    const handleEquipToggle = (item: ShopItem) => {
        feedback.tap();
        const categoryKey = item.category as keyof typeof stats.equipped;
        const isCurrentlyEquipped = stats.equipped[categoryKey] === item.id;
        
        const newEquipped = { ...stats.equipped };
        if (isCurrentlyEquipped) {
            delete newEquipped[categoryKey]; // Unequip
        } else {
            newEquipped[categoryKey] = item.id; // Equip
        }

        const newStats = {
            ...stats,
            equipped: newEquipped
        };
        StorageService.savePetStats(newStats);
        onUpdateStats(newStats);
    };

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-6"
        >
            <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="bg-[#f8f9fa] w-full max-w-lg sm:rounded-[2.5rem] rounded-t-[2.5rem] h-[85vh] sm:h-auto sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="p-6 bg-white border-b border-gray-100 flex justify-between items-center relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-yellow-50 text-yellow-500 rounded-xl">
                            <ShoppingCart size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-serif font-bold text-gray-800">Pet Shop</h2>
                            <div className="flex items-center gap-1.5 text-yellow-500 font-bold bg-yellow-50 px-2 py-0.5 rounded-full inline-flex text-xs border border-yellow-100 mt-1">
                                <Sparkles size={12} fill="currentColor" />
                                {stats.coins} Coins
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={() => { feedback.tap(); onClose(); }}
                        className="p-3 bg-gray-50 text-gray-400 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 p-4 bg-white/50 border-b border-gray-100 overflow-x-auto no-scrollbar">
                    {['hat', 'accessory', 'environment'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => { feedback.light(); setActiveTab(tab as any); }}
                            className={`px-5 py-2.5 rounded-2xl font-bold text-sm capitalize transition-all whitespace-nowrap ${
                                activeTab === tab 
                                ? 'bg-tulika-500 text-white shadow-md shadow-tulika-200' 
                                : 'bg-white text-gray-500'
                            }`}
                        >
                            {tab}s
                        </button>
                    ))}
                </div>

                <div className="px-4 pb-3 bg-white/50 border-b border-gray-100 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">Preview</p>
                        <p className="text-xs font-semibold text-gray-700 truncate">
                            {previewItem ? `${previewItem.name} equipped` : `No ${activeTab} equipped`}
                        </p>
                    </div>
                    <button
                        onClick={() => setShowAffordableFirst(prev => !prev)}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all ${showAffordableFirst ? 'bg-tulika-100 text-tulika-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                        <Eye size={12} /> Affordable First
                    </button>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3 pb-8">
                        <AnimatePresence mode="popLayout">
                            {visibleItems.map(item => {
                                const isOwned = stats.inventory.includes(item.id);
                                const isEquipped = stats.equipped[item.category as keyof typeof stats.equipped] === item.id;
                                const isPurchasing = purchasingId === item.id;
                                const coinsNeeded = Math.max(0, item.price - stats.coins);

                                return (
                                    <motion.div 
                                        layout
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.9, opacity: 0 }}
                                        key={item.id} 
                                        className={`p-4 rounded-[2rem] border-2 transition-all relative overflow-hidden flex flex-col items-center text-center ${
                                            isEquipped 
                                                ? 'bg-tulika-50 border-tulika-200' 
                                                : isOwned 
                                                    ? 'bg-white border-white' 
                                                    : 'bg-white border-gray-50'
                                        }`}
                                    >
                                        {/* Purchase Animation Overlay */}
                                        {isPurchasing && (
                                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex items-center justify-center">
                                                <motion.div 
                                                    animate={{ rotate: 360 }} 
                                                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                                >
                                                    <Sparkles className="text-yellow-400" size={24} fill="currentColor" />
                                                </motion.div>
                                            </div>
                                        )}

                                        <span className="text-4xl mb-3 mt-2 block drop-shadow-md">{item.emoji}</span>
                                        <h4 className="font-bold text-gray-800 text-sm mb-1">{item.name}</h4>
                                        {!isOwned && coinsNeeded > 0 && (
                                            <p className="text-[10px] text-rose-500 font-semibold">Need {coinsNeeded} more</p>
                                        )}
                                        
                                        <div className="mt-auto pt-4 w-full">
                                            {!isOwned ? (
                                                <button 
                                                    onClick={() => handleBuy(item)}
                                                    className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                                                        stats.coins >= item.price
                                                            ? 'bg-yellow-100 text-yellow-700'
                                                            : 'bg-gray-100 text-gray-400 opacity-50 cursor-not-allowed'
                                                    }`}
                                                >
                                                    {stats.coins >= item.price ? <Sparkles size={12} fill="currentColor" /> : <Lock size={12} />}
                                                    {item.price} Coins
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={() => handleEquipToggle(item)}
                                                    className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all outline-none ${
                                                        isEquipped 
                                                            ? 'bg-tulika-500 text-white shadow-md shadow-tulika-200' 
                                                            : 'bg-gray-100 text-gray-600'
                                                    }`}
                                                >
                                                    {isEquipped && <Check size={14} strokeWidth={3} />}
                                                    {isEquipped ? 'Equipped' : 'Equip'}
                                                </button>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};
