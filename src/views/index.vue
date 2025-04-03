<template>
  <div class="coin-container">
    <button @click="DropCoins" class="drop-button">掉落金币</button>
    <div class="game-area">
      <div ref="coinBox" class="coin-box">
        <div class="collection-area">金币收集区域 (及最终堆落的位置)</div>
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
      // 实例
      engine: null,
      render: null,
      runner: null,
      coins: [],
      totalValue: 0,
      // 区域定义 - 向上移动300像素
      collectionArea: {
        x: 200,  // 中心x坐标
        y: 100,  // 中心y坐标 (从400减为100)
        width: 380, // 宽度
        height: 100 // 高度
      },
      // 掉落区域定义
      dropArea: {
        minX: 60,  // 左边界
        maxX: 340, // 右边界
        y: 30     // 掉落高度
      }
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
        positionIterations: 8, // 增加位置迭代次数提高精度
        velocityIterations: 6  // 增加速度迭代次数提高精度
      })
      
      // 调整引擎重力
      this.engine.gravity.y = 1.2 // 增加重力使金币掉落更快
      this.engine.gravity.scale = 0.002 // 调整重力系数
      
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
            visible: false 
          } 
        }),
        // 收集区域平台 - 左挡板
        this.Bodies.rectangle(this.collectionArea.x - this.collectionArea.width/2, 
                             this.collectionArea.y + this.collectionArea.height/2, 
                             20, this.collectionArea.height, { 
          isStatic: true, 
          render: { 
            fillStyle: '#999',
            visible: false
          },
          friction: 0.1, // 降低摩擦力
          restitution: 0.9 // 增加弹性
        }),
        // 收集区域平台 - 右挡板
        this.Bodies.rectangle(this.collectionArea.x + this.collectionArea.width/2, 
                             this.collectionArea.y + this.collectionArea.height/2, 
                             20, this.collectionArea.height, { 
          isStatic: true, 
          render: { 
            fillStyle: '#999',
            visible: false
          },
          friction: 0.1, // 降低摩擦力
          restitution: 0.9 // 增加弹性
        }),
        // 收集区域平台 - 底板 (保持原样，不改变倾斜度和其他属性)
        this.Bodies.rectangle(this.collectionArea.x, 
                             this.collectionArea.y + this.collectionArea.height, 
                             this.collectionArea.width, 20, { 
          isStatic: true,
          render: { 
            fillStyle: 'rgba(156, 39, 176, 0.5)',
            visible: true
          }
        }),
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
      ]

      // 添加边界到世界
      this.World.add(this.engine.world, walls)

      // 创建运行器
      this.runner = this.Runner.create()
      this.Runner.run(this.runner, this.engine)

      // 运行渲染器
      this.Render.run(this.render)
      
      // 添加碰撞事件
      this.Events.on(this.engine, 'collisionStart', (event) => {
        event.pairs.forEach((pair) => {
          this.playCollisionSound()
        })
      })
      
      console.log('物理引擎初始化完成', {
        collectionArea: this.collectionArea,
        dropArea: this.dropArea,
        engineCreated: !!this.engine,
        renderCreated: !!this.render
      })
    },
    DropCoins() {
      console.log('掉落金币')
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
          mass: 10, // 增加重量
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
      
      return canvas.toDataURL()
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
