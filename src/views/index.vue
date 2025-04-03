<template>
  <div class="game-container">
    <div class="canvas-container" ref="canvasContainer"></div>
    <button class="start-button" @click="startGame" v-if="!gameStarted">开始游戏</button>
  </div>
</template>

<script>
import Matter from 'matter-js';

export default {
  name: 'CoinPusher',
  data() {
    return {
      gameStarted: false,
      engine: null,
      render: null,
      runner: null,
      pusher: null,
      coins: [],
      pusherDirection: 1, // 1表示向下移动，-1表示向上移动
      maxPusherY: 0,
      minPusherY: 0,
      pusherSpeed: 2
    };
  },
  mounted() {
    this.initPhysics();
  },
  beforeDestroy() {
    this.cleanup();
  },
  methods: {
    initPhysics() {
      // 引入Matter.js模块
      const { Engine, Render, Runner, Bodies, Composite, Body, Events, Common, Vector } = Matter;

      // 创建引擎
      this.engine = Engine.create({
        enableSleeping: true,     // 启用睡眠，帮助静止物体优化
        positionIterations: 12,   // 更高的位置迭代
        velocityIterations: 10    // 更高的速度迭代
      });
      
      const containerWidth = this.$refs.canvasContainer.clientWidth;
      const containerHeight = this.$refs.canvasContainer.clientHeight;

      // 创建渲染器
      this.render = Render.create({
        element: this.$refs.canvasContainer,
        engine: this.engine,
        options: {
          width: containerWidth,
          height: containerHeight,
          wireframes: false,
          background: '#f0f0f0',
          showCollisions: true
        }
      });

      // 几乎关闭重力
      this.engine.gravity.y = 0.001;
      this.engine.world.gravity.scale = 0.000001;

      // 创建边界
      const wallThickness = 50;
      const wallOptions = { 
        isStatic: true,
        restitution: 0.4,
        friction: 0.1,
        render: { 
          fillStyle: '#333'
        }
      };

      // 底部边界
      const ground = Bodies.rectangle(
        containerWidth / 2,
        containerHeight + wallThickness / 2 - 5,
        containerWidth,
        wallThickness,
        wallOptions
      );

      // 左边界
      const leftWall = Bodies.rectangle(
        -wallThickness / 2 + 5,
        containerHeight / 2,
        wallThickness,
        containerHeight * 2,
        wallOptions
      );

      // 右边界
      const rightWall = Bodies.rectangle(
        containerWidth + wallThickness / 2 - 5,
        containerHeight / 2,
        wallThickness,
        containerHeight * 2,
        wallOptions
      );

      // 添加边界到世界
      Composite.add(this.engine.world, [ground, leftWall, rightWall]);

      // 创建金币
      this.createCoins(containerWidth, containerHeight);

      // 创建推动器
      this.createPusher(containerWidth, containerHeight);

      // 添加碰撞事件监听
      Events.on(this.engine, 'collisionStart', (event) => {
        const pairs = event.pairs;
        
        for (let i = 0; i < pairs.length; i++) {
          const pair = pairs[i];
          const bodyA = pair.bodyA;
          const bodyB = pair.bodyB;
          
          // 确保金币与金币之间的碰撞有效
          if (this.coins.includes(bodyA) && this.coins.includes(bodyB)) {
            // 增加碰撞反馈力
            const collisionForce = 0.0002; // 降低碰撞力，使其更稳定
            
            // 计算从A到B的方向
            const direction = Vector.normalise(
              Vector.sub(bodyB.position, bodyA.position)
            );
            
            // 对两个物体施加相反方向的力
            Body.applyForce(bodyA, bodyA.position, {
              x: -direction.x * collisionForce,
              y: -direction.y * collisionForce
            });
            
            Body.applyForce(bodyB, bodyB.position, {
              x: direction.x * collisionForce,
              y: direction.y * collisionForce
            });
            
            // 在碰撞后增加摩擦力，防止金币滑动
            bodyA.frictionStatic = 10.0;
            bodyB.frictionStatic = 10.0;
          }
          
          // 推动器和金币碰撞
          if ((bodyA === this.pusher && this.coins.includes(bodyB)) ||
              (bodyB === this.pusher && this.coins.includes(bodyA))) {
            const coin = this.coins.includes(bodyA) ? bodyA : bodyB;
            
            // 只有当推动器向下移动时才增加碰撞力
            if (this.pusherDirection === 1) {
              const force = {
                x: 0,
                y: 0.001 // 向下的力
              };
              
              Body.applyForce(coin, coin.position, force);
            }
          }
        }
      });

      // 碰撞结束后确保金币保持静止
      Events.on(this.engine, 'collisionEnd', (event) => {
        const pairs = event.pairs;
        
        for (let i = 0; i < pairs.length; i++) {
          const pair = pairs[i];
          const bodyA = pair.bodyA;
          const bodyB = pair.bodyB;
          
          // 对碰撞后的金币增加阻力
          if (this.coins.includes(bodyA)) {
            bodyA.frictionAir = 0.2;
            bodyA.frictionStatic = 10.0;
            
            // 如果速度很小，直接停止
            if (Vector.magnitude(bodyA.velocity) < 0.05) {
              Body.setVelocity(bodyA, { x: 0, y: 0 });
            }
          }
          
          if (this.coins.includes(bodyB)) {
            bodyB.frictionAir = 0.2;
            bodyB.frictionStatic = 10.0;
            
            // 如果速度很小，直接停止
            if (Vector.magnitude(bodyB.velocity) < 0.05) {
              Body.setVelocity(bodyB, { x: 0, y: 0 });
            }
          }
        }
      });
      
      // 添加引擎更新后的事件监听
      Events.on(this.engine, 'afterUpdate', () => {
        // 检查所有金币是否在世界中，如果不在则重新添加
        this.coins.forEach((coin) => {
          if (!Composite.get(this.engine.world, coin.id, 'body')) {
            Composite.add(this.engine.world, coin);
          }
        });
      });

      // 启动渲染器
      Render.run(this.render);

      // 创建运行器
      this.runner = Runner.create({
        isFixed: true
      });
    },

    createCoins(containerWidth, containerHeight) {
      const { Bodies, Composite, Body } = Matter;
      const coinRadius = 15;
      const coinOptions = {
        restitution: 0.01,        // 几乎没有反弹
        friction: 2.0,            // 超高摩擦力
        frictionAir: 0.2,         // 极高空气摩擦
        frictionStatic: 10.0,     // 极高静摩擦力
        density: 0.005,           // 增加密度
        mass: 1.5,                // 增加质量
        slop: 0.001,              // 几乎没有穿透
        inertia: Infinity,        // 极高惯性，使旋转更难
        sleepThreshold: 60,       // 睡眠阈值高，不容易进入睡眠状态
        timeScale: 1,             // 标准时间尺度
        collisionFilter: {
          group: 0,
          category: 0x0002,
          mask: 0xFFFFFFFF
        },
        render: {
          fillStyle: 'gold',
          strokeStyle: '#DAA520',
          lineWidth: 2
        }
      };

      // 创建多个金币，排列成堆
      const coinRows = 5;
      const coinsPerRow = 8;
      const startX = containerWidth / 2 - ((coinsPerRow - 1) * coinRadius);
      const startY = containerHeight / 2;

      // 添加一点随机偏移使堆更自然
      for (let row = 0; row < coinRows; row++) {
        for (let col = 0; col < coinsPerRow; col++) {
          const offsetX = Math.random() * 2 - 1; // -1到1之间的随机偏移
          const offsetY = Math.random() * 2 - 1;
          const x = startX + col * coinRadius * 2 + offsetX;
          const y = startY - row * coinRadius * 2 + offsetY;
          
          const coin = Bodies.circle(x, y, coinRadius, {
            ...coinOptions,
            isStatic: true // 初始时静止不动
          });
          
          this.coins.push(coin);
          Composite.add(this.engine.world, coin);
        }
      }
    },

    createPusher(containerWidth, containerHeight) {
      const { Bodies, Composite } = Matter;
      
      // 创建推动器（顶部物体）
      this.pusher = Bodies.rectangle(
        containerWidth / 2,
        containerHeight / 6,
        containerWidth,
        20,
        {
          isStatic: true,
          density: 0.5,           // 更大的密度
          restitution: 0.05,      // 几乎没有反弹
          friction: 0.8,          // 高摩擦
          frictionStatic: 1.0,    // 高静摩擦
          collisionFilter: {
            group: 0,
            category: 0x0001,
            mask: 0xFFFFFFFF
          },
          render: {
            fillStyle: '#e74c3c'
          }
        }
      );

      // 设置推动器的最高和最低位置
      this.minPusherY = containerHeight / 6;
      this.maxPusherY = containerHeight / 3;

      Composite.add(this.engine.world, this.pusher);
    },

    startGame() {
      const { Runner } = Matter;
      this.gameStarted = true;
      
      // 启动游戏运行器
      Runner.run(this.runner, this.engine);
      
      // 释放金币（取消静态状态）
      this.releaseCoins();
      
      // 开始推动器动画
      this.animatePusher();
    },

    releaseCoins() {
      const { Body, Common, Sleeping } = Matter;
      
      // 解除所有金币的静态状态，但保持极高摩擦力
      this.coins.forEach(coin => {
        // 解除静态状态
        Body.setStatic(coin, false);
        
        // 确保金币有极高摩擦力的物理属性
        Body.setDensity(coin, 0.005);
        Body.setMass(coin, 1.5);
        // Matter.js中没有setFriction方法，需要直接设置属性
        coin.friction = 2.0;             // 超高摩擦力
        coin.frictionStatic = 10.0;      // 极高静摩擦力
        coin.frictionAir = 0.2;          // 极高空气摩擦
        coin.restitution = 0.01;         // 几乎没有反弹
        Body.setInertia(coin, Infinity); // 极高惯性，防止自转
        
        // 将速度设为0，避免任何初始运动
        Body.setVelocity(coin, { x: 0, y: 0 });
        Body.setAngularVelocity(coin, 0);
        
        // 为了确保金币不会因初始微小力而移动，可以设置一个睡眠状态
        // 直接设置睡眠属性而不是使用不存在的方法
        Sleeping.set(coin, true);
        // 片刻后唤醒，但依然保持高摩擦力
        setTimeout(() => {
          Sleeping.set(coin, false);
        }, 500);
      });
    },

    animatePusher() {
      const { Body, Vector } = Matter;
      
      // 设置动画间隔
      const intervalId = setInterval(() => {
        if (!this.gameStarted) {
          clearInterval(intervalId);
          return;
        }

        // 移动推动器
        const currentY = this.pusher.position.y;
        
        // 改变方向
        if (currentY >= this.maxPusherY) {
          this.pusherDirection = -1; // 向上移动
        } else if (currentY <= this.minPusherY) {
          this.pusherDirection = 1; // 向下移动
        }
        
        // 应用移动
        Body.setPosition(this.pusher, {
          x: this.pusher.position.x,
          y: currentY + (this.pusherDirection * this.pusherSpeed)
        });
        
        // 只有推动器向下移动时才施加强力
        if (this.pusherDirection === 1) {
          this.coins.forEach(coin => {
            const distance = Vector.magnitude(
              Vector.sub(this.pusher.position, coin.position)
            );
            
            // 如果金币在推动器下方且距离较近，施加强力
            if (coin.position.y > this.pusher.position.y && distance < 120) {
              // 计算推动方向（主要是向下）
              const force = {
                x: (coin.position.x - this.pusher.position.x) * 0.00001, // 轻微的水平分量
                y: 0.001 // 强力向下分量
              };
              
              // 直接施加力
              Body.applyForce(coin, coin.position, force);
              
              // 确保碰撞后的金币不会因重力滑落
              coin.frictionAir = 0.2; // 临时增加空气摩擦
            }
          });
        } else {
          // 推动器向上移动时，确保金币保持高摩擦力
          this.coins.forEach(coin => {
            coin.frictionStatic = 10.0;
            coin.frictionAir = 0.2;
          });
        }
      }, 16); // 约60fps
      
      // 保存intervalId以便于在清理时使用
      this.animationIntervalId = intervalId;
    },

    cleanup() {
      const { Render, Runner, Events, Engine, Composite } = Matter;
      
      // 停止游戏
      this.gameStarted = false;
      
      // 清除动画间隔
      if (this.animationIntervalId) {
        clearInterval(this.animationIntervalId);
        this.animationIntervalId = null;
      }
      
      // 清除所有事件监听
      Events.off(this.engine);
      
      // 清空物理世界中的所有物体
      Composite.clear(this.engine.world);
      
      // 重置引擎
      Engine.clear(this.engine);
      
      // 清理资源
      if (this.render) {
        Render.stop(this.render);
        if (this.render.canvas && this.render.canvas.remove) {
          this.render.canvas.remove();
        }
        this.render.canvas = null;
        this.render.context = null;
        this.render.textures = {};
        this.render = null;
      }
      
      if (this.runner) {
        Runner.stop(this.runner);
        this.runner = null;
      }
      
      // 清空金币数组
      this.coins = [];
      this.pusher = null;
    }
  }
};
</script>

<style scoped>
.game-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.canvas-container {
  width: 500px;
  height: 600px;
  border: 2px solid #333;
  border-radius: 5px;
  overflow: hidden;
  background-color: #f0f0f0;
}

.start-button {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 12px 24px;
  font-size: 18px;
  background-color: #2ecc71;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.start-button:hover {
  background-color: #27ae60;
}
</style>
