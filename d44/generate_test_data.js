const fs = require('fs');

const numNodes = 3000;
const numTransactions = 10000;
const nodes = [];

for (let i = 1; i <= numNodes; i++) {
  nodes.push(`账户${i.toString().padStart(5, '0')}`);
}

const transactions = [];
transactions.push('付款方,收款方,金额,交易日期,备注');

for (let i = 0; i < numTransactions; i++) {
  const payer = nodes[Math.floor(Math.random() * numNodes)];
  const payee = nodes[Math.floor(Math.random() * numNodes)];
  if (payer === payee) continue;
  
  const amount = (Math.random() * 100000 + 100).toFixed(2);
  const date = `2024-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`;
  const remark = `交易${i + 1}`;
  
  transactions.push(`${payer},${payee},${amount},${date},${remark}`);
}

fs.writeFileSync('大数据测试.csv', transactions.join('\n'));
console.log(`已生成 ${transactions.length - 1} 条交易记录，涉及 ${numNodes} 个账户`);
