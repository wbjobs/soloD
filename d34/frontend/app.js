const API_BASE_URL = 'http://localhost:3001/api/pipelines';

let viewer;
let tileset;
let clippingPlanes;
let isClippingEnabled = false;
let isPickingLocation = false;
let isBurstMode = false;
let pipelineEntities = [];
let burstAnalysisEntities = [];
let currentBurstAnalysis = null;

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ0OS1kMWFjYmFkNjc5YzciLCJpZCI6NTc2ODksImlhdCI6MTYyMjY1MTE2M30.XcKpgANiY19MC4bdFUXMVEBToBmqS8kuYpUlxJHYZxk';

function initViewer() {
  viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider: Cesium.createWorldTerrain(),
    animation: false,
    timeline: false,
    baseLayerPicker: true,
    geocoder: true,
    homeButton: true,
    sceneModePicker: true,
    navigationHelpButton: false,
    fullscreenButton: true
  });

  const scene = viewer.scene;

  scene.globe.depthTestAgainstTerrain = true;

  scene.logarithmicDepthBuffer = true;

  scene.farToNearRatio = 1000;

  scene.highDynamicRange = false;

  if (scene.pickPositionSupported) {
    scene.requestRenderMode = true;
    scene.maximumRenderTimeChange = 0.01;
  }

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(116.3975, 39.9086, 1000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0
    }
  });

  setupScreenSpaceEventHandler();
}

function load3DTiles(url) {
  if (tileset) {
    viewer.scene.primitives.remove(tileset);
  }

  tileset = viewer.scene.primitives.add(
    new Cesium.Cesium3DTileset({
      url: url,
      maximumScreenSpaceError: 4,
      maximumMemoryUsage: 1024,
      skipLevelOfDetail: false,
      baseScreenSpaceError: 1024,
      skipScreenSpaceErrorFactor: 16,
      skipLevels: 1,
      immediatelyLoadDesiredLevelOfDetail: true,
      loadSiblings: true,
      cullWithChildrenBounds: true,
      dynamicScreenSpaceError: true,
      dynamicScreenSpaceErrorDensity: 0.00278,
      dynamicScreenSpaceErrorFactor: 4.0,
      foveatedScreenSpaceError: true,
      foveatedConeSize: 0.1,
      foveatedMinimumScreenSpaceErrorRelaxation: 0.0,
      foveatedInterpolationCallback: Cesium.Math.lerp,
      foveatedTimeDelay: 0.2,
      enableCollision: true,
      skipLevelOfDetailWithRequestVolume: false,
      debugShowBoundingVolume: false,
      debugShowContentBoundingVolume: false,
      debugShowGeometricError: false,
      debugShowRenderingStatistics: false,
      debugShowMemoryUsage: false,
      debugShowUrl: false
    })
  );

  tileset.readyPromise.then(function(tileset) {
    viewer.zoomTo(tileset, new Cesium.HeadingPitchRange(0, -0.5, tileset.boundingSphere.radius * 2.0));
    console.log('3D Tiles loaded successfully');
  }).otherwise(function(error) {
    console.error('Error loading 3D Tiles:', error);
    alert('加载3D Tiles失败: ' + error.message);
  });
}

function setupClippingPlanes() {
  const center = Cesium.Cartesian3.fromDegrees(116.3975, 39.9086, 0);
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  
  clippingPlanes = new Cesium.ClippingPlaneCollection({
    planes: [
      new Cesium.ClippingPlane(new Cesium.Cartesian3(1, 0, 0), 0)
    ],
    edgeWidth: 2.0,
    edgeColor: Cesium.Color.WHITE.withAlpha(0.9),
    enabled: false,
    unionClippingRegions: false,
    modelMatrix: transform
  });

  if (tileset) {
    tileset.clippingPlanes = clippingPlanes;
  }

  const scene = viewer.scene;
  if (scene) {
    scene.globe.polygonOffset = {
      factor: -1.0,
      units: -4.0
    };
  }
}

