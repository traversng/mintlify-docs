# Simple A2A JavaScript Examples

These examples demonstrate how to build A2A servers and clients using promises (no generators).

## Files

- **simple-server.js** - A basic A2A server that exposes a math addition skill
- **simple-client.js** - A client that can discover agents, send tasks, and poll for results
- **blog-example.js** - A complete example showing a Blog Assistant agent with multi-step workflow

## Running the Examples

### Server

```bash
# Install dependencies
npm install express uuid

# Run the server
node simple-server.js
```

The server will:
- Start on http://localhost:3000
- Expose agent card at http://localhost:3000/.well-known/agent.json
- Accept tasks at http://localhost:3000/api with API key "test-api-key"

### Client

```bash
# No dependencies needed - uses native fetch (Node.js 18+)

# Run the client
node simple-client.js
```

The client will:
1. Discover the agent's capabilities
2. Send an addition task (5 + 3)
3. Poll for completion
4. Display the result

## Key Concepts

### Server Concepts

1. **Agent Card** - Describes the agent's capabilities and authentication requirements
2. **Task Handler** - Async function that processes tasks using a callback for updates
3. **Update Callback** - Used to emit status changes, messages, and artifacts
4. **Task Storage** - Persists task state and history (in-memory for this example)

### Client Concepts

1. **Discovery** - Fetch agent card to understand capabilities
2. **JSON-RPC** - All communication uses JSON-RPC 2.0 format
3. **Task Lifecycle** - Tasks progress through states: submitted → working → completed
4. **Polling** - Client polls `tasks/get` to check task status

## Promise-Based Architecture

Instead of generators, these examples use promises with callbacks:

```javascript
// Server: Task handler with update callback
async function handleTask(context, updateCallback) {
  // Emit status update
  await updateCallback({
    state: 'working',
    message: { role: 'agent', parts: [{ type: 'text', text: 'Working...' }] }
  });
  
  // Do work...
  
  // Emit completion
  await updateCallback({
    state: 'completed',
    message: { role: 'agent', parts: [{ type: 'text', text: 'Done!' }] }
  });
}
```

### Blog Example

The blog-example.js shows a complete workflow:

```bash
# Run the integrated example
node blog-example.js
```

This demonstrates:
1. **Multi-step workflows** - Research topic, then generate outline
2. **Using artifacts** - Pass research results to the next task
3. **Proper polling** - Shows how to check task states correctly
4. **Error handling** - Handles failures gracefully

## Promise-Based Architecture

Instead of generators, these examples use promises throughout:

### Server: Task handler with update callback
```javascript
async function handleTask(context, updateCallback) {
  // Emit status update
  await updateCallback({
    state: 'working',
    message: { role: 'agent', parts: [{ type: 'text', text: 'Working...' }] }
  });
  
  // Do work...
  
  // Emit completion
  await updateCallback({
    state: 'completed',
    message: { role: 'agent', parts: [{ type: 'text', text: 'Done!' }] }
  });
}
```

### Client: Proper polling with state checking
```javascript
async waitForCompletion(taskId, maxWaitMs = 30000) {
  const startTime = Date.now();
  
  while (true) {
    // Check timeout first
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error(`Task timeout after ${maxWaitMs}ms`);
    }
    
    // Get current task state
    const task = await this.getTask(taskId);
    
    // Check if task is in a terminal state
    const terminalStates = ['completed', 'failed', 'canceled', 'rejected'];
    if (terminalStates.includes(task.status.state)) {
      // Handle failures
      if (task.status.state === 'failed') {
        throw new Error(`Task failed: ${task.status.message?.parts[0]?.text}`);
      }
      return task; // Success!
    }
    
    // Still running - wait before next poll
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
```

Key points about the polling loop:
- **Terminal states** - Know when to stop polling
- **Timeout handling** - Prevent infinite loops
- **Error states** - Throw errors for failed tasks
- **Polling interval** - Don't overwhelm the server

This approach is:
- Simpler to understand than generators
- Better for serverless environments
- More idiomatic JavaScript
- Easier to test and debug