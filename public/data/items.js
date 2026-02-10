const ITEMS = {
    'dagger': { name: 'ダガー', type: 'weapon', statsRange: { atk: { min: 1, max: 5 }}, range: 45, radius: 60, color: 0xcccccc, price: 20, desc: '初心者のための短剣。\n素早い攻撃が可能。（嘘）' }, // 短い・弱い
    'sword': { name: 'ソード', type: 'weapon',   statsRange: { atk: { min: 7, max: 12 }}, range: 75, radius: 80, color: 0xffff00, price: 100, desc: '初心者のための剣。\n広範囲に攻撃が可能。' }, // 普通・普通
    'spear': { name: 'スピア', type: 'weapon', statsRange: { atk: { min: 2, max: 7 }}, range: 15, radius: 120, color: 0xff0000, price: 200, desc: '初心者のための槍。\n遠くに攻撃が可能。' },
    'leather_helm': { name: '革の帽子', type: 'equipment', slot: 'head',   // 頭装備
        statsRange: {
            def: { min: 2, max: 5 },
            hp:  { min: 0, max: 10 }
        }, price: 50 
    },
    'chain_mail': { name: '鎖帷子', type: 'equipment', slot: 'body',   // 体装備
        statsRange: {
            def: { min: 7, max: 12 }
        },price: 200 
    },
    // --- アクセサリー ---
    'power_ring': { name: '力の指輪', type: 'equipment', slot: 'accessory',
        statsRange: {
            atk: { min: 6, max: 12 },
            def: { min: 1, max: 5 },
        }, price: 500
    },
    'great_axe': { name: 'スゴイ斧', type: 'weapon', statsRange: { atk: { min: 20, max: 60 }}, range: 120, radius: 90, color: 0x00ffff, price: 500, desc: 'スゴイ斧。\n高い攻撃力で一掃が可能。' },
    'wonder_spear': { name: 'めっちゃスゴイ槍', type: 'weapon', statsRange: { atk: { min: 35, max: 45 }}, range: 10, radius: 150, color: 0x00ffff, price: 1000, desc: 'めっちゃスゴイ槍。\n圧倒的射程。' },
    'slime_gel': { name: 'スライムゼリー', type: 'material', price: 2, desc: 'プルプルした謎の物体。\nクラフト素材として使える。' },
    'slime_heart': { name: 'スライムの心', type: 'material', price: 100, desc: '極稀にスライムが落とすアイテム。\nクラフト素材として使える。' },
    'wolf_fur':  { name: 'オオカミの毛皮', type: 'material', price: 5, desc: 'なんかゴワゴワしてる…\nクラフト素材として使える。' },
    'wolf_heart':  { name: 'オオカミの心', type: 'material', price: 200, desc: '極稀にオオカミが落とすアイテム。\nクラフト素材として使える。' },
    'magic_stone': { name: '魔石', type: 'material', price: 10, desc: '光り輝く綺麗な石。\nクラフト素材や強化素材として使える。' },
    'potion': { name: 'ポーション', type: 'consumable', price: 50, heal: 50, desc: 'HPを50回復する。\n冒険の必需品。' }
};

const RECIPES = [
    {
        id: 'great_axe', 
        materials: { 'wolf_fur': 5, 'magic_stone': 1 }, // 必要な素材と数
        cost: 100 // 手数料
    },
    {
        id: 'spear', 
        materials: { 'slime_gel': 10, 'wood': 2 }, // woodは未実装ですが例として
        cost: 50
    },
    {
        id: 'wonder_spear', 
        materials: { 'slime_heart': 1, 'wolf_heart': 1 }, // woodは未実装ですが例として
        cost: 300
    }
];

const RANKS = {
    'C':    { id: 'C', name: 'C', rate: 60,  mult: 1.0, color: '#ffffff' },
    'B':  { id: 'B', name: 'B', rate: 30,  mult: 1.2, color: '#00ff00' },
    'A':      { id: 'A', name: 'A', rate: 8,   mult: 1.5, color: '#0000ff' },
    'S':      { id: 'S', name: 'S', rate: 2, mult: 2.5, color: '#ff8800' }
};

// 確率計算用の重み合計（100になるように調整してありますが、動的に計算します）
const TOTAL_RATE = Object.values(RANKS).reduce((sum, r) => sum + r.rate, 0);

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    // ■ Node.js (サーバー) 用
    // 複数の変数をひとつのオブジェクトにまとめて渡す
    module.exports = {
        ITEMS: ITEMS,
        RECIPES: RECIPES,
        RANKS: RANKS,
        TOTAL_RATE: TOTAL_RATE
    };
} else {
    // ■ ブラウザ (クライアント) 用
    // windowオブジェクトに一つずつくっつける
    window.ITEMS = ITEMS;
    window.RECIPES = RECIPES;
    window.RANKS = RANKS;
    window.TOTAL_RATE = TOTAL_RATE;
}
