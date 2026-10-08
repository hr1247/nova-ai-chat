import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Plus, MessageSquare, Trash2, Menu, X, Cpu } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: "Hello! I'm **Nova**, your AI assistant. How can I help you today?"
};

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768'
];

function App() {
  const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;

  // Model management state
  const [availableModels, setAvailableModels] = useState(
    groqApiKey ? GROQ_MODELS : ['mistral']
  );
  const [selectedModel, setSelectedModel] = useState(
    groqApiKey ? GROQ_MODELS[0] : 'mistral'
  );

  // Load saved sessions from localStorage
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('nova_chat_sessions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse chat sessions', e);
      }
    }
    return [];
  });

  // Current active chat session ID
  const [currentSessionId, setCurrentSessionId] = useState(() => Date.now());
  
  // Messages for the current active chat session
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);

  // Fetch downloaded models from local Ollama instance on startup IF no Groq key exists
  useEffect(() => {
    if (groqApiKey) return;

    const fetchModels = async () => {
      try {
        const res = await fetch('http://localhost:11434/api/tags');
        if (res.ok) {
          const data = await res.json();
          const modelList = data.models.map((m) => m.name);
          setAvailableModels(modelList);
          if (modelList.length > 0 && !modelList.includes(selectedModel)) {
            setSelectedModel(modelList[0]);
          }
        }
      } catch (err) {
        console.error('Could not fetch local Ollama models:', err);
      }
    };
    fetchModels();
  }, [groqApiKey]);

  // Save/update sessions in localStorage whenever messages change
  useEffect(() => {
    if (messages.length <= 1) return;

    setSessions((prevSessions) => {
      const existingIndex = prevSessions.findIndex((s) => s.id === currentSessionId);
      
      const firstUserMsg = messages.find((m) => m.role === 'user');
      const title = firstUserMsg ? firstUserMsg.content.slice(0, 30) + '...' : 'New Chat';

      let updatedSessions;
      if (existingIndex >= 0) {
        updatedSessions = [...prevSessions];
        updatedSessions[existingIndex] = {
          ...updatedSessions[existingIndex],
          title,
          messages,
          updatedAt: Date.now()
        };
      } else {
        updatedSessions = [
          { id: currentSessionId, title, messages, updatedAt: Date.now() },
          ...prevSessions
        ];
      }

      localStorage.setItem('nova_chat_sessions', JSON.stringify(updatedSessions));
      return updatedSessions;
    });
  }, [messages, currentSessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleNewChat = () => {
    setCurrentSessionId(Date.now());
    setMessages([INITIAL_MESSAGE]);
  };

  const handleSelectSession = (session) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
  };

  const handleDeleteSession = (e, sessionId) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== sessionId);
    setSessions(updated);
    localStorage.setItem('nova_chat_sessions', JSON.stringify(updated));

    if (currentSessionId === sessionId) {
      handleNewChat();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: '' }
    ]);
    setIsLoading(true);

    try {
      if (groqApiKey) {
        // --- GROQ API REQUEST ---
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqApiKey}`
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              ...messages.map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: userMessage }
            ],
            stream: true,
          }),
        });

        if (!response.ok) throw new Error('Failed to connect to Groq Cloud API.');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.replace('data: ', ''));
                const content = parsed.choices[0]?.delta?.content;
                if (content) {
                  accumulatedText += content;
                  setMessages((prev) => {
                    const newHistory = [...prev];
                    newHistory[newHistory.length - 1] = {
                      role: 'assistant',
                      content: accumulatedText,
                    };
                    return newHistory;
                  });
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      } else {
        // --- LOCAL OLLAMA REQUEST ---
        const response = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              ...messages.map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: userMessage }
            ],
            stream: true,
          }),
        });

        if (!response.ok) throw new Error('Failed to connect to Ollama server.');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.trim() !== '') {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                accumulatedText += parsed.message.content;
                
                setMessages((prev) => {
                  const newHistory = [...prev];
                  newHistory[newHistory.length - 1] = {
                    role: 'assistant',
                    content: accumulatedText,
                  };
                  return newHistory;
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error during chat request:', error);
      setMessages((prev) => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = {
          role: 'assistant',
          content: groqApiKey
            ? '⚠️ **Error:** Could not connect to Groq API. Please check your API key in Vercel settings.'
            : '⚠️ **Error:** Could not connect to local Ollama server. Make sure Ollama is running.',
        };
        return newHistory;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar for Past Chat History */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } transition-all duration-300 bg-slate-950 border-r border-slate-800 flex flex-col z-20 overflow-hidden`}
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-800">
          <button
            onClick={handleNewChat}
            className="flex-1 flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-2.5 px-4 rounded-xl transition shadow"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">
            Chat History
          </p>
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-500 italic px-2 py-3">No previous chats yet.</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleSelectSession(session)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-xs transition ${
                  session.id === currentSessionId
                    ? 'bg-slate-800 text-emerald-400 font-medium'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{session.title}</span>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1 transition"
                  title="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shadow-md">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition"
              title="Toggle Sidebar"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="p-2 bg-emerald-600 rounded-lg text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wide">Nova AI</h1>
              <p className="text-xs text-emerald-400 font-medium">
                {groqApiKey ? 'Powered by Groq Cloud' : 'Running Locally (Ollama)'}
              </p>
            </div>
          </div>

          {/* Model Switcher Dropdown */}
          <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer"
            >
              {availableModels.map((model) => (
                <option key={model} value={model} className="bg-slate-800 text-slate-200">
                  {model}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* Chat Container */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex items-start space-x-4 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow">
                    <Bot className="w-5 h-5" />
                  </div>
                )}
                
                <div
                  className={`max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 border border-slate-700 text-slate-200'
                  }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                      ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                      ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                      li: ({ node, ...props }) => <li className="mb-0.5" {...props} />,
                      code: ({ node, inline, className, children, ...props }) => {
                        return inline ? (
                          <code className="bg-slate-900 text-emerald-400 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                            {children}
                          </code>
                        ) : (
                          <pre className="bg-slate-950 text-slate-200 p-3 rounded-lg overflow-x-auto my-2 text-xs font-mono border border-slate-700/50">
                            <code {...props}>{children}</code>
                          </pre>
                        );
                      },
                      table: ({ node, ...props }) => (
                        <div className="overflow-x-auto my-2">
                          <table className="min-w-full border border-slate-700 text-left text-xs" {...props} />
                        </div>
                      ),
                      th: ({ node, ...props }) => <th className="border border-slate-700 bg-slate-900 px-3 py-1.5 font-semibold" {...props} />,
                      td: ({ node, ...props }) => <td className="border border-slate-700 px-3 py-1.5" {...props} />,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>

                {msg.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white shadow">
                    <User className="w-5 h-5" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className="flex items-center space-x-2 text-slate-400 text-sm ml-12">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                <span>Nova ({selectedModel}) is thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-slate-800 border-t border-slate-700 shadow-lg">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-center space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message Nova (${selectedModel})...`}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm shadow-inner"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white p-3.5 rounded-xl transition flex items-center justify-center shadow"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-center text-xs text-slate-500 mt-2">
            {groqApiKey
              ? `Powered by Groq Cloud & ${selectedModel}. High-speed global inference.`
              : `Powered by Ollama & ${selectedModel}. Completely local and private.`}
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;