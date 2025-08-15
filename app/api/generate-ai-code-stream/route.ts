import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { prompt, model = 'moonshotai/kimi-k2-instruct', temperature = 0.7, maxTokens = 4000, sandboxId } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    console.log('[generate-ai-code-stream] Generating website for prompt:', prompt);
    console.log('[generate-ai-code-stream] Using model:', model);

    // Select the appropriate AI model
    let aiModel;
    if (model.startsWith('anthropic/')) {
      aiModel = anthropic(model.replace('anthropic/', ''));
    } else if (model.startsWith('openai/')) {
      aiModel = openai(model.replace('openai/', ''));
    } else if (model.startsWith('google/')) {
      aiModel = google(model.replace('google/', ''));
    } else {
      // Default to groq for moonshot and other models
      aiModel = groq(model);
    }

    const systemPrompt = `Ты - эксперт по созданию современных веб-сайтов. Твоя задача - создать полноценный сайт на основе описания пользователя.

ВАЖНЫЕ ПРАВИЛА:
1. Используй только React + Vite + Tailwind CSS
2. Создавай современный, красивый дизайн с анимациями
3. Используй семантическую HTML разметку
4. Добавляй интерактивность и hover-эффекты
5. Делай сайт адаптивным для всех устройств
6. Используй иконки из Lucide React
7. Создавай реалистичный контент, не используй placeholder текст

СТРУКТУРА ОТВЕТА:
1. Сначала объясни концепцию сайта
2. Затем создай файлы в тегах <file path="путь">код</file>
3. Укажи необходимые пакеты в тегах <package>название</package>

ОБЯЗАТЕЛЬНЫЕ ФАЙЛЫ:
- src/App.jsx (главный компонент)
- src/components/ (все компоненты)
- src/index.css (стили с Tailwind)

ПРИМЕР СТРУКТУРЫ:
<file path="src/App.jsx">
import React from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import Footer from './components/Footer';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <Hero />
      <Footer />
    </div>
  );
}

export default App;
</file>

Создавай качественные, профессиональные сайты с вниманием к деталям!`;

    // Create a transform stream for real-time processing
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Track packages detected in real-time
    const packagesToInstall: string[] = [];
    let tagBuffer = '';

    // Function to send progress updates
    const sendProgress = async (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    // Start the AI generation
    (async () => {
      try {
        const result = await streamText({
          model: aiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature,
          maxTokens,
        });

        let fullResponse = '';

        // Process the stream
        for await (const textPart of result.textStream) {
          fullResponse += textPart;
          
          // Send content update
          await sendProgress({
            type: 'content',
            content: textPart
          });

          // Buffer for package detection
          tagBuffer += textPart;
          
          // Look for package tags in the buffer
          const searchText = tagBuffer;
          const packageRegex = /<package>([^<]+)<\/package>/g;
          let packageMatch;
          
          while ((packageMatch = packageRegex.exec(searchText)) !== null) {
            const packageName = packageMatch[1].trim();
            if (packageName && !packagesToInstall.includes(packageName)) {
              packagesToInstall.push(packageName);
              await sendProgress({ 
                type: 'package', 
                name: packageName,
                message: `📦 Package detected: ${packageName}`
              });
            }
          }
          
          // Keep only the last 500 characters in buffer to handle split tags
          if (tagBuffer.length > 500) {
            tagBuffer = tagBuffer.slice(-500);
          }
        }

        console.log('[generate-ai-code-stream] Generation complete, applying code...');
        
        // Apply the generated code
        await sendProgress({
          type: 'application-start',
          message: 'Применяю сгенерированный код...'
        });

        // Call the apply-ai-code-stream endpoint
        const applyResponse = await fetch(`${request.nextUrl.origin}/api/apply-ai-code-stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response: fullResponse,
            packages: packagesToInstall,
            sandboxId
          })
        });

        if (applyResponse.ok && applyResponse.body) {
          const reader = applyResponse.body.getReader();
          const decoder = new TextDecoder();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  await sendProgress({
                    type: 'application-progress',
                    ...data
                  });
                  
                  if (data.type === 'complete') {
                    await sendProgress({
                      type: 'application-complete',
                      results: data.results,
                      message: 'Сайт успешно создан!'
                    });
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          }
        } else {
          throw new Error('Failed to apply generated code');
        }

      } catch (error) {
        console.error('[generate-ai-code-stream] Error:', error);
        await sendProgress({
          type: 'error',
          error: (error as Error).message
        });
      } finally {
        await writer.close();
      }
    })();

    // Return the stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('[generate-ai-code-stream] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}