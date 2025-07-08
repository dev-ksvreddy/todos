const express = require("express");
const { createClient } = require('@supabase/supabase-js');
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase client - Try direct connection first
const supabaseUrl = process.env.SUPABASE_URL || 'http://13.235.45.126:8000';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';

const supabase = createClient(supabaseUrl, supabaseKey);

// Enhanced connection test with better error handling
async function testConnection() {
  console.log('Testing Supabase connection...');
  console.log('URL:', supabaseUrl);
  
  try {
    // First, test basic health endpoint
    const healthResponse = await fetch(`${supabaseUrl}/rest/v1/`);
    console.log('Health check status:', healthResponse.status);
    
    if (!healthResponse.ok) {
      console.error('❌ Supabase health check failed');
      return false;
    }
    
    // Test basic connection with a simple query
    const { data, error } = await supabase
      .from('todo')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Supabase connection failed:');
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error details:', error.details);
      console.error('Error hint:', error.hint);
      
      // Check if table exists
      if (error.code === 'PGRST116') {
        console.log('📝 Todo table does not exist. You need to create it manually.');
        await showTableCreationSQL();
      }
      
      return false;
    } else {
      console.log('✅ Supabase connected successfully');
      console.log('Sample data:', data);
      return true;
    }
  } catch (err) {
    console.error('❌ Connection test failed:', err.message);
    console.error('Full error:', err);
    return false;
  }
}

// Show SQL for manual table creation
async function showTableCreationSQL() {
  console.log('\n🔧 Please run this SQL manually in your Supabase SQL Editor:');
  console.log('=' .repeat(60));
  console.log(`
-- Create todo table
CREATE TABLE IF NOT EXISTS todo (
  id SERIAL PRIMARY KEY,
  task TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grant permissions
GRANT ALL ON TABLE todo TO authenticated;
GRANT ALL ON TABLE todo TO anon;
GRANT ALL ON SEQUENCE todo_id_seq TO authenticated;
GRANT ALL ON SEQUENCE todo_id_seq TO anon;

-- Enable RLS (Row Level Security)
ALTER TABLE todo ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
CREATE POLICY "Allow all operations" ON todo FOR ALL TO authenticated, anon USING (true);

-- Insert sample data (optional)
INSERT INTO todo (task, completed) VALUES 
  ('Sample task 1', false),
  ('Sample task 2', true);
  `);
  console.log('=' .repeat(60));
}

// Enhanced health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    // Test basic connection
    const { data, error } = await supabase
      .from('todo')
      .select('count', { count: 'exact' });
    
    if (error) {
      return res.status(500).json({ 
        status: "unhealthy", 
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        supabase_url: supabaseUrl
      });
    }
    
    res.json({ 
      status: "healthy", 
      supabase: "connected",
      supabase_url: supabaseUrl,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ 
      status: "unhealthy", 
      error: err.message,
      supabase_url: supabaseUrl
    });
  }
});

// GET /todo
app.get("/api/todo", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('todo')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("SELECT ERROR:", error);
      return res.status(500).json({ 
        error: "DB read failed",
        details: error.message,
        code: error.code,
        hint: error.hint
      });
    }
    
    res.json(data || []);
  } catch (err) {
    console.error("SELECT ERROR:", err);
    res.status(500).json({ 
      error: "DB read failed",
      details: err.message
    });
  }
});

// POST /todo
app.post("/api/todo", async (req, res) => {
  const { task } = req.body;
  
  if (!task || task.trim() === '') {
    return res.status(400).json({ error: "Task is required and cannot be empty" });
  }
  
  try {
    const { data, error } = await supabase
      .from('todo')
      .insert({ task: task.trim() })
      .select();
    
    if (error) {
      console.error("INSERT ERROR:", error);
      return res.status(500).json({ 
        error: "DB insert failed", 
        details: error.message,
        code: error.code,
        hint: error.hint
      });
    }
    
    res.status(201).json({ 
      message: "Task added successfully",
      data: data[0]
    });
  } catch (err) {
    console.error("INSERT ERROR:", err);
    res.status(500).json({ 
      error: "DB insert failed",
      details: err.message
    });
  }
});

// DELETE /todo/:id
app.delete("/api/todo/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    const { data, error } = await supabase
      .from('todo')
      .delete()
      .eq('id', id)
      .select();
    
    if (error) {
      console.error("DELETE ERROR:", error);
      return res.status(500).json({ 
        error: "DB delete failed", 
        details: error.message,
        code: error.code,
        hint: error.hint
      });
    }
    
    if (data.length === 0) {
      return res.status(404).json({ error: "Todo not found" });
    }
    
    res.json({ message: "Task deleted successfully", data: data[0] });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ 
      error: "DB delete failed",
      details: err.message
    });
  }
});

// PUT /todo/:id
app.put("/api/todo/:id", async (req, res) => {
  const { id } = req.params;
  const { task, completed } = req.body;
  
  const updateData = {};
  if (task !== undefined) updateData.task = task;
  if (completed !== undefined) updateData.completed = completed;
  
  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }
  
  try {
    const { data, error } = await supabase
      .from('todo')
      .update(updateData)
      .eq('id', id)
      .select();
    
    if (error) {
      console.error("UPDATE ERROR:", error);
      return res.status(500).json({ 
        error: "DB update failed", 
        details: error.message,
        code: error.code,
        hint: error.hint
      });
    }
    
    if (data.length === 0) {
      return res.status(404).json({ error: "Todo not found" });
    }
    
    res.json({ message: "Task updated successfully", data: data[0] });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ 
      error: "DB update failed",
      details: err.message
    });
  }
});

// Initialize server
async function startServer() {
  console.log('Starting server...');
  
  // Test connection
  const connectionSuccessful = await testConnection();
  
  if (!connectionSuccessful) {
    console.log('⚠️  Server starting without database connection');
    console.log('💡 Check your Supabase instance and Kong gateway configuration');
  }
  
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log("Supabase URL:", supabaseUrl);
  });
}

startServer();