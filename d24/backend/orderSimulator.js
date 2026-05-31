class OrderSimulator {
  constructor(basePrice = 100, volatility = 0.001, ordersPerSecond = 100) {
    this.basePrice = basePrice;
    this.currentPrice = basePrice;
    this.volatility = volatility;
    this.ordersPerSecond = ordersPerSecond;
    this.interval = null;
    this.listeners = [];
    this.orderHistory = [];
    this.maxHistory = 60000;
    this.replayData = [];
  }

  generateOrder() {
    const random = Math.random();
    const direction = random >= 0.5 ? 'buy' : 'sell';
    const priceChange = (Math.random() - 0.5) * 2 * this.volatility * this.currentPrice;
    this.currentPrice = Math.max(this.basePrice * 0.9, Math.min(this.basePrice * 1.1, this.currentPrice + priceChange));
    
    const quantity = Math.floor(Math.random() * 100) + 1;
    const price = Number(this.currentPrice.toFixed(2));
    
    const order = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      direction: direction || 'buy',
      price,
      quantity,
      value: price * quantity
    };

    this.orderHistory.push(order);
    if (this.orderHistory.length > this.maxHistory) {
      this.orderHistory.shift();
    }

    return order;
  }

  generateBatch(count) {
    const orders = [];
    for (let i = 0; i < count; i++) {
      orders.push(this.generateOrder());
    }
    return orders;
  }

  start(onOrder) {
    if (this.interval) return;
    
    if (onOrder) {
      this.listeners.push(onOrder);
    }

    const intervalMs = 1000 / this.ordersPerSecond;
    this.interval = setInterval(() => {
      const order = this.generateOrder();
      this.listeners.forEach(listener => listener(order));
    }, intervalMs);

    console.log(`Order simulator started: ${this.ordersPerSecond} orders/sec`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('Order simulator stopped');
    }
  }

  getOrderHistory(startTime, endTime) {
    if (!startTime && !endTime) {
      return this.orderHistory;
    }
    
    return this.orderHistory.filter(order => {
      const ts = order.timestamp.getTime();
      const start = startTime ? startTime.getTime() : 0;
      const end = endTime ? endTime.getTime() : Date.now();
      return ts >= start && ts <= end;
    });
  }

  getPressureData(timeWindowMs = 1000) {
    const now = Date.now();
    const windowStart = now - timeWindowMs;
    
    const windowOrders = this.orderHistory.filter(
      order => order.timestamp.getTime() >= windowStart
    );

    const buyPressure = windowOrders
      .filter(o => o.direction === 'buy')
      .reduce((sum, o) => sum + o.value, 0);
    
    const sellPressure = windowOrders
      .filter(o => o.direction === 'sell')
      .reduce((sum, o) => sum + o.value, 0);

    return {
      buyPressure,
      sellPressure,
      ratio: sellPressure > 0 ? (buyPressure / sellPressure).toFixed(2) : buyPressure > 0 ? '∞' : '1',
      orderCount: windowOrders.length
    };
  }
}

module.exports = OrderSimulator;