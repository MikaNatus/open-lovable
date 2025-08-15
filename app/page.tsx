'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/app/components/ui/switch';
import SandboxPreview from '@/components/SandboxPreview';
import CodeApplicationProgress, { CodeApplicationState } from '@/components/CodeApplicationProgress';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, 
  Sparkles, 
  Code, 
  Palette, 
  Zap,
  Download,
  RefreshCw,
  Terminal,
  Globe,
  Wand2,
  Lightbulb,
  Rocket
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  metadata?: {
    sandboxId?: string;
    url?: string;
    filesCreated?: string[];
    packagesInstalled?: string[];
  };
}

interface SandboxData {
  sandboxId: string;
  url: string;
}

export default function HomePage() {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('moonshotai/kimi-k2-instruct');
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sandboxData, setSandboxData] = useState<SandboxData | null>(null);
  const [isCreatingSandbox, setIsCreatingSandbox] = useState(false);
  const [codeApplicationState, setCodeApplicationState] = useState<CodeApplicationState>({ stage: null });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4000);
  const [enableStreaming, setEnableStreaming] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const availableModels = [
    { value: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2 Instruct (Рекомендуется)' },
    { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'openai/gpt-5', label: 'GPT-5' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
  ];

  const examplePrompts = [
    "Создай современный лендинг для IT-компании с темной темой, анимациями и секциями: герой, услуги, команда, контакты",
    "Сделай интернет-магазин одежды с каталогом товаров, корзиной и формой заказа",
    "Создай портфолио веб-разработчика с галереей проектов и контактной формой",
    "Сделай блог о путешествиях с постами, категориями и поиском",
    "Создай дашборд для аналитики с графиками и таблицами данных"
  ];

  const createSandbox = async () => {
    setIsCreatingSandbox(true);
    try {
      const response = await fetch('/api/create-ai-sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSandboxData({
          sandboxId: data.sandboxId,
          url: data.url
        });
        
        // Add system message about sandbox creation
        const systemMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'system',
          content: `✅ Песочница создана успешно! Теперь вы можете описать какой сайт хотите создать.`,
          timestamp: Date.now(),
          metadata: {
            sandboxId: data.sandboxId,
            url: data.url
          }
        };
        setMessages([systemMessage]);
      } else {
        throw new Error(data.error || 'Не удалось создать песочницу');
      }
    } catch (error) {
      console.error('Ошибка создания песочницы:', error);
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'system',
        content: `❌ Ошибка создания песочницы: ${(error as Error).message}`,
        timestamp: Date.now()
      };
      setMessages([errorMessage]);
    } finally {
      setIsCreatingSandbox(false);
    }
  };

  const generateWebsite = async () => {
    if (!prompt.trim()) return;
    if (!sandboxData) {
      await createSandbox();
      return;
    }

    setIsGenerating(true);
    setCodeApplicationState({ stage: 'analyzing' });

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMessage]);

    // Add streaming assistant message
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const response = await fetch('/api/generate-ai-code-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: selectedModel,
          temperature,
          maxTokens,
          sandboxId: sandboxData.sandboxId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'content') {
                  accumulatedContent += data.content;
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  ));
                } else if (data.type === 'application-start') {
                  setCodeApplicationState({ stage: 'installing' });
                } else if (data.type === 'application-progress') {
                  // Handle progress updates
                } else if (data.type === 'application-complete') {
                  setCodeApplicationState({ stage: 'complete' });
                  // Update message with metadata
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { 
                          ...msg, 
                          isStreaming: false,
                          metadata: {
                            filesCreated: data.results?.filesCreated || [],
                            packagesInstalled: data.results?.packagesInstalled || []
                          }
                        }
                      : msg
                  ));
                } else if (data.type === 'error') {
                  throw new Error(data.error);
                }
              } catch (e) {
                console.error('Ошибка парсинга SSE:', e);
              }
            }
          }
        }
      }

      // Force iframe refresh after generation
      if (iframeRef.current) {
        const currentSrc = iframeRef.current.src;
        iframeRef.current.src = '';
        setTimeout(() => {
          if (iframeRef.current) {
            iframeRef.current.src = currentSrc + '?t=' + Date.now();
          }
        }, 1000);
      }

    } catch (error) {
      console.error('Ошибка генерации:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { 
              ...msg, 
              content: `❌ Ошибка генерации: ${(error as Error).message}`,
              isStreaming: false
            }
          : msg
      ));
    } finally {
      setIsGenerating(false);
      setCodeApplicationState({ stage: null });
      setPrompt('');
    }
  };

  const downloadProject = async () => {
    if (!sandboxData) return;

    try {
      const response = await fetch('/api/create-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      
      if (data.success) {
        // Create download link
        const link = document.createElement('a');
        link.href = data.dataUrl;
        link.download = data.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Ошибка скачивания:', error);
    }
  };

  const refreshPreview = () => {
    if (iframeRef.current && sandboxData) {
      iframeRef.current.src = sandboxData.url + '?t=' + Date.now();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
                <Wand2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">AI Website Builder</h1>
                <p className="text-sm text-gray-600">Создавайте сайты с помощью ИИ</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {sandboxData && (
                <>
                  <Button
                    onClick={refreshPreview}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Обновить
                  </Button>
                  <Button
                    onClick={downloadProject}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Скачать
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[calc(100vh-120px)]">
          {/* Left Panel - Chat Interface */}
          <div className="flex flex-col bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 p-4 text-white">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5" />
                <h2 className="font-semibold">Чат с ИИ</h2>
                {sandboxData && (
                  <div className="ml-auto flex items-center gap-2 text-sm bg-white/20 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    Песочница активна
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && !sandboxData && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Rocket className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Добро пожаловать в AI Website Builder!
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Опишите какой сайт вы хотите создать, и ИИ сгенерирует его для вас
                  </p>
                  
                  {/* Example Prompts */}
                  <div className="text-left space-y-2">
                    <p className="text-sm font-medium text-gray-700 mb-3">Примеры промптов:</p>
                    {examplePrompts.map((example, index) => (
                      <button
                        key={index}
                        onClick={() => setPrompt(example)}
                        className="block w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors"
                      >
                        <Lightbulb className="w-4 h-4 inline mr-2 text-orange-500" />
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                        : message.role === 'system'
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.content}
                      {message.isStreaming && (
                        <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse" />
                      )}
                    </div>
                    
                    {message.metadata && (
                      <div className="mt-3 pt-3 border-t border-white/20 text-xs opacity-80">
                        {message.metadata.filesCreated && message.metadata.filesCreated.length > 0 && (
                          <div>📁 Файлы: {message.metadata.filesCreated.join(', ')}</div>
                        )}
                        {message.metadata.packagesInstalled && message.metadata.packagesInstalled.length > 0 && (
                          <div>📦 Пакеты: {message.metadata.packagesInstalled.join(', ')}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              <CodeApplicationProgress state={codeApplicationState} />
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              {/* Advanced Settings */}
              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mb-4 space-y-3 overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-gray-600">Модель ИИ</Label>
                        <Select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="text-sm"
                        >
                          {availableModels.map((model) => (
                            <option key={model.value} value={model.value}>
                              {model.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600">Температура: {temperature}</Label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={temperature}
                          onChange={(e) => setTemperature(parseFloat(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Опишите какой сайт вы хотите создать..."
                    className="resize-none"
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        generateWebsite();
                      }
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    variant="outline"
                    size="sm"
                    className="px-3"
                  >
                    <Terminal className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={generateWebsite}
                    disabled={isGenerating || isCreatingSandbox || !prompt.trim()}
                    className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isCreatingSandbox ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-gray-600" />
                  <h3 className="font-semibold text-gray-900">Предварительный просмотр</h3>
                </div>
                {sandboxData && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Активно
                  </div>
                )}
              </div>
            </div>

            <div className="h-full bg-gray-100 flex items-center justify-center">
              {sandboxData ? (
                <iframe
                  ref={iframeRef}
                  src={sandboxData.url}
                  className="w-full h-full border-0"
                  title="Website Preview"
                />
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Globe className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">
                    Предварительный просмотр
                  </h3>
                  <p className="text-gray-500">
                    Здесь появится ваш сайт после генерации
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}