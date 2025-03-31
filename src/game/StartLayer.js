import { getTargetBoxPos, direction, caleRelateTargetPos, setPivot, getCollisionRegion, getDistance } from './utils';
import inside from 'point-in-polygon';

class StartLayer extends Tiny.Container {
  constructor() {
    super();

    // 初始化地图角度为30度
    this.mapAngle = 30;
    
    this.init();
    this.handleTouch();
  }

  // 设置地图角度
  setMapAngle(angle) {
    this.mapAngle = angle;
  }
  
  // 用于获取当前地图角度
  getMapAngle() {
    return this.mapAngle;
  }

  init() {
    this.ant = this.createAnt();
    this.currentBox = this.createBox();
    // 将蚂蚁放到 box 组中
    this.currentBox.addChild(this.ant);
    // 位置也得调整下
    this.ant.setPosition(100, 50);

    this.isJumping = false; // 在跳的过程中，不能再跳
    this.targetBoxDirection = direction.right; // 下一个盒子的方向
    this.targetBoxDelta = 200; // 下一个盒子的距离
    this.numInOneDirection = 2; // 在一个方向上的连续盒子数量

    // 统一管理所有 box
    this.boxes = [];
    this.boxes.push(this.currentBox);

    // 再来一个盒子
    this.targetBox = this.dropBox();
  }

  reset() {
    // 移除事件监听器
    if (this.removeEventListeners) {
      this.removeEventListeners();
    }
    
    // 清理力度指示器
    if (this.powerInterval) {
      clearInterval(this.powerInterval);
      this.powerInterval = null;
    }
    
    // 停止所有动画
    if (this.pressTween) {
      this.pressTween.stop();
      this.pressTween = null;
    }
    
    // 停止所有正在进行的动画
    Tiny.TWEEN.removeAll();
    
    // 清空所有元素
    while (this.children.length > 0) {
      const child = this.children[this.children.length - 1];
      
      // 如果是精灵动画，停止动画
      if (child.stop && typeof child.stop === 'function') {
        child.stop();
      }
      
      // 如果有destroy方法，调用它进行彻底清理
      if (child.destroy && typeof child.destroy === 'function') {
        child.destroy();
      } else {
        child.parent.removeChild(child);
      }
    }

    // 清空数组引用
    this.boxes = null;

    // 恢复屏幕坐标
    this.setPosition(0, 0);

    // 重新加载初始元素
    this.init();
    
    // 重新添加触摸事件
    this.handleTouch();
  }

  createAnt() {
    // 使用小女孩精灵图代替蚂蚁
    const frames = [];
    for (let i = 1; i <= 2; i++) {
      frames.push(Tiny.Texture.fromFrame(`hero_${i}`));
    }
    const hero = new Tiny.AnimatedSprite(frames);
    hero.animationSpeed = 0.1;
    hero.loop = true;
    
    // canvas 默认旋转中心是在左上角，这样定位起来比较麻烦，所以这里将角色的脚底作为定位中心
    hero.setPivot(hero.width / 2, hero.height);
    // 先随便定个位置吧
    hero.setPosition(100, 300);
    hero.name = 'ant'; // 保持原有名称以避免修改过多代码
    
    // 加到 container 中来渲染
    this.addChild(hero);
    
    // 停止在第一帧
    hero.gotoAndStop(0);
    
    return hero;
  }

  createBox() {
    const box = Tiny.Sprite.fromImage(Tiny.resources.boxPng);
    box.setPivot(box.width / 2, box.height);
    box.setPosition(100, 600);
    box.name = 'box';

    // 如果使用 addChild，会发现盒子将蚂蚁盖起来了，所以使用 addChildAt 来将盒子放到蚂蚁下面
    this.addChildAt(box, 0);
    return box;
  }

