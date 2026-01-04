// api/index.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// 从环境变量读取数据库配置
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 中间件配置
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============== 数据库初始化函数 ============== //
async function initDatabase() {
  const createTables = `
    -- 创建用户表
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      user_type VARCHAR(20) DEFAULT 'trial',
      registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP,
      trial_count INTEGER DEFAULT 0,
      trial_start_date TIMESTAMP,
      trial_end_date TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- 创建邀请码表
    CREATE TABLE IF NOT EXISTS invitation_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(100) UNIQUE NOT NULL,
      created_by VARCHAR(100),
      used_by VARCHAR(100),
      used_date TIMESTAMP,
      is_used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- 创建盘口记录表
    CREATE TABLE IF NOT EXISTS handicap_records (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      match_name VARCHAR(200) NOT NULL,
      handicap_type VARCHAR(20) NOT NULL,
      initial_handicap DECIMAL(5,2),
      current_handicap DECIMAL(5,2),
      initial_water DECIMAL(4,2),
      current_water DECIMAL(4,2),
      handicap_change DECIMAL(5,2),
      water_change DECIMAL(4,2),
      historical_record VARCHAR(10),
      recommendation VARCHAR(50),
      actual_result VARCHAR(10),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(createTables);
    console.log('✅ 数据库表初始化完成');
    
    // 检查并创建默认管理员账户
    try {
      const adminCheck = await pool.query(
        'SELECT id FROM users WHERE username = $1',
        ['admin']
      );
      
      if (adminCheck.rows.length === 0) {
        await pool.query(
          `INSERT INTO users (username, password_hash, user_type) 
           VALUES ($1, $2, $3)`,
          ['admin', 'admin123', 'admin']
        );
        console.log('✅ 默认管理员用户已创建');
      }
    } catch (err) {
      console.log('创建管理员用户跳过:', err.message);
    }
    
    // 检查并创建测试邀请码
    try {
      const codeCheck = await pool.query(
        'SELECT code FROM invitation_codes WHERE code = $1',
        ['TEST123']
      );
      
      if (codeCheck.rows.length === 0) {
        await pool.query(
          `INSERT INTO invitation_codes (code, created_by) 
           VALUES ($1, $2)`,
          ['TEST123', 'system']
        );
        console.log('✅ 测试邀请码已创建: TEST123');
      }
    } catch (err) {
      console.log('创建测试邀请码跳过:', err.message);
    }
    
  } catch (err) {
    console.error('❌ 数据库初始化错误:', err);
  }
}

// ============== API 路由 ============== //

// 根路径 - 返回API服务信息
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: '足球让球/大小盘口记录系统 API',
    version: '2.0.0',
    status: '运行正常',
    timestamp: new Date().toISOString(),
    endpoints: {
      test: 'GET /api/test',
      register: 'POST /api/register',
      login: 'POST /api/login',
      history: 'GET /api/history?userId=',
      records: 'POST /api/records',
      updateRecord: 'PUT /api/records/:id',
      deleteRecord: 'DELETE /api/records/:id',
      invitationCodes: 'GET /api/invitation-codes',
      importInvitationCodes: 'POST /api/invitation-codes',
      asianRecommendation: 'POST /api/recommend/asian',
      sizeRecommendation: 'POST /api/recommend/size'
    }
  });
});

// API根路径
app.get('/api', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Football Handicap API',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// 测试数据库连接
app.get('/api/test', async (req, res) => {
  try {
    // 测试数据库连接
    const dbResult = await pool.query('SELECT NOW() as time, version() as version');
    
    // 检查各表状态
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    `);
    
    // 统计用户数
    let userCount = 0;
    try {
      const usersCheck = await pool.query('SELECT COUNT(*) as count FROM users');
      userCount = usersCheck.rows[0]?.count || 0;
    } catch (err) {
      console.log('用户表查询失败:', err.message);
    }
    
    // 统计记录数
    let recordCount = 0;
    try {
      const recordsCheck = await pool.query('SELECT COUNT(*) as count FROM handicap_records');
      recordCount = recordsCheck.rows[0]?.count || 0;
    } catch (err) {
      console.log('记录表查询失败:', err.message);
    }
    
    res.json({ 
      success: true, 
      message: '服务器运行正常',
      database: {
        status: '正常连接',
        time: dbResult.rows[0].time,
        version: dbResult.rows[0].version,
        tables_count: tablesCheck.rows.length,
        users_count: userCount,
        records_count: recordCount
      },
      server: {
        uptime: process.uptime(),
        node_version: process.version,
        memory_usage: process.memoryUsage(),
        timestamp: new Date().toISOString()
      },
      system: {
        env: process.env.NODE_ENV || 'development',
        platform: process.platform,
        arch: process.arch
      }
    });
  } catch (err) {
    console.error('数据库连接测试失败:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      details: '请检查DATABASE_URL环境变量',
      timestamp: new Date().toISOString()
    });
  }
});