function updateClippingPlane(direction, position) {
  if (!clippingPlanes || !tileset) return;

  let normal;
  switch (direction) {
    case 'x':
      normal = new Cesium.Cartesian3(1, 0, 0);
      break;
    case 'y':
      normal = new Cesium.Cartesian3(0, 1, 0);
      break;
    case 'z':
      normal = new Cesium.Cartesian3(0, 0, 1);
      break;
  }

  clippingPlanes.planes = [
    new Cesium.ClippingPlane(normal, position)
  ];
}

function setupScreenSpaceEventHandler() {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction(function(movement) {
    const pickedFeature = viewer.scene.pick(movement.endPosition);
    
    const tooltip = document.getElementById('tooltip');
    if (Cesium.defined(pickedFeature)) {
      tooltip.style.display = 'block';
      tooltip.style.left = movement.endPosition.x + 10 + 'px';
      tooltip.style.top = movement.endPosition.y + 10 + 'px';
      if (isBurstMode) {
        tooltip.innerHTML = '点击此处进行<br>爆管模拟分析';
      } else {
        tooltip.innerHTML = '管网要素<br>点击查看详情';
      }
    } else {
      tooltip.style.display = 'none';
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(async function(click) {
    if (isPickingLocation) {
      const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const longitude = Cesium.Math.toDegrees(cartographic.longitude);
        const latitude = Cesium.Math.toDegrees(cartographic.latitude);
        
        document.getElementById('queryLong').value = longitude.toFixed(6);
        document.getElementById('queryLat').value = latitude.toFixed(6);
        
        isPickingLocation = false;
        document.getElementById('pickLocation').textContent = '地图选点';
        document.getElementById('pickLocation').style.background = '#3498db';
        
        addQueryMarker(longitude, latitude);
      }
      return;
    }

    if (isBurstMode) {
      const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const longitude = Cesium.Math.toDegrees(cartographic.longitude);
        const latitude = Cesium.Math.toDegrees(cartographic.latitude);
        
        await performBurstAnalysis(longitude, latitude);
      }
      return;
    }

    const pickedFeature = viewer.scene.pick(click.position);
    if (Cesium.defined(pickedFeature)) {
      console.log('Picked feature:', pickedFeature);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function addQueryMarker(longitude, latitude) {
  viewer.entities.removeAll();
  
  viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
    point: {
      pixelSize: 10,
      color: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2
    }
  });
}

async function queryNearbyPipelines(longitude, latitude, radius) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/spatial/nearby?longitude=${longitude}&latitude=${latitude}&maxDistance=${radius}`
    );
    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('Query error:', error);
    return [];
  }
}

function displayQueryResults(pipelines) {
  const resultsSection = document.getElementById('queryResults');
  const resultsList = document.getElementById('resultsList');
  
  resultsSection.style.display = 'block';
  resultsList.innerHTML = '';

  if (pipelines.length === 0) {
    resultsList.innerHTML = '<p style="color: #666; padding: 10px;">未找到附近的管线</p>';
    return;
  }

  pipelines.forEach(pipeline => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <h4>${pipeline.name}</h4>
      <p><strong>类型:</strong> ${getTypeName(pipeline.type)}</p>
      <p><strong>材质:</strong> ${pipeline.material}</p>
      <p><strong>直径:</strong> ${pipeline.diameter || '-'} mm</p>
      <p><strong>深度:</strong> ${pipeline.depth || '-'} m</p>
      <p><strong>铺设时间:</strong> ${pipeline.installationDate ? new Date(pipeline.installationDate).toLocaleDateString() : '-'}</p>
    `;
    resultsList.appendChild(item);

    if (pipeline.coordinates && pipeline.coordinates.coordinates) {
      drawPipelineOnMap(pipeline);
    }
  });
}

function getTypeName(type) {
  const types = {
    water: '给水',
    sewage: '排水',
    gas: '燃气',
    electric: '电力',
    telecom: '通信'
  };
  return types[type] || type;
}

