const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// 静的ファイル（publicフォルダの中身）を配信
app.use(express.static(path.join(__dirname, 'public')));

// プレイヤーデータを格納するオブジェクト
let players = {};
let projectiles = {}; // ★追加：発射された魔法弾リスト
let projectileIdCounter = 0; // ID採番用

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

const DROP_TABLE = {
    'slime': { money: 4, items: [{ id: 'slime_gel', rate: 0.5 }, { id: 'dagger', rate: 0.02 }, { id: 'magic_stone', rate: 0.1 }, { id: 'slime_heart', rate: 0.01}] },
    'wolf':  { money: 10, items: [{ id: 'wolf_fur', rate: 0.6 }, { id: 'sword', rate: 0.02 }, { id: 'magic_stone', rate: 0.1 }, { id: 'wolf_heart', rate: 0.01}] },
};

// 1. 敵の種類ごとのステータス定義
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
        chargeTime: 2000,
        cooldown: 4000,
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
        chargeTime: 2000,
        cooldown: 3000,
        respawnType: 'group' 
    }
};

// 2. 現在の敵リスト（初期状態は空にして、関数で生み出します）
let enemies = {};

// 3. 群れを管理するスポーナーの定義
const spawners = [
    // カカシ（単体）
    { type: 'kakashi', x: 600, y: 400, count: 1, radius: 0, room: 'town' },
    // スライムの群れ（Townの左上、5匹、半径100pxに散らばる）
    { type: 'slime',   x: 200, y: 200, count: 5, radius: 100, room: 'adventure', spriteKey: 'slimeSprite' },
    // ウルフの群れ（Adventureマップ、3匹）
    { type: 'wolf',    x: 400, y: 400, count: 3, radius: 150, room: 'adventure', spriteKey: 'wolfSprite'}
];

// --- 関数：群れをスポーンさせる ---
function spawnGroup(spawner) {
    for (let i = 0; i < spawner.count; i++) {
        // ユニークなIDを生成 (例: slime_17123456789_0)
        const id = `${spawner.type}_${Date.now()}_${i}`;
        const template = ENEMY_TYPES[spawner.type];

        // 指定座標の周りにランダムに散らす
        const randomAngle = Math.random() * Math.PI * 2;
        const randomDist = Math.random() * spawner.radius;
        const spawnX = spawner.x + Math.cos(randomAngle) * randomDist;
        const spawnY = spawner.y + Math.sin(randomAngle) * randomDist;

        enemies[id] = {
            id: id,
            x: spawnX,
            y: spawnY,
            hp: template.hp,
            maxHp: template.maxHp,
            speed: template.speed,
            exp: template.exp,      // ★種類ごとの経験値
            spriteKey: spawner.spriteKey,
            room: spawner.room,
            isDead: false,
            spawnerIndex: spawners.indexOf(spawner), // どのスポーナー出身か覚えておく
            respawnType: template.respawnType        // 復活タイプ
        };
    }
    // 全員に通知
    io.emit('currentEnemies', enemies);
}

// サーバー起動時に全スポーナーを稼働
spawners.forEach(spawner => spawnGroup(spawner));

