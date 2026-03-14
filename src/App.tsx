import { useState, useRef, useEffect } from "react";
import { Upload, FileText, Send, Loader2, Trash2, File, MessageSquare } from "lucide-react";
import { cn } from "./lib/utils";
import ReactMarkdown from "react-markdown";

interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: { fileName: string; text: string; score: number }[];
}

export default function App() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<{ status: 'loading' | 'missing' | 'valid' | 'invalid', message?: string }>({ status: 'loading' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDocuments();
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.apiKeyMissing) {
        setApiKeyStatus({ status: 'missing', message: 'API Key not configured' });
      } else {
        setApiKeyStatus({ status: 'valid' });
      }
    } catch (error) {
      setApiKeyStatus({ status: 'missing', message: 'Failed to check API key' });
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocuments(data);
    } catch (error) {
      console.error("Failed to fetch documents", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (e.g., limit to 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: File size exceeds the 10MB limit. Please upload a smaller file.` }]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      
      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned ${res.status} ${res.statusText}: ${text.substring(0, 100)}...`);
      }
      
      if (!res.ok) {
        const errorMessage = data?.error?.message || data?.error || "Upload failed";
        if (errorMessage.toLowerCase().includes("api key")) {
          setApiKeyStatus({ status: 'invalid', message: errorMessage });
        }
        throw new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      }
      
      setDocuments(prev => [...prev, data.document]);
      setMessages(prev => [...prev, { role: "assistant", content: `Successfully processed ${file.name} (${data.chunksProcessed} chunks).` }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error uploading file: ${error.message}` }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isQuerying) return;

    const userQuery = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userQuery }]);
    setIsQuerying(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userQuery }),
      });
      
      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned ${res.status} ${res.statusText}: ${text.substring(0, 100)}...`);
      }
      
      if (!res.ok) {
        const errorMessage = data?.error?.message || data?.error || "Query failed";
        if (errorMessage.toLowerCase().includes("api key")) {
          setApiKeyStatus({ status: 'invalid', message: errorMessage });
        }
        throw new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      }
      
      setMessages(prev => [...prev, { role: "assistant", content: data.answer, sources: data.sources }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${error.message}` }]);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleClear = async () => {
    try {
      await fetch("/api/clear", { method: "POST" });
      setDocuments([]);
      setMessages([{ role: "assistant", content: "Memory cleared. Upload a new document to begin." }]);
    } catch (error) {
      console.error("Failed to clear", error);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-lg">
            <FileText className="w-5 h-5 text-indigo-600" />
            DocuRAG
          </div>
          <button 
            onClick={handleClear}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
            title="Clear all documents"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto">
          {apiKeyStatus.status !== 'valid' && (
            <div className={cn(
              "mb-6 p-4 rounded-lg border text-sm",
              apiKeyStatus.status === 'missing' ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-800"
            )}>
              <p className="font-semibold mb-1">
                {apiKeyStatus.status === 'missing' ? "API Key Required" : "Invalid API Key"}
              </p>
              <p className="text-xs opacity-90 mb-3">
                {apiKeyStatus.message || "Please configure your Gemini API key in the AI Studio Secrets panel."}
              </p>
              <div className="space-y-2">
                <p className="text-[10px] font-mono bg-white/50 p-1.5 rounded border border-current/10">
                  1. Open Settings (Gear Icon)<br/>
                  2. Go to Secrets<br/>
                  3. Add CUSTOM_GEMINI_API_KEY
                </p>
              </div>
            </div>
          )}

          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Knowledge Base
          </h3>
          
          {documents.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
              No documents uploaded yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {documents.map(doc => (
                <li key={doc.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <File className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                    <p className="text-xs text-gray-500">{(doc.size / 1024).toFixed(1)} KB</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".pdf,.txt"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg font-medium transition-colors disabled:opacity-70"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {isUploading ? "Processing..." : "Upload Document"}
          </button>
          <p className="text-xs text-center text-gray-500 mt-2">Supports PDF and TXT</p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
              <MessageSquare className="w-12 h-12 text-gray-300" />
              <p className="text-lg font-medium text-gray-500">Upload a document and ask a question</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div key={idx} className={cn("flex gap-4 max-w-4xl mx-auto", msg.role === "user" ? "flex-row-reverse" : "")}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                msg.role === "user" ? "bg-indigo-100 text-indigo-600" : "bg-emerald-100 text-emerald-600"
              )}>
                {msg.role === "user" ? "U" : "AI"}
              </div>
              <div className={cn(
                "px-5 py-4 rounded-2xl max-w-[80%]",
                msg.role === "user" ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-gray-100 text-gray-800 rounded-tl-sm"
              )}>
                {msg.role === "user" ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-gray-800 prose-pre:text-gray-100">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                    
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Sources</p>
                        <div className="space-y-2">
                          {msg.sources.map((src, i) => (
                            <div key={i} className="bg-white p-2 rounded border border-gray-200 text-xs">
                              <span className="font-medium text-indigo-600">{src.fileName}</span>
                              <span className="text-gray-400 ml-2">Score: {src.score.toFixed(2)}</span>
                              <p className="text-gray-600 mt-1 line-clamp-2" title={src.text}>{src.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isQuerying && (
            <div className="flex gap-4 max-w-4xl mx-auto">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                AI
              </div>
              <div className="px-5 py-4 rounded-2xl bg-gray-100 text-gray-800 rounded-tl-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                <span className="text-sm text-gray-500">Searching documents...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-gray-200">
          <form onSubmit={handleQuery} className="max-w-4xl mx-auto relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your documents..."
              className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              disabled={isQuerying || documents.length === 0}
            />
            <button
              type="submit"
              disabled={!input.trim() || isQuerying || documents.length === 0}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          {documents.length === 0 && (
            <p className="text-xs text-center text-gray-500 mt-2">Upload a document to start asking questions.</p>
          )}
        </div>
      </div>
    </div>
  );
}
