const ITEMS = {
    'dagger': { name: 'ダガー', type: 'weapon', damage: 0, range: 45, radius: 60, color: 0xcccccc, price: 20 }, // 短い・弱い
    'sword': { name: 'ソード', type: 'weapon',   damage: 10, range: 75, radius: 80, color: 0xffff00, price: 100 }, // 普通・普通
    'spear': { name: 'スピア', type: 'weapon', damage: 5, range: 15, radius: 120, color: 0xff0000, price: 200 },
    'great_axe': { name: 'スゴイ斧', type: 'weapon', damage: 40, range: 120, radius: 90, color: 0x00ffff, price: 500 },
    'wonder_spear': { name: 'めっちゃスゴイ槍', type: 'weapon', damage: 40, range: 10, radius: 150, color: 0x00ffff, price: 1000 },
    'slime_gel': { name: 'スライムゼリー', type: 'material', price: 2 },
    'slime_heart': { name: 'スライムの心', type: 'material', price: 100 },
    'wolf_fur':  { name: 'オオカミの毛皮', type: 'material', price: 5 },
    'wolf_heart':  { name: 'オオカミの心', type: 'material', price: 200 },
    'magic_stone': { name: '魔石', type: 'material', price: 10 },
    'potion': { name: 'ポーション', type: 'consumable', price: 50, heal: 50 }
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

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    // ■ Node.js (サーバー) 用
    // 複数の変数をひとつのオブジェクトにまとめて渡す
    module.exports = {
        ITEMS: ITEMS,
        RECIPES: RECIPES
    };
} else {
    // ■ ブラウザ (クライアント) 用
    // windowオブジェクトに一つずつくっつける
    window.ITEMS = ITEMS;
    window.RECIPES = RECIPES;
}
