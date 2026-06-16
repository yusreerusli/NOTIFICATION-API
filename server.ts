import express from 'express';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

// Port configuration
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// Initialize SQLite Database
const dbFile = path.resolve('policy_store.db');
let db: Database.Database;

try {
  db = new Database(dbFile);
  // Enable Write-Ahead Logging for performance and modern concurrency support
  db.pragma('journal_mode = WAL');
} catch (error) {
  console.error('Failed to open database, trying re-creation:', error);
  if (fs.existsSync(dbFile)) {
    try {
      fs.unlinkSync(dbFile);
    } catch (e) {
      console.error('Could not delete corrupt db file:', e);
    }
  }
  db = new Database(dbFile);
}

// Database integrity check (additional instructions compliance)
function verifyDatabaseIntegrity() {
  try {
    const result = db.prepare('PRAGMA integrity_check;').get() as { integrity_check: string } | undefined;
    const status = result?.integrity_check || 'unknown';
    console.log(`[Database Integrity Check]: ${status}`);
    if (status !== 'ok') {
      throw new Error(`Database integrity compromised: ${status}`);
    }
    return true;
  } catch (error) {
    console.error('Database integrity verification failed:', error);
    return false;
  }
}

// Create schema with SQL injection immune parameters/definitions
db.exec(`
  CREATE TABLE IF NOT EXISTS policy_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT,
    snippet TEXT,
    answer TEXT NOT NULL,
    model_used TEXT,
    store_type TEXT NOT NULL, -- 'daily' or 'permanent'
    created_at INTEGER NOT NULL -- epoch timestamp
  );

  CREATE TABLE IF NOT EXISTS api_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
`);

// Verify integrity immediately after creation/load
verifyDatabaseIntegrity();

// Clean up expired daily records (older than 24h)
function cleanupExpiredDaily() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  try {
    const stmt = db.prepare('DELETE FROM policy_answers WHERE store_type = ? AND created_at < ?');
    const result = stmt.run('daily', cutoff);
    if (result.changes > 0) {
      console.log(`[Auto-cleanup] Deleted ${result.changes} expired daily records.`);
    }
  } catch (err) {
    console.error('Failed to clean up expired records:', err);
  }
}

// Run cleanup immediately and then periodically every 5 minutes
cleanupExpiredDaily();
setInterval(cleanupExpiredDaily, 5 * 60 * 1000);

