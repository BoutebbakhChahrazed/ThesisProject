import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Trash2, Leaf } from "lucide-react";
import { getBackendBaseUrl } from "@/lib/backend";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isWelcome?: boolean;
  isError?: boolean;
}

const WELCOME: Message = {
  role: "assistant",
  content:
    "Hello! I'm **CropSense AI**, your agricultural assistant. I can help you interpret field data, analyze crop stress, understand drone imagery results, and answer agronomic questions. How can I help you today?",
  timestamp: new Date(),
  isWelcome: true,
};

export default function ChatBot() {
  const backendBaseUrl = getBackendBaseUrl();
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Only send real conversation turns — never welcome/system/error messages
  const buildPayload = (history: Message[]) =>
    history
      .filter((m) => !m.isWelcome && !m.isError)
      .map((m) => ({ role: m.role, content: m.content }));

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text, timestamp: new Date() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);

    const payload = buildPayload(history);
    console.log("Sending payload:", payload); // visible in browser console

    try {
      const res = await fetch(`${backendBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Chat API error:", res.status, errText);
        throw new Error(`${res.status}: ${errText}`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, timestamp: new Date() },
      ]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Sorry, I couldn't reach the server. Please try again.",
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([{ ...WELCOME, timestamp: new Date() }]);
    setInput("");
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const renderContent = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((p, i) =>
      i % 2 === 1 ? <strong key={i}>{p}</strong> : p
    );
  };

  const suggestions = [
    "What causes yellowing leaves in wheat?",
    "How to interpret NDVI results?",
    "Signs of water stress in corn",
    "Best practices for drone scouting",
  ];

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
            <Leaf className="w-5 h-5 text-green-700 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">CropSense AI</h1>
            <p className="text-xs text-muted-foreground">Agricultural Expert Assistant</p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-muted"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.role === "assistant"
                  ? "bg-green-100 dark:bg-green-900/40"
                  : "bg-blue-100 dark:bg-blue-900/40"
              }`}
            >
              {msg.role === "assistant" ? (
                <Bot className="w-4 h-4 text-green-700 dark:text-green-400" />
              ) : (
                <User className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              )}
            </div>
            <div
              className={`max-w-[78%] flex flex-col gap-1 ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted rounded-tl-sm"
                }`}
              >
                {renderContent(msg.content)}
              </div>
              <span className="text-[11px] text-muted-foreground px-1">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-green-700 dark:text-green-400" />
            </div>
            <div className="bg-muted px-4 py-3 rounded-2xl rounded-tl-sm">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 items-end border border-border rounded-xl p-2 bg-background focus-within:border-ring transition-colors">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask about crop health, field data, agronomic advice…"
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground leading-relaxed px-2 py-1 min-h-[36px] max-h-[140px]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Powered by Groq · Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}