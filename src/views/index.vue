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
      
      // 调整引擎重力
      this.engine.gravity.y = 1.2 
      this.engine.gravity.scale = 0.002
      
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
          friction: 0.1, // 较小的摩擦力
          restitution: 0.5, // 中等弹性
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
          
          // 检查是否有金币参与碰撞
          const coinA = pair.bodyA.value !== undefined ? pair.bodyA : null;
          const coinB = pair.bodyB.value !== undefined ? pair.bodyB : null;
          
          // 处理金币碰撞后的物理特性
          [coinA, coinB].forEach(coin => {
            if (coin && !coin.plugin?.noGravity) {
              // 标记金币已经被处理过
              coin.plugin = coin.plugin || {};
              coin.plugin.noGravity = true;
              
              // 增加摩擦力，移除重力影响
              this.Body.setStatic(coin, false); // 确保不是静态的
              this.Body.set(coin, {
                friction: 0.95,       // 增加摩擦力
                frictionAir: 0.2,     // 增加空气摩擦力
                frictionStatic: 0.9,  // 增加静摩擦力
                restitution: 0.01     // 降低弹性
              });
            }
          });
        });
      });
      
      // 添加碰撞后事件，用于处理金币的重力 - 性能优化版本
      this.Events.on(this.engine, 'afterUpdate', () => {
        // 获取高摩擦力区域的位置信息
        const topObstacleY = this.dropArea.y + 5; // 顶部障碍物位置
        const bottomObstacleY = 500; // movableObstacle位置
        
        // 性能优化：只在每3帧处理一次，或者当金币数量较少时每帧处理
        if (this.coins.length <= 20 || this.engine.timing.timestamp % 3 < 1) {
          // 性能优化：只处理一部分金币，而不是全部
          // 根据金币数量动态调整处理比例
          const processRatio = this.coins.length > 50 ? 0.3 : 
                             this.coins.length > 30 ? 0.5 : 0.8;
          
          // 计算本次要处理的金币数量
          const coinsToProcess = Math.ceil(this.coins.length * processRatio);
          
          // 随机选择起始索引，确保不同帧处理不同的金币
          const startIndex = Math.floor(Math.random() * (this.coins.length - coinsToProcess + 1));
          
          // 只处理选定的金币子集
          for (let i = 0; i < coinsToProcess; i++) {
            const coin = this.coins[startIndex + i];
            if (!coin) continue; // 安全检查
            
            // 检查金币是否在高摩擦力区域内
            const isInFrictionZone = 
              coin.position.y > topObstacleY && 
              coin.position.y < bottomObstacleY;
            
            // 如果金币在高摩擦力区域内或已被标记为无重力
            if (isInFrictionZone || coin.plugin?.noGravity) {
              // 确保金币有plugin对象
              coin.plugin = coin.plugin || {};
              
              // 标记金币为无重力状态
              coin.plugin.noGravity = true;
              
              // 性能优化：只在必要时设置物理属性
              if (!coin.plugin.physicsSet) {
                this.Body.set(coin, {
                  friction: 0.95,       // 增加摩擦力
                  frictionAir: 0.2,     // 增加空气摩擦力
                  frictionStatic: 0.9,  // 增加静摩擦力
                  restitution: 0.01     // 降低弹性
                });
                coin.plugin.physicsSet = true;
              }
              
              // 性能优化：只对移动中的金币应用力
              if (Math.abs(coin.velocity.y) > 0.05 || Math.abs(coin.velocity.x) > 0.05) {
                // 抵消重力影响
                const gravity = this.engine.gravity;
                const gravityForce = {
                  x: -coin.mass * gravity.x * gravity.scale,
                  y: -coin.mass * gravity.y * gravity.scale
                };
                
                // 应用抵消重力的力
                this.Body.applyForce(coin, coin.position, gravityForce);
              }
            }
          }
        }
      });

      
      // 添加更新事件，用于移动底板 - 性能优化版本
      this.Events.on(this.engine, 'beforeUpdate', () => {
        // 获取当前时间戳，用于控制不同方法的执行频率
        const timestamp = this.engine.timing.timestamp;
        
        // 底板移动每帧都需要执行以保持平滑
        this.updatePlatformPosition();
        
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
          // 重用对象池中的金币
          this.Body.setPosition(coin, position);
          this.Body.setAngle(coin, angle);
          this.Body.set(coin, {
            restitution: 0.05,
            friction: 0.9,
            frictionAir: 0.001,
            frictionStatic: 0.5,
            plugin: {}
          });
        } else {
          // 创建新的金币
          coin = this.Bodies.circle(position.x, position.y, 15, {
            angle: angle,
            restitution: 0.05, // 降低弹性系数，减少弹跳
            friction: 0.9,   // 增加摩擦力，让金币更容易停止
            frictionAir: 0.001, // 增加空气摩擦力
            frictionStatic: 0.5, // 增加静摩擦力
            density: 1,    // 保持重量
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
      
      // 更新时间 - 使用固定时间增量，不受帧率影响
      this.platformMotion.time += 1;
      
      // 计算新的Y位置 - 正弦波形运动，固定幅度和频率
      const newY = this.platformMotion.baseY + 
                  Math.sin(this.platformMotion.time * this.platformMotion.frequency) * 
                  this.platformMotion.amplitude; // 使用固定幅度
      
      // 使用Matter.js的Body.setPosition方法
      const platform = this.platformMotion.platform;
      
      // 使用Body.setPosition来移动底板
      this.Body.setPosition(platform, {
        x: platform.position.x,
        y: newY
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
