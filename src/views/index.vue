<template>
  <div class="coin-container">
    <div class="total-value">当前总额: {{ totalValue }}元</div>
    <div class="buttons-container">
      <button @click="DropCoins(3)" class="drop-button">掉落5枚</button>
      <button @click="DropCoins(5)" class="drop-button" :disabled="coins.length >= 50">掉落10枚</button>
      <button @click="DropCoins(10)" class="drop-button" :disabled="coins.length >= 35">掉落15枚</button>
      <button @click="DropCoins(20)" class="drop-button" :disabled="coins.length >= 26">掉落25枚</button>
    </div>
    <div class="game-area">
      <div ref="coinBox" class="coin-box">
      </div>
      <div class="coin-box-bottom"></div>
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
      offscreenCoinTextures: {},
      MAX_COINS: 40,  // 最大金币数量
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
          background: 'transparent', // 透明背景
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
        this.Bodies.rectangle(200, 400, 240, 20, {
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
        
        // 上宽下窄的等腰形边界 - 左侧斜边
        this.Bodies.fromVertices(0, 130, [
          { x: 10, y: 0 },     // 左上
          { x: 84, y: 0 },    // 左上宽边
          { x: 36, y: 400 }   // 左下窄边
        ], {
          isStatic: true,
          render: {
            fillStyle: '#6d4c41',
            visible: true
          }
        }),
        
        // 上宽下窄的等腰形边界 - 右侧斜边
        this.Bodies.fromVertices(400, 130, [
          { x: 320, y: 0 },    // 右上宽边
          { x: 400, y: 0 },    // 右上
          { x: 360, y: 400 }   // 右下窄边
        ], {
          isStatic: true,
          render: {
            fillStyle: '#6d4c41',
            visible: true
          }
        }),
        
        // 掉落区域上方的长条障碍物 - 现在作为可移动底板
        this.Bodies.rectangle(200, this.dropArea.y, 400 * 0.8, 10, {
          isStatic: true,
          chamfer: { radius: 2 }, // 轻微圆角
          render: {
            fillStyle: 'rgba(156, 39, 176, 1)', // 使用原底板的颜色但更明显
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
      
      // 更新金币投放区域
      this.dropArea = {
        minX: 80,   // 左边界
        maxX: 320,  // 右边界
        y: 30,      // 掉落高度
        width: 240  // 掉落宽度
      };
      
      // 创建固定在底部的高摩擦力条
      const movableObstacle = this.Bodies.rectangle(
        200, // 中心x坐标
        350, // 底部位置，接近游戏区域底部
        396, // 宽度适应新的等腰形（下窄）
        this.movableObstacle.height,
        {
          isStatic: true,        // 设为静态，不可移动
          friction: 2,           // 增加最大摩擦力
          frictionStatic: 10,    // 极大的静态摩擦力
          frictionAir: 1,        // 最大空气摩擦力
          restitution: 0,        // 无弹性
          render: {
            fillStyle: '#FF5722', // 橙红色，更醒目
            visible: false
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
      const frictionZone = this.Bodies.trapezoid(
        200, // 中心x坐标
        (350 + this.dropArea.y) / 2, // 中心y坐标 (movableObstacle和顶部障碍物的中点)
        400, // 顶部宽度
        350 - this.dropArea.y, // 高度，从顶部障碍物到movableObstacle的距离
        0.18, // 负斜度，使其下宽上窄
        {
          isStatic: true,        // 设为静态，不可移动
          isSensor: true,        // 设为传感器，不会产生物理碰撞
          render: {
            fillStyle: 'rgba(255, 255, 0, 0.1)', // 半透明黄色，便于调试
            visible: false       // 设为可见
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
        
        // 更新正在掉落的金币动画
        this.updateDroppingCoins();
        
        // 更新金币穿过摩擦力板的状态
        this.updateCoinPassThroughStatus();
        
        // 根据金币总数动态调整摩擦力板效果
        this.adjustCoinPassThroughRate();
        
        // 性能优化：分散高消耗操作
        if (timestamp % 2 === 0) { // 每2帧执行一次
          // 使用合并优化后的方法检查所有金币
          this.checkAllCoins();
        }
        
        // 降低堆叠检测频率，每10帧检查一次
        if (timestamp % 10 === 0) {
          this.checkCoinStacking();
          
          // 限制总金币数量，防止过多卡死
          this.enforceCoinLimit();
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
        
        // 更新正在执行移除动画的金币
        this.updateRemovalAnimations();
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
        // 统一设置金币的尺寸
        coin.render.sprite.xScale = 1.5;
        coin.render.sprite.yScale = 1.5;
        // 确保金币不透明
        coin.render.opacity = 1;
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

      // 确保渲染属性被正确重置
      if (coin.render && coin.render.sprite) {
        // 重置缩放和透明度，确保返回池中的金币属性正确
        coin.render.opacity = 1;
        coin.render.sprite.xScale = 1.5;
        coin.render.sprite.yScale = 1.5;
        if (coin.render.sprite.tint) {
          delete coin.render.sprite.tint;
        }
      }
      
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
      
      const coinValues = [1, 5, 10, 25, 50]; // 金币面值

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
        // 获取可移动底板的实时位置，确保金币在移动条下方
        let dropY = this.dropArea.y; // 默认位置
        if (this.platformMotion.platform) {
          // 确保金币从移动条下方掉落，留出足够空间
          dropY = this.platformMotion.platform.bounds.max.y + 23; // 金币半径+一点空间
        }
        
        // 开始高于实际掉落位置，以便有掉落动画
        const startY = dropY - 80; // 开始位置高80像素，便于动画
        
        // 创建位置、角度和速度，增加随机性避免堆叠
        const position = {
          x: this.getRandomInt(this.dropArea.minX, this.dropArea.maxX),
          y: startY // 从高处开始掉落
        };
        const angle = Math.random() * Math.PI * 2;
        // 初始速度设为0，会在动画中逐渐增加
        const velocity = {
          x: 0,
          y: 0
        };
        
        const targetY = dropY + this.getRandomInt(-2, 2); // 最终目标位置
        coinDataList.push({ value, position, angle, velocity, targetY });
      }
      
      // 使用递归函数处理金币掉落
      const dropCoin = (index) => {
        if (index >= coinDataList.length) return;
        
        const data = coinDataList[index];
        let coin = this.getCoinFromPool(data.value);
        
        // 固定的金币物理半径
        const coinRadius = 22.5;
        
        if (coin) {
          // 重用对象池中的金币
          this.Body.setPosition(coin, data.position);
          this.Body.setAngle(coin, data.angle);
          this.Body.set(coin, {
            restitution: 0.3, // 增加弹性，使碰撞更明显
            friction: 1.0,    // 降低摩擦力，使滑动更自然
            frictionAir: 0.05, // 降低空气阻力，使下落更快
            frictionStatic: 0.8, // 降低静摩擦力
            density: 0.3,     // 增加密度，使冲击力更强
            plugin: {
              isDropping: true, // 标记为正在掉落
              dropStartTime: Date.now(),
              targetY: data.targetY
            }
          });
          
          // 存储半径信息
          coin.circleRadius = coinRadius;
          
          // 确保重用金币的渲染属性正确
          if (coin.render && coin.render.sprite) {
            coin.render.opacity = 1;
            coin.render.visible = true;
            coin.render.sprite.xScale = 1.5;
            coin.render.sprite.yScale = 1.5;
            coin.render.sprite.texture = this.offscreenCoinTextures[data.value];
          }
        } else {
          // 创建新的金币 - 使用预缓存的纹理
          coin = this.Bodies.circle(data.position.x, data.position.y, coinRadius, {
            angle: data.angle,
            restitution: 0.3, // 增加弹性，使碰撞更明显
            friction: 1.0,    // 降低摩擦力，使滑动更自然
            frictionAir: 0.05, // 降低空气阻力，使下落更快
            frictionStatic: 0.8, // 降低静摩擦力
            density: 0.3,     // 增加密度，使冲击力更强
            chamfer: { radius: 2 },
            mass: 0.3, // 增加质量，使冲击力更强
            inertia: Infinity,
            inverseInertia: 0,
            render: {
              visible: true,
              opacity: 1,
              sprite: {
                // 使用预缓存的纹理
                texture: this.offscreenCoinTextures[data.value],
                xScale: 1.5,
                yScale: 1.5
              }
            },
            slop: 0.05,
            value: data.value,
            plugin: {
              isCoin: true, // 标记为金币，便于碰撞检测
              isDropping: true, // 标记为正在掉落
              dropStartTime: Date.now(),
              targetY: data.targetY
            }
          });
          
          // 存储半径信息
          coin.circleRadius = coinRadius;
        }
        
        // 设置初始速度和角速度 - 起始为0
        this.Body.setVelocity(coin, { x: 0, y: 0 });
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
    
    // 新增：应用金币掉落动画
    updateDroppingCoins() {
      if (this.coins.length === 0) return;
      
      const now = Date.now();
      const droppingCoins = this.coins.filter(coin => coin.plugin && coin.plugin.isDropping);
      
      droppingCoins.forEach(coin => {
        const dropDuration = 500; // 掉落动画持续500毫秒
        const elapsedTime = now - coin.plugin.dropStartTime;
        
        if (elapsedTime >= dropDuration) {
          // 动画完成，移除掉落标记
          delete coin.plugin.isDropping;
          delete coin.plugin.dropStartTime;
          
          // 应用最终速度和冲击力
          const impactVelocity = {
            x: (Math.random() - 0.5) * 5, // 随机横向速度
            y: 5 + Math.random() * 3 // 较大的向下速度
          };
          this.Body.setVelocity(coin, impactVelocity);
          
          // 添加旋转
          this.Body.setAngularVelocity(coin, (Math.random() - 0.5) * 0.2);
          
          // 应用冲击力到周围的金币
          this.applyImpactForce(coin);
          
          return;
        }
        
        // 计算动画进度 (0-1)
        const progress = Math.min(1, elapsedTime / dropDuration);
        
        // 使用缓动函数使动画更自然
        const easedProgress = this.easeInOutCubic(progress);
        
        // 计算当前位置 - 从开始位置到目标位置的平滑过渡
        const currentY = coin.position.y + (coin.plugin.targetY - coin.position.y) * easedProgress;
        
        // 更新位置
        this.Body.setPosition(coin, {
          x: coin.position.x,
          y: currentY
        });
        
        // 根据进度增加下落速度
        const currentVelocity = {
          x: (Math.random() - 0.5) * progress * 2, // 随机横向速度，逐渐增加
          y: progress * 3 // 下落速度，逐渐增加
        };
        this.Body.setVelocity(coin, currentVelocity);
        
        // 添加微小旋转，随进度增加
        this.Body.setAngularVelocity(coin, (Math.random() - 0.5) * 0.05 * progress);
      });
    },
    
    // 辅助方法：缓动函数，使动画更自然
    easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    
    // 新增：应用冲击力到周围的金币
    applyImpactForce(impactCoin) {
      // 冲击力参数
      const impactRadius = 70;  // 冲击力作用半径
      const baseImpactForce = 0.03;  // 基础冲击力大小
      
      // 遍历所有金币，找出在冲击半径内的金币
      this.coins.forEach(targetCoin => {
        // 排除自身和正在掉落的金币
        if (targetCoin === impactCoin || (targetCoin.plugin && targetCoin.plugin.isDropping)) return;
        
        // 计算与冲击金币的距离
        const dx = targetCoin.position.x - impactCoin.position.x;
        const dy = targetCoin.position.y - impactCoin.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 如果在冲击半径内，应用冲击力
        if (distance < impactRadius) {
          // 冲击力随距离减小
          const forceMagnitude = baseImpactForce * (1 - distance / impactRadius);
          
          // 计算力的方向
          const normalizedDx = dx / distance || 0;  // 防止除以零
          const normalizedDy = dy / distance || 0;
          
          // 对目标金币施加冲击力 - 主要为向下和较小的横向力
          this.Body.applyForce(targetCoin, targetCoin.position, {
            x: normalizedDx * forceMagnitude * 0.5, // 横向力较小
            y: Math.max(0, normalizedDy) * forceMagnitude * 1.5 + 0.01 // 确保有向下分量
          });
          
          // 直接增加目标金币的速度
          const currentVelocity = targetCoin.velocity;
          const newVelocity = {
            x: currentVelocity.x + normalizedDx * forceMagnitude * 10,
            y: currentVelocity.y + Math.max(0, normalizedDy) * forceMagnitude * 15 + 0.5
          };
          this.Body.setVelocity(targetCoin, newVelocity);
          
          // 添加旋转
          this.Body.setAngularVelocity(targetCoin, targetCoin.angularVelocity + (Math.random() - 0.5) * 0.1);
          
          // 标记为受到冲击
          targetCoin.plugin = targetCoin.plugin || {};
          targetCoin.plugin.impacted = true;
          
          // 降低受冲击金币的摩擦力，使其更容易移动
          this.Body.set(targetCoin, {
            friction: 0.5,           // 降低摩擦力
            frictionAir: 0.2,        // 降低空气阻力
            frictionStatic: 0.5      // 降低静摩擦力
          });
          
          // 1秒后恢复正常摩擦力
      setTimeout(() => {
            if (targetCoin && targetCoin.plugin) {
              this.Body.set(targetCoin, {
                friction: 1.5,
                frictionAir: 0.5,
                frictionStatic: 1.5
              });
              delete targetCoin.plugin.impacted;
            }
          }, 1000);
        }
      });
      
      // 播放冲击音效
      this.playCollisionSound();
    },
    
    // 新增：应用排斥力，避免金币堆叠
    applyRepulsionForces(newCoin) {
      // 金币排斥参数
      const repulsionRadius = 50;  // 排斥力作用半径
      const basePushForce = 0.02;  // 基础推力大小
      const velocityScale = 0.8;   // 速度影响系数
      
      // 遍历现有的所有金币
      this.coins.forEach(existingCoin => {
        // 排除自身
        if (existingCoin === newCoin) return;
        
        // 计算两个金币间的距离
        const dx = existingCoin.position.x - newCoin.position.x;
        const dy = existingCoin.position.y - newCoin.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 如果距离小于排斥半径，施加排斥力
        if (distance < repulsionRadius) {
          // 计算排斥力大小（距离越近，力越大）
          const forceMagnitude = basePushForce * (1 - distance / repulsionRadius);
          
          // 计算力的方向
          const normalizedDx = dx / distance || 0;  // 防止除以零
          const normalizedDy = dy / distance || 0;
          
          // 对已存在的金币施加排斥力
          this.Body.applyForce(existingCoin, existingCoin.position, {
            x: normalizedDx * forceMagnitude,
            y: normalizedDy * forceMagnitude
          });
          
          // 给现有金币一个额外的速度推动
          const existingCoinVelocity = {
            x: existingCoin.velocity.x + normalizedDx * forceMagnitude * 100,
            y: existingCoin.velocity.y + normalizedDy * forceMagnitude * 100
          };
          this.Body.setVelocity(existingCoin, existingCoinVelocity);
          
          // 对新金币施加反向力（牛顿第三定律）
          this.Body.applyForce(newCoin, newCoin.position, {
            x: -normalizedDx * forceMagnitude * 0.5,  // 力稍微小一些
            y: -normalizedDy * forceMagnitude * 0.5
          });
          
          // 触发碰撞标记
          newCoin.plugin = newCoin.plugin || {};
          newCoin.plugin.collidedOnSpawn = true;
          
          existingCoin.plugin = existingCoin.plugin || {};
          existingCoin.plugin.recentlyPushed = true;
          
          // 为被推开的金币设置摩擦力临时降低，使其更容易移动
          this.Body.set(existingCoin, {
            friction: 0.3,           // 降低摩擦力
            frictionAir: 0.1,        // 降低空气阻力
            frictionStatic: 0.3      // 降低静摩擦力
          });
          
          // 1秒后恢复正常摩擦力
          setTimeout(() => {
            if (existingCoin && existingCoin.plugin) {
              this.Body.set(existingCoin, {
                friction: 1.5,
                frictionAir: 0.5,
                frictionStatic: 1.5
              });
              delete existingCoin.plugin.recentlyPushed;
            }
          }, 1000);
        }
      });
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
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(22.5, 22.5, 21.5, 0, Math.PI * 2);
      ctx.clip();
      // 使用base64编码的默认金币图片
      const defaultCoinImage = 'data:image/png;base64,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'
      const img = new Image();
      img.src = defaultCoinImage;
      
      return new Promise((resolve) => {
        img.onload = () => {
          // 绘制背景图片
          ctx.drawImage(img, 0, 0, 45, 45);
          
          // 添加金额文字
          ctx.fillStyle = '#8B4513';
          ctx.font = 'bold 17px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(value, 22.5, 22.5);
          
          ctx.restore();
          
          // 缓存并返回纹理
          const texture = canvas.toDataURL();
          if (!this.offscreenCoinTextures) {
            this.offscreenCoinTextures = {};
          }
          this.offscreenCoinTextures[value] = texture;
          resolve(texture);
        };
        
        img.onerror = () => {
          // 如果图片加载失败，使用默认的金币样式
          this.createDefaultCoinTexture(ctx, value);
          const texture = canvas.toDataURL();
          if (!this.offscreenCoinTextures) {
            this.offscreenCoinTextures = {};
          }
          this.offscreenCoinTextures[value] = texture;
          resolve(texture);
        };
      });
    },
    
    // 新增：创建默认金币纹理的方法
    createDefaultCoinTexture(ctx, value) {
      // 使用渐变填充
      const gradient = ctx.createRadialGradient(18, 18, 2, 22.5, 22.5, 22.5);

      // 舍金币默认颜色
      let colorMain = '#FFD700'; // 默认金色
      let colorEdge = '#DAA520'; // 默认暗金色
      let textColor = '#8B4513'; // 默认深褐色
      
      gradient.addColorStop(0, colorMain);
      gradient.addColorStop(0.8, colorMain);
      gradient.addColorStop(1, colorEdge);
      
      // 一次性填充
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // 添加边框
      ctx.strokeStyle = colorEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // 添加金额文字
      ctx.fillStyle = textColor;
      ctx.font = 'bold 17px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, 22.5, 22.5);
      
      // 恢复上下文
      ctx.restore();
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
      
      const platform = this.platformMotion.platform;
      
      // 初始化或获取platform.customData
      if (!platform.customData) {
        platform.customData = {
          direction: 1,
          speed: 0.8,
          lowerBound: this.platformMotion.baseY + this.platformMotion.amplitude,
          upperBound: this.platformMotion.baseY - this.platformMotion.amplitude,
          baseWidth: 400 * 0.8, // 基础宽度
          minWidth: 400 * 0.8,  // 最小宽度（收缩时）
          maxWidth: 400 * 0.85   // 最大宽度（下移时）
        };
      }
      
      // 获取当前位置和方向
      const oldY = platform.position.y;
      const currentDirection = platform.customData.direction;
      const currentSpeed = platform.customData.speed;
      
      // 使用固定速度计算新位置
      let newY = oldY + (currentDirection * currentSpeed);
      
      // 检查是否到达边界点，如果是则改变方向
      let newDirection = currentDirection;
      if (newY >= platform.customData.lowerBound) {
        newY = platform.customData.lowerBound;
        newDirection = -1; // 改变方向向上
      } else if (newY <= platform.customData.upperBound) {
        newY = platform.customData.upperBound;
        newDirection = 1; // 改变方向向下
      }
      
      // 计算当前位置相对于移动范围的比例
      const moveRange = platform.customData.lowerBound - platform.customData.upperBound;
      const currentPosition = newY - platform.customData.upperBound;
      const positionRatio = currentPosition / moveRange;
      
      // 根据位置计算当前宽度
      const widthRange = platform.customData.maxWidth - platform.customData.minWidth;
      const currentWidth = platform.customData.minWidth + (widthRange * positionRatio);
      
      // 保存当前的customData
      const customData = {
        ...platform.customData,
        direction: newDirection
      };
      
      // 创建新的推板
      const newPlatform = this.Bodies.rectangle(
        200, // x位置保持不变
        newY, // 新的y位置
        currentWidth, // 当前计算出的宽度
        10, // 高度保持不变
        {
          isStatic: true,
          chamfer: { radius: 2 },
          render: {
            fillStyle: 'rgba(156, 39, 176, 0.8)',
            visible: true
          },
          friction: 0.3,
          frictionStatic: 0.5,
          restitution: 0.2,
          slop: 0.05,
          plugin: {
            isMovablePlatform: true
          }
        }
      );
      
      // 设置新推板的customData
      newPlatform.customData = customData;
      
      // 从世界中移除旧推板
      this.World.remove(this.engine.world, platform);
      
      // 添加新推板到世界
      this.World.add(this.engine.world, newPlatform);
      
      // 更新推板引用
      this.platformMotion.platform = newPlatform;
      
      // 检查推板是否在收缩（向上移动）
      if (newDirection < 0) {
        // 查找推板上的金币
        this.coins.forEach(coin => {
          const platformBounds = newPlatform.bounds;
          // 检查金币是否在推板范围内
          if (coin.position.x >= platformBounds.min.x && 
              coin.position.x <= platformBounds.max.x && 
              coin.position.y >= platformBounds.min.y && 
              coin.position.y <= platformBounds.max.y) {
            
            // 如果金币在推板上，应用向下的力和速度
            this.Body.applyForce(coin, coin.position, {
              x: 0,
              y: 0.01 // 向下的力
            });
            
            // 设置向下的速度
            this.Body.setVelocity(coin, {
              x: coin.velocity.x,
              y: 2 + Math.random() // 随机速度，确保金币能掉落
            });
            
            // 添加一些随机旋转
            this.Body.setAngularVelocity(coin, (Math.random() - 0.5) * 0.2);
            
            // 标记金币刚刚离开推板
            coin.plugin = coin.plugin || {};
            coin.plugin.justLeftPlatform = true;
            
            // 1秒后清除标记
            setTimeout(() => {
              if (coin.plugin) {
                delete coin.plugin.justLeftPlatform;
              }
            }, 1000);
          }
        });
      }
    },
    
    // 添加新方法：检查金币是否受到较大压力
    checkCoinPressure(coin) {
      // 如果金币已经有压力标记，检查是否已经持续足够长时间
      if (coin.plugin && coin.plugin.underPressure) {
        const pressureDuration = Date.now() - coin.plugin.pressureStartTime;
        // 降低持续时间要求，使金币更快进入压力状态
        if (pressureDuration > 300) { // 从500降低到300毫秒
          return true;
        }
      }
      
      // 检查金币的速度和加速度 - 降低阈值
      const speed = Math.sqrt(coin.velocity.x * coin.velocity.x + coin.velocity.y * coin.velocity.y);
      const acceleration = Math.sqrt(coin.force.x * coin.force.x + coin.force.y * coin.force.y);
      
      // 降低速度和加速度阈值
      if (speed > 2 || acceleration > 0.008) { // 从3和0.01降低
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
      
      // 降低接触数量要求 - 从3个降低到2个
      return contactCount >= 2 || hasTopCoin;
    },
    
    // 优化方法：合并多个金币检查到一个遍历中
    checkAllCoins() {
      const plateTopY = this.plateTopY;
      const plateBottomY = this.plateBottomY;
      
      // 检查金币数量是否超过限制
      const isOverLimit = this.coins.length > this.MAX_COINS;
      
      // 如果超过限制，计算需要调整的金币数量
      const excessCoins = isOverLimit ? this.coins.length - this.MAX_COINS : 0;
      
      // 计算摩擦力调整系数（金币越多，摩擦力越小）
      const frictionFactor = isOverLimit ? Math.max(0.1, 1 - (excessCoins * 0.02)) : 1;
      
      // 批量处理金币
      for (let i = this.coins.length - 1; i >= 0; i--) {
            const coin = this.coins[i];
        
        // 检查金币是否超出边界
        if (coin.position.y > plateBottomY + 50) {
          this.removeCoin(coin);
          continue;
        }
        
        // 如果金币数量超过限制，调整金币的物理属性
        if (isOverLimit) {
          // 调整摩擦力
          coin.friction = 0.1 * frictionFactor;
          coin.frictionAir = 0.01 * frictionFactor;
          
          // 如果金币在摩擦板上方，增加向下的力
          if (coin.position.y < plateTopY) {
            this.Body.applyForce(coin, coin.position, {
              x: 0,
              y: 0.001 * excessCoins // 金币越多，向下的力越大
            });
          }
        }
        
        // 原有的压力检测逻辑
        if (coin.plugin && coin.plugin.underPressure) {
          // 如果金币受到压力，减少摩擦力
          coin.friction = 0.1;
          coin.frictionAir = 0.01;
          
          // 如果金币在摩擦板上方，增加向下的力
          if (coin.position.y < plateTopY) {
            this.Body.applyForce(coin, coin.position, {
              x: 0,
              y: 0.001
            });
          }
        }
      }
    },
    
    // 集成了摩擦力调整和压力传递的方法
    processCoinsPhysics(coin, distToPlate, isUnderPressure, coinData) {
      // 1. 摩擦力调整 - 整合了原adjustCoinFriction的逻辑
      
      // 如果金币在摩擦板附近且受到较大压力，帮助其穿过摩擦板
      if (distToPlate > -10 && distToPlate < 30 && isUnderPressure) {
        // 增强向下力，使金币更容易穿过摩擦板
        this.Body.applyForce(coin, coin.position, {
          x: 0,
          y: 0.01 // 更大的向下力，确保能穿过
        });
        
        // 降低阈值，使金币更容易进入穿透模式
        if (distToPlate < 15) { // 检测范围15像素
          // 设置特殊碰撞过滤器，允许穿过摩擦板
          coin.collisionFilter = {
            category: 0x0001,
            mask: 0x0001 // 只与金币碰撞，不与摩擦板碰撞
          };
          
          // 近乎无摩擦力状态
          this.Body.set(coin, {
            friction: 0.00001,
            frictionAir: 0.00001,
            frictionStatic: 0.00001,
            restitution: 0.01,
            slop: 0.7 // 进一步增加允许重叠量
          });
          
            coin.plugin = coin.plugin || {};
          coin.plugin.canPassThroughPlate = true;
          
          // 更强的向下速度脉冲
          this.Body.setVelocity(coin, {
            x: coin.velocity.x,
            y: Math.max(coin.velocity.y, 7) // 增大下落速度
          });
        }
      }
      
      // 2. 动态调整所有金币的摩擦力和物理特性
      if (distToPlate > -30 && distToPlate < 100) {
        // 根据距离计算动态参数
        const frictionFactor = Math.max(0.1, Math.min(1.5, 1.5 - (distToPlate / 100)));
        const massReductionFactor = Math.max(0.2, Math.min(1.0, 1.0 - (100 - distToPlate) / 130));
        const restitutionFactor = Math.max(0.01, Math.min(0.05, 0.01 + distToPlate / 2000));
        
        // 设置基本物理特性
        const properties = {
          friction: frictionFactor,
          frictionAir: 0.5 * frictionFactor,
          frictionStatic: 1.5 * frictionFactor,
          restitution: restitutionFactor
        };
        
        // 特殊处理：受压状态下，几乎无摩擦力
        if (isUnderPressure && distToPlate < 20) {
          Object.assign(properties, {
            friction: 0.001,
            frictionAir: 0.001,
            frictionStatic: 0.001,
            mass: 0.05, // 降低质量使其更容易被推动
            slop: 0.3   // 增加允许重叠量
          });
          
          // 标记金币处于压力状态
          coin.plugin = coin.plugin || {};
          coin.plugin.underPressure = true;
          coin.plugin.pressureStartTime = Date.now();
          
          // 额外的向下力
            this.Body.applyForce(coin, coin.position, {
              x: 0,
            y: 0.005 // 向下的力比普通状态更大
          });
        } else {
          // 普通状态额外特性
          Object.assign(properties, {
            mass: 0.1 * massReductionFactor,
            inverseInertia: 0.1 / massReductionFactor
          });
          
          // 标记为调整了摩擦力
          coin.plugin = coin.plugin || {};
          coin.plugin.frictionAdjusted = true;
        }
        
        // 一次性设置所有特性
        this.Body.set(coin, properties);
        
      } else if (coin.plugin && coin.plugin.frictionAdjusted) {
        // 离开摩擦板区域，恢复默认特性
        this.Body.set(coin, {
          friction: 1.5,
          frictionAir: 0.5,
          frictionStatic: 1.5,
          restitution: 0.01,
          mass: 0.1,
          inverseInertia: 0,
          slop: 0.05,
          timeScale: 1.0
        });
        
        // 移除标记
        delete coin.plugin.frictionAdjusted;
      }
      
      // 3. 处理已穿过摩擦板的金币
      if (distToPlate > 0) {
        // 确保重置碰撞过滤器
        if (coin.plugin && coin.plugin.canPassThroughPlate) {
          coin.collisionFilter = {
            category: 0x0001,
            mask: 0x0001 // 保持只与金币碰撞，确保继续下落
          };
          delete coin.plugin.canPassThroughPlate;
        }
        
        // 额外下落重力 - 加速金币离开屏幕
        const gravityFactor = Math.min(0.02, 0.005 + distToPlate / 500); // 更大的重力
        this.Body.applyForce(coin, coin.position, {
          x: 0,
          y: gravityFactor
        });
        
        // 确保一定的下落速度
        const minVelocity = 5; // 更大的最小速度
        if (coin.velocity.y < minVelocity) {
          this.Body.setVelocity(coin, {
            x: coin.velocity.x,
            y: Math.max(minVelocity, coin.velocity.y)
          });
          
          // 标记为快速下落
          coin.plugin = coin.plugin || {};
          coin.plugin.fastDropping = true;
        }
      }
      
      // 4. 压力传递到下方金币
      if (isUnderPressure) {
        // 查找当前金币下方的金币
        const bottomCoins = coinData
          .filter(data => 
            data.coin !== coin && 
            !data.removed &&
            data.position.y > coin.position.y + 15 && 
            Math.abs(data.position.x - coin.position.x) < 45
          )
          .map(data => data.coin);
        
        // 处理下方金币
        if (bottomCoins.length > 0) {
          bottomCoins.forEach(bottomCoin => {
            const distY = bottomCoin.position.y - coin.position.y;
            const pressureFactor = Math.max(0.1, Math.min(1.0, 1.0 - distY / 100));
            
            // 向下力的传递
            this.Body.applyForce(bottomCoin, bottomCoin.position, {
              x: 0,
              y: 0.002 * pressureFactor // 增加传递的力量
            });
            
            // 降低摩擦力，使其更容易移动
            this.Body.set(bottomCoin, {
              friction: Math.max(0.05, bottomCoin.friction * 0.7),
              frictionAir: Math.max(0.05, bottomCoin.frictionAir * 0.7),
              frictionStatic: Math.max(0.05, bottomCoin.frictionStatic * 0.7)
            });
            
            // 标记受到压力传递
            bottomCoin.plugin = bottomCoin.plugin || {};
            bottomCoin.plugin.pressureTransferred = true;
            bottomCoin.plugin.pressureSource = coin.id;
          });
        }
      }
      
      // 5. 处理压力状态清除
      if (coin.plugin && coin.plugin.underPressure && distToPlate > 30) {
        delete coin.plugin.underPressure;
        delete coin.plugin.pressureStartTime;
      }
    },
    
    // 新增：执行内存清理，防止内存泄漏
    performMemoryCleanup() {
      // 如果游戏中有超过100个金币，强制移除一些最老的金币
      if (this.coins.length > 100) {
        // 移除超过100个的最早添加的金币，但不移除正在执行动画的金币
        let coinsToRemove = this.coins.length - 100;
        let index = 0;
        
        while (coinsToRemove > 0 && index < this.coins.length) {
        const coin = this.coins[index];
          // 避免移除正在执行动画的金币
          if (!coin.plugin || !coin.plugin.animatingRemoval) {
            // 不计入总额，这些是系统自动清理的
            this.World.remove(this.engine.world, coin);
            this.coins.splice(index, 1);
            coinsToRemove--;
          } else {
            // 跳过正在执行动画的金币
            index++;
          }
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
      
      // 检查是否有金币超过了摩擦板但未被移除
      if (this.movableObstacle && this.movableObstacle.body) {
        const plateTopY = this.movableObstacle.body.bounds.min.y;
        
        for (let i = this.coins.length - 1; i >= 0; i--) {
          const coin = this.coins[i];
          
          // 检查金币是否已经超过摩擦板但未被移除（使用更严格的检测条件）
          if (coin.position.y > plateTopY) {
            console.log(`清理：发现超过摩擦板的金币(${coin.value})，强制移除`);
            
            // 记录金额并添加到总额
      if (coin.value) {
        this.totalValue += coin.value;
      }
      
            // 移除金币
            this.removeCoin(coin, i);
            continue; // 此金币已移除，跳过后续检查
          }
          
          // 检查金币是否超过顶部移动条（添加新的检查）
          if (this.platformMotion.platform) {
            const topPlatformTopY = this.platformMotion.platform.bounds.min.y;
            // 确保金币半径信息存在
            const coinRadius = coin.circleRadius || 22.5;
            
            if (coin.position.y < topPlatformTopY - coinRadius) {
              console.log(`清理：发现超过顶部移动条的金币，强制移除`);
              this.removeCoin(coin, i);
              continue; // 此金币已移除，跳过后续检查
            }
          }
          
          // 额外检查：如果金币Y坐标超过游戏区域，也强制移除
          if (coin.position.y > 450) { // 超出游戏区域底部
            console.log(`清理：发现超出游戏区域的金币，强制移除`);
            this.removeCoin(coin, i);
          }
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
    // 新增：更新金币移除动画
    updateRemovalAnimations() {
      const now = Date.now();
      
      // 遍历所有金币，更新动画状态
      for (let i = this.coins.length - 1; i >= 0; i--) {
            const coin = this.coins[i];
        
        if (coin.plugin && coin.plugin.animatingRemoval) {
          const elapsedTime = now - coin.plugin.removalStartTime;
          const duration = coin.plugin.removalAnimationDuration || 600;
          
          // 动画进度 (0-1)
          const progress = Math.min(1, elapsedTime / duration);
          
          // 如果动画已完成，移除金币
          if (progress >= 1) {
            // 从物理世界和金币数组中移除
            this.World.remove(this.engine.world, coin);
            this.coins.splice(i, 1);
          continue;
        }
        
          // 动画还在进行中，更新视觉效果
          // 使用缓动函数使动画更自然
          const easedProgress = this.easeOutQuad(progress);
          
          // 应用缩放和透明度效果
          if (coin.render && coin.render.sprite) {
            const originalScale = coin.plugin.originalRender?.xScale || 1.5;
            
            // 缩放效果：先稍微放大，然后迅速缩小
            let scale;
            if (progress < 0.2) {
              // 前20%时间放大到110%
              scale = originalScale * (1 + progress * 0.1);
            } else {
              // 后80%时间从110%缩小到0
              scale = originalScale * (1.1 - ((progress - 0.2) / 0.8) * 1.1);
            }
            
            // 应用缩放
            coin.render.sprite.xScale = scale;
            coin.render.sprite.yScale = scale;
            
            // 透明度效果：逐渐变透明
            coin.render.opacity = 1 - easedProgress * 0.9; // 最低保留10%不透明度
            
            // 可选：添加颜色效果，如闪光或颜色变化
            if (progress > 0.5 && !coin.render.sprite.tint) {
              // 添加一些金色闪光效果
              coin.render.sprite.tint = '#FFD700';
            }
          }
          
          // 应用物理效果 - 加速下落
          const currentVelocity = {
            x: coin.velocity.x,
            y: coin.velocity.y + 0.1 // 逐渐增加下落速度
          };
          this.Body.setVelocity(coin, currentVelocity);
          
          // 增加旋转速度
          const currentAngularVelocity = coin.angularVelocity + 
                                        (Math.random() - 0.5) * 0.01 * progress;
          this.Body.setAngularVelocity(coin, currentAngularVelocity);
        }
      }
    },
    
    // 辅助方法：缓出二次方缓动函数
    easeOutQuad(t) {
      return t * (2 - t);
    },
    
    // 新增：检查金币的堆叠情况
    checkCoinStacking() {
      if (this.coins.length < 3) return; // 不足3个金币无需检查堆叠
      
      // 创建一个数组存储需要向下移动的金币
      const coinsToMove = [];
      
      // 创建访问标记对象，防止重复计算
      const visitedCoins = {};
      
      // 遍历所有金币
      this.coins.forEach(coin => {
        // 忽略正在掉落或动画中的金币
        if (coin.plugin && (coin.plugin.isDropping || coin.plugin.animatingRemoval)) {
          return;
        }
        
        // 计算当前金币的堆叠层数 - 使用非递归方法
        const stackLayers = this.calculateCoinStackLayers(coin, visitedCoins);
        
        // 如果金币下方堆叠了超过2层（总共超过3层），标记为需要移动
        if (stackLayers > 2) {
          coinsToMove.push({
            coin,
            stackLayers
          });
        }
      });
      
      // 对需要移动的金币按堆叠层数从高到低排序，优先处理最底层的金币
      coinsToMove.sort((a, b) => b.stackLayers - a.stackLayers);
      
      // 处理需要移动的金币
      coinsToMove.forEach(({ coin }) => {
        // 应用向下移动的力
        this.applyStackingForce(coin);
      });
    },
    
    // 计算金币的堆叠层数 - 非递归实现
    calculateCoinStackLayers(coin, visitedCoins = {}) {
      // 使用唯一ID标识金币 - 使用位置和值作为简单标识
      const coinId = `${coin.id || Math.round(coin.position.x)}-${Math.round(coin.position.y)}-${coin.value || 0}`;
      
      // 如果已经访问过这个金币，返回默认层数1，防止循环引用
      if (visitedCoins[coinId]) {
        return 1;
      }
      
      // 标记为已访问
      visitedCoins[coinId] = true;
      
      // 层数计算采用迭代方式，避免深度递归
      let maxStackHeight = 1; // 当前金币算一层
      let currentLayerCoins = [coin]; // 当前层的金币
      let layerCount = 0;
      
      // 最多检查5层，防止过度计算
      const MAX_LAYERS = 5;
      
      while (currentLayerCoins.length > 0 && layerCount < MAX_LAYERS) {
        layerCount++;
        
        // 当前层所有金币的下方金币
        const nextLayerCoins = [];
        
        // 对当前层的每个金币，找出它下方的金币
        for (const currentCoin of currentLayerCoins) {
          const belowCoins = this.findCoinsBelow(currentCoin, visitedCoins);
          nextLayerCoins.push(...belowCoins);
        }
        
        // 如果找到下一层的金币，更新最大堆叠高度
        if (nextLayerCoins.length > 0) {
          maxStackHeight = layerCount + 1;
          currentLayerCoins = nextLayerCoins;
      } else {
          // 没有更多层了，退出循环
          break;
        }
      }

      return maxStackHeight;
    },
    
    // 查找金币下方的所有金币
    findCoinsBelow(coin, visitedCoins = {}) {
      // 检测半径 - 根据金币半径稍微扩大一些
      const coinRadius = coin.circleRadius || 22.5;
      const detectionRadius = coinRadius * 1.8; // 略大于金币直径，考虑一些重叠
      
      return this.coins.filter(otherCoin => {
        // 排除自身
        if (otherCoin === coin) return false;
        
        // 使用唯一ID标识金币
        const otherCoinId = `${otherCoin.id || Math.round(otherCoin.position.x)}-${Math.round(otherCoin.position.y)}-${otherCoin.value || 0}`;
        
        // 如果已经访问过这个金币，跳过
        if (visitedCoins[otherCoinId]) return false;
        
        // 排除正在掉落或动画中的金币
        if (otherCoin.plugin && (otherCoin.plugin.isDropping || otherCoin.plugin.animatingRemoval)) {
          return false;
        }
        
        // 检查是否在水平方向上足够接近
        const dx = Math.abs(otherCoin.position.x - coin.position.x);
        if (dx > coinRadius) return false;
        
        // 检查是否在当前金币的下方
        const dy = otherCoin.position.y - coin.position.y;
        if (dy <= 0 || dy > detectionRadius) return false;
        
        // 标记为已访问
        visitedCoins[otherCoinId] = true;
        
        return true;
      });
    },
    
    // 对需要移动的金币应用向下力
    applyStackingForce(coin) {
      // 如果金币已经有下落标记，不再重复应用力
      if (coin.plugin && coin.plugin.stackingForceApplied) {
        // 检查是否已经应用力超过1秒，如果是则移除标记以便重新计算
        const now = Date.now();
        const elapsedTime = now - coin.plugin.stackingForceTime;
        if (elapsedTime < 1000) {
          return; // 在1秒内不重复应用力
        }
      }
      
      // 标记金币正在受到堆叠力
            coin.plugin = coin.plugin || {};
      coin.plugin.stackingForceApplied = true;
      coin.plugin.stackingForceTime = Date.now();
      
      // 计算下落力的方向和大小
      // 主要是向下的力，但添加一些随机横向分量避免卡死
      const forceMagnitude = 0.01; // 堆叠力大小
      const forceX = (Math.random() - 0.5) * forceMagnitude * 0.4; // 小的横向随机分量
      const forceY = forceMagnitude; // 主要向下分量
      
      // 应用堆叠下落力
            this.Body.applyForce(coin, coin.position, {
        x: forceX,
        y: forceY
      });
      
      // 降低摩擦力，使金币更容易移动
      const originalFriction = {
        friction: coin.friction || 1.5,
        frictionAir: coin.frictionAir || 0.5,
        frictionStatic: coin.frictionStatic || 1.5
      };
      
      // 存储原始摩擦力便于恢复
      coin.plugin.originalFriction = originalFriction;
      
      // 设置临时低摩擦力
      this.Body.set(coin, {
        friction: 0.2,           // 非常低的摩擦力
        frictionAir: 0.05,       // 低空气阻力
        frictionStatic: 0.1      // 低静摩擦力
      });
      
      // 添加一些初始速度帮助金币移动
      const currentVelocity = coin.velocity;
      this.Body.setVelocity(coin, {
        x: currentVelocity.x + forceX * 100,
        y: currentVelocity.y + forceY * 100
      });
      
      // 添加一些旋转帮助金币移动
      this.Body.setAngularVelocity(coin, coin.angularVelocity + (Math.random() - 0.5) * 0.1);
      
      // 为金币添加推动传播标记
      coin.plugin.propagatingForce = true;
      
      // 找到下方金币并传播推力
      this.propagateStackingForce(coin, forceMagnitude, 1);
      
      // 0.5秒后恢复正常摩擦力
            setTimeout(() => {
        if (coin && coin.plugin && coin.plugin.originalFriction) {
          this.Body.set(coin, coin.plugin.originalFriction);
          delete coin.plugin.originalFriction;
        }
        
        // 移除推力传播标记
        if (coin && coin.plugin) {
          delete coin.plugin.propagatingForce;
        }
        
        // 1秒后移除堆叠力标记，允许重新应用
              setTimeout(() => {
          if (coin && coin.plugin) {
            delete coin.plugin.stackingForceApplied;
                }
            }, 500);
      }, 500);
    },
    
    // 新增：传播堆叠力到下方金币
    propagateStackingForce(sourceCoin, initialForceMagnitude, depth) {
      // 限制传播深度，避免过度传播
      if (depth > 5) return;
      
      // 找到下方受影响的金币
      const belowCoins = this.findDirectlyBelowCoins(sourceCoin);
      if (belowCoins.length === 0) return;
      
      // 计算每个下方金币接收的力
      // 力随着传播深度减弱
      const forceDampingFactor = 0.8; // 每层减弱20%
      const propagatedForceMagnitude = initialForceMagnitude * Math.pow(forceDampingFactor, depth);
      
      // 力大小低于阈值时停止传播
      if (propagatedForceMagnitude < 0.001) return;
      
      // 对每个下方金币应用力并继续传播
      belowCoins.forEach(belowCoin => {
        // 排除已经在传播力的金币，避免循环
        if (belowCoin.plugin && belowCoin.plugin.propagatingForce) return;
        
        // 计算相对位置确定力的方向
        const dx = belowCoin.position.x - sourceCoin.position.x;
        const dy = belowCoin.position.y - sourceCoin.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 力的方向 - 主要向下，但保留一些水平分量
        const normalizedDx = dx / distance || 0; // 防止除以零
        const normalizedDy = dy / distance || 0;
        
        // 应用力 - 力的大小会随着传播距离减弱
        const forceX = normalizedDx * propagatedForceMagnitude * 0.3; // 水平分量较小
        const forceY = Math.max(0.3, normalizedDy) * propagatedForceMagnitude; // 垂直分量保证向下
        
        this.Body.applyForce(belowCoin, belowCoin.position, {
          x: forceX,
          y: forceY
        });
        
        // 给下层金币一个速度脉冲，确保移动
        const velocityImpulse = {
          x: normalizedDx * propagatedForceMagnitude * 50,
          y: Math.max(0.3, normalizedDy) * propagatedForceMagnitude * 80
        };
        
        this.Body.setVelocity(belowCoin, {
          x: belowCoin.velocity.x + velocityImpulse.x,
          y: belowCoin.velocity.y + velocityImpulse.y
        });
        
        // 添加轻微的旋转
        this.Body.setAngularVelocity(belowCoin, belowCoin.angularVelocity + (Math.random() - 0.5) * 0.05 * propagatedForceMagnitude);
        
        // 临时降低下方金币的摩擦力，使其更容易移动
        const originalFriction = {
          friction: belowCoin.friction || 1.5,
          frictionAir: belowCoin.frictionAir || 0.5,
          frictionStatic: belowCoin.frictionStatic || 1.5
        };
        
        belowCoin.plugin = belowCoin.plugin || {};
        belowCoin.plugin.stackingForcePropagated = true;
        belowCoin.plugin.originalFriction = originalFriction;
        belowCoin.plugin.propagatingForce = true;
        
        this.Body.set(belowCoin, {
          friction: 0.3,           // 降低摩擦力
          frictionAir: 0.1,        // 降低空气阻力
          frictionStatic: 0.2      // 降低静摩擦力
        });
        
        // 继续向下传播力，递增深度
        setTimeout(() => {
          this.propagateStackingForce(belowCoin, propagatedForceMagnitude, depth + 1);
        }, 50 * depth); // 稍微延迟传播，使动画更自然
        
        // 延迟恢复下方金币的原始摩擦力
        setTimeout(() => {
          if (belowCoin && belowCoin.plugin && belowCoin.plugin.originalFriction) {
            this.Body.set(belowCoin, belowCoin.plugin.originalFriction);
            delete belowCoin.plugin.originalFriction;
            delete belowCoin.plugin.stackingForcePropagated;
            delete belowCoin.plugin.propagatingForce;
          }
        }, 300 + 100 * depth); // 传播越深，恢复摩擦力的时间越长
      });
    },
    
    // 查找直接位于金币下方的金币
    findDirectlyBelowCoins(coin) {
      // 检测半径 - 根据金币半径稍微扩大一些
      const coinRadius = coin.circleRadius || 22.5;
      const detectionWidth = coinRadius * 1.2; // 略大于金币直径，只查找正下方
      const detectionHeight = coinRadius * 1.8; // 查找距离为金币直径的1.8倍
      
      return this.coins.filter(otherCoin => {
        // 排除自身
        if (otherCoin === coin) return false;
        
        // 排除正在掉落或动画中的金币
        if (otherCoin.plugin && (otherCoin.plugin.isDropping || otherCoin.plugin.animatingRemoval)) {
          return false;
        }
        
        // 检查是否在水平方向上正下方
        const dx = Math.abs(otherCoin.position.x - coin.position.x);
        if (dx > detectionWidth) return false;
        
        // 检查是否在垂直方向上足够近
        const dy = otherCoin.position.y - coin.position.y;
        if (dy <= 0 || dy > detectionHeight) return false;
        
        return true;
      });
    },
    
    // 新增：根据总金币数量动态调整金币的穿透摩擦力板几率
    adjustCoinPassThroughRate() {
      // 获取当前有效金币数量
      const activeCoinCount = this.coins.filter(coin => 
        !coin.plugin || (!coin.plugin.animatingRemoval && !coin.plugin.isRemoved)
      ).length;
      
      // 获取摩擦力板的位置
      if (!this.movableObstacle.body) return;
      const plateBounds = this.movableObstacle.body.bounds;
      const plateTopY = plateBounds.min.y;
      
      // 根据金币数量计算穿透概率基础值
      // 金币越多，基础穿透概率越高
      let basePassThroughRate = 0;
      
      if (activeCoinCount < 50) {
        // 低于50个金币，基础概率很低
        basePassThroughRate = 0.01;
      } else if (activeCoinCount < 70) {
        // 50-70个金币，基础概率适中
        basePassThroughRate = 0.05 + (activeCoinCount - 50) * 0.005; // 0.05 到 0.15
      } else if (activeCoinCount < 90) {
        // 70-90个金币，基础概率较高
        basePassThroughRate = 0.15 + (activeCoinCount - 70) * 0.01; // 0.15 到 0.35
      } else {
        // 90-100个金币，基础概率非常高
        basePassThroughRate = 0.35 + (activeCoinCount - 90) * 0.025; // 0.35 到 0.6
      }
      
      // 应用到所有靠近摩擦力板的金币
      this.coins.forEach(coin => {
        // 忽略正在掉落或动画中的金币，或已有穿透标记的金币
        if (coin.plugin && (coin.plugin.isDropping || coin.plugin.animatingRemoval || 
                           coin.plugin.isRemoved || coin.plugin.passingThroughPlate)) {
          return;
        }
        
        // 计算与摩擦力板的距离
        const distToPlate = Math.abs(coin.position.y - plateTopY);
        
        // 只处理接近摩擦力板的金币
        if (distToPlate < 30) {
          // 根据距离调整穿透概率
          // 越靠近摩擦力板，穿透概率越高
          const distanceFactor = Math.max(0, 1 - distToPlate / 30);
          
          // 考虑金币的速度方向
          const velocityFactor = coin.velocity.y > 0 ? 1 + (coin.velocity.y / 5) : 0.5;
          
          // 考虑金币是否受压
          const pressureFactor = this.checkCoinPressure(coin) ? 2 : 1;
          
          // 根据距离、速度、压力和金币总数计算最终穿透概率
          const finalPassThroughRate = basePassThroughRate * distanceFactor * velocityFactor * pressureFactor;
          
          // 使用随机数决定是否让金币穿过
          if (Math.random() < finalPassThroughRate) {
            // 临时修改金币的物理属性，让其更容易穿过摩擦力板
            this.applyCoinPassThroughEffect(coin);
          }
        }
      });
    },
    
    // 应用效果使金币穿过摩擦力板
    applyCoinPassThroughEffect(coin) {
      // 如果金币已经在穿透状态，不重复应用
      if (coin.plugin && coin.plugin.passingThroughPlate) {
        return;
      }
      
      // 保存原始碰撞过滤器
      coin.plugin = coin.plugin || {};
      const originalFilter = {
        category: coin.collisionFilter.category,
        mask: coin.collisionFilter.mask
      };
      coin.plugin.originalFilter = originalFilter;
      
      // 设置特殊碰撞过滤器，允许穿过摩擦板
      this.Body.set(coin, {
        collisionFilter: {
          category: 0x0001,
          mask: 0x0001 // 只与其他金币碰撞，不与摩擦板碰撞
        },
        // 极低的摩擦力
        friction: 0.001,
        frictionAir: 0.001,
        frictionStatic: 0.001,
        // 设置为不回弹
        restitution: 0,
        // 允许更多重叠，减少卡住可能
        slop: 0.8
      });
      
      // 标记正在穿透
      coin.plugin.passingThroughPlate = true;
      
      // 应用更强的向下力
      this.Body.applyForce(coin, coin.position, {
        x: 0,
        y: 0.015 // 增加向下力
      });
      
      // 确保金币有足够的初始向下速度
      if (coin.velocity.y < 3) {
        this.Body.setVelocity(coin, {
          x: coin.velocity.x,
          y: 3 + Math.random() * 2 // 确保有较大的向下初速度
        });
      }
      
      // 不再设置定时器恢复碰撞，而是在每帧检查状态决定是否保持穿透
      // 穿透状态将在updateCoinPassThroughStatus方法中管理
    },
    
    // 新增：每帧更新穿透状态
    updateCoinPassThroughStatus() {
      // 获取摩擦力板的位置
      if (!this.movableObstacle.body) return;
      const plateTopY = this.movableObstacle.body.bounds.min.y;
      const plateBottomY = this.movableObstacle.body.bounds.max.y;
      
      this.coins.forEach(coin => {
        // 跳过正在动画或已移除的金币
        if (coin.plugin && (coin.plugin.animatingRemoval || coin.plugin.isRemoved)) {
          return;
        }
        
        // 处理正在穿透的金币
        if (coin.plugin && coin.plugin.passingThroughPlate) {
          // 计算与摩擦力板的相对位置
          const coinBottomY = coin.position.y + coin.circleRadius;
          
          // 如果金币底部已经超过摩擦板底部，开始执行移除动画
          if (coinBottomY > plateBottomY + 5) {
            // 开始金币消失动画
            this.startCoinRemovalAnimation(coin);
            
            // 增加总额
      if (coin.value) {
        this.totalValue += coin.value;
              console.log(`金币(${coin.value})穿过摩擦板，总额增加到${this.totalValue}`);
            }
          } else {
            // 还在穿透过程中，检查下落速度
            // 如果速度过低，增加向下的推力和速度
            if (coin.velocity.y < 1) {
              this.Body.setVelocity(coin, {
                x: coin.velocity.x,
                y: 1.5 + Math.random()
              });
              
              this.Body.applyForce(coin, coin.position, {
                x: 0,
                y: 0.01
              });
            }
          }
        } 
        // 检测新的穿透条件
        else {
          // 计算与摩擦力板的距离
          const distToPlate = Math.abs(coin.position.y - plateTopY);
          
          // 靠近摩擦力板且有足够的向下速度或压力，考虑穿透
          const hasDownwardMomentum = coin.velocity.y > 0.8;
          const isUnderPressure = this.checkCoinPressure(coin);
          const isCloseToPlate = distToPlate < 25;
          
          if (isCloseToPlate && (hasDownwardMomentum || isUnderPressure)) {
            // 获取当前有效金币数量
            const activeCoinCount = this.coins.filter(c => 
              !c.plugin || (!c.plugin.animatingRemoval && !c.plugin.isRemoved)
            ).length;
            
            // 根据金币数量计算穿透概率
            // 金币越多，穿透概率越高
            let passThroughChance = 0.01; // 基础概率
            
            if (activeCoinCount > 50) {
              // 50个以上金币时，概率开始提高
              passThroughChance = 0.01 + ((activeCoinCount - 50) / 50) * 0.29; // 最高到30%
            }
            
            // 增加压力因素
            if (isUnderPressure) {
              passThroughChance += 0.2; // 受压时额外增加20%穿透概率
            }
            
            // 增加速度因素
            if (coin.velocity.y > 2) {
              passThroughChance += (coin.velocity.y - 2) * 0.05; // 速度越大概率越高
            }
            
            // 最终概率上限
            passThroughChance = Math.min(0.8, passThroughChance);
            
            // 随机决定是否穿透
            if (Math.random() < passThroughChance) {
              this.applyCoinPassThroughEffect(coin);
            }
          }
        }
      });
    },
    
    // 新增：启动金币移除动画
    startCoinRemovalAnimation(coin) {
      // 如果已经在执行动画，不再重复处理
      if (coin.plugin && coin.plugin.animatingRemoval) {
        return;
      }
      
      // 标记金币正在执行移除动画
      coin.plugin = coin.plugin || {};
      coin.plugin.animatingRemoval = true;
      coin.plugin.removalStartTime = Date.now();
      coin.plugin.initialRemovalPosition = { ...coin.position };
      
      // 保存原始渲染属性
      if (coin.render && coin.render.sprite) {
        coin.plugin.originalRender = {
          xScale: coin.render.sprite.xScale,
          yScale: coin.render.sprite.yScale,
          opacity: coin.render.opacity || 1
        };
      }
      
      // 使金币能够穿过所有物体加速下落
      this.Body.set(coin, {
        collisionFilter: {
          category: 0x0004,
          mask: 0x0000 // 不与任何物体碰撞
        },
        friction: 0.01,          // 极低摩擦力
        frictionAir: 0.01,       // 极低空气阻力
        frictionStatic: 0.01,    // 极低静摩擦力
        restitution: 0,          // 无回弹
        isSensor: true           // 设为传感器，完全穿过其他物体
      });
      
      // 设置移除动画的持续时间和效果 - 快速移除效果
      coin.plugin.removalAnimationDuration = 400; // 400毫秒内完成动画
      
      // 应用加速下落的力和速度
      const exitVelocity = {
        x: coin.velocity.x * 0.3, // 保留一小部分横向速度
        y: 5 + Math.random() * 3  // 较大的向下速度
      };
      this.Body.setVelocity(coin, exitVelocity);
      
      // 添加一些旋转效果使动画更生动
      this.Body.setAngularVelocity(coin, (Math.random() - 0.5) * 0.2);
      
      // 播放金币消失的音效
      this.playCoinDropSound();
    },
    
    // 新增：限制总金币数量
    enforceCoinLimit() {
      // 获取当前有效金币数量
      const activeCoins = this.coins.filter(coin => 
        !coin.plugin || (!coin.plugin.animatingRemoval && !coin.plugin.isRemoved)
      );
      
      // 如果超过限制，移除多余的金币
      if (activeCoins.length > this.MAX_COINS) {
        console.log(`金币数量(${activeCoins.length})超过限制(${this.MAX_COINS})，开始移除多余金币`);
        
        // 获取摩擦力板的位置
        const plateTopY = this.movableObstacle?.body?.bounds?.min?.y || 350;
        
        // 按照离摩擦力板距离排序，优先移除最靠近摩擦力板的金币
        let sortedCoins = [...activeCoins].sort((a, b) => {
          const distA = Math.abs(a.position.y - plateTopY);
          const distB = Math.abs(b.position.y - plateTopY);
          return distA - distB; // 距离越小，越优先移除
        });
        
        // 过滤出只保留与摩擦板接触的金币
        sortedCoins = sortedCoins.filter(coin => {
          return coin.position.y > plateTopY && coin.position.y < plateTopY + 30; // 检查金币是否在摩擦板的上方30像素内
        });
        
        // 需要移除的金币数量
        const removeCount = sortedCoins.length - this.MAX_COINS;
        
        // 移除多余的金币
        for (let i = 0; i < removeCount; i++) {
          const coinToRemove = sortedCoins[i];
          
          // 开始移除动画
          coinToRemove.plugin = coinToRemove.plugin || {};
          if (!coinToRemove.plugin.animatingRemoval) {
            coinToRemove.plugin.animatingRemoval = true;
            coinToRemove.plugin.removalStartTime = Date.now();
            
            // 立即将碰撞过滤器修改为穿透所有物体
            this.Body.set(coinToRemove, {
              collisionFilter: {
                category: 0x0004,
                mask: 0x0000 // 不与任何物体碰撞
              },
              friction: 0.01,
              frictionAir: 0.01,
              frictionStatic: 0.01
            });
            
            // 应用更强的下落力
            this.Body.applyForce(coinToRemove, coinToRemove.position, {
              x: 0,
              y: 0.02 // 较大的向下力
            });
            
            console.log(`移除靠近摩擦力板的金币(${coinToRemove.value})`);
          }
        }
      }
    },
    
    // 计算靠近摩擦力板的金币数量
    countCoinsNearPlate() {
      if (!this.movableObstacle.body) return 0;
      
      const plateTopY = this.movableObstacle.body.bounds.min.y;
      const nearDistance = 30; // 30像素内视为靠近
      
      return this.coins.filter(coin => {
        // 排除正在动画的金币
        if (coin.plugin && (coin.plugin.animatingRemoval || coin.plugin.isRemoved)) {
          return false;
        }
        
        // 计算与摩擦力板的距离
        const distToPlate = Math.abs(coin.position.y - plateTopY);
        return distToPlate < nearDistance;
      }).length;
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
  padding: 8px 16px;
  margin: 0 5px;
  background-color: #9c27b0;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
}

.drop-button:hover {
  background-color: #7b1fa2;
}

.drop-button:disabled {
  background-color: #b39ddb;
  cursor: not-allowed;
  opacity: 0.7;
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
  background: transparent;
  box-shadow: 0 10px 20px rgba(0,0,0,0.1);
  z-index: 10;
}
.coin-box-bottom {
  position: absolute;
  bottom: 65px;
  width: 400px;
  height: 65px;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  background: #7b1fa2;
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
  position: relative;
  margin-bottom: 20px;
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
