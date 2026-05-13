const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected!'))
    .catch(err => console.error('MongoDB connection error:', err));

app.use(express.static(path.join(__dirname, 'public')));

const createEmptyInventory = () => Array(30).fill(null);

// 装備の初期状態（全部null）
const defaultEquipment = {
    weapon: null,
    head: null,
    body: null,
    accessory1: null,
    accessory2: null,
    accessory3: null
};

const defaultjob = {
        'normal': { level: 1, exp: 0, sp: 0 },
        'warrior': { level: 1, exp: 0, sp: 0 },
        'mage': { level: 1, exp: 0, sp: 0 }
    };

const playerSchema = new mongoose.Schema({
    // --- 必須情報 ---
    username: { type: String, required: true, unique: true }, // 永続化用のID

    // --- 位置・部屋 ---
    x: { type: Number, default: 400 },
    y: { type: Number, default: 200 },
    rotation: { type: Number, default: 0 },
    room: { type: String, default: 'town' },

    // --- ステータス ---
    hp: { type: Number, default: 100 },
    maxHp: { type: Number, default: 100 },
    mp: { type: Number, default: 50 },
    maxMp: { type: Number, default: 50 },
    level: { type: Number, default: 1 },
    exp: { type: Number, default: 0 },
    maxExp: { type: Number, default: 100 }, // レベルアップ計算式があるなら不要かもですが保存用として
    
    // --- 戦闘パラメータ ---
    baseAtk: { type: Number, default: 10 },
    baseDef: { type: Number, default: 0 },
    // totalAtk/totalDef は計算結果なのでDB保存しなくても良いですが、
    // キャッシュとして保存するなら以下のように設定
    totalAtk: { type: Number, default: 10 }, 
    totalDef: { type: Number, default: 0 },
    
    lastDamageTime: { type: Number, default: 0 }, // 基本は0

    // --- 所持品 ---
    gold: { type: Number, default: 1000 },
    
    // インベントリ（Mixed型またはObject配列）
    inventory: { 
        type: Array, 
        default: createEmptyInventory // 関数を渡すと作成時に実行される
    },

    storage: {
        type: Array,
        default: []
    },
    // 装備
    equipment: {
        type: Object,
        default: defaultEquipment
    },

    jobs: {
        type: Object,
        default: defaultjob
    },
    currentJob: { type: String, default: 'normal'} 
});

const PlayerModel = mongoose.model('Player', playerSchema);

// パスは server.js から見た相対パス
const MAP_DATA = require('./public/data/maps.js');
const { ITEMS, RECIPES, RANKS, TOTAL_RATE } = require('./public/data/items.js');
const ENEMY_TYPES = require('./public/data/enemies.js');
const npcs = require('./public/data/npc.js');

// プレイヤーデータを格納するオブジェクト
let players = {};
let savedData = {};
let projectiles = {}; // 発射された魔法弾リスト
let projectileIdCounter = 0; // ID採番用

const DROP_TABLE = {
    'kakashi': { items: [{ id: 'wood', rate: 1}] },
    'slime': { money: 4, items: [{ id: 'slime_gel', rate: 0.2 }, { id: 'dagger', rate: 0.02 }, { id: 'magic_stone', rate: 0.05 }, { id: 'slime_heart', rate: 0.005}] },
    'wolf':  { money: 10, items: [{ id: 'wolf_fur', rate: 0.2 }, { id: 'wolf_crow', rate: 0.1 }, { id: 'sword', rate: 0.02 }, { id: 'magic_stone', rate: 0.05 }, { id: 'wolf_heart', rate: 0.005}] },
    'golem': { money: 20, items: [{ id: 'stone', rate: 0.2 }, { id: 'golem_core', rate: 0.1}, { id: 'spear', rate: 0.02}, { id: 'golem_heart', rate: 0.005}] },
    'kingSlime': { money: 500, items: [{ id: 'slime_gel', rate: 0.99 }, { id: 'slime_sword', rate: 0.05 }, { id: 'magic_stone', rate: 0.5 }, { id: 'kingSlime_heart', rate: 0.01}]}
};

// 現在の敵リスト（初期状態は空にして、関数で生み出す）
let enemies = {};

// 3. 群れを管理するスポーナーの定義
const spawners = [
    // カカシ（単体）
    { type: 'kakashi', x: 600, y: 400, count: 1, radius: 0, room: 'town' },
    // スライムの群れ（Townの左上、5匹、半径100pxに散らばる）
    { type: 'slime',   x: 140, y: 200, count: 5, radius: 75, room: 'adventure', spriteKey: 'slimeSprite' },
    // ウルフの群れ（Adventureマップ、3匹）
    { type: 'wolf',    x: 496, y: 176, count: 3, radius: 100, room: 'adventure', spriteKey: 'wolfSprite'},
    { type: 'wolf',    x: 538, y: 538, count: 3, radius: 80, room: '1021', spriteKey: 'wolfSprite'},
    { type: 'wolf',    x: 538, y: 272, count: 3, radius: 80, room: '1021', spriteKey: 'wolfSprite'},
    { type: 'slime',    x: 1024, y: 256, count: 4, radius: 96, room: '1021', spriteKey: 'slimeSprite'},
    { type: 'slime',    x: 752, y: 512, count: 6, radius: 128, room: '1022', spriteKey: 'slimeSprite'},
    { type: 'golem',    x: 400, y: 1200, count: 1, radius: 128, room: '1022', spriteKey: 'golemSprite'},
    { type: 'golem',    x: 300, y: 600, count: 2, radius: 128, room: '1023', spriteKey: 'golemSprite'},
    { type: 'slime',    x: 1200, y: 3120, count: 4, radius: 128, room: '1100', spriteKey: 'slimeSprite'},
    { type: 'slime',    x: 720, y: 2640, count: 5, radius: 128, room: '1100', spriteKey: 'slimeSprite'},
    { type: 'slime',    x: 240, y: 2160, count: 5, radius: 128, room: '1100', spriteKey: 'slimeSprite'},
    { type: 'slime',    x: 1200, y: 1680, count: 4, radius: 128, room: '1100', spriteKey: 'slimeSprite'},
    { type: 'slime',    x: 1680, y: 2640, count: 4, radius: 128, room: '1100', spriteKey: 'slimeSprite'},
    { type: 'slime',    x: 2640, y: 2160, count: 5, radius: 128, room: '1100', spriteKey: 'slimeSprite'},
    { type: 'slime',    x: 2160, y: 720, count: 6, radius: 128, room: '1100', spriteKey: 'slimeSprite'}
];

const mitigation = 300;

