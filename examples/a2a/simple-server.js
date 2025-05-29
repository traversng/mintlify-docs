// Simple A2A Server Example (Promise-based)
// This is a minimal A2A server that can handle basic tasks

import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json());

// In-memory task storage (use a real database in production)
const tasks = new Map();

// Agent Card - describes what this agent can do
const agentCard = {
  url: "https://example.com",
  name: "Simple Math Agent",
  description: "A basic agent that can perform math operations",
  version: "1.0.0",
  skills: [
    {
      id: "add",
      name: "Addition",
      description: "Adds two numbers together",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" }
        },
        required: ["a", "b"]
      }
    }
  ],
  authentication: [
    { type: "bearer", schemes: ["ApiKey"] }
  ]
};

// Serve the agent card at the well-known location
app.get('/.well-known/agent.json', (req, res) => {
  res.json(agentCard);
});

// Simple API key authentication middleware
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== 'test-api-key') {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Authentication failed"
      },
      id: req.body?.id || null
    });
  }
  
  next();
}

// Main task handler - this is where the actual work happens
async function handleTask(context, updateCallback) {
  const { skillId, userMessage, task } = context;
  
  // Extract data from the user message
  const dataPart = userMessage.parts.find(p => p.type === 'data');
  const params = dataPart?.data || {};
  
  switch (skillId) {
    case 'add':
      // Emit a working status
      await updateCallback({
        state: 'working',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: 'Calculating sum...' }]
        }
      });
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Calculate result
      const result = params.a + params.b;
      
      // Emit completion with result
      await updateCallback({
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `The sum is ${result}` }]
        },
        artifacts: [{
          name: 'calculation_result',
          parts: [{ type: 'data', data: { result } }]
        }]
      });
      break;
      
    default:
      await updateCallback({
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Unknown skill: ${skillId}` }]
        }
      });
  }
}

// Execute a task asynchronously
async function executeTask(taskId, skill, message) {
  const context = {
    task: tasks.get(taskId).task,
    skillId: skill,
    userMessage: message,
    isCancelled: async () => {
      const current = tasks.get(taskId);
      return current?.task.status.state === 'canceled';
    }
  };
  
  // Create update callback
  const updateCallback = async (update) => {
    const taskData = tasks.get(taskId);
    if (!taskData) return;
    
    // Update task state
    if (update.state) {
      taskData.task.status.state = update.state;
      taskData.task.status.timestamp = new Date().toISOString();
    }
    
    // Add message to history
    if (update.message) {
      taskData.history.push(update.message);
      taskData.task.status.message = update.message;
    }
    
    // Add artifacts
    if (update.artifacts) {
      taskData.task.artifacts.push(...update.artifacts);
    }
  };
  
  try {
    await handleTask(context, updateCallback);
  } catch (error) {
    console.error(`Task ${taskId} failed:`, error);
    await updateCallback({
      state: 'failed',
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: `Error: ${error.message}` }]
      }
    });
  }
}

// A2A API endpoint
app.post('/api', authenticateApiKey, async (req, res) => {
  const { method, params, id } = req.body;
  
  try {
    switch (method) {
      case 'tasks/send': {
        const taskId = uuidv4();
        const { skill, message } = params;
        
        // Create initial task
        const task = {
          id: taskId,
          status: {
            state: 'submitted',
            timestamp: new Date().toISOString()
          },
          artifacts: []
        };
        
        // Store task
        tasks.set(taskId, {
          task,
          history: [message]
        });
        
        // Execute task asynchronously (fire and forget)
        executeTask(taskId, skill, message);
        
        // Return immediate response
        res.json({
          jsonrpc: '2.0',
          result: task,
          id
        });
        break;
      }
      
      case 'tasks/get': {
        const { taskId, includeHistory } = params;
        const taskData = tasks.get(taskId);
        
        if (!taskData) {
          return res.status(404).json({
            jsonrpc: '2.0',
            error: {
              code: -32002,
              message: 'Task not found'
            },
            id
          });
        }
        
        const result = { ...taskData.task };
        if (includeHistory) {
          result.history = taskData.history;
        }
        
        res.json({
          jsonrpc: '2.0',
          result,
          id
        });
        break;
      }
      
      default:
        res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found'
          },
          id
        });
    }
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      },
      id
    });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`A2A Server running on http://localhost:${PORT}`);
  console.log(`Agent Card available at http://localhost:${PORT}/.well-known/agent.json`);
});