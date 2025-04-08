<template>
  <div class="coin-container">
    <button @click="DropCoins" class="drop-button">掉落金币</button>
    <div class="game-area">
      <div ref="coinBox" class="coin-box">
      </div>
      <div class="total-value">当前总额: {{ totalValue }}元</div>
    </div>
  </div>
</template>

<script>
// 引入所有需要的 Matter.js 模块
import * as Matter from 'matter-js'

export default {
  name: 'CoinDropper',
  data() {
    return {
      // Matter.js 模块
      Engine: Matter.Engine,
      Render: Matter.Render,
      Runner: Matter.Runner,
      Bodies: Matter.Bodies,
      Body: Matter.Body,
      Composite: Matter.Composite,
      World: Matter.World,
      Events: Matter.Events,
      Bounds: Matter.Bounds,
      // 实例
      engine: null,
      render: null,
      runner: null,
      coins: [],
      totalValue: 0,
      // 金币对象池
      coinPool: {
        active: true,       // 是否启用对象池
        maxSize: 50,        // 对象池最大大小
        objects: [],        // 存储可重用的金币对象
        textures: {}        // 缓存的金币纹理
      },
      // 区域定义 - 向上移动300像素
      collectionArea: {
        x: 200,  // 中心x坐标
        y: 80,  // 中心y坐标 (从400减为100)
        width: 400, // 宽度
        height: 100 // 高度
      },
      // 掉落区域定义
      dropArea: {
        minX: 60,  // 左边界
        maxX: 340, // 右边界
        y: 30     // 掉落高度
      },
      // 底板移动参数
      platformMotion: {
        platform: null,   // 底板对象引用
        baseY: 0,         // 基准Y位置
        amplitude: 30,    // 上下移动幅度，减小为固定值
        frequency: 0.015,  // 移动频率，设置为固定值
        time: 0           // 计时器
      },
      // 压力感应系统
      pressureSystem: {
        threshold: 30,     // 触发穿透的金币数量阈值
        maxCoinsToRelease: 5, // 一次最多释放几个金币
        cooldown: 1000,   // 冷却时间(毫秒)
        lastReleaseTime: 0    // 上次释放时间
      },
      // 底部高摩擦力条
      movableObstacle: {
        body: null,       // 障碍物物体引用
        width: 400,       // 宽度
        height: 20,       // 增加高度使其更明显
        offsetY: 0       // 不再使用此偏移量，因为位置是固定的
      },
      // 缓存纹理
      _coinTextureCache: null
    }
  },
  mounted() {
    // 初始化物理引擎
    this.InitPhysics()
  },
  methods: {
    InitPhysics() {
      console.log('初始化物理引擎')
      // 创建引擎
      this.engine = this.Engine.create({
        positionIterations: 4, // 进一步降低位置迭代次数，从6减为4
        velocityIterations: 3,  // 进一步降低速度迭代次数，从4减为3
        enableSleeping: true // 启用休眠功能，静止的物体将不参与计算
      })
      
      // 设置引擎重力为0，使金币没有重力属性
      this.engine.gravity.y = 0
      this.engine.gravity.scale = 0
      
      // 创建渲染器
      this.render = this.Render.create({
        element: this.$refs.coinBox,
        engine: this.engine,
        options: {
          width: 400,
          height: 600,
          wireframes: false,
          background: '#f8f9fa',
          showAngleIndicator: false
        }
      })

      // 创建边界 - 使用渐变色边界
      const walls = [
        // 底部边界 - 可见
        this.Bodies.rectangle(200, 600, 390, 20, { 
          isStatic: true, 
          render: { 
            fillStyle: '#9c27b0',
            visible: false
          } 
        }),
        // 顶部边界 - 不可见
        this.Bodies.rectangle(200, -10, 400, 20, { 
          isStatic: true, 
          render: { 
            visible: false 
          } 
        }),
        // 左侧边界
        this.Bodies.rectangle(-10, 300, 20, 600, { 
          isStatic: true, 
          render: { 
            visible: false 
          } 
        }),
        // 右侧边界
        this.Bodies.rectangle(410, 300, 20, 600, { 
          isStatic: true, 
          render: { 
            fillStyle: '#999',
            visible: true 
          } 
        }),
        // 收集区域平台 - 左挡板
        // this.Bodies.rectangle(this.collectionArea.x - this.collectionArea.width/2, 
        //                      this.collectionArea.y + this.collectionArea.height/2, 
        //                      20, this.collectionArea.height, { 
        //   isStatic: true, 
        //   render: { 
        //     fillStyle: '#999',
        //     visible: true
        //   },
        //   friction: 0.1, // 降低摩擦力
        //   restitution: 0.9 // 增加弹性
        // }),
        // 收集区域平台 - 右挡板
        // this.Bodies.rectangle(this.collectionArea.x + this.collectionArea.width/2, 
        //                      this.collectionArea.y + this.collectionArea.height/2, 
        //                      20, this.collectionArea.height, { 
        //   isStatic: true, 
        //   render: { 
        //     fillStyle: '#999',
        //     visible: true
        //   },
        //   friction: 0.1, // 降低摩擦力
        //   restitution: 0.9 // 增加弹性
        // }),
        // 掉落区域上方的长条障碍物 - 现在作为可移动底板
        this.Bodies.rectangle(200, this.dropArea.y, 400, 10, { 
          isStatic: true, 
          // angle: Math.PI * 0.03, // 略微倾斜，增加趣味性
          chamfer: { radius: 2 }, // 轻微圆角
          render: { 
            fillStyle: 'rgba(156, 39, 176, 0.8)', // 使用原底板的颜色但更明显
            visible: true
          },
          friction: 0.3,          // 降低摩擦力以使物体更容易移动
          frictionStatic: 0.5,    // 降低静摩擦力
          restitution: 0.2,       // 增加弹性使交互更有趣
          slop: 0.05,             // 允许微小重叠，使碰撞更平滑
          plugin: {
            isMovablePlatform: true // 标记为可移动平台
          }
        })
      ];

      // 顶部障碍物将作为可移动底板，不再需要单独创建收集区域底板
      
      // 创建固定在底部的高摩擦力条
      const movableObstacle = this.Bodies.rectangle(
        200, // 中心x坐标
        500, // 底部位置，接近游戏区域底部
        this.movableObstacle.width,
        this.movableObstacle.height,
        {
          isStatic: true,        // 设为静态，不可移动
          friction: 2,           // 增加最大摩擦力
          frictionStatic: 10,    // 极大的静态摩擦力
          frictionAir: 1,        // 最大空气摩擦力
          restitution: 0,        // 无弹性
          render: {
            fillStyle: '#FF5722', // 橙红色，更醒目
            visible: true
          },
          collisionFilter: {
            category: 0x0002,
            mask: 0xFFFFFFFF
          },
          // 自定义属性
          plugin: {
            isMovableObstacle: true // 保留标记
          }
        }
      );
      
      // 创建从movableObstacle到顶部障碍物之间的高摩擦力区域
      const frictionZone = this.Bodies.rectangle(
        200, // 中心x坐标
        (500 + this.dropArea.y) / 2, // 中心y坐标 (movableObstacle和顶部障碍物的中点)
        400, // 宽度，覆盖整个游戏区域宽度
        500 - this.dropArea.y, // 高度，从顶部障碍物到movableObstacle的距离
        {
          isStatic: true,        // 设为静态，不可移动
          isSensor: true,        // 设为传感器，不会产生物理碰撞
          render: {
            fillStyle: 'rgba(255, 255, 0, 0.1)', // 半透明黄色，便于调试
            visible: false       // 设为不可见
          },
          // 自定义属性
          plugin: {
            isFrictionZone: true  // 标记为摩擦区域
          }
        }
      );
      
      // 保存顶部障碍物作为可移动底板的引用
      this.platformMotion.platform = walls.find(wall => wall.plugin?.isMovablePlatform);
      this.platformMotion.baseY = this.dropArea.y; // 更新基准Y位置为顶部障碍物位置
      this.movableObstacle.body = movableObstacle;
      
      // 添加障碍物和摩擦区域到墙体数组
      walls.push(movableObstacle);
      walls.push(frictionZone); // 添加高摩擦力区域到墙体数组

      // 添加边界到世界
      this.World.add(this.engine.world, walls);

      // 创建运行器
      this.runner = this.Runner.create();
      this.Runner.run(this.runner, this.engine);

      // 运行渲染器
      this.Render.run(this.render);
      
      // 添加碰撞事件
      this.Events.on(this.engine, 'collisionStart', (event) => {
        event.pairs.forEach((pair) => {
          this.playCollisionSound();
          
          // 检查是否是顶部平台与金币的碰撞
          const isPlatform = pair.bodyA.plugin?.isMovablePlatform || pair.bodyB.plugin?.isMovablePlatform;
          const coinBody = pair.bodyA.value !== undefined ? pair.bodyA : 
                          pair.bodyB.value !== undefined ? pair.bodyB : null;
          const platformBody = pair.bodyA.plugin?.isMovablePlatform ? pair.bodyA : 
                              pair.bodyB.plugin?.isMovablePlatform ? pair.bodyB : null;
          
          // 如果是平台和金币碰撞，特殊处理
          if (isPlatform && coinBody) {
            coinBody.plugin = coinBody.plugin || {};
            coinBody.plugin.touchingPlatform = true;
            coinBody.plugin.touchingPlatformTime = Date.now(); // 记录碰撞时间戳
            
            // 调整金币参数使其更容易被推动
            this.Body.setStatic(coinBody, false);
            this.Body.set(coinBody, {
              friction: 0.5,         // 更低的摩擦力，使金币更容易被推动
              frictionAir: 0.1,      // 更低的空气摩擦力
              frictionStatic: 0.2,   // 更低的静摩擦力
              restitution: 0.2,      // 增加更多弹性
              density: 0.03          // 更轻的密度，使金币更容易被推动
            });
            
            // 计算碰撞方向和速度
            if (platformBody) {
              const platformVelocity = platformBody.velocity;
              const platformPosition = platformBody.position;
              const coinPosition = coinBody.position;
              
              // 计算金币相对于平台的位置（上/下）
              const isAbovePlatform = coinPosition.y < platformPosition.y;
              
              // 计算推力方向，根据平台的移动方向和金币相对位置
              let forceY = 0;
              
              if (isAbovePlatform && platformVelocity.y < 0) {
                // 平台向上移动且金币在上方 - 向上推
                forceY = platformVelocity.y * 0.001;
              } else if (!isAbovePlatform && platformVelocity.y > 0) {
                // 平台向下移动且金币在下方 - 向下推
                forceY = platformVelocity.y * 0.001;
              } else {
                // 其他情况 - 根据碰撞法线施加推力
                const normalVector = pair.collision ? pair.collision.normal : { x: 0, y: isAbovePlatform ? -1 : 1 };
                forceY = platformVelocity.y * 0.001 * normalVector.y;
              }
              
              // 根据平台移动方向给金币施加力
              this.Body.applyForce(coinBody, coinBody.position, {
                x: 0,
                y: forceY
              });
              
              // 记录平台速度以便在update中持续应用
              coinBody.plugin.platformVelocityY = platformVelocity.y;
            }
          } else {
            // 检查是否有金币参与碰撞
            const coinA = pair.bodyA.value !== undefined ? pair.bodyA : null;
            const coinB = pair.bodyB.value !== undefined ? pair.bodyB : null;
            
            // 处理金币碰撞后的物理特性
            [coinA, coinB].forEach(coin => {
              if (coin) {
                // 标记金币已经被处理过
                coin.plugin = coin.plugin || {};
                
                // 设置巨大摩擦力，确保金币只能被碰撞和推动
                this.Body.setStatic(coin, false); // 确保不是静态的
                this.Body.set(coin, {
                  friction: 1.5,        // 极大的摩擦力
                  frictionAir: 0.5,     // 极大的空气摩擦力
                  frictionStatic: 1.5,  // 极大的静摩擦力
                  restitution: 0.01,    // 几乎没有弹性
                  density: 0.1         // 降低密度，使其更容易被推动
                });
              }
            });
          }
        });
      });
      
      // 在活跃碰撞期间持续应用力
      this.Events.on(this.engine, 'collisionActive', (event) => {
        event.pairs.forEach((pair) => {
          // 检查是否是顶部平台与金币的碰撞
          const isPlatform = pair.bodyA.plugin?.isMovablePlatform || pair.bodyB.plugin?.isMovablePlatform;
          const coinBody = pair.bodyA.value !== undefined ? pair.bodyA : 
                          pair.bodyB.value !== undefined ? pair.bodyB : null;
          const platformBody = pair.bodyA.plugin?.isMovablePlatform ? pair.bodyA : 
                              pair.bodyB.plugin?.isMovablePlatform ? pair.bodyB : null;
          
          // 如果是平台和金币碰撞，继续应用力
          if (isPlatform && coinBody && platformBody && platformBody.customData) {
            // 获取平台方向和速度
            const direction = platformBody.customData.direction;
            const speed = platformBody.customData.speed;
            
            // 计算金币相对于平台的位置
            const isAbovePlatform = coinBody.position.y < platformBody.position.y;
            
            // 应用持续的力，使金币随平台移动
            // 根据相对位置调整力
            const positionFactor = isAbovePlatform ? 
                                  (direction < 0 ? 1.5 : 0.5) : 
                                  (direction > 0 ? 1.5 : 0.5);
            
            // 应用力
            this.Body.applyForce(coinBody, coinBody.position, {
              x: 0,
              y: direction * speed * 0.0005 * positionFactor
            });
            
            // 如果金币和平台非常接近，直接调整位置确保紧密跟随
            const distY = Math.abs(
              isAbovePlatform ? 
              platformBody.bounds.min.y - coinBody.bounds.max.y : 
              coinBody.bounds.min.y - platformBody.bounds.max.y
            );
            
            if (distY < 2) {
              // 直接调整位置，确保金币紧密跟随平台
              this.Body.setPosition(coinBody, {
                x: coinBody.position.x,
                y: coinBody.position.y + direction * speed * 0.8
              });
              
              // 同步速度
              this.Body.setVelocity(coinBody, {
                x: coinBody.velocity.x,
                y: direction * speed * 0.9
              });
            }
          }
        });
      });
      
      // 添加碰撞结束事件，处理金币离开平台的情况
      this.Events.on(this.engine, 'collisionEnd', (event) => {
        event.pairs.forEach((pair) => {
          // 检查是否是顶部平台与金币的碰撞结束
          const isPlatform = pair.bodyA.plugin?.isMovablePlatform || pair.bodyB.plugin?.isMovablePlatform;
          const coinBody = pair.bodyA.value !== undefined ? pair.bodyA : 
                          pair.bodyB.value !== undefined ? pair.bodyB : null;
          const platformBody = pair.bodyA.plugin?.isMovablePlatform ? pair.bodyA : 
                              pair.bodyB.plugin?.isMovablePlatform ? pair.bodyB : null;
          
          // 如果是平台和金币碰撞结束
          if (isPlatform && coinBody && coinBody.plugin) {
            // 如果金币确实与平台接触过，标记为刚离开平台
            if (coinBody.plugin.touchingPlatform) {
              coinBody.plugin.justLeftPlatform = true;
              coinBody.plugin.touchingPlatform = false;
              coinBody.plugin.leftPlatformTime = Date.now();
              
              // 保留平台速度的一部分影响，使过渡更平滑
              if (platformBody && platformBody.customData) {
                const direction = platformBody.customData.direction;
                const speed = platformBody.customData.speed;
                
                // 设置金币速度，继承平台的部分速度
                this.Body.setVelocity(coinBody, {
                  x: coinBody.velocity.x,
                  y: direction * speed * 0.7 // 继承70%的平台速度
                });
                
                // 记录继承的平台速度
                coinBody.plugin.inheritedVelocityY = direction * speed * 0.7;
              }
            }
            
            // 延迟恢复金币的正常物理特性，给金币一点时间保持被推动的状态
            setTimeout(() => {
              if (coinBody.plugin) {
                // 根据离开平台的时间长短调整物理属性恢复
                const timeElapsed = Date.now() - (coinBody.plugin.leftPlatformTime || 0);
                
                if (timeElapsed > 300) { // 完全恢复
                  this.Body.set(coinBody, {
                    friction: 1.5,        // 恢复较大的摩擦力
                    frictionAir: 0.5,     // 恢复较大的空气摩擦力
                    frictionStatic: 1.5,  // 恢复较大的静摩擦力
                    density: 0.1          // 恢复原始密度
                  });
                  
                  // 清除所有平台相关标记
                  delete coinBody.plugin.justLeftPlatform;
                  delete coinBody.plugin.platformVelocityY;
                  delete coinBody.plugin.leftPlatformTime;
                  delete coinBody.plugin.inheritedVelocityY;
                } else { // 部分恢复
                  this.Body.set(coinBody, {
                    friction: 1.0,        // 部分恢复摩擦力
                    frictionAir: 0.3,     // 部分恢复空气摩擦力
                    frictionStatic: 1.0,  // 部分恢复静摩擦力
                    density: 0.08         // 部分恢复密度
                  });
                }
              }
            }, 100); // 短暂延迟，避免立即改变物理特性
          }
        });
      });
      
      // 移除了处理金币重力的afterUpdate事件，因为现在金币没有重力属性
      // 金币只能通过碰撞和推动来移动

      
      // 添加更新事件，用于移动底板 - 性能优化版本
      this.Events.on(this.engine, 'beforeUpdate', () => {
        // 获取当前时间戳，用于控制不同方法的执行频率
        const timestamp = this.engine.timing.timestamp;
        
        // 底板移动每帧都需要执行以保持平滑
        this.updatePlatformPosition();
        
        // 处理平台对刚刚脱离接触的金币的额外推动力 - 确保金币被顺利推动
        const platform = this.platformMotion.platform;
        if (platform && platform.customData) {
          // 获取平台方向和速度
          const direction = platform.customData.direction;
          const speed = platform.customData.speed;
          
          // 根据平台的移动方向设置检测区域
          const platformBounds = platform.bounds;
          const isMovingDown = direction > 0;
          
          // 检测区域 - 比updatePlatformPosition中的区域略大
          const region = isMovingDown 
            ? {
                min: { x: platformBounds.min.x - 10, y: platformBounds.max.y },
                max: { x: platformBounds.max.x + 10, y: platformBounds.max.y + 40 }
              }
            : {
                min: { x: platformBounds.min.x - 10, y: platformBounds.min.y - 40 },
                max: { x: platformBounds.max.x + 10, y: platformBounds.min.y }
              };
          
          // 遍历所有金币，找出那些刚刚离开平台但应该继续受平台影响的
          this.coins.forEach(coin => {
            // 检查金币是否在检测区域内
            if (coin.position.x >= region.min.x && 
                coin.position.x <= region.max.x && 
                coin.position.y >= region.min.y && 
                coin.position.y <= region.max.y) {
              
              // 检查金币是否刚刚离开平台或正处于平台影响下
              if (coin.plugin && (coin.plugin.justLeftPlatform || 
                                 coin.plugin.touchingPlatform || 
                                 coin.plugin.affectedByPlatform)) {
                
                // 计算推力倍率 - 根据与平台的距离递减
                const distY = isMovingDown 
                  ? coin.position.y - platformBounds.max.y
                  : platformBounds.min.y - coin.position.y;
                
                const forceFactor = Math.max(0, 1 - distY / 40); // 距离越远，影响越小
                
                // 应用额外的推力，确保金币跟随平台运动 - 使用固定速度值
                if (forceFactor > 0) {
                  this.Body.applyForce(coin, coin.position, {
                    x: 0,
                    y: direction * speed * 0.0003 * forceFactor
                  });
                  
                  // 直接调整位置，进一步确保金币跟随平台 - 使用固定速度值
                  if (forceFactor > 0.7) { // 只对非常接近的金币应用位置调整
                    this.Body.setPosition(coin, {
                      x: coin.position.x,
                      y: coin.position.y + direction * speed * 0.1 * forceFactor
                    });
                    
                    // 同步部分速度
                    this.Body.setVelocity(coin, {
                      x: coin.velocity.x,
                      y: coin.velocity.y * 0.9 + direction * speed * 0.1 * forceFactor
                    });
                  }
                }
              }
            }
          });
        }
        
        // 边界检查可以降低频率
        // 根据金币数量动态调整：金币越多，检查频率越低
        const boundCheckInterval = this.coins.length > 50 ? 4 : 
                                 this.coins.length > 20 ? 3 : 2;
        if (timestamp % boundCheckInterval < 1) {
          this.checkCoinsOutOfBounds();
        }
        
        // 压力系统检查可以进一步降低频率
        // 只在金币数量超过阈值的一半时才检查
        if (this.coins.length >= this.pressureSystem.threshold / 2 && 
            timestamp % 5 < 1) { // 每5帧检查一次
          this.checkPressureSystem();
        }
      });
    },
    // 从对象池获取金币对象
    getCoinFromPool(value) {
      // 如果对象池未启用，直接返回null
      if (!this.coinPool.active) return null;
      
      // 查找匹配面值的可重用金币
      const poolIndex = this.coinPool.objects.findIndex(obj => obj.value === value);
      
      if (poolIndex !== -1) {
        // 从对象池中移除并返回
        return this.coinPool.objects.splice(poolIndex, 1)[0];
      }
      
      return null; // 没有找到匹配的金币
    },
    
    // 将金币返回到对象池
    returnCoinToPool(coin) {
      // 如果对象池未启用或已达到最大大小，直接返回
      if (!this.coinPool.active || this.coinPool.objects.length >= this.coinPool.maxSize) return;
      
      // 重置金币状态
      this.Body.setPosition(coin, {x: -100, y: -100}); // 移到不可见区域
      this.Body.setVelocity(coin, {x: 0, y: 0});
      this.Body.setAngularVelocity(coin, 0);
      
      // 重置插件数据
      coin.plugin = {
        pooled: true // 标记为对象池中的对象
      };
      
      // 添加到对象池
      this.coinPool.objects.push(coin);
    },
    
    DropCoins() {
      console.log('掉落金币')
      // 限制最大金币数量，避免性能问题
      if (this.coins.length > 100) {
        console.log('金币数量过多，暂停掉落')
        alert('金币太多了！清理一些再继续。')
        return
      }
      
      const coinCount = Math.floor(Math.random() * 5) + 3 // 随机3-7个金币
      const coinValues = [1, 5, 10, 25, 50] // 金币面值
      
      // 记录本次投放的总金额
      let dropValue = 0

      // 设置掉落金币的时间间隔
      const dropInterval = 150 // 毫秒
      
      const dropCoin = (index) => {
        if (index >= coinCount) return
        
        const value = coinValues[Math.floor(Math.random() * coinValues.length)]
        dropValue += value
        
        // 获取可移动底板的实时位置
        let dropY = this.dropArea.y // 默认位置，以防底板不存在
        
        // 如果底板存在，使用底板的实时位置
        if (this.platformMotion.platform) {
          // 获取底板的当前Y位置，并在其下方适当距离处掉落金币
          // 使用底板的bounds.max.y获取底板底部的Y坐标
          dropY = this.platformMotion.platform.bounds.max.y + 5; // 在底板下方5像素处掉落
        }
        
        // 随机位置 - 在掉落区域范围内随机X坐标，Y坐标使用底板的实时位置
        const position = {
          x: this.getRandomInt(this.dropArea.minX, this.dropArea.maxX),
          y: dropY
        }

        // 随机旋转角度
        const angle = Math.random() * Math.PI * 2
        
        // 随机初始速度 - 更大的随机范围
        const velocity = {
          x: (Math.random() - 0.5) * 5, // -2.5到2.5之间的随机值
          y: Math.random() * 2 + 1     // 1到3之间的随机值
        }

        // 尝试从对象池获取金币
        let coin = this.getCoinFromPool(value);
        
        if (coin) {
          // 重用对象池中的金币 - 设置无重力和高摩擦力特性
          this.Body.setPosition(coin, position);
          this.Body.setAngle(coin, angle);
          this.Body.set(coin, {
            restitution: 0.01, // 几乎没有弹性
            friction: 1.5,    // 极大的摩擦力
            frictionAir: 0.5, // 极大的空气摩擦力
            frictionStatic: 1.5, // 极大的静摩擦力
            density: 0.1,     // 降低密度，使其更容易被推动
            plugin: {}
          });
        } else {
          // 创建新的金币 - 无重力，只有巨大摩擦力
          coin = this.Bodies.circle(position.x, position.y, 15, {
            angle: angle,
            restitution: 0.01, // 几乎没有弹性
            friction: 1.5,   // 极大的摩擦力
            frictionAir: 0.5, // 极大的空气摩擦力
            frictionStatic: 1.5, // 极大的静摩擦力
            density: 0.1,    // 降低密度，使其更容易被推动
            chamfer: { radius: 2 }, // 轻微圆角化
            mass: 0.1, // 保持重量
            inertia: Infinity, // 设置较大的惯性值，防止旋转
            inverseInertia: 0, // 设置为0，使金币不容易旋转
            render: {
              sprite: {
                texture: this.createCoinTexture(value),
                xScale: 1,
                yScale: 1
              }
            },
            slop: 0.05, // 允许物体轻微重叠
            value: value, // 存储金额值
            plugin: {}
          });
        }
        
        // 设置初始速度
        this.Body.setVelocity(coin, velocity);
        
        // 设置角速度 - 设置为0，禁止初始旋转
        this.Body.setAngularVelocity(coin, 0);
        
        // 添加到世界
        if (!coin.world) { // 只有不在世界中的金币才需要添加
          this.World.add(this.engine.world, coin);
        }
        
        // 添加到活动金币数组
        this.coins.push(coin);
        
        // 递归调用下一个金币掉落
        setTimeout(() => dropCoin(index + 1), dropInterval);
      }
      
      // 开始掉落第一个金币
      dropCoin(0);
      
      // 更新总金额
      setTimeout(() => {
        this.totalValue += dropValue;
      }, coinCount * dropInterval + 100);
    },
    // 获取范围内的随机整数
    getRandomInt(min, max) {
      min = Math.ceil(min)
      max = Math.floor(max)
      return Math.floor(Math.random() * (max - min + 1)) + min
    },
    // 创建金币纹理 - 优化版本
    createCoinTexture(value) {
      // 使用对象池的纹理缓存
      const cacheKey = `coin_${value}`;
      if (this.coinPool.textures[cacheKey]) {
        return this.coinPool.textures[cacheKey];
      }
      
      // 创建离屏 canvas - 减少分辨率以提高性能
      const canvas = document.createElement('canvas')
      canvas.width = 30 // 减小尺寸
      canvas.height = 30 // 减小尺寸
      const ctx = canvas.getContext('2d')
      
      // 清除画布，确保背景透明
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // 简化渐变 - 减少颜色停止点
      const gradient = ctx.createRadialGradient(15, 15, 5, 15, 15, 14)
      gradient.addColorStop(0, '#FFEB3B') // 浅金色中心
      gradient.addColorStop(1, '#FF9800') // 深金色边缘
      
      // 绘制金币背景
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(15, 15, 14, 0, Math.PI * 2)
      ctx.fill()
      
      // 绘制边框 - 使用更轻的颜色
      ctx.strokeStyle = 'rgba(184, 134, 11, 0.7)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.arc(15, 15, 13, 0, Math.PI * 2)
      ctx.stroke()
      
      // 绘制金额
      ctx.fillStyle = '#8B4513'
      const fontSize = value.toString().length > 1 ? 12 : 14
      ctx.font = `bold ${fontSize}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(value.toString(), 15, 15)
      
      // 使用PNG格式保留透明度
      const texture = canvas.toDataURL('image/png');
      
      // 缓存纹理到对象池
      this.coinPool.textures[cacheKey] = texture;
      
      return texture
    },
    // 模拟播放碰撞音效
    playCollisionSound() {
      // 这里可以实现实际的音效播放逻辑
      // console.log('播放碰撞音效')
    },
    // 模拟播放掉落音效
    playCoinDropSound() {
      // 这里可以实现实际的音效播放逻辑
      // console.log('播放金币掉落音效')
    },
    // 检查压力系统 - 性能优化版本
    checkPressureSystem() {
      // 如果在冷却期，则跳过
      const now = Date.now();
      if (now - this.pressureSystem.lastReleaseTime < this.pressureSystem.cooldown) {
        return;
      }
      
      // 性能优化：如果金币少于阈值的一半，则不进行检测
      const coinCount = this.coins.length;
      if (coinCount < this.pressureSystem.threshold / 2) {
        return;
      }
      
      // 性能优化：使用更小的采样量
      // 根据金币总数动态调整采样比例
      const sampleSize = coinCount > 50 ? 10 : 
                       coinCount > 30 ? 15 : 20;
      
      // 随机选择起始索引，确保不同次检查不同的金币
      const startIndex = Math.floor(Math.random() * (coinCount - sampleSize + 1));
      const sampleCoins = this.coins.slice(startIndex, startIndex + sampleSize);
      
      // 检查是否有金币堆积在游戏区域中部 - 简化检查逻辑
      const middleY = 300; // 游戏区域中部位置
      let middleCoinsCount = 0;
      
      // 使用简单计数而不是filter，减少对象创建
      for (let i = 0; i < sampleCoins.length; i++) {
        const coin = sampleCoins[i];
        if (Math.abs(coin.position.y - middleY) < 50 && 
            Math.abs(coin.velocity.y) < 0.5) {
          middleCoinsCount++;
          // 一旦找到足够的堆积金币，立即进行下一步检查
          if (middleCoinsCount >= 3) break;
        }
      }
      
      // 如果有金币堆积在中部，检查底部障碍物上的金币堆积情况
      if (middleCoinsCount >= 3) {
        // 获取底部障碍物的位置信息 - 缓存以提高性能
        const obstacle = this.movableObstacle.body;
        if (!obstacle) return;
        
        const obstacleX = obstacle.position.x;
        const obstacleY = obstacle.position.y;
        const obstacleWidth = this.movableObstacle.width;
        
        // 性能优化：使用更高效的采样方法
        // 每隔几个金币采样一个，采样间隔根据金币数量动态调整
        const sampleInterval = coinCount > 50 ? 6 : 
                             coinCount > 30 ? 4 : 3;
        
        let coinsAboveObstacleCount = 0;
        
        // 使用for循环和计数器代替filter，减少对象创建
        for (let i = 0; i < coinCount; i += sampleInterval) {
          const coin = this.coins[i];
          if (!coin) continue;
          
          if (Math.abs(coin.position.x - obstacleX) < obstacleWidth/2 && 
              Math.abs(coin.position.y - obstacleY) < 80 && 
              coin.position.y < obstacleY) {
            coinsAboveObstacleCount++;
          }
        }
        
        // 根据采样估算总数
        const estimatedTotal = coinsAboveObstacleCount * sampleInterval;
        
        // 如果估计障碍物上的金币数量超过阈值，执行压力释放
        if (estimatedTotal >= this.pressureSystem.threshold) {
          // 性能优化：直接选择最靠近障碍物的几个金币
          // 而不是先过滤再排序
          const maxCoinsToFind = this.pressureSystem.maxCoinsToRelease * 2; // 找比需要的多一些
          const candidateCoins = [];
          
          // 只检查一小部分金币
          const coinsToCheck = Math.min(coinCount, 30);
          for (let i = 0; i < coinsToCheck; i++) {
            const coin = this.coins[i];
            if (Math.abs(coin.position.x - obstacleX) < obstacleWidth/2 &&
                obstacleY - coin.position.y < 30 && 
                coin.position.y < obstacleY) {
              candidateCoins.push(coin);
              if (candidateCoins.length >= maxCoinsToFind) break;
            }
          }
          
          // 选择最靠近障碍物的几个金币
          const bottomLayerCoins = candidateCoins
            .slice(0, Math.min(this.pressureSystem.maxCoinsToRelease, candidateCoins.length));
          
          // 让这些金币穿透障碍物
          bottomLayerCoins.forEach(coin => {
            // 临时修改金币的碰撞组，使其可以穿透障碍物
            const originalCollisionFilter = {...coin.collisionFilter};
            
            // 特别标记这个金币，防止它被checkCoinsOutOfBounds方法清除
            coin.plugin = coin.plugin || {};
            coin.plugin.isPenetrating = true;
            
            // 设置为不与障碍物碰撞
            coin.collisionFilter.group = -1;
            coin.collisionFilter.mask = 0xFFFFFF;
            
            // 给金币一个向下的力，帮助其穿透
            this.Body.applyForce(coin, coin.position, {
              x: 0,
              y: 0.05
            });
            
            // 简化闪烁效果，减少定时器使用
            coin.render.fillStyle = '#FF5722';
            
            // 恢复原始碰撞组，但此时已经穿过障碍物
            setTimeout(() => {
              coin.collisionFilter = originalCollisionFilter;
              coin.render.fillStyle = undefined; // 恢复原始颜色
              
              // 延迟一段时间后移除穿透标记，允许金币在落到底部障碍物上后稳定一段时间再考虑移除
              setTimeout(() => {
                if (coin.plugin) {
                  coin.plugin.isPenetrating = false;
                }
              }, 3000); // 3秒后允许金币正常检查是否超出边界
            }, 500);
          });
          
          // 更新最后释放时间
          this.pressureSystem.lastReleaseTime = now;
        }
      }
    },
    // 检查金币是否超出边界 - 性能优化版本
    checkCoinsOutOfBounds() {
      // 性能优化：根据金币数量动态调整检查频率
      const coinCount = this.coins.length;
      if (coinCount === 0) return; // 没有金币时直接返回
      
      // 动态调整检查频率：金币越多，检查频率越低
      const checkInterval = coinCount > 50 ? 6 : 
                           coinCount > 30 ? 4 : 
                           coinCount > 10 ? 2 : 1;
                           
      // 使用引擎时间戳来确保帧率独立性
      if (this.engine.timing.timestamp % checkInterval >= 1) {
        return; // 只在特定帧检查
      }
      
      // 性能优化：只检查部分金币，而不是全部
      // 根据金币数量动态调整检查比例
      const checkRatio = coinCount > 50 ? 0.3 : 
                       coinCount > 30 ? 0.5 : 1.0;
      
      // 计算本次要检查的金币数量
      const coinsToCheck = Math.ceil(coinCount * checkRatio);
      
      // 随机选择起始索引，确保不同帧检查不同的金币
      const startIndex = Math.floor(Math.random() * (coinCount - coinsToCheck + 1));
      
      // 获取可移动障碍物的位置信息 - 缓存以提高性能
      const obstacle = this.movableObstacle.body;
      const obstacleTop = obstacle ? obstacle.bounds.min.y : 600;
      const obstacleWidth = this.movableObstacle.width;
      
      // 获取顶部可移动底板的位置信息 - 缓存以提高性能
      const topPlatform = this.platformMotion.platform;
      const topPlatformBottom = topPlatform ? topPlatform.bounds.max.y : this.dropArea.y + 5;
      
      // 检查选定的金币子集
      for (let i = 0; i < coinsToCheck; i++) {
        const index = startIndex + i;
        if (index >= coinCount) break; // 安全检查
        
        const coin = this.coins[index];
        if (!coin) continue; // 安全检查
        
        // 如果金币有穿透标记，暂时不检查是否超出边界
        if (coin.plugin && coin.plugin.isPenetrating) {
          continue;
        }
        
        // 性能优化：使用简化的边界检查逻辑
        // 只检查明显超出边界的情况
        const coinY = coin.position.y;
        const coinX = coin.position.x;
        
        // 快速检查是否彻底超出边界 - 这些情况无需进一步检查
        if (coinY > 800 || coinY < -50) {
          this.removeCoin(coin, index);
          continue;
        }
        
        // 只有当金币接近下边界时才进行详细检查
        if (coinY > 650) {
          // 简化的障碍物检查
          const isCoinAboveObstacle = obstacle && 
                                    Math.abs(coinX - obstacle.position.x) < obstacleWidth/2 && 
                                    coinY < obstacleTop + 30;
          
          // 如果不在障碍物上方，则移除
          if (!isCoinAboveObstacle) {
            this.removeCoin(coin, index);
          }
        }
      }
    },
    
    // 辅助方法：移除金币 - 提取为单独方法以减少代码重复
    removeCoin(coin, index) {
      // 记录金额
      if (coin.value) {
        this.totalValue += coin.value;
      }
      
      // 从数组中移除 - 使用提供的索引或查找索引
      const coinIndex = index !== undefined ? index : this.coins.indexOf(coin);
      if (coinIndex !== -1) {
        this.coins.splice(coinIndex, 1);
      }
      
      // 尝试将金币放入对象池以便重用
      if (this.coinPool.active) {
        this.returnCoinToPool(coin);
      } else {
        // 如果对象池未启用，则从世界中移除
        this.World.remove(this.engine.world, coin);
      }
    },
    // 更新顶部障碍物位置的方法
    updatePlatformPosition() {
      if (!this.platformMotion.platform) return;
      
      // 使用Matter.js的Body.setPosition方法
      const platform = this.platformMotion.platform;
      
      // 获取当前位置
      const oldY = platform.position.y;
      
      // 计算移动方向和距离
      // 不再使用正弦函数来确定位置，而是使用固定速度和方向切换
      if (!platform.customData) {
        platform.customData = {
          // 初始化移动方向 (1: 向下, -1: 向上)
          direction: 1,
          // 固定速度值 - 设置为适中的速度
          speed: 0.8,
          // 记录边界点
          lowerBound: this.platformMotion.baseY + this.platformMotion.amplitude,
          upperBound: this.platformMotion.baseY - this.platformMotion.amplitude
        };
      }
      
      // 使用固定速度计算新位置
      let newY = oldY + (platform.customData.direction * platform.customData.speed);
      
      // 检查是否到达边界点，如果是则改变方向
      if (newY >= platform.customData.lowerBound) {
        newY = platform.customData.lowerBound;
        platform.customData.direction = -1; // 改变方向向上
      } else if (newY <= platform.customData.upperBound) {
        newY = platform.customData.upperBound;
        platform.customData.direction = 1; // 改变方向向下
      }
      
      // 设置平台位置
      this.Body.setPosition(platform, {
        x: platform.position.x,
        y: newY
      });
      
      // 计算移动的距离
      const deltaY = newY - oldY;
      
      // 设置平台速度 - 直接设置为固定值
      this.Body.setVelocity(platform, {
        x: 0,
        y: platform.customData.direction * platform.customData.speed
      });
      
      // 只有当移动距离足够大时才处理碰撞，提高性能
      if (Math.abs(deltaY) > 0.05) {
        // 获取平台的边界信息
        const platformBounds = platform.bounds;
        const platformWidth = platformBounds.max.x - platformBounds.min.x;
        
        // 使用Matter.js中的Query.region方法获取在指定区域内的所有物体
        // 此方法比手动遍历所有金币更高效
        
        if (deltaY > 0) { // 平台向下移动
          // 定义平台下方的检测区域
          const region = {
            min: { x: platformBounds.min.x, y: platformBounds.max.y },
            max: { x: platformBounds.max.x, y: platformBounds.max.y + 30 }
          };
          
          // 使用所有金币进行区域查询
          this.coins.forEach(coin => {
            // 检查金币是否在平台正下方区域
            if (coin.position.x >= region.min.x && 
                coin.position.x <= region.max.x && 
                coin.position.y >= region.min.y && 
                coin.position.y <= region.max.y) {
              
              // 给金币一个向下的推力，模拟被平台推动 - 使用固定力值
              this.Body.applyForce(coin, coin.position, {
                x: 0,
                y: platform.customData.speed * 0.001 // 力的大小与平台速度成正比，但保持恒定
              });
              
              // 更新金币位置，跟随平台移动
              this.Body.setPosition(coin, {
                x: coin.position.x,
                y: coin.position.y + platform.customData.speed * 0.9 // 金币移动速度为平台速度的90%
              });
              
              // 标记金币被平台影响
              coin.plugin = coin.plugin || {};
              coin.plugin.affectedByPlatform = true;
            }
          });
          
        } else if (deltaY < 0) { // 平台向上移动
          // 定义平台上方的检测区域
          const region = {
            min: { x: platformBounds.min.x, y: platformBounds.min.y - 10 },
            max: { x: platformBounds.max.x, y: platformBounds.min.y }
          };
          
          // 使用所有金币进行区域查询
          this.coins.forEach(coin => {
            // 检查金币是否在平台正上方区域
            if (coin.position.x >= region.min.x && 
                coin.position.x <= region.max.x && 
                coin.position.y >= region.min.y && 
                coin.position.y <= region.max.y) {
              
              // 给金币一个向上的推力，模拟被平台推动 - 使用固定力值
              this.Body.applyForce(coin, coin.position, {
                x: 0,
                y: -platform.customData.speed * 0.001 // 力的大小与平台速度成正比，但保持恒定
              });
              
              // 更新金币位置，跟随平台移动
              this.Body.setPosition(coin, {
                x: coin.position.x,
                y: coin.position.y - platform.customData.speed * 0.9 // 金币移动速度为平台速度的90%
              });
              
              // 标记金币被平台影响
              coin.plugin = coin.plugin || {};
              coin.plugin.affectedByPlatform = true;
            }
          });
        }
        
        // 处理平台扩展区域内的金币
        const extendedRegion = {
          min: { x: platformBounds.min.x - 5, y: platformBounds.min.y - 15 },
          max: { x: platformBounds.max.x + 5, y: platformBounds.max.y + 35 }
        };
        
        this.coins.forEach(coin => {
          // 检查金币是否在扩展区域内但尚未被处理
          if (coin.position.x >= extendedRegion.min.x && 
              coin.position.x <= extendedRegion.max.x && 
              coin.position.y >= extendedRegion.min.y && 
              coin.position.y <= extendedRegion.max.y &&
              (!coin.plugin || !coin.plugin.affectedByPlatform)) {
            
            // 计算金币到平台的距离
            const distX = Math.abs(coin.position.x - platform.position.x);
            const distY = platform.customData.direction > 0 ? 
                         coin.position.y - platformBounds.max.y : 
                         platformBounds.min.y - coin.position.y;
            
            // 如果金币足够接近平台
            if (distX < platformWidth / 2 && distY > 0 && distY < 20) {
              // 弱推力效果 - 使用固定力值
              this.Body.applyForce(coin, coin.position, {
                x: 0,
                y: platform.customData.direction * platform.customData.speed * 0.0005
              });
              
              // 弱位置调整
              this.Body.setPosition(coin, {
                x: coin.position.x,
                y: coin.position.y + platform.customData.direction * platform.customData.speed * 0.3
              });
            }
          }
        });
        
        // 重置标记，以便下一次检测
        setTimeout(() => {
          this.coins.forEach(coin => {
            if (coin.plugin) {
              coin.plugin.affectedByPlatform = false;
            }
          });
        }, 50);
      }
    },
  },
  beforeDestroy() {
    // 清理资源
    if (this.render) {
      this.Render.stop(this.render)
      this.render.canvas.remove()
    }
    if (this.runner) {
      this.Runner.stop(this.runner)
    }
    // 清理所有金币
    if (this.coins.length > 0) {
      this.World.remove(this.engine.world, this.coins);
      this.coins = [];
    }
    // 清理对象池
    if (this.coinPool.objects.length > 0) {
      this.World.remove(this.engine.world, this.coinPool.objects);
      this.coinPool.objects = [];
    }
    // 清理纹理缓存
    this.coinPool.textures = {};
    this._coinTextureCache = null;
  }
}
</script>

<style scoped>
.coin-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  font-family: Arial, sans-serif;
}

.drop-button {
  padding: 12px 24px;
  font-size: 18px;
  background: linear-gradient(45deg, #4CAF50, #8BC34A);
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  margin-bottom: 20px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  transition: all 0.3s ease;
}

.drop-button:hover {
  background: linear-gradient(45deg, #45a049, #7CB342);
  transform: translateY(-2px);
  box-shadow: 0 6px 8px rgba(0,0,0,0.15);
}

.drop-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.game-area {
  position: relative;
}

.coin-box {
  width: 400px;
  height: 600px;
  border: 3px solid #9c27b0;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  background: linear-gradient(to bottom, #ffffff, #f5f5f5);
  box-shadow: 0 10px 20px rgba(0,0,0,0.1);
}

.collection-area {
  position: absolute;
  top: 50px; /* 从350px减为50px，向上移动300px */
  left: 10px;
  right: 10px;
  height: 100px;
  border: 2px solid #f44336;
  border-radius: 5px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #f44336;
  font-weight: bold;
  font-size: 16px;
  pointer-events: none;
  z-index: 10;
}

.total-value {
  position: absolute;
  bottom: 25px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(156, 39, 176, 0.8);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 18px;
  font-weight: bold;
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  z-index: 15;
}
</style>
