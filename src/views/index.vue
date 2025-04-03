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
        amplitude: 60,    // 上下移动幅度
        frequency: 0.02,  // 移动频率
        time: 0           // 计时器
      },
      // 压力感应系统
      pressureSystem: {
        threshold: 30,     // 触发穿透的金币数量阈值
        maxCoinsToRelease: 5, // 一次最多释放几个金币
        cooldown: 1000,   // 冷却时间(毫秒)
        lastReleaseTime: 0    // 上次释放时间
      },
      // 可移动障碍物
      movableObstacle: {
        body: null,       // 障碍物物体引用
        width: 400,       // 宽度
        height: 10,       // 高度
        offsetY: 0       // 底板下方偏移量
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
        positionIterations: 6, // 降低位置迭代次数，从8减为6
        velocityIterations: 4  // 降低速度迭代次数，从6减为4
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
        // 掉落区域上方的长条障碍物
        this.Bodies.rectangle(200, this.dropArea.y, 400, 10, { 
          isStatic: true, 
          // angle: Math.PI * 0.03, // 略微倾斜，增加趣味性
          chamfer: { radius: 2 }, // 轻微圆角
          render: { 
            fillStyle: '#f44336',
            visible: true
          },
          friction: 0.1, // 较小的摩擦力
          restitution: 0.5 // 中等弹性
        })
      ];

      // 创建收集区域底板 - 可上下移动
      const platform = this.Bodies.rectangle(this.collectionArea.x, 
                          this.collectionArea.y + this.collectionArea.height, 
                          this.collectionArea.width, 20, { 
        isStatic: true,
        render: {
          fillStyle: 'rgba(156, 39, 176, 0.5)',
          visible: true
        }
      });
      
      // 创建可移动的障碍物
      const movableObstacle = this.Bodies.rectangle(
        this.collectionArea.x,
        this.collectionArea.y + this.collectionArea.height + this.movableObstacle.offsetY,
        this.movableObstacle.width,
        this.movableObstacle.height,
        {
          isStatic: false,
          density: 0.2,          // 较小的密度
          friction: 1,           // 最大摩擦力
          frictionStatic: 5,     // 极大的静态摩擦力，防止自由滑动
          frictionAir: 0.5,      // 很大的空气阻力，使其快速停止
          restitution: 0,        // 无弹性
          render: {
            fillStyle: '#2196F3', // 蓝色
            visible: true
          },
          collisionFilter: {
            category: 0x0002,
            mask: 0xFFFFFFFF
          },
          // 自定义属性
          plugin: {
            isMovableObstacle: true // 标记为可移动障碍物
          }
        }
      );
      
      // 保存底板和障碍物引用
      this.platformMotion.platform = platform;
      this.platformMotion.baseY = this.collectionArea.y + this.collectionArea.height;
      this.movableObstacle.body = movableObstacle;
      
      // 添加底板和障碍物到墙体数组
      walls.push(platform);
      walls.push(movableObstacle);

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
        });
      });
      
      // 初始化重力补偿系统
      this.initGravityCompensation();
      
      // 添加更新事件，用于移动底板
      this.Events.on(this.engine, 'beforeUpdate', () => {
        this.updatePlatformPosition();
        this.checkCoinsOutOfBounds();
        this.checkPressureSystem();
      });
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
        
        // 随机位置 - 在掉落区域范围内随机X坐标
        const position = {
          x: this.getRandomInt(this.dropArea.minX, this.dropArea.maxX),
          y: this.dropArea.y
        }

        // 随机旋转角度
        const angle = Math.random() * Math.PI * 2
        
        // 随机初始速度 - 更大的随机范围
        const velocity = {
          x: (Math.random() - 0.5) * 5, // -2.5到2.5之间的随机值
          y: Math.random() * 2 + 1     // 1到3之间的随机值
        }

        // 创建带有金额的金币
        const coin = this.Bodies.circle(position.x, position.y, 15, {
          angle: angle,
          restitution: 0.1, // 增加弹性系数，让金币更有弹跳
          friction: 0.8,   // 减小摩擦力，让金币更容易滚动
          frictionAir: 0.0005, // 减小空气摩擦力
          frictionStatic: 0.2, // 减小静摩擦力
          density: 1,    // 稍微减轻重量
          chamfer: { radius: 2 }, // 轻微圆角化
          mass: 0.1, // 增加重量
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
          value: value // 存储金额值
        })
        
        // 设置初始速度
        this.Body.setVelocity(coin, velocity)
        
        // 设置角速度 - 移除角速度以减少旋转
        // this.Body.setAngularVelocity(coin, (Math.random() - 0.5) * 0.2)
        this.Body.setAngularVelocity(coin, 0) // 设置为0，禁止初始旋转
        
        // 添加到世界
        this.World.add(this.engine.world, coin)
        this.coins.push(coin)
        
        console.log(`添加金币: ${value}, 位置: (${position.x}, ${position.y})`)
        
        // 递归调用下一个金币掉落
        setTimeout(() => dropCoin(index + 1), dropInterval)
      }
      
      // 开始掉落第一个金币
      dropCoin(0)
      
      // 更新总金额
      setTimeout(() => {
        this.totalValue += dropValue
      }, coinCount * dropInterval + 100)
    },
    // 获取范围内的随机整数
    getRandomInt(min, max) {
      min = Math.ceil(min)
      max = Math.floor(max)
      return Math.floor(Math.random() * (max - min + 1)) + min
    },
    // 创建金币纹理
    createCoinTexture(value) {
      // 使用缓存减少重复创建
      const cacheKey = `coin_${value}`;
      if (this._coinTextureCache && this._coinTextureCache[cacheKey]) {
        return this._coinTextureCache[cacheKey];
      }
      
      // 创建离屏 canvas
      const canvas = document.createElement('canvas')
      canvas.width = 35
      canvas.height = 35
      const ctx = canvas.getContext('2d')
      
      // 创建径向渐变 - 从中心到边缘
      const gradient = ctx.createRadialGradient(17.5, 17.5, 5, 17.5, 17.5, 15)
      gradient.addColorStop(0, '#FFEB3B') // 浅金色中心
      gradient.addColorStop(0.8, '#FFC107') // 金色
      gradient.addColorStop(1, '#FF9800') // 深金色边缘
      
      // 绘制金币背景
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(17.5, 17.5, 15, 0, Math.PI * 2)
      ctx.fill()
      
      // 绘制边框
      ctx.strokeStyle = '#B8860B'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(17.5, 17.5, 14, 0, Math.PI * 2)
      ctx.stroke()
      
      // 金币内圆
      ctx.strokeStyle = 'rgba(184, 134, 11, 0.5)'
      ctx.beginPath()
      ctx.arc(17.5, 17.5, 11, 0, Math.PI * 2)
      ctx.stroke()
      
      // 绘制金额
      ctx.fillStyle = '#8B4513'
      const fontSize = value.toString().length > 1 ? 13 : 15
      ctx.font = `bold ${fontSize}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(value.toString(), 17.5, 17.5)
      
      const texture = canvas.toDataURL();
      
      // 缓存纹理
      if (!this._coinTextureCache) {
        this._coinTextureCache = {};
      }
      this._coinTextureCache[cacheKey] = texture;
      
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
    // 检查压力系统
    checkPressureSystem() {
      // 如果在冷却期，则跳过
      const now = Date.now();
      if (now - this.pressureSystem.lastReleaseTime < this.pressureSystem.cooldown) {
        return;
      }
      
      // 性能优化：如果金币少于阈值的一半，则不进行检测
      if (this.coins.length < this.pressureSystem.threshold / 2) {
        return;
      }
      
      // 检查是否有金币触碰到顶部障碍物
      const topObstacleY = this.dropArea.y + 10; // 障碍物位置加上半高
      // 只检查部分金币而不是全部
      const sampleCoins = this.coins.slice(0, Math.min(this.coins.length, 20));
      const coinsNearTopObstacle = sampleCoins.filter(coin => 
        Math.abs(coin.position.y - topObstacleY) < 30 && // 接近顶部障碍物
        Math.abs(coin.velocity.y) < 0.5 // 速度很小，表示已经停止或堆积
      );
      
      // 如果有金币接触顶部障碍物，检查底板上的金币堆积情况
      if (coinsNearTopObstacle.length > 0) {
        // 获取底板上方的金币 - 使用采样而不是检查全部金币
        const platform = this.platformMotion.platform;
        const coinsSample = this.coins.filter((_, index) => index % 3 === 0); // 只取三分之一的金币
        const coinsAbovePlatform = coinsSample.filter(coin => 
          Math.abs(coin.position.x - platform.position.x) < this.collectionArea.width/2 && // 在底板上方
          Math.abs(coin.position.y - platform.position.y) < 80 && // 靠近底板
          coin.position.y < platform.position.y // 在底板上方
        );
        
        // 根据采样估算总数
        const estimatedTotal = coinsAbovePlatform.length * 3;
        
        // 如果估计底板上的金币数量超过阈值，执行压力释放
        if (estimatedTotal >= this.pressureSystem.threshold) {
          // 找出底板上最底层的金币（受压最大的）
          // 直接从coins数组中找最下面的几个，而不是排序全部
          const bottomCoins = this.coins.filter(coin => 
            Math.abs(coin.position.x - platform.position.x) < this.collectionArea.width/2 &&
            platform.position.y - coin.position.y < 30 && // 只找最靠近底板的
            coin.position.y < platform.position.y
          );
          
          const bottomLayerCoins = bottomCoins
            .slice(0, Math.min(this.pressureSystem.maxCoinsToRelease, bottomCoins.length));
          
          // 让这些金币穿透底板
          bottomLayerCoins.forEach(coin => {
            // 临时修改金币的碰撞组，使其可以穿透底板
            const originalCollisionFilter = {...coin.collisionFilter};
            
            // 设置为不与底板碰撞
            coin.collisionFilter.group = -1;
            coin.collisionFilter.mask = 0xFFFFFF;
            
            // 给金币一个向下的力，帮助其穿透
            this.Body.applyForce(coin, coin.position, {
              x: 0,
              y: 0.05
            });
            
            // 简化闪烁效果，减少定时器使用
            coin.render.fillStyle = '#FF5722';
            
            // 恢复原始碰撞组，但此时已经穿过底板
            setTimeout(() => {
              coin.collisionFilter = originalCollisionFilter;
              coin.render.fillStyle = undefined; // 恢复原始颜色
            }, 500);
          });
          
          // 更新最后释放时间
          this.pressureSystem.lastReleaseTime = now;
        }
      }
    },
    // 检查金币是否超出边界
    checkCoinsOutOfBounds() {
      // 性能优化：如果金币较少，则每帧都检查，否则间隔检查
      if (this.coins.length > 20 && Date.now() % 3 !== 0) {
        return; // 只在时间戳能被3整除时检查
      }
      
      // 获取所有金币，简单检查是否在coins数组中
      const allCoins = this.coins.slice(); // 创建数组副本
      
      // 检查每个金币
      for (let i = allCoins.length - 1; i >= 0; i--) {
        const coin = allCoins[i];
        
        // 如果金币超出下边界或穿过底板
        if (coin.position.y > 650 || 
            (coin.position.y > this.collectionArea.y + this.collectionArea.height + 100 && 
             Math.abs(coin.velocity.y) > 2)) {
          
          // 从世界和数组中移除金币
          this.World.remove(this.engine.world, coin);
          
          // 记录金额
          if (coin.value) {
            this.totalValue += coin.value;
          }
          
          // 从数组中移除
          this.coins.splice(this.coins.indexOf(coin), 1);
        }
      }
    },
    // 更新底板位置的方法
    updatePlatformPosition() {
      if (!this.platformMotion.platform) return;
      
      // 更新时间 - 使用固定时间增量，不受帧率影响
      this.platformMotion.time += 1;
      
      // 计算新的Y位置 - 正弦波形运动
      const newY = this.platformMotion.baseY + 
                  Math.sin(this.platformMotion.time * this.platformMotion.frequency) * 
                  this.platformMotion.amplitude;
      
      // 使用Matter.js的Body.setPosition方法
      const platform = this.platformMotion.platform;
      
      // 保存当前位置用于计算移动差值
      const oldPlatformY = platform.position.y;
      
      // 使用Body.setPosition来移动底板
      this.Body.setPosition(platform, {
        x: platform.position.x,
        y: newY
      });
      
      // 计算底板移动的距离
      const deltaY = platform.position.y - oldPlatformY;
      
      // 检查障碍物是否需要移动
      if (this.movableObstacle.body && deltaY > 0) { // 只有底板向下移动时才移动障碍物
        const obstacle = this.movableObstacle.body;
        
        // 获取底板和障碍物的边界
        const platformBounds = platform.bounds;
        const obstacleBounds = obstacle.bounds;
        
        // 如果底板与障碍物在水平方向上有重叠
        if (Math.abs(platform.position.x - obstacle.position.x) < (this.collectionArea.width / 2 + this.movableObstacle.width / 2) * 0.9) {
          // 障碍物的正常位置应该在底板下方一点
          const desiredDistanceFromPlatform = 1; // 5像素间隔
          
          // 计算碰撞情况
          const platformBottom = platformBounds.max.y;
          const obstacleTop = obstacleBounds.min.y - 10;
          // 如果底板底部低于(或等于)障碍物顶部，表示它们碰撞或即将碰撞
          if (platformBottom >= obstacleTop) {
            console.log('障碍物与底板碰撞')
            // 移动障碍物，使其与底板保持固定距离
            const newObstacleY = platformBottom + desiredDistanceFromPlatform + (obstacle.bounds.max.y - obstacle.position.y);
            
            // 设置障碍物的新位置，与底板下移移动相同的距离
            this.Body.setPosition(obstacle, {
              x: obstacle.position.x,
              y: newObstacleY
            });

            // 障碍物停止移动
            this.Body.setVelocity(obstacle, { x: 0, y: 0 });
            // 设置障碍物为静态
            this.Body.setStatic(obstacle, true);
            console.log('障碍物停止移动')
          }
        }
      }
      
      // 不管是否与底板碰撞，都清除障碍物的重力影响和速度
      if (this.movableObstacle.body) {
        const obstacle = this.movableObstacle.body;
        
        // 逐渐减小速度，保持水平稳定性
        // this.Body.setVelocity(obstacle, { 
        //   x: obstacle.velocity.x * 0.8,
        //   y: obstacle.velocity.y * 0.2  // 大幅减小垂直速度但不完全清零
        // });
        
        // 清除作用在障碍物上的所有力
        obstacle.force.x = 0;
        obstacle.force.y = 0;
      }
    },
    // 在 beforeUpdate 处理障碍物的重力抵消，确保它不会掉落
    initGravityCompensation() {
      this.Events.on(this.engine, 'beforeUpdate', () => {
        if (this.movableObstacle.body) {
          // 如果物体不是被底板推动中，则抵消重力
          const obstacle = this.movableObstacle.body;
          
          // 根据Matter.js引擎的重力设置计算重力影响
          const gravity = this.engine.gravity;
          const gravityForce = {
            x: -obstacle.mass * gravity.x * gravity.scale,
            y: -obstacle.mass * gravity.y * gravity.scale
          };
          
          // 应用抵消重力的力
          this.Body.applyForce(obstacle, obstacle.position, gravityForce);
        }
      });
    }
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
    // 清理定时器和缓存
    this._coinTextureCache = null
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
