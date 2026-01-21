const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// 静的ファイル（publicフォルダの中身）を配信
app.use(express.static(path.join(__dirname, 'public')));

// プレイヤーデータを格納するオブジェクト
let players = {};

io.on('connection', (socket) => {
    console.log('ユーザー接続: ' + socket.id);

    // 初期データ作成（最初は 'town' にいるとする）
    players[socket.id] = {
        rotation: 0,
        x: 400,
        y: 300,
        playerId: socket.id,
        room: 'town' // ★現在いるマップ情報を追加
        name: 'Player ' + socket.id.substr(0, 4)
    };

    // ★Socket.ioの「town」という部屋に参加させる
    socket.join('town');

    // ★ 'town' 部屋にいる人たちだけに、新入り情報を送る
    // io.to('room名').emit(...) で、その部屋の人だけに送信できます
    socket.to('town').emit('newPlayer', players[socket.id]);

    // 自分に対して、今の部屋にいる他のプレイヤー情報を送る
    // (全プレイヤーから、同じ部屋の人だけをフィルタリングして送る)
    const playersInRoom = {};
    Object.keys(players).forEach(id => {
        if (players[id].room === 'town') {
            playersInRoom[id] = players[id];
        }
    });
    socket.emit('currentPlayers', playersInRoom);

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
