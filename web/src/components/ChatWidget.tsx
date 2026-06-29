import { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, User, Bot, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "model";
  text: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize session
  useEffect(() => {
    let sid = localStorage.getItem("chat_session_id");
    if (!sid) {
      sid = "sess_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("chat_session_id", sid);
    }
    setSessionId(sid);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isLoading]);

  // Handle form submit
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: userMsg }),
      });
      const data = await res.json();
      
      if (res.ok && data.response) {
        setMessages(prev => [...prev, { role: "model", text: data.response }]);
      } else {
        setMessages(prev => [...prev, { role: "model", text: "Uy, lo siento, tuve un problema técnico. ¿Podemos intentarlo de nuevo?" }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "model", text: "Parece que no tengo conexión en este momento. Intenta más tarde." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to parse links simply in the chat (Markdown links or raw urls)
  const formatText = (text: string) => {
    // Simple markdown link parser [text](url)
    const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/g;
    let parts = text.split(markdownLinkRegex);
    
    if (parts.length === 1) {
      // Just check raw links if no markdown
      const urlRegex = /(https?:\/\/[^\s)]+)/g;
      return text.split(urlRegex).map((part, i) => {
        if (part.match(urlRegex)) {
          return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline font-bold hover:text-emerald-300">{part}</a>;
        }
        return <span key={i}>{part}</span>;
      });
    }

    // Process markdown links
    const formatted = [];
    let i = 0;
    while (i < parts.length) {
      formatted.push(<span key={i}>{parts[i]}</span>); // text before link
      if (i + 2 < parts.length) {
        const linkText = parts[i+1];
        const linkUrl = parts[i+2];
        formatted.push(
          <a key={`link-${i}`} href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline font-bold hover:text-emerald-300">
            {linkText}
          </a>
        );
      }
      i += 3;
    }
    return formatted;
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl shadow-emerald-900/30 transition-transform hover:scale-110 hover:bg-emerald-500"
          aria-label="Abrir chat"
        >
          <MessageSquare className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-slate-900"></span>
          </span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[500px] max-h-[80vh] w-[350px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl animate-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-slate-900 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Bot className="h-6 w-6" />
                </div>
                <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-900 bg-green-500"></div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Daniela</h3>
                <p className="text-[10px] text-emerald-400 font-medium">Asesora AllAtYou</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors p-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0b1220]/50 scrollbar-thin scrollbar-thumb-white/10">
            {messages.length === 0 && (
              <div className="text-center text-xs text-slate-500 mt-4">
                <p className="mb-2 font-bold text-slate-300">¡Hola! Soy Daniela 👋</p>
                <p>¿En qué te puedo ayudar hoy? ¿Buscas alquilar, administrar o invertir?</p>
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${msg.role === "user" ? "bg-slate-700 text-slate-300" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"}`}>
                  {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-md ${msg.role === "user" ? "bg-emerald-600 text-white rounded-tr-none" : "bg-slate-800 text-slate-200 rounded-tl-none border border-white/5"}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{formatText(msg.text)}</p>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-2 flex-row">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-none bg-slate-800 px-4 py-3 border border-white/5">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-white/10 bg-slate-900 p-3">
            <form onSubmit={sendMessage} className="flex items-center gap-2 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu mensaje..."
                className="flex-1 rounded-xl bg-[#0b1220] border border-white/10 py-3 pl-4 pr-12 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4 -ml-0.5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
