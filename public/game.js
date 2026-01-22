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
        this.currentRoomName = roomName;
        
        // ★追加：前のマップの敵を消去
        if (this.enemies) {
            this.enemies.clear(true, true); 
            // ※本来は roomName に応じてサーバーから再取得するのが正しいですが、
            // 今回は「カカシはTownにしかいない」設定で、再取得イベントを簡易化します。
            // サーバーから 'currentEnemies' を再送してもらうのがベストプラクティスです。
            this.socket.emit('requestEnemies'); // 後述：サーバーにリクエストを送る
        }

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

    // ★追加：敵を管理するグループを作る
    this.enemies = this.physics.add.group();

    // キー設定
    this.keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // ★追加：攻撃キー（スペースキー）の設定
    this.keys.attack = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.lastAttackTime = 0; // 連打防止用のタイマー

    // --- Socketイベント追加 ---

    // 1. 最初にカカシ情報をまとめて受け取る
    this.socket.on('currentEnemies', (enemiesData) => {
        Object.values(enemiesData).forEach((enemyInfo) => {
            // 今いるマップと同じ部屋の敵だけ表示
            // ★修正：敵のいる部屋(enemyInfo.room) と 今の部屋(self.currentRoomName) が
            // 一致している時だけ、createEnemyを実行する
            if (enemyInfo.room === self.currentRoomName) {
                createEnemy(self, enemyInfo);
            }
        });
    });

    // 2. カカシの状態更新（ダメージや復活）を受け取る
    this.socket.on('updateEnemy', (updatedEnemy) => {
        self.enemies.getChildren().forEach((enemySprite) => {
            if (enemySprite.id === updatedEnemy.id) {
                // --- ★追加：座標の更新 ---
                enemySprite.setPosition(updatedEnemy.x, updatedEnemy.y);
                // -----------------------

                // HPテキストもついてくるように更新
                if (enemySprite.hpText) {
                    enemySprite.hpText.setPosition(updatedEnemy.x, updatedEnemy.y - 30);
                }
                // HPを更新
                enemySprite.hp = updatedEnemy.hp;
                enemySprite.hpText.setText(`HP: ${updatedEnemy.hp}/${updatedEnemy.maxHp}`);
                
                // 死んでたら半透明にする、生きてたら戻す
                if (updatedEnemy.isDead) {
                    enemySprite.setAlpha(0.3);
                    enemySprite.hpText.setText("RESPAWNING...");
                } else {
                    enemySprite.setAlpha(1);
                }
            }
        });
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
    // --- ★修正後（worldX, worldY を使う） ---
    // activePointerはマウスもタッチも両方対応できるので便利です
    const pointer = this.input.activePointer;

    // ワールド座標(worldX, worldY)を使って角度を計算
    const angle = Phaser.Math.Angle.Between(
        this.player.x, 
        this.player.y, 
        pointer.worldX, 
        pointer.worldY
    );
        
    // プレイヤーの向きを更新
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

    if (this.keys.attack.isDown && !this.isTyping && Date.now() - this.lastAttackTime > 500) {
        
        this.lastAttackTime = Date.now();
        
        // 1. 斬撃エフェクトを出す
        showSlashEffect(this, this.player);

        // 2. 近くの敵を探す
        this.enemies.getChildren().forEach((enemy) => {
            // A. 距離のチェック (80px以内まで届くように延長)
            const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            
            if (distance < 80) { // 以前は60でした
                
                // B. 角度のチェック（ここが新機能！）
                
                // 敵が「自分の位置から見てどの方角にいるか」を計算
                const angleToEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                
                // 「自分が向いている方向(rotation)」と「敵の方角」の差を計算
                // Phaser.Math.Angle.Wrap は、角度のズレを -PI ～ +PI の範囲に綺麗に整えてくれる便利な関数です
                const angleDiff = Phaser.Math.Angle.Wrap(this.player.rotation - angleToEnemy);

                // 差が 90度(PI/2) 以内ならヒット
                // (右90度 + 左90度 = 合計180度の半円範囲になります)
                if (Math.abs(angleDiff) < Math.PI / 2) {
                    
                    // ヒット確定！
                    this.socket.emit('attackEnemy', enemy.id);
                    
                    // ダメージ演出
                    enemy.setTint(0xff0000);
                    this.time.delayedCall(200, () => {
                        enemy.clearTint();
                    });
                }
            }
        });
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

function createEnemy(scene, enemyInfo) {
    // 既に同じIDの敵がいたら作らない（重複防止）
    const existing = scene.enemies.getChildren().find(e => e.id === enemyInfo.id);
    if (existing) return;

    // カカシの見た目（緑色の四角）
    // 本来は画像 ('enemyTexture') をロードしますが、ここではGraphicsで生成
    if (!scene.textures.exists('enemyTexture')) {
        const graphics = scene.add.graphics();
        graphics.fillStyle(0x00ff00, 1); // 緑色
        graphics.fillRect(-16, -16, 32, 32);
        graphics.generateTexture('enemyTexture', 32, 32);
        graphics.destroy();
    }

    const enemy = scene.physics.add.sprite(enemyInfo.x, enemyInfo.y, 'enemyTexture');
    enemy.id = enemyInfo.id;
    enemy.setImmovable(true); // 押しても動かない
    enemy.hp = enemyInfo.hp;

    // HP表示テキスト
    const hpText = scene.add.text(enemyInfo.x, enemyInfo.y - 30, `HP: ${enemyInfo.hp}/${enemyInfo.maxHp}`, {
        fontSize: '12px',
        fill: '#ffffff'
    }).setOrigin(0.5);
    
    enemy.hpText = hpText;

    // 敵が消えるときにテキストも消す
    enemy.on('destroy', () => {
        hpText.destroy();
    });

    scene.enemies.add(enemy);
}

function showSlashEffect(scene, player) {
    // 1. グラフィックスオブジェクトを作成
    const slash = scene.add.graphics();
    
    // 2. 色と透明度の設定 (黄色, 透明度MAX)
    slash.fillStyle(0xffff00, 0.8);

    // 3. 扇形（Slice）を描く
    // slice(x, y, 半径, 開始角度, 終了角度)
    // ここでは半径80px、中心から左右に90度ずつ（合計180度の半円）を描きます
    slash.slice(0, 0, 80, -Math.PI / 2, Math.PI / 2);
    slash.fillPath();

    // 4. プレイヤーの位置に合わせる
    slash.setPosition(player.x, player.y);
    
    // 5. プレイヤーの向きに合わせる
    slash.setRotation(player.rotation);
    
    // 6. プレイヤーより手前に表示
    slash.setDepth(25); 

    // 7. 一瞬で消えるアニメーション (Tween)
    scene.tweens.add({
        targets: slash,
        alpha: 0,       // 透明度を0に
        duration: 200,  // 0.2秒かけて
        onComplete: () => {
            slash.destroy(); // 終わったら削除
        }
    });
}

function showDamagePopup(scene, x, y, damage) {
    // 1. テキストを作成
    // 少し位置をランダムに散らすと、連続ヒットした時に見やすくなります
    const randX = Phaser.Math.Between(-10, 10);
    const damageText = scene.add.text(x + randX, y - 20, "-" + damage, {
        fontSize: '20px',
        fontStyle: 'bold',
        fill: '#ff0000', // 赤色
        stroke: '#ffffff', // 白い縁取り
        strokeThickness: 2
    }).setOrigin(0.5);

    damageText.setDepth(40); // プレイヤーやエフェクトより手前

    // 2. アニメーション (Tween)
    scene.tweens.add({
        targets: damageText,
        y: y - 50,      // 上に30px移動
        alpha: 0,       // 透明に
        duration: 800,  // 0.8秒かけて
        ease: 'Power1', // ふんわりと
        onComplete: () => {
            damageText.destroy(); // 終わったら消す
        }
    });
}