function drawPipelineOnMap(pipeline) {
  const coordinates = pipeline.coordinates.coordinates.map(coord => 
    Cesium.Cartesian3.fromDegrees(coord[0], coord[1], (pipeline.depth || 0) * (-1))
  );

  const colors = {
    water: Cesium.Color.CORNFLOWERBLUE.withAlpha(0.9),
    sewage: Cesium.Color.SADDLEBROWN.withAlpha(0.9),
    gas: Cesium.Color.GOLD.withAlpha(0.9),
    electric: Cesium.Color.DARKORANGE.withAlpha(0.9),
    telecom: Cesium.Color.LIMEGREEN.withAlpha(0.9)
  };

  const entity = viewer.entities.add({
    name: pipeline.name,
    polyline: {
      positions: coordinates,
      width: 8,
      material: new Cesium.PolylineOutlineMaterialProperty({
        color: colors[pipeline.type] || Cesium.Color.GRAY,
        outlineWidth: 2,
        outlineColor: Cesium.Color.BLACK.withAlpha(0.5)
      }),
      clampToGround: false,
      zIndex: 10
    }
  });

  pipelineEntities.push(entity);
}

async function loadAllPipelines() {
  try {
    const response = await fetch(API_BASE_URL);
    const result = await response.json();
    const pipelines = result.data || [];
    
    pipelineEntities.forEach(e => viewer.entities.remove(e));
    pipelineEntities = [];
    
    pipelines.forEach(pipeline => {
      if (pipeline.coordinates && pipeline.coordinates.coordinates) {
        drawPipelineOnMap(pipeline);
      }
    });

    alert(`已加载 ${pipelines.length} 条管网数据`);
  } catch (error) {
    console.error('Load pipelines error:', error);
    alert('加载管网数据失败');
  }
}

function setupEventListeners() {
  document.getElementById('loadTileset').addEventListener('click', function() {
    const url = document.getElementById('tilesetUrl').value;
    load3DTiles(url);
  });

  document.getElementById('enableClipping').addEventListener('click', function() {
    if (!tileset) {
      alert('请先加载3D Tiles模型');
      return;
    }
    
    if (!clippingPlanes) {
      setupClippingPlanes();
    }
    
    clippingPlanes.enabled = true;
    isClippingEnabled = true;
    this.disabled = true;
    document.getElementById('disableClipping').disabled = false;
  });

  document.getElementById('disableClipping').addEventListener('click', function() {
    if (clippingPlanes) {
      clippingPlanes.enabled = false;
    }
    isClippingEnabled = false;
    this.disabled = true;
    document.getElementById('enableClipping').disabled = false;
  });

  document.getElementById('clipPosition').addEventListener('input', function() {
    const value = parseFloat(this.value);
    document.getElementById('clipValue').textContent = value;
    const direction = document.getElementById('clipDirection').value;
    updateClippingPlane(direction, value);
  });

  document.getElementById('clipDirection').addEventListener('change', function() {
    const position = parseFloat(document.getElementById('clipPosition').value);
    updateClippingPlane(this.value, position);
  });

  document.getElementById('queryPipelines').addEventListener('click', async function() {
    const longitude = parseFloat(document.getElementById('queryLong').value);
    const latitude = parseFloat(document.getElementById('queryLat').value);
    const radius = parseFloat(document.getElementById('queryRadius').value);

    addQueryMarker(longitude, latitude);
    const pipelines = await queryNearbyPipelines(longitude, latitude, radius);
    displayQueryResults(pipelines);
  });

  document.getElementById('pickLocation').addEventListener('click', function() {
    isPickingLocation = !isPickingLocation;
    if (isPickingLocation) {
      this.textContent = '取消选点';
      this.style.background = '#e74c3c';
      alert('请在地图上点击选择位置');
    } else {
      this.textContent = '地图选点';
      this.style.background = '#3498db';
    }
  });

  document.getElementById('showAllPipelines').addEventListener('click', loadAllPipelines);

  document.getElementById('addPipeline').addEventListener('click', function() {
    alert('添加管网功能需要实现表单界面\n可以通过API: POST /api/pipelines 添加');
  });

  document.getElementById('startBurstMode').addEventListener('click', function() {
    isBurstMode = true;
    this.disabled = true;
    document.getElementById('endBurstMode').disabled = false;
    alert('已进入爆管模拟模式，请点击地图上的管道位置进行分析');
  });

  document.getElementById('endBurstMode').addEventListener('click', function() {
    isBurstMode = false;
    this.disabled = true;
    document.getElementById('startBurstMode').disabled = false;
    alert('已退出爆管模拟模式');
  });

  document.getElementById('clearBurstAnalysis').addEventListener('click', clearBurstAnalysis);
}

