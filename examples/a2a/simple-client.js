// Simple A2A Client Example (Promise-based)
// This client can discover agents, send tasks, and poll for results
// Note: Requires Node.js 18+ for native fetch support

class A2AClient {
  constructor(agentUrl, apiKey) {
    this.agentUrl = agentUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
    this.agentCard = null;
  }
  
  // Discover agent capabilities by fetching the agent card
  async discover() {
    const response = await fetch(`${this.agentUrl}/.well-known/agent.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch agent card: ${response.statusText}`);
    }
    
    this.agentCard = await response.json();
    console.log(`Discovered agent: ${this.agentCard.name}`);
    console.log(`Available skills:`, this.agentCard.skills.map(s => s.id));
    
    return this.agentCard;
  }
  
  // Send a JSON-RPC request to the agent
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
  
  // Send a task to the agent
  async sendTask(skillId, data) {
    // Verify skill exists
    if (!this.agentCard) {
      await this.discover();
    }
    
    const skill = this.agentCard.skills.find(s => s.id === skillId);
    if (!skill) {
      throw new Error(`Unknown skill: ${skillId}`);
    }
    
    // Create the message with data
    const message = {
      role: 'user',
      parts: [
        { type: 'text', text: `Please execute skill: ${skillId}` },
        { type: 'data', data }
      ]
    };
    
    // Send the task
    const task = await this.sendRequest('tasks/send', {
      skill: skillId,
      message
    });
    
    console.log(`Task created: ${task.id}`);
    return task;
  }
  
  // Get task status and results
  async getTask(taskId, includeHistory = false) {
    return await this.sendRequest('tasks/get', {
      taskId,
      includeHistory
    });
  }
  
  // Poll for task completion
  async waitForCompletion(taskId, maxWaitMs = 30000, pollIntervalMs = 1000) {
    const startTime = Date.now();
    
    while (true) {
      // Check timeout
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(`Task ${taskId} did not complete within ${maxWaitMs}ms`);
      }
      
      // Get current task status
      const task = await this.getTask(taskId);
      console.log(`Task ${taskId} status: ${task.status.state}`);
      
      // Check if task is in a terminal state
      const terminalStates = ['completed', 'failed', 'canceled', 'rejected'];
      if (terminalStates.includes(task.status.state)) {
        // Task is done - check if it succeeded or failed
        if (task.status.state === 'failed' || task.status.state === 'rejected') {
          throw new Error(`Task failed: ${task.status.message?.parts[0]?.text || 'Unknown error'}`);
        }
        return task;
      }
      
      // Task still running - wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }
}

// Example usage
async function main() {
  // Create client
  const client = new A2AClient('http://localhost:3000', 'test-api-key');
  
  try {
    // Discover agent capabilities
    await client.discover();
    
    // Send an addition task
    const task = await client.sendTask('add', { a: 5, b: 3 });
    
    // Wait for completion
    const result = await client.waitForCompletion(task.id);
    
    // Display results
    console.log('\nTask completed!');
    console.log('Status message:', result.status.message?.parts[0]?.text);
    
    if (result.artifacts && result.artifacts.length > 0) {
      console.log('Result:', result.artifacts[0].parts[0].data);
    }
    
    // Get full history
    const taskWithHistory = await client.getTask(task.id, true);
    console.log('\nFull conversation history:');
    taskWithHistory.history.forEach(msg => {
      console.log(`${msg.role}:`, msg.parts[0].text || msg.parts[0].data);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}