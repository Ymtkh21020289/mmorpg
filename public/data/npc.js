const NPCs = {
    'merchant_1': { 
        x: 200, y: 300,        // 配置座標
        mapId: 'map_A',        // 配置マップ
        name: '道具屋',
        type: 'merchant',
        color: 0x00ff00,       // 緑色（味方っぽい色）
        radius: 30             // 当たり判定の大きさ
    }
};

// もしNode.js環境なら module.exports する
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = NPCs;
} 
// もしブラウザ環境なら windowオブジェクトに登録する
else {
    window.NPCs = NPCs;
}