  handleTouch() {
    const canvas = Tiny.app.view;
    const supportTouch = 'ontouchstart' in window;
    
    // 创建力度指示器
    this.createPowerIndicator();
    
    // 保存事件监听器的引用，以便后续可以移除
    this.touchStartHandler = () => {
      this.pressTime = +Date.now();
      // 蚂蚁压缩
      this.compress();
      
      // 显示并开始更新力度指示器
      this.startPowerIndicator();
    };
    
    this.touchEndHandler = () => {
      // 蚂蚁恢复
      this.compressRestore();
      
      // 停止力度指示器动画
      this.stopPowerIndicator();

      // 跳的过程中就不能再跳了
      if (this.isJumping) return;
      this.isJumping = true;

      const deltaTime = +Date.now() - this.pressTime;
      var targetBoxDelta = 0.8 * deltaTime;
      const maxTargetDelta = 600;
      if (targetBoxDelta > maxTargetDelta) {
        targetBoxDelta = maxTargetDelta;
      }

      // 开始跳跃动画
      if (this.ant.play && typeof this.ant.play === 'function') {
        this.ant.play();
      }

      // var targetBoxDelta = 270;
      this.jump(targetBoxDelta, this.targetBoxDirection, () => {
        // 跳完后
        this.isJumping = false;
        
        // 停止动画，回到静止状态
        if (this.ant.stop && typeof this.ant.stop === 'function') {
          this.ant.gotoAndStop(0);
        }

        const jumpResult = this.jumpResult();
        if (jumpResult.isInside) {
          this._jumpSuccess();
        } else {
          const dropAction = jumpResult.dropAction;
          console.log(dropAction);
          this._jumpFail(dropAction);
        }
      });
    };

    this.pressTime = +Date.now();
    canvas.addEventListener(supportTouch ? 'touchstart' : 'mousedown', this.touchStartHandler);
    canvas.addEventListener(supportTouch ? 'touchend' : 'mouseup', this.touchEndHandler);
    
    // 添加析构方法，用于移除事件监听
    this.removeEventListeners = () => {
      canvas.removeEventListener(supportTouch ? 'touchstart' : 'mousedown', this.touchStartHandler);
      canvas.removeEventListener(supportTouch ? 'touchend' : 'mouseup', this.touchEndHandler);
    };
  }
  
  // 创建力度指示器
  createPowerIndicator() {
    // 创建力度背景条
    const powerBg = new Tiny.Graphics();
    powerBg.beginFill(0x000000, 0.3);
    powerBg.drawRect(0, 0, 200, 10);
    powerBg.endFill();
    powerBg.position.set(50, 100);
    powerBg.visible = false;
    this.addChild(powerBg);
    this.powerBg = powerBg;
    
    // 创建力度填充条
    const powerBar = new Tiny.Graphics();
    powerBar.beginFill(0xff0000);
    powerBar.drawRect(0, 0, 0, 10);
    powerBar.endFill();
    powerBar.position.set(50, 100);
    powerBar.visible = false;
    this.addChild(powerBar);
    this.powerBar = powerBar;
  }
  
  // 开始显示力度指示器
  startPowerIndicator() {
    this.powerBg.visible = true;
    this.powerBar.visible = true;
    
    // 重置力度条宽度
    this.powerBar.clear();
    this.powerBar.beginFill(0xff0000);
    this.powerBar.drawRect(0, 0, 0, 10);
    this.powerBar.endFill();
    
    // 创建力度条动画
    this.powerInterval = setInterval(() => {
      const deltaTime = +Date.now() - this.pressTime;
      const width = Math.min(deltaTime / 3, 200); // 最大宽度200px
      
      this.powerBar.clear();
      this.powerBar.beginFill(width < 100 ? 0x00ff00 : (width < 150 ? 0xffff00 : 0xff0000));
      this.powerBar.drawRect(0, 0, width, 10);
      this.powerBar.endFill();
    }, 16);
  }
  
  // 停止力度指示器动画
  stopPowerIndicator() {
    if (this.powerInterval) {
      clearInterval(this.powerInterval);
      this.powerInterval = null;
    }
    
    this.powerBg.visible = false;
    this.powerBar.visible = false;
  }

