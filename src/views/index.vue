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
import coinImage from '@/assets/images/coin.png'
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
        
        // 限制金币旋转角度
        this.limitCoinRotation();
        
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
        const angle = 0
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
            // 轻微旋转
            inertia: Infinity,
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
            inertia: Infinity, // 防止旋转
            inverseInertia: 0, // 防止旋转
            // 新增：增加旋转阻力
            frictionAngular: 0.8, // 增加角摩擦力，减少旋转
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
          this.Body.setAngularVelocity(coin, (Math.random() - 0.5) * 0.05);
          
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
          // this.Body.setAngularVelocity(targetCoin, targetCoin.angularVelocity + (Math.random() - 1) * 0.1);
          
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
      const img = new Image();
      img.src = coinImage
      
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
      this.Body.setAngularVelocity(coin, coin.angularVelocity + (Math.random() - 0.5) * 0.02); // 添加一些旋转帮助金币移动
      
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
        this.Body.setAngularVelocity(belowCoin, belowCoin.angularVelocity + (Math.random() - 0.5) * 0.02 * propagatedForceMagnitude); // 添加轻微的旋转
        
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
      this.Body.setAngularVelocity(coin, (Math.random() - 0.5) * 0.05); // 添加一些旋转效果使动画更生动
      
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
    // 添加新方法：限制金币旋转角度
    limitCoinRotation() {
      // 最大允许旋转角度（弧度）
      const MAX_ROTATION = Math.PI / 6; // 30度，转换为弧度
      
      this.coins.forEach(coin => {
        // 获取当前角度并归一化到 [-π, π] 范围
        let angle = coin.angle % (Math.PI * 2);
        if (angle > Math.PI) angle -= Math.PI * 2;
        if (angle < -Math.PI) angle += Math.PI * 2;
        
        // 检查角度是否超出限制
        if (Math.abs(angle) > MAX_ROTATION) {
          // 计算需要设置的新角度
          const newAngle = angle > 0 ? MAX_ROTATION : -MAX_ROTATION;
          
          // 设置新角度
          this.Body.setAngle(coin, newAngle);
          
          // 如果角速度过大，降低角速度
          if (Math.abs(coin.angularVelocity) > 0.05) {
            const newAngularVelocity = coin.angularVelocity > 0 ? 0.05 : -0.05;
            this.Body.setAngularVelocity(coin, newAngularVelocity);
          }
          
          // 如果角度接近最大值，添加反向力矩防止过度旋转
          if (Math.abs(angle) > MAX_ROTATION * 0.9) {
            // 计算反向角速度
            const dampening = -0.8 * coin.angularVelocity;
            this.Body.setAngularVelocity(coin, dampening);
          }
        }
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
