// server.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS配置
app.use(cors());
app.use(express.json());

// Neon PostgreSQL 连接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 数据库表结构初始化
const initDatabase = async () => {
  const createTables = `
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
    
    CREATE TABLE IF NOT EXISTS invitation_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(100) UNIQUE NOT NULL,
      created_by VARCHAR(100),
      used_by VARCHAR(100),
      used_date TIMESTAMP,
      is_used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
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
    
    CREATE TABLE IF NOT EXISTS user_fingerprints (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      fingerprint TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_handicap_records_user_id ON handicap_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_handicap_records_created_at ON handicap_records(created_at);
  `;

  try {
    await pool.query(createTables);
    console.log('数据库表初始化完成');
  } catch (err) {
    console.error('数据库初始化错误:', err);
  }
};

// 测试连接
app.get('/api/test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time');
    res.json({ 
      success: true, 
      message: '服务器正常运行',
      time: result.rows[0].time 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 用户注册
app.post('/api/register', async (req, res) => {
  const { username, password, invitationCode } = req.body;
  
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
      } else {
        return res.status(400).json({ 
          success: false, 
          error: '无效的邀请码' 
        });
      }
    }
    
    // 创建用户
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7); // 7天试用期
    
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, user_type, trial_start_date, trial_end_date) 
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4) 
       RETURNING id, username, user_type`,
      [username, password, userType, trialEndDate]
    );
    
    res.json({
      success: true,
      user: result.rows[0]
    });
    
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 用户登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await pool.query(
      `SELECT id, username, user_type, trial_count, trial_end_date 
       FROM users 
       WHERE username = $1 AND password_hash = $2`,
      [username, password]
    );
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      
      // 更新最后登录时间
      await pool.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
      
      res.json({
        success: true,
        user: user
      });
    } else {
      res.status(401).json({ 
        success: false, 
        error: '用户名或密码错误' 
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取用户历史记录
app.get('/api/history', async (req, res) => {
  const { userId } = req.query;
  
  try {
    const result = await pool.query(
      `SELECT * FROM handicap_records 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    
    res.json({
      success: true,
      records: result.rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 保存记录
app.post('/api/records', async (req, res) => {
  const record = req.body;
  
  try {
    // 检查试用次数
    const userCheck = await pool.query(
      'SELECT trial_count, trial_end_date FROM users WHERE id = $1',
      [record.user_id]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    const user = userCheck.rows[0];
    
    // 如果是试用用户，检查试用次数和试用期
    const isTrial = record.user_type === 'trial';
    if (isTrial) {
      const now = new Date();
      const trialEnd = new Date(user.trial_end_date);
      
      if (now > trialEnd) {
        return res.status(403).json({ 
          success: false, 
          error: '试用期已过期' 
        });
      }
      
      if (user.trial_count >= 18) {
        return res.status(403).json({ 
          success: false, 
          error: '试用次数已用完' 
        });
      }
    }
    
    // 保存记录
    const result = await pool.query(
      `INSERT INTO handicap_records 
       (user_id, match_name, handicap_type, initial_handicap, current_handicap, 
        initial_water, current_water, handicap_change, water_change, 
        historical_record, recommendation, actual_result) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING id`,
      [
        record.user_id, record.match_name, record.handicap_type,
        record.initial_handicap, record.current_handicap,
        record.initial_water, record.current_water,
        record.handicap_change, record.water_change,
        record.historical_record, record.recommendation, record.actual_result
      ]
    );
    
    // 如果是试用用户，增加试用次数
    if (isTrial) {
      await pool.query(
        'UPDATE users SET trial_count = trial_count + 1 WHERE id = $1',
        [record.user_id]
      );
    }
    
    res.json({
      success: true,
      recordId: result.rows[0].id
    });
    
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新记录（如实际结果）
app.put('/api/records/:id', async (req, res) => {
  const { id } = req.params;
  const { actual_result } = req.body;
  
  try {
    await pool.query(
      'UPDATE handicap_records SET actual_result = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [actual_result, id]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除记录
app.delete('/api/records/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query('DELETE FROM handicap_records WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 导入邀请码
app.post('/api/invitation-codes', async (req, res) => {
  const { codes, createdBy } = req.body;
  
  try {
    const inserted = [];
    
    for (const code of codes) {
      try {
        const result = await pool.query(
          `INSERT INTO invitation_codes (code, created_by) 
           VALUES ($1, $2) 
           ON CONFLICT (code) DO NOTHING 
           RETURNING code`,
          [code, createdBy]
        );
        
        if (result.rows.length > 0) {
          inserted.push(code);
        }
      } catch (err) {
        console.error(`插入邀请码 ${code} 失败:`, err);
      }
    }
    
    res.json({
      success: true,
      inserted: inserted
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取可用邀请码
app.get('/api/invitation-codes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT code, created_by, created_at FROM invitation_codes WHERE is_used = false ORDER BY created_at DESC'
    );
    
    res.json({
      success: true,
      codes: result.rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 推荐算法（示例）
app.post('/api/recommend/asian', async (req, res) => {
  const data = req.body;
  
  try {
    // 这里是你的推荐算法逻辑
    const recommendation = calculateAsianRecommendation(data);
    
    res.json({
      success: true,
      recommendation: recommendation,
      details: '基于盘口变化和水位变化的推荐'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recommend/size', async (req, res) => {
  const data = req.body;
  
  try {
    const recommendation = calculateSizeRecommendation(data);
    
    res.json({
      success: true,
      recommendation: recommendation,
      details: '基于大小盘变化的推荐'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function calculateAsianRecommendation(data) {
  // 实现你的让球盘推荐算法
  const { initialHandicap, currentHandicap, initialWater, currentWater, historicalRecord } = data;
  
  // 示例逻辑
  const handicapChange = currentHandicap - initialHandicap;
  const waterChange = currentWater - initialWater;
  
  if (handicapChange > 0 && waterChange < 0) {
    return '上盘';
  } else if (handicapChange < 0 && waterChange > 0) {
    return '下盘';
  } else {
    return '观望';
  }
}

function calculateSizeRecommendation(data) {
  // 实现你的大小盘推荐算法
  const { initialHandicap, currentHandicap, initialWater, currentWater, historicalRecord } = data;
  
  // 示例逻辑
  const handicapChange = currentHandicap - initialHandicap;
  const waterChange = currentWater - initialWater;
  
  if (handicapChange > 0 && waterChange > 0) {
    return '大球';
  } else if (handicapChange < 0 && waterChange < 0) {
    return '小球';
  } else {
    return '观望';
  }
}

// 初始化数据库并启动服务器
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
  });
});
