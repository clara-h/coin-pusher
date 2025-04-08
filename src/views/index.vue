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
          height: 400,
          wireframes: false,
          background: '#f8f9fa',
          showAngleIndicator: false
        }
      })

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
        // 获取当前时间戳，用于控制不同方法的执行频率
        const timestamp = this.engine.timing.timestamp;
        
        // 底板移动每帧都需要执行以保持平滑
        this.updatePlatformPosition();
        
        // 动态调整金币摩擦力
        this.adjustCoinFriction();
        
        // 检查金币压力状态
        this.checkCoinsPressure();
        
        // 检查金币是否穿过摩擦板
        this.checkCoinsPassedPlate();
        
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
      
      const coinCount = Math.floor(Math.random() * 5) + 3 // 随机3-7个金币
      const coinValues = [1, 5, 10, 25, 50] // 金币面值
      
      // 记录本次投放的总金额 - 仅用于显示，不会立即添加到总额
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
          coin = this.Bodies.circle(position.x, position.y, 20, {
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
                xScale: 1.33,
                yScale: 1.33
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
      
      // 不再更新总金额，只有在金币穿过摩擦板时才会更新
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
      
      // 创建离屏 canvas - 调整尺寸以适应更大的金币
      const canvas = document.createElement('canvas')
      canvas.width = 40 // 调整尺寸
      canvas.height = 40 // 调整尺寸
      const ctx = canvas.getContext('2d')
      
      // 清除画布，确保背景透明
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // 简化渐变 - 减少颜色停止点
      const gradient = ctx.createRadialGradient(20, 20, 7, 20, 20, 19)
      gradient.addColorStop(0, '#FFEB3B') // 浅金色中心
      gradient.addColorStop(1, '#FF9800') // 深金色边缘
      
      // 绘制金币背景
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(20, 20, 19, 0, Math.PI * 2)
      ctx.fill()
      
      // 绘制边框 - 使用更轻的颜色
      ctx.strokeStyle = 'rgba(184, 134, 11, 0.7)'
      ctx.lineWidth = 0.7
      ctx.beginPath()
      ctx.arc(20, 20, 18, 0, Math.PI * 2)
      ctx.stroke()
      
      // 绘制金额
      ctx.fillStyle = '#8B4513'
      const fontSize = value.toString().length > 1 ? 16 : 18
      ctx.font = `bold ${fontSize}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(value.toString(), 20, 20)
      
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

    // 辅助方法：移除金币 - 提取为单独方法以减少代码重复
    removeCoin(coin, index) {
      // 不再在这里添加金额到总额，而是在checkCoinsPassedPlate中处理
      
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
      this.coins.forEach(otherCoin => {
        if (otherCoin !== coin) {
          // 计算两个金币之间的距离
          const dx = coin.position.x - otherCoin.position.x;
          const dy = coin.position.y - otherCoin.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // 如果距离小于金币直径的1.2倍，认为有接触
          if (distance < 40) {
            contactCount++;
          }
        }
      });
      
      // 如果金币与3个或更多其他金币接触，认为受到较大压力
      return contactCount >= 3;
    },
    
    // 添加新方法：检查所有金币的压力状态
    checkCoinsPressure() {
      // 获取底部摩擦板的位置
      const bottomFrictionPlate = this.movableObstacle.body;
      if (!bottomFrictionPlate) return;
      
      const plateBounds = bottomFrictionPlate.bounds;
      const plateTopY = plateBounds.min.y;
      
      // 遍历所有金币
      this.coins.forEach(coin => {
        // 计算金币到摩擦板的距离
        const distToPlate = coin.position.y - plateTopY;
        
        // 如果金币在摩擦板附近且受到较大压力
        if (distToPlate > -10 && distToPlate < 30 && this.checkCoinPressure(coin)) {
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
            coin.plugin = coin.plugin || {};
            coin.plugin.canPassThroughPlate = true;
          }
        }
      });
    },
    // 添加新方法：检查金币是否已经穿过摩擦板
    checkCoinsPassedPlate() {
      // 获取底部摩擦板的位置
      const bottomFrictionPlate = this.movableObstacle.body;
      if (!bottomFrictionPlate) return;
      
      const plateBounds = bottomFrictionPlate.bounds;
      const plateTopY = plateBounds.min.y;
      
      // 遍历所有金币
      for (let i = this.coins.length - 1; i >= 0; i--) {
        const coin = this.coins[i];
        
        // 检查金币是否已经穿过摩擦板
        if (coin.position.y > plateTopY + 30) {
          // 记录金额并添加到总额
          if (coin.value) {
            this.totalValue += coin.value;
          }
          
          // 移除金币
          this.removeCoin(coin, i);
        }
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
