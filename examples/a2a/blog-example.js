// Blog Post Generator Example
// This example shows a complete A2A interaction between a client and server
// The server analyzes topics and generates blog post outlines

import express from 'express';
import { v4 as uuidv4 } from 'uuid';

// ============= SERVER SIDE =============

const app = express();
app.use(express.json());

const tasks = new Map();

// Blog Assistant Agent Card
const agentCard = {
  url: "https://blog-assistant.example.com",
  name: "Blog Assistant Agent",
  description: "Helps create blog posts by researching topics and generating outlines",
  version: "1.0.0",
  skills: [
    {
      id: "research_topic",
      name: "Topic Research",
      description: "Researches a topic and provides key points",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Topic to research" },
          target_audience: { type: "string", description: "Who will read this" }
        },
        required: ["topic"]
      }
    },
    {
      id: "generate_outline",
      name: "Generate Blog Outline",
      description: "Creates a structured outline for a blog post",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string" },
          key_points: { type: "array", items: { type: "string" } },
          word_count: { type: "number", default: 1000 }
        },
        required: ["topic", "key_points"]
      }
    }
  ],
  authentication: [{ type: "bearer", schemes: ["ApiKey"] }]
};

// Serve agent card
app.get('/.well-known/agent.json', (req, res) => res.json(agentCard));

// Auth middleware
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== 'blog-api-key') {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Invalid API key" },
      id: req.body?.id || null
    });
  }
  next();
}

// Simulate topic research
async function researchTopic(topic, audience) {
  // In production, this might call a real research API
  const keyPoints = [
    `Definition and importance of ${topic}`,
    `Current trends in ${topic}`,
    `Best practices for ${topic}`,
    `Common challenges with ${topic}`,
    `Future of ${topic}`
  ];
  
  const resources = [
    { title: `"${topic} Fundamentals"`, url: "https://example.com/1" },
    { title: `"Advanced ${topic} Techniques"`, url: "https://example.com/2" }
  ];
  
  return { keyPoints, resources, audience: audience || "general readers" };
}

// Generate blog outline
function generateOutline(topic, keyPoints, wordCount) {
  const wordsPerSection = Math.floor(wordCount / (keyPoints.length + 2));
  
  return {
    title: `The Complete Guide to ${topic}`,
    target_word_count: wordCount,
    sections: [
      {
        heading: "Introduction",
        word_count: wordsPerSection,
        notes: "Hook the reader, introduce the topic, preview main points"
      },
      ...keyPoints.map(point => ({
        heading: point,
        word_count: wordsPerSection,
        notes: "Expand on this key point with examples and explanations"
      })),
      {
        heading: "Conclusion",
        word_count: wordsPerSection,
        notes: "Summarize key points, call to action"
      }
    ]
  };
}

// Task handler
async function handleTask(context, updateCallback) {
  const { skillId, userMessage } = context;
  const dataPart = userMessage.parts.find(p => p.type === 'data');
  const params = dataPart?.data || {};
  
  try {
    switch (skillId) {
      case 'research_topic': {
        await updateCallback({
          state: 'working',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Researching "${params.topic}"...` }]
          }
        });
        
        // Simulate research time
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const research = await researchTopic(params.topic, params.target_audience);
        
        await updateCallback({
          state: 'completed',
          message: {
            role: 'agent',
            parts: [{ 
              type: 'text', 
              text: `Research complete! Found ${research.keyPoints.length} key points about ${params.topic}.`
            }]
          },
          artifacts: [{
            name: 'research_results',
            description: 'Topic research findings',
            parts: [{ type: 'data', data: research }]
          }]
        });
        break;
      }
      
      case 'generate_outline': {
        await updateCallback({
          state: 'working',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: 'Generating blog outline...' }]
          }
        });
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const outline = generateOutline(
          params.topic,
          params.key_points,
          params.word_count || 1000
        );
        
        await updateCallback({
          state: 'completed',
          message: {
            role: 'agent',
            parts: [{ 
              type: 'text', 
              text: `Created outline with ${outline.sections.length} sections for a ${outline.target_word_count}-word blog post.`
            }]
          },
          artifacts: [{
            name: 'blog_outline',
            description: 'Structured blog post outline',
            parts: [{ type: 'data', data: outline }]
          }]
        });
        break;
      }
      
      default:
        await updateCallback({
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Unknown skill: ${skillId}` }]
          }
        });
    }
  } catch (error) {
    await updateCallback({
      state: 'failed',
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: `Error: ${error.message}` }]
      }
    });
  }
}

