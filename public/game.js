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
    this.load.image('slimeSprite', 'assets/slime.png');
    this.load.image('wolfSprite', 'assets/wolf.png');
    // プレイヤー画像がない場合の生成処理はcreate内で行うのでここでは不要
    this.load.spritesheet('playerSprite', 'assets/player.png', { 
        frameWidth: 32,  // キャラクター1体の幅
        frameHeight: 32  // キャラクター1体の高さ
    });
}

function create() {
    const self = this;
    this.socket = io();
    this.otherPlayers = this.physics.add.group();

    this.anims.create({
        key: 'down',
        frames: this.anims.generateFrameNumbers('playerSprite', { start: 0, end: 2 }),
        frameRate: 10,
        repeat: -1 // ループする
    });

    // 左向き (フレーム番号 3, 4, 5)
    this.anims.create({
        key: 'left',
        frames: this.anims.generateFrameNumbers('playerSprite', { start: 3, end: 5 }),
        frameRate: 10,
        repeat: -1
    });

    // 右向き (フレーム番号 6, 7, 8)
    this.anims.create({
        key: 'right',
        frames: this.anims.generateFrameNumbers('playerSprite', { start: 6, end: 8 }),
        frameRate: 10,
        repeat: -1
    });

    // 上向き (フレーム番号 9, 10, 11)
    this.anims.create({
        key: 'up',
        frames: this.anims.generateFrameNumbers('playerSprite', { start: 9, end: 11 }),
        frameRate: 10,
        repeat: -1
    });

    // --- 作成関数 ---

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
        let rawData = mapData[roomName]['tiles'];
        if (!rawData) rawData = mapData['town']['tiles']; // エラーならtownへ

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
                // 1. 移動する前の位置との差（どれくらい動いたか）を計算
                const dx = playerInfo.x - otherPlayer.x;
                const dy = playerInfo.y - otherPlayer.y;

                // 2. 位置を更新（先に更新してしまうと差分が0になるので注意ですが、
                //    PhaserのsetPositionは瞬時に反映されるため、
                //    厳密には計算用の変数を分けるのがベストですが、簡易的には直前の計算でOKです）
                // わずかなズレ（0.1以下）は無視して、大きく動いた方向のアニメを再生
                if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                    // 横移動の方が大きい場合
                    if (Math.abs(dx) > Math.abs(dy)) {
                        if (dx > 0) {
                            otherPlayer.anims.play('right', true);
                        } else {
                            otherPlayer.anims.play('left', true);
                        }
                    } 
                    // 縦移動の方が大きい場合
                    else {
                        if (dy > 0) {
                            otherPlayer.anims.play('down', true);
                        } else {
                            otherPlayer.anims.play('up', true);
                        }
                    }
                } else {
                    // ほとんど動いていない（止まった）場合はアニメ停止
                    otherPlayer.anims.stop();
                    // オプション: 止まった時に最初のフレーム（棒立ち）に戻すなら
                    // otherPlayer.setFrame(0); 
                }
                // 3. 実際に位置を移動させる
                otherPlayer.setPosition(playerInfo.x, playerInfo.y);
                otherPlayer.setRotation(playerInfo.rotation);
                otherPlayer.setPosition(playerInfo.x, playerInfo.y);
                otherPlayer.lastUpdate = Date.now();
                // ... 名前の追従 (既存) ...
                if (otherPlayer.nameLabel) {
                    otherPlayer.nameLabel.setPosition(playerInfo.x, playerInfo.y - 30);
                }
                if (otherPlayer.hpText) {
                    otherPlayer.hpText.setPosition(playerInfo.x, playerInfo.y - 50);
                }
                // ★追加：吹き出しの追従
                if (otherPlayer.chatBubble) {
                    otherPlayer.chatBubble.setPosition(playerInfo.x, playerInfo.y - 60);
                }
            }
        });
    });

    // ダメージ通知を受け取って表示
    this.socket.on('enemyDamaged', (data) => {
        // どの敵がダメージを受けたか探す
        const targetEnemy = self.enemies.getChildren().find(e => e.id === data.enemyId);
        
        if (targetEnemy) {
            // その敵の場所にポップアップを出す
            showDamagePopup(self, targetEnemy.x, targetEnemy.y, data.damage);
            
            targetEnemy.setTint(0xff0000);
            self.time.delayedCall(200, () => {
                targetEnemy.clearTint();
            });
        }
    });

    this.input.mouse.disableContextMenu();

    // HP更新を受け取る
    this.socket.on('updateHP', (newHP) => {
        console.log("HPが回復しました！ 現在のHP:", newHP);
        // ★もしHPバーを作っているなら、ここでバーの長さを更新してください
        // 例: this.hpBar.width = newHP; 
        // まだHPバーがない場合は、一旦ログだけでOKです。
    });
    
    // ★追加：クリックイベント
    this.input.on('pointerdown', (pointer) => {
        if (!self.player) return;

        // 右クリック (button === 2) なら魔法発射
        if (pointer.rightButtonDown()) {
            // サーバーに「この角度で撃って！」と依頼
            // 自分の位置からマウスへの角度を計算
            const angle = Phaser.Math.Angle.Between(self.player.x, self.player.y, pointer.worldX, pointer.worldY);
            self.socket.emit('shootFireball', angle);
        }
    });

    this.projectiles = this.add.group(); // 弾丸管理グループ

    // ★追加：弾丸情報の受信と描画
    this.socket.on('updateProjectiles', (serverProjectiles) => {
        // 1. 存在する弾を移動 or 新規作成
        Object.keys(serverProjectiles).forEach((id) => {
            const p = serverProjectiles[id];
            
            // 自分の部屋にある弾だけ描画
            if (p.room !== self.currentRoomName) return;

            let sprite = self.projectiles.getChildren().find(s => s.id === id);
            
            if (sprite) {
                // 既に画面にあれば移動
                // 少し補間して滑らかに動かす
                self.tweens.add({
                    targets: sprite,
                    x: p.x,
                    y: p.y,
                    duration: 50
                });
            } else {
                // なければ新規作成（オレンジ色の丸）
                sprite = self.add.circle(p.x, p.y, 10, 0xffa500);
                sprite.id = id;
                sprite.setDepth(200);
                self.projectiles.add(sprite);
            }
        });

        // 2. サーバーから消えた弾を削除
        self.projectiles.getChildren().forEach((sprite) => {
            if (!serverProjectiles[sprite.id]) {
                sprite.destroy();
            }
        });
    });

    this.npcGroup = this.add.group();

    this.socket.on('currentNPCs', (npcs) => {
        // ★確認ログA：そもそもサーバーから通知が来ているか？
        console.log("【確認A】サーバーからNPCデータが届きました:", npcs);

        this.npcGroup.clear(true, true);

        // ★確認ログB：ループが回っているか？
        for (const id in npcs) {
            console.log("【確認B】NPCを作成中:", id);
            
            const npc = npcs[id];
            
            // 現在のマップにいないNPCは描画しない（マップ切り替え実装済みの場合）
            if (npc.mapId !== this.currentRoomName) continue; 

            const npcSprite = this.add.circle(npc.x, npc.y, 20, npc.color);
            npcSprite.setStrokeStyle(2, 0xffffff);
            npcSprite.setDepth(10);
            npcSprite.setData('type', npc.type);
            // 名前表示
            const nameText = this.add.text(npc.x, npc.y - 30, npc.name, { fontSize: '14px', fill: '#fff' }).setOrigin(0.5);
            this.npcGroup.add(npcSprite);
            this.npcGroup.add(nameText);
        }
        console.log("【確認C】作成完了。現在のグループ数:", this.npcGroup.getLength());
    });

    // --- ダメージを受けた時の処理 ---
    // create関数内：playerDamaged の受信

    this.socket.on('playerDamaged', (data) => {
        // 1. 自分がダメージを受けた場合
        if (self.player && self.socket.id === data.playerId) {
            // 画面下のUIを更新
            if (self.hpUI) {
                self.hpUI.setText(`HP: ${data.hp}`);
                
                // 演出：赤くして戻す
                self.hpUI.setColor('#ff0000');
                setTimeout(() => self.hpUI.setColor('#00ff00'), 1000);
            }
            // プレイヤー本体を赤く点滅
            self.player.setTint(0xff0000);
            self.time.delayedCall(200, () => self.player.clearTint());

        // 2. 他人がダメージを受けた場合
        } else {
            // 対象を探す
            self.otherPlayers.getChildren().forEach((other) => {
                if (other.playerId === data.playerId) {
                    // 頭上のテキストを更新
                    if (other.hpText) {
                        other.hpText.setText(`HP: ${data.hp}`);
                        other.hpText.setColor('#ff0000');
                        setTimeout(() => other.hpText.setColor('#00ff00'), 1000);
                    }
                    other.setTint(0xff0000);
                    self.time.delayedCall(200, () => other.clearTint());
                }
            });
        }
    });

    this.socket.on('removeEnemy', (enemyId) => {
        const enemy = self.enemies.getChildren().find(e => e.id === enemyId);
        if (enemy) {
            // エフェクトを出して消すのもアリですが、まずはシンプルにdestroy
            enemy.destroy();
        }
    });

    // 自分のインベントリデータ（初期状態）
    this.myInventory = Array(30).fill(null);
    this.myGold = 0;
    this.isInventoryOpen = false; // 開いているかどうか

    this.tooltip = this.add.container(0, 0);
    this.tooltip.setScrollFactor(0); // 画面に固定
    this.tooltip.setDepth(2000); // 最前面に表示
    this.tooltip.setVisible(false); // 最初は隠す

    // 1. UIを作る
    createEquipmentUI(this);

    // インベントリUI作成
    createInventoryUI(this);

    // サーバーからのインベントリ更新を受け取る
    this.socket.on('inventoryUpdate', (data) => {
        this.myInventory = data.inventory;
        this.myGold = data.gold;
        updateInventoryUI(this); // 見た目を更新
    });

    // 現在選択されている武器の番号（0:ダガー, 1:ソード, 2:スピア）
    this.selectedSlot = 0;

    // UIを描画する関数を呼ぶ（後で作ります）
    createInventoryUI(this);

    createMerchantUI(this); // 武器商人のUI作成
    createCraftingUI(this); // 鍛冶屋のUI作成

    // 背景（黒い四角）
    const tooltipBg = this.add.rectangle(0, 0, 200, 100, 0x000000, 0.8);
    tooltipBg.setOrigin(0, 0); // 左上基準
    tooltipBg.setStrokeStyle(2, 0xffffff); // 白い枠線

    // 文字
    const tooltipText = this.add.text(10, 10, '', {
        fontSize: '14px',
        fill: '#ffffff',
        wordWrap: { width: 180 } // 長い文章は折り返す
    });

    // コンテナにまとめる
    this.tooltip.add([tooltipBg, tooltipText]);
    
    // あとでアクセスしやすいように参照を保存
    this.tooltipBg = tooltipBg;
    this.tooltipText = tooltipText;

    // 2. サーバーから装備更新通知が来たら反映
    this.socket.on('equipmentUpdate', (equipmentData) => {
        updateEquipmentDisplay(this, equipmentData);
    });

    // ★Eキーで開閉
    this.input.keyboard.on('keydown-E', () => toggleInventory(this));
    
    // Bキーで鍛冶屋を開く(閉じるときだけ機能する)
    this.input.keyboard.on('keydown-B', () => {
        if (this.isShopOpen) {
            this.isShopOpen = false;
            this.isSellingMode = false;
            this.tooltip.setVisible(false);
            this.shopContainer.setVisible(false);
            // ボタンの色などを戻す処理が必要ですが、
            // 簡易的に「次に開いたときはOFFの見た目に戻す」ため、createShopUI内の変数は手動で戻りませんが、
            // 動作としてはOFFになります。
            // 完璧にするなら updateInventoryUI のような updateShopUI 関数を作る必要がありますが、
            // まずはこれで十分動きます。
        }
    });

    // キーボード入力の設定（1, 2, 3キー）
    this.input.keyboard.on('keydown-ONE', () => selectWeapon(this, 0));
    this.input.keyboard.on('keydown-TWO', () => selectWeapon(this, 1));
    this.input.keyboard.on('keydown-THREE', () => selectWeapon(this, 2));
    
    // --- リスポーン（死亡→復活）処理 ---
    // create関数内：playerRespawn の受信
    this.socket.on('playerRespawn', (playerInfo) => {
        // 1. 自分が復活した場合
        if (self.player && self.socket.id === playerInfo.playerId) {
            self.player.setPosition(playerInfo.x, playerInfo.y);
            
            // UIを更新
            if (self.hpUI) {
                self.hpUI.setText(`HP: ${playerInfo.hp}`);
                self.hpUI.setColor('#00ff00');
            }
            // フェードイン演出
            self.player.setAlpha(0);
            self.tweens.add({ targets: self.player, alpha: 1, duration: 1000 });

        // 2. 他人が復活した場合
        } else {
            self.otherPlayers.getChildren().forEach((other) => {
                if (other.playerId === playerInfo.playerId) {
                    other.setPosition(playerInfo.x, playerInfo.y);
                    
                    // 頭上のテキストを更新
                    if (other.hpText) {
                        other.hpText.setText(`HP: ${playerInfo.hp}`);
                        other.hpText.setColor('#00ff00');
                    }
                    other.setAlpha(0);
                    self.tweens.add({ targets: other, alpha: 1, duration: 1000 });
                }
            });
        }
    });

    // 1. 経験値やレベルが変わった時の表示更新
    this.socket.on('updateStats', (stats) => {
        if (self.levelUI) {
            self.levelUI.setText(`Lv.${stats.level} (EXP: ${stats.exp}/${stats.maxExp})`);
        }
        // ★追加：MP更新
        if (self.mpUI) self.mpUI.setText(`MP: ${stats.mp}`);
        // HPも回復しているかもしれないのでUI更新
        if (self.hpUI) {
            self.hpUI.setText(`HP: ${stats.hp}`);
        }
    });

    // 2. 誰かがレベルアップした時の派手な演出
    this.socket.on('playerLevelUp', (data) => {
        // レベルアップしたプレイヤーを探す（自分 または 他人）
        let targetSprite = null;
        if (self.player && self.socket.id === data.playerId) {
            targetSprite = self.player;
        } else {
            self.otherPlayers.getChildren().forEach((other) => {
                if (other.playerId === data.playerId) targetSprite = other;
            });
        }

        if (targetSprite) {
            // 頭上に「LEVEL UP!」と出す
            const levelText = self.add.text(targetSprite.x, targetSprite.y - 60, "LEVEL UP!", {
                fontSize: '24px',
                fontStyle: 'bold',
                fill: '#ffd700', // 金色
                stroke: '#000000',
                strokeThickness: 4
            }).setOrigin(0.5);

            // 上に昇りながら消えるアニメーション
            self.tweens.add({
                targets: levelText,
                y: targetSprite.y - 100,
                alpha: 0,
                duration: 2000,
                onComplete: () => levelText.destroy()
            });

            // 本体が金色に光る
            targetSprite.setTint(0xffff00);
            self.time.delayedCall(500, () => targetSprite.clearTint());
        }
    });
    
    this.socket.on('mapChanged', function (data) {
        console.log("サーバーからマップ移動指示:", data.room);
        
        // 他プレイヤー消去
        self.otherPlayers.clear(true, true);
        
        // マップ再生成
        self.createMap(data.room);

        // 位置リセット
        self.player.setPosition(data.x, data.y);

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
                if (enemySprite.body && enemySprite.hpText) {
                    enemySprite.hpText.setPosition(enemySprite.x, enemySprite.y - 30);
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

    // デバッグ用テキスト作成
    const debugText = this.add.text(180, 10, '', { 
        fontSize: '16px', 
        fill: '#00ff00', 
        backgroundColor: '#000000' 
    }).setScrollFactor(0).setDepth(1000);

    // マウスが動くたびに座標を更新して表示
    this.input.on('pointermove', (pointer) => {
        // ワールド座標（カメラのスクロール込みの位置）
        const worldX = pointer.worldX;
        const worldY = pointer.worldY;

        // タイル座標に変換（40で割って切り捨て）
        const tileX = Math.floor(worldX / 32);
        const tileY = Math.floor(worldY / 32);

        // テキスト更新
        debugText.setText(
            `Mouse: (${Math.floor(worldX)}, ${Math.floor(worldY)})\n` +
            `Tile:  [${tileY}][${tileX}]\n` + 
            `Center: (${tileX * 32 + 16}, ${tileY * 32 + 16})\n` +
            `Edge: (${tileX * 32}, ${tileY * 32})\n` +
            `Player: (${Math.floor(this.player.x)}, ${Math.floor(this.player.y)})\n` +
            `Room: (${this.currentRoomName})`
        );
    });
    // 敵の予兆エフェクト管理用グループ
    this.aoeGraphics = this.add.group();

    this.socket.on('enemyCharge', (data) => {
        const graphics = this.add.graphics();
        this.aoeGraphics.add(graphics);

        // 初期設定：薄い赤色
        graphics.fillStyle(0xff0000, 0.2);

        // 扇形を描画
        const startAngle = data.angle - (data.width / 2);
        const endAngle = data.angle + (data.width / 2);
        
        graphics.slice(
            data.x, data.y, 
            data.radius, 
            startAngle, 
            endAngle, 
            false
        );
        graphics.fillPath();

        // ★変更点1：フェードアウトではなく、チャージ時間に合わせて「濃く」する
        // （これで「溜まっている感」が出ます。不要ならこのtweenごと削除してもOKです）
        this.tweens.add({
            targets: graphics,
            alpha: 1,           // 透明度 1.0 (くっきり) に向かって変化
            duration: data.duration, // 攻撃までの時間かけて濃くなる
            ease: 'Linear'
        });

        // ★変更点2：時間が来たら「即座に」消す
        this.time.delayedCall(data.duration, () => {
            graphics.destroy(); // 一瞬で消滅
            
            // （お好みで）攻撃発生の瞬間に「バチッ」と白いフラッシュを入れると打撃感が出ます
            // createExplosionEffect(this, data.x, data.y); // 別途関数が必要ですが
        });
    });
}

function update() {
    // 既存のチェックに追加： isTyping が true なら動かない
    if (!this.player || !mapReady || this.isTyping || this.isShopOpen) return;

    const speed = 200;
    this.player.body.setVelocity(0);

    // 移動処理
    if (this.keys.left.isDown) this.player.body.setVelocityX(-speed);
    else if (this.keys.right.isDown) this.player.body.setVelocityX(speed);

    if (this.keys.up.isDown) this.player.body.setVelocityY(-speed);
    else if (this.keys.down.isDown) this.player.body.setVelocityY(speed);

    if (this.player) {
        // 移動キーのチェック部分
        // (既にサーバーへ入力を送るコードがあると思いますが、そこにアニメ再生を追加します)

        let moving = false;

        if (this.keys.left.isDown) {
            this.player.anims.play('left', true); // 左アニメ再生
            moving = true;
        } 
        else if (this.keys.right.isDown) {
            this.player.anims.play('right', true); // 右アニメ再生
            moving = true;
        } 
        else if (this.keys.up.isDown) {
            this.player.anims.play('up', true); // 上アニメ再生
            moving = true;
        } 
        else if (this.keys.down.isDown) {
            this.player.anims.play('down', true); // 下アニメ再生
            moving = true;
        }

        // キーを離したらアニメーションを止める
        if (!moving) {
            this.player.anims.stop();
                
            // 止まった時に、最初のフレーム（立ち姿）で止める小技
            // 今のアニメーションの最初のフレームを表示
            // this.player.setFrame(0); // もし常に正面を向かせたいならこれ
        }
    }
    if (this.otherPlayers) {
        const now = Date.now();

        this.otherPlayers.getChildren().forEach(otherPlayer => {
            // lastUpdate がまだ無い場合（作りたて）は無視
            if (!otherPlayer.lastUpdate) return;

            // 最後の通信から 200ミリ秒 (0.2秒) 以上経過していたら
            if (now - otherPlayer.lastUpdate > 200) {
                // アニメーションを止める
                otherPlayer.anims.stop();
                    
                // オプション: 止まった時に棒立ち画像に戻すなら
                // otherPlayer.setFrame(0); // 正面向きのフレーム番号（素材によります）
            }
        });
    }
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

    const currentMapData = mapData[this.currentRoomName];

    if (currentMapData && currentMapData.portals) {
        // ポータルを一つずつチェック
        for (const portal of currentMapData.portals) {
            // 当たり判定 (AABB)
            if (this.player.x >= portal.x && this.player.x <= portal.x + portal.width &&
                this.player.y >= portal.y && this.player.y <= portal.y + portal.height) {
                
                console.log(`Player warped from ${this.currentRoomName} to ${portal.targetMap}`);
                
                // 1. プレイヤーの座標とマップIDを更新
                this.isChangingMap = true;
                this.currentRoomName = portal.targetMap;
                
                // 2. 本人に「マップ変わったよ」と通知
                this.socket.emit('changeArea', {
                    mapId: this.currentRoomName,
                    x: portal.targetX,
                    y: portal.targetY
                });

                // ループを抜ける（同時に2つのポータルは踏めないので）
                break; 
            }
        }
    }
    if (this.keys.attack.isDown && !this.isTyping && Date.now() - this.lastAttackTime > 500) {
        const slotItem = this.myInventory[this.selectedSlot];
        let weapon = { damage: 0, range: 30, radius: 40, color: 0xffffff }; // 素手
        if (slotItem && ITEMS[slotItem.id] && ITEMS[slotItem.id].type === 'weapon') {
            weapon = ITEMS[slotItem.id];
        }
        this.lastAttackTime = Date.now();
        
        // 1. 斬撃エフェクトを出す
        showSlashEffect(this, this.player, angle, weapon);

        // 2. 近くの敵を探す
        this.enemies.getChildren().forEach((enemy) => {
            // A. 距離のチェック (80px以内まで届くように延長)
            const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            
            if (distance < weapon.radius) { // 以前は60でした
                
                // B. 角度のチェック（ここが新機能！）
                
                // 敵が「自分の位置から見てどの方角にいるか」を計算
                const angleToEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                
                // 「自分が向いている方向(rotation)」と「敵の方角」の差を計算
                // Phaser.Math.Angle.Wrap は、角度のズレを -PI ～ +PI の範囲に綺麗に整えてくれる便利な関数です
                const angleDiff = Phaser.Math.Angle.Wrap(angle - angleToEnemy);

                // 差が 90度(PI/2) 以内ならヒット
                // (右90度 + 左90度 = 合計180度の半円範囲になります)
                if (Math.abs(angleDiff) < weapon.range * Math.PI / 180) {
                    
                    // ヒット確定！
                    this.socket.emit('attackEnemy', { enemyId: enemy.id, damage: weapon.damage });
                    
                    // ダメージ演出
                    enemy.setTint(0xff0000);
                    this.time.delayedCall(200, () => {
                        enemy.clearTint();
                    });
                }
            }
        });
        this.npcGroup.getChildren().forEach((enemy) => {
            // A. 距離のチェック (80px以内まで届くように延長)
            const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            
            if (distance < weapon.radius) { // 以前は60でした
                
                const angleToEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                
                // Phaser.Math.Angle.Wrap は、角度のズレを -PI ～ +PI の範囲に綺麗に整えてくれる
                const angleDiff = Phaser.Math.Angle.Wrap(angle - angleToEnemy);

                // 差が 90度(PI/2) 以内ならヒット
                // (右90度 + 左90度 = 合計180度の半円範囲になる)
                if (Math.abs(angleDiff) < weapon.range * Math.PI / 180) {
                    // ヒット確定！
                    if (enemy.getData('type') === 'merchant' && !this.isMerchantOpen) {
                        this.isMerchantOpen = true;
                        this.merchantContainer.setVisible(true);
                        this.tooltip.setVisible(false);
                        this.isSellingMode = false;
                        break;
                    }else if (enemy.getData('type') === 'blacksmith' && !this.isCraftingOpen) {
                        this.isCraftingOpen = true;
                        this.craftContainer.setVisible(true);
                        break;
                    }
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

    //self.player = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'playerTexture')
    self.player = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'playerSprite')
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

    // 画面の左下あたりに表示
    // setScrollFactor(0) をつけると、カメラが動いてもその場に固定されます
    self.hpUI = self.add.text(20, self.cameras.main.height - 50, `HP: ${playerInfo.hp}`, { 
        fontSize: '24px',       // 少し大きく
        fill: '#00ff00',        // 緑色
        stroke: '#000000',      // 黒い縁取り
        strokeThickness: 4
    });

    self.levelUI = self.add.text(20, self.cameras.main.height - 80, `Lv.1 (EXP: 0/100)`, { 
        fontSize: '18px',
        fill: '#ffff00', // 黄色
        stroke: '#000000',
        strokeThickness: 3
    });
    self.levelUI.setScrollFactor(0); // 画面固定
    self.levelUI.setDepth(100);
    
    self.hpUI.setScrollFactor(0); // ★重要：これでカメラ移動に追従せず固定される
    self.hpUI.setDepth(100);      // 最前面に表示

    // ★追加：MP表示UI
    self.mpUI = self.add.text(20, self.cameras.main.height - 110, `MP: ${playerInfo.mp}/${playerInfo.maxMp}`, { 
        fontSize: '18px',
        fill: '#00ffff', // 水色
        stroke: '#000000',
        strokeThickness: 3
    });
    self.mpUI.setScrollFactor(0);
    self.mpUI.setDepth(100);
    
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
    // --- 修正後 ---
    // 他人は物理演算が不要なので単純な add.sprite でOK
    const otherPlayer = self.add.sprite(playerInfo.x, playerInfo.y, 'playerSprite');
    
    // 他人と区別するために、少し色を混ぜる（赤みがかかる）
    otherPlayer.setTint(0xffaaaa)
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

    otherPlayer.hpText = self.add.text(playerInfo.x, playerInfo.y - 50, `HP: ${playerInfo.hp}`, { 
        fontSize: '14px', 
        fill: '#00ff00',
        stroke: '#000000',
        strokeThickness: 3
    }).setOrigin(0.5);
    otherPlayer.hpText.setDepth(20);

    // 削除時の連動 (名前と一緒にHPも消す)
    const oldDestroy = otherPlayer.destroy; // 元のdestroyを保存
    otherPlayer.destroy = function() { // 上書き
        if (this.hpText) this.hpText.destroy();
        if (this.nameLabel) this.nameLabel.destroy(); // 以前の実装
        oldDestroy.call(this); // 元の処理も実行
    };

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

// game.js の createEnemy 関数を丸ごと置き換え

function createEnemy(scene, enemyInfo) {
    const existing = scene.enemies.getChildren().find(e => e.id === enemyInfo.id);
    if (existing) return;

    // ★修正：画像 'enemySprite' を使ってスプライトを作成
    const textureKey = enemyInfo.spriteKey || 'slimeSprite';
    const enemy = scene.physics.add.sprite(enemyInfo.x, enemyInfo.y, textureKey);
    enemy.id = enemyInfo.id
    switch (enemyInfo.spriteKey) {
        case 'wolfSprite':
            enemy.setDisplaySize(48, 48);
            enemy.body.setSize(48, 48); // 当たり判定
            break;
            
        case 'bossSprite':
            enemy.setDisplaySize(128, 128); // めっちゃでかい
            enemy.body.setSize(100, 100);
            break;
            
        case 'slimeSprite':
        default:
            enemy.setDisplaySize(32, 32);
            enemy.body.setSize(32, 32);
            break;
    }

    enemy.setImmovable(true);
    enemy.setDepth(10); // プレイヤーと同じ高さに
    enemy.hp = enemyInfo.hp;

    // HPテキストの表示（既存）
    const hpText = scene.add.text(enemyInfo.x, enemyInfo.y - 40, `HP: ${enemyInfo.hp}/${enemyInfo.maxHp}`, {
        fontSize: '12px',
        fill: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2
    }).setOrigin(0.5);
    hpText.setDepth(11);
    enemy.hpText = hpText;

    enemy.on('destroy', () => {
        hpText.destroy();
    });

    scene.enemies.add(enemy);
}

function showSlashEffect(scene, player, angle, weapon) {
    // 1. グラフィックスオブジェクトを作成
    const slash = scene.add.graphics();
    
    // 2. 色と透明度の設定 (黄色, 透明度MAX)
    slash.fillStyle(0xffff00, 0.8);

    // 3. 扇形（Slice）を描く
    // slice(x, y, 半径, 開始角度, 終了角度)
    // ここでは半径80px、中心から左右に90度ずつ（合計180度の半円）を描きます
    slash.slice(0, 0, weapon.radius, weapon.range * -Math.PI / 180, weapon.range * Math.PI / 180);
    slash.fillPath();

    // 4. プレイヤーの位置に合わせる
    slash.setPosition(player.x, player.y);
    
    // 5. プレイヤーの向きに合わせる
    slash.setRotation(angle);
    
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

function selectWeapon(scene, index) {
    scene.selectedSlot = index;
    updateInventoryUI(scene); // 見た目を更新
}

// game.js の updateInventoryUI 関数をこれに置き換えてください

function updateInventoryUI(scene) {
    // お金の表示更新
    scene.goldText.setText(`Gold: ${scene.myGold}`);

    // 全てのスロットをループして見た目を更新
    for (let i = 0; i < 30; i++) {
        const item = scene.myInventory[i];
        const ui = scene.invSlots[i];

        // --- ★ここから：色と枠線の決定ロジック ---
        
        let bgColor = 0x000000;    // デフォルト背景：黒
        let bgAlpha = 0.5;         // デフォルト透明度
        let strokeColor = 0xffffff;// デフォルト枠線：白
        let strokeWidth = 2;       // デフォルト枠線の太さ

        // パターンA：今まさに「掴んでいる（ドラッグ中）」アイテムの場合
        if (i === scene.holdingIndex) {
            bgColor = 0x0000ff;    // 青色
            bgAlpha = 0.8;
        }
        // パターンB：ホットバーで「手に持っている（装備中）」武器の場合
        else if (ui.isHotbar && i === scene.selectedSlot) {
            strokeColor = 0xffff00;// 黄色の枠
            strokeWidth = 4;       // 太く
            bgColor = 0x666666;    // 少し明るいグレー
            bgAlpha = 0.8;
        }
        
        // 決定したスタイルを適用（ここで強制的に色が上書きされます）
        ui.bg.setFillStyle(bgColor, bgAlpha);
        ui.bg.setStrokeStyle(strokeWidth, strokeColor);

        // --- ★ここまで：色のロジック終了 ---


        // テキストの更新処理（以前と同じ）
        if (item) {
            // アイテムがある場合
            let itemName = item.id;
            // もしITEMS定義がgame.jsにあれば名前を日本語で表示
            if (typeof ITEMS !== 'undefined' && ITEMS[item.id]) {
                itemName = ITEMS[item.id].name; 
            }
            
            ui.text.setText(itemName);
            ui.countText.setText(item.count > 1 ? item.count : '');
        } else {
            // 空の場合
            ui.text.setText('');
            ui.countText.setText('');
        }
    }
}

// ■ UI作成関数（game.jsの末尾に追加・修正）

function createInventoryUI(scene) {
    scene.invContainer = scene.add.container(0, 0).setScrollFactor(0).setDepth(100);
    scene.invSlots = []; // 画像やテキストを管理する配列

    // 1. ホットバー (画面下部, ID: 0, 1, 2)
    for (let i = 0; i < 3; i++) {
        createSlot(scene, i, 400 + (i - 1) * 60, 550, true);
    }

    // 2. メインインベントリ (画面中央, ID: 3 ~ 29)
    // 9列 x 3行
    const startX = 220;
    const startY = 150;
    for (let i = 0; i < 27; i++) {
        const col = i % 9;
        const row = Math.floor(i / 9);
        // IDは 3 からスタート
        createSlot(scene, 3 + i, startX + col * 50, startY + row * 50, false);
    }
    

    // 3. お金表示
    if(!scene.goldText)
    scene.goldText = scene.add.text(20, 20, 'Gold: 0', { fontSize: '16px', fill: '#ffd700' })
        .setScrollFactor(0).setDepth(100);
    
    // 初期状態ではメインインベントリ（ID >= 3）を隠す
    toggleInventory(scene, true); // 強制的に閉じる処理を呼ぶ
}

// 1つのスロットを作るヘルパー関数
function createSlot(scene, index, x, y, isHotbar) {
    const slotSize = isHotbar ? 50 : 40;
    
    // 背景
    const bg = scene.add.rectangle(x, y, slotSize, slotSize, 0x000000, 0.5);
    bg.setScrollFactor(0);

    bg.setStrokeStyle(2, 0xffffff);
    
    // ★修正A：カーソルを手の形にする（これで「押せる」かどうかが分かります）
    bg.setInteractive({ useHandCursor: true });

    // アイテム名
    const text = scene.add.text(x, y, '', { fontSize: '10px', fill: '#fff' }).setOrigin(0.5);
    
    // 個数表示
    const countText = scene.add.text(x + slotSize/2 - 5, y + slotSize/2 - 5, '', { fontSize: '10px', fill: '#ff0' }).setOrigin(1, 1);

    // ★修正B：コンテナに追加
    // 重要：textがクリックを吸わないようにbgを明確にターゲットにする
    scene.invContainer.add([bg, text, countText]);
    
    // スロット情報を保存
    scene.invSlots[index] = { bg, text, countText, x, y, isHotbar };

    // ★修正C：クリックイベントにログを仕込む
    bg.on('pointerdown', (pointer) => {
        // ■ 右クリックの場合：アイテムを使用
        if (pointer.rightButtonDown()) {
            // ショップが開いているときは誤爆防止で使えないようにする（お好みで）
            if (scene.isShopOpen) return;
            const item = scene.myInventory[index];
            const type = ITEMS[item.id].type

            console.log(`Right click on slot ${index}`);
            if (type === "consumable") scene.socket.emit('useItem', index);
            if (type === "equipment") scene.socket.emit('equipItem', index);
        }
        // ■ 左クリックの場合：アイテムを掴む・移動（これまでの処理）
        else {
            handleSlotClick(scene, index);
        }
    });
    // ■ カーソルが乗ったとき（表示）
    bg.on('pointerover', () => {
        if (!scene.isInventoryOpen && !scene.isShopOpen) {
            return;
        }
        // そのスロットに入っているアイテムデータを取得
        const item = scene.myInventory[index];
        if (!item) return; // 空なら何もしない

        const itemData = ITEMS[item.id];
        if (!itemData) return;

        // 1. 売値の計算
        const sellPrice = Math.floor(itemData.price / 2);

        // 2. 表示するテキストを作成
        const text = `■ ${itemData.name}\n\n${itemData.desc || ''}\n\n売値: ${sellPrice} G`;

        // 3. テキストをセット
        scene.tooltipText.setText(text);

        // 4. 背景のサイズを文字量に合わせて自動調整
        const bounds = scene.tooltipText.getBounds();
        scene.tooltipBg.setSize(bounds.width + 20, bounds.height + 20);

        // 5. 表示位置をスロットの右下あたりにする
        // （pointer.x, pointer.y を使ってマウスに追従させることも可能ですが、今回はスロット基準で）
        const worldPos = bg.getBounds();
        scene.tooltip.setPosition(worldPos.x + 20, worldPos.y + 20);

        // 6. 表示ON
        scene.tooltip.setVisible(true);
    });

    // ■ カーソルが外れたとき（非表示）
    bg.on('pointerout', () => {
        scene.tooltip.setVisible(false);
    });
}

// Eキーでの開閉
function toggleInventory(scene, forceClose = false) {
    if (forceClose) {
        scene.isInventoryOpen = false;
    } else {
        scene.isInventoryOpen = !scene.isInventoryOpen;
    }
    if (scene.isInventoryOpen) {
        // インベントリと一緒に装備画面も出す
        scene.equipContainer.setVisible(true);
    } else {
        // 隠す
        scene.equipContainer.setVisible(false);
        scene.tooltip.setVisible(false);
    }
    // Slot 3以上（メインインベントリ）の表示/非表示を切り替え
    for (let i = 3; i < 30; i++) {
        const slot = scene.invSlots[i];
        slot.bg.visible = scene.isInventoryOpen;
        slot.text.visible = scene.isInventoryOpen;
        slot.countText.visible = scene.isInventoryOpen;
    }
}

// ドラッグの代わりに「クリック＆クリック」で入れ替えるロジック
// (holdingIndex: 今掴んでいるアイテムの元スロット番号)
// game.js の handleSlotClick 関数を修正

function handleSlotClick(scene, index) {
    // 1. 変数が未定義なら初期化（安全策）
    if (scene.holdingIndex === undefined) scene.holdingIndex = null;

    // インベントリが閉じていて、ホットバー以外なら無視
    if (!scene.isInventoryOpen && index >= 3) return;

    // ★ここを追加：売却モードの処理
    if (scene.isShopOpen && scene.isSellingMode) {
        // アイテムがあるか確認
        if (scene.myInventory[index]) {
            // サーバーに売却依頼
            scene.socket.emit('sellItem', index);
            
            // 少し演出（売った！というログ）
            console.log("Sold item at slot", index);
        }
        return; // ここで処理終了（掴まない）
    }
    
    // 現在のアイテムデータ
    const item = scene.myInventory[index];
    console.log(`Slot data:`, item); // デバッグ用
    scene.tooltip.setVisible(false);
    // ■ ケースA：まだ何も掴んでいない時
    if (scene.holdingIndex === null) {
        // アイテムがある場合のみ掴める
        if (item) {
            scene.holdingIndex = index;
            console.log(`Grabbed item at ${index}`);
            
            // ★視覚効果：掴んだ場所を「青色」にする
            scene.invSlots[index].bg.setFillStyle(0x0000ff, 1); 
        } else {
            console.log("Empty slot, cannot grab.");
        }
    } 
    // ■ ケースB：すでに何かを掴んでいる時（入れ替え or キャンセル）
    else {
        const fromIndex = scene.holdingIndex;
        const toIndex = index;

        // 同じ場所をクリックしたらキャンセル（選択解除）
        if (fromIndex === toIndex) {
            console.log("Cancelled selection.");
            scene.holdingIndex = null;
            updateInventoryUI(scene); // 色を元に戻す
            return;
        }

        // 違う場所ならサーバーに入れ替え依頼
        console.log(`Swapping ${fromIndex} with ${toIndex}`);
        scene.socket.emit('swapInventory', { from: fromIndex, to: toIndex });

        // 選択状態を解除
        scene.holdingIndex = null;
        
        // UI更新はサーバーからの返信(inventoryUpdate)を待っても良いですが、
        // レスポンスをよくするためにここで一旦色だけ戻します
        updateInventoryUI(scene);
    }
}

function createShopUI(scene) {
    scene.isShopOpen = false;
    
    // 背景（画面中央）
    scene.shopContainer = scene.add.container(150, 100).setScrollFactor(0).setDepth(200);
    scene.shopContainer.setVisible(false);

    // 2. 「売却モードのときに消したいもの」をまとめるコンテナを作る
    scene.shopContent = scene.add.container(0, 0);
    scene.shopContainer.add(scene.shopContent);

    const bg = scene.add.rectangle(250, 200, 500, 400, 0x000000, 0.9);
    bg.setStrokeStyle(4, 0x884400); // 茶色の枠
    bg.setInteractive(); // クリックが後ろに抜けないように
    // ★追加：背景の当たり判定を画面固定にする
    bg.setScrollFactor(0);
    scene.shopContent.add(bg);

    const title = scene.add.text(250, 30, '=== 鍛冶屋 (Bキーで閉じる) ===', { fontSize: '20px', fill: '#fff' }).setOrigin(0.5);
    scene.shopContent.add(title);

    scene.isSellingMode = false; // 初期状態はOFF

    // ボタンの背景
    const sellBtn = scene.add.rectangle(250, 360, 200, 40, 0xaa0000);
    sellBtn.setScrollFactor(0); // 画面固定！
    sellBtn.setInteractive({ useHandCursor: true });
    
    // ボタンの文字
    const sellText = scene.add.text(250, 360, '売却モード: OFF', { fontSize: '16px', fill: '#fff' }).setOrigin(0.5);

    // クリックイベント
    sellBtn.on('pointerdown', () => {
        scene.isSellingMode = !scene.isSellingMode; // ON/OFF切り替え

        if (scene.isSellingMode) {
            sellBtn.setFillStyle(0xff0000, 1); // ONなら明るい赤
            sellText.setText('売却モード: ON (アイテムをクリック)');
            scene.shopContent.setVisible(false)
        } else {
            sellBtn.setFillStyle(0xaa0000, 1); // OFFなら暗い赤
            sellText.setText('売却モード: OFF');
            scene.shopContent.setVisible(true);
        }
    });

    scene.shopContainer.add([sellBtn, sellText]);

    // --- 左側：ショップ（購入） ---
    scene.shopContent.add(scene.add.text(50, 60, '【購入】', { fill: '#00ff00' }));
    
    const shopItems = ['potion', 'sword', 'leather_helm', 'chain_mail', 'power_ring']; // 売っているものリスト
    
    shopItems.forEach((id, index) => {
        const item = ITEMS[id];
        const y = 100 + index * 40;
        
        // ボタン背景
        const btn = scene.add.rectangle(120, y, 140, 30, 0x333333).setInteractive({ useHandCursor: true });
        const text = scene.add.text(120, y, `${item.name} (${item.price}G)`, { fontSize: '12px' }).setOrigin(0.5);

        btn.setScrollFactor(0);
        
        btn.on('pointerdown', () => {
            scene.socket.emit('buyItem', id);
        });

        scene.shopContent.add([btn, text]);
    });


    // --- 右側：クラフト（作成） ---
    scene.shopContent.add(scene.add.text(300, 60, '【クラフト】', { fill: '#00ffff' }));

    RECIPES.forEach((recipe, index) => {
        const resultItem = ITEMS[recipe.id];
        const y = 100 + index * 60; // 少し広めに

        // レシピの説明文を作成
        let reqText = '';
        for (const [matId, count] of Object.entries(recipe.materials)) {
            const matName = ITEMS[matId] ? ITEMS[matId].name : matId;
            reqText += `${matName}x${count} `;
        }

        // ボタン背景
        const btn = scene.add.rectangle(370, y, 240, 50, 0x442200).setInteractive({ useHandCursor: true });

        btn.setScrollFactor(0);
        
        // 商品名
        const nameText = scene.add.text(370, y - 10, `作る: ${resultItem.name}`, { fontSize: '14px', fill: '#ffaa00' }).setOrigin(0.5);
        // 素材表示
        const matText = scene.add.text(370, y + 10, `必要: ${reqText}\n費用: ${recipe.cost}G`, { fontSize: '10px', fill: '#ccc' }).setOrigin(0.5);

        btn.on('pointerdown', () => {
            scene.socket.emit('craftItem', index);
        });

        scene.shopContent.add([btn, nameText, matText]);
    });
}

// game.js

function createMerchantUI(scene) {
    // 状態管理フラグ（必要に応じて初期化）
    scene.isMerchantOpen = false;
    scene.isSellingMode = false;

    // --- コンテナ作成 ---
    // 画面中央あたりに配置
    scene.merchantContainer = scene.add.container(200, 100).setScrollFactor(0).setDepth(200);
    scene.merchantContainer.setVisible(false);

    // --- 1. 売却モード時に非表示にするグループ ---
    scene.merchantBuyContent = scene.add.container(0, 0);
    scene.merchantContainer.add(scene.merchantBuyContent);

    // --- 背景 ---
    const bg = scene.add.rectangle(150, 200, 300, 400, 0x000000, 0.9); // 幅を少し調整
    bg.setStrokeStyle(4, 0x00ff00); // 商人は緑枠
    bg.setInteractive(); 
    bg.setScrollFactor(0);
    scene.merchantContainer.addAt(bg, 0); // コンテナの一番奥に追加

    // --- タイトル ---
    const title = scene.add.text(150, 30, '=== 武器商人 ===', { fontSize: '20px', fill: '#fff' }).setOrigin(0.5);
    scene.merchantContainer.add(title);
    
    // --- 閉じる説明 ---
    const closeHint = scene.add.text(150, 380, '(SPACEキーで閉じる)', { fontSize: '12px', fill: '#aaa' }).setOrigin(0.5);
    scene.merchantContainer.add(closeHint);


    // --- 売却モード切替ボタン ---
    const sellBtn = scene.add.rectangle(150, 340, 200, 40, 0xaa0000);
    sellBtn.setScrollFactor(0);
    sellBtn.setInteractive({ useHandCursor: true });
    
    const sellText = scene.add.text(150, 340, '売却モード: OFF', { fontSize: '16px', fill: '#fff' }).setOrigin(0.5);

    sellBtn.on('pointerdown', () => {
        scene.isSellingMode = !scene.isSellingMode;

        if (scene.isSellingMode) {
            sellBtn.setFillStyle(0xff0000, 1);
            sellText.setText('売却モード: ON');
            // 購入リストを隠す
            scene.merchantBuyContent.setVisible(false);
        } else {
            sellBtn.setFillStyle(0xaa0000, 1);
            sellText.setText('売却モード: OFF');
            // 購入リストを表示
            scene.merchantBuyContent.setVisible(true);
        }
    });

    scene.merchantContainer.add([sellBtn, sellText]);


    // --- 【購入リスト】の生成 ---
    scene.merchantBuyContent.add(scene.add.text(150, 70, '【商品一覧】', { fill: '#00ff00', fontSize: '16px' }).setOrigin(0.5));
    
    // 定義済みの商品リスト
    const shopItems = ['potion', 'iron_sword', 'leather_helm', 'chain_mail', 'power_ring']; 
    
    shopItems.forEach((id, index) => {
        // アイテムデータ取得（ITEMSはグローバルまたはsceneから参照）
        const item = ITEMS[id]; 
        if (!item) return;

        const y = 110 + index * 40;
        
        // ボタン背景
        const btn = scene.add.rectangle(150, y, 240, 30, 0x333333).setInteractive({ useHandCursor: true });
        btn.setScrollFactor(0); // 重要

        // テキスト
        const text = scene.add.text(150, y, `${item.name} (${item.price}G)`, { fontSize: '14px', fill: '#ffffff' }).setOrigin(0.5);
        
        // 購入イベント
        btn.on('pointerdown', () => {
            console.log(`${item.name} を購入リクエスト`);
            scene.socket.emit('buyItem', id);
        });

        // リスト用コンテナに追加
        scene.merchantBuyContent.add([btn, text]);
    });
}

function createCraftingUI(scene) {
    scene.isCraftingOpen = false;

    // --- コンテナ作成 ---
    // 商人とは少し位置を変えても良いかもしれません
    scene.craftContainer = scene.add.container(200, 100).setScrollFactor(0).setDepth(200);
    scene.craftContainer.setVisible(false);

    // --- 背景 ---
    const bg = scene.add.rectangle(200, 250, 400, 500, 0x000000, 0.9); // レシピは見やすいよう少し広めに
    bg.setStrokeStyle(4, 0xff4400); // 鍛冶屋は赤っぽい枠
    bg.setInteractive();
    bg.setScrollFactor(0);
    scene.craftContainer.add(bg);

    // --- タイトル ---
    const title = scene.add.text(200, 30, '=== 鍛冶職人 ===', { fontSize: '20px', fill: '#fff' }).setOrigin(0.5);
    scene.craftContainer.add(title);
    
    // --- 閉じる説明 ---
    const closeHint = scene.add.text(200, 480, '(SPACEキーで閉じる)', { fontSize: '12px', fill: '#aaa' }).setOrigin(0.5);
    scene.craftContainer.add(closeHint);


    // --- 【クラフトリスト】の生成 ---
    scene.craftContainer.add(scene.add.text(200, 70, '【作成リスト】', { fill: '#ffaa00', fontSize: '16px' }).setOrigin(0.5));

    // RECIPESはグローバル定義されている前提
    RECIPES.forEach((recipe, index) => {
        const resultItem = ITEMS[recipe.id];
        if (!resultItem) return;

        const y = 120 + index * 60; // 情報量が多いので間隔を広めに

        // 素材テキストの生成
        let reqText = '';
        if (recipe.materials) {
            for (const [matId, count] of Object.entries(recipe.materials)) {
                const matName = ITEMS[matId] ? ITEMS[matId].name : matId;
                reqText += `${matName}x${count}  `;
            }
        }

        // ボタン背景
        const btn = scene.add.rectangle(200, y, 350, 50, 0x442200).setInteractive({ useHandCursor: true });
        btn.setStrokeStyle(1, 0x884400);
        btn.setScrollFactor(0);
        
        // アイテム名
        const nameText = scene.add.text(200, y - 12, `作る: ${resultItem.name}`, { fontSize: '16px', fill: '#ffdd00' }).setOrigin(0.5);
        
        // 必要素材と費用
        const infoText = scene.add.text(200, y + 12, `必要: ${reqText}\n費用: ${recipe.cost}G`, { fontSize: '11px', fill: '#cccccc', align: 'center' }).setOrigin(0.5);

        // 作成イベント
        btn.on('pointerdown', () => {
            console.log(`${resultItem.name} の作成リクエスト`);
            scene.socket.emit('craftItem', index);
        });

        scene.craftContainer.add([btn, nameText, infoText]);
    });
}

function createEquipmentUI(scene) {
    // 1. 装備画面全体のコンテナ
    scene.equipContainer = scene.add.container(300, 400); // インベントリの左隣などを想定
    scene.equipContainer.setScrollFactor(0);
    scene.equipContainer.setDepth(1500);
    scene.equipContainer.setVisible(false); // 最初は隠す

    // 背景（オプション）
    const bg = scene.add.rectangle(0, 0, 180, 260, 0x000000, 0.5);
    bg.setStrokeStyle(2, 0xaaaaaa);
    scene.equipContainer.add(bg);

    // タイトル
    const title = scene.add.text(0, -90, 'EQUIPMENT', { fontSize: '16px', fill: '#aaa' }).setOrigin(0.5);
    scene.equipContainer.add(title);

    // 2. スロットの配置定義（相対座標）
    // 人型になるように配置します
    const slotLayout = {
        'head':      { x: 0,   y: -50, label: '頭' },
        'weapon':    { x: -50, y: 10,  label: '武器' },
        'body':      { x: 0,   y: 10,  label: '体' },
        'accessory1': { x: 50,  y: -50, label: '装飾1' },
        'accessory2': { x: 50,  y: 10,  label: '装飾2' },
        'accessory3': { x: 50,  y: 70,  label: '装飾3' }
    };

    // スロット管理用のオブジェクト
    scene.equipSlots = {};

    // 3. スロット生成ループ
    for (const [slotName, config] of Object.entries(slotLayout)) {
        
        // スロットの枠
        const slotBg = scene.add.rectangle(config.x, config.y, 40, 40, 0x333333);
        slotBg.setStrokeStyle(1, 0x888888);
        slotBg.setInteractive(); // クリック可能に
        slotBg.setScrollFactor(0);
        
        // ラベル（薄く表示）
        const slotLabel = scene.add.text(config.x, config.y, config.label, { 
            fontSize: '10px', fill: '#666' 
        }).setOrigin(0.5);

        // アイテム画像（最初は空なので非表示かダミー）
        const itemIcon = scene.add.sprite(config.x, config.y, null);
        itemIcon.setVisible(false);

        // コンテナに追加
        scene.equipContainer.add([slotBg, slotLabel, itemIcon]);

        // 参照を保存（あとで更新するため）
        scene.equipSlots[slotName] = {
            bg: slotBg,
            icon: itemIcon,
            itemData: null // 今何が入っているか
        };

        // --- イベント設定（外す処理） ---
        slotBg.on('pointerdown', () => {
            // 何か装備していれば「外す」命令を送る
            if (scene.equipSlots[slotName].itemData) {
                scene.socket.emit('unequipItem', slotName);
            }
        });

        // --- ツールチップ（既存の仕組みを流用） ---
        slotBg.on('pointerover', () => {
            const data = scene.equipSlots[slotName].itemData;
            if (data && scene.isInventoryOpen) { // インベントリが開いている時のみ
                 const itemInfo = ITEMS[data.id];
                 if (itemInfo) {
                     // 既存のツールチップ更新処理をここでも使う
                     // ※長いので関数化しておくと便利ですが、ここでは直書きイメージ
                     const text = `■ ${itemInfo.name}\n${itemInfo.desc || ''}\n効果: 攻+${itemInfo.atk || 0} 防+${itemInfo.def || 0}`;
                     scene.tooltipText.setText(text);
                     const bounds = scene.tooltipText.getBounds();
                     scene.tooltipBg.setSize(bounds.width + 20, bounds.height + 20);
                     
                     // ツールチップの位置調整（スロットの少し横など）
                     // ワールド座標を取得する必要があるため getBounds を利用
                     const worldPos = slotBg.getBounds();
                     scene.tooltip.setPosition(worldPos.x + 40, worldPos.y);
                     scene.tooltip.setVisible(true);
                 }
            }
        });

        slotBg.on('pointerout', () => {
            scene.tooltip.setVisible(false);
        });
    }
}

// game.js

function updateEquipmentDisplay(scene, equipmentData) {
    // equipmentData は { head: {id: 'leather_helm'}, body: null, ... } のような形

    for (const [slotName, item] of Object.entries(equipmentData)) {
        const uiSlot = scene.equipSlots[slotName];
        if (!uiSlot) continue;

        if (item) {
            // ■ 装備がある場合
            // アイコンを表示（atlasを使っている場合は setFrame、画像の直接読み込みなら setTexture）
            uiSlot.icon.setTexture(item.id); // アイテムID = 画像キー の場合
            uiSlot.icon.setDisplaySize(32, 32);
            uiSlot.icon.setVisible(true);
            
            // データを保存（ツールチップや外す処理用）
            uiSlot.itemData = item;
        } else {
            // ■ 装備がない場合
            uiSlot.icon.setVisible(false);
            uiSlot.itemData = null;
        }
    }
}
