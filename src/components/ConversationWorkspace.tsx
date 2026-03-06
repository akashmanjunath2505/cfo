import { Mic, MicOff, Volume2, ChevronRight, MessageSquare } from 'lucide-react';
import type { RefObject } from 'react';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

interface ConversationWorkspaceProps {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  isThinking: boolean;
  chatEndRef: RefObject<HTMLDivElement>;
  isVoiceMode: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  onToggleVoiceMode: () => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
}

export function ConversationWorkspace({
  messages,
  input,
  setInput,
  onSend,
  isThinking,
  chatEndRef,
  isVoiceMode,
  isListening,
  isSpeaking,
  onToggleVoiceMode,
  onStartVoice,
  onStopVoice
}: ConversationWorkspaceProps) {
  return (
    <div className="bg-[#0F0F11] border border-white/5 rounded-3xl flex flex-col h-[560px]">
      <div className="p-6 border-b border-white/5 flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <MessageSquare size={16} className="text-black" />
          </div>
          <h3 className="font-bold">Speak with CFO</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleVoiceMode}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              isVoiceMode ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-400/30' : 'bg-white/5 text-white/40'
            }`}
          >
            <Volume2 size={14} className="inline mr-1" />
            Voice {isVoiceMode ? 'On' : 'Off'}
          </button>
          <button
            onClick={isListening ? onStopVoice : onStartVoice}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              isListening ? 'bg-red-500/20 text-red-400 border border-red-400/20' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/20'
            }`}
          >
            {isListening ? <MicOff size={14} className="inline mr-1" /> : <Mic size={14} className="inline mr-1" />}
            {isListening ? 'Stop' : 'Speak with CFO'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user' ? 'bg-emerald-500 text-black font-medium' : 'bg-white/5 text-white/80 border border-white/5'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isThinking ? <div className="text-xs text-white/50">CFO is reasoning and executing actions...</div> : null}
        {isSpeaking ? <div className="text-xs text-indigo-300">CFO is speaking...</div> : null}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 border-t border-white/5">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder="Ask about hiring, budget, outreach, or strategy..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-4 pr-12 text-sm outline-none focus:border-emerald-500/50 transition-all"
          />
          <button
            onClick={onSend}
            className="absolute right-2 top-2 w-10 h-10 bg-emerald-500 text-black rounded-xl flex items-center justify-center hover:bg-emerald-400 transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
