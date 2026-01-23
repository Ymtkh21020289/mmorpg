const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// 静的ファイル（publicフォルダの中身）を配信
app.use(express.static(path.join(__dirname, 'public')));

// プレイヤーデータを格納するオブジェクト
let players = {};

// 1. 敵の種類ごとのステータス定義
const ENEMY_TYPES = {
    // 既存のカカシ（とりあえずボス扱い）
    kakashi: { hp: 100, maxHp: 100, exp: 0, speed: 0, color: 0x00ff00, respawnType: 'static' },
    // 新しい敵：スライム（弱い、群れる、青い）
    slime:   { hp: 30,  maxHp: 30,  exp: 10, speed: 1, color: 0x0000ff, respawnType: 'group' },
    // 新しい敵：ウルフ（強い、速い、赤い）
    wolf:    { hp: 60,  maxHp: 60,  exp: 30, speed: 3, color: 0xff0000, respawnType: 'group' }
};

// 2. 現在の敵リスト（初期状態は空にして、関数で生み出します）
let enemies = {};

// 3. 群れを管理するスポーナーの定義
const spawners = [
    // カカシ（単体）
    { type: 'kakashi', x: 600, y: 400, count: 1, radius: 0, room: 'town' },
    // スライムの群れ（Townの左上、5匹、半径100pxに散らばる）
    { type: 'slime',   x: 200, y: 200, count: 5, radius: 100, room: 'town' },
    // ウルフの群れ（Adventureマップ、3匹）
    { type: 'wolf',    x: 800, y: 800, count: 3, radius: 150, room: 'adventure' }
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
            color: template.color,  // ★種類ごとの色
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
        attackPower: 10 // 今の攻撃力
    };

    // ★Socket.ioの「town」という部屋に参加させる
    socket.join('town');

    // ★ 'town' 部屋にいる人たちだけに、新入り情報を送る
    // io.to('room名').emit(...) で、その部屋の人だけに送信できます
    socket.to('town').emit('newPlayer', players[socket.id]);

    socket.emit('currentEnemies', enemies);

    // メッセージを受け取る
    socket.on('chatMessage', function (message) {
        console.log(`チャット受信: ${socket.id} -> ${message}`);
        // 全員に送る (送信者ID と メッセージ内容)
        io.emit('chatUpdate', { playerId: socket.id, msg: message });
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

    // server.js の socket.on('attackEnemy') を書き換え

        socket.on('attackEnemy', (enemyId) => {
        const enemy = enemies[enemyId];
        const player = players[socket.id];
    
        if (enemy && !enemy.isDead && player) {
            
            enemy.hp -= player.attackPower;
            
            // ダメージ通知
            io.emit('enemyDamaged', { enemyId: enemyId, damage: player.attackPower });
    
            // --- 敵が倒れた時 ---
            if (enemy.hp <= 0) {
                enemy.isDead = true;
                
                // 経験値付与 (敵データから取得)
                const expGain = enemy.exp;
                player.exp += expGain;
                
                // レベルアップ処理 (既存のコードそのまま)
                if (player.exp >= player.maxExp) {
                    player.level++;
                    player.exp = 0;
                    player.maxExp = Math.floor(player.maxExp * 1.2);
                    player.attackPower += 5;
                    player.hp = player.maxHp;
                    io.emit('playerLevelUp', { playerId: player.playerId, level: player.level });
                }
                socket.emit('updateStats', {
                    level: player.level, exp: player.exp, maxExp: player.maxExp,
                    attackPower: player.attackPower, hp: player.hp
                });
    
                // ★ここが変更点：復活ロジックの修正
                if (enemy.respawnType === 'static') {
                    // A. カカシタイプ（変更なし）
                    enemy.hp = 0;
                    setTimeout(() => {
                        enemy.hp = enemy.maxHp;
                        enemy.isDead = false;
                        io.emit('updateEnemy', enemy);
                    }, 5000);
                    io.emit('updateEnemy', enemy); 

                } else {
                    // B. 群れタイプ

                    // 1. クライアントに「削除」命令を送る
                    io.emit('removeEnemy', enemyId);

                    // ★修正1：死ぬ敵が属していた「スポーナーの番号」を保存しておく
                    const targetSpawnerIndex = enemy.spawnerIndex;
                    const spawner = spawners[targetSpawnerIndex];

                    // 3. サーバーのメモリから削除
                    delete enemies[enemyId];

                    // 4. 群れが全滅したかチェック
                    // ★修正2：保存しておいた targetSpawnerIndex と比較する
                    const survivors = Object.values(enemies).filter(e => e.spawnerIndex === targetSpawnerIndex);

                    console.log(`残り敵数: ${survivors.length}`); // ログで確認用

                    if (survivors.length === 0) {
                        console.log(`群れ全滅！ 10秒後に再スポーンします: ${spawner.type}`);
                        // 10秒後に再湧き
                        setTimeout(() => {
                            // 再湧き時にスポーナーが存在するかチェック（安全策）
                            if (spawners[targetSpawnerIndex]) {
                                spawnGroup(spawners[targetSpawnerIndex]);
                            }
                        }, 10000);
                    }
                }
            } else {
                // 生きていれば状態更新
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
    socket.on('changeArea', (targetRoom) => {
        const currentRoom = players[socket.id].room;
        
        // 1. 今の部屋から出る
        socket.leave(currentRoom);
        // 今の部屋の人たちに「あいつ消えたよ」と伝える
        socket.to(currentRoom).emit('disconnectUser', socket.id);

        // 2. データ更新
        players[socket.id].room = targetRoom;
        // 座標もリセット（例：入り口にワープ）
        players[socket.id].x = 400; 
        players[socket.id].y = 300;

        // 3. 新しい部屋に入る
        socket.join(targetRoom);

        // 4. 新しい部屋の人たちに「新入りが来たよ」と伝える
        socket.to(targetRoom).emit('newPlayer', players[socket.id]);

        // 5. 本人に「新しい部屋の現状」を伝える
        const roomPlayers = {};
        Object.keys(players).forEach(id => {
            if (players[id].room === targetRoom) {
                roomPlayers[id] = players[id];
            }
        });
        // クライアント側で「マップ切り替え処理」をするためのイベント
        socket.emit('mapChanged', { room: targetRoom, players: roomPlayers });
    });
    // 切断時の処理
    socket.on('disconnect', () => {
        console.log('ユーザーが切断しました: ' + socket.id);
        delete players[socket.id];
        io.emit('disconnectUser', socket.id);
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
        if (enemy.isDead) return;

        // 1. 一番近くにいるプレイヤーを探す
        let nearestPlayer = null;
        let minDistance = 999999;

        Object.keys(players).forEach((id) => {
            const player = players[id];
            // 同じ部屋のプレイヤーのみ対象
            if (player.room === enemy.room) {
                const dist = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestPlayer = player;
                }
            }
        });

        // ★修正：プレイヤーが見つかった場合のみ処理を実行（これでエラーが消えます）
        if (nearestPlayer) {
            
            // A. 移動処理（距離が30より離れていたら追いかける）
            if (minDistance > 30) {
                const angle = Math.atan2(nearestPlayer.y - enemy.y, nearestPlayer.x - enemy.x);
                enemy.x += Math.cos(angle) * enemy.speed;
                enemy.y += Math.sin(angle) * enemy.speed;
            }

            // B. 攻撃判定処理（常にチェックする）
            // 移動後の位置で再計算
            const distCurrent = Math.sqrt((nearestPlayer.x - enemy.x) ** 2 + (nearestPlayer.y - enemy.y) ** 2);
            
            // 距離40以内なら攻撃
            if (distCurrent < 40) {
                const now = Date.now();
                if (now - nearestPlayer.lastDamageTime > 1000) {
                    nearestPlayer.hp -= 10;
                    nearestPlayer.lastDamageTime = now;

                    // 死亡判定
                    if (nearestPlayer.hp <= 0) {
                        nearestPlayer.hp = nearestPlayer.maxHp;
                        nearestPlayer.x = 400; 
                        nearestPlayer.y = 300;
                        io.emit('playerRespawn', nearestPlayer);
                    } else {
                        io.emit('playerDamaged', { 
                            playerId: nearestPlayer.playerId, 
                            hp: nearestPlayer.hp 
                        });
                    }
                }
            }

            // 位置情報を全員に送信
            io.emit('updateEnemy', enemy);
        }
    });
}, 100);
