import OpenAI from 'openai';
import { config } from '../config';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.gptApiKey });
  }
  return client;
}

export async function askGpt(question: string): Promise<string> {
  const openai = getClient();

  const stream = await openai.chat.completions.create({
    model: config.gptVersion,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful IT support assistant for RGMC. Answer questions clearly and concisely.',
      },
      {
        role: 'user',
        content: question,
      },
    ],
    max_tokens: config.gptLimit,
    stream: true,
  });

  let fullResponse = '';
  for await (const chunk of stream) {
    fullResponse += chunk.choices[0]?.delta?.content ?? '';
  }

  return fullResponse.trim() || 'Sorry, I did not get a response. Please try again.';
}
