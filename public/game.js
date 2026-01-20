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

const game = new Phaser.Game(config);
let socket;
let cursors;
let keys; // Z, Xキーなど
let otherPlayers; // 他のプレイヤーを管理するグループ

function preload() {
    // 画像があればここで読み込みます: this.load.image('player', 'assets/player.png');
}

function create() {
    const self = this;
    this.socket = io();
    this.otherPlayers = this.physics.add.group();

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
    // 画面の右端（例えば x > 1250）に行ったら「冒険エリア」へ
    if (this.player.x > 1250 && !this.isChangingMap) {
        this.isChangingMap = true; // 連続送信防止
        this.socket.emit('changeArea', 'adventure');
    }
    // 画面の左端（例えば x < 30）に行ったら「居住地エリア」へ
    if (this.player.x < 30 && !this.isChangingMap) {
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
    
    self.player.setCollideWorldBounds(true);
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
