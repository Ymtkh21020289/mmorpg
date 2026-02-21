const npcs = {
    'merchant_1': { 
        x: 144, y: 48,        // 配置座標
        mapId: 'shop',        // 配置マップ
        name: '道具屋',
        type: 'merchant',
        color: 0x00ff00,       // 緑色（味方っぽい色）
        radius: 30             // 当たり判定の大きさ
    },
    'blacksmith_1': { 
        x: 304, y: 48,        // 配置座標
        mapId: 'shop',        // 配置マップ
        name: '道具屋',
        type: 'blacksmith',
        color: 0x00ff00,       // 緑色（味方っぽい色）
        radius: 30             // 当たり判定の大きさ
    },
    'identifer_1': { 
        x: 304, y: 240,        // 配置座標
        mapId: 'shop',        // 配置マップ
        name: '鑑定屋',
        type: 'identify',
        color: 0x00ff00,       // 緑色（味方っぽい色）
        radius: 30             // 当たり判定の大きさ
    },
    'werehouse': { 
        x: 160, y: 496,        // 配置座標
        mapId: 'town',        // 配置マップ
        name: '倉庫番',
        type: 'warehouse',
        color: 0x00ff00,       // 緑色（味方っぽい色）
        radius: 30             // 当たり判定の大きさ
    },
    'guide': { 
        x: 640, y: 416,        // 配置座標
        mapId: '1023',        // 配置マップ
        name: 'スライムダンジョン',
        type: 'signboard',
        color: 0x0000ff,       // 緑色（味方っぽい色）
        radius: 30             // 当たり判定の大きさ
    }
};

// もしNode.js環境なら module.exports する
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = npcs;
} 
// もしブラウザ環境なら windowオブジェクトに登録する
else {
    window.npcs = npcs;
}
