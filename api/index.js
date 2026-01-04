// api/index.js - 简化版
const express = require('express');

const app = express();

// 允许所有跨域请求
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());

// ========== 路由定义 ==========

// 1. 健康检查
app.get('/', (req, res) => {
  res.json({ success: true, message: 'API Server is running' });
});

// 2. 测试端点
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API test endpoint is working',
    timestamp: new Date().toISOString()
  });
});

// 3. 注册
app.post('/api/register', (req, res) => {
  console.log('Register request:', req.body);
  res.json({ 
    success: true, 
    message: 'Registration endpoint is working',
    data: req.body
  });
});

// 4. 登录
app.post('/api/login', (req, res) => {
  console.log('Login request:', req.body);
  res.json({ 
    success: true, 
    message: 'Login endpoint is working',
    data: req.body
  });
});

// 5. 保存记录（这是您的主要问题端点）
app.post('/api/records', (req, res) => {
  console.log('Save record request:', req.body);
  res.json({ 
    success: true, 
    message: 'Record saved successfully (test mode)',
    recordId: 'test_' + Date.now(),
    data: req.body
  });
});

// 6. 获取历史记录
app.get('/api/history', (req, res) => {
  console.log('History request:', req.query);
  res.json({ 
    success: true, 
    message: 'History endpoint is working',
    records: [],
    userId: req.query.userId
  });
});

// 7. 让球盘推荐
app.post('/api/recommend/asian', (req, res) => {
  console.log('Asian recommendation request:', req.body);
  res.json({ 
    success: true, 
    recommendation: '上盘',
    details: '基于测试数据的推荐',
    timestamp: new Date().toISOString()
  });
});

// 8. 大小盘推荐
app.post('/api/recommend/size', (req, res) => {
  console.log('Size recommendation request:', req.body);
  res.json({ 
    success: true, 
    recommendation: '大球',
    details: '基于测试数据的推荐',
    timestamp: new Date().toISOString()
  });
});

// 9. 邀请码
app.get('/api/invitation-codes', (req, res) => {
  res.json({ 
    success: true, 
    codes: [
      { code: 'TEST123', created_by: 'system', created_at: new Date().toISOString() },
      { code: 'TEST456', created_by: 'system', created_at: new Date().toISOString() }
    ]
  });
});

// 10. 导入邀请码
app.post('/api/invitation-codes', (req, res) => {
  console.log('Import invitation codes:', req.body);
  res.json({ 
    success: true, 
    message: 'Invitation codes imported',
    inserted: req.body.codes || []
  });
});

// 11. 更新记录
app.put('/api/records/:id', (req, res) => {
  console.log('Update record:', req.params.id, req.body);
  res.json({ 
    success: true, 
    message: 'Record updated',
    id: req.params.id
  });
});

// 12. 删除记录
app.delete('/api/records/:id', (req, res) => {
  console.log('Delete record:', req.params.id);
  res.json({ 
    success: true, 
    message: 'Record deleted',
    id: req.params.id
  });
});

// 13. 404 处理 - 确保这个在最后
app.use('*', (req, res) => {
  console.log('404 - Route not found:', req.method, req.originalUrl);
  res.status(404).json({ 
    success: false, 
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
});

// ========== 服务器启动 ==========
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Test URLs:`);
    console.log(`  http://localhost:${PORT}/`);
    console.log(`  http://localhost:${PORT}/api/test`);
    console.log(`  http://localhost:${PORT}/api/records`);
  });
}

module.exports = app;