io.on('connection', (socket) => {
    console.log('ユーザー接続: ' + socket.id);

    // 初期データ作成（最初は 'town' にいるとする）
    players[socket.id] = {
        rotation: 0,
        x: 400,
        y: 200,
        playerId: socket.id,
        room: 'town', // ★現在いるマップ情報を追加
        name: 'Player ' + socket.id.substr(0, 4),
        hp: 100,
        maxHp: 100,
        lastDamageTime: 0, // 無敵時間の管理用
        // ★追加：レベルとステータス
        level: 1,
        exp: 0,
        maxExp: 100,   // 次のレベルまでに必要な経験値
        attackPower: 10, // 今の攻撃力
        mp: 50,
        maxMp: 50,
        inventory: [
            { id: 'dagger', count: 1 }, // Slot 0
            { id: 'sword', count: 1 },  // Slot 1
            { id: 'spear', count: 1 },  // Slot 2
            ...Array(27).fill(null)     // Slot 3~29 は空
        ],
        gold: 0 // お金
    };

    // ★Socket.ioの「town」という部屋に参加させる
    socket.join('town');

    // ★ 'town' 部屋にいる人たちだけに、新入り情報を送る
    // io.to('room名').emit(...) で、その部屋の人だけに送信できます
    socket.to('town').emit('newPlayer', players[socket.id]);

    socket.emit('currentEnemies', enemies);

    socket.emit('inventoryUpdate', {
        inventory: players[socket.id].inventory,
        gold: players[socket.id].gold
    });

    // メッセージを受け取る
    socket.on('chatMessage', function (message) {
        console.log(`チャット受信: ${socket.id} -> ${message}`);
        // 全員に送る (送信者ID と メッセージ内容)
        io.emit('chatUpdate', { playerId: socket.id, msg: message });
    });

    socket.on('shootFireball', (angle) => {
        const player = players[socket.id];
        // プレイヤーが生きていて、MPが10以上あるなら
        if (player && !player.isDead && player.mp >= 10) {
            
            // MP消費
            player.mp -= 10;
            
            // 弾丸を生成
            const id = 'p_' + projectileIdCounter++;
            projectiles[id] = {
                id: id,
                ownerId: socket.id, // 誰が撃ったか
                x: player.x,
                y: player.y,
                angle: angle,
                speed: 10, // 弾の速さ
                room: player.room,
                timeLeft: 1000 // 1秒で消える（射程距離）
            };

            // MPが減ったことを本人に通知
            socket.emit('updateStats', {
                level: player.level, exp: player.exp, maxExp: player.maxExp,
                attackPower: player.attackPower, hp: player.hp, 
                mp: player.mp // ★MPも含める
            });
        }
    });

    // 自分に対して、今の部屋にいる他のプレイヤー情報を送る
    // (全プレイヤーから、同じ部屋の人だけをフィルタリングして送る)
    const playersInRoom = {};
    Object.keys(players).forEach(id => {
        if (players[id].room === 'town') {
            playersInRoom[id] = players[id];
        }
    });
    socket.emit('currentPlayers', playersInRoom);

    socket.on('requestEnemies', () => {
        socket.emit('currentEnemies', enemies);
    });

    socket.on('attackEnemy', (data) => {
        const enemy = enemies[data.enemyId];
        const player = players[socket.id];

        if (enemy && !enemy.isDead && player) {
            const sum = player.attackPower + data.damage
            enemy.hp -= sum;
            io.emit('enemyDamaged', { enemyId: data.enemyId, damage: sum });

            if (enemy.hp <= 0) {
                // ★たったこれだけでOK！
                handleEnemyDeath(enemy, player);
            } else {
                io.emit('updateEnemy', enemy);
            }
        }
    });
    // --- 移動処理 ---
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].rotation = movementData.rotation;
            
            // ★ そのプレイヤーがいる部屋の人だけに動きを伝える
            const currentRoom = players[socket.id].room;
            socket.to(currentRoom).emit('playerMoved', players[socket.id]);
        }
    });

    // --- ★ エリア移動リクエスト（クライアントから送られてくる） ---
    socket.on('changeArea', (data) => {
        const currentRoom = players[socket.id].room;
        
        // 1. 今の部屋から出る
        socket.leave(currentRoom);
        // 今の部屋の人たちに「あいつ消えたよ」と伝える
        socket.to(currentRoom).emit('disconnectUser', socket.id);

        // 2. データ更新
        players[socket.id].room = data.mapId;
        // 座標もリセット（例：入り口にワープ）
        players[socket.id].x = data.x; 
        players[socket.id].y = data.y;

        // 3. 新しい部屋に入る
        socket.join(data.mapId);

        // 4. 新しい部屋の人たちに「新入りが来たよ」と伝える
        socket.to(data.mapId).emit('newPlayer', players[socket.id]);

        // 5. 本人に「新しい部屋の現状」を伝える
        const roomPlayers = {};
        Object.keys(players).forEach(id => {
            if (players[id].room === data.mapId) {
                roomPlayers[id] = players[id];
            }
        });
        // クライアント側で「マップ切り替え処理」をするためのイベント
        socket.emit('mapChanged', { room: data.mapId, players: roomPlayers, x: data.x, y: data.y });
    });

    // アイテムの入れ替え要求
    socket.on('swapInventory', (data) => {
        const player = players[socket.id];
        const { from, to } = data;

        // 安全確認（範囲外アクセス防止）
        if (from < 0 || from >= 30 || to < 0 || to >= 30) return;

        // 配列の中身を入れ替え
        const temp = player.inventory[from];
        player.inventory[from] = player.inventory[to];
        player.inventory[to] = temp;

        // 全員ではなく「自分だけ」に更新通知を送ればOK
        socket.emit('inventoryUpdate', { 
            inventory: player.inventory, 
            gold: player.gold 
        });
    });
    
    // 切断時の処理
    socket.on('disconnect', () => {
        console.log('ユーザーが切断しました: ' + socket.id);
        delete players[socket.id];
        io.emit('disconnectUser', socket.id);
    });
    // server.js の io.on('connection') 内に追加

    // ■ アイテムを買う
    socket.on('buyItem', (itemId) => {
        const player = players[socket.id];
        const itemData = ITEMS[itemId];

        if (!player || !itemData) return;

        // お金が足りているか確認
        if (player.gold >= itemData.price) {
            player.gold -= itemData.price;
            addItemToInventory(player, itemId, 1);
            
            // 更新通知
            io.to(socket.id).emit('inventoryUpdate', { inventory: player.inventory, gold: player.gold });
        }
    });

    // ■ クラフト（素材から作る）
    socket.on('craftItem', (recipeIndex) => {
        const player = players[socket.id];
        const recipe = RECIPES[recipeIndex];

        if (!player || !recipe) return;

        // 1. お金（手数料）チェック
        if (player.gold < recipe.cost) return;

        // 2. 素材が足りているかチェック
        // 現在の所持数をカウント
        const materialCounts = {};
        player.inventory.forEach(slot => {
            if (slot) {
                materialCounts[slot.id] = (materialCounts[slot.id] || 0) + slot.count;
            }
        });

        // 足りない素材があったら中止
        for (const [matId, reqCount] of Object.entries(recipe.materials)) {
            if (!materialCounts[matId] || materialCounts[matId] < reqCount) {
                return; // 素材不足
            }
        }

        // --- ここまで来たら作成可能 ---

        // 3. 消費処理
        player.gold -= recipe.cost;

        // 素材を削除する
        for (const [matId, reqCount] of Object.entries(recipe.materials)) {
            let remaining = reqCount;
            // インベントリを走査して減らす
            for (let i = 0; i < player.inventory.length; i++) {
                const slot = player.inventory[i];
                if (slot && slot.id === matId) {
                    if (slot.count > remaining) {
                        slot.count -= remaining;
                        remaining = 0;
                        break;
                    } else {
                        remaining -= slot.count;
                        player.inventory[i] = null; // 使い切ったら空にする
                    }
                }
            }
        }

        // 4. 完成品を渡す
        addItemToInventory(player, recipe.id, 1);

        // 更新通知
        io.to(socket.id).emit('inventoryUpdate', { inventory: player.inventory, gold: player.gold });
    });
    socket.on('sellItem', (slotIndex) => {
        const player = players[socket.id];
        if (!player) return;

        // 指定された場所のアイテムを確認
        const slotItem = player.inventory[slotIndex];
        if (!slotItem) return; // 空っぽなら無視

        const itemData = ITEMS[slotItem.id];
        // データがない、または価格設定がない(0)アイテムは売れない
        if (!itemData || !itemData.price) return;

        // 売値の計算（買値の半分、端数切り捨て）
        const sellPrice = Math.floor(itemData.price / 2);
        
        if (sellPrice <= 0) return; // 0Gなら売れない

        // お金を追加
        player.gold += sellPrice;

        // アイテムを減らす（1個ずつ）
        if (slotItem.count > 1) {
            slotItem.count--;
        } else {
            player.inventory[slotIndex] = null; // なくなったら消す
        }

        // 更新通知
        io.to(socket.id).emit('inventoryUpdate', { 
            inventory: player.inventory, 
            gold: player.gold 
        });
    });
    socket.on('useItem', (slotIndex) => {
        const player = players[socket.id];
        if (!player) return;

        const slotItem = player.inventory[slotIndex];
        if (!slotItem) return;

        const itemData = ITEMS[slotItem.id];
        
        // 消費アイテム(consumable)で、回復効果(heal)がある場合
        if (itemData && itemData.type === 'consumable' && itemData.heal) {
            
            // HPを回復（最大値を超えないように）
            const oldHP = player.hp;
            player.hp = Math.min(player.hp + itemData.heal, player.maxHp);
            
            // もしHPが満タンなら使わない、という判定を入れたい場合はここで return

            // アイテムを減らす
            if (slotItem.count > 1) {
                slotItem.count--;
            } else {
                player.inventory[slotIndex] = null;
            }

            // 更新通知
            // 1. インベントリを更新（アイテムが減ったから）
            io.to(socket.id).emit('inventoryUpdate', { 
                inventory: player.inventory, 
                gold: player.gold 
            });

            // 2. HPを更新（回復したから）
            io.to(socket.id).emit('updateHP', player.hp);
        }
    });
});

