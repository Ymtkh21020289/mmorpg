// --- 1. マップデータ（必ず一番上に書く！） ---
const mapData = {
    town: [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 右出口
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    ],
    adventure: [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
        [1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
        [1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 1],
        [1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 1],
        [0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 1], // 左入口
        [1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    ]
};

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 800, // 画面サイズを少し小さくして見やすく
    height: 600,
    physics: {
        default: 'arcade',
        arcade: { debug: false, gravity: { y: 0 } }
    },
    scene: { preload: preload, create: create, update: update }
};

const game = new Phaser.Game(config);

// --- グローバル変数 ---
let socket;
let cursors;
let keys;
let otherPlayers;
let map;
let layer;
let mapReady = false; // ★重要：マップ読み込み完了フラグ

function preload() {
    this.load.image('tiles', 'assets/tiles.png');
    // プレイヤー画像がない場合の生成処理はcreate内で行うのでここでは不要
}

function create() {
    const self = this;
    this.socket = io();
    this.otherPlayers = this.physics.add.group();

    // --- マップ作成関数 ---
    this.createMap = (roomName) => {
        // --- 犯人特定ログ ---
        console.log("-----------------------------------");
        console.log("1. 要求された部屋名:", roomName);
        console.log("2. mapDataの中身:", mapData);
        console.log("3. mapData['adventure']の確認:", mapData['adventure']);
        console.log("4. 取得したデータ(level):", mapData[roomName]);
        
        // データの型チェック
        if (typeof mapData === 'undefined') {
            console.error("【原因判明】mapData 変数自体が存在しません。定義場所が間違っています！");
            return;
        }
        if (mapData[roomName] === undefined) {
             console.error(`【原因判明】mapDataの中に '${roomName}' というキーがありません。スペルミスか、データ定義漏れです。`);
             console.log("現在使えるキー一覧:", Object.keys(mapData));
             return;
        }
        // 1. 安全装置：マップ作成中はupdateを止める
        mapReady = false; 

        // 2. データ取得とチェック
        const level = mapData[roomName];
        if (!level) {
            console.error("マップデータが見つかりません:", roomName);
            return;
        }

        // 3. 古いオブジェクトの削除
        if (this.layer) this.layer.destroy();
        if (this.map) this.map.destroy();

        try {
            // 4. マップ作成
            this.map = this.make.tilemap({ data: level, tileWidth: 32, tileHeight: 32 });
            const tiles = this.map.addTilesetImage('tiles');
            this.layer = this.map.createLayer(0, tiles, 0, 0);
            this.layer.setCollision([1, 2]); // 衝突判定
            
            // ワールド境界の設定
            this.physics.world.bounds.width = this.map.widthInPixels;
            this.physics.world.bounds.height = this.map.heightInPixels;

            // プレイヤーの衝突判定を更新
            if (this.player) {
                this.physics.add.collider(this.player, this.layer);
            }

            // ★ 5. 完了フラグを立てる
            mapReady = true; 
            console.log("マップ作成完了:", roomName);

        } catch (error) {
            console.error("マップ作成中にエラー発生:", error);
        }
    };

    // 初期マップ作成
    this.createMap('town');

    // --- Socket イベント ---
    this.socket.on('currentPlayers', function (players) {
        Object.keys(players).forEach(function (id) {
            if (players[id].playerId === self.socket.id) {
                addPlayer(self, players[id]);
            } else {
                addOtherPlayers(self, players[id]);
            }
        });
    });

    this.socket.on('newPlayer', function (playerInfo) {
        addOtherPlayers(self, playerInfo);
    });

    this.socket.on('disconnectUser', function (playerId) {
        self.otherPlayers.getChildren().forEach(function (otherPlayer) {
            if (playerId === otherPlayer.playerId) {
                otherPlayer.destroy();
            }
        });
    });

    this.socket.on('playerMoved', function (playerInfo) {
        self.otherPlayers.getChildren().forEach(function (otherPlayer) {
            if (playerInfo.playerId === otherPlayer.playerId) {
                otherPlayer.setRotation(playerInfo.rotation);
                otherPlayer.setPosition(playerInfo.x, playerInfo.y);
            }
        });
    });

    this.socket.on('mapChanged', function (data) {
        console.log("サーバーからマップ移動指示:", data.room);
        
        // 他プレイヤー消去
        self.otherPlayers.clear(true, true);
        
        // マップ再生成
        self.createMap(data.room);

        // 位置リセット
        if (data.room === 'town') {
            self.player.setPosition(500, 200);
        } else {
            self.player.setPosition(50, 200);
        }

        // カメラ再設定
        self.cameras.main.setBounds(0, 0, self.map.widthInPixels, self.map.heightInPixels);

        // 新エリアのプレイヤー表示
        Object.keys(data.players).forEach(function (id) {
            if (data.players[id].playerId !== self.socket.id) {
                addOtherPlayers(self, data.players[id]);
            }
        });
        
        // 移動フラグ解除
        self.isChangingMap = false;
    });

    // キー設定
    this.keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    
    this.input.mouse.disableContextMenu();
}

function update() {
    // ★重要：マップ準備中 or プレイヤー未生成なら何もしない
    if (!this.player || !mapReady) return;

    const speed = 200;
    this.player.body.setVelocity(0);

    // 移動処理
    if (this.keys.left.isDown) this.player.body.setVelocityX(-speed);
    else if (this.keys.right.isDown) this.player.body.setVelocityX(speed);

    if (this.keys.up.isDown) this.player.body.setVelocityY(-speed);
    else if (this.keys.down.isDown) this.player.body.setVelocityY(speed);

    // 回転処理
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.input.activePointer.x, this.input.activePointer.y);
    this.player.setRotation(angle);

    // 移動同期
    const x = this.player.x;
    const y = this.player.y;
    const r = this.player.rotation;
    
    if (this.player.oldPosition && (x !== this.player.oldPosition.x || y !== this.player.oldPosition.y || r !== this.player.oldPosition.rotation)) {
        this.socket.emit('playerMovement', { x: x, y: y, rotation: r });
    }
    this.player.oldPosition = { x: x, y: y, rotation: r };

    // --- エリア移動判定 ---
    // mapReadyのチェックがあるため、ここで this.map.widthInPixels を呼んでも安全
    if (this.player.x > this.map.widthInPixels - 32 && !this.isChangingMap) {
        // ここで現在のルーム判定を入れるのがベストだが、簡易的に一方通行でテスト
        // 本来は server.js から現在の room を送ってもらい this.currentRoom に保存して判定する
        console.log("冒険エリアへ移動リクエスト");
        this.isChangingMap = true;
        this.socket.emit('changeArea', 'adventure');
    }

    if (this.player.x < 32 && !this.isChangingMap) {
        console.log("街へ移動リクエスト");
        this.isChangingMap = true;
        this.socket.emit('changeArea', 'town');
    }
}

