const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 1280,
    height: 720,
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
            gravity: { y: 0 } // 見下ろし型なので重力は0
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const mapData = {
    town: [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 右端が開いている（出口）
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    ],
    adventure: [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
        [1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
        [1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 1],
        [1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 1],
        [0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 1], // 左端が開いている（入口）
        [1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    ]
};

const game = new Phaser.Game(config);
let socket;
let cursors;
let keys; // Z, Xキーなど
let otherPlayers; // 他のプレイヤーを管理するグループ

function preload() {
    // 画像の読み込み
    this.load.image('tiles', 'assets/tiles.png');
}

let map;   // マップ管理用変数
let layer; // レイヤー管理用変数

function create() {
    const self = this;
    this.socket = io();
    this.otherPlayers = this.physics.add.group();

    // --- マップ初期化関数 ---
    this.createMap = (roomName) => {
        // すでにマップがあれば消す
        if (this.map) this.map.destroy();
        
        // 配列からマップを作成 (32x32サイズと仮定)
        const level = mapData[roomName] || mapData['town'];
        this.map = this.make.tilemap({ data: level, tileWidth: 32, tileHeight: 32 });
        
        // 画像を割り当て ('tiles'はpreloadのキー)
        const tiles = this.map.addTilesetImage('tiles');
        
        // レイヤーを作成
        this.layer = this.map.createLayer(0, tiles, 0, 0);
        
        // 壁の当たり判定（画像の番号 1, 2 は通れないとする設定）
        // ※ お手持ちの画像に合わせて「通れない番号」を指定してください
        this.layer.setCollision([1, 2]);
        
        // ワールドの広さをマップサイズに合わせる
        this.physics.world.bounds.width = this.map.widthInPixels;
        this.physics.world.bounds.height = this.map.heightInPixels;
    };

    // 最初は 'town' マップを作る
    this.createMap('town');

    // --- ソケット受信処理 ---
    
    // マップ移動受信時の処理を更新
    this.socket.on('mapChanged', function (data) {
        console.log("マップ移動: " + data.room);
        self.isChangingMap = false;

        // 他プレイヤー消去
        self.otherPlayers.clear(true, true);
        
        // ★ マップを作り直す
        self.createMap(data.room);

        // 自分の位置をリセット（入口付近へ）
        if (data.room === 'town') {
            self.player.setPosition(500, 200); // 街のスポーン位置
        } else {
            self.player.setPosition(50, 200);  // 冒険エリアのスポーン位置
        }

        // カメラ設定再適用
        self.cameras.main.setBounds(0, 0, self.map.widthInPixels, self.map.heightInPixels);

        // 新しい部屋のプレイヤー表示
        Object.keys(data.players).forEach(function (id) {
            if (data.players[id].playerId !== self.socket.id) {
                addOtherPlayers(self, data.players[id]);
            }
        });
    });
    // --- ソケット通信のイベント設定 ---

    // 1. 接続時：現在の全プレイヤーを表示
    this.socket.on('currentPlayers', function (players) {
        Object.keys(players).forEach(function (id) {
            if (players[id].playerId === self.socket.id) {
                addPlayer(self, players[id]);
            } else {
                addOtherPlayers(self, players[id]);
            }
        });
    });

    // 2. 新規接続：誰かが入ってきたら表示
    this.socket.on('newPlayer', function (playerInfo) {
        addOtherPlayers(self, playerInfo);
    });

    // 3. 切断：誰かがいなくなったら消去
    this.socket.on('disconnectUser', function (playerId) {
        self.otherPlayers.getChildren().forEach(function (otherPlayer) {
            if (playerId === otherPlayer.playerId) {
                otherPlayer.destroy();
            }
        });
    });
    // マップ移動処理関数
    this.socket.on('mapChanged', function (data) {
        console.log("マップ移動しました: " + data.room);
        self.isChangingMap = false;

        // 1. 今表示されている他のプレイヤーを全員消す
        self.otherPlayers.clear(true, true); // (true, true)でGameObjectも削除

        // 2. 移動先の部屋にいるプレイヤーを表示しなおす
        Object.keys(data.players).forEach(function (id) {
            if (data.players[id].playerId !== self.socket.id) {
                addOtherPlayers(self, data.players[id]);
            }
        });

        // 3. 背景色を変えて雰囲気を出す（仮の演出）
        if (data.room === 'adventure') {
            self.cameras.main.setBackgroundColor('#330000'); // 危険な赤黒い色
            // ここで「敵対モブスポーン」のロジックが動く準備完了！
        } else {
            self.cameras.main.setBackgroundColor('#000000'); // 落ち着いた黒
        }
    
        // プレイヤー位置更新
        self.player.setPosition(400, 300);
    });
        // 4. 移動同期：誰かが動いたら位置を更新
    this.socket.on('playerMoved', function (playerInfo) {
        self.otherPlayers.getChildren().forEach(function (otherPlayer) {
            if (playerInfo.playerId === otherPlayer.playerId) {
                otherPlayer.setRotation(playerInfo.rotation);
                otherPlayer.setPosition(playerInfo.x, playerInfo.y);
            }
        });
    });

    // --- 入力設定 ---
    
    // WASDキーの設定
    this.keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        decide: Phaser.Input.Keyboard.KeyCodes.Z, // 決定
        cancel: Phaser.Input.Keyboard.KeyCodes.X  // キャンセル
    });

    // マウス入力の無効化防止（ゲーム画面クリックでフォーカス）
    this.input.mouse.disableContextMenu();
}

