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
    console.log('ユーザーが接続しました: ' + socket.id);

    // 新しいプレイヤーのデータを作成
    players[socket.id] = {
        rotation: 0,
        x: 400, // 初期位置X
        y: 300, // 初期位置Y
        playerId: socket.id
    };

    // 1. 新しく来た人に、現在の全プレイヤー情報を送る
    socket.emit('currentPlayers', players);

    // 2. 既にいる人たちに、新しい人が来たことを知らせる
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // プレイヤーが動いた時の処理
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].rotation = movementData.rotation;
            
            // 他のプレイヤーに動きを伝える
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
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