async function performBurstAnalysis(longitude, latitude) {
  const radius = parseInt(document.getElementById('burstRadius').value) || 500;
  
  try {
    const response = await fetch(`${API_BASE_URL}/burst-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ longitude, latitude, radius })
    });

    const result = await response.json();
    
    if (!result.success) {
      alert('爆管分析失败: ' + (result.message || result.error));
      return;
    }

    currentBurstAnalysis = result;
    displayBurstAnalysisResults(result);
    renderBurstAnalysisOnMap(result);

  } catch (error) {
    console.error('爆管分析错误:', error);
    alert('爆管分析失败，请检查后端服务是否正常运行');
  }
}

function displayBurstAnalysisResults(result) {
  const resultsSection = document.getElementById('burstAnalysisResults');
  const resultsContent = document.getElementById('burstResultsContent');
  
  resultsSection.style.display = 'block';
  
  const severityColors = {
    critical: '#dc3545',
    high: '#fd7e14',
    medium: '#ffc107'
  };

  let html = `
    <div class="burst-section">
      <h4>📍 爆管位置信息</h4>
      <p><strong>经度:</strong> ${result.burstPoint.coordinates[0].toFixed(6)}</p>
      <p><strong>纬度:</strong> ${result.burstPoint.coordinates[1].toFixed(6)}</p>
      <p><strong>定位精度:</strong> ${result.burstAccuracy.toFixed(2)} 米</p>
    </div>
  `;

  if (result.burstPipeline) {
    html += `
      <div class="burst-section">
        <h4>🛠 破裂管道信息</h4>
        <p><strong>名称:</strong> ${result.burstPipeline.name}</p>
        <p><strong>类型:</strong> ${getTypeName(result.burstPipeline.type)}</p>
        <p><strong>材质:</strong> ${result.burstPipeline.material}</p>
        <p><strong>管径:</strong> ${result.burstPipeline.diameter || '-'} mm</p>
      </div>
    `;
  }

  html += `
    <div class="burst-section">
      <h4>⚠ 影响评估</h4>
      <p><strong>严重程度:</strong> <span style="color: ${severityColors[result.impact.severity]}; font-weight: bold;">${getSeverityText(result.impact.severity)}</span></p>
      <p><strong>受影响管道:</strong> ${result.impact.affectedPipelineCount} 条</p>
      <p><strong>影响管线长度:</strong> ${result.impact.totalAffectedLength} 米</p>
      <p><strong>估计受影响用户:</strong> ${result.impact.estimatedAffectedCustomers} 户</p>
      <p><strong>估计水流量损失:</strong> ${result.impact.estimatedWaterLossRate} L/min</p>
    </div>
  `;

  html += `
    <div class="burst-section">
      <h4>🔧 关阀方案</h4>
      <p><strong>需关闭阀门数:</strong> ${result.valveClosureScheme.totalValves} 个</p>
      <p><strong>预计隔离时间:</strong> ${result.valveClosureScheme.estimatedIsolationTime} 分钟</p>
  `;

  if (result.valveClosureScheme.valvesToClose.length > 0) {
    html += '<div class="valve-list">';
    result.valveClosureScheme.valvesToClose.forEach((valve, index) => {
      const priorityColors = { high: '#dc3545', medium: '#fd7e14', low: '#28a745' };
      html += `
        <div class="valve-item">
          <span class="valve-priority" style="background: ${priorityColors[valve.priority]}">${getPriorityText(valve.priority)}</span>
          <span>${valve.name || `阀门${index + 1}`}</span>
          <span style="font-size: 11px; color: #666;">${valve.distance.toFixed(1)}米</span>
        </div>
      `;
    });
    html += '</div>';
  }
  html += '</div>';

  html += `
    <div class="burst-section">
      <h4>📋 应急建议</h4>
      <ol class="recommendations">
        ${result.recommendations.map(rec => `<li>${rec}</li>`).join('')}
      </ol>
    </div>
  `;

  html += `
    <p style="font-size: 11px; color: #666; margin-top: 10px;">
      分析时间: ${new Date(result.timestamp).toLocaleString()}
    </p>
  `;

  resultsContent.innerHTML = html;
}

function renderBurstAnalysisOnMap(result) {
  burstAnalysisEntities.forEach(e => viewer.entities.remove(e));
  burstAnalysisEntities = [];

  const burstPoint = result.burstPoint.coordinates;
  
  const burstMarker = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(burstPoint[0], burstPoint[1], 10),
    billboard: {
      image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxNSIgZmlsbD0iI2RjMzU0NSIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjgiIGZpbGw9IiNmZmYiIHN0cm9rZT0iI2RjMzU0NSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+',
      width: 40,
      height: 40,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM
    },
    label: {
      text: '爆管点',
      font: '14pt sans-serif',
      fillColor: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -50)
    }
  });
  burstAnalysisEntities.push(burstMarker);

  const affectedRadius = result.affectedArea.radius || 500;
  const circlePositions = [];
  const numPoints = 64;
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const r = affectedRadius / 111000;
    circlePositions.push(
      Cesium.Cartesian3.fromDegrees(
        burstPoint[0] + r * Math.cos(angle),
        burstPoint[1] + r * Math.sin(angle),
        0
      )
    );
  }

  const affectedArea = viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(circlePositions),
      material: Cesium.Color.RED.withAlpha(0.2),
      outline: true,
      outlineColor: Cesium.Color.RED,
      outlineWidth: 3
    }
  });
  burstAnalysisEntities.push(affectedArea);

  result.affectedPipelines.forEach(pipeline => {
    if (pipeline.coordinates && pipeline.coordinates.coordinates) {
      const coords = pipeline.coordinates.coordinates.map(coord =>
        Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0)
      );

      const entity = viewer.entities.add({
        name: `受影响: ${pipeline.name}`,
        polyline: {
          positions: coords,
          width: 8,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: Cesium.Color.RED.withAlpha(0.8),
            outlineWidth: 2,
            outlineColor: Cesium.Color.DARKRED
          })
        }
      });
      burstAnalysisEntities.push(entity);
    }
  });

  result.valveClosureScheme.valvesToClose.forEach(valve => {
    const colors = {
      high: Cesium.Color.RED,
      medium: Cesium.Color.ORANGE,
      low: Cesium.Color.GREEN
    };

    const valveEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        valve.location.coordinates[0],
        valve.location.coordinates[1],
        5
      ),
      point: {
        pixelSize: 14,
        color: colors[valve.priority] || Cesium.Color.RED,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2
      },
      label: {
        text: valve.name || '阀门',
        font: '10pt sans-serif',
        fillColor: Cesium.Color.BLACK,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        pixelOffset: new Cesium.Cartesian2(0, 20)
      }
    });
    burstAnalysisEntities.push(valveEntity);
  });

  viewer.flyTo(burstAnalysisEntities, {
    duration: 1.5,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), affectedRadius * 3)
  });
}

function clearBurstAnalysis() {
  burstAnalysisEntities.forEach(e => viewer.entities.remove(e));
  burstAnalysisEntities = [];
  currentBurstAnalysis = null;
  
  const resultsSection = document.getElementById('burstAnalysisResults');
  resultsSection.style.display = 'none';
  
  alert('已清除爆管分析结果');
}

function getSeverityText(severity) {
  const texts = {
    critical: '严重',
    high: '高',
    medium: '中等'
  };
  return texts[severity] || severity;
}

function getPriorityText(priority) {
  const texts = {
    high: '高',
    medium: '中',
    low: '低'
  };
  return texts[priority] || priority;
}

document.addEventListener('DOMContentLoaded', function() {
  initViewer();
  setupEventListeners();
  setupClippingPlanes();
  console.log('城市地下管网管理系统已启动');
});