function update() {
    // 自分のプレイヤーが生成される前なら何もしない
    if (!this.player) return;

    // --- 移動処理 (WASD) ---
    const speed = 200;
    this.player.body.setVelocity(0);

    if (this.keys.left.isDown) {
        this.player.body.setVelocityX(-speed);
    } else if (this.keys.right.isDown) {
        this.player.body.setVelocityX(speed);
    }

    if (this.keys.up.isDown) {
        this.player.body.setVelocityY(-speed);
    } else if (this.keys.down.isDown) {
        this.player.body.setVelocityY(speed);
    }
    // マップの右端付近（タイルの数 x 32px）
    if (this.player.x > this.map.widthInPixels - 32 && !this.isChangingMap && this.player.room !== 'adventure') {
        this.isChangingMap = true;
        this.socket.emit('changeArea', 'adventure');
    }

    // マップの左端付近
    if (this.player.x < 32 && !this.isChangingMap && this.player.room !== 'town') { // room判定はサーバー側で管理したほうが良いですが簡易的に
        // ※ クライアント側で現在のルーム名を保持する変数を作っておくと便利です
        this.isChangingMap = true;
        this.socket.emit('changeArea', 'town');
    }
    // --- 回転処理 (マウスエイム) ---
    // プレイヤーからマウスカーソルへの角度を計算
    const angle = Phaser.Math.Angle.Between(
        this.player.x, 
        this.player.y, 
        this.input.activePointer.x, 
        this.input.activePointer.y
    );
    this.player.setRotation(angle);

    // --- 攻撃/アクション処理 ---
    if (Phaser.Input.Keyboard.JustDown(this.keys.decide)) {
        console.log("Zキー（決定・攻撃）が押されました");
        // ここに攻撃ロジックを入れる
    }
    
    // --- サーバーへ位置情報を送信 ---
    // 動いているか、向きが変わった時のみ送信して負荷を減らす
    const x = this.player.x;
    const y = this.player.y;
    const r = this.player.rotation;

    if (this.player.oldPosition && (x !== this.player.oldPosition.x || y !== this.player.oldPosition.y || r !== this.player.oldPosition.rotation)) {
        this.socket.emit('playerMovement', { x: x, y: y, rotation: r });
    }

    // 前回の位置を保存
    this.player.oldPosition = {
        x: this.player.x,
        y: this.player.y,
        rotation: this.player.rotation
    };
}

// 自分のプレイヤーを作る関数（白）
function addPlayer(self, playerInfo) {
    // 画像の代わりに四角形を描画
    const graphics = self.add.graphics();
    graphics.fillStyle(0xffffff, 1); // 白
    graphics.fillRect(-16, -16, 32, 32); // 中心を合わせる
    graphics.lineStyle(2, 0x0000ff, 1); // 向いている方向がわかるように青い線
    graphics.beginPath();
    graphics.moveTo(0, 0);
    graphics.lineTo(32, 0);
    graphics.strokePath();
    
    // テクスチャとして生成
    graphics.generateTexture('playerTexture', 32, 32);
    graphics.destroy();

    self.player = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'playerTexture')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(32, 32);
    
    // ★ 画面外に出ないようにする
    self.player.setCollideWorldBounds(true);
    
    // ★ マップの壁とぶつかるようにする
    self.physics.add.collider(self.player, self.layer);

    // ★ カメラがプレイヤーを追いかける設定
    self.cameras.main.startFollow(self.player);
    self.cameras.main.setBounds(0, 0, self.map.widthInPixels, self.map.heightInPixels);
}
}

// 他のプレイヤーを作る関数（赤）
function addOtherPlayers(self, playerInfo) {
    // 画像の代わりに四角形を描画（赤）
    if(!self.textures.exists('otherPlayerTexture')) {
        const graphics = self.add.graphics();
        graphics.fillStyle(0xff0000, 1); // 赤
        graphics.fillRect(-16, -16, 32, 32);
        graphics.generateTexture('otherPlayerTexture', 32, 32);
        graphics.destroy();
    }

    const otherPlayer = self.add.sprite(playerInfo.x, playerInfo.y, 'otherPlayerTexture')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(32, 32);
    
    otherPlayer.playerId = playerInfo.playerId;
    self.otherPlayers.add(otherPlayer);
}
