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
    // ★追加: 名前入力プロンプト
    // 1. ローカルストレージから名前を探す
    let myUsername = localStorage.getItem('my_rpg_username');

    // 2. 名前が保存されていなければ入力させる
    if (!myUsername) {
        while (!myUsername) {
            myUsername = prompt("ユーザー名を入力してください", "Player1");
        }
        // 名前を保存する（次からは聞かれない）
        localStorage.setItem('my_rpg_username', myUsername);
    }

    // 2. サーバーに「この名前で遊びたい」と伝える
    this.socket.emit('joinGame', myUsername);

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

    // --- Socket イベント ---
    this.createMap("town");
    
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
            self.socket.emit('shootFireball', {angle: angle, speed: 20, damage: 20, mp: 10, time: 3000});
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
    createAppraiserUI(this);
    createGoldTransferButton(this);

    // 背景（黒い四角）
    //const tooltipBg = this.add.rectangle(0, 0, 200, 100, 0x000000, 0.8);
    //tooltipBg.setOrigin(0, 0); // 左上基準
    //tooltipBg.setStrokeStyle(2, 0xffffff); // 白い枠線

    // 文字
    //const tooltipText = this.add.text(10, 10, '', {
        //fontSize: '14px',
        //fill: '#ffffff',
        //wordWrap: { width: 180 } // 長い文章は折り返す
    //});

    // コンテナにまとめる
    //this.tooltip.add([tooltipBg, tooltipText]);
    
    // あとでアクセスしやすいように参照を保存
    //this.tooltipBg = tooltipBg;
    //this.tooltipText = tooltipText;

    this.tooltipDiv = document.createElement('div');
    this.tooltipDiv.id = 'game-tooltip';
    document.body.appendChild(this.tooltipDiv);

    // シーンが終了したらDOMも消す処理（念のため）
    this.events.on('shutdown', () => {
        if (this.tooltipDiv) this.tooltipDiv.remove();
    });

    // 2. サーバーから装備更新通知が来たら反映
    this.socket.on('equipmentUpdate', (equipmentData) => {
        updateEquipmentDisplay(this, equipmentData);
    });

    // ★Eキーで開閉
    this.input.keyboard.on('keydown-E', () => toggleInventory(this));
    
    // Bキーで鍛冶屋を開く(閉じるときだけ機能する)
    this.input.keyboard.on('keydown-B', () => {
        if (this.isMerchantOpen) {
            this.closeMerchantUI();
            this.tooltip.setVisible(false);
        }else if (this.isCraftingOpen) {
            this.isCraftingOpen = false;
            this.tooltip.setVisible(false);
            this.craftContainer.setVisible(false);
        }else if (this.isAppraiserOpen) {
            this.isAppraiserOpen = false;
            this.appraiserContainer.setVisible(false);
            this.appraiserList.setVisible(false);
        }else if (this.isWarehouseOpen) {
            this.closeWarehouseUI();
        }
    });

    createMenuUI(this);

    this.input.keyboard.on('keydown-Q', () => {
        this.isMenuOpen = !this.isMenuOpen;

        if (this.isMenuOpen && !this.isCraftingOpen &&!this.isMerchantOpen) {
            this.menuContainer.setVisible(true);
            
            // 最初はメインメニューを表示し、ステータス画面は隠すリセット処理
            this.menuMain.setVisible(true);
            this.menuStatus.setVisible(false);
            this.menuSuicide.setVisible(false);
            // 他のウィンドウ（インベントリやショップ）を閉じる処理をここに入れても親切です
            // thisContainer.setVisible(false); 
        } else {
            // メニューを閉じる
            this.menuContainer.setVisible(false);
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
        if (self.statusText) {
            const equipAtk = stats.totalAtk - stats.baseAtk;
            const equipDef = stats.totalDef - stats.baseDef;
            const text = 
                `【 プレイヤー詳細 】\n\n` +
                `攻撃力: ${stats.totalAtk} (素${stats.baseAtk} + 装${equipAtk})\n` +
                `防御力: ${stats.totalDef} (素${stats.baseDef} + 装${equipDef})\n`;

            self.statusText.setText(text);
        }
        self.totalAtk = stats.totalAtk;
        self.totalDef = stats.totalDef;
        self.maxMp = stats.maxMp;
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

    this.socket.on('identifySuccess', (data) => {
        const item = data.item;
        
        // ログ表示など
        console.log('鑑定成功！', item);
        
        // 鑑定UIが開いていればリストを再描画（済マークをつけるため）
        if (this.isAppraiserOpen) {
            updateAppraiserList(this);
        }
        
        // 派手な演出を入れるならここ
        // 例: this.sound.play('success_se');
        alert(`鑑定結果: [${item.rank}] が出ました！`);
    });
    
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

    createWarehouseUI(this);
    this.mystorage = []; 

    // サーバーからの更新通知を受け取る
    this.socket.on('updateStorage', (storageData) => {
        this.mystorage = storageData;
    
        // もし倉庫画面を開いていたら、リストを再描画する
        if (this.isWarehouseOpen) {
            this.refreshWarehouseList(); 
        }
    });
}

function update() {
    // 既存のチェックに追加： isTyping が true なら動かない
    if (this.isMerchantOpen) console.log('ショップを開いています');
    if (this.isCraftingOpen) console.log('鍛冶屋を開いています');
    if (this.isAppraiserOpen) console.log('鑑定士を開いています');
    if (this.isWarehouseOpen) console.log('倉庫を開いています');
    if (!this.player) console.log('プレイヤーが存在しません');
    if (!mapReady) console.log('マップの読み込みが完了していません');
    if (this.isTyping) console.log('チャット画面を開いています');
    if (!this.player || !mapReady || this.isTyping || this.isMerchantOpen || this.isCraftingOpen || this.isAppraiserOpen || this.isWarehouseOpen) return;

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
    if (this.keys.attack.isDown && !this.isTyping ) {
        const slotItem = this.myInventory[this.selectedSlot];
        let weapon = { damage: 0, range: 30, radius: 40, cooldown: 500, color: 0xffffff }; // 素手
        let weapon_damage = 0;
        if (slotItem && slotItem.stats && slotItem.stats.atk ) weapon_damage = slotItem.stats.atk;
        if (slotItem && ITEMS[slotItem.id] && ITEMS[slotItem.id].type === 'weapon') {
            weapon = ITEMS[slotItem.id];
        }
        if(Date.now() - this.lastAttackTime < weapon.cooldown) return;
        this.lastAttackTime = Date.now();

        if (weapon.weapontype === 'direct'){
            // 1. 斬撃エフェクトを出す
            showSlashEffect(this, this.player, angle, weapon);

            // 2. 近くの敵を探す
            this.enemies.getChildren().forEach((enemy) => {
                // A. 距離のチェック (80px以内まで届くように延長)
                const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            
                if (distance < weapon.radius) {
                
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
                        this.socket.emit('attackEnemy', { enemyId: enemy.id, damage: weapon_damage });
                    
                        // ダメージ演出
                        enemy.setTint(0xff0000);
                        this.time.delayedCall(200, () => {
                            enemy.clearTint();
                        });
                    }
                }
            });
            this.npcGroup.getChildren().forEach((enemy) => {
                const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            
                if (distance < weapon.radius) {
                
                    const angleToEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                    const angleDiff = Phaser.Math.Angle.Wrap(angle - angleToEnemy);
                    if (Math.abs(angleDiff) < weapon.range * Math.PI / 180) {
                        // ヒット確定！
                        if (enemy.getData('type') === 'merchant' && !this.isMerchantOpen) {
                            this.openMerchantUI();
                        }else if (enemy.getData('type') === 'blacksmith' && !this.isCraftingOpen) {
                            this.isCraftingOpen = true;
                            this.craftContainer.setVisible(true);
                        }else if (enemy.getData('type') === 'identify' && !this.isAppraiserOpen) {
                            this.isAppraiserOpen = true;
                            this.appraiserContainer.setVisible(true);
                            this.appraiserList.setVisible(true);
                            updateAppraiserList(this);
                        }else if (enemy.getData('type') === 'warehouse' && !this.isWarehouseOpen) {
                            this.openWarehouseUI();
                        }
                    }
                }
            });
        } else if(weapon.weapontype === 'indirect'){
            const damage = Math.floor(((this.totalAtk + weapon_damage) / 4) + (this.maxMp /2));
            const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
            this.socket.emit('shootFireball', {angle: angle, speed: weapon.speed, damage: damage, mp: weapon.mana, time: weapon.time});
        }
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
    otherPlayer.playerId = playerInfo.playerId;
    otherPlayer.username = playerInfo.username || 'Unknown Player';
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
    bg.on('pointerover', (pointer) => {
        // 第2, 第3引数にブラウザ上の生座標を渡す
        const item = scene.myInventory[index];
        showTooltip(item, pointer.event.clientX, pointer.event.clientY);
    });

    bg.on('pointermove', (pointer) => {
        // 動いている最中も追従させる
        updateTooltipPosition(pointer.event.clientX, pointer.event.clientY);
    });

    bg.on('pointerout', () => {
        // 隠す
        const tooltip = document.getElementById('game-tooltip');
        if (tooltip) tooltip.style.display = 'none';
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
    if (scene.isMerchantOpen && scene.isSellingMode) {
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

function createMerchantUI(scene) {
    scene.isMerchantOpen = false;
    scene.isSellingMode = false;

    // --- 1. 設定値（レイアウト調整用） ---
    const UI_X = 200;
    const UI_Y = 100;
    const UI_W = 300;
    const UI_H = 400;
    
    // リストが表示されるエリアの定義（コンテナ内の相対位置ではなく、画面上の絶対位置計算用）
    const LIST_X = UI_X;      // コンテナ左上と同じX
    const LIST_Y = UI_Y + 90; // タイトルの下あたり
    const LIST_W = UI_W;
    const LIST_H = 240;       // 売却ボタンの上のスペースまで

    // --- 2. 全体を入れる大枠のコンテナ ---
    // 内部座標を扱いやすくするため (0,0) ではなく UI_X, UI_Y を基準にします
    scene.merchantContainer = scene.add.container(UI_X, UI_Y).setScrollFactor(0).setDepth(200);
    scene.merchantContainer.setVisible(false);

    // --- 3. 「通常時（購入モード）」のコンテナ ---
    scene.merchantNormalElements = scene.add.container(0, 0);
    scene.merchantContainer.add(scene.merchantNormalElements);

    // 背景
    // 基準点が(UI_X, UI_Y)になったので、相対座標は (UI_W/2, UI_H/2) が中心
    const bg = scene.add.rectangle(UI_W/2, UI_H/2, UI_W, UI_H, 0x000000, 0.9);
    bg.setStrokeStyle(4, 0x00ff00);
    bg.setInteractive(); // クリック透過防止
    scene.merchantNormalElements.add(bg);

    // タイトルなど
    const title = scene.add.text(UI_W/2, 30, '=== 武器商人 ===', { fontSize: '20px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    const listTitle = scene.add.text(UI_W/2, 70, '【商品一覧】', { fill: '#00ff00', fontSize: '16px' }).setOrigin(0.5);
    const closeHint = scene.add.text(UI_W/2, UI_H - 20, '(Bキーで閉じる)', { fontSize: '12px', fill: '#aaa' }).setOrigin(0.5);
    
    scene.merchantNormalElements.add([title, listTitle, closeHint]);


    // --- 4. スクロール用商品リストコンテナ ---
    // merchantNormalElements の中に入れます
    // 座標は親コンテナ(UI_X, UI_Y)からの相対位置
    const listContainer = scene.add.container(0, 90); 
    scene.merchantNormalElements.add(listContainer);

    let currentY = 0;
    const itemHeight = 45;
    
    // 仮の商品データ
    const shopItems = ['potion', 'wood', 'sword', 'leather_helm', 'chain_mail', 'power_ring', 'wooden_axe', 'slime_gel']; 
    
    shopItems.forEach((id) => {
        const item = ITEMS[id]; 
        if (!item) return;

        // ボタン作成 (相対座標: 幅の中心, currentY)
        const btn = scene.add.rectangle(UI_W/2, currentY + itemHeight/2, 240, 35, 0x333333).setInteractive({ useHandCursor: true });
        
        const text = scene.add.text(UI_W/2, currentY + itemHeight/2, `${item.name} (${item.price}G)`, { fontSize: '14px', fill: '#ffffff' }).setOrigin(0.5);
        
        // 購入イベント
        btn.on('pointerdown', () => {
            // クリック時のフィードバック
            scene.tweens.add({ targets: btn, scaleX: 0.95, scaleY: 0.95, duration: 50, yoyo: true });
            scene.socket.emit('buyItem', id);
        });

        // ホバー
        btn.on('pointerover', () => btn.setFillStyle(0x555555));
        btn.on('pointerout', () => btn.setFillStyle(0x333333));

        listContainer.add([btn, text]);
        currentY += itemHeight;
    });

    listContainer.contentHeight = currentY;


    // --- 5. マスク設定 ---
    const shape = scene.make.graphics();
    shape.fillStyle(0xffffff);
    // マスクは画面絶対座標 (LIST_X, LIST_Y)
    shape.fillRect(LIST_X, LIST_Y, LIST_W, LIST_H);
    shape.setScrollFactor(0); 
    const mask = shape.createGeometryMask();
    listContainer.setMask(mask);


    // --- 6. 売却モード切替ボタン ---
    // これは merchantContainer 直下（merchantNormalElementsの外）に置く
    const sellBtnY = UI_H - 60;
    const sellBtn = scene.add.rectangle(UI_W/2, sellBtnY, 200, 40, 0xaa0000).setInteractive({ useHandCursor: true });
    const sellText = scene.add.text(UI_W/2, sellBtnY, '売却モード: OFF', { fontSize: '16px', fill: '#fff' }).setOrigin(0.5);

    sellBtn.on('pointerdown', () => {
        scene.isSellingMode = !scene.isSellingMode;

        if (scene.isSellingMode) {
            // ON: 購入画面（リスト含む）を隠す
            sellBtn.setFillStyle(0xff0000, 1);
            sellText.setText('売却モード: ON (所持品を選択)');
            scene.merchantNormalElements.setVisible(false);
        } else {
            // OFF: 購入画面を表示
            sellBtn.setFillStyle(0xaa0000, 1);
            sellText.setText('売却モード: OFF');
            scene.merchantNormalElements.setVisible(true);
        }
    });

    scene.merchantContainer.add([sellBtn, sellText]);


    // --- 7. スクロール制御 ---
    const onScroll = (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
        // 1. まずイベントが発火しているか？
        console.log("ホイール動いた！"); 

        // 2. フラグはOKか？
        if (!scene.isMerchantOpen) {
            console.log("Openフラグが false です");
            return;
        }
        // UIが開いていない、または「売却モード中」ならスクロールしない
        if (!scene.isMerchantOpen) return;
        if (scene.isSellingMode) return; // ★重要: 売却中はリストが見えないので無視
    
        // 3. マウス位置判定はOKか？
        if (pointer.x >= LIST_X && pointer.x <= LIST_X + LIST_W &&
            pointer.y >= LIST_Y && pointer.y <= LIST_Y + LIST_H) {
            
            console.log("範囲内です。スクロールさせます");
            
            const contentH = listContainer.contentHeight;
            if (contentH <= LIST_H) return;

            listContainer.y -= deltaY * 0.5;
            
            // 範囲制限 (listContainerの初期Yは 90)
            const initialY = 90;
            const minY = initialY - (contentH - LIST_H + 10);
            const maxY = initialY;
            
            listContainer.y = Phaser.Math.Clamp(listContainer.y, minY, maxY);
        } else {
            console.log("範囲外判定されています", pointer.x, pointer.y);
        }
    };

    // --- 8. 開閉管理ヘルパー ---
    scene.closeMerchantUI = () => {
        scene.merchantContainer.setVisible(false);
        scene.isMerchantOpen = false;
        scene.isSellingMode = false; // モードリセット
        
        // リセット処理
        sellBtn.setFillStyle(0xaa0000, 1);
        sellText.setText('売却モード: OFF');
        scene.merchantNormalElements.setVisible(true);

        scene.input.off('wheel', onScroll);
    };

    scene.openMerchantUI = () => {
        scene.merchantContainer.setVisible(true);
        scene.isMerchantOpen = true;
        scene.isSellingMode = false;
        
        // リスト位置リセット
        listContainer.y = 90;

        // イベント再登録
        scene.input.off('wheel', onScroll);
        scene.input.on('wheel', onScroll);
    };
}

function createCraftingUI(scene) {
    scene.isCraftingOpen = false;

    // --- 1. 設定値 ---
    const UI_X = 200; // 画面上のX座標
    const UI_Y = 50;  // 画面上のY座標
    const UI_W = 400;
    const UI_H = 500;
    const HEADER_H = 90; // タイトル＋「作成リスト」の文字の高さ
    const FOOTER_H = 30; // 下部の余白

    // リストの表示エリア（窓）の定義
    const LIST_X = UI_X;
    const LIST_Y = UI_Y + HEADER_H;
    const LIST_W = UI_W;
    const LIST_H = UI_H - HEADER_H - FOOTER_H;

    // --- 2. 全体の親コンテナ ---
    // 座標計算を簡単にするため、親コンテナは(0,0)に置き、内部で絶対座標配置します
    scene.craftContainer = scene.add.container(0, 0).setScrollFactor(0).setDepth(200);
    scene.craftContainer.setVisible(false);

    // 背景
    const bg = scene.add.rectangle(UI_X + UI_W / 2, UI_Y + UI_H / 2, UI_W, UI_H, 0x000000, 0.9).setScrollFactor(0);
    bg.setStrokeStyle(4, 0xff4400); // 鍛冶屋らしい赤枠
    bg.setInteractive(); // 裏クリック防止
    scene.craftContainer.add(bg);

    // タイトル
    const title = scene.add.text(UI_X + UI_W / 2, UI_Y + 30, '=== 鍛冶職人 ===', { fontSize: '24px', fill: '#ff4400', fontStyle: 'bold' }).setOrigin(0.5);
    scene.craftContainer.add(title);

    const subTitle = scene.add.text(UI_X + UI_W / 2, UI_Y + 70, '【作成リスト】', { fill: '#ffaa00', fontSize: '16px' }).setOrigin(0.5);
    scene.craftContainer.add(subTitle);

    // 閉じるボタン（テキストではなくボタン化して親切に）
    const closeBtn = scene.add.text(UI_X + UI_W / 2, UI_Y + UI_H - 20, '閉じる (B)', { fontSize: '14px', fill: '#aaa' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
    
    // 閉じる処理の登録（後で定義するcleanupを呼ぶ）
    closeBtn.on('pointerdown', () => {
        closeCrafting();
    });
    scene.craftContainer.add(closeBtn);


    // --- 3. リスト用コンテナ（スクロールする部分） ---
    // 初期位置はリスト表示エリアの左上
    const listContainer = scene.add.container(LIST_X, LIST_Y);
    scene.craftContainer.add(listContainer);


    // --- 4. レシピの生成ループ ---
    let currentY = 10; // リストコンテナ内でのY座標
    const itemHeight = 70; // 1つの項目の高さ（少し広めに）

    // RECIPESはグローバル定義されている前提
    if (typeof RECIPES !== 'undefined') {
        RECIPES.forEach((recipe, index) => {
            const resultItem = ITEMS[recipe.id];
            if (!resultItem) return;

            // X座標はコンテナの幅の中心（相対座標）
            const itemX = UI_W / 2;

            // 素材テキストの生成
            let reqText = '';
            if (recipe.materials) {
                for (const [matId, count] of Object.entries(recipe.materials)) {
                    const matName = ITEMS[matId] ? ITEMS[matId].name : matId;
                    reqText += `${matName}x${count}  `;
                }
            }

            // ボタン背景
            const btn = scene.add.rectangle(itemX, currentY + itemHeight / 2, 350, 60, 0x442200)
                .setInteractive({ useHandCursor: true });
            btn.setStrokeStyle(1, 0x884400);

            // テキスト情報
            const nameText = scene.add.text(itemX, currentY + 15, `作る: ${resultItem.name}`, { fontSize: '18px', fill: '#ffdd00', fontStyle: 'bold' }).setOrigin(0.5);
            const infoText = scene.add.text(itemX, currentY + 45, `必要: ${reqText}\n費用: ${recipe.cost}G`, { fontSize: '12px', fill: '#cccccc', align: 'center' }).setOrigin(0.5);

            // 作成イベント
            btn.on('pointerdown', () => {
                // アニメーション的なフィードバック
                scene.tweens.add({
                    targets: btn,
                    scaleX: 0.95, scaleY: 0.95,
                    duration: 50,
                    yoyo: true
                });
                console.log(`${resultItem.name} の作成リクエスト`);
                scene.socket.emit('craftItem', index);
            });

            // ホバー効果
            btn.on('pointerover', () => btn.setFillStyle(0x663300));
            btn.on('pointerout', () => btn.setFillStyle(0x442200));

            // コンテナに追加
            listContainer.add([btn, nameText, infoText]);

            currentY += itemHeight + 5; // 間隔を空ける
        });
    }

    // コンテンツ全体の高さを保存
    listContainer.contentHeight = currentY;


    // --- 5. マスク（切り抜き）設定 ---
    const shape = scene.make.graphics();
    shape.fillStyle(0xffffff);
    // マスク範囲は画面絶対座標で指定
    shape.fillRect(LIST_X, LIST_Y, LIST_W, LIST_H);
    shape.setScrollFactor(0); // ★重要：これを忘れるとプレイヤー移動時にマスクがズレます
    const mask = shape.createGeometryMask();
    listContainer.setMask(mask);


    // --- 6. スクロール機能の実装 ---
    const onScroll = (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
        // UIが開いていない、またはマウスが範囲外なら無視
        if (!scene.isCraftingOpen) return;
        
        if (pointer.x >= UI_X && pointer.x <= UI_X + UI_W &&
            pointer.y >= UI_Y && pointer.y <= UI_Y + UI_H) {
            
            const contentH = listContainer.contentHeight;
            // 内容が枠より少なければスクロール不要
            if (contentH <= LIST_H) return;

            // スクロール速度
            listContainer.y -= deltaY * 0.5;

            // 範囲制限
            // 上限: 初期位置 (LIST_Y)
            // 下限: コンテンツ長さ分だけ上にズレた位置
            const minY = LIST_Y - (contentH - LIST_H + 20);
            const maxY = LIST_Y;

            listContainer.y = Phaser.Math.Clamp(listContainer.y, minY, maxY);
        }
    };

    // イベント登録
    scene.input.on('wheel', onScroll);


    // --- 7. 閉じる・クリーンアップ処理 ---
    const closeCrafting = () => {
        scene.craftContainer.setVisible(false);
        scene.isCraftingOpen = false;
        
        // ★重要: これをしないと裏でイベントが動き続けます
        scene.input.off('wheel', onScroll); 
    };

    // シーンのプロパティとして関数を保持しておくと、Bキーイベント等からも呼べます
    scene.closeCraftingUI = closeCrafting;
    
    // UIを開く時のヘルパー（イベント再登録のため）
    scene.openCraftingUI = () => {
        scene.craftContainer.setVisible(true);
        scene.isCraftingOpen = true;
        
        // スクロール位置リセット
        listContainer.y = LIST_Y;
        
        // イベントリスナーが重複しないよう一旦消して再登録
        scene.input.off('wheel', onScroll);
        scene.input.on('wheel', onScroll);
    };
}
function createEquipmentUI(scene) {
    // 1. 装備画面全体のコンテナ
    scene.equipContainer = scene.add.container(100, 200); // インベントリの左隣などを想定
    scene.equipContainer.setScrollFactor(0);
    scene.equipContainer.setDepth(100);
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
        slotBg.on('pointerover', (pointer) => {
            // 第2, 第3引数にブラウザ上の生座標を渡す
            const data = scene.equipSlots[slotName].itemData;
            showTooltip(data, pointer.event.clientX, pointer.event.clientY);
        });

        slotBg.on('pointermove', (pointer) => {
            // 動いている最中も追従させる
            updateTooltipPosition(pointer.event.clientX, pointer.event.clientY);
        });

        slotBg.on('pointerout', () => {
            // 隠す
            const tooltip = document.getElementById('game-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        });

        slotBg.on('pointerout', () => {
            scene.tooltip.setVisible(false);
        });
    }
}

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

function createMenuUI(scene) {
    scene.isMenuOpen = false;

    // --- 設定値 ---
    const MENU_X = 400;
    const MENU_Y = 300;
    const MENU_W = 300;
    const MENU_H = 400;
    
    // スクロールエリアの設定（タイトルや下の余白を除いた範囲）
    const SCROLL_X = MENU_X - MENU_W / 2; // 左端
    const SCROLL_Y = MENU_Y - 140;         // 上端（タイトルの下あたり）
    const SCROLL_W = MENU_W;
    const SCROLL_H = 280;                  // 表示する高さ

    // --- 1. メニュー全体の親コンテナ ---
    scene.menuContainer = scene.add.container(MENU_X, MENU_Y).setScrollFactor(0).setDepth(2000);
    scene.menuContainer.setVisible(false);

    // 背景
    const bg = scene.add.rectangle(0, 0, MENU_W, MENU_H, 0x000000, 0.9);
    bg.setStrokeStyle(4, 0xffffff);
    bg.setInteractive(); 
    scene.menuContainer.add(bg);

    // タイトル
    const title = scene.add.text(0, -170, 'MAIN MENU', { fontSize: '24px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    scene.menuContainer.add(title);


    // --- 2. メインメニュー（スクロール対応） ---
    scene.menuMain = scene.add.container(0, 0);
    scene.menuContainer.add(scene.menuMain);

    // ★リスト用コンテナを作成（親コンテナの中心(0,0)からの相対位置ではなく、マスクに合わせるため左上基準で配置）
    // 親が(400,300)なので、そこから少しずらして配置
    const listContainer = scene.add.container(0, -120); 
    scene.menuMain.add(listContainer);

    // ボタン生成ヘルパー（Y座標は自動計算するので引数から削除）
    const createMenuButton = (text, callback, parentContainer, yOffset) => {
        const btnBg = scene.add.rectangle(0, yOffset, 220, 45, 0x333333).setScrollFactor(0).setInteractive({ useHandCursor: true });
        const btnText = scene.add.text(0, yOffset, text, { fontSize: '18px', fill: '#fff' }).setScrollFactor(0).setOrigin(0.5);
        
        btnBg.on('pointerdown', callback);
        btnBg.on('pointerover', () => btnBg.setFillStyle(0x555555));
        btnBg.on('pointerout', () => btnBg.setFillStyle(0x333333));

        parentContainer.add([btnBg, btnText]);
    };

    // ★ボタンの定義データ（ここに追加していけば自動でスクロールします）
    const menuItems = [
        {
            text: 'アイテム譲渡',
            callback: () => {
                // UIを閉じてから処理
                closeMenu(); 
                openPlayerSelection(scene, 'アイテムを送る相手を選択', (targetId, targetName) => {
                    openTransferInventory(scene, targetId, targetName);
                });
            }
        },
        {
            text: '送金する',
            callback: () => {
                closeMenu();
                openPlayerSelection(scene, '誰に送金しますか？', (targetId, targetName) => {
                    // --- コールバック: プレイヤーが選ばれた後の処理 ---
            
                    // 金額入力ダイアログ (ブラウザ標準)
                    const input = prompt(`${targetName} さんにいくら送りますか？\n(所持金: ${scene.myPlayer.gold} G)`, "0");
            
                    if (input === null) return; // キャンセル

                    const amount = parseInt(input);
                    if (isNaN(amount) || amount <= 0) {
                        alert("金額が不正です。");
                        return;
                    }

                    if (amount > scene.myPlayer.gold) {
                        alert("所持金が足りません！");
                        return;
                    }

                    // サーバーへ送信
                    scene.socket.emit('transferGold', {
                        targetId: targetId,
                        amount: amount
                    });
                });
            }
        },
        {
            text: 'ステータス',
            callback: () => {
                scene.menuMain.setVisible(false);
                scene.menuStatus.setVisible(true);
                updateMenuStats(scene);
            }
        },
        {
            text: 'スタック脱出 (自殺)',
            callback: () => {
                scene.menuMain.setVisible(false);
                scene.menuSuicide.setVisible(true);
            }
        },
        // --- テスト用に項目を増やしてみる ---
        { text: 'スキル (未実装)', callback: () => console.log('Skill') },
        { text: 'クエスト (未実装)', callback: () => console.log('Quest') },
        { text: '設定 (未実装)', callback: () => console.log('Config') },
        { text: 'ログアウト (未実装)', callback: () => console.log('Logout') },
        
        {
            text: '閉じる',
            callback: () => {
                closeMenu();
            }
        }
    ];

    // ★ループでボタン配置
    let currentY = 0;
    const GAP = 55; // ボタンの間隔

    menuItems.forEach(item => {
        createMenuButton(item.text, item.callback, listContainer, currentY);
        currentY += GAP;
    });

    // コンテンツの高さを保存
    listContainer.contentHeight = currentY;

    // --- マスク（切り抜き）設定 ---
    const shape = scene.make.graphics();
    shape.fillStyle(0xffffff);
    // マスクの座標は「画面上の絶対位置」で指定
    shape.fillRect(SCROLL_X, SCROLL_Y, SCROLL_W, SCROLL_H);
    shape.setScrollFactor(0); // ★重要
    const mask = shape.createGeometryMask();
    listContainer.setMask(mask);

    // --- スクロールイベント ---
    scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
        // メニューが開いていて、メイン画面が表示されている時だけ
        if (!scene.isMenuOpen || !scene.menuMain.visible) return;

        // マウスがメニュー範囲内にあるか
        if (pointer.x >= SCROLL_X && pointer.x <= SCROLL_X + SCROLL_W &&
            pointer.y >= SCROLL_Y && pointer.y <= SCROLL_Y + SCROLL_H) {
            
            const contentH = listContainer.contentHeight;
            // コンテンツが枠より小さければスクロールしない
            if (contentH < SCROLL_H) return;

            listContainer.y -= deltaY * 0.5;

            // 範囲制限
            // 上限: 初期位置 (-120あたり)
            // 下限: コンテンツ分だけ上に上がった位置
            const initialY = -120;
            const minY = initialY - (contentH - SCROLL_H + 20); // 20は下部余白
            const maxY = initialY;
            
            listContainer.y = Phaser.Math.Clamp(listContainer.y, minY, maxY);
        }
    });

    // メニューを閉じる共通処理
    const closeMenu = () => {
        scene.menuContainer.setVisible(false);
        scene.isMenuOpen = false;
        // 次回開いたときのためにスクロール位置をリセットしたければここで
        listContainer.y = -120;
    };


    // --- 3. ステータス画面 ---
    // (ここはボタンが少ないのでスクロール無しで実装します)
    scene.menuStatus = scene.add.container(0, 0);
    scene.menuStatus.setVisible(false);
    scene.menuContainer.add(scene.menuStatus);

    scene.statusText = scene.add.text(0, -20, '', { 
        fontSize: '16px', fill: '#fff', align: 'left', lineSpacing: 10 
    }).setOrigin(0.5);
    scene.menuStatus.add(scene.statusText);

    // ステータス画面の「戻る」ボタン
    const btnBack = scene.add.rectangle(0, 150, 200, 40, 0x333333).setInteractive({ useHandCursor: true });
    const btnBackText = scene.add.text(0, 150, '戻る', { fontSize: '18px', fill: '#fff' }).setOrigin(0.5);
    btnBack.on('pointerdown', () => {
        scene.menuStatus.setVisible(false);
        scene.menuMain.setVisible(true);
    });
    scene.menuStatus.add([btnBack, btnBackText]);


    // --- 4. 自殺確認画面 ---
    scene.menuSuicide = scene.add.container(0, 0);
    scene.menuSuicide.setVisible(false);
    scene.menuContainer.add(scene.menuSuicide);

    const suicideWarnText = scene.add.text(0, -60, '【 警 告 】\n\n強制的に死亡して\nリスポーン地点に戻ります。\nよろしいですか？', { 
        fontSize: '18px', fill: '#ff0000', align: 'center', fontStyle: 'bold' 
    }).setOrigin(0.5);
    scene.menuSuicide.add(suicideWarnText);

    // はい
    const btnDieYes = scene.add.rectangle(0, 40, 200, 40, 0xaa0000).setInteractive({ useHandCursor: true });
    const txtDieYes = scene.add.text(0, 40, '実行する', { fontSize: '18px', fill: '#fff' }).setOrigin(0.5);
    btnDieYes.on('pointerdown', () => {
        scene.socket.emit('forceRespawn');
        closeMenu();
    });

    // いいえ
    const btnDieNo = scene.add.rectangle(0, 100, 200, 40, 0x333333).setInteractive({ useHandCursor: true });
    const txtDieNo = scene.add.text(0, 100, 'やめる', { fontSize: '18px', fill: '#fff' }).setOrigin(0.5);
    btnDieNo.on('pointerdown', () => {
        scene.menuSuicide.setVisible(false);
        scene.menuMain.setVisible(true);
    });

    scene.menuSuicide.add([btnDieYes, txtDieYes, btnDieNo, txtDieNo]);
}

function updateMenuStats(scene) {
    // プレイヤーデータの取得（IDや変数は環境に合わせて調整してください）
    // 例: this.socket.id で自分のプレイヤーを探す
    const myId = scene.socket.id;
    const player = scene.player; // ※createPlayerで自分もここに保存している想定

    if (!player) return;

    let baseAtk = player.baseAtk;
    let baseDef = player.baseDef;
    let maxHp = 100;
    let equipAtk = 0;
    let equipDef = 0;
    let equipHp = 0;

    // 装備スロットを全部チェック
    // accessory1~3 も含めるため、equipmentオブジェクト全体を回すのが楽です
    if (player.equipment) {
        Object.values(player.equipment).forEach(item => {
            if (item) {
                const itemData = ITEMS[item.id];
                if (itemData) {
                    equipAtk += item.stats.atk || 0;
                    equipDef += item.stats.def || 0;
                    // equipHp += itemData.hp || 0; // HP補正があれば
                }
            }
        });
    }

    const totalAtk = baseAtk + equipAtk;
    const totalDef = baseDef + equipDef;
    const totalHp = maxHp + equipHp;

    // --- 表示テキストの作成 ---
    if(!scene.statusText ) {
        const text = 
            `【 プレイヤー詳細 】\n\n` +
            `攻撃力: 10 (素10 + 装0)\n` +
            `防御力: 0 (素0 + 装0)\n`;

        scene.statusText.setText(text);
    }
}

function showTooltip(item, x, y) {
    // 1. ツールチップ要素の取得
    const tooltip = document.getElementById('game-tooltip');
    if (!tooltip) return;

    if (!item) {
        tooltip.style.display = 'none';
        return;
    }

    // 2. 基本データの取得
    const baseData = ITEMS[item.id];
    if (!baseData) return;

    // 3. ランク情報の取得
    const rankId = item.rank; 
    const rankData = (rankId && RANKS[rankId]) ? RANKS[rankId] : null;

    // --- HTMLの組み立て ---
    let html = '';

    // 4. タイトル表示
    let titleHtml = '';

    if (item.isUnidentified) {
        // --- 未鑑定表示 ---
        html += `<div class="tooltip-title" style="color:#aaa;">? 未鑑定の装備 ?</div>`;
        html += `<div style="color:#ffff00; margin-bottom:5px;">鑑定が必要です</div>`;
        
        // ベースの名前くらいは表示しても良いかも（例: 鉄の剣）
        // 完全に隠すなら "???" にする
        html += `<div>種別: ${baseData.name}</div>`;
        
        // 費用目安
        const cost = Math.floor((baseData.price || 100) * 0.5);
        html += `<div style="color:#aaa; font-size:12px; margin-top:5px;">鑑定費用: ${cost} G</div>`;

    } else {
        if (rankData) {
            // ランクあり（装備品など）
            let rankLabel = '';
            if (rankId === 's' || rankId === 'S') {
                rankLabel = `<span class="rainbow-text">[${rankData.name}]</span>`;
            } else {
                const color = rankData.color || '#ffffff';
                rankLabel = `<span style="color:${color}">[${rankData.name}]</span>`;
            }
            titleHtml = `${rankLabel} ${baseData.name}`;
        } else {
            // ランクなし（消耗品など）
            titleHtml = baseData.name;
        }

        html += `<div class="tooltip-title">${titleHtml}</div>`;

        // 5. ステータスの表示
        if (item.stats) {
            for (const [key, val] of Object.entries(item.stats)) {
                // 表示ラベルの変換
                let label = key.toUpperCase();
                if (key === 'atk') label = '攻撃力';
                if (key === 'def') label = '防御力';
                if (key === 'hp')  label = 'HP';
            
                let valHtml = `${val}`;
                let rangeHtml = ''; // 範囲表示用の変数

                // --- 最小値・最大値の計算と表示 ---
                // ランク情報があり、かつ「基本データの範囲(statsRange)」が定義されている場合のみ計算
                if (rankData && baseData.statsRange && baseData.statsRange[key]) {
                    const baseMin = baseData.statsRange[key].min;
                    const baseMax = baseData.statsRange[key].max;
                    const rankMult = rankData.mult || 1;

                    // 理論上の最小値・最大値を計算 (サーバー側の計算式と合わせる)
                    const theoreticalMin = Math.round(baseMin * rankMult);
                    const theoreticalMax = Math.round(baseMax * rankMult);

                    // ★追加: 範囲テキストを作成 (例: " (10~20)")
                    // グレーにして少し小さく表示すると見やすいです
                    rangeHtml = `<span style="font-size: 0.85em; color: #aaaaaa; margin-left: 4px;">(${theoreticalMin}～${theoreticalMax})</span>`;

                    // 最大値判定（虹色演出）
                    if (val >= theoreticalMax) {
                        valHtml = `<span class="rainbow-text">${val} (MAX)</span>`;
                    }
                }

                // HTMLに結合: "攻撃力: 15 (MAX) (12～15)" のような形になる
                html += `<div>${label}: ${valHtml}${rangeHtml}</div>`;
            }
        } else {
            // statsプロパティがない固定アイテムの場合の表示
            if (baseData.atk) html += `<div>攻撃力: ${baseData.atk}</div>`;
            if (baseData.def) html += `<div>防御力: ${baseData.def}</div>`;
            if (baseData.description) html += `<div style="font-size:12px; color:#ccc;">${baseData.description}</div>`;
        }

        // 6. 価格表示
        let price = baseData.price || 0;
        const sellPrice = Math.floor(price / 2);
    
        if (sellPrice > 0) {
            html += `<div style="margin-top:8px; font-size:12px; color:#aaa;">売却: ${sellPrice} G</div>`;
        }
    }

    // 7. 表示反映
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    updateTooltipPosition(x, y);
}

// （位置更新関数は前回のままでOKです）
function updateTooltipPosition(x, y) {
    const tooltip = document.getElementById('game-tooltip');
    if (tooltip && tooltip.style.display !== 'none') {
        tooltip.style.left = (x + 15) + 'px';
        tooltip.style.top = (y + 15) + 'px';
    }
}

function createAppraiserUI(scene) {
    scene.isAppraiserOpen = false;

    // --- 設定値 ---
    const UI_X = 200;
    const UI_Y = 100;
    const UI_W = 400;
    const UI_H = 500;
    const HEADER_H = 60; // タイトルや閉じるボタンのエリアの高さ
    
    // リストが表示されるエリアの高さ（全体 - ヘッダー分）
    const LIST_H = UI_H - HEADER_H - 40; 
    const LIST_START_Y = UI_Y + HEADER_H;

    // 1. 全体コンテナ（背景や枠などの動かないもの）
    scene.appraiserContainer = scene.add.container(0, 0).setScrollFactor(0).setDepth(200);
    scene.appraiserContainer.setVisible(false);

    // 背景
    const bg = scene.add.rectangle(UI_X + UI_W/2, UI_Y + UI_H/2, UI_W, UI_H, 0x000000, 0.95);
    bg.setStrokeStyle(4, 0x8800ff);
    bg.setInteractive(); // クリックが後ろに貫通しないように
    scene.appraiserContainer.add(bg);

    // タイトル
    const title = scene.add.text(UI_X + UI_W/2, UI_Y + 30, '=== 鑑定士 ===', { fontSize: '20px', fill: '#d4aaff' }).setOrigin(0.5);
    scene.appraiserContainer.add(title);
    
    // 閉じるボタン
    const closeBtn = scene.add.text(UI_X + UI_W/2, UI_Y + UI_H - 25, '(SPACEキーで閉じる)', { fontSize: '12px', fill: '#aaa' }).setOrigin(0.5);
    scene.appraiserContainer.add(closeBtn);


    // 2. スクロールするリスト用コンテナ
    // ここにアイテムのボタンなどを入れます
    scene.appraiserList = scene.add.container(UI_X, LIST_START_Y).setScrollFactor(0).setDepth(200);
    scene.appraiserList.setVisible(false); // 親が開くときにtrueにする

    // 3. マスク（切り抜き）の作成
    // Graphicsで作った四角形の範囲外にあるリストアイテムを非表示にします
    const shape = scene.make.graphics();
    shape.fillStyle(0xffffff);
    // リストが表示される範囲だけを白く塗る
    shape.fillRect(UI_X, LIST_START_Y, UI_W, LIST_H);
    
    const mask = shape.createGeometryMask();
    scene.appraiserList.setMask(mask); // コンテナにマスクを適用

    // --- 4. スクロール機能の実装 ---
    // マウスホイールイベントの登録
    scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
        if (!scene.isAppraiserOpen) return;

        // マウスがUIの範囲内にあるときだけスクロール
        if (pointer.x >= UI_X && pointer.x <= UI_X + UI_W &&
            pointer.y >= UI_Y && pointer.y <= UI_Y + UI_H) {
            
            const list = scene.appraiserList;
            const contentHeight = list.contentHeight || 0;
            
            // リストが枠より小さいならスクロール不要
            if (contentHeight <= LIST_H) return;

            // スクロール速度
            const scrollSpeed = 0.5;
            list.y -= deltaY * scrollSpeed;

            // --- 範囲制限（重要） ---
            // 上限: 初期位置 (LIST_START_Y)
            // 下限: コンテンツの長さ分だけ上にズレた位置
            const minY = LIST_START_Y - (contentHeight - LIST_H + 20); // 20は余白
            const maxY = LIST_START_Y;

            // Phaser.Math.Clamp で範囲内に収める
            list.y = Phaser.Math.Clamp(list.y, minY, maxY);
        }
    });
}

// 鑑定士UIの中身を更新する関数（開いた時や鑑定後に呼ぶ）
function updateAppraiserList(scene) {
    // リストの中身をクリア
    scene.appraiserList.removeAll(true);

    const inventory = scene.myInventory || []; 
    const itemHeight = 45; // 1行あたりの高さ
    let currentY = 20; // コンテナ内での開始Y座標（少し余白）

    inventory.forEach((item, index) => {
        if (!item) return;

        // --- コンテナ内部座標なので、Xは相対位置 ---
        // 親コンテナが(200, 100)にあるので、ここは幅の中心(200)を指定
        const localX = 200; 
        const baseData = ITEMS[item.id];
        const cost = Math.floor((baseData.price || 100) * 0.5);

        // ボタン背景
        const btn = scene.add.rectangle(localX, currentY, 350, 40, 0x222222).setInteractive({ useHandCursor: true });
        
        let displayText = '';
        let color = '#ffffff';

        if (item.isUnidentified) {
            displayText = `[未鑑定] ${baseData.name} (費用: ${cost}G)`;
            color = '#ffff00';
            btn.setStrokeStyle(1, 0xffff00);
            
            btn.on('pointerdown', () => {
                scene.socket.emit('identifyItem', index);
            });
        } else {
            displayText = `[鑑定済] ${baseData.name}`;
            color = '#555555';
            btn.setFillStyle(0x111111);
        }

        const text = scene.add.text(localX, currentY, displayText, { fontSize: '14px', fill: color }).setOrigin(0.5);
        
        // ツールチップ用エリア判定の修正（スクロール対応）
        // スクロールコンテナ内の要素はpointermoveイベントの座標計算が複雑になるため、
        // 簡易的にボタン自体のイベントを使います
        btn.on('pointerover', () => {
            // スクロール中の位置ズレを考慮してツールチップを出すのは難しいので、
            // 簡易版としてマウス座標に直接出すのが無難です
            const pointer = scene.input.activePointer;
            showTooltip(item, pointer.x, pointer.y);
        });
        btn.on('pointerout', () => {
             const tooltip = document.getElementById('game-tooltip');
             if(tooltip) tooltip.style.display = 'none';
        });

        // コンテナに追加
        scene.appraiserList.add([btn, text]);

        // 次の行へ
        currentY += itemHeight;
    });

    // ★重要: 全体の高さを保存しておく（スクロール計算用）
    scene.appraiserList.contentHeight = currentY;
    
    // リスト更新時は一番上に戻す
    const HEADER_H = 60;
    scene.appraiserList.y = 100 + HEADER_H;
}

function openPlayerSelection(scene, title, onSelectCallback) {
    if (scene.transferContainer) scene.transferContainer.destroy();

    const container = scene.add.container(400, 300).setScrollFactor(0).setDepth(300);
    scene.transferContainer = container;

    // 背景
    const bg = scene.add.rectangle(0, 0, 300, 400, 0x000000, 0.9).setStrokeStyle(2, 0xffffff);
    bg.setInteractive(); // 裏クリック防止
    container.add(bg);

    // タイトル (引数で変えられるように変更)
    const titleText = scene.add.text(0, -180, title, { fontSize: '20px' }).setOrigin(0.5);
    container.add(titleText);
    
    // 閉じるボタン
    const closeBtn = scene.add.text(0, 180, 'キャンセル', { fill: '#aaa' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => container.destroy());
    container.add(closeBtn);

    // プレイヤーリスト表示
    let y = -140;
    const others = scene.otherPlayers.getChildren();

    if (others.length === 0) {
        container.add(scene.add.text(0, 0, '近くに誰もいません', { color: '#888' }).setOrigin(0.5));
    }

    others.forEach((sprite) => {
        const name = sprite.username || '名無し'; 
        const id = sprite.playerId;

        const pBtn = scene.add.text(0, y, `👤 ${name}`, { fontSize: '18px', fill: '#ffff00' })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });

        pBtn.on('pointerdown', () => {
            // ★重要: ここで渡されたコールバック関数を実行する
            if (onSelectCallback) {
                onSelectCallback(id, name);
            }
            container.destroy(); // 選択したらこの画面は閉じる
        });

        container.add(pBtn);
        y += 40;
    });
}

function openTransferInventory(scene, targetId, targetName) {
    // 既存のコンテナがあれば削除（二重表示防止）
    if (scene.transferContainer) {
        scene.transferContainer.destroy();
    }
    
    // スクロールイベントが重複しないように、古いイベントリスナーを削除するフラグ管理
    // （簡易的に、閉じるボタンを押した時にイベントをオフにする実装にします）

    // --- 設定値 ---
    const UI_X = 200;
    const UI_Y = 100;
    const UI_W = 400;
    const UI_H = 500;
    const HEADER_H = 60; 
    
    // リストが表示されるエリアの定義
    const LIST_X = UI_X;
    const LIST_START_Y = UI_Y + HEADER_H;
    const LIST_H = UI_H - HEADER_H - 40; 

    // 1. 全体コンテナ（背景・枠・タイトル）
    const mainContainer = scene.add.container(0, 0).setScrollFactor(0).setDepth(300);
    scene.transferContainer = mainContainer; // シーンプロパティに保存

    // 背景
    const bg = scene.add.rectangle(UI_X + UI_W/2, UI_Y + UI_H/2, UI_W, UI_H, 0x000000, 0.95);
    bg.setStrokeStyle(2, 0x008800);
    bg.setInteractive(); // 下のレイヤーへのクリック防止
    mainContainer.add(bg);

    // タイトル
    const title = scene.add.text(UI_X + UI_W/2, UI_Y + 30, `${targetName} に送るアイテム`, { 
        fontSize: '20px', fill: '#88ff88', fontStyle: 'bold' 
    }).setScrollFactor(0).setOrigin(0.5);
    mainContainer.add(title);
    
    // 2. リスト用コンテナ（ここがスクロールする）
    const listContainer = scene.add.container(LIST_X, LIST_START_Y).setScrollFactor(0);
    mainContainer.add(listContainer);

    // 3. インベントリの中身を作成
    const inventory = scene.myInventory || [];
    let currentY = 10; // コンテナ内でのY座標
    const itemHeight = 45;

    inventory.forEach((item, index) => {
        if (!item) return; // 空きスロットはスキップ

        const baseData = ITEMS[item.id];
        
        // アイテムボタン背景（クリック領域）
        // 親コンテナ(LIST_X)からの相対位置なので、X中心は UI_W/2
        const btn = scene.add.rectangle(UI_W/2, currentY, 350, 40, 0x222222)
            .setInteractive({ useHandCursor: true }).setScrollFactor(0);

        // テキスト表示
        let txt = baseData.name;
        if (item.count) txt += ` x${item.count}`; // 素材なら個数
        
        // ランクによる色分け（あれば）
        let textColor = '#ffffff';
        if (item.rank && RANKS[item.rank]) {
            textColor = RANKS[item.rank].color || '#ffffff';
        }

        const text = scene.add.text(UI_W/2, currentY, txt, { 
            fontSize: '16px', fill: textColor 
        }).setScrollFactor(0).setOrigin(0.5);

        // --- イベント設定 ---

        // A. クリックで譲渡処理
        btn.on('pointerdown', () => {
            let amount = 1;

            // 素材なら個数指定
            if (baseData.type === 'material') {
                // 一旦ツールチップを消す
                const tooltip = document.getElementById('game-tooltip');
                if(tooltip) tooltip.style.display = 'none';

                const input = prompt(`「${baseData.name}」をいくつ送りますか？ (所持: ${item.count})`, "1");
                if (input === null) return; 
                amount = parseInt(input);
                
                if (isNaN(amount) || amount <= 0 || amount > item.count) {
                    alert("無効な数値です");
                    return;
                }
            } else {
                if (!confirm(`「${baseData.name}」を本当に送りますか？`)) return;
            }

            // 送信
            scene.socket.emit('transferItem', {
                targetId: targetId,
                itemIndex: index,
                amount: amount
            });

            // 送信したら閉じる
            cleanup();
        });

        // B. ホバーでツールチップ表示
        btn.on('pointerover', () => {
            const pointer = scene.input.activePointer;
            showTooltip(item, pointer.x, pointer.y);
            btn.setFillStyle(0x444444); // ハイライト
        });

        // C. ホバー解除で非表示
        btn.on('pointerout', () => {
            const tooltip = document.getElementById('game-tooltip');
            if (tooltip) tooltip.style.display = 'none';
            btn.setFillStyle(0x222222); // 元の色
        });
        
        // コンテナに追加
        listContainer.add([btn, text]);
        currentY += itemHeight;
    });

    // コンテンツの高さを保存
    listContainer.contentHeight = currentY;

    // 4. マスク（切り抜き）設定
    const shape = scene.make.graphics();
    shape.setScrollFactor(0);
    shape.fillStyle(0xffffff);
    shape.fillRect(LIST_X, LIST_START_Y, UI_W, LIST_H);
    const mask = shape.createGeometryMask();
    listContainer.setMask(mask);

    // 5. スクロール処理関数
    const onScroll = (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
        // マウスがUI内にあるか簡易チェック
        if (pointer.x >= UI_X && pointer.x <= UI_X + UI_W &&
            pointer.y >= UI_Y && pointer.y <= UI_Y + UI_H) {
            
            const contentH = listContainer.contentHeight || 0;
            if (contentH <= LIST_H) return; // スクロール不要なら何もしない

            listContainer.y -= deltaY * 0.5;

            // 範囲制限
            const minY = LIST_START_Y - (contentH - LIST_H + 20);
            const maxY = LIST_START_Y;
            listContainer.y = Phaser.Math.Clamp(listContainer.y, minY, maxY);
        }
    };

    // イベント登録
    scene.input.on('wheel', onScroll);

    // 6. 閉じるボタンとクリーンアップ関数
    const cleanup = () => {
        // コンテナ削除
        if (scene.transferContainer) {
            scene.transferContainer.destroy();
            scene.transferContainer = null;
        }
        // スクロールイベント削除（重要）
        scene.input.off('wheel', onScroll);
        
        // ツールチップも消す
        const tooltip = document.getElementById('game-tooltip');
        if (tooltip) tooltip.style.display = 'none';
    };

    const closeBtn = scene.add.text(UI_X + UI_W/2, UI_Y + UI_H - 25, 'キャンセル', { fill: '#aaa' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
        
    closeBtn.on('pointerdown', cleanup);
    mainContainer.add(closeBtn);
}

function createGoldTransferButton(scene) {
    // アイテム譲渡ボタンの下あたりに配置
    const btn = scene.add.text(700, 600, '💰 送金する', {
        fontSize: '18px',
        fill: '#ffffff',
        backgroundColor: '#D4AF37', // 金色っぽい背景
        padding: { x: 10, y: 5 }
    })
    .setScrollFactor(0)
    .setInteractive({ useHandCursor: true });

    btn.on('pointerdown', () => {
        // プレイヤー選択画面を開く
        openPlayerSelection(scene, '誰に送金しますか？', (targetId, targetName) => {
            // --- コールバック: プレイヤーが選ばれた後の処理 ---
            
            // 金額入力ダイアログ (ブラウザ標準)
            const input = prompt(`${targetName} さんにいくら送りますか？\n(所持金: ${scene.myPlayer.gold} G)`, "0");
            
            if (input === null) return; // キャンセル

            const amount = parseInt(input);
            if (isNaN(amount) || amount <= 0) {
                alert("金額が不正です。");
                return;
            }

            if (amount > scene.myPlayer.gold) {
                alert("所持金が足りません！");
                return;
            }

            // サーバーへ送信
            scene.socket.emit('transferGold', {
                targetId: targetId,
                amount: amount
            });
        });
    });
}

function createWarehouseUI(scene) {
    scene.isWarehouseOpen = false;
    scene.warehouseMode = 'deposit'; // 'deposit'(預ける) か 'withdraw'(引き出す)

    // --- 1. 設定値 ---
    const UI_X = 100;
    const UI_Y = 50;
    const UI_W = 600;
    const UI_H = 500;
    const LIST_Y_OFFSET = 120; // タブの下
    const LIST_H = 340;        // リストの表示高さ

    // --- 2. 親コンテナ ---
    scene.warehouseContainer = scene.add.container(UI_X, UI_Y).setScrollFactor(0).setDepth(200);
    scene.warehouseContainer.setVisible(false);

    // 背景
    const bg = scene.add.rectangle(UI_W/2, UI_H/2, UI_W, UI_H, 0x000000, 0.9)
        .setStrokeStyle(4, 0x4444ff) // 青っぽい枠（倉庫感）
        .setInteractive()
        .setScrollFactor(0);
    scene.warehouseContainer.add(bg);

    // タイトル
    const title = scene.add.text(UI_W/2, 30, '=== 巨大倉庫 ===', { fontSize: '24px', fill: '#aaaaff', fontStyle: 'bold' }).setOrigin(0.5);
    scene.warehouseContainer.add(title);

    // 閉じるボタン
    const closeBtn = scene.add.text(UI_W/2, UI_H - 20, '閉じる (B)', { fontSize: '14px', fill: '#aaa' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => scene.closeWarehouseUI());
    scene.warehouseContainer.add(closeBtn);


    // --- 3. タブ切り替えボタン ---
    const tabContainer = scene.add.container(0, 0);
    scene.warehouseContainer.add(tabContainer);

    // [預ける] タブ
    const tabDeposit = scene.add.rectangle(UI_W/4, 80, 280, 40, 0x333333).setInteractive({ useHandCursor: true }).setScrollFactor(0);
    const txtDeposit = scene.add.text(UI_W/4, 80, '預ける (所持品)', { fontSize: '18px', fill: '#fff' }).setOrigin(0.5);
    
    // [引き出す] タブ
    const tabWithdraw = scene.add.rectangle(UI_W*3/4, 80, 280, 40, 0x111111).setInteractive({ useHandCursor: true }).setScrollFactor(0);
    const txtWithdraw = scene.add.text(UI_W*3/4, 80, '引き出す (倉庫)', { fontSize: '18px', fill: '#888' }).setOrigin(0.5);

    tabContainer.add([tabDeposit, txtDeposit, tabWithdraw, txtWithdraw]);

    // タブクリックイベント
    tabDeposit.on('pointerdown', () => {
        scene.warehouseMode = 'deposit';
        updateTabs();
        scene.refreshWarehouseList(); // リスト更新
    });

    tabWithdraw.on('pointerdown', () => {
        scene.warehouseMode = 'withdraw';
        updateTabs();
        scene.refreshWarehouseList(); // リスト更新
    });

    // タブの色を更新する関数
    const updateTabs = () => {
        if (scene.warehouseMode === 'deposit') {
            tabDeposit.setFillStyle(0x4444ff); // 青（アクティブ）
            txtDeposit.setFill('#ffffff');
            tabWithdraw.setFillStyle(0x111111); // 暗い（非アクティブ）
            txtWithdraw.setFill('#888888');
        } else {
            tabDeposit.setFillStyle(0x111111);
            txtDeposit.setFill('#888888');
            tabWithdraw.setFillStyle(0xff4444); // 赤（アクティブ）
            txtWithdraw.setFill('#ffffff');
        }
    };


    // --- 4. リスト表示エリア（スクロール対応） ---
    const listContainer = scene.add.container(0, LIST_Y_OFFSET);
    scene.warehouseContainer.add(listContainer);

    // リスト描画関数（重要：モードによって中身を変える）
    scene.refreshWarehouseList = () => {
        listContainer.removeAll(true); // 前の中身を消す
        listContainer.y = LIST_Y_OFFSET; // スクロール位置リセット

        let items = [];
        let emptyMessage = "";

        if (scene.warehouseMode === 'deposit') {
            // インベントリを表示
            items = scene.myInventory || [];
            emptyMessage = "預けるものがありません";
        } else {
            // 倉庫を表示
            items = scene.mystorage || [];
            emptyMessage = "倉庫は空っぽです";
        }

        if (items.length === 0) {
            listContainer.add(scene.add.text(UI_W/2, 50, emptyMessage, { color: '#888' }).setOrigin(0.5));
            listContainer.contentHeight = 0;
            return;
        }

        let currentY = 0;
        const itemHeight = 50;

        items.forEach((itemData, index) => {
            // アイテムデータ取得（IDしか入っていない場合を考慮してITEMS辞書から引く）
            const info = ITEMS[itemData.id];
            if (!info) return;

            // ボタン作成
            const btnColor = (scene.warehouseMode === 'deposit') ? 0x222244 : 0x442222;
            const btn = scene.add.rectangle(UI_W/2, currentY + itemHeight/2, 500, 40, btnColor)
                .setScrollFactor(0) // ★忘れずに！
                .setInteractive({ useHandCursor: true });

            const textStr = (scene.warehouseMode === 'deposit') 
                ? `預ける: ${info.name}` 
                : `引き出す: ${info.name}`;
            
            const text = scene.add.text(UI_W/2, currentY + itemHeight/2, textStr, { fontSize: '16px', fill: '#fff' }).setOrigin(0.5);

            // クリックイベント
            btn.on('pointerdown', () => {
                let amount = 1;

                // 素材なら個数指定
                if (baseData.type === 'material') {
                    const input = prompt(`「${info.name}」をいくつ送りますか？ (所持: ${itemData.count})`, "1");
                    if (input === null) return; 
                    amount = parseInt(input);
                
                    if (isNaN(amount) || amount <= 0 || amount > itemData.count) {
                        alert("無効な数値です");
                        return;
                    }
                } else {
                    if (!confirm(`「${info.name}」を本当に送りますか？`)) return;
                }
                if (scene.warehouseMode === 'deposit') {
                    scene.socket.emit('depositItem', {index: index, amount: amount});
                } else {
                    scene.socket.emit('withdrawItem', {index: index, amount: amount});
                }
                // ※クリック後のリスト更新はサーバーからの socket.on('updateStorage/Inventory') で行われます
            });

            // ホバー
            btn.on('pointerover', () => btn.setFillStyle(0x666666));
            btn.on('pointerout', () => btn.setFillStyle(btnColor));

            listContainer.add([btn, text]);
            currentY += itemHeight + 5;
        });

        listContainer.contentHeight = currentY;
    };


    // --- 5. マスク設定 ---
    const shape = scene.make.graphics();
    shape.fillStyle(0xffffff);
    // 画面絶対座標
    shape.fillRect(UI_X, UI_Y + LIST_Y_OFFSET, UI_W, LIST_H);
    shape.setScrollFactor(0);
    const mask = shape.createGeometryMask();
    listContainer.setMask(mask);


    // --- 6. スクロール制御 ---
    const onScroll = (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
        if (!scene.isWarehouseOpen) return;

        // マウス位置判定
        if (pointer.x >= UI_X && pointer.x <= UI_X + UI_W &&
            pointer.y >= UI_Y + LIST_Y_OFFSET && pointer.y <= UI_Y + LIST_H + LIST_Y_OFFSET) {
            
            const contentH = listContainer.contentHeight;
            if (contentH <= LIST_H) return;

            listContainer.y -= deltaY * 0.5;

            const minY = LIST_Y_OFFSET - (contentH - LIST_H + 20);
            const maxY = LIST_Y_OFFSET;
            
            listContainer.y = Phaser.Math.Clamp(listContainer.y, minY, maxY);
        }
    };


    // --- 7. 開閉ヘルパー ---
    scene.closeWarehouseUI = () => {
        scene.warehouseContainer.setVisible(false);
        scene.isWarehouseOpen = false;
        scene.input.off('wheel', onScroll);
    };

    scene.openWarehouseUI = () => {
        scene.warehouseContainer.setVisible(true);
        scene.isWarehouseOpen = true;
        scene.warehouseMode = 'deposit'; // 最初は「預ける」モード
        updateTabs();
        scene.refreshWarehouseList();
        
        scene.input.off('wheel', onScroll);
        scene.input.on('wheel', onScroll);
    };
}