const BOSS_CONFIG = {
    "king_slime": {
        roomId: 'boss1',
        area: { minX: 0, maxX: 960, minY: 0, maxY: 960 }, 
        // ボス出現位置
        spawn: { x: 480, y: 480 },
        // 討伐後のワープ先（街など）
        warpTarget: { map: "1023", x: 576, y: 400 },
        // ステータス
        hp: 3000,
        exp: 360
    },
    "fairy": {
        roomId: 'boss2',
        area: { minX: 0, maxX: 960, minY: 0, maxY: 960 }, 
        // ボス出現位置
        spawn: { x: 480, y: 480 },
        // 討伐後のワープ先（街など）
        warpTarget: { map: "1023", x: 576, y: 400 },
        // ステータス
        hp: 10000,
        exp: 360
    }
};

// ボスの状態管理
let bossState = [
    {
        name: "king_slime",
        active: false,    // 存在するか
        id: null,         // enemiesオブジェクト内のキー
        cooldown: false,  // 討伐直後のクールダウン中か
        warpTimer: null
    },// ワープまでのタイマー
    {
        name: "fairy",
        active: false,    // 存在するか
        id: null,         // enemiesオブジェクト内のキー
        cooldown: false,  // 討伐直後のクールダウン中か
        warpTimer: null
    }
];

// server.js

const JOB_CONFIG = {
    'normal': {
        name: 'ノーマル',
        hpGrowth: 10,      // 1レベルごとのHP上昇値
        atkGrowth: 2,      // 1レベルごとの攻撃力上昇値
        defGrowth: 1,
        mpGrowth: 0,
        allowedWeapons: ['sword', 'axe'] // 装備可能な武器ID
    },
    'warrior': {
        name: 'ウォリアー',
        hpGrowth: 25,
        atkGrowth: 5,      // 1レベルごとの攻撃力上昇値
        defGrowth: 1,
        mpGrowth: 0,
        allowedWeapons: ['sword', 'axe']
    },
    'mage': {
        name: 'メイジ',
        hpGrowth: 8,
        atkGrowth: 8,      // 1レベルごとの攻撃力上昇値
        defGrowth: 1,
        mpGrowth: 0,
        allowedWeapons: ['wand', 'staff']
    }
};

// --- 関数：群れをスポーンさせる ---
function spawnGroup(spawner) {
    const spawnerIndex = spawners.indexOf(spawner);
    for (let i = 0; i < spawner.count; i++) {
        // ユニークなIDを生成 (例: slime_17123456789_0)
        const id = `${spawner.type}_${spawnerIndex}_${Date.now()}_${i}`;
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
            type: spawner.type,
            spriteKey: spawner.spriteKey,
            room: spawner.room,
            isDead: false,
            spawnerIndex: spawners.indexOf(spawner), // どのスポーナー出身か覚えておく
            respawnType: template.respawnType        // 復活タイプ
        };
    }
    // 全員に通知
    console.error(`${enemies} を作成しました。`);
    io.emit('currentEnemies', enemies);
}

// サーバー起動時に全スポーナーを稼働
spawners.forEach(spawner => spawnGroup(spawner));