function addPlayer(self, playerInfo) {
    // 簡易テクスチャ生成
    if (!self.textures.exists('playerTexture')) {
        const graphics = self.add.graphics();
        graphics.fillStyle(0xffffff, 1);
        graphics.fillRect(-16, -16, 32, 32);
        graphics.lineStyle(2, 0x0000ff, 1);
        graphics.beginPath(); graphics.moveTo(0, 0); graphics.lineTo(32, 0); graphics.strokePath();
        graphics.generateTexture('playerTexture', 32, 32);
        graphics.destroy();
    }

    self.player = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'playerTexture')
        .setOrigin(0.5, 0.5).setDisplaySize(32, 32);
    
    self.player.setCollideWorldBounds(true);
    
    // マップがあれば衝突判定設定
    if (self.layer) {
        self.physics.add.collider(self.player, self.layer);
    }
    
    self.cameras.main.startFollow(self.player);
    // 初期カメラ境界設定
    if (self.map) {
        self.cameras.main.setBounds(0, 0, self.map.widthInPixels, self.map.heightInPixels);
    }
}

function addOtherPlayers(self, playerInfo) {
    if(!self.textures.exists('otherPlayerTexture')) {
        const graphics = self.add.graphics();
        graphics.fillStyle(0xff0000, 1);
        graphics.fillRect(-16, -16, 32, 32);
        graphics.generateTexture('otherPlayerTexture', 32, 32);
        graphics.destroy();
    }
    const otherPlayer = self.add.sprite(playerInfo.x, playerInfo.y, 'otherPlayerTexture')
        .setOrigin(0.5, 0.5).setDisplaySize(32, 32);
    otherPlayer.playerId = playerInfo.playerId;
    self.otherPlayers.add(otherPlayer);
}
