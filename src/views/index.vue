<template>
  <div class="game-container">
    <div class="canvas-container" ref="canvasContainer"></div>
    <button class="drop-coin-button" @click="dropCoin">掉落金币</button>
    <div class="coin-counter">金币: {{ coins.length }}</div>
  </div>
</template>

<script>
import Matter from 'matter-js';

export default {
  name: 'CoinPusher',
  data() {
    return {
      engine: null,
      render: null,
      runner: null,
      pusher: null,
      coins: [],
      coinValues: [], // 存储每个金币的金额
      pusherDirection: 1, // 1表示向下移动，-1表示向上移动
      maxPusherY: 0,
      minPusherY: 0,
      pusherSpeed: 2,
      lastUpdate: 0, // 上次更新时间
      activeCoins: [], // 活动区域内的金币
      inactiveCoins: [], // 非活动区域内的金币
      offscreenCanvas: null, // 离屏Canvas
      offscreenContext: null, // 离屏Context
      lastTextRender: 0, // 上次文本渲染时间
      lowPerformanceMode: false, // 低性能模式标志
      renderCounter: 0, // 渲染计数器
      coinTemplates: [] // 存储金币模板用于复制
    };
  },
  mounted() {
    this.initPhysics();
    // 页面加载后自动开始游戏
    this.$nextTick(() => {
      this.startGame();
    });
  },
  beforeDestroy() {
    this.cleanup();
  },
  methods: {
    initPhysics() {
      // 引入Matter.js模块
      const { Engine, Render, Runner, Bodies, Composite, Body, Events, Common, Vector, Sleeping } = Matter;

      // 创建引擎，使用最低的物理精度以减少计算负担
      this.engine = Engine.create({
        enableSleeping: true,
        positionIterations: 3,    // 极低的位置迭代
        velocityIterations: 2,    // 极低的速度迭代
        constraintIterations: 1   // 最低约束迭代
      });
      
      const containerWidth = this.$refs.canvasContainer.clientWidth;
      const containerHeight = this.$refs.canvasContainer.clientHeight;

      // 创建离屏Canvas用于预渲染文本
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = containerWidth;
      this.offscreenCanvas.height = containerHeight;
      this.offscreenContext = this.offscreenCanvas.getContext('2d');
      
      // 创建渲染器，优化渲染参数
      this.render = Render.create({
        element: this.$refs.canvasContainer,
        engine: this.engine,
        options: {
          width: containerWidth,
          height: containerHeight,
          wireframes: false,
          background: '#f0f0f0',
          pixelRatio: 1,
          hasBounds: false,
          showSleeping: false,
          showDebug: false,
          showBroadphase: false,
          showBounds: false,
          showVelocity: false,
          showCollisions: false,
          showSeparations: false,
          showAxes: false,
          showPositions: false,
          showAngleIndicator: false,
          // 启用更简单的渲染方式
          optimizeRender: true,
          // 禁用自动清除可以提高性能
          clearCanvas: true
        }
      });

      // 完全关闭重力，我们将手动控制金币的下落
      this.engine.gravity.y = 0;
      this.engine.world.gravity.scale = 0;

      // 创建边界
      const wallThickness = 50;
      const wallOptions = { 
        isStatic: true,
        restitution: 0.2,
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
            // 碰撞力主要向下，几乎没有横向力
            const collisionForce = 0.0005; // 进一步降低碰撞力
            
            // 计算从A到B的方向，但我们主要关注Y轴分量
            const direction = Vector.normalise(
              Vector.sub(bodyB.position, bodyA.position)
            );
            
            // 对两个物体施加相反方向的力，但主要是垂直分量
            Body.applyForce(bodyA, bodyA.position, {
              x: -direction.x * collisionForce * 0.1, // 大幅减小横向力
              y: Math.max(0, -direction.y * collisionForce * 2) // 增大向下的力
            });
            
            Body.applyForce(bodyB, bodyB.position.x, bodyB.position.y, {
              x: direction.x * collisionForce * 0.1, // 大幅减小横向力
              y: Math.max(0, direction.y * collisionForce * 2) // 增大向下的力
            });
            
            // 在碰撞后增加摩擦力，防止金币滑动
            bodyA.frictionStatic = 15.0;
            bodyB.frictionStatic = 15.0;
            bodyA.frictionAir = 0.4; // 碰撞瞬间增加空气摩擦
            bodyB.frictionAir = 0.4;
            
            // 在碰撞后减小水平速度
            const vA = bodyA.velocity;
            const vB = bodyB.velocity;
            
            Body.setVelocity(bodyA, {
              x: vA.x * 0.8, // 大幅减小水平速度分量
              y: vA.y        // 保持垂直速度
            });
            
            Body.setVelocity(bodyB, {
              x: vB.x * 0.8, // 大幅减小水平速度分量
              y: vB.y        // 保持垂直速度
            });
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
            bodyA.frictionAir = 0.3;
            bodyA.frictionStatic = 15.0;
            
            // 如果速度很小，直接停止
            if (Vector.magnitude(bodyA.velocity) < 0.05) {
              Body.setVelocity(bodyA, { x: 0, y: 0 });
            } else {
              // 碰撞后添加一个轻微的向下力，代替重力
              Body.applyForce(bodyA, bodyA.position, { x: 0, y: 0.0001 });
            }
          }
          
          if (this.coins.includes(bodyB)) {
            bodyB.frictionAir = 0.3;
            bodyB.frictionStatic = 15.0;
            
            // 如果速度很小，直接停止
            if (Vector.magnitude(bodyB.velocity) < 0.05) {
              Body.setVelocity(bodyB, { x: 0, y: 0 });
            } else {
              // 碰撞后添加一个轻微的向下力，代替重力
              Body.applyForce(bodyB, bodyB.position, { x: 0, y: 0.0001 });
            }
          }
        }
      });
      
      // 自定义渲染，使用离屏Canvas和大幅降低的渲染频率
      Events.on(this.render, 'afterRender', () => {
        // 性能测量和自适应优化
        const now = performance.now();
        const elapsed = now - this.lastUpdate;
        
        // 动态调整低性能模式
        if (elapsed > 33 && !this.lowPerformanceMode) {
          this.lowPerformanceMode = true;
          console.log('启用低性能模式');
        } else if (elapsed < 30 && this.lowPerformanceMode && this.coins.length < 30) {
          this.lowPerformanceMode = false;
          console.log('关闭低性能模式');
        }
        
        this.lastUpdate = now;
        
        // 使用计数器控制渲染频率
        this.renderCounter++;
        
        // 根据金币数量和性能模式动态调整渲染跳过率
        let renderSkip;
        if (this.coins.length > 100) {
          renderSkip = 30; // 金币非常多时，极低频率渲染
        } else if (this.coins.length > 50) {
          renderSkip = 20; // 金币较多时，低频率渲染
        } else if (this.lowPerformanceMode) {
          renderSkip = 15; // 低性能模式，较低频率渲染
        } else {
          renderSkip = 8; // 正常模式，适中频率渲染
        }
        
        // 只有在特定的帧进行文本绘制
        if (this.renderCounter % renderSkip !== 0) return;
        
        // 确保间隔足够长再重新绘制
        if (now - this.lastTextRender < 100) return;
        this.lastTextRender = now;
        
        // 获取渲染上下文
        const context = this.render.context;
        
        // 只有当引擎和金币存在时才渲染
        if (this.engine && this.coins.length > 0) {
          // 清除离屏Canvas
          this.offscreenContext.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
          
          // 设置文本渲染参数
          this.offscreenContext.font = '10px Arial';
          this.offscreenContext.fillStyle = 'black';
          this.offscreenContext.textAlign = 'center';
          this.offscreenContext.textBaseline = 'middle';
          this.offscreenContext.imageSmoothingEnabled = false;
          
          // 根据性能模式选择要渲染的金币
          // 低性能模式下只渲染活动区域的金币，高性能模式下渲染所有金币
          const visibleCoins = this.lowPerformanceMode ? 
            this.activeCoins : 
            (this.coins.length > 30 ? this.activeCoins : this.coins);
          
          // 限制每次最多渲染的金币数量
          const maxCoinsToRender = this.lowPerformanceMode ? 20 : 40;
          const coinsToRender = visibleCoins.slice(0, maxCoinsToRender);
          
          coinsToRender.forEach(coin => {
            if (coin && coin.position) {
              const coinIndex = this.coins.indexOf(coin);
              if (coinIndex === -1) return; // 跳过不在数组中的金币
              
              const coinValue = this.coinValues[coinIndex] || '';
              
              // 计算整数位置以减少闪烁
              const x = Math.round(coin.position.x);
              const y = Math.round(coin.position.y);
              
              // 在离屏Canvas上绘制文本
              this.offscreenContext.fillText(coinValue.toString(), x, y);
            }
          });
          
          // 将离屏Canvas绘制到主Canvas上
          context.drawImage(this.offscreenCanvas, 0, 0);
        }
      });
      
      // 每次更新前处理金币，使用区域分层管理
      let updateCounter = 0; // 计数器减少处理频率
      Events.on(this.engine, 'beforeUpdate', () => {
        // 仅在每3帧处理一次，减少处理频率
        updateCounter++;
        if (updateCounter % 3 !== 0) return;
        
        const containerHeight = this.$refs.canvasContainer.clientHeight;
        const containerWidth = this.$refs.canvasContainer.clientWidth;
        
        // 定义活动区域范围
        const activeAreaTop = 0;
        const activeAreaBottom = this.maxPusherY + 200;
        
        // 清空活动和非活动金币数组
        this.activeCoins = [];
        this.inactiveCoins = [];
        
        // 处理金币分层和清理
        for (let i = this.coins.length - 1; i >= 0; i--) {
          const coin = this.coins[i];
          
          if (!coin || !coin.position) continue;
          
          // 移除掉出边界外的金币
          if (coin.position.y > containerHeight + 100 || 
              coin.position.x < -100 || 
              coin.position.x > containerWidth + 100) {
            
            // 从世界和数组中移除金币
            Composite.remove(this.engine.world, coin);
            this.coins.splice(i, 1);
            this.coinValues.splice(i, 1);
            continue;
          }
          
          // 确定金币是否在活动区域内
          const isInActiveArea = 
            (coin.position.y >= activeAreaTop && coin.position.y <= activeAreaBottom) ||
            (!coin.isSleeping && Vector.magnitude(coin.velocity) > 0.05);
          
          // 根据金币是否在活动区域来分组
          if (isInActiveArea) {
            this.activeCoins.push(coin);
            
            // 如果金币处于活动区域，确保它被唤醒
            if (coin.isSleeping && updateCounter % 9 === 0) { // 降低唤醒频率
              Sleeping.set(coin, false);
            }
            
            // 为活动区域内的金币添加微弱的向下力
            if (!coin.isStatic && updateCounter % 6 === 0) { // 降低应用力的频率
              Body.applyForce(coin, coin.position, {
                x: 0,
                y: 0.00001 * coin.mass
              });
            }
          } else {
            this.inactiveCoins.push(coin);
            
            // 低性能模式下，彻底静态化远离活动区域的金币
            if (!coin.isStatic && !coin.isSleeping) {
              if (Vector.magnitude(coin.velocity) < 0.1) {
                Sleeping.set(coin, true);
                
                // 如果金币数量很多，将其设为静态
                if (this.coins.length > 25) {
                  coin._originallyStatic = false; // 记住它原本不是静态的
                  Body.setStatic(coin, true);
                }
              }
            }
          }
        }
      });
      
      // 添加引擎更新后的事件监听
      Events.on(this.engine, 'afterUpdate', () => {
        // 检查所有金币是否在世界中，如果不在则重新添加
        this.coins.forEach((coin, index) => {
          if (coin && this.engine && this.engine.world && 
              this.engine.world.bodies.indexOf(coin) === -1) {
            Composite.add(this.engine.world, coin);
          }
        });
      });

      // 启动渲染器
      Render.run(this.render);

      // 创建运行器
      this.runner = Runner.create({
        isFixed: true,
        delta: 1000 / 25 // 降低到25fps
      });
    },

    createCoins(containerWidth, containerHeight) {
      const { Bodies, Composite, Body, Common } = Matter;
      const coinRadius = 15;
      const coinOptions = {
        restitution: 0.001,
        friction: 3.0,
        frictionAir: 0.3,
        frictionStatic: 15.0,
        density: 0.008,
        mass: 2.0,
        slop: 0.0005,
        inertia: Infinity,
        sleepThreshold: 30,
        timeScale: 1,
        chamfer: { radius: 1 },
        collisionFilter: {
          group: 0,
          category: 0x0002,
          mask: 0xFFFFFFFF
        },
        render: {
          fillStyle: 'gold',
          strokeStyle: '#DAA520',
          lineWidth: 1,
          visible: true,
          opacity: 1
        }
      };

      // 创建随机分布的金币
      const coinCount = Math.min(10, 50);
      const usedPositions = [];
      const minDistance = coinRadius * 2.2;
      
      // 计算可用区域
      const availableAreaStartX = coinRadius * 2;
      const availableAreaEndX = containerWidth - coinRadius * 2;
      const availableAreaStartY = containerHeight / 2;
      const availableAreaEndY = containerHeight - coinRadius * 2;
      
      // 创建几个不同颜色的金币模板供后续复制使用
      const coinColors = ['gold', '#FFD700', '#FFDF00', '#F7D600'];
      
      for (let color of coinColors) {
        const templateCoin = Bodies.circle(0, 0, coinRadius, {
          ...coinOptions,
          render: {
            ...coinOptions.render,
            fillStyle: color
          }
        });
        // 保存模板，但不添加到世界或金币数组中
        this.coinTemplates.push(templateCoin);
      }
      
      for (let i = 0; i < coinCount; i++) {
        let validPosition = false;
        let x, y;
        let attempts = 0;
        
        while (!validPosition && attempts < 50) {
          x = availableAreaStartX + Math.random() * (availableAreaEndX - availableAreaStartX);
          y = availableAreaStartY + Math.random() * (availableAreaEndY - availableAreaStartY);
          
          validPosition = true;
          for (const pos of usedPositions) {
            const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
            if (distance < minDistance) {
              validPosition = false;
              break;
            }
          }
          
          attempts++;
        }
        
        if (!validPosition) continue;
        
        usedPositions.push({ x, y });
        
        // 从模板中随机选择一个金币进行复制
        const templateIndex = Math.floor(Math.random() * this.coinTemplates.length);
        const templateCoin = this.coinTemplates[templateIndex];
        
        // 创建金币 - 通过克隆模板而不是重新创建
        const coin = this.cloneCoin(templateCoin, x, y);
        
        // 为金币分配一个随机值（1-10）
        const coinValue = Math.floor(Math.random() * 10) + 1;
        this.coinValues.push(coinValue);
        
        this.coins.push(coin);
        Composite.add(this.engine.world, coin);
      }
    },
    
    // 新增方法：复制金币
    cloneCoin(templateCoin, x, y) {
      const { Bodies, Body } = Matter;
      
      // 创建与模板相同属性的新金币
      const coin = Bodies.circle(
        x, y, 
        templateCoin.circleRadius, 
        {
          restitution: templateCoin.restitution,
          friction: templateCoin.friction,
          frictionAir: templateCoin.frictionAir,
          frictionStatic: templateCoin.frictionStatic,
          density: templateCoin.density,
          mass: templateCoin.mass,
          slop: templateCoin.slop,
          sleepThreshold: templateCoin.sleepThreshold,
          timeScale: templateCoin.timeScale,
          chamfer: templateCoin.chamfer,
          collisionFilter: templateCoin.collisionFilter,
          render: {
            fillStyle: templateCoin.render.fillStyle,
            strokeStyle: templateCoin.render.strokeStyle,
            lineWidth: templateCoin.render.lineWidth,
            visible: true,
            opacity: 1
          },
          isStatic: true
        }
      );
      
      // 设置其他属性
      Body.setInertia(coin, Infinity);
      
      return coin;
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

    dropCoin() {
      const { Composite, Body, Vector, Sleeping } = Matter;
      
      // 获取容器宽高
      const containerWidth = this.$refs.canvasContainer.clientWidth;
      const containerHeight = this.$refs.canvasContainer.clientHeight;
      
      // 一次掉落1-3个金币
      const coinCount = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < coinCount; i++) {
        // 随机横向位置，覆盖推动器下方区域
        const pusherWidth = this.pusher.bounds.max.x - this.pusher.bounds.min.x;
        const minX = this.pusher.position.x - pusherWidth / 2 + 15;
        const maxX = this.pusher.position.x + pusherWidth / 2 - 15;
        const randomX = minX + Math.random() * (maxX - minX);
        
        // 在推动器下方不远处
        const coinY = this.pusher.position.y + 30 + (i * 5);
        
        // 如果没有模板金币，创建一个
        if (this.coinTemplates.length === 0) {
          const { Bodies } = Matter;
          const templateCoin = Bodies.circle(0, 0, 15, {
            restitution: 0.001,
            friction: 3.0,
            frictionAir: 0.3,
            frictionStatic: 15.0,
            density: 0.008,
            mass: 2.0,
            slop: 0.0005,
            inertia: Infinity,
            sleepThreshold: 30,
            timeScale: 1,
            chamfer: { radius: 1 },
            collisionFilter: {
              group: 0,
              category: 0x0002,
              mask: 0xFFFFFFFF
            },
            render: {
              fillStyle: 'gold',
              strokeStyle: '#DAA520',
              lineWidth: 1,
              visible: true
            }
          });
          this.coinTemplates.push(templateCoin);
        }
        
        // 从金币模板中随机选择一个
        const templateIndex = Math.floor(Math.random() * this.coinTemplates.length);
        const templateCoin = this.coinTemplates[templateIndex];
        
        // 复制金币
        const coin = this.cloneCoin(templateCoin, randomX, coinY);
        
        // 设置为非静态
        Body.setStatic(coin, false);
        
        // 为金币分配一个随机值（1-10）
        const coinValue = Math.floor(Math.random() * 10) + 1;
        this.coinValues.push(coinValue);
        
        // 添加到世界和金币数组中
        this.coins.push(coin);
        Composite.add(this.engine.world, coin);
        
        // 添加轻微的初始力，使其下落更自然
        const initialForce = {
          x: (Math.random() - 0.5) * 0.0001,
          y: 0.0005
        };
        Body.applyForce(coin, coin.position, initialForce);
      }
      
      // 添加视觉反馈（按钮效果）
      const button = document.querySelector('.drop-coin-button');
      if (button) {
        button.classList.add('active');
        setTimeout(() => {
          button.classList.remove('active');
        }, 200);
      }
    },

    startGame() {
      const { Runner, Body } = Matter;
      
      // 创建运行器并使用较低的更新频率
      this.runner = Runner.create({
        isFixed: true,
        delta: 1000 / 25 // 降低到25fps
      });
      
      // 启动运行器
      Runner.run(this.runner, this.engine);
      
      // 释放金币
      this.releaseCoins();
      
      // 开始推动器动画
      this.animatePusher();
      
      // 添加定期内存清理
      this.memoryCleanupInterval = setInterval(() => {
        // 强制垃圾回收不在世界中的金币引用
        if (this.coins.length > 40) {
          // 找出已经不在物理世界但仍在数组中的金币
          const validCoins = [];
          const validValues = [];
          
          for (let i = 0; i < this.coins.length; i++) {
            const coin = this.coins[i];
            // 检查金币是否还在物理世界中
            if (coin && this.engine.world.bodies.indexOf(coin) !== -1) {
              validCoins.push(coin);
              validValues.push(this.coinValues[i]);
            }
          }
          
          // 更新数组，只保留有效的金币
          this.coins = validCoins;
          this.coinValues = validValues;
          
          console.log('清理完成，当前金币数量:', this.coins.length);
        }
      }, 10000); // 每10秒执行一次
      
      // 添加性能自适应监控定时器
      this.performanceMonitor = setInterval(() => {
        // 如果金币数量超过一定值，激进优化物理计算
        if (this.coins.length > 40 && !this.lowPerformanceMode) {
          this.lowPerformanceMode = true;
          
          // 降低更新频率
          this.runner.delta = 1000 / 15; // 降至15fps
          
          // 对非活动区域的金币设置为静态
          this.inactiveCoins.forEach(coin => {
            if (!coin.isStatic && !coin._originallyStatic) {
              coin._originallyStatic = false;
              Body.setStatic(coin, true);
            }
          });
        } else if (this.coins.length < 30 && this.lowPerformanceMode) {
          this.lowPerformanceMode = false;
          
          // 恢复更新频率
          this.runner.delta = 1000 / 25; // 恢复25fps
          
          // 恢复被设为静态的金币
          this.inactiveCoins.forEach(coin => {
            if (coin.isStatic && coin._originallyStatic === false) {
              Body.setStatic(coin, false);
            }
          });
        }
      }, 2000); // 每2秒检查一次
    },

    releaseCoins() {
      const { Body, Common, Sleeping, Composite } = Matter;
      
      // 解除所有金币的静态状态，但保持极高摩擦力
      this.coins.forEach(coin => {
        // 解除静态状态
        Body.setStatic(coin, false);
        
        // 确保金币有极高摩擦力的物理属性
        Body.setDensity(coin, 0.008);
        Body.setMass(coin, 2.0);
        // Matter.js中没有setFriction方法，需要直接设置属性
        coin.friction = 3.0;             // 更高的摩擦力
        coin.frictionStatic = 15.0;      // 更高的静摩擦力
        coin.frictionAir = 0.3;          // 更高的空气摩擦
        coin.restitution = 0.001;        // 几乎没有反弹
        Body.setInertia(coin, Infinity); // 极高惯性，防止自转
        
        // 将速度设为0，避免任何初始运动
        Body.setVelocity(coin, { x: 0, y: 0 });
        Body.setAngularVelocity(coin, 0);
        
        // 为了确保金币不会因初始微小力而移动，可以设置一个睡眠状态
        Sleeping.set(coin, true);
        
        // 片刻后唤醒，但依然保持高摩擦力
        setTimeout(() => {
          if (coin && this.engine && this.engine.world && 
              this.engine.world.bodies.indexOf(coin) !== -1) {
            Sleeping.set(coin, false);
          }
        }, 500);
      });
    },

    animatePusher() {
      const { Body, Vector, Sleeping } = Matter;
      
      // 使用更低的更新频率
      const intervalId = setInterval(() => {
        if (!this.engine || !this.pusher) {
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
        
        // 只有推动器向下移动时才施加强力，且只处理活动区域的金币
        if (this.pusherDirection === 1 && this.activeCoins.length > 0) {
          // 限制每次最多处理的金币数量
          const maxCoinsToProcess = Math.min(this.activeCoins.length, 20);
          const coinsToProcess = this.activeCoins.slice(0, maxCoinsToProcess);
          
          coinsToProcess.forEach(coin => {
            if (!coin || !coin.position) return;
            
            const distance = Vector.magnitude(
              Vector.sub(this.pusher.position, coin.position)
            );
            
            // 如果金币在推动器下方且距离较近，施加强力
            if (coin.position.y > this.pusher.position.y && distance < 120) {
              // 计算推动方向（主要是向下）
              const force = {
                x: (coin.position.x - this.pusher.position.x) * 0.000005,
                y: 0.002
              };
              
              // 直接施加力
              Body.applyForce(coin, coin.position, force);
              
              // 确保碰撞后的金币不会因重力滑落
              coin.frictionAir = 0.3;
            }
          });
        } else if (this.activeCoins.length > 0) {
          // 推动器向上移动时，确保金币保持高摩擦力
          // 同样限制处理数量
          const maxCoinsToProcess = Math.min(this.activeCoins.length, 15);
          const coinsToProcess = this.activeCoins.slice(0, maxCoinsToProcess);
          
          coinsToProcess.forEach(coin => {
            if (!coin) return;
            
            coin.frictionStatic = 15.0;
            coin.frictionAir = 0.3;
            
            // 推动器向上移动时确保金币停止移动
            if (Vector.magnitude(coin.velocity) < 0.1) {
              Body.setVelocity(coin, { x: 0, y: 0 });
              Sleeping.set(coin, true);
            }
          });
        }
      }, 40); // 降至25fps
      
      // 保存intervalId以便于在清理时使用
      this.animationIntervalId = intervalId;
    },

    cleanup() {
      const { Render, Runner, Events, Engine, Composite } = Matter;
      
      // 停止游戏
      
      // 清除动画间隔
      if (this.animationIntervalId) {
        clearInterval(this.animationIntervalId);
        this.animationIntervalId = null;
      }
      
      // 清除性能监控定时器
      if (this.performanceMonitor) {
        clearInterval(this.performanceMonitor);
        this.performanceMonitor = null;
      }
      
      // 清除内存清理定时器
      if (this.memoryCleanupInterval) {
        clearInterval(this.memoryCleanupInterval);
        this.memoryCleanupInterval = null;
      }
      
      // 清除所有事件监听
      if (this.engine) {
        Events.off(this.engine);
      }
      
      // 清空物理世界中的所有物体
      if (this.engine && this.engine.world) {
        Composite.clear(this.engine.world);
      }
      
      // 重置引擎
      if (this.engine) {
        Engine.clear(this.engine);
      }
      
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
      
      // 清除离屏Canvas
      if (this.offscreenCanvas) {
        this.offscreenCanvas = null;
        this.offscreenContext = null;
      }
      
      // 帮助垃圾回收
      this.coins.length = 0;
      this.coinValues.length = 0;
      this.activeCoins.length = 0;
      this.inactiveCoins.length = 0;
      
      // 显式置空
      this.coins = null;
      this.coinValues = null;
      this.activeCoins = null;
      this.inactiveCoins = null;
      this.pusher = null;
      
      // 强制垃圾回收（虽然在JavaScript中不能直接调用）
      setTimeout(() => {
        this.coins = [];
        this.coinValues = [];
        this.activeCoins = [];
        this.inactiveCoins = [];
      }, 0);
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

.drop-coin-button {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  font-size: 18px;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.3s;
  z-index: 10;
}

.drop-coin-button:hover {
  background-color: #c0392b;
}

.drop-coin-button.active {
  transform: translateX(-50%) scale(0.95);
  background-color: #c0392b;
}

.drop-coin-button.limit-reached {
  background-color: #888;
  transform: translateX(-50%) scale(0.95);
  cursor: not-allowed;
}

.coin-counter {
  position: absolute;
  top: 20px;
  right: 20px;
  padding: 8px 16px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  border-radius: 5px;
  font-size: 16px;
  font-weight: bold;
}
</style>
