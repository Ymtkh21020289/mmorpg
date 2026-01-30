const ENEMY_TYPES = {
    // 既存のカカシ（とりあえずボス扱い）
    kakashi: { 
        hp: 100,  
        maxHp: 100, 
        exp: 0,
        speed: 0, 
        attackRange: 0,      // 攻撃を開始する距離
        attackRadius: 10,     // 攻撃が届く距離（射程）
        attackAngle: Math.PI, // 攻撃角度（90度）
        damage: 5,
        chargeTime: 2000,     // 予兆時間（ミリ秒）
        cooldown: 4000,        // 攻撃後の休み時間 
        respawnType: 'static' 
    },
    // 新しい敵：スライム（弱い、群れる、青い）
    slime:   { 
        hp: 30,  
        maxHp: 30,  
        exp: 10, 
        speed: 1, 
        attackRange: 60,
        attackRadius: 80,
        attackAngle: Math.PI / 6, // 狭いけど長い（45度）
        damage: 5,
        chargeTime: 1000,
        cooldown: 2000,
        respawnType: 'group' 
    },
    // 新しい敵：ウルフ（強い、速い、赤い）
    wolf:    { 
        hp: 60,  
        maxHp: 60,  
        exp: 30, 
        speed: 3, 
        attackRange: 80,
        attackRadius: 100,
        attackAngle: Math.PI / 4, // 狭いけど長い（45度）
        damage: 20,
        chargeTime: 1000,
        cooldown: 2000,
        respawnType: 'group' 
    }
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = ENEMY_TYPES;
} 
// もしブラウザ環境なら windowオブジェクトに登録する
else {
    window.ENEMY_TYPES = ENEMY_TYPES;
}
