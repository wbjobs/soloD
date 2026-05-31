let pressureChart;
let waterfallChart;
let pressureUpdateTimer = null;
const PRESSURE_UPDATE_THROTTLE = 300;

function initCharts() {
    initPressureChart();
    initWaterfallChart();
    
    window.addEventListener('resize', () => {
        pressureChart.resize();
        waterfallChart.resize();
    });
}

function initPressureChart() {
    const chartDom = document.getElementById('pressureChart');
    pressureChart = echarts.init(chartDom, 'dark');
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(22, 33, 62, 0.9)',
            borderColor: '#333',
            textStyle: { color: '#eee' }
        },
        legend: {
            data: ['买压力', '卖压力'],
            textStyle: { color: '#aaa' },
            top: 10
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            top: '15%',
            containLabel: true
        },
        xAxis: {
            type: 'time',
            axisLine: { lineStyle: { color: '#444' } },
            axisLabel: { color: '#888', fontSize: 10 },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            axisLine: { lineStyle: { color: '#444' } },
            axisLabel: { color: '#888', fontSize: 10 },
            splitLine: { lineStyle: { color: '#333' } }
        },
        series: [
            {
                name: '买压力',
                type: 'line',
                smooth: true,
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(107, 203, 119, 0.6)' },
                            { offset: 1, color: 'rgba(107, 203, 119, 0.1)' }
                        ]
                    }
                },
                lineStyle: { color: '#6bcb77', width: 2 },
                itemStyle: { color: '#6bcb77' },
                emphasis: { focus: 'series' },
                data: []
            },
            {
                name: '卖压力',
                type: 'line',
                smooth: true,
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(255, 107, 107, 0.6)' },
                            { offset: 1, color: 'rgba(255, 107, 107, 0.1)' }
                        ]
                    }
                },
                lineStyle: { color: '#ff6b6b', width: 2 },
                itemStyle: { color: '#ff6b6b' },
                emphasis: { focus: 'series' },
                data: []
            }
        ]
    };
    
    pressureChart.setOption(option);
}

function initWaterfallChart() {
    const chartDom = document.getElementById('waterfallChart');
    waterfallChart = echarts.init(chartDom, 'dark');
    
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(22, 33, 62, 0.9)',
            borderColor: '#333',
            textStyle: { color: '#eee' },
            formatter: function(params) {
                const data = params.data;
                return `
                    时间: ${data.time}<br/>
                    方向: ${data.direction === 'buy' ? '买入' : '卖出'}<br/>
                    价格: ${data.price.toFixed(2)}<br/>
                    数量: ${data.quantity}<br/>
                    金额: ${(data.price * data.quantity).toFixed(2)}
                `;
            }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '10%',
            top: '10%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: [],
            axisLine: { lineStyle: { color: '#444' } },
            axisLabel: { show: false },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            axisLine: { lineStyle: { color: '#444' } },
            axisLabel: { color: '#888', fontSize: 10 },
            splitLine: { lineStyle: { color: '#333' } }
        },
        series: [
            {
                type: 'bar',
                barWidth: '60%',
                data: [],
                itemStyle: {
                    color: function(params) {
                        return params.data.direction === 'buy' ? '#6bcb77' : '#ff6b6b';
                    }
                }
            }
        ],
        dataZoom: [
            {
                type: 'inside',
                start: 50,
                end: 100
            },
            {
                start: 50,
                end: 100,
                height: 20,
                bottom: 10,
                borderColor: '#444',
                fillerColor: 'rgba(0, 212, 255, 0.2)',
                handleStyle: { color: '#00d4ff' }
            }
        ]
    };
    
    waterfallChart.setOption(option);
}

function updatePressureChart() {
    if (pressureUpdateTimer) return;
    
    pressureUpdateTimer = setTimeout(() => {
        const buyData = pressureHistory.map(p => [p.timestamp, p.buyPressure]);
        const sellData = pressureHistory.map(p => [p.timestamp, p.sellPressure]);
        
        pressureChart.setOption({
            series: [
                { data: buyData },
                { data: sellData }
            ]
        }, true);
        pressureUpdateTimer = null;
    }, PRESSURE_UPDATE_THROTTLE);
}

function updateWaterfallChart(order) {
    updateWaterfallChartBatch();
}

function updateWaterfallChartBatch() {
    const maxOrders = 200;
    const recentOrders = filteredOrders.slice(-maxOrders);
    
    const categories = recentOrders.map((o, i) => {
        const time = new Date(o.timestamp);
        return `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;
    });
    
    const data = recentOrders.map(o => ({
        value: o.value,
        direction: o.direction === 'buy' ? 'buy' : 'sell',
        price: o.price,
        quantity: o.quantity,
        time: new Date(o.timestamp).toLocaleTimeString()
    }));
    
    waterfallChart.setOption({
        xAxis: { data: categories },
        series: [{ data: data }]
    }, true);
}

function updateCharts() {
    updatePressureChart();
    const maxOrders = 200;
    const recentOrders = filteredOrders.slice(-maxOrders);
    
    const categories = recentOrders.map((o, i) => {
        const time = new Date(o.timestamp);
        return `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;
    });
    
    const data = recentOrders.map(o => ({
        value: o.value,
        direction: o.direction,
        price: o.price,
        quantity: o.quantity,
        time: new Date(o.timestamp).toLocaleTimeString()
    }));
    
    waterfallChart.setOption({
        xAxis: { data: categories },
        series: [{ data: data }]
    });
}