io.on('connection', (socket) => {
    console.log('ユーザー接続: ' + socket.id);

    // 初期データ作成（最初は 'town' にいるとする）
    socket.on('joinGame', async (username) => {
        if (!username) return;

        // 1. DBから検索、なければ新規作成 (findOneAndUpdate の upsert オプションを利用)
        // new: true → 更新後(作成後)のドキュメントを返す
        // upsert: true → なければ作る
        // setDefaultsOnInsert: true → Schemaのdefault値を適用する
        let dbPlayer = await PlayerModel.findOneAndUpdate(
            { username: username }, // 検索条件
            {}, // 更新内容（ここでは何も更新しない、検索・作成が目的）
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );

        // 2. Mongooseのドキュメントを普通のJSオブジェクトに変換
        let playerData = dbPlayer.toObject();

        // 3. サーバー実行時のみ必要な「一時データ」を合成する
        // （socket.id や name の表示用加工など、DBに保存しない、または毎回変わるもの）
        const player = {
            ...playerData,          // DBのデータを展開（x, y, hp, inventoryなど全部入る）
            id: socket.id,          // 現在のソケットIDで上書き
            playerId: socket.id,    // クライアント側で使っている変数名に合わせる
            name: playerData.username // 表示名はusernameを使う
        };

        initializePlayer(player);
    
        // ★重要: totalAtkなどの再計算が必要ならここで行う
        // updatePlayerStats(player); 

        // 4. メモリ上のリストに追加
        players[socket.id] = player;

        // 5. 送信処理
        socket.emit('currentPlayers', players);
        socket.join(player.room);
        const roomPlayers = {};
        Object.keys(players).forEach(id => {
            if (players[id].room === player.room) {
                roomPlayers[id] = players[id];
            }
        });
        // クライアント側で「マップ切り替え処理」をするためのイベント
        socket.emit('mapChanged', { room: player.room, players: roomPlayers, x: player.x, y: player.y });
        socket.emit('updateStats', {
                level: player.jobs[player.currentJob].level, exp: player.jobs[player.currentJob].exp, maxExp: player.maxExp,
                baseAtk: player.baseAtk, baseDef: player.baseDef, totalAtk: player.totalAtk, totalDef: player.totalDef, hp: player.hp, 
                mp: player.mp, maxMp: player.maxMp, currentJob:player.currentJob // ★MPも含める
            });
        socket.emit('inventoryUpdate', {inventory: player.inventory, gold: player.gold});
        socket.emit('updateStorage', player.storage);
        socket.emit('equipmentUpdate', player.equipment);

        // ★ 'town' 部屋にいる人たちだけに、新入り情報を送る
        // io.to('room名').emit(...) で、その部屋の人だけに送信できます
        socket.to(player.room).emit('newPlayer', player);

        socket.emit('currentEnemies', enemies);
        socket.emit('currentNPCs', npcs);
        socket.emit('inventoryUpdate', {
            inventory: players[socket.id].inventory,
            gold: players[socket.id].gold
        });
        console.log(`${username} が参加しました (Lv.${player.jobs[player.currentJob].level})`);
    });

    // メッセージを受け取る
    socket.on('chatMessage', function (message) {
        console.log(`チャット受信: ${socket.id} -> ${message}`);
        // 全員に送る (送信者ID と メッセージ内容)
        io.emit('chatUpdate', { playerId: socket.id, msg: message });
    });

    socket.on('shootFireball', (data) => {
        const player = players[socket.id];
        // プレイヤーが生きていて、MPが10以上あるなら
        if (player && !player.isDead && player.mp >= data.mp) {
            
            // MP消費
            player.mp -= data.mp;
            
            // 弾丸を生成
            const id = 'p_' + projectileIdCounter++;
            projectiles[id] = {
                id: id,
                ownerId: socket.id, // 誰が撃ったか
                ownerType: 'player',
                x: player.x,
                y: player.y,
                angle: data.angle,
                speed: data.speed, // 弾の速さ
                room: player.room,
                timeLeft: data.time, // 1秒で消える（射程距離）
                damage: data.damage
            };

            // MPが減ったことを本人に通知
            socket.emit('updateStats', {
                level: player.jobs[player.currentJob].level, exp: player.jobs[player.currentJob].exp, maxExp: player.maxExp,
                baseAtk: player.baseAtk, baseDef: player.baseDef, totalAtk: player.totalAtk, totalDef: player.totalDef, hp: player.hp, 
                mp: player.mp, maxMp: player.maxMp, currentJob: player.currentJob // ★MPも含める
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
            const sum = Math.floor(( player.totalAtk + data.damage ) * ( 1 + ( data.ratio / 100 )));
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
        socket.emit('currentNPCs', npcs);
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

    socket.on('equipItem', (inventoryIndex) => {
        const player = players[socket.id];
        if (!player) return;

        // 1. インベントリからアイテムを取得
        const item = player.inventory[inventoryIndex];
        if (!item) return;

        const itemData = ITEMS[item.id];
        if (!itemData || itemData.type !== 'equipment') return; // 装備品じゃなければ終了

        // 2. 装備部位（slot）を確認
        let slot = itemData.slot; // 'head', 'body' 等

        if (slot === 'accessory') {
            if (!player.equipment['accessory1']) {
                slot = 'accessory1';
            } else if (!player.equipment['accessory2']) {
                slot = 'accessory2';
            } else if (!player.equipment['accessory3']) {
                slot = 'accessory3';
            } else {
                // 全部埋まっている場合は、とりあえず1番目と交換（またはエラーにする）
                slot = 'accessory1';
            }
        }
        
        // 3. 今その部位に装備しているものがあるか？
        const currentEquipped = player.equipment[slot];

        // 4. トレード処理
        // 新しい装備をスロットに入れる
        player.equipment[slot] = item;
        
        // インベントリの元の場所には、
        // 「これまで装備していたもの」を戻す（交換）。なければ null（空）にする。
        player.inventory[inventoryIndex] = currentEquipped;

        // 5. ステータスを再計算
        updatePlayerStats(player);

        // 6. クライアントにインベントリと装備の更新を通知
        socket.emit('inventoryUpdate', {inventory: player.inventory, gold: player.gold});
        socket.emit('equipmentUpdate', player.equipment);
        savePlayer(player);
    });

    socket.on('unequipItem', (slotName) => {
        const player = players[socket.id];
        if (!player) return;

        // 指定されたスロットに装備があるか？
        const item = player.equipment[slotName];
        if (!item) return;

        // インベントリに空きがあるか確認（簡易的に制限なしならpushでOK）
        // 実際はMAX個数チェックなどを入れる
        const emptyIndex = player.inventory.findIndex(slot => slot === null);
        
        if (emptyIndex !== -1) {
            player.inventory[emptyIndex] = { id: item.id, rank: item.rank, stats: item.stats, count: 1};
            savePlayer(player);
        } else {
            // インベントリがいっぱいの時の処理（今回は省略、本来は地面に落とすなど）
            console.log("Inventory full!");
        }

        // 装備スロットを空にする
        player.equipment[slotName] = null;

        // ステータス再計算
        updatePlayerStats(player);

        // クライアントに通知
        socket.emit('inventoryUpdate', { inventory: player.inventory, gold: player.gold });
        socket.emit('equipmentUpdate', player.equipment);
        savePlayer(player);
    });
    
    // 切断時の処理
    socket.on('disconnect', () => {
        console.log('ユーザーが切断しました: ' + socket.id);
        delete players[socket.id];
        io.emit('disconnectUser', socket.id);
    });
    // server.js の io.on('connection') 内に追加

    socket.on('forceRespawn', () => {
        const player = players[socket.id];
        if (!player) return;
        player.hp = player.maxHp;
        player.x = 48; player.y = 80;
        socket.emit('playerRespawn', player);
    });

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
            savePlayer(player);
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
        savePlayer(player);
    });

    socket.on('identifyItem', (inventoryIndex) => {
        const player = players[socket.id];
        if (!player) return;

        // インデックスの正当性チェック
        const item = player.inventory[inventoryIndex];
        if (!item || !item.isUnidentified) return;

        // 鑑定費用の計算（例: アイテム価格の 50%）
        // 未鑑定だとランク不明なので、ベース価格を参照
        const baseData = ITEMS[item.id];
        const cost = Math.floor((baseData.price || 100) * 0.5);

        if (player.gold < cost) {
            socket.emit('systemMessage', 'ゴールドが足りません！');
            return;
        }

        // 1. お金を減らす
        player.gold -= cost;

        // 2. ランクとステータスを抽選（ここで初めて決まる！）
        rollItemStats(item);

        // 3. ログ出力＆保存
        console.log(`Identified: ${baseData.name} -> Rank: ${item.rank}`);
        savePlayer(player);

        // 4. クライアントに通知
        // インベントリ更新、所持金更新、鑑定完了エフェクト用通知など
        socket.emit('inventoryUpdate', {inventory: player.inventory, gold: player.gold});
        socket.emit('identifySuccess', { index: inventoryIndex, item: item });
        savePlayer(player);
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
        savePlayer(player);
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
            savePlayer(player);
        }
    });
    socket.on('transferItem', async (data) => {
        // data = { targetId: '相手のSocketID', itemIndex: 0, amount: 1 }
        const sender = players[socket.id];
        const receiver = players[data.targetId];

        // 1. 基本的な検証
        if (!sender || !receiver) return;
        if (sender.id === receiver.id) return; // 自分には送れない
    
        const item = sender.inventory[data.itemIndex];
        if (!item) return;

        const baseData = ITEMS[item.id]; // 定数データ参照
    
        // 2. アイテムタイプの判定（素材か装備か）
        const isMaterial = (baseData.type === 'material'); // ※ITEMS定義に type:'material' がある前提

        if (isMaterial) {
            // --- A. 素材（スタック可能アイテム）の場合 ---
            let amount = parseInt(data.amount) || 1;
        
            // 所持数チェック
            if (!item.count || item.count < amount) {
                socket.emit('systemMessage', '数が足りません。');
                return;
            }

            // 送信者から減らす
            item.count -= amount;
            if (item.count <= 0) {
                sender.inventory[data.itemIndex] = null; // 0になったら消す
            }

            // 受信者に追加する（既存スタックがあれば合算）
            const existingItem = receiver.inventory.find(i => i.id === item.id);
            if (existingItem) {
                existingItem.count = (existingItem.count || 1) + amount;
            } else {
                const emptyIndex = receiver.inventory.findIndex(slot => slot === null);
        
                if (emptyIndex !== -1) {
                    receiver.inventory[emptyIndex] = { id: item.id, rank: item.rank, stats: item.stats, count: amount, isUnidentified: item.isUnidentified };
                }
            }
            socket.emit('systemMessage', `${receiver.username} に ${baseData.name} を ${amount}個 送りました。`);
            io.to(receiver.id).emit('systemMessage', `${sender.username} から ${baseData.name} を ${amount}個 受け取りました！`);

        } else {
            // --- B. 装備品（スタック不可）の場合 ---
            const transferredItem = sender.inventory[data.itemIndex];
            sender.inventory[data.itemIndex] = null;
            // 受信者のインベントリへそのままpush（ランクや性能も維持される）
            const emptyIndex = receiver.inventory.findIndex(slot => slot === null);
        
            if (emptyIndex !== -1) {
                receiver.inventory[emptyIndex] = { id: transferredItem.id, rank: transferredItem.rank, stats: transferredItem.stats, count: 1, isUnidentified: transferredItem.isUnidentified };
            }

            socket.emit('systemMessage', `${receiver.username} に ${baseData.name} を送りました。`);
            io.to(receiver.id).emit('systemMessage', `${sender.username} から ${baseData.name} を受け取りました！`);
        }

        // 3. 両者のデータを保存
        await savePlayer(sender);
        await savePlayer(receiver);

        // 4. クライアントの表示を更新
        io.to(sender.id).emit('inventoryUpdate', { inventory: sender.inventory, gold: sender.gold });
        io.to(receiver.id).emit('inventoryUpdate', { inventory: receiver.inventory, gold: receiver.gold });
    });

    socket.on('transferGold', async (data) => {
        // data = { targetId: '...', amount: 100 }
        const sender = players[socket.id];
        const receiver = players[data.targetId];

        // 1. 基本的な検証
        if (!sender || !receiver) return;
        if (sender.id === receiver.id) return;

        // 金額の検証
        const amount = parseInt(data.amount);
        if (isNaN(amount) || amount <= 0) {
            socket.emit('systemMessage', '無効な金額です。');
            return;
        }

        if (sender.gold < amount) {
            socket.emit('systemMessage', 'ゴールドが足りません。');
            return;
        }

        // 2. 送金処理
        sender.gold -= amount;
        receiver.gold = (receiver.gold || 0) + amount; // receiver.goldがundefinedの場合の対策

        // 3. 保存
        await savePlayer(sender);
        await savePlayer(receiver);

        // 4. 通知と更新
        io.to(sender.id).emit('inventoryUpdate', { inventory: sender.inventory, gold: sender.gold });
        io.to(receiver.id).emit('inventoryUpdate', { inventory: receiver.inventory, gold: receiver.gold });

        socket.emit('systemMessage', `${receiver.username} に ${amount} G 送金しました。`);
        io.to(receiver.id).emit('systemMessage', `${sender.username} から ${amount} G 受け取りました！`);
    });
    
    // --- 倉庫：預ける (Inventory -> Storage) ---
    socket.on('depositItem', async (data) => {
        const player = players[socket.id];
        if (!player) return;
        const item = player.inventory[data.index];
        if (!item) return;
    
        // インデックスが有効か確認
        if (data.index < 0 || data.index >= 30) return;
    
        // 所持数チェック
        if (!item.count || item.count < data.amount) {
            socket.emit('systemMessage', '数が足りません。');
            return;
        }

        // 送信者から減らす
        item.count -= data.amount;
        if (item.count <= 0) {
            player.inventory[data.index] = null; // 0になったら消す
        }

        // 受信者に追加する（既存スタックがあれば合算）

        // 受信者に追加する（既存スタックがあれば合算）
        const isMaterial = (item.type === 'material');
        if (isMaterial) {
            const existingItem = player.storage.find(i => i.id === item.id);
            if (existingItem) {
                existingItem.count = (existingItem.count || 1) + data.amount;
            } else {
                player.storage.push({ id: item.id, rank: item.rank, stats: item.stats, count: data.amount, isUnidentified: item.isUnidentified }); // 倉庫に追加
            }
        }else {
            player.storage.push({ id: item.id, rank: item.rank, stats: item.stats, count: data.amount, isUnidentified: item.isUnidentified }); // 倉庫に追加
        }
    
        // クライアントに通知（インベントリと倉庫の両方を更新）
        socket.emit('inventoryUpdate', { inventory: player.inventory, gold: player.gold });
        socket.emit('updateStorage', player.storage);
        socket.emit('systemMessage', `${ITEMS[item.id].name} を預けました。`);
    });
    
    // --- 倉庫：引き出す (Storage -> Inventory) ---
    socket.on('withdrawItem', async (data) => {
        const player = players[socket.id];
        if (!player) return;
        const item = player.storage[data.index];
        if (!item) return;
    
        // インデックス確認
        if (data.index < 0 || data.index >= player.storage.length) return;
        // 所持数チェック
        if (!item.count || item.count < data.amount) {
            socket.emit('systemMessage', '数が足りません。');
            return;
        }

        // 受信者に追加する（既存スタックがあれば合算）
        const isMaterial = (item.type === 'material');
        if (isMaterial) {
            const existingItem = player.inventory.find(i => i.id === item.id);
            if (existingItem) {
                existingItem.count = (existingItem.count || 1) + data.amount;
            } else {
                const emptyIndex = player.inventory.findIndex(slot => slot === null);
            
                if (emptyIndex !== -1) {
                    player.inventory[emptyIndex] = { id: item.id, rank: item.rank, stats: item.stats, count: data.amount, isUnidentified: item.isUnidentified };
                }else {
                    socket.emit('systemMessage', 'インベントリがいっぱいです！');
                    return;
                }
            }
        }else {
            const emptyIndex = player.inventory.findIndex(slot => slot === null);
            
            if (emptyIndex !== -1) {
                player.inventory[emptyIndex] = { id: item.id, rank: item.rank, stats: item.stats, count: data.amount, isUnidentified: item.isUnidentified };
            }else {
                socket.emit('systemMessage', 'インベントリがいっぱいです！');
                return;
            }
        }

            // 送信者から減らす
        item.count -= data.amount;
        if (item.count <= 0) {
            player.storage.splice(data.index, 1)[0]; // 0になったら消す
        }
        
        await savePlayer(player); // 保存

        // クライアントに通知
        socket.emit('inventoryUpdate', { inventory: player.inventory, gold: player.gold });
        socket.emit('updateStorage', player.storage);
        socket.emit('systemMessage', `${ITEMS[item.id].name} を引き出しました。`);
    });

    socket.on('save', (data) => {
        const player = players[socket.id];
        savePlayer(player);
    });

    socket.on('adminAddMoney', (amount) => {
        const player = players[socket.id];

        // サーバー側で厳格にチェック：名前が "owner" 以外は無視する
        if (player && player.name === "owner") {
            player.gold = (player.gold || 0) + amount;
            
            console.log(`[ADMIN] ${player.name} の所持金を ${amount} 増やしました。`);

            // 更新されたお金を本人に通知
            io.to(socket.id).emit('inventoryUpdate', { inventory: player.inventory, gold: player.gold });

            // 必要であればセーブ処理も呼ぶ
            // savePlayer(player);
        } else {
            console.warn(`[WARNING] 不正なデバッグ要求を検知しました: ${socket.id}`);
        }
    });

    socket.on('changeJob', (targetJob) => {
        const player = players[socket.id];
        if (!player) return;

        // 要求された職業が JOB_CONFIG に存在するか（不正防止）
        if (JOB_CONFIG[targetJob]) {
            // 職業を変更
            player.currentJob = targetJob;
            
            // 以前作った関数で、新職業のレベルに応じたステータスに再計算
            addExp(player.playerId,0);

            console.log(`${player.name} が ${JOB_CONFIG[targetJob].name} に転職しました。`);

            // クライアントへ転職完了と最新情報を通知
            socket.emit('jobChanged', {
                newJob: targetJob,
                stats: { 
                    hp: player.hp, 
                    maxHp: player.maxHp, 
                    atk: player.atk 
                },
                jobData: player.jobs[targetJob] // 新しい職業のレベルやSP
            });

            // 全体または個人にシステムメッセージ
            socket.emit('systemMessage', `${JOB_CONFIG[targetJob].name} に転職しました！`);
        } else {
            console.warn(`[WARNING] 存在しない職業への転職要求: ${targetJob}`);
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
        if (!enemy.state && enemy.type !== 'boss') {
            enemy.state = 'moving';
            enemy.timer = 0;
        }
        const now = Date.now();
        // 1. 一番近くにいるプレイヤーを探す
        if(enemy.type !== 'boss'){
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
                        if ( minDistance <= stats.attackRange) {
                            // ★詠唱開始（足を止める）
                            enemy.state = 'charging';
                            enemy.timer = now + stats.chargeTime; // 攻撃発動時刻
                        
                            // 攻撃方向（角度）を決定
                            enemy.targetAngle = Math.atan2(target.dy, target.dx);
    
                            // クライアントに「予兆を出せ」と命令
                            io.to(enemy.room).emit('enemyCharge', {
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
                            // 移動予定の距離
                            const moveStep = enemy.speed;
    
                            // ■ X方向の移動チェック
                            // 進行方向の少し先（+15px）をチェックすることで、壁にめり込むのを防ぐ
                            const nextX = enemy.x + Math.cos(angle) * moveStep;
                            // 右に行くなら右側(+15)、左に行くなら左側(-15)の点を調べる
                            const checkX = nextX + (Math.cos(angle) > 0 ? 15 : -15);
                        
                            if (!isMapWall(enemy.room, checkX, enemy.y)) {
                                enemy.x = nextX; // 壁じゃないなら進む
                            }
    
                            // ■ Y方向の移動チェック（Xとは独立して行う＝壁沿いを滑る）
                            const nextY = enemy.y + Math.sin(angle) * moveStep;
                            const checkY = nextY + (Math.sin(angle) > 0 ? 15 : -15);
    
                            if (!isMapWall(enemy.room, enemy.x, checkY)) {
                                enemy.y = nextY; // 壁じゃないなら進む
                            }
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
        if(p.ownerType === 'player'){ 
            Object.keys(enemies).forEach((enemyId) => {
                const enemy = enemies[enemyId];
                if (enemy.room !== p.room || enemy.isDead) return;
    
                // 距離判定（当たり判定サイズ: 30px）
                const dist = Math.sqrt((p.x - enemy.x) ** 2 + (p.y - enemy.y) ** 2);
                
                if (dist < 30) {
                    // 命中！
                    delete projectiles[id]; // 弾は消える
    
                    // ダメージ計算（魔法攻撃力はとりあえず固定20 + レベル補正などにしてもOK）
                    const damage = p.damage;
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
        } else {
            Object.keys(players).forEach((id) => {
                const player = players[id];
                const now = Date.now();
                if (player.room !== p.room ) return;
    
                // 距離判定（当たり判定サイズ: 30px）
                const dist = Math.sqrt((p.x - player.x) ** 2 + (p.y - player.y) ** 2);
                
                if (dist < 30) {
                    delete projectiles[id];
                    const damage = p.damage;
                    const damage1 = player.totalDef / (mitigation + player.totalDef);
                    player.hp -= Math.floor(Math.max(damage * (1 - damage1), 0));
                    player.lastDamageTime = now;
                    // 死亡判定などはここに記述
                    if (player.hp <= 0) {
                        // リスポーン処理など
                        player.hp = player.maxHp;
                        player.x = 48; player.y = 80; // 仮のリスポーン
                        io.emit('playerRespawn', player);
                    } else {
                        io.emit('playerDamaged', { 
                            playerId: player.playerId, 
                            hp: player.hp 
                        });
                    }
                }
            });
        }
    });

    // 弾の位置情報を全員に送信
    io.emit('updateProjectiles', projectiles);

    updateBossState()
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
                level: player.jobs[player.currentJob].level, exp: player.jobs[player.currentJob].exp, maxExp: player.maxExp,
                baseAtk: player.baseAtk, baseDef: player.baseDef, totalAtk: player.totalAtk, totalDef: player.totalDef, hp: player.hp, mp: player.mp, maxMp: player.maxMp, currentJob: player.currentJob
            });
        }
    });
}, 1000);

function handleEnemyDeath(enemy, player) {
    // 1. 経験値とレベルアップ処理
    const expGain = enemy.exp;
    
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
    }else if (enemy.respawnType === 'boss') {
        console.log('ボス討伐報酬を渡します。');
        const targetSpawnerIndex = enemy.spawnerIndex;
        const table = DROP_TABLE[enemy.name];
        const moneyEarned = table.money; // 本来はランダム幅を持たせてもOK
        const playerRoom = player.room; 
        const remainingPlayers = getPlayersInBossRoom();
        remainingPlayers.forEach(playerInRoom => {
            console.log(`${playerInRoom}にアイテムを渡します。`);
            playerInRoom.exp += expGain;
            playerInRoom.gold += moneyEarned;
            table.items.forEach(drop => {
                if (Math.random() < drop.rate) { // 確率判定
                    addItemToInventory(playerInRoom, drop.id, 1);
                }
            });
            addExp(player.playerId,expGain);
            io.to(playerInRoom.playerId).emit('inventoryUpdate', { 
                inventory: playerInRoom.inventory, 
                gold: playerInRoom.gold 
            });
            return;
        });
    }

    addExp(player.playerId,expGain);

    // プレイヤー本人にステータス更新を通知
    // (socket経由ではなくio.toを使うことで、どこから呼ばれても動くようにする)
    io.to(player.playerId).emit('updateStats', {
        level: player.jobs[player.currentJob].level, exp: player.jobs[player.currentJob].exp, maxExp: player.maxExp,
        baseAtk: player.baseAtk, baseDef: player.baseDef, totalAtk: player.totalAtk, totalDef: player.totalDef, hp: player.hp, mp: player.mp, maxMp: player.maxMp, currentJob: player.currentJob
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

    } else if (enemy.respawnType === 'group') {
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
    } else {
        console.log('ボス討伐完了！');
        io.emit('removeEnemy', bossState.id);
        delete enemies[bossState.id];
        setTimeout(async () => {
            // 10秒後、まだ部屋に残っているプレイヤーを再取得してワープさせる
            const remainingPlayers = getPlayersInBossRoom();
            
            remainingPlayers.forEach(player => {
                const socket = io.sockets.sockets.get(player.playerId);
                if (socket) {
                    io.to(player.id).emit('changedArea');
                    const currentRoom = 'boss1';
        
                    // 1. 今の部屋から出る
                    socket.leave(currentRoom);
                    // 今の部屋の人たちに「あいつ消えたよ」と伝える
                    socket.to(currentRoom).emit('disconnectUser', player.playerId);
            
                    // 2. データ更新
                    players[player.playerId].room = BOSS_CONFIG.warpTarget.map;
                    // 座標もリセット（例：入り口にワープ）
                    players[player.playerId].x = BOSS_CONFIG.warpTarget.x; 
                    players[player.playerId].y = BOSS_CONFIG.warpTarget.y;
            
                    // 3. 新しい部屋に入る
                    socket.join(BOSS_CONFIG.warpTarget.map);
            
                    // 4. 新しい部屋の人たちに「新入りが来たよ」と伝える
                    socket.to(BOSS_CONFIG.warpTarget.map).emit('newPlayer', players[socket.id]);
            
                    // 5. 本人に「新しい部屋の現状」を伝える
                    const roomPlayers = {};
                    Object.keys(players).forEach(id => {
                        if (players[id].room === BOSS_CONFIG.warpTarget.map) {
                            roomPlayers[id] = players[id];
                        }
                    });
                    // クライアント側で「マップ切り替え処理」をするためのイベント
                    io.to(player.id).emit('mapChanged', { room: BOSS_CONFIG.warpTarget.map, players: roomPlayers, x: BOSS_CONFIG.warpTarget.x, y: BOSS_CONFIG.warpTarget.y });
                    io.to(player.id).emit('currentNPCs', npcs);
                    console.log(`${player.id}はボスを討伐したためダンジョン前に強制送還されました。`);
                }
                savePlayer(player);
            });
            
            
    
            // ボスのクールダウン解除（部屋から人がいなくなったら湧くように）
            bossState.cooldown = false;
    
        }, 10000); // 10000ms = 10秒
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
            const addable = Math.min(amount, 10000 - stackSlot.count);
            stackSlot.count += addable;
            amount -= addable;
        }
    }

    // まだ残っている、または武器なら空きスロットを探す
    if (amount > 0) {
        // 空いているスロットのインデックスを探す
        const emptyIndex = player.inventory.findIndex(slot => slot === null);
        
        if (emptyIndex !== -1) {
            const newItem = createItemInstance(itemId, null, true);
            player.inventory[emptyIndex] = { id: newItem.id, rank: newItem.rank, stats: newItem.stats, count: amount, isUnidentified: newItem.isUnidentified };
            savePlayer(player);
        } else {
            // インベントリがいっぱいの時の処理（今回は省略、本来は地面に落とすなど）
            console.log("Inventory full!");
        }
    }
}

function performEnemyAttack(enemy, stats) {
    const now = Date.now();
    // 範囲内にいるプレイヤー全員にダメージ
    for (const pid in players) {
        const p = players[pid];
        // マップチェック（マップ実装済みなら）
        if (p.room !== enemy.room) continue;

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
                const damage1 = p.totalDef / (mitigation + p.totalDef);
                p.hp -= Math.floor(Math.max(stats.damage * (1 - damage1), 0));
                p.lastDamageTime = now;
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

const TILE_SIZE = 32; // ゲーム内のタイルサイズ

function isMapWall(mapId, x, y) {
    const mapData = MAP_DATA[mapId];
    if (!mapData) return true; // マップがないなら壁扱い（安全策）

    // ピクセル座標をタイル座標に変換
    const tileX = Math.floor(x / TILE_SIZE);
    const tileY = Math.floor(y / TILE_SIZE);

    // 配列の範囲外チェック（マップの外に出ないように）
    if (tileY < 0 || tileY >= mapData.tiles.length || 
        tileX < 0 || tileX >= mapData.tiles[0].length) {
        return true; // 画面外は壁
    }

    // 1なら壁、0なら通れる
    return mapData.tiles[tileY][tileX] === 1;
}

function updatePlayerStats(player) {
    // 1. まず「素のステータス」にリセット（レベルに応じた基礎値など）
    const jobKey = player.currentJob;
    const jobData = player.jobs[jobKey];
    const config = JOB_CONFIG[jobKey];
    
    player.baseAtk = (jobData.level * config.atkGrowth) + 10;
    player.baseDef = (jobData.level * config.defGrowth) + 5
    player.totalAtk = player.baseAtk;
    player.totalDef = player.baseDef;
    player.maxHp = (jobData.level * config.hpGrowth) + 10;
    player.maxMp = (jobData.level * config.mpGrowth) + 50;

    // 2. 装備スロットを全部見て回る
    for (const slot in player.equipment) {
        const item = player.equipment[slot];
        
        // 装備していれば加算
        if (item) {
            // ITEMSデータから性能を参照（itemにはIDが入っている想定）
            // ※ items.js を require している前提です
            const itemData = ITEMS[item.id]; 
            
            if (itemData) {
                if (item.stats.atk) player.totalAtk += item.stats.atk;
                if (item.stats.def) player.totalDef += item.stats.def;
                if (item.stats.hp) player.maxHp += item.stats.hp;
                if (item.stats.mana) player.maxMp += item.stats.mana;
            }
        }
    }
    if (player.hp > player.maxHp ){
        player.hp = player.maxHp;
    }
    if (player.mp > player.maxMp ){
        player.mp = player.maxMp;
    }
    
    // 3. クライアントに最新ステータスを通知（HPバーなどの更新用）
    io.to(player.id).emit('updateStats', { 
        level: player.jobs[player.currentJob].level, exp: player.jobs[player.currentJob].exp, maxExp: player.maxExp,
        baseAtk: player.baseAtk, baseDef: player.baseDef, totalAtk: player.totalAtk, totalDef: player.totalDef, hp: player.hp, maxHp:player.maxHp, mp: player.mp, maxMp: player.maxMp, currentJob: player.currentJob
    });
}

function createItemInstance(itemId, fixedRankId = null) {
    const data = ITEMS[itemId];
    if (!data) return null;

    if (data.type !== 'equipment' && data.type !== 'weapon') {
        return { 
            id: itemId,
            // スタック（重ね置き）できるように、あえて uniqueId は付けないか、
            // インベントリの仕様に合わせて最低限のデータだけ返します。
            count: 1 
        };
    }

    // 1. ランクの決定
    let rankId = 'C'; // デフォルト

    if (fixedRankId && RANKS[fixedRankId]) {
        // A. ランク指定がある場合（ボスドロップや特別報酬など）
        rankId = fixedRankId;
    } else {
        // B. ランダム抽選（通常のドロップや作成）
        const rand = Math.random() * TOTAL_RATE;
        let current = 0;
        
        for (const r of Object.values(RANKS)) {
            current += r.rate;
            if (rand < current) {
                rankId = r.id;
                break;
            }
        }
    }

    const rankData = RANKS[rankId];

    // 2. インスタンス作成
    const itemInstance = {
        id: itemId,
        uniqueId: Math.random().toString(36).substr(2, 9),
        rank: rankId, // ランク情報を保存
        stats: {}
    };

    // 3. ステータス計算（ランク倍率 + ランダム個体値）
    if (data.statsRange) {
        for (const [statName, range] of Object.entries(data.statsRange)) {
            // ステップA: ランク倍率を適用して、そのランク帯でのMin/Maxを出す
            // 例: 攻撃10-20, レア(x1.5) => 15-30
            const rankMin = range.min * rankData.mult;
            const rankMax = range.max * rankData.mult;

            // ステップB: その範囲内でランダムな値を決定 (0.0 ~ 1.0)
            const R = Math.random();
            const T = rankMax - rankMin;
            
            // 最終値 = ランク最小値 + (幅 * 乱数)
            const finalVal = rankMin + (R * T);

            itemInstance.stats[statName] = Math.round(finalVal);
        }
    }
    return itemInstance;
}

// server.js

async function savePlayer(player) {
    // プレイヤーデータがない、または永続化キー(username)がない場合は保存しない
    if (!player || !player.username) return;

    // 保存するデータをオブジェクトにまとめる
    // ※ socket.id や playerId は毎回変わるので保存しません
    const updateData = {
        // --- 位置・シーン情報 ---
        x: player.x,
        y: player.y,
        rotation: player.rotation,
        room: player.room,

        // --- 基本ステータス ---
        hp: player.hp,
        maxHp: player.maxHp,
        mp: player.mp,
        maxMp: player.maxMp,
        lastDamageTime: player.lastDamageTime, // 必要であれば保存

        // --- レベル・経験値 ---
        level: player.level,
        exp: player.jobs[player.currentJob].exp,
        maxExp: player.maxExp,

        // --- 戦闘パラメータ ---
        baseAtk: player.baseAtk,
        baseDef: player.baseDef,
        totalAtk: player.totalAtk,
        totalDef: player.totalDef,

        // --- 所持品・装備 ---
        gold: player.gold,
        inventory: player.inventory, // 配列の中身ごと保存されます
        storage: player.storage,
        equipment: player.equipment,  // オブジェクトの中身ごと保存されます

        // --- 職業---
        jobs: player.jobs,
        currentJob: player.currentJob
    };

    try {
        // MongoDBへの保存実行
        // { username: player.username } をキーにして検索し、updateDataで上書きします
        await PlayerModel.findOneAndUpdate(
            { username: player.username }, 
            { $set: updateData }, 
            { upsert: true, returnDocument: 'after' } // データがなければ作成、あれば更新
        );
        
        // デバッグ用（保存頻度が高い場合はコメントアウト推奨）
        console.log(`${player.currentJob},${player.jobs}`);
        console.log(`[Save] ${player.username} のデータを保存しました。`);

    } catch (e) {
        console.error(`[Error] ${player.username} の保存に失敗しました:`, e);
    }
}

function rollItemStats(itemInstance) {
    const data = ITEMS[itemInstance.id];
    if (!data) return;

    // A. ランクの抽選（まだ決まっていない場合）
    if (!itemInstance.rank || itemInstance.rank === 'unknown') {
        const rand = Math.random() * TOTAL_RATE;
        let current = 0;
        let selectedRank = 'C';

        for (const r of Object.values(RANKS)) {
            current += r.rate;
            if (rand < current) {
                selectedRank = r.id;
                break;
            }
        }
        itemInstance.rank = selectedRank;
    }

    // B. ステータスの計算（ランクに基づいて乱数生成）
    const rankData = RANKS[itemInstance.rank];
    itemInstance.stats = {}; // 初期化

    if (data.statsRange) {
        for (const [statName, range] of Object.entries(data.statsRange)) {
            const rankMin = range.min * rankData.mult;
            const rankMax = range.max * rankData.mult;
            
            // 0~1の乱数
            const R = Math.random();
            const T = rankMax - rankMin;
            
            // 最終値
            const finalVal = rankMin + (R * T);
            itemInstance.stats[statName] = Math.round(finalVal);
        }
    }

    // 未鑑定フラグを消す
    delete itemInstance.isUnidentified;
    
    return itemInstance;
}

// --- 2. アイテム生成関数の改修 ---
// isUnidentified: true なら「未鑑定状態」で返す
function createItemInstance(itemId, fixedRankId = null, isUnidentified = false) {
    const data = ITEMS[itemId];
    if (!data) return null;
    if (data.type !== 'equipment' && data.type !== 'weapon') {
        return { 
            id: itemId,
            // スタック（重ね置き）できるように、あえて uniqueId は付けないか、
            // インベントリの仕様に合わせて最低限のデータだけ返します。
            count: 1 
        };
    }

    const itemInstance = {
        id: itemId,
        uniqueId: Math.random().toString(36).substr(2, 9),
        // 未鑑定ならランクは不明、そうでなければ指定orコモン（後でrollItemStatsを通すなら上書きされる）
        rank: isUnidentified ? 'unknown' : (fixedRankId || 'common'),
        stats: {},
        isUnidentified: isUnidentified // フラグ付与
    };

    // 未鑑定でなければ、即座にステータスを計算して返す
    // （店売り品や、確定ドロップなどはここで完成させる）
    if (!isUnidentified) {
        // 固定ランク指定がない場合はランダム抽選させたいので、rankを一旦クリアしてから通す等の調整が必要ですが、
        // シンプルに「店売り＝コモン固定」「ボス＝レジェンド固定」ならこのままでOK。
        // もし「店売りでもランダム」にしたいなら rollItemStats(itemInstance) を呼びます。
        
        if (!fixedRankId) {
             // fixedRankIdがない（通常生成）なら抽選を行う
             itemInstance = rollItemStats(itemInstance);
        } else {
             // ランク指定あり（ボスドロップ等）ならそのランクで計算
             itemInstance = rollItemStats(itemInstance); 
        }
    }

    return itemInstance;
}

function updateBossState() {
    // 1. プレイヤーがボス部屋にいるかチェック
    bossState.forEach(stats =>{
        const playersInRoom = getPlayersInBossRoom(stats.roomId);
    
        // クールダウン中（討伐直後）なら何もしない
        if (stats.cooldown) return;
    
        if (playersInRoom.length === 0) {
            if (stats.id && enemies[stats.id]) {
                console.log('部屋にプレイヤーが存在しないためボスを消しました。');
                delete enemies[stats.id]; // ボスを削除
                stats.id = null;
            }
            stats.active = false;
            stats.id = null;
            io.emit('updateEnemies', enemies); // クライアントにも削除を通知
            return; // リセットしたフレームはここで終了
        }
    
        // 3. 誰もいないなら湧かせる必要がないので終了
        if (playersInRoom.length === 0) return;
        
        // 2. ボスがいない & プレイヤーがいる -> スポーンさせる
        if (!stats.active && playersInRoom.length > 0) {
            spawnBoss(stats);
        }
    
        // 3. ボスがいる場合 -> 攻撃AI処理
        if (stats.active && stats.id) {
            const boss = enemies[stats.id];
            if (boss) {
                // 例: 3秒ごとに特殊攻撃（8方向弾）
                const now = Date.now();
                if (boss.name === "king_slime") {
                    if (!boss.lastAttackTime || now - boss.lastAttackTime > 3000) {
                        bossAttack8Way(boss);
                        boss.lastAttackTime = now;
                    }
                } else (boss.name === "fairy") {
                    if (!boss.lastAttackTime || now - boss.lastAttackTime > 3000) {
                        bossAttack8Way(boss);
                        boss.lastAttackTime = now;
                    }
                }
            }
        }
    });
}

// --- B. プレイヤー検出ヘルパー ---
function getPlayersInBossRoom(room) {
    return Object.values(players).filter(p => 
        p.room === room
    );
}

// --- C. ボス召喚 ---
function spawnBoss(boss) {
    const id = 'boss_' + Date.now();
    enemies[id] = {
        id: id,
        room: 'boss1',
        type: 'boss', // クライアント側で巨大描画するための識別子
        x: BOSS_CONFIG.spawn.x,
        y: BOSS_CONFIG.spawn.y,
        hp: BOSS_CONFIG.hp,
        maxHp: BOSS_CONFIG.hp,
        exp: BOSS_CONFIG.exp,
        isDead: false,
        name: boss.name,
        respawnType: 'boss'
    };
    
    boss.active = true;
    boss.id = id;

    // クライアントに通知（ボスの出現演出などがあればここでemit）
    io.emit('systemMessage', '【警告】ボスエリアに侵入者が確認されました。ボスが出現します！');
    io.emit('updateEnemies', enemies);
    console.log(`ボスをid:${id}で召喚しました。`);
}

// --- D. ボス攻撃（八方向弾） ---
function bossAttack8Way(boss) {
    // 8方向の角度
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    
    angles.forEach(deg => {
        const rad = deg * (Math.PI / 180);
        const speed = 5; // 弾速
        
        // 既存の弾丸生成ロジックを利用
        const projectileId =`boss_atk_${Date.now()}_${deg}`
        projectiles[projectileId] = {
            id: projectileId,
            ownerId: boss.id, // ダメージ計算で「敵の攻撃」と判定させるため
            ownerType: 'enemy',
            angle: rad,
            x: boss.x,
            y: boss.y,
            room: boss.room,
            speed: speed,
            damage: 50, // ボスの攻撃力
            timeLeft: 2000, // 弾の消滅時間
            respawnType: 'boss'
        };
    });
}

function initializePlayer(player) {
    const legacyLevel = player.level || 1;
    const legacyExp = player.exp || 0;
    // 過去の共有SPがあれば取得、なければ0
    const legacySp = player.skillPoints || 0; 

    // 職業ごとの個別データに「sp」を追加！
    player.jobs = player.jobs || {
        'normal': { level: legacyLevel, exp: legacyExp, sp: legacySp },
        'warrior': { level: 1, exp: 0, sp: 0 },
        'mage': { level: 1, exp: 0, sp: 0 }
    };

    player.currentJob = player.currentJob || 'normal';
    const jobKey = player.currentJob;
    const jobData = player.jobs[jobKey];
    const nextLevelExp = Math.floor( 2 * (jobData.level ** 2) + (jobData.level * 10) + 100);
    player.maxExp = nextLevelExp;
    
    // ※ 全体共有の player.skillPoints はもう使わないので初期化不要です

    updatePlayerStats(player);
}

function addExp(playerId, amount) {
    const player = players[playerId];
    const jobKey = player.currentJob;
    const jobData = player.jobs[jobKey];

    jobData.exp += amount;

    const nextLevelExp = Math.floor( 2 * (jobData.level ** 2) + (jobData.level * 10) + 100);
    player.maxExp = nextLevelExp;

    if (jobData.exp >= nextLevelExp) {
        jobData.exp = 0;
        jobData.level++;
        player.hp = player.maxHp;
        player.mp = player.maxMp;

        // ★修正：現在の職業のSPを加算する
        if (jobData.level % 2 === 0) {
            jobData.sp += 1;
            console.log(`${player.name} が ${JOB_CONFIG[jobKey].name} のレベル ${jobData.level} に到達！ 専用SPを1獲得。`);
        }

        updatePlayerStats(player);

        // クライアントへの通知を送る
        io.emit('playerLevelUp', {
            playerId: player.playerId,
            level: jobData.level,
            maxExp: player.maxExp
        });
    }
    io.to(player.id).emit('updateStats', { 
        level: jobData.level, exp: jobData.exp, maxExp: player.maxExp,
        hp: player.hp, maxHp:player.maxHp, mp: player.mp, maxMp: player.maxMp, currentJob: player.currentJob
    });
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}
