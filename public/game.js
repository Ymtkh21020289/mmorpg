// --- 1. マップデータ（必ず一番上に書く！） ---
const mapData = {
    town: [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 右出口
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    ],
    adventure: [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], // 左入口
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
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
        // 1. マップ更新中はフラグを下ろす
        mapReady = false;

        // ★重要：古い「当たり判定」が残っていたら、まずそれを消す！
        // これをやらないと、消えたマップにアクセスしようとしてエラーになります
        if (this.collider) {
            this.physics.world.removeCollider(this.collider);
            this.collider = null;
        }

        // 古いレイヤーとマップを削除
        if (this.layer) this.layer.destroy();
        if (this.map) this.map.destroy();

        // 2. データ取得 & 自動修復（前回のコードと同じ）
        let rawData = mapData[roomName];
        if (!rawData) rawData = mapData['town']; // エラーならtownへ

        const targetWidth = rawData[0].length;
        const fixedLevel = rawData.map((row) => {
            if (row.length === targetWidth) return row;
            const newRow = [...row];
            while (newRow.length < targetWidth) newRow.push(0);
            return newRow.slice(0, targetWidth);
        });

        try {
            // 3. マップ作成
            this.map = this.make.tilemap({ data: fixedLevel, tileWidth: 32, tileHeight: 32 });
            const tiles = this.map.addTilesetImage('tiles');
            
            // もし画像読み込みに失敗していたら止める（安全策）
            if (!tiles) {
                console.error("タイル画像の読み込みに失敗しました。assets/tiles.png はありますか？");
                return;
            }

            this.layer = this.map.createLayer(0, tiles, 0, 0);
            // ★追加：マップは一番奥（0）に表示する
            this.layer.setDepth(0);
            this.layer.setCollision([1, 2]); // 壁の設定
            
            // ワールド境界更新
            this.physics.world.bounds.width = this.map.widthInPixels;
            this.physics.world.bounds.height = this.map.heightInPixels;

            // ★重要：新しい「当たり判定」を作り、変数に保存する
            // 変数(this.collider)に入れておかないと、後で削除できません
            if (this.player) {
                this.collider = this.physics.add.collider(this.player, this.layer);
            }

            // 完了
            mapReady = true;
            console.log("マップ作成＆当たり判定リセット完了: " + roomName);

        } catch (error) {
            console.error("マップ作成中の重大エラー:", error);
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
                // ... 名前の追従 (既存) ...
                if (otherPlayer.nameLabel) {
                    otherPlayer.nameLabel.setPosition(playerInfo.x, playerInfo.y - 30);
                }

                // ★追加：吹き出しの追従
                if (otherPlayer.chatBubble) {
                    otherPlayer.chatBubble.setPosition(playerInfo.x, playerInfo.y - 60);
                }
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

    // --- チャット入力の制御 ---
    const chatInput = document.getElementById('chatInput');
    
    // エンターキーが押されたら入力ボックスを表示/非表示
    this.input.keyboard.on('keydown-ENTER', () => {
        if (chatInput.style.display === 'none') {
            // 入力モード開始
            chatInput.style.display = 'block';
            chatInput.focus(); // カーソルを合わせる
            self.isTyping = true; // ★移動を止めるためのフラグ
        } else {
            // 送信処理
            const text = chatInput.value;
            if (text.trim().length > 0) {
                self.socket.emit('chatMessage', text); // サーバーへ送信
            }
            chatInput.value = ''; // 空にする
            chatInput.style.display = 'none'; // 隠す
            self.isTyping = false; // 移動許可
        }
    });

    // --- サーバーからチャットを受け取った時の処理 ---
    this.socket.on('chatUpdate', function (data) {
        // 喋ったのが自分か他人かを探す
        let targetSprite = null;

        if (self.player && data.playerId === self.socket.id) {
            targetSprite = self.player;
        } else {
            self.otherPlayers.getChildren().forEach(function (other) {
                if (other.playerId === data.playerId) {
                    targetSprite = other;
                }
            });
        }

        // 対象が見つかったら吹き出しを表示
        if (targetSprite) {
            displayChatBubble(self, targetSprite, data.msg);
        }
    });
    
    this.input.mouse.disableContextMenu();
}

function update() {
    // 既存のチェックに追加： isTyping が true なら動かない
    if (!this.player || !mapReady || this.isTyping) return;

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

    if (this.player && this.playerNameText) {
        this.playerNameText.setPosition(this.player.x, this.player.y - 30);
        
        // ★追加：自分の吹き出し追従
        if (this.player.chatBubble) {
            this.player.chatBubble.setPosition(this.player.x, this.player.y - 60);
        }
    }

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
    // ★追加：プレイヤーは常に手前（10）に表示する
    self.player.setDepth(10);
    self.player.setCollideWorldBounds(true);
    self.playerNameText = self.add.text(playerInfo.x, playerInfo.y - 30, playerInfo.name, { 
        fontSize: '14px', 
        fill: '#ffffff',
        stroke: '#000000', // 黒い縁取りで見やすく
        strokeThickness: 3
    }).setOrigin(0.5); // 文字の中心を基準にする

    self.playerNameText.setDepth(20); // プレイヤー(10)より手前に表示
    
    // マップがあれば衝突判定設定
    if (self.layer) {
        self.collider = self.physics.add.collider(self.player, self.layer);
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
    self.otherPlayers.setDepth(10);
    // ★追加：他人の名前を表示
    const nameText = self.add.text(playerInfo.x, playerInfo.y - 30, playerInfo.name, { 
        fontSize: '14px', 
        fill: '#ffffff', // 他人は色を変えてもいいかも（例: '#ffcccc'）
        stroke: '#000000',
        strokeThickness: 3
    }).setOrigin(0.5);
    nameText.setDepth(20);

    // ★重要：スプライト自体に「あなたの名札はこれですよ」と覚えさせる
    otherPlayer.nameLabel = nameText;
    
    // ★重要：スプライトが消されたら（切断や移動）、名札も道連れにして消す設定
    otherPlayer.on('destroy', () => {
        if (otherPlayer.nameLabel) {
            otherPlayer.nameLabel.destroy();
        }
    });

    otherPlayer.playerId = playerInfo.playerId;
    self.otherPlayers.add(otherPlayer);
}

// ★追加：チャット吹き出しを表示する関数
function displayChatBubble(scene, sprite, text) {
    // 既に吹き出しが出ていたら、古いものを消す
    if (sprite.chatBubble) {
        sprite.chatBubble.destroy();
    }

    // 吹き出しのテキスト作成
    // 名前(y-30)よりさらに上(y-60)に表示
    const bubble = scene.add.text(sprite.x, sprite.y - 60, text, {
        fontSize: '16px',
        fill: '#000000',     // 文字は黒
        backgroundColor: '#ffffff', // 背景は白
        padding: { x: 5, y: 5 },
        align: 'center'
    }).setOrigin(0.5);
    
    bubble.setDepth(30); // 名前(20)よりさらに手前

    // スプライトに紐付けて、移動時に追従させる（updateで処理が必要ですが、簡易的にここでTweenを使います）
    sprite.chatBubble = bubble;

    // アニメーション：3秒待ってから、1秒かけて透明になって消える
    scene.tweens.add({
        targets: bubble,
        alpha: 0,       // 透明度を0に
        duration: 1000, // 1秒かけて
        delay: 3000,    // 3秒待機してから開始
        onComplete: () => {
            bubble.destroy();
            sprite.chatBubble = null;
        }
    });
}
