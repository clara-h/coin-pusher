<template>
  <div class="coin-container">
    <div class="buttons-container">
      <button @click="DropCoins(5)" class="drop-button">掉落5枚</button>
      <button @click="DropCoins(10)" class="drop-button">掉落10枚</button>
      <button @click="DropCoins(20)" class="drop-button">掉落20枚</button>
      <button @click="DropCoins(50)" class="drop-button">掉落50枚</button>
    </div>
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
      // 底部高摩擦力条
      movableObstacle: {
        body: null,       // 障碍物物体引用
        width: 400,       // 宽度
        height: 20,       // 增加高度使其更明显
        offsetY: 0       // 不再使用此偏移量，因为位置是固定的
      },
      // 缓存纹理
      _coinTextureCache: null,
      // 新增：用于优化纹理预缓存
      offscreenCoinTextures: {}
    }
  },
  mounted() {
    // 初始化物理引擎
    this.InitPhysics()
  },
  methods: {
    InitPhysics() {
      console.log('初始化物理引擎')
      // 初始化引擎并设置更精确的物理参数
      this.engine = this.Engine.create({
        // 设置引擎参数以提高性能
        positionIterations: 4,    // 位置迭代次数降低到4 (从6降低)
        velocityIterations: 2,    // 速度迭代次数降低到2 (从4降低)
        constraintIterations: 1,  // 约束迭代次数保持低值以提高性能
        enableSleeping: true,     // 启用休眠以降低不活动物体的CPU消耗
        // 时间步长设置
        timing: {
          timeScale: 1,
          timestamp: 0,
          delta: 1000 / 60,       // 锁定帧率到60FPS
        }
      });
      
      // 关闭重力，减少计算量
      this.engine.world.gravity.y = 0;
      
      // 渲染设置，使用Canvas优化
      this.render = this.Render.create({
        element: this.$refs.coinBox,
        engine: this.engine,
        options: {
          width: 400,
          height: 400,
          wireframes: false,
          background: '#f8f8f8',
          showSleeping: false,    // 不渲染休眠的物体
          showDebug: false,       // 不显示调试信息
          showBroadphase: false,  // 不显示宽相检测
          showBounds: false,      // 不显示边界
          showVelocity: false,    // 不显示速度向量
          showCollisions: false,  // 不显示碰撞点
          showSeparations: false, // 不显示分离向量
          showAxes: false,        // 不显示坐标轴
          showPositions: false,   // 不显示位置
          showAngleIndicator: false, // 不显示角度指示器
          showIds: false,         // 不显示ID
          showVertexNumbers: false, // 不显示顶点编号
          showConvexHulls: false, // 不显示凸包
          showInternalEdges: false, // 不显示内部边
          showMousePosition: false, // 不显示鼠标位置
          pixelRatio: window.devicePixelRatio || 1, // 使用设备像素比
        }
      });
      
      // 使用离屏画布预渲染模板图形
      this.precacheTextures();

      // 创建边界 - 使用渐变色边界
      const walls = [
        // 底部边界 - 可见
        this.Bodies.rectangle(200, 400, 390, 20, { 
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
        this.Bodies.rectangle(-10, 200, 20, 400, { 
          isStatic: true, 
          render: { 
            visible: false 
          } 
        }),
        // 右侧边界
        this.Bodies.rectangle(410, 200, 20, 400, { 
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
        350, // 底部位置，接近游戏区域底部
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
        (350 + this.dropArea.y) / 2, // 中心y坐标 (movableObstacle和顶部障碍物的中点)
        400, // 宽度，覆盖整个游戏区域宽度
        350 - this.dropArea.y, // 高度，从顶部障碍物到movableObstacle的距离
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
        // 处理所有碰撞对
        event.pairs.forEach((pair) => {
          // 检查碰撞对象是否是金币和动态平台
          const isMovablePlatform = pair.bodyA === this.platformMotion.platform || 
                                    pair.bodyB === this.platformMotion.platform;
          
          const coinBody = pair.bodyA.plugin?.isCoin ? pair.bodyA : 
                          (pair.bodyB.plugin?.isCoin ? pair.bodyB : null);
          
          if (isMovablePlatform && coinBody) {
            // 初始化金币的plugin对象（如果不存在）
            if (!coinBody.plugin) {
              coinBody.plugin = {};
            }
            
            // 获取平台对象
            const platformBody = pair.bodyA === this.platformMotion.platform ? 
                                 pair.bodyA : pair.bodyB;
            
            // 标记金币正在接触平台
            coinBody.plugin.touchingPlatform = true;
            coinBody.plugin.platformId = platformBody.id;
            
            // 特殊处理：在平台向上移动时，设置强粘附效果
            if (platformBody.customData && platformBody.customData.direction < 0) {
              coinBody.plugin.stuckToPlatform = true;
              
              // 降低金币的密度和空气摩擦力，使其更容易跟随平台
              this.Body.set(coinBody, {
                density: 0.001,    // 非常轻
                frictionAir: 0.001 // 几乎没有空气阻力
              });
            }
          }
        });
      });
      
      // 添加更新事件，用于移动底板 - 性能优化版本
      this.Events.on(this.engine, 'beforeUpdate', () => {
        // 获取当前时间戳
        const timestamp = this.engine.timing.timestamp;
        
        // 性能优化：根据当前帧率动态调整物理计算
        if (this.engine.timing.lastDelta > 0) {
          const fps = 1000 / this.engine.timing.lastDelta;
          
          // 如果帧率低于阈值，减少物理计算精度
          if (fps < 30) {
            // 临时降低迭代次数，提高性能
            this.engine.positionIterations = 2;
            this.engine.velocityIterations = 1;
          } else {
            // 恢复正常迭代次数
            this.engine.positionIterations = 4;
            this.engine.velocityIterations = 2;
          }
        }
        
        // 每帧执行的操作
        this.updatePlatformPosition();
        
        // 性能优化：分散高消耗操作
        if (timestamp % 2 === 0) { // 每2帧执行一次
          this.checkAllCoins();
        }
        
        // 处理平台对刚刚脱离接触的金币的额外推动力 - 确保金币被顺利推动
        const platform = this.platformMotion.platform;
        if (platform && platform.customData) {
          // 获取平台方向和速度
          const direction = platform.customData.direction;
          const speed = platform.customData.speed;
          
          // 特殊处理：额外检查所有金币，查找有粘附标记或特殊影响标记的金币
          // 这对向上移动特别重要
          if (direction < 0) { // 平台向上移动
            this.coins.forEach(coin => {
              if (coin.plugin && (coin.plugin.stickyEffect || 
                                 coin.plugin.extendedPlatformInfluence || 
                                 coin.plugin.stuckToPlatform)) {
                
                // 计算距离平台的距离
                const distY = Math.abs(platform.position.y - coin.position.y);
                
                // 根据距离设置不同的效果强度
                if (distY < 50) { // 在较近距离内应用强粘附效果
                  const influenceFactor = Math.max(0, 1 - distY/50); // 距离越近影响越强
                  
                  // 应用额外的向上力
                  this.Body.applyForce(coin, coin.position, {
                    x: 0,
                    y: direction * speed * 0.003 * influenceFactor
                  });
                  
                  // 如果非常接近平台，直接设置位置和速度
                  if (distY < 10) {
                    // 直接跟随平台移动
                    this.Body.setPosition(coin, {
                      x: coin.position.x,
                      y: coin.position.y + direction * speed
                    });
                    
                    // 设置与平台相同的速度
                    this.Body.setVelocity(coin, {
                      x: coin.velocity.x,
                      y: direction * speed * 1.1
                    });
                  }
                  
                  // 记录跟随状态的持续时间
                  const now = Date.now();
                  if (!coin.plugin.stickyStartTime) {
                    coin.plugin.stickyStartTime = now;
                  }
                  
                  // 如果粘附时间过长，开始逐渐减弱影响
                  const stickyDuration = now - (coin.plugin.stickyStartTime || now);
                  if (stickyDuration > 1000) { // 超过1秒
                    // 逐渐恢复正常特性
                    const recoverFactor = Math.min(1, (stickyDuration - 1000) / 2000);
                    this.Body.set(coin, {
                      density: 0.01 + 0.09 * recoverFactor,
                      frictionAir: 0.01 + 0.49 * recoverFactor
                    });
                    
                    // 如果超过3秒，完全清除粘附效果
                    if (stickyDuration > 3000) {
                      delete coin.plugin.stickyEffect;
                      delete coin.plugin.extendedPlatformInfluence;
                      delete coin.plugin.stuckToPlatform;
                      delete coin.plugin.stickyStartTime;
                    }
                  }
                }
              }
            });
          }
          
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
                  // 向上运动时使用更大的力
                  const upwardBoost = direction < 0 ? 3.0 : 1.0;
                  
                  this.Body.applyForce(coin, coin.position, {
                    x: 0,
                    y: direction * speed * 0.0003 * forceFactor * upwardBoost
                  });
                  
                  // 直接调整位置，进一步确保金币跟随平台 - 使用固定速度值
                  if (forceFactor > 0.7) { // 只对非常接近的金币应用位置调整
                    // 向上运动时使用更大的位置调整
                    const positionBoost = direction < 0 ? 1.5 : 1.0;
                    
                    this.Body.setPosition(coin, {
                      x: coin.position.x,
                      y: coin.position.y + direction * speed * 0.1 * forceFactor * positionBoost
                    });
                    
                    // 同步部分速度 - 向上运动时设置更大的速度继承
                    const velocityBoost = direction < 0 ? 1.5 : 1.0;
                    
                    this.Body.setVelocity(coin, {
                      x: coin.velocity.x,
                      y: coin.velocity.y * 0.9 + direction * speed * 0.1 * forceFactor * velocityBoost
                    });
                  }
                }
              }
            }
          });
        }
        
        // 性能优化：定期清理内存
        if (timestamp % 1000 === 0) { // 每1000毫秒执行一次
          this.performMemoryCleanup();
        }
      });
    },
    // 从对象池获取金币对象
    getCoinFromPool(value) {
      // 优化对象池检索
      if (!this.coinPool.active || this.coinPool.objects.length === 0) {
        return null;
      }
      
      // 尝试找到匹配面值的金币以减少修改次数
      let index = this.coinPool.objects.findIndex(coin => coin.value === value);
      
      // 如果没有匹配的面值，使用任何可用的金币
      if (index === -1) {
        index = 0;
      }
      
      // 获取金币并从对象池中删除
      const coin = this.coinPool.objects.splice(index, 1)[0];
      
      // 完全重置金币状态
      this.Body.setVelocity(coin, { x: 0, y: 0 });
      this.Body.setAngularVelocity(coin, 0);
      this.Body.setStatic(coin, false);
      this.Body.set(coin, {
        restitution: 0.01,
        friction: 1.5,
        frictionAir: 0.5,
        frictionStatic: 1.5,
        density: 0.2,
        mass: 0.2,
        inertia: Infinity,
        torque: 0,
        force: { x: 0, y: 0 },
        positionImpulse: { x: 0, y: 0 },
        constraintImpulse: { x: 0, y: 0, angle: 0 },
        value: value
      });
      
      // 更新金币纹理以匹配新的面值
      if (coin.render && coin.render.sprite) {
        coin.render.sprite.texture = this.offscreenCoinTextures[value];
      }
      
      return coin;
    },
    
    // 将金币返回到对象池
    returnCoinToPool(coin) {
      // 在添加到对象池前完全重置金币状态
      this.World.remove(this.engine.world, coin);
      
      // 完全重置所有属性
      this.Body.setPosition(coin, { x: -100, y: -100 }); // 移到视野外
      this.Body.setVelocity(coin, { x: 0, y: 0 });
      this.Body.setAngularVelocity(coin, 0);
      this.Body.setAngle(coin, 0);
      this.Body.set(coin, {
        force: { x: 0, y: 0 },
        torque: 0,
        positionImpulse: { x: 0, y: 0 },
        constraintImpulse: { x: 0, y: 0, angle: 0 },
        totalContacts: 0,
        speed: 0,
        angularSpeed: 0,
        motion: 0
      });
      
      // 移除任何额外的标记
      coin.plugin = {};
      
      // 限制对象池大小
      if (this.coinPool.objects.length < this.coinPool.maxSize) {
        this.coinPool.objects.push(coin);
      } else {
        // 如果对象池已满，直接丢弃此金币
        console.log('对象池已满，丢弃金币');
      }
    },
    
    // 优化 DropCoins 方法，接受指定数量参数
    DropCoins(coinCount) {
      console.log(`掉落${coinCount}枚金币`)
      
      // 性能监控：如果帧率过低，减少掉落的金币数量
      let actualCoinCount = coinCount; // 默认使用指定数量
      
      // 如果引擎存在且有性能数据
      if (this.engine && this.engine.timing && this.engine.timing.lastDelta > 0) {
        const fps = 1000 / this.engine.timing.lastDelta;
        
        // 根据帧率调整金币数量
        if (fps < 30) {
          // 帧率低时限制最大数量
          actualCoinCount = Math.min(actualCoinCount, Math.max(5, Math.floor(actualCoinCount * 0.5)));
          console.log(`帧率低，数量调整为${actualCoinCount}`);
        } else if (fps < 45) {
          // 帧率中等时适当限制
          actualCoinCount = Math.min(actualCoinCount, Math.max(10, Math.floor(actualCoinCount * 0.7)));
          console.log(`帧率一般，数量调整为${actualCoinCount}`);
        }
        
        // 如果金币总数超过80个，也减少新增数量
        if (this.coins.length > 80) {
          actualCoinCount = Math.min(actualCoinCount, Math.max(5, Math.floor(actualCoinCount * 0.4)));
          console.log(`金币已多，数量调整为${actualCoinCount}`);
        }
      }
      
      const coinValues = [1, 5, 10, 25, 50]; // 金币面值
      
      // 记录本次投放的总金额 - 仅用于显示，不会立即添加到总额
      let dropValue = 0

      // 设置掉落金币的时间间隔 - 根据硬件性能和数量调整
      const baseInterval = this.engine && this.engine.timing && this.engine.timing.lastDelta > 20 
        ? 200  // 性能较差时增加间隔
        : 150; // 默认间隔
      
      // 根据金币数量调整间隔，数量越多间隔越短
      const dropInterval = actualCoinCount > 30 
        ? Math.max(50, baseInterval - 80) // 大量金币时缩短间隔
        : (actualCoinCount > 15 
            ? Math.max(80, baseInterval - 40) // 中等数量时略微缩短
            : baseInterval); // 少量使用默认间隔
      
      // 批量创建所有金币的数据
      const coinDataList = [];
      for (let i = 0; i < actualCoinCount; i++) {
        const value = coinValues[Math.floor(Math.random() * coinValues.length)];
        dropValue += value;
        
        // 获取可移动底板的实时位置
        let dropY = this.dropArea.y; // 默认位置
        if (this.platformMotion.platform) {
          dropY = this.platformMotion.platform.bounds.max.y + 5;
        }
        
        // 创建位置、角度和速度，增加随机性避免堆叠
        const position = {
          x: this.getRandomInt(this.dropArea.minX, this.dropArea.maxX),
          y: dropY + this.getRandomInt(-2, 2) // 微小随机，避免完全重叠
        };
        const angle = Math.random() * Math.PI * 2;
        const velocity = {
          x: (Math.random() - 0.5) * 5,
          y: Math.random() * 2 + 1
        };
        
        coinDataList.push({ value, position, angle, velocity });
      }
      
      // 使用递归函数处理金币掉落
      const dropCoin = (index) => {
        if (index >= coinDataList.length) return;
        
        const data = coinDataList[index];
        let coin = this.getCoinFromPool(data.value);
        
        if (coin) {
          // 重用对象池中的金币
          this.Body.setPosition(coin, data.position);
          this.Body.setAngle(coin, data.angle);
          this.Body.set(coin, {
            restitution: 0.01,
            friction: 1.5,
            frictionAir: 0.5,
            frictionStatic: 1.5,
            density: 0.2,
            plugin: {}
          });
        } else {
          // 创建新的金币 - 使用预缓存的纹理
          coin = this.Bodies.circle(data.position.x, data.position.y, 22.5, {
            angle: data.angle,
            restitution: 0.01,
            friction: 1.5,
            frictionAir: 0.5,
            frictionStatic: 1.5,
            density: 0.2,
            chamfer: { radius: 2 },
            mass: 0.2, // 金币质量
            inertia: Infinity,
            inverseInertia: 0,
            render: {
              sprite: {
                // 使用预缓存的纹理
                texture: this.offscreenCoinTextures[data.value],
                xScale: 1.5,
                yScale: 1.5
              }
            },
            slop: 0.05,
            value: data.value,
            plugin: {}
          });
        }
        
        // 设置初始速度和角速度
        this.Body.setVelocity(coin, data.velocity);
        this.Body.setAngularVelocity(coin, 0);
        
        // 添加到世界和活动金币数组
        if (!coin.world) {
          this.World.add(this.engine.world, coin);
        }
        this.coins.push(coin);
        
        // 递归调用下一个金币掉落
        setTimeout(() => dropCoin(index + 1), dropInterval);
      };
      
      // 开始掉落第一个金币
      dropCoin(0);
    },
    // 获取范围内的随机整数
    getRandomInt(min, max) {
      min = Math.ceil(min)
      max = Math.floor(max)
      return Math.floor(Math.random() * (max - min + 1)) + min
    },
    // 创建金币纹理 - 优化版本
    createCoinTexture(value) {
      // 检查是否已有缓存纹理
      if (this.offscreenCoinTextures && this.offscreenCoinTextures[value]) {
        return this.offscreenCoinTextures[value];
      }
      
      // 如果没有缓存，创建新纹理
      const canvas = document.createElement('canvas');
      canvas.width = 45;
      canvas.height = 45;
      const ctx = canvas.getContext('2d');
      
      // 优化绘制操作，减少状态更改
      ctx.save();
      
      // 使用圆形剪切区域，避免多余绘制
      ctx.beginPath();
      ctx.arc(22.5, 22.5, 21.5, 0, Math.PI * 2);
      ctx.clip();
      
      // 使用渐变填充，一次创建减少状态切换
      const gradient = ctx.createRadialGradient(18, 18, 2, 22.5, 22.5, 22.5);
      
      // 根据金币面值使用不同颜色
      let colorMain, colorEdge, textColor;
      
      switch(value) {
        case 1:
          colorMain = '#FFD700'; // 金色
          colorEdge = '#DAA520'; // 暗金色
          textColor = '#8B4513'; // 深褐色
          break;
        case 5:
          colorMain = '#C0C0C0'; // 银色
          colorEdge = '#A9A9A9'; // 深银色
          textColor = '#2F4F4F'; // 深青色
          break;
        case 10:
          colorMain = '#CD7F32'; // 铜色
          colorEdge = '#8B4513'; // 棕色
          textColor = '#FFFFFF'; // 白色
          break;
        case 25:
          colorMain = '#4682B4'; // 钢蓝色
          colorEdge = '#191970'; // 深蓝色
          textColor = '#FFFFFF'; // 白色
          break;
        case 50:
          colorMain = '#9932CC'; // 紫色
          colorEdge = '#4B0082'; // 靛蓝色
          textColor = '#FFFFFF'; // 白色
          break;
        default:
          colorMain = '#FFD700'; // 默认金色
          colorEdge = '#DAA520'; // 默认暗金色
          textColor = '#8B4513'; // 默认深褐色
      }
      
      gradient.addColorStop(0, colorMain);
      gradient.addColorStop(0.8, colorMain);
      gradient.addColorStop(1, colorEdge);
      
      // 一次性填充，减少绘制操作
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // 添加边框 - 只绘制一次
      ctx.strokeStyle = colorEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // 添加金额文字 - 只设置一次字体
      ctx.fillStyle = textColor;
      ctx.font = 'bold 17px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, 22.5, 22.5);
      
      // 恢复上下文
      ctx.restore();
      
      return canvas.toDataURL();
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

    // 辅助方法：移除金币 - 提取为单独方法以减少代码重复
    removeCoin(coin, index) {
      // 不再在这里添加金额到总额，而是在checkCoinsPassedPlate中处理
      
      // 从数组中移除 - 使用提供的索引或查找索引
      const coinIndex = index !== undefined ? index : this.coins.indexOf(coin);
      if (coinIndex !== -1) {
        this.coins.splice(coinIndex, 1);
      }
      
      // 性能优化：移除任何附加的引用
      if (coin.plugin) {
        // 清除插件数据，避免内存泄漏
        coin.plugin = {};
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
                y: 0.001 // 使用固定力值，不受金币数量影响
              });
              
              // 更新金币位置，跟随平台移动
              this.Body.setPosition(coin, {
                x: coin.position.x,
                y: coin.position.y + 0.9 // 使用固定移动距离，不受金币数量影响
              });
              
              // 标记金币被平台影响
            coin.plugin = coin.plugin || {};
              coin.plugin.affectedByPlatform = true;
            }
          });
          
        } else if (deltaY < 0) { // 平台向上移动
          // 平台向上移动时，不推动金币，只让金币自然下落
          // 定义平台下方的检测区域
          const region = {
            min: { x: platformBounds.min.x - 5, y: platformBounds.max.y },
            max: { x: platformBounds.max.x + 5, y: platformBounds.max.y + 20 }
          };
          
          // 使用所有金币进行区域查询
          this.coins.forEach(coin => {
            // 检查金币是否在平台下方区域
            if (coin.position.x >= region.min.x && 
                coin.position.x <= region.max.x && 
                coin.position.y >= region.min.y && 
                coin.position.y <= region.max.y) {
              
              // 给金币一个向下的推力，防止金币被平台卡住
            this.Body.applyForce(coin, coin.position, {
              x: 0,
                y: 0.0005 // 使用较小的固定力值，防止金币被卡住
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
              // 只在平台向下移动时应用推力
              if (platform.customData.direction > 0) {
                // 弱推力效果 - 使用固定力值
            this.Body.applyForce(coin, coin.position, {
              x: 0,
                  y: 0.0005 // 使用固定力值，不受金币数量影响
                });
                
                // 弱位置调整
                this.Body.setPosition(coin, {
                  x: coin.position.x,
                  y: coin.position.y + 0.3 // 使用固定移动距离，不受金币数量影响
                });
              }
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
    // 添加新方法：根据金币位置动态调整摩擦力
    adjustCoinFriction() {
      // 获取底部摩擦板的位置
      const bottomFrictionPlate = this.movableObstacle.body;
      if (!bottomFrictionPlate) return;
      
      const plateBounds = bottomFrictionPlate.bounds;
      const plateTopY = plateBounds.min.y;
      
      // 遍历所有金币
      this.coins.forEach(coin => {
        // 计算金币到摩擦板的距离
        const distToPlate = coin.position.y - plateTopY;
        
        // 如果金币在摩擦板附近
        if (distToPlate > -30 && distToPlate < 100) {
          // 根据距离计算摩擦力系数 - 越接近摩擦板，摩擦力越小
          // 使用非线性函数使变化更自然
          const frictionFactor = Math.max(0.1, Math.min(1.5, 1.5 - (distToPlate / 100)));
          
          // 计算质量系数 - 越接近摩擦板，质量越小（更容易被推动）
          const massReductionFactor = Math.max(0.2, Math.min(1.0, 1.0 - (100 - distToPlate) / 130));
          
          // 计算弹性系数 - 越接近摩擦板，弹性越小
          const restitutionFactor = Math.max(0.01, Math.min(0.05, 0.01 + distToPlate / 2000));
          
          // 检查金币是否受到较大压力
          const isUnderPressure = this.checkCoinPressure(coin);
          
          // 如果金币受到较大压力且非常接近摩擦板，应用特殊处理
          if (isUnderPressure && distToPlate < 20) {
            // 应用重力效果，移除摩擦力，允许金币掉下去
            this.Body.set(coin, {
              friction: 0.01, // 几乎无摩擦力
              frictionAir: 0.01, // 几乎无空气摩擦力
              frictionStatic: 0.01, // 几乎无静摩擦力
              restitution: 0.01, // 保持低弹性
              mass: 0.1, // 恢复正常质量
              inverseInertia: 0, // 恢复正常惯性
              slop: 0.05, // 恢复正常重叠量
              timeScale: 1.0 // 恢复正常时间缩放
            });
            
            // 标记金币处于压力状态
            coin.plugin = coin.plugin || {};
            coin.plugin.underPressure = true;
            coin.plugin.pressureStartTime = Date.now();
            
            // 应用向下的力，模拟重力
            this.Body.applyForce(coin, coin.position, {
              x: 0,
              y: 0.002 // 向下的力，模拟重力
            });
            
            // 如果金币非常接近摩擦板，允许它穿过摩擦板
            if (distToPlate < 5) {
              // 设置碰撞过滤器，允许穿过摩擦板
              coin.collisionFilter = {
                category: 0x0001,
                mask: 0x0001 // 只与金币碰撞，不与摩擦板碰撞
              };
              
              // 标记金币可以穿过摩擦板
              coin.plugin.canPassThroughPlate = true;
            }
          } else {
            // 应用动态特性
            this.Body.set(coin, {
              friction: frictionFactor,
              frictionAir: 0.5 * frictionFactor,
              frictionStatic: 1.5 * frictionFactor,
              restitution: restitutionFactor, // 动态弹性，但始终很小
              mass: 0.1 * massReductionFactor, // 降低质量使其更容易被推动
              inverseInertia: 0.1 / massReductionFactor // 增加响应性
            });
            
            // 标记金币被调整过摩擦力
            coin.plugin = coin.plugin || {};
            coin.plugin.frictionAdjusted = true;
            
            // 非常接近摩擦板时，优化碰撞性能
            if (distToPlate < 20) {
              this.Body.set(coin, {
                slop: 0.1, // 增加允许重叠量
                timeScale: 1.2 // 略微加快这些金币的物理计算
              });
            }
          }
        } else if (coin.plugin && coin.plugin.frictionAdjusted) {
          // 如果金币离开摩擦板区域，恢复默认摩擦力和质量
          this.Body.set(coin, {
            friction: 1.5,
            frictionAir: 0.5,
            frictionStatic: 1.5,
            restitution: 0.01, // 确保所有金币的弹性都很小
            mass: 0.1, // 恢复默认质量
            inverseInertia: 0, // 恢复默认惯性逆值
            slop: 0.05, // 恢复默认允许重叠量
            timeScale: 1.0 // 恢复默认时间缩放
          });
          
          // 移除标记
          delete coin.plugin.frictionAdjusted;
        }
        
        // 检查金币是否已经穿过摩擦板
        if (coin.plugin && coin.plugin.canPassThroughPlate && coin.position.y > plateTopY + 30) {
          // 恢复正常的碰撞过滤器
          coin.collisionFilter = {
            category: 0x0001,
            mask: 0xFFFFFFFF // 恢复与所有物体的碰撞
          };
          
          // 移除标记
          delete coin.plugin.canPassThroughPlate;
        }
        
        // 检查金币是否处于压力状态但已经离开摩擦板区域
        if (coin.plugin && coin.plugin.underPressure && distToPlate > 30) {
          // 移除压力状态标记
          delete coin.plugin.underPressure;
          delete coin.plugin.pressureStartTime;
        }
      });
    },
    
    // 添加新方法：检查金币是否受到较大压力
    checkCoinPressure(coin) {
      // 如果金币已经有压力标记，检查是否已经持续足够长时间
      if (coin.plugin && coin.plugin.underPressure) {
        const pressureDuration = Date.now() - coin.plugin.pressureStartTime;
        // 如果压力状态持续超过500毫秒，保持压力状态
        if (pressureDuration > 500) {
          return true;
        }
      }
      
      // 检查金币的速度和加速度
      const speed = Math.sqrt(coin.velocity.x * coin.velocity.x + coin.velocity.y * coin.velocity.y);
      const acceleration = Math.sqrt(coin.force.x * coin.force.x + coin.force.y * coin.force.y);
      
      // 如果速度或加速度超过阈值，认为金币受到较大压力
      if (speed > 3 || acceleration > 0.01) {
        return true;
      }
      
      // 检查金币是否被其他金币挤压
      let contactCount = 0;
      let hasTopCoin = false; // 检查是否有金币在顶部
      
      this.coins.forEach(otherCoin => {
        if (otherCoin !== coin) {
          // 计算两个金币之间的距离
          const dx = coin.position.x - otherCoin.position.x;
          const dy = coin.position.y - otherCoin.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // 如果距离小于金币直径的1.2倍，认为有接触
          if (distance < 45) {
            contactCount++;
            
            // 检查是否有金币在顶部（Y坐标更小）
            if (otherCoin.position.y < coin.position.y - 15) {
              hasTopCoin = true;
            }
          }
        }
      });
      
      // 如果金币与3个或更多其他金币接触，或者有金币在顶部，认为受到较大压力
      return contactCount >= 3 || hasTopCoin;
    },
    
    // 优化方法：合并多个金币检查到一个遍历中
    checkAllCoins() {
      // 获取底部摩擦板的位置
      const bottomFrictionPlate = this.movableObstacle.body;
      if (!bottomFrictionPlate) return;
      
      const plateBounds = bottomFrictionPlate.bounds;
      const plateTopY = plateBounds.min.y;
      
      // 批量处理：一次计算，多次使用
      const coinData = this.coins.map(coin => {
        return {
          coin,
          distToPlate: coin.position.y - plateTopY,
          position: { ...coin.position }, // 创建位置的副本
          removed: false
        };
      });
      
      // 批量处理: 检查压力状态
      const pressureMap = {};
      coinData.forEach(data => {
        if (!data.removed) {
          pressureMap[data.coin.id] = this.checkCoinPressure(data.coin);
        }
      });
      
      // 先处理穿过摩擦板的金币（从后向前处理，避免索引问题）
      for (let i = this.coins.length - 1; i >= 0; i--) {
        const coin = this.coins[i];
        const data = coinData.find(d => d.coin === coin);
        if (!data) continue;
        
        // 检查金币是否已经穿过摩擦板
        if (data.coin.position.y > plateTopY + 30) {
          // 记录金额并添加到总额
      if (data.coin.value) {
        this.totalValue += data.coin.value;
      }
      
          // 标记此金币已被移除
          data.removed = true;
          
          // 移除金币
          this.removeCoin(data.coin, i);
        }
      }
      
      // 处理其他金币特性（仅处理未移除的金币）
      coinData.forEach(data => {
        if (data.removed) return;
        
        const coin = data.coin;
        const distToPlate = data.distToPlate;
        const isUnderPressure = pressureMap[coin.id];
        
        // 应用压力传递和摩擦力调整
        this.applyPressureAndFriction(coin, distToPlate, isUnderPressure, coinData);
      });
    },
    
    // 新增：将压力传递和摩擦力调整抽取为单独函数
    applyPressureAndFriction(coin, distToPlate, isUnderPressure, coinData) {
      // 如果金币在摩擦板附近且受到较大压力
      if (distToPlate > -10 && distToPlate < 30 && isUnderPressure) {
        // 应用向下的力，模拟重力
        this.Body.applyForce(coin, coin.position, {
          x: 0,
          y: 0.002 // 向下的力
        });
        
        // 允许金币穿过摩擦板
        if (distToPlate < 5) {
          coin.collisionFilter = {
            category: 0x0001,
            mask: 0x0001
          };
          
          coin.plugin = coin.plugin || {};
          coin.plugin.canPassThroughPlate = true;
        }
      }
      
      // 动态调整金币摩擦力
      if (distToPlate > -30 && distToPlate < 100) {
        // 计算摩擦力系数
        const frictionFactor = Math.max(0.1, Math.min(1.5, 1.5 - (distToPlate / 100)));
        const massReductionFactor = Math.max(0.2, Math.min(1.0, 1.0 - (100 - distToPlate) / 130));
        const restitutionFactor = Math.max(0.01, Math.min(0.05, 0.01 + distToPlate / 2000));
        
        // 批量设置属性，减少 Body.set 调用次数
        const properties = {
          friction: frictionFactor,
          frictionAir: 0.5 * frictionFactor,
          frictionStatic: 1.5 * frictionFactor,
          restitution: restitutionFactor
        };
        
        // 添加特殊处理
        if (isUnderPressure && distToPlate < 20) {
          // 压力状态的属性
          Object.assign(properties, {
            friction: 0.01,
            frictionAir: 0.01,
            frictionStatic: 0.01,
            mass: 0.1
          });
          
          // 标记压力状态
          coin.plugin = coin.plugin || {};
          coin.plugin.underPressure = true;
          coin.plugin.pressureStartTime = Date.now();
          
          // 应用额外向下力
          this.Body.applyForce(coin, coin.position, {
            x: 0,
            y: 0.002
          });
        } else {
          // 正常状态的额外属性
          Object.assign(properties, {
            mass: 0.1 * massReductionFactor,
            inverseInertia: 0.1 / massReductionFactor
          });
          
          // 标记为已调整摩擦力
          coin.plugin = coin.plugin || {};
          coin.plugin.frictionAdjusted = true;
        }
        
        // 一次性设置所有属性，减少 API 调用
        this.Body.set(coin, properties);
      }
      
      // 增强金币之间的压力传递
      if (isUnderPressure) {
        // 使用已计算的 coinData 查找下方的金币，避免重新计算位置
        const bottomCoins = coinData
          .filter(data => 
            data.coin !== coin && 
            !data.removed &&
            data.position.y > coin.position.y + 15 && 
            Math.abs(data.position.x - coin.position.x) < 45
          )
          .map(data => data.coin);
        
        // 批量处理下方金币
        if (bottomCoins.length > 0) {
          bottomCoins.forEach(bottomCoin => {
            const distY = bottomCoin.position.y - coin.position.y;
            const pressureFactor = Math.max(0.1, Math.min(1.0, 1.0 - distY / 100));
            
            // 应用向下力
            this.Body.applyForce(bottomCoin, bottomCoin.position, {
              x: 0,
              y: 0.001 * pressureFactor
            });
            
            // 设置摩擦力
            this.Body.set(bottomCoin, {
              friction: Math.max(0.1, bottomCoin.friction * 0.8),
              frictionAir: Math.max(0.1, bottomCoin.frictionAir * 0.8),
              frictionStatic: Math.max(0.1, bottomCoin.frictionStatic * 0.8)
            });
            
            // 标记压力传递
            bottomCoin.plugin = bottomCoin.plugin || {};
            bottomCoin.plugin.pressureTransferred = true;
            bottomCoin.plugin.pressureSource = coin.id;
          });
        }
      }
    },
    // 新增：执行内存清理，防止内存泄漏
    performMemoryCleanup() {
      // 如果游戏中有超过100个金币，强制移除一些最老的金币
      if (this.coins.length > 100) {
        // 移除超过100个的最早添加的金币
        const coinsToRemove = this.coins.length - 100;
        for (let i = 0; i < coinsToRemove; i++) {
          // 不计入总额，这些是系统自动清理的
          const coin = this.coins[0]; // 最早添加的金币
          this.World.remove(this.engine.world, coin);
          this.coins.shift();
        }
      }
      
      // 检查并清理无效的物理对象
      for (let i = this.coins.length - 1; i >= 0; i--) {
        const coin = this.coins[i];
        // 检查金币是否有效
        if (!coin || !coin.position || typeof coin.position.x !== 'number') {
          this.coins.splice(i, 1);
        }
      }
    },
    
    // 新增：根据设备像素比调整渲染
    adjustPixelRatio() {
      // 获取当前设备像素比
      const pixelRatio = window.devicePixelRatio || 1;
      
      // 更新渲染器的像素比
      if (this.render && this.render.options) {
        this.render.options.pixelRatio = pixelRatio;
        
        // 重新设置画布尺寸
        this.render.canvas.width = 400 * pixelRatio;
        this.render.canvas.height = 400 * pixelRatio;
        
        // 使用CSS缩放回原始尺寸
        this.render.canvas.style.width = '400px';
        this.render.canvas.style.height = '400px';
        
        // 强制重新渲染
        this.Render.setPixelRatio(this.render, pixelRatio);
      }
    },
    // 优化纹理预缓存，减少运行时绘制开销
    precacheTextures() {
      const coinValues = [1, 5, 10, 25, 50]; // 金币面值
      
      // 预先创建所有金币纹理并缓存
      coinValues.forEach(value => {
        this.offscreenCoinTextures[value] = this.createCoinTexture(value);
      });
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

.buttons-container {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
  max-width: 500px;
}

.drop-button {
  padding: 10px 20px;
  font-size: 16px;
  background: linear-gradient(45deg, #4CAF50, #8BC34A);
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  transition: all 0.3s ease;
  flex: 1;
  min-width: 100px;
  text-align: center;
}

.drop-button:nth-child(1) {
  background: linear-gradient(45deg, #2196F3, #03A9F4);
}

.drop-button:nth-child(2) {
  background: linear-gradient(45deg, #9C27B0, #673AB7);
}

.drop-button:nth-child(3) {
  background: linear-gradient(45deg, #FF9800, #FF5722);
}

.drop-button:nth-child(4) {
  background: linear-gradient(45deg, #E91E63, #F44336);
}

.drop-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 8px rgba(0,0,0,0.15);
  filter: brightness(1.1);
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
  height: 400px;
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
