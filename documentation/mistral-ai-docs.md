# Mistral AI — Reference Documentation

## Models

### Frontier Generalist Models

| Model | Model ID | Type | Best For |
|-------|----------|------|----------|
| **Mistral Large 3** (v25.12) | `mistral-large-latest` | Open-weight | High-complexity tasks, state-of-the-art performance |
| **Mistral Medium 3.1** (v25.08) | `mistral-medium-latest` | Frontier | Enterprise-grade, advanced multimodal |
| **Mistral Small 3.2** (v25.06) | `mistral-small-latest` | Open | Efficient general tasks |
| **Ministral 3** 14B/8B/3B (v25.12) | `ministral-3b-latest` etc. | Open | Text and vision at various scales |
| **Magistral Medium/Small 1.2** (v25.09) | `magistral-medium-latest` | Premier | Reasoning-heavy workloads (40k context) |

### Specialist Models

| Model | Model ID | Best For |
|-------|----------|----------|
| **Codestral** (v25.08) | `codestral-latest` | Code completion (FIM), code generation |
| **Devstral 2** (v25.12) | `devstral-latest` | Software engineering, code agents |
| **Codestral Embed** (v25.05) | `codestral-embed-latest` | Code semantic embeddings |
| **Mistral Embed** | `mistral-embed` | Text embeddings |
| **OCR 3** (v25.12) | — | Document processing |
| **Mistral Moderation** (v24.11) | — | Content safety |

### Recommendation for This Project

Use **`mistral-large-latest`** — the most capable general-purpose model. The alias always points to the latest version (currently Large 3, 675B total params).

---

## TypeScript/JavaScript SDK

### Installation

```bash
npm install @mistralai/mistralai
```

### Initialization

```typescript
import { Mistral } from '@mistralai/mistralai';

const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY!,
});
```

### Chat Completion

```typescript
const result = await client.chat.complete({
  model: 'mistral-large-latest',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the capital of France?' },
  ],
});

console.log(result.choices?.[0]?.message?.content);
```

### JSON Mode

Force structured JSON output:

```typescript
const result = await client.chat.complete({
  model: 'mistral-large-latest',
  messages: [
    { role: 'user', content: 'List 3 colors as JSON array' },
  ],
  responseFormat: { type: 'json_object' },
});

const parsed = JSON.parse(result.choices?.[0]?.message?.content as string);
```

### Streaming

```typescript
const stream = await client.chat.stream({
  model: 'mistral-large-latest',
  messages: [
    { role: 'user', content: 'Tell me a story' },
  ],
});

for await (const chunk of stream) {
  const content = chunk.data?.choices?.[0]?.delta?.content;
  if (content) process.stdout.write(content);
}
```

### Embeddings

```typescript
const result = await client.embeddings.create({
  model: 'mistral-embed',
  inputs: ['Embed this sentence.', 'As well as this one.'],
});
```

### Agents

```typescript
const result = await client.agents.complete({
  agentId: '<agent-id>',
  messages: [
    { role: 'user', content: 'Your prompt' },
  ],
});
```

### File Upload

```typescript
const result = await client.files.upload({
  file: await openAsBlob('example.file'),
});
```

---

## Chat Completion API — Full Parameters

### Endpoint

`POST /v1/chat/completions`

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | **required** | Model ID (e.g., `mistral-large-latest`) |
| `messages` | array | **required** | Array of `{role, content}` objects. Roles: `system`, `user`, `assistant`, `tool` |
| `temperature` | number | — | Controls randomness (0.0–0.7 recommended) |
| `max_tokens` | number | — | Max tokens in completion |
| `top_p` | number | 1 | Nucleus sampling threshold |
| `random_seed` | number | — | For deterministic output |
| `n` | number | 1 | Number of completions to generate |
| `stream` | boolean | false | Enable server-sent events streaming |
| `stop` | string/array | — | Stop sequences |
| `response_format` | object | `{type:"text"}` | `{type:"json_object"}` or `{type:"json_schema", json_schema:{...}}` |
| `tools` | array | — | Function definitions for tool calling |
| `tool_choice` | string | — | `"none"`, `"auto"`, `"any"`, `"required"` |
| `parallel_tool_calls` | boolean | true | Allow simultaneous function calls |
| `frequency_penalty` | number | 0 | Discourages token repetition |
| `presence_penalty` | number | 0 | Encourages vocabulary diversity |
| `safe_prompt` | boolean | false | Inject safety guidelines |

### Response Structure

```json
{
  "id": "cmpl-abc123",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "mistral-large-latest",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The response text..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50,
    "total_tokens": 60
  }
}
```

---

## SDK Resources

The SDK provides access to:

- **Chat** — Standard and streaming completions
- **Agents** — Agent-based completions and streaming
- **Embeddings** — Text embedding generation
- **Files** — Upload, list, retrieve, delete, download
- **Batch Jobs** — Create, list, get, cancel
- **Fine-tuning** — Job management and model operations
- **Models** — List, retrieve, delete, update, archive/unarchive
- **Classifiers** — Moderation and classification
- **OCR** — Document processing

---

## Sources

- [Mistral AI Models Overview](https://docs.mistral.ai/getting-started/models/models_overview/)
- [Mistral AI API Specs](https://docs.mistral.ai/api)
- [SDK Clients Documentation](https://docs.mistral.ai/getting-started/clients)
- [GitHub: mistralai/client-ts](https://github.com/mistralai/client-ts)
- [npm: @mistralai/mistralai](https://www.npmjs.com/package/@mistralai/mistralai)
