import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Send, Bot, User as UserIcon, HelpCircle } from "lucide-react";
import { listApplications } from "../../services/applications";
import { askAssistant } from "../../services/assistant";
import { Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/States";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "What is the status of my application?",
  "Why was my application flagged?",
  "What documents do I still need?",
  "Am I eligible for this scheme?",
  "When is the deadline?",
];

export function AssistantPage() {
  const [searchParams] = useSearchParams();
  const { data: applications, isLoading } = useQuery({ queryKey: ["applications"], queryFn: listApplications });
  const [applicationId, setApplicationId] = useState(searchParams.get("application") ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Hi! Select an application below, then ask me about its status, documents, flags, eligibility or deadline." },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!applicationId && applications && applications.length > 0) {
      setApplicationId(applications[0].id);
    }
  }, [applications]);

  const send = async (question: string) => {
    if (!question.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setIsSending(true);
    try {
      const answer = await askAssistant(question, applicationId || undefined);
      setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Sorry, I couldn't process that right now." }]);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) return <LoadingState label="Loading..." />;

  return (
    <div className="mx-auto flex h-[calc(100vh-140px)] max-w-2xl flex-col">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-text">
          <HelpCircle className="h-6 w-6 text-primary" /> Help & AI Assistant
        </h1>
        <p className="mt-1 text-sm text-text-secondary">Answers are grounded in your own application data — not a general chatbot.</p>
      </div>

      <Select value={applicationId} onChange={(e) => setApplicationId(e.target.value)} className="mb-4">
        <option value="">No application selected</option>
        {applications?.map((a) => (
          <option key={a.id} value={a.id}>
            {a.display_id} — {a.scheme?.name}
          </option>
        ))}
      </Select>

      <div ref={scrollRef} className="card flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, idx) => (
          <div key={idx} className={`flex items-start gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <span className={`mt-0.5 rounded-full p-1.5 ${m.role === "user" ? "bg-primary-light text-primary" : "bg-slate-100 text-text-secondary"}`}>
              {m.role === "user" ? <UserIcon className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </span>
            <div className={`max-w-[80%] rounded-xl px-3.5 py-2 text-sm ${m.role === "user" ? "bg-primary text-white" : "bg-slate-50 text-text"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {isSending && <div className="text-xs text-text-secondary">Thinking...</div>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} className="rounded-full border border-border bg-white px-3 py-1.5 text-xs text-text-secondary hover:bg-slate-50">
            {s}
          </button>
        ))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question..."
          className="flex-1 rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Button type="submit" isLoading={isSending}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