// 用户注册
app.post('/api/register', async (req, res) => {
  const { username, password, invitationCode } = req.body;
  
  console.log('📝 注册请求:', { username, invitationCode });
  
  // 验证输入
  if (!username || username.length < 3) {
    return res.status(400).json({ 
      success: false, 
      error: '用户名至少需要3个字符' 
    });
  }
  
  if (!password || password.length < 6) {
    return res.status(400).json({ 
      success: false, 
      error: '密码至少需要6个字符' 
    });
  }
  
  try {
    // 检查用户名是否已存在
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: '用户名已存在' 
      });
    }
    
    // 验证邀请码
    let userType = 'trial';
    if (invitationCode) {
      const codeCheck = await pool.query(
        'SELECT * FROM invitation_codes WHERE code = $1 AND is_used = false',
        [invitationCode]
      );
      
      if (codeCheck.rows.length > 0) {
        userType = 'registered';
        // 标记邀请码为已使用
        await pool.query(
          'UPDATE invitation_codes SET is_used = true, used_by = $1, used_date = CURRENT_TIMESTAMP WHERE code = $2',
          [username, invitationCode]
        );
        console.log(`✅ 邀请码 ${invitationCode} 已被 ${username} 使用`);
      } else {
        return res.status(400).json({ 
          success: false, 
          error: '无效的邀请码' 
        });
      }
    }
    
    // 创建用户 - 注意：实际应用中应该加密密码
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7); // 7天试用期
    
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, user_type, trial_start_date, trial_end_date) 
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4) 
       RETURNING id, username, user_type, trial_count, trial_end_date`,
      [username, password, userType, trialEndDate]
    );
    
    const user = result.rows[0];
    console.log(`✅ 用户 ${username} 注册成功，类型: ${userType}`);
    
    res.json({
      success: true,
      message: userType === 'trial' ? '试用用户注册成功' : '正式用户注册成功',
      user: {
        id: user.id,
        username: user.username,
        user_type: user.user_type,
        trial_count: user.trial_count,
        trial_end_date: user.trial_end_date
      }
    });
    
  } catch (err) {
    console.error('❌ 注册错误:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// 用户登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  console.log('🔐 登录请求:', { username });
  
  // 验证输入
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      error: '用户名和密码不能为空' 
    });
  }
  
  try {
    const result = await pool.query(
      `SELECT id, username, user_type, trial_count, trial_end_date 
       FROM users 
       WHERE username = $1 AND password_hash = $2`,
      [username, password]
    );
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      
      // 检查试用期是否过期
      if (user.user_type === 'trial') {
        const now = new Date();
        const trialEnd = new Date(user.trial_end_date);
        
        if (now > trialEnd) {
          return res.status(403).json({ 
            success: false, 
            error: '试用期已过期，请注册正式会员' 
          });
        }
      }
      
      // 更新最后登录时间
      await pool.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
      
      console.log(`✅ 用户 ${username} 登录成功`);
      
      res.json({
        success: true,
        message: '登录成功',
        user: user
      });
    } else {
      console.log(`❌ 登录失败: 用户名或密码错误`);
      res.status(401).json({ 
        success: false, 
        error: '用户名或密码错误' 
      });
    }
  } catch (err) {
    console.error('❌ 登录错误:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// 获取用户历史记录
app.get('/api/history', async (req, res) => {
  const { userId, limit = 50 } = req.query;
  
  console.log('📖 获取历史记录:', { userId, limit });
  
  if (!userId) {
    return res.status(400).json({ 
      success: false, 
      error: '缺少用户ID参数' 
    });
  }
  
  try {
    const result = await pool.query(
      `SELECT * FROM handicap_records 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    
    console.log(`✅ 获取到 ${result.rows.length} 条历史记录`);
    
    res.json({
      success: true,
      count: result.rows.length,
      records: result.rows
    });
  } catch (err) {
    console.error('❌ 获取历史记录错误:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// 保存记录
app.post('/api/records', async (req, res) => {
  const record = req.body;
  
  console.log('💾 保存记录请求:', { 
    userId: record.user_id, 
    matchName: record.match_name,
    handicapType: record.handicap_type 
  });
  
  // 验证必要字段
  if (!record.user_id) {
    return res.status(400).json({ 
      success: false, 
      error: '缺少用户ID' 
    });
  }
  
  if (!record.match_name) {
    return res.status(400).json({ 
      success: false, 
      error: '缺少赛事名称' 
    });
  }
  
  try {
    // 检查用户是否存在
    const userCheck = await pool.query(
      'SELECT id, user_type, trial_count, trial_end_date FROM users WHERE id = $1',
      [record.user_id]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: '用户不存在' 
      });
    }
    
    const user = userCheck.rows[0];
    
    // 检查试用用户限制
    if (user.user_type === 'trial') {
      const now = new Date();
      const trialEnd = new Date(user.trial_end_date);
      
      // 检查试用期
      if (now > trialEnd) {
        return res.status(403).json({ 
          success: false, 
          error: '试用期已过期，请注册正式会员继续使用' 
        });
      }
      
      // 检查试用次数
      if (user.trial_count >= 18) {
        return res.status(403).json({ 
          success: false, 
          error: '试用次数已用完（18次），请注册正式会员继续使用' 
        });
      }
    }
    
    // 计算变化值
    const handicapChange = (record.current_handicap - record.initial_handicap).toFixed(2);
    const waterChange = (record.current_water - record.initial_water).toFixed(2);
    
    // 保存记录
    const result = await pool.query(
      `INSERT INTO handicap_records 
       (user_id, match_name, handicap_type, initial_handicap, current_handicap, 
        initial_water, current_water, handicap_change, water_change, 
        historical_record, recommendation, actual_result) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING id, created_at`,
      [
        record.user_id, 
        record.match_name,
        record.handicap_type || 'asian',
        record.initial_handicap || 0,
        record.current_handicap || 0,
        record.initial_water || 0,
        record.current_water || 0,
        handicapChange,
        waterChange,
        record.historical_record || '',
        record.recommendation || '等待输入',
        record.actual_result || ''
      ]
    );
    
    const savedRecord = result.rows[0];
    
    // 如果是试用用户，增加试用次数
    if (user.user_type === 'trial') {
      await pool.query(
        'UPDATE users SET trial_count = trial_count + 1 WHERE id = $1',
        [record.user_id]
      );
      
      // 获取更新后的试用次数
      const updatedUser = await pool.query(
        'SELECT trial_count FROM users WHERE id = $1',
        [record.user_id]
      );
      
      console.log(`✅ 试用用户 ${user.id} 保存记录，试用次数: ${updatedUser.rows[0].trial_count}/18`);
    } else {
      console.log(`✅ 正式用户 ${user.id} 保存记录`);
    }
    
    res.json({
      success: true,
      message: '记录保存成功',
      recordId: savedRecord.id,
      createdAt: savedRecord.created_at,
      trialInfo: user.user_type === 'trial' ? {
        trialCount: user.trial_count + 1,
        remaining: 18 - (user.trial_count + 1)
      } : null
    });
    
  } catch (err) {
    console.error('❌ 保存记录错误:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      details: '保存记录时发生错误，请稍后重试'
    });
  }
});