// Renderなどの環境では process.env.PORT を使う
const PORT = process.env.PORT || 8080;

http.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});

// --- 敵AIループ（100ミリ秒ごとに実行 = 1秒間に10回） ---
setInterval(() => {
    Object.keys(enemies).forEach((enemyId) => {
        const enemy = enemies[enemyId];
        const stats = ENEMY_TYPES[enemy.type] || ENEMY_TYPES['slime']; // デフォルトはスライム
        if (enemy.isDead) return;
        // 初期化（もしstateがなければ）
        if (!enemy.state) {
            enemy.state = 'moving';
            enemy.timer = 0;
        }
        const now = Date.now();
        // 1. 一番近くにいるプレイヤーを探す
        if (enemy.state === 'moving') {
            let target = null;
            let nearestPlayer = null;
            let minDistance = 999999;

            Object.keys(players).forEach((id) => {
                const player = players[id];
                // 同じ部屋のプレイヤーのみ対象
                if (player.room === enemy.room) {
                    const dx = player.x - enemy.x;
                    const dy = player.y - enemy.y;
                    const dist = Math.sqrt( dx ** 2 + dy ** 2);
                    if (dist < minDistance) {
                        minDistance = dist;
                        nearestPlayer = player;
                        target = { player, dist, dx, dy };
                    }
                }
            });

            // ★修正：プレイヤーが見つかった場合のみ処理を実行（これでエラーが消えます）
            if (nearestPlayer) {
            
                // A. 移動処理（距離が300より近いなら追いかける）
                if ( 300 > minDistance ) {
                    if ( minDistance <= enemy.attackRange) {
                        // ★詠唱開始（足を止める）
                        enemy.state = 'charging';
                        enemy.timer = now + stats.chargeTime; // 攻撃発動時刻
                    
                        // 攻撃方向（角度）を決定
                        enemy.targetAngle = Math.atan2(target.dy, target.dx);

                        // クライアントに「予兆を出せ」と命令
                        io.emit('enemyCharge', {
                            id: enemyId,
                            x: enemy.x,
                            y: enemy.y,
                            angle: enemy.targetAngle,
                            radius: stats.attackRadius,
                            width: stats.attackAngle,
                            duration: stats.chargeTime
                        });
                    } else {
                        const angle = Math.atan2(nearestPlayer.y - enemy.y, nearestPlayer.x - enemy.x);
                        enemy.x += Math.cos(angle) * enemy.speed;
                        enemy.y += Math.sin(angle) * enemy.speed;
                    }
                }
            }
        } else if (enemy.state === 'charging') {
            if (now >= enemy.timer) {
                // 時間経過で攻撃発動！
                performEnemyAttack(enemy, stats);
                
                // クールダウンへ移行
                enemy.state = 'cooldown';
                enemy.timer = now + stats.cooldown;
            }
        }

        // ■ 状態3: クールダウン（疲れて休んでいる）
        else if (enemy.state === 'cooldown') {
            if (now >= enemy.timer) {
                // 休み終わり、また追いかける
                enemy.state = 'moving';
            }
        }   
        // 位置情報を全員に送信
        io.emit('updateEnemy', enemy);
    });
}, 100);