  _jumpSuccess() {
    // 因为要更换 ant 的 group，所以要计算 ant 相对 targetBox 的位置
    var { x, y } = caleRelateTargetPos(this.ant, this.targetBox);
    this.ant.setPosition(x, y);
    this.targetBox.addChild(this.ant);

    this.currentBox = this.targetBox;
    this.boxes.push(this.currentBox);

    // 确定下一个盒子的方向和位移
    this.setTargetBoxDirectionAndDelta();

    // 移动屏幕
    this.sceneMove();

    // 再来一个盒子
    this.targetBox = this.dropBox();
  }

  _jumpFail(dropAction) {
    this.antFall(dropAction, () => {
      this.reset();
    });
  }

  jump(targetDelta, direction, onComplete) {
    setPivot(this.ant, this.ant.width / 2, this.ant.height / 2);

    const maxHeight = 200; // 跳的最高点

    const ant = this.ant; // 上面创建的蚂蚁实例
    const originX = ant.position.x;
    const originY = ant.position.y;
    const targetPos = getTargetBoxPos(this.ant.position, targetDelta, direction, this.mapAngle);
    const deltaX = targetPos.x - originX;

    const tween = new Tiny.TWEEN.Tween({ // 起始值
      rotation: 0,
      x: originX,
      y: originY,
    }).to({ // 结束值
      rotation: [180 * direction, 320 * direction, 360 * direction], // 旋转 1 周
      x: [originX + deltaX * 0.5, originX + deltaX * 0.8, originX + deltaX],
      y: [targetPos.y - maxHeight * 0.5, targetPos.y - maxHeight * 0.2, targetPos.y],
    }, 1000).onUpdate(function() {
      // 设置位置
      ant.setPosition(this.x, this.y);
      // 需要将角度转换为弧度，然后设置旋转
      ant.setRotation(Tiny.deg2radian(this.rotation));
    }).onComplete(function () {
      // 动画结束的回调
      onComplete();
    });

    // 动画开始
    tween.start();
  }

  jumpResult() {
    const antRegion = this.getAntRegion();
    const boxRegion = this.getBoxRegion();

    var isInside = inside(antRegion, boxRegion);

    var dropAction = '';
    if (!isInside) {
      dropAction = this.getDropAction(antRegion, boxRegion);
    }

    return {
      isInside,
      dropAction,
    };
  }

  getAntRegion() {
    var { x, y, width, height } = getCollisionRegion(this.ant);
    x -= this.position.x;
    y -= this.position.y;

    // 使用足部中心点作为碰撞点
    const realX = x + width / 2;
    const realY = y + height;

    this._drawAntRegion(realX, realY);

    return [realX, realY];
  }
  
  _drawAntRegion(x, y) {
    // 确保之前的调试图形被清除
    if (this.antRegionGraphic) {
      this.removeChild(this.antRegionGraphic);
      this.antRegionGraphic = null;
    }
    
    var mask = new Tiny.Graphics();
    mask.lineStyle(4, 0x66FF33, 1);
    mask.drawCircle(x, y, 5); // 增大碰撞点的可视化大小
    mask.endFill();

    this.addChild(mask);
    this.antRegionGraphic = mask;
  }

  getBoxRegion() {
    var {x, y, width, height} = getCollisionRegion(this.targetBox);
    x -= this.position.x;
    y -= this.position.y;
    
    // 让碰撞区域小一点，使游戏更有挑战性
    var padding = 15;
    
    // 创建一个四边形的碰撞区域
    var result = [
      [x + padding, y + padding], // 左上
      [x + width - padding, y + padding], // 右上
      [x + width - padding, y + height - padding], // 右下
      [x + padding, y + height - padding], // 左下
    ];

    this._drawBoxRegion(result);

    return result;
  }
  
  _drawBoxRegion(result) {
    // 确保之前的调试图形被清除
    if (this.boxRegionGraphic) {
      this.removeChild(this.boxRegionGraphic);
      this.boxRegionGraphic = null;
    }
    
    var path = [];
    result.forEach((r) => {
      path = path.concat(r);
    });
    path = path.concat(result[0]);

    var mask = new Tiny.Graphics();
    mask.lineStyle(4, 0x66FF33, 1);
    mask.drawPolygon(path);
    mask.endFill();

    this.addChild(mask);
    this.boxRegionGraphic = mask;
  }