// Database Seeding Logic (maintain startup seeding as requested)
function seedDatabase() {
  cleanupExpiredDaily();
  
  // Seed default developer API authorization token
  try {
    const tokensCount = (db.prepare('SELECT COUNT(*) as count FROM api_tokens').get() as any).count;
    if (tokensCount === 0) {
      console.log('[Database Seeding] Creating default developer API token...');
      db.prepare('INSERT INTO api_tokens (name, token, created_at) VALUES (?, ?, ?)')
        .run('Default Dev Key', 'policy_tok_dev_master_6fb2a0', Date.now());
    }
  } catch (err) {
    console.error('Failed to seed authentication tokens:', err);
  }

  const countStmt = db.prepare('SELECT COUNT(*) as count FROM policy_answers');
  const { count } = countStmt.get() as { count: number };

  if (count === 0) {
    console.log('[Database Seeding] Database is empty. Inserting default policy answers...');
    const insertStmt = db.prepare(`
      INSERT INTO policy_answers (source, snippet, answer, model_used, store_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // 1. A default daily record (based on the user pool)
    insertStmt.run(
      '/mnt/itpolicies/Policy/MODIFIED/TR-POL-008 Desktop and Notebook Usage Policy.docx (Page 5, [CompositeElement]) | /mnt/itpolicies/Policy/MODIFIED/TR-POL-006 Internet and E-mail Security Policy.docx (Page 8, [CompositeElement])',
      'Source Document: TR-POL-008 Desktop and Notebook Usage Policy.docx Section: USAGE POLICY Content: Al...\n---\nSource Document: TR-POL-006 Internet and E-mail Security Policy.docx Section: POLICY STATEMENT Conte...',
      `TRI-E DAILY DO'S AND DONT'S REMINDER  \nDO'S :  \nUse company-approved system access forms for all work-related activities (Reference: Desktop and Notebook Usage Policy)  \n\nDON'T:  \nSend personal emails or use non-business-related internet services (Reference: Internet and E-mail Security Policy)`,
      'qwen3:8b',
      'daily',
      Date.now()
    );

    // 2. A default permanent record (compliance example)
    insertStmt.run(
      '/mnt/itpolicies/Policy/MODIFIED/TR-POL-001 IT General Controls.docx (Page 12, [ComplianceSection])',
      'Source Document: TR-POL-001 IT General Controls.docx Section: AUDITING Content: Annual system and infrastructure audits must be carried out by certified external auditors.',
      `IT SYSTEM AUDITING STANDARDS\nAll core network directory instances and cloud storage repositories are subject to mandatory quarterly access review, with formal independent auditing performed annually on October 1st.`,
      'gpt-4o-mini',
      'permanent',
      Date.now() - 2 * 3600 * 1000 // 2 hours old
    );

    console.log('[Database Seeding] Completed database seeding.');
  }
}

seedDatabase();

// Authentication Token verification middleware
function checkAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];
  
  let tokenToValidate = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    tokenToValidate = authHeader.substring(7);
  } else if (apiKeyHeader) {
    tokenToValidate = String(apiKeyHeader);
  }

  try {
    const tokensCount = (db.prepare('SELECT COUNT(*) as c FROM api_tokens').get() as any).c;
    if (tokensCount === 0) {
      // If no tokens exist, bypass checks dynamically to make testing easy
      return next();
    }
    
    if (!tokenToValidate) {
      return res.status(401).json({ error: 'Unauthorized: Missing API token. Please specify header "Authorization: Bearer <token>" or "x-api-key: <token>".' });
    }
    
    const validToken = db.prepare('SELECT * FROM api_tokens WHERE token = ?').get(tokenToValidate);
    if (!validToken) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API token.' });
    }
    
    next();
  } catch (error: any) {
    res.status(500).json({ error: 'Authorization verification failed', details: error.message });
  }
}

// API Server Endpoints

// Token Management Endpoints
app.get(['/api/tokens', '/tokens'], (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM api_tokens ORDER BY created_at DESC').all();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve API tokens.', details: err.message });
  }
});

app.post(['/api/tokens', '/tokens'], (req, res) => {
  try {
    const { name, token } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Missing or invalid required string "name" field.' });
    }
    
    // Generate secure token string if none specified
    const generatedToken = token && typeof token === 'string' && token.trim()
      ? token.trim()
      : 'policy_tok_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

    const insert = db.prepare('INSERT INTO api_tokens (name, token, created_at) VALUES (?, ?, ?)');
    const result = insert.run(name.trim(), generatedToken, Date.now());
    
    res.status(201).json({
      success: true,
      id: result.lastInsertRowid,
      name: name.trim(),
      token: generatedToken,
      created_at: Date.now()
    });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Token string must be unique.' });
    }
    res.status(500).json({ error: 'Failed to register API token.', details: err.message });
  }
});

app.delete(['/api/tokens/:id', '/tokens/:id'], (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM api_tokens WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Requested API token not found.' });
    }
    res.json({ success: true, message: 'API token successfully revoked.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to revoke token', details: err.message });
  }
});

// 1. POST - Daily storage (expiring in 24 hours) - Immune to SQL Injection through parametrized queries
app.post(['/api/store/daily', '/store/daily'], checkAuth, (req, res) => {
  try {
    const { source, snippet, answer, model_used } = req.body;

    if (!answer || typeof answer !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid required "answer" field.' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO policy_answers (source, snippet, answer, model_used, store_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      source ? String(source) : null,
      snippet ? String(snippet) : null,
      String(answer),
      model_used ? String(model_used) : null,
      'daily',
      Date.now()
    );

    res.status(201).json({
      success: true,
      id: result.lastInsertRowid,
      store_type: 'daily',
      message: 'Record saved successfully. Will be dynamically cleared after 24 hours.'
    });
  } catch (error: any) {
    console.error('Error in /api/store/daily:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// 2. POST - Permanent storage
app.post(['/api/store/permanent', '/store/permanent'], checkAuth, (req, res) => {
  try {
    const { source, snippet, answer, model_used } = req.body;

    if (!answer || typeof answer !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid required "answer" field.' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO policy_answers (source, snippet, answer, model_used, store_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      source ? String(source) : null,
      snippet ? String(snippet) : null,
      String(answer),
      model_used ? String(model_used) : null,
      'permanent',
      Date.now()
    );

    res.status(201).json({
      success: true,
      id: result.lastInsertRowid,
      store_type: 'permanent',
      message: 'Record saved permanently in secure compliance store.'
    });
  } catch (error: any) {
    console.error('Error in /api/store/permanent:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// 2b. POST - Replace storage (always replaces the entry so only 1 record exists at any point)
app.post(['/api/store/replace', '/store/replace'], checkAuth, (req, res) => {
  try {
    const { source, snippet, answer, model_used } = req.body;

    if (!answer || typeof answer !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid required "answer" field.' });
    }

    const deleteStmt = db.prepare("DELETE FROM policy_answers WHERE store_type = 'replace'");
    const insertStmt = db.prepare(`
      INSERT INTO policy_answers (source, snippet, answer, model_used, store_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let result: Database.RunResult;
    db.transaction(() => {
      deleteStmt.run();
      result = insertStmt.run(
        source ? String(source) : null,
        snippet ? String(snippet) : null,
        String(answer),
        model_used ? String(model_used) : null,
        'replace',
        Date.now()
      );
    })();

    // Verify integrity after any write modification as requested
    verifyDatabaseIntegrity();

    res.status(201).json({
      success: true,
      id: result!.lastInsertRowid,
      store_type: 'replace',
      message: 'Record saved successfully, replacing any previous single replace storage entry.'
    });
  } catch (error: any) {
    console.error('Error in /api/store/replace:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// 3. GET - Retrieve daily records
app.get(['/api/retrieve/daily', '/retrieve/daily'], checkAuth, (req, res) => {
  try {
    // Explicit clean-up run to ensure fresh results
    cleanupExpiredDaily();

    const fetchStmt = db.prepare(`
      SELECT * FROM policy_answers 
      WHERE store_type = 'daily' 
      ORDER BY created_at DESC
    `);
    const records = fetchStmt.all();
    res.json(records);
  } catch (error: any) {
    console.error('Error in /api/retrieve/daily:', error);
    res.status(500).json({ error: 'Failed to retrieve records', details: error.message });
  }
});

// 4. GET - Retrieve permanent records
app.get(['/api/retrieve/permanent', '/retrieve/permanent'], checkAuth, (req, res) => {
  try {
    const fetchStmt = db.prepare(`
      SELECT * FROM policy_answers 
      WHERE store_type = 'permanent' 
      ORDER BY created_at DESC
    `);
    const records = fetchStmt.all();
    res.json(records);
  } catch (error: any) {
    console.error('Error in /api/retrieve/permanent:', error);
    res.status(500).json({ error: 'Failed to retrieve permanent records', details: error.message });
  }
});

// 4b. GET - Retrieve replace records
app.get(['/api/retrieve/replace', '/retrieve/replace'], checkAuth, (req, res) => {
  try {
    const fetchStmt = db.prepare(`
      SELECT * FROM policy_answers 
      WHERE store_type = 'replace' 
      ORDER BY created_at DESC
    `);
    const records = fetchStmt.all();
    res.json(records);
  } catch (error: any) {
    console.error('Error in /api/retrieve/replace:', error);
    res.status(500).json({ error: 'Failed to retrieve replace records', details: error.message });
  }
});

// 5. GET - System stats & integrity (Powers the High Density live telemetry UI safely)
app.get(['/api/status', '/status'], (req, res) => {
  try {
    const dailyCount = (db.prepare("SELECT COUNT(*) as c FROM policy_answers WHERE store_type = 'daily'").get() as any).c;
    const permanentCount = (db.prepare("SELECT COUNT(*) as c FROM policy_answers WHERE store_type = 'permanent'").get() as any).c;
    const replaceCount = (db.prepare("SELECT COUNT(*) as c FROM policy_answers WHERE store_type = 'replace'").get() as any).c;
    
    let dbSize = 0;
    try {
      if (fs.existsSync(dbFile)) {
        dbSize = fs.statSync(dbFile).size;
      }
    } catch (_) {}

    // Version loaded directly from package.json
    let appVersion = '1.0.0';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
      appVersion = pkg.version || '1.0.0';
    } catch (_) {}

    res.json({
      dbFile,
      dbSize,
      appVersion,
      dailyCount,
      permanentCount,
      replaceCount,
      isIntegrityOk: verifyDatabaseIntegrity(),
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 10) / 10,
      uptime: Math.round((Date.now() - startTime) / 1000)
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch engine status', details: error.message });
  }
});

// 6. POST - Trigger manual clean-up/restart/reset simulation
app.post(['/api/action/reverify', '/action/reverify'], (req, res) => {
  try {
    cleanupExpiredDaily();
    const integrity = verifyDatabaseIntegrity();
    res.json({ success: true, integrity, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. POST - Dynamic simulation of dropping database and re-seeding
app.post(['/api/action/reset', '/action/reset'], (req, res) => {
  try {
    db.exec('DELETE FROM policy_answers');
    db.exec('DELETE FROM api_tokens');
    seedDatabase();
    res.json({ success: true, message: 'Database reset and default seeds loaded.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const startTime = Date.now();

// React SPA delivery and HMR handling
async function startServer() {
  if (process.env.NODE_ENV === 'production' || fs.existsSync(path.resolve('dist'))) {
    // Serve from Vite static production builds
    const distPath = path.resolve('dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
      console.log('[Storage Engine Manager] Running in PRODUCTION Mode (serving static files)');
    } else {
      console.warn('Production "dist" folder not found. Please compile/build before running in production.');
    }
  } else {
    // Development mode with dynamic Vite loading
    try {
      const { createServer } = await import('vite');
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
      console.log('[Storage Engine Manager] Running in DEVELOPMENT Mode with hot-reloading');
    } catch (err: any) {
      console.error('Failed to start Vite dev server, serving fallback or check build:', err);
    }
  }

  app.listen(PORT, () => {
    console.log(`[Storage Engine Manager Status] Live and Listening on Port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Fatal initialization error:', error);
});