// --- 物理演算ループ（弾の移動とMP回復） ---
setInterval(() => {
    
    // 1. 弾丸の移動と当たり判定
    Object.keys(projectiles).forEach((id) => {
        const p = projectiles[id];
        
        // 移動
        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed;
        p.timeLeft -= 50; // 寿命を減らす

        // 寿命切れなら削除
        if (p.timeLeft <= 0) {
            delete projectiles[id];
            return;
        }

        // 当たり判定（その部屋にいる敵のみ）
        Object.keys(enemies).forEach((enemyId) => {
            const enemy = enemies[enemyId];
            if (enemy.room !== p.room || enemy.isDead) return;

            // 距離判定（当たり判定サイズ: 30px）
            const dist = Math.sqrt((p.x - enemy.x) ** 2 + (p.y - enemy.y) ** 2);
            
            if (dist < 30) {
                // 命中！
                delete projectiles[id]; // 弾は消える

                // ダメージ計算（魔法攻撃力はとりあえず固定20 + レベル補正などにしてもOK）
                const damage = 20;
                enemy.hp -= damage;
                
                // ダメージ通知
                io.emit('enemyDamaged', { enemyId: enemyId, damage: damage });

                if (enemy.hp <= 0) {
                    const owner = players[p.ownerId];
                    if (owner) {
                        // ★ここも関数を呼ぶだけで、群れの再湧きも完璧に動きます！
                        handleEnemyDeath(enemy, owner);
                    }
                } else {
                    // 生きていれば更新通知
                    io.emit('updateEnemy', enemy);
                }
            }
        });
    });

    // 弾の位置情報を全員に送信
    io.emit('updateProjectiles', projectiles);

}, 50); // 50ミリ秒間隔