  getDropAction(antRegion, boxRegion) {
    // 垂直下落
    var dropAction = 'drop';

    var r = this.ant.width / 2; // 底部半径
    var d1, d2;
    // 向右上方跳跃
    if (this.targetBoxDirection === direction.right) {
      d1 = getDistance(antRegion, boxRegion[0], boxRegion[1]);
      d2 = getDistance(antRegion, boxRegion[2], boxRegion[3]);
      // 如果离右边更近
      if (d1 < d2) {
        // 如果与右边缘的距离小于底部半径
        if (d1 < r) {
          // 在右侧边缘
          dropAction = 'turnRight';
        } else {
          // 在右侧垂直下落
          dropAction = 'drop';
        }
      } else {
        if (d2 < r) {
          // 在左侧边缘
          dropAction = 'turnLeft';
        } else {
          // 在左侧垂直下落
          dropAction = 'drop';
        }
      }
    } else {
      // 向左上方跳跃
      d1 = getDistance(antRegion, boxRegion[0], boxRegion[3]);
      d2 = getDistance(antRegion, boxRegion[1], boxRegion[2]);
      // 如果离上边更近
      if (d1 < d2) {
        // 如果与上边缘的距离小于底部半径
        if (d1 < r) {
          // 在上边缘
          dropAction = 'turnLeft';
        } else {
          // 在上方垂直下落
          dropAction = 'drop';
        }
      } else {
        if (d2 < r) {
          // 在下边缘
          dropAction = 'turnRight';
        } else {
          // 在下方垂直下落
          dropAction = 'drop';
        }
      }
    }

    return dropAction;
  }

  // 蚂蚁摔倒
  antFall(dropAction, onComplete) {
    setPivot(this.ant, this.ant.width / 2, this.ant.height / 2);

    const ant = this.ant;
    const originX = ant.position.x;
    const originY = ant.position.y;
    const startLayer = this; // 保存当前实例引用

    // 倒地状态判断
    let fallingAnimation;
    let fallDirection = 0;
    
    // 根据不同掉落方向设置不同动画
    if (dropAction === 'turnLeft') {
      // 向左倒
      fallingAnimation = {
        x: [originX - 100, originX - 200],
        y: [originY + 50, originY + 200],
        rotation: [-90, -180] // 向左倒
      };
      fallDirection = -1;
    } else if (dropAction === 'turnRight') {
      // 向右倒
      fallingAnimation = {
        x: [originX + 100, originX + 200],
        y: [originY + 50, originY + 200],
        rotation: [90, 180] // 向右倒
      };
      fallDirection = 1;
    } else {
      // 默认垂直掉落
      fallingAnimation = {
        x: [originX, originX],
        y: [originY + 100, originY + 300],
        rotation: [0, 0] // 不旋转
      };
      fallDirection = 0;
    }
    
    // 先播放"惊讶"动画（如果是AnimatedSprite）
    if (ant.play && typeof ant.play === 'function') {
      // 如果倒地前暂停在最后一帧，表示惊讶表情
      ant.gotoAndStop(1);
    }
    
    // 延迟一小段时间再开始掉落
    setTimeout(() => {
      // 创建掉落动画
      const tween = new Tiny.TWEEN.Tween({
        x: originX,
        y: originY,
        rotation: 0,
        scaleX: ant.scale.x,
        scaleY: ant.scale.y,
      }).to({
        x: fallingAnimation.x,
        y: fallingAnimation.y,
        rotation: fallingAnimation.rotation,
        scaleX: [1.2, 0.8], // 先扩大后缩小
        scaleY: [0.8, 0.6]  // 先压扁后弹起
      }, 1200)
      .onUpdate(function() {
        ant.setPosition(this.x, this.y);
        ant.setRotation(Tiny.deg2radian(this.rotation));
        ant.scale.x = this.scaleX;
        ant.scale.y = this.scaleY;
      })
      .onComplete(function() {
        // 播放落地动画
        // 添加一个灰尘效果
        const dust = new Tiny.Graphics();
        dust.beginFill(0xcccccc, 0.5);
        
        // 根据掉落方向调整灰尘效果位置
        let dustX = ant.position.x;
        if (fallDirection !== 0) {
          dustX += fallDirection * 20;
        }
        
        // 画几个小圆代表灰尘
        for (let i = 0; i < 5; i++) {
          const radius = 3 + Math.random() * 7;
          const offsetX = (Math.random() - 0.5) * 30;
          const offsetY = (Math.random() - 0.5) * 10;
          dust.drawCircle(dustX + offsetX, ant.position.y + 10 + offsetY, radius);
        }
        
        dust.endFill();
        startLayer.addChild(dust);
        
        // 灰尘消失动画
        new Tiny.TWEEN.Tween({alpha: 1})
          .to({alpha: 0}, 500)
          .onUpdate(function() {
            dust.alpha = this.alpha;
          })
          .onComplete(function() {
            startLayer.removeChild(dust);
            // 执行回调
            onComplete();
          })
          .start();
      });
      
      // 启动动画
      tween.start();
    }, 300);
  }