// 更新记录
app.put('/api/records/:id', async (req, res) => {
  const { id } = req.params;
  const { actual_result } = req.body;
  
  console.log('🔄 更新记录:', { id, actual_result });
  
  if (!id) {
    return res.status(400).json({ 
      success: false, 
      error: '缺少记录ID' 
    });
  }
  
  try {
    const result = await pool.query(
      'UPDATE handicap_records SET actual_result = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
      [actual_result, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: '记录不存在' 
      });
    }
    
    console.log(`✅ 记录 ${id} 更新成功`);
    
    res.json({ 
      success: true,
      message: '记录更新成功'
    });
  } catch (err) {
    console.error('❌ 更新记录错误:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// 删除记录
app.delete('/api/records/:id', async (req, res) => {
  const { id } = req.params;
  
  console.log('🗑️ 删除记录:', { id });
  
  if (!id) {
    return res.status(400).json({ 
      success: false, 
      error: '缺少记录ID' 
    });
  }
  
  try {
    const result = await pool.query(
      'DELETE FROM handicap_records WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: '记录不存在' 
      });
    }
    
    console.log(`✅ 记录 ${id} 删除成功`);
    
    res.json({ 
      success: true,
      message: '记录删除成功'
    });
  } catch (err) {
    console.error('❌ 删除记录错误:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// 获取邀请码列表
app.get('/api/invitation-codes', async (req, res) => {
  console.log('🔑 获取邀请码列表');
  
  try {
    const result = await pool.query(
      'SELECT code, created_by, created_at FROM invitation_codes WHERE is_used = false ORDER BY created_at DESC'
    );
    
    console.log(`✅ 获取到 ${result.rows.length} 个可用邀请码`);
    
    res.json({
      success: true,
      count: result.rows.length,
      codes: result.rows
    });
  } catch (err) {
    console.error('❌ 获取邀请码错误:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// 导入邀请码
app.post('/api/invitation-codes', async (req, res) => {
  const { codes, createdBy = 'admin' } = req.body;
  
  console.log('📤 导入邀请码请求:', { codesCount: codes?.length, createdBy });
  
  if (!codes || !Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: '请提供有效的邀请码列表' 
    });
  }
  
  try {
    const inserted = [];
    const errors = [];
    
    for (const code of codes) {
      const cleanCode = code.trim();
      
      if (!cleanCode) {
        errors.push({ code: code, error: '空代码' });
        continue;
      }
      
      try {
        const result = await pool.query(
          `INSERT INTO invitation_codes (code, created_by) 
           VALUES ($1, $2) 
           ON CONFLICT (code) DO NOTHING 
           RETURNING code`,
          [cleanCode, createdBy]
        );
        
        if (result.rows.length > 0) {
          inserted.push(cleanCode);
        }
      } catch (err) {
        errors.push({ code: cleanCode, error: err.message });
      }
    }
    
    console.log(`✅ 成功导入 ${inserted.length} 个邀请码，失败 ${errors.length} 个`);
    
    res.json({
      success: true,
      inserted: inserted,
      errors: errors,
      message: `成功导入 ${inserted.length} 个邀请码，失败 ${errors.length} 个`
    });
  } catch (err) {
    console.error('❌ 导入邀请码错误:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// 让球盘推荐计算
app.post('/api/recommend/asian', async (req, res) => {
  const data = req.body;
  
  console.log('📊 让球盘推荐请求:', { 
    matchName: data.matchName,
    initialHandicap: data.initialHandicap,
    currentHandicap: data.currentHandicap
  });
  
  try {
    const recommendation = calculateAsianRecommendation(data);
    const details = getAsianRecommendationDetails(data);
    
    res.json({
      success: true,
      recommendation: recommendation,
      details: details,
      data: {
        handicapChange: (data.currentHandicap - data.initialHandicap).toFixed(2),
        waterChange: (data.currentWater - data.initialWater).toFixed(2)
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ 推荐计算错误:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// 大小盘推荐计算
app.post('/api/recommend/size', async (req, res) => {
  const data = req.body;
  
  console.log('📊 大小盘推荐请求:', { 
    matchName: data.matchName,
    initialHandicap: data.initialHandicap,
    currentHandicap: data.currentHandicap
  });
  
  try {
    const recommendation = calculateSizeRecommendation(data);
    const details = getSizeRecommendationDetails(data);
    
    res.json({
      success: true,
      recommendation: recommendation,
      details: details,
      data: {
        handicapChange: (data.currentHandicap - data.initialHandicap).toFixed(2),
        waterChange: (data.currentWater - data.initialWater).toFixed(2)
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ 推荐计算错误:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ============== 推荐算法函数 ============== //
function calculateAsianRecommendation(data) {
  const { initialHandicap, currentHandicap, initialWater, currentWater, historicalRecord } = data;
  
  const handicapChange = currentHandicap - initialHandicap;
  const waterChange = currentWater - initialWater;
  
  // 规则1：盘口上升 + 水位下降 → 上盘
  if (handicapChange > 0 && waterChange < 0) {
    return '上盘';
  }
  
  // 规则2：盘口下降 + 水位上升 → 下盘
  if (handicapChange < 0 && waterChange > 0) {
    return '下盘';
  }
  
  // 规则3：历史战绩优先
  if (historicalRecord === 'win') {
    return '上盘';
  }
  
  if (historicalRecord === 'loss') {
    return '下盘';
  }
  
  // 规则4：水位变化优先
  if (waterChange < -0.05) {
    return '上盘';
  }
  
  if (waterChange > 0.05) {
    return '下盘';
  }
  
  // 默认：观望
  return '观望';
}

function getAsianRecommendationDetails(data) {
  const { initialHandicap, currentHandicap, initialWater, currentWater, historicalRecord } = data;
  
  const handicapChange = currentHandicap - initialHandicap;
  const waterChange = currentWater - initialWater;
  
  let details = `盘口变化: ${handicapChange > 0 ? '↑' : handicapChange < 0 ? '↓' : '→'} ${Math.abs(handicapChange).toFixed(2)} | `;
  details += `水位变化: ${waterChange > 0 ? '↑' : waterChange < 0 ? '↓' : '→'} ${Math.abs(waterChange).toFixed(2)}`;
  
  if (historicalRecord) {
    details += ` | 历史: ${historicalRecord === 'win' ? '赢' : '输'}`;
  }
  
  return details;
}

function calculateSizeRecommendation(data) {
  const { initialHandicap, currentHandicap, initialWater, currentWater, historicalRecord } = data;
  
  const handicapChange = currentHandicap - initialHandicap;
  const waterChange = currentWater - initialWater;
  
  // 规则1：盘口上升 + 水位上升 → 大球
  if (handicapChange > 0 && waterChange > 0) {
    return '大球';
  }
  
  // 规则2：盘口下降 + 水位下降 → 小球
  if (handicapChange < 0 && waterChange < 0) {
    return '小球';
  }
  
  // 规则3：历史战绩优先
  if (historicalRecord === 'win') {
    return '大球';
  }
  
  if (historicalRecord === 'loss') {
    return '小球';
  }
  
  // 规则4：水位变化优先
  if (waterChange > 0.05) {
    return '大球';
  }
  
  if (waterChange < -0.05) {
    return '小球';
  }
  
  // 默认：观望
  return '观望';
}

function getSizeRecommendationDetails(data) {
  const { initialHandicap, currentHandicap, initialWater, currentWater, historicalRecord } = data;
  
  const handicapChange = currentHandicap - initialHandicap;
  const waterChange = currentWater - initialWater;
  
  let details = `大小盘变化: ${handicapChange > 0 ? '↑' : handicapChange < 0 ? '↓' : '→'} ${Math.abs(handicapChange).toFixed(2)} | `;
  details += `水位变化: ${waterChange > 0 ? '↑' : waterChange < 0 ? '↓' : '→'} ${Math.abs(waterChange).toFixed(2)}`;
  
  if (historicalRecord) {
    details += ` | 历史: ${historicalRecord === 'win' ? '赢' : '输'}`;
  }
  
  return details;
}

// ============== 中间件 ============== //

// 处理OPTIONS预检请求
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.status(200).send();
});

// 404处理中间件
app.use('/api/*', (req, res) => {
  console.log(`❌ 路由不存在: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: `API路由不存在: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
    availableRoutes: [
      'GET  /api',
      'GET  /api/test',
      'POST /api/register',
      'POST /api/login',
      'GET  /api/history?userId=',
      'POST /api/records',
      'PUT  /api/records/:id',
      'DELETE /api/records/:id',
      'GET  /api/invitation-codes',
      'POST /api/invitation-codes',
      'POST /api/recommend/asian',
      'POST /api/recommend/size'
    ]
  });
});

// 通用404处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `路由不存在: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
    apiRoot: '/api'
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('❌ 服务器错误:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// ============== 服务器启动 ============== //

// 初始化并启动服务器
async function startServer() {
  try {
    // 初始化数据库
    await initDatabase();
    
    // 本地开发启动
    if (require.main === module) {
      const PORT = process.env.PORT || 3001;
      app.listen(PORT, () => {
        console.log('🚀 服务器启动成功');
        console.log(`📡 本地地址: http://localhost:${PORT}`);
        console.log(`🌐 API地址: http://localhost:${PORT}/api`);
        console.log(`🕐 启动时间: ${new Date().toLocaleString()}`);
      });
    }
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

// 启动服务器
startServer();

// 导出应用供 Vercel 使用
module.exports = app;