// --- MP自動回復ループ（1秒に1回） ---
setInterval(() => {
    Object.keys(players).forEach((id) => {
        const player = players[id];
        if (player.mp < player.maxMp) {
            player.mp += 1; // 1秒に1回復
            if (player.mp > player.maxMp) player.mp = player.maxMp;
            
            // 本人に通知
            io.to(id).emit('updateStats', {
                level: player.level, exp: player.exp, maxExp: player.maxExp,
                attackPower: player.attackPower, hp: player.hp, mp: player.mp
            });
        }
    });
}, 1000);

function handleEnemyDeath(enemy, player) {
    // 1. 経験値とレベルアップ処理
    const expGain = enemy.exp;
    player.exp += expGain;
    if (enemy.respawnType === 'group') {
        const targetSpawnerIndex = enemy.spawnerIndex;
        const spawner = spawners[targetSpawnerIndex];
        const table = DROP_TABLE[spawner.type];
        const moneyEarned = table.money; // 本来はランダム幅を持たせてもOK
        player.gold += moneyEarned;
        table.items.forEach(drop => {
            if (Math.random() < drop.rate) { // 確率判定
                addItemToInventory(player, drop.id, 1);
            }
        });
        io.to(player.playerId).emit('inventoryUpdate', { 
            inventory: player.inventory, 
            gold: player.gold 
        });
    }

    if (player.exp >= player.maxExp) {
        player.level++;
        player.exp = 0;
        player.maxExp = Math.floor(player.maxExp * 1.2);
        player.attackPower += 5;
        player.hp = player.maxHp;
        player.mp = player.maxMp;
        io.emit('playerLevelUp', { playerId: player.playerId, level: player.level });
    }

    // プレイヤー本人にステータス更新を通知
    // (socket経由ではなくio.toを使うことで、どこから呼ばれても動くようにする)
    io.to(player.playerId).emit('updateStats', {
        level: player.level, exp: player.exp, maxExp: player.maxExp,
        attackPower: player.attackPower, hp: player.hp, mp: player.mp
    });

    // 2. 死亡・復活処理
    enemy.isDead = true;

    if (enemy.respawnType === 'static') {
        // A. カカシタイプ
        enemy.hp = 0;
        setTimeout(() => {
            enemy.hp = enemy.maxHp;
            enemy.isDead = false;
            io.emit('updateEnemy', enemy);
        }, 5000);
        io.emit('updateEnemy', enemy); 

    } else {
        const targetSpawnerIndex = enemy.spawnerIndex;
        const spawner = spawners[targetSpawnerIndex];
        // B. 群れタイプ
        io.emit('removeEnemy', enemy.id);
        
        // 削除
        delete enemies[enemy.id];

        // 全滅チェック
        const survivors = Object.values(enemies).filter(e => e.spawnerIndex === targetSpawnerIndex);
        
        if (survivors.length === 0) {
            console.log(`群れ全滅！ 10秒後に再スポーンします: ${spawner.type}`);
            setTimeout(() => {
                if (spawners[targetSpawnerIndex]) {
                    spawnGroup(spawners[targetSpawnerIndex]);
                }
            }, 10000);
        }
    }
}