  compress() {
    // 创建压缩动画
    const ant = this.ant;
    const originScaleY = ant.scale.y;
    
    this.pressTween = new Tiny.TWEEN.Tween({
      scaleY: originScaleY,
      scaleX: ant.scale.x
    })
    .to({
      scaleY: originScaleY * 0.7, // 垂直压缩到70%
      scaleX: ant.scale.x * 1.2 // 水平稍微拉伸
    }, 200)
    .easing(Tiny.TWEEN.Easing.Quadratic.Out)
    .onUpdate(function() {
      ant.scale.y = this.scaleY;
      ant.scale.x = this.scaleX;
    })
    .start();
  }

  compressRestore() {
    // 取消之前的动画（如果存在）
    if (this.pressTween) {
      this.pressTween.stop();
    }
    
    // 恢复原始比例的动画
    const ant = this.ant;
    const targetScaleY = 1;
    const targetScaleX = 1;
    
    new Tiny.TWEEN.Tween({
      scaleY: ant.scale.y,
      scaleX: ant.scale.x
    })
    .to({
      scaleY: targetScaleY,
      scaleX: targetScaleX
    }, 100)
    .easing(Tiny.TWEEN.Easing.Quadratic.Out)
    .onUpdate(function() {
      ant.scale.y = this.scaleY;
      ant.scale.x = this.scaleX;
    })
    .start();
  }

  setTargetBoxDirectionAndDelta() {
    this.numInOneDirection -= 1;
    if (this.numInOneDirection <= 0) {
      this.targetBoxDirection = -this.targetBoxDirection; // 反向
      this.numInOneDirection = Tiny.randomInt(1, 3);
    }

    this.targetBoxDelta = Tiny.randomInt(150, 300);
  }

  dropBox() {
    const box = this.createBox();

    const currentBox = this.currentBox;
    // box 出现的坐标
    const pos = getTargetBoxPos(
      currentBox.position,
      this.targetBoxDelta,
      this.targetBoxDirection,
      this.mapAngle
    );
    box.setPosition(pos.x, pos.y);

    return box;
  }

  sceneMove() {
    const targetPos = getTargetBoxPos(this.position, this.targetBoxDelta, this.targetBoxDirection);
    const action = Tiny.MoveBy(500, {
      x: this.position.x - targetPos.x,
      y: this.position.y - targetPos.y,
    });

    action.onComplete = (tween, object) => {
      const scenePostion = this.position;

      for (var i = this.boxes.length - 1; i >= 0; i--) {
        const box = this.boxes[i];

        // 屏幕下方的 box 不会再出现了，所以可以删掉，防止内存泄露
        if ((box.y - box.height + scenePostion.y) > Tiny.WIN_SIZE.height) {
          box.parent.removeChild(box);
          this.boxes.splice(i, 1);
        }
      }
    };

    this.runAction(action);
  }
}

export default StartLayer;
