import './css/style.less';
import * as resources from './game/resources';
import StartLayer from './game/StartLayer';

require('./css/index.less');

Tiny.app = new Tiny.Application({
  showFPS: true,
  width: 750,
  height: 1334,
  canvasId: 'gameCanvas',
  fixSize: true,
  renderOptions: {
    antialias: true,
    backgroundColor: 0x2a3145,
  },
});

const main = {
  init () {
    console.log('init');
    Tiny.resources = resources;
    this.resourceLoad();
  },
  resourceLoad () {
    const progress = document.getElementById('progress');
    const percent = document.getElementById('percent');

    const loader = new Tiny.loaders.Loader();

    loader.add(Object.values(resources))
      .load(() => {
        const { StartLayer } = require('./game/StartLayer');
        const startLayer = new StartLayer();
        Tiny.app.run(startLayer);

        // 添加按钮来切换45度地图
        const toggleButton = document.createElement('button');
        toggleButton.textContent = '切换45度地图';
        toggleButton.style.position = 'absolute';
        toggleButton.style.top = '20px';
        toggleButton.style.left = '20px';
        toggleButton.style.zIndex = '100';
        toggleButton.style.padding = '10px';
        toggleButton.style.backgroundColor = '#fff';
        toggleButton.style.border = 'none';
        toggleButton.style.borderRadius = '5px';
        document.body.appendChild(toggleButton);

        let is45Degree = false;
        toggleButton.addEventListener('click', () => {
          is45Degree = !is45Degree;
          startLayer.setMapAngle(is45Degree ? 45 : 30);
          toggleButton.textContent = is45Degree ? '切换30度地图' : '切换45度地图';
        });
      });
  },
};
main.init();

// 页面压后台，让游戏停下来
document.addEventListener('pause', function (e) {
  Tiny.app.pause();
}, false);

// 页面恢复运行，让游戏继续
document.addEventListener('resume', function (e) {
  Tiny.app.resume();
}, false);