// アイテムをカバンに入れる関数（スタック処理含む）
function addItemToInventory(player, itemId, amount) {
    const itemData = ITEMS[itemId];
    if (!itemData) return;

    // 素材なら、まずスタックできる場所を探す
    if (itemData.type === 'material') {
        const stackSlot = player.inventory.find(slot => 
            slot && slot.id === itemId && slot.count < 1000
        );
        
        if (stackSlot) {
            // スタック可能なら追加（1000個制限）
            const addable = Math.min(amount, 1000 - stackSlot.count);
            stackSlot.count += addable;
            amount -= addable;
        }
    }

    // まだ残っている、または武器なら空きスロットを探す
    if (amount > 0) {
        // 空いているスロットのインデックスを探す
        const emptyIndex = player.inventory.findIndex(slot => slot === null);
        
        if (emptyIndex !== -1) {
            player.inventory[emptyIndex] = { id: itemId, count: amount };
        } else {
            // インベントリがいっぱいの時の処理（今回は省略、本来は地面に落とすなど）
            console.log("Inventory full!");
        }
    }
}

function performEnemyAttack(enemy, stats) {
    // 範囲内にいるプレイヤー全員にダメージ
    for (const pid in players) {
        const p = players[pid];
        // マップチェック（マップ実装済みなら）
        // if (p.mapId !== enemy.mapId) continue;

        const dx = p.x - enemy.x;
        const dy = p.y - enemy.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        // 1. 距離チェック
        if (dist <= stats.attackRadius) {
            // 2. 角度チェック（扇形の中にいるか）
            const angleToPlayer = Math.atan2(dy, dx);
            let angleDiff = angleToPlayer - enemy.targetAngle;

            // 角度の差を -PI ~ PI に正規化（計算上の補正）
            while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

            // 指定した角度の幅（半分）以内ならヒット
            if (Math.abs(angleDiff) <= stats.attackAngle / 2) {
                // ★命中！
                p.hp -= stats.damage;
                nearestPlayer.lastDamageTime = now;
                // 死亡判定などはここに記述
                if (p.hp <= 0) {
                    // リスポーン処理など
                    p.hp = p.maxHp;
                    p.x = 48; p.y = 80; // 仮のリスポーン
                    io.emit('playerRespawn', p);
                } else {
                    io.emit('playerDamaged', { 
                        playerId: p.playerId, 
                        hp: p.hp 
                    });
                }
            }
        }
    }
}
