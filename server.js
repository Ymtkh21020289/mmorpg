const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// 静的ファイル（publicフォルダの中身）を配信
app.use(express.static(path.join(__dirname, 'public')));

// プレイヤーデータを格納するオブジェクト
let players = {};

// 敵データを格納する変数
let enemies = {
    kakashi1: {
        id: 'kakashi1',
        x: 600,
        y: 100,
        hp: 20,
        maxHp: 20,
        room: 'town', // 街に配置
        isDead: false,
        speed: 0 // ★追加：移動速度（プレイヤーより遅めがおすすめ）
    }
};

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
        const player = players[socket.id]; // 攻撃したプレイヤー

        // 敵が生きていて、プレイヤーも存在する場合
        if (enemy && !enemy.isDead && player) {
        
            // 1. プレイヤーの攻撃力を使ってダメージ計算
            enemy.hp -= player.attackPower;
            
            // ダメージ通知
            io.emit('enemyDamaged', { 
                enemyId: enemyId, 
                damage: player.attackPower 
            });

            // 2. 敵が倒れた場合
            if (enemy.hp <= 0) {
                enemy.isDead = true;
                enemy.hp = 0; // マイナスにならないように

                // ★追加：ここから復活タイマー（これを書き忘れていました！）
                setTimeout(() => {
                    enemy.hp = enemy.maxHp;
                    enemy.isDead = false;
                    io.emit('updateEnemy', enemy); // 全員に復活を通知
                }, 5000); // 5秒後に復活
                // ★ここまで追加

                // ★経験値の処理
                const expGain = 50; // 敵1体につき50経験値
                player.exp += expGain;

                // ★レベルアップ判定
                if (player.exp >= player.maxExp) {
                    player.level++;
                    player.exp = 0; // 経験値をリセット（あるいは持ち越し: player.exp -= player.maxExp）
                    player.maxExp = Math.floor(player.maxExp * 1.2); // 次の必要経験値を1.2倍に
                    player.attackPower += 5; // 攻撃力が5アップ！
                    player.hp = player.maxHp; // レベルアップでHP全快！

                    // 全員にレベルアップを通知（演出用）
                    io.emit('playerLevelUp', { 
                        playerId: player.playerId, 
                        level: player.level 
                    });
                }

                // プレイヤー本人に最新ステータス（EXPなど）を送る
                socket.emit('updateStats', {
                    level: player.level,
                    exp: player.exp,
                    maxExp: player.maxExp,
                    attackPower: player.attackPower,
                    hp: player.hp
                });
            }

            // 敵情報の更新送信
            io.emit('updateEnemy', enemy);
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
