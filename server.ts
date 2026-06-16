import express from 'express';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

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

// API Server Endpoints

// 1. POST - Daily storage (expiring in 24 hours) - Immune to SQL Injection through parametrized queries
app.post('/api/store/daily', (req, res) => {
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
app.post('/api/store/permanent', (req, res) => {
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

// 3. GET - Retrieve daily records
app.get('/api/retrieve/daily', (req, res) => {
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
app.get('/api/retrieve/permanent', (req, res) => {
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

// 5. GET - System stats & integrity (Powers the High Density live telemetry UI safely)
app.get('/api/status', (req, res) => {
  try {
    const dailyCount = (db.prepare("SELECT COUNT(*) as c FROM policy_answers WHERE store_type = 'daily'").get() as any).c;
    const permanentCount = (db.prepare("SELECT COUNT(*) as c FROM policy_answers WHERE store_type = 'permanent'").get() as any).c;
    
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
      isIntegrityOk: verifyDatabaseIntegrity(),
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 10) / 10,
      uptime: Math.round((Date.now() - startTime) / 1000)
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch engine status', details: error.message });
  }
});

// 6. POST - Trigger manual clean-up/restart/reset simulation
app.post('/api/action/reverify', (req, res) => {
  try {
    cleanupExpiredDaily();
    const integrity = verifyDatabaseIntegrity();
    res.json({ success: true, integrity, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. POST - Dynamic simulation of dropping database and re-seeding
app.post('/api/action/reset', (req, res) => {
  try {
    db.exec('DELETE FROM policy_answers');
    seedDatabase();
    res.json({ success: true, message: 'Database reset and default seeds loaded.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const startTime = Date.now();

// React SPA delivery and HMR handling
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Serve from Vite static production builds
    const distPath = path.resolve('dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      console.warn('Production "dist" folder not found. Please compile/build before running in production.');
    }
  }

  app.listen(PORT, () => {
    console.log(`[Storage Engine Manager Status] Live and Listening on Port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Fatal initialization error:', error);
});
