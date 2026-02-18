const ENEMY_TYPES = {
    // 既存のカカシ（とりあえずボス扱い）
    kakashi: { 
        hp: 10000,  
        maxHp: 10000, 
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
        hp: 45,  
        maxHp: 45,  
        exp: 2, 
        speed: 1, 
        attackRange: 60,
        attackRadius: 80,
        attackAngle: Math.PI / 3, // 狭いけど長い（45度）
        damage: 5,
        chargeTime: 1000,
        cooldown: 2000,
        respawnType: 'group' 
    },
    // 新しい敵：ウルフ（強い、速い、赤い）
    wolf:    { 
        hp: 75,  
        maxHp: 75,  
        exp: 10, 
        speed: 1, 
        attackRange: 80,
        attackRadius: 120,
        attackAngle: Math.PI / 2,
        damage: 20,
        chargeTime: 1000,
        cooldown: 2000,
        respawnType: 'group' 
    },
    golem:   {
        hp: 200,  
        maxHp: 200,  
        exp: 20, 
        speed: 3, 
        attackRange: 80,
        attackRadius: 100,
        attackAngle: Math.PI,
        damage: 30,
        chargeTime: 1000,
        cooldown: 4000,
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