// Execute task function
async function executeTask(taskId, skill, message) {
  const taskData = tasks.get(taskId);
  if (!taskData) return;
  
  const context = {
    task: taskData.task,
    skillId: skill,
    userMessage: message,
    isCancelled: async () => {
      const current = tasks.get(taskId);
      return current?.task.status.state === 'canceled';
    }
  };
  
  const updateCallback = async (update) => {
    const data = tasks.get(taskId);
    if (!data) return;
    
    if (update.state) {
      data.task.status.state = update.state;
      data.task.status.timestamp = new Date().toISOString();
    }
    
    if (update.message) {
      data.history.push(update.message);
      data.task.status.message = update.message;
    }
    
    if (update.artifacts) {
      data.task.artifacts.push(...update.artifacts);
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

// API endpoint
app.post('/api', authenticateApiKey, async (req, res) => {
  const { method, params, id } = req.body;
  
  try {
    switch (method) {
      case 'tasks/send': {
        const taskId = uuidv4();
        const { skill, message } = params;
        
        const task = {
          id: taskId,
          status: {
            state: 'submitted',
            timestamp: new Date().toISOString()
          },
          artifacts: []
        };
        
        tasks.set(taskId, { task, history: [message] });
        executeTask(taskId, skill, message);
        
        res.json({ jsonrpc: '2.0', result: task, id });
        break;
      }
      
      case 'tasks/get': {
        const { taskId, includeHistory } = params;
        const taskData = tasks.get(taskId);
        
        if (!taskData) {
          return res.status(404).json({
            jsonrpc: '2.0',
            error: { code: -32002, message: 'Task not found' },
            id
          });
        }
        
        const result = { ...taskData.task };
        if (includeHistory) {
          result.history = taskData.history;
        }
        
        res.json({ jsonrpc: '2.0', result, id });
        break;
      }
      
      default:
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Method not found' },
          id
        });
    }
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message },
      id
    });
  }
});

// ============= CLIENT SIDE =============

class BlogClient {
  constructor(agentUrl, apiKey) {
    this.agentUrl = agentUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }
  
  async sendRequest(method, params) {
    const response = await fetch(`${this.agentUrl}/api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now().toString()
      })
    });
    
    const result = await response.json();
    if (result.error) {
      throw new Error(`RPC Error: ${result.error.message}`);
    }
    return result.result;
  }
  
  async sendTask(skillId, data) {
    const message = {
      role: 'user',
      parts: [
        { type: 'text', text: `Please help with: ${skillId}` },
        { type: 'data', data }
      ]
    };
    
    return await this.sendRequest('tasks/send', {
      skill: skillId,
      message
    });
  }
  
  async getTask(taskId, includeHistory = false) {
    return await this.sendRequest('tasks/get', { taskId, includeHistory });
  }
  
  async waitForCompletion(taskId, maxWaitMs = 30000) {
    const startTime = Date.now();
    
    while (true) {
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(`Task timeout after ${maxWaitMs}ms`);
      }
      
      const task = await this.getTask(taskId);
      console.log(`[${new Date().toISOString()}] Task ${task.status.state}: ${task.status.message?.parts[0]?.text || ''}`);
      
      const terminalStates = ['completed', 'failed', 'canceled'];
      if (terminalStates.includes(task.status.state)) {
        if (task.status.state === 'failed') {
          throw new Error(`Task failed: ${task.status.message?.parts[0]?.text}`);
        }
        return task;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// ============= EXAMPLE USAGE =============

async function createBlogPost() {
  console.log('=== Blog Post Creation Workflow ===\n');
  
  const client = new BlogClient('http://localhost:3000', 'blog-api-key');
  
  try {
    // Step 1: Research the topic
    console.log('Step 1: Researching topic...');
    const researchTask = await client.sendTask('research_topic', {
      topic: 'Microservices Architecture',
      target_audience: 'Software developers and architects'
    });
    
    const researchResult = await client.waitForCompletion(researchTask.id);
    const researchData = researchResult.artifacts[0].parts[0].data;
    
    console.log('\nResearch Results:');
    console.log('Key Points:', researchData.keyPoints);
    console.log('Resources:', researchData.resources);
    
    // Step 2: Generate outline based on research
    console.log('\nStep 2: Generating blog outline...');
    const outlineTask = await client.sendTask('generate_outline', {
      topic: 'Microservices Architecture',
      key_points: researchData.keyPoints,
      word_count: 1500
    });
    
    const outlineResult = await client.waitForCompletion(outlineTask.id);
    const outline = outlineResult.artifacts[0].parts[0].data;
    
    console.log('\nBlog Outline:');
    console.log(`Title: ${outline.title}`);
    console.log(`Target Words: ${outline.target_word_count}`);
    console.log('\nSections:');
    outline.sections.forEach((section, i) => {
      console.log(`${i + 1}. ${section.heading} (~${section.word_count} words)`);
      console.log(`   Notes: ${section.notes}`);
    });
    
    // Get full conversation history
    const fullTask = await client.getTask(outlineTask.id, true);
    console.log('\n=== Full Conversation History ===');
    fullTask.history.forEach(msg => {
      console.log(`\n${msg.role.toUpperCase()}:`);
      msg.parts.forEach(part => {
        if (part.type === 'text') {
          console.log(part.text);
        } else if (part.type === 'data') {
          console.log('[Data payload]');
        }
      });
    });
    
  } catch (error) {
    console.error('Workflow failed:', error.message);
  }
}

// Start server if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Blog Assistant A2A Server running on http://localhost:${PORT}`);
    console.log(`Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log('\nStarting example workflow in 2 seconds...\n');
    
    // Run the example after server starts
    setTimeout(() => {
      createBlogPost().then(() => {
        console.log('\n✓ Example completed successfully!');
      });
    }, 2000);
  });
}