import { useOntologyStore } from '@renderer/store/ontology';
import { useUIStore } from '@renderer/store/ui';
import { code } from '@streamdown/code';
import { ArrowUp, BotMessageSquare, List, Square, SquarePen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ChatThreadList } from './ChatThreadList';
import { useChatHistory } from './useChatHistory';
import { type ChatMessage, type ModelId, type ThinkingBudget, useClaude } from './useClaude';

export function ChatPanel(): React.JSX.Element {
  const {
    messages,
    setMessages,
    isLoading,
    authMode,
    isReady,
    model,
    setModel,
    thinkingBudget,
    setThinkingBudget,
    sendMessage,
    resetSession,
  } = useClaude();
  const history = useChatHistory();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMessagesRef = useRef<ChatMessage[]>([]);

  const filePath = useOntologyStore((s) => s.filePath);

  const chatDraft = useUIStore((s) => s.chatDraft);
  const setChatDraft = useUIStore((s) => s.setChatDraft);
  const pendingChatMessage = useUIStore((s) => s.pendingChatMessage);
  const setPendingChatMessage = useUIStore((s) => s.setPendingChatMessage);

  // Track previous filePath to detect ontology file changes
  const prevFilePathRef = useRef<string | null | undefined>(undefined);

  // Restore active thread on mount
  useEffect(() => {
    const thread = history.getActiveThread();
    if (thread && thread.messages.length > 0) {
      setMessages(thread.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.getActiveThread, setMessages]);

  // When ontology file changes, switch to the most recent thread for that file (or clear)
  useEffect(() => {
    if (prevFilePathRef.current === undefined) {
      // Initial mount — don't switch, the restore-active-thread effect handles it
      prevFilePathRef.current = filePath;
      return;
    }
    if (prevFilePathRef.current === filePath) return;
    prevFilePathRef.current = filePath;

    const fileThreads = history.threadsForFile(filePath);
    if (fileThreads.length > 0) {
      const latest = fileThreads[0];
      history.switchThread(latest.id);
      setMessages(latest.messages);
    } else {
      history.setActiveThreadId(null);
      setMessages([]);
      resetSession();
    }
  }, [filePath, history, setMessages, resetSession]);

  // Auto-save messages to active thread when messages change
  useEffect(() => {
    if (history.activeThreadId && messages.length > 0 && messages !== prevMessagesRef.current) {
      history.updateThreadMessages(history.activeThreadId, messages);
    }
    prevMessagesRef.current = messages;
  }, [messages, history.activeThreadId, history.updateThreadMessages]);

  // Auto-create thread on first message if none active
  useEffect(() => {
    if (!history.activeThreadId && messages.length > 0) {
      history.createThread(model, filePath);
    }
  }, [messages.length, history.activeThreadId, history.createThread, model, filePath]);

  const handleNewChat = useCallback(() => {
    // Don't save empty threads
    if (history.activeThreadId && messages.length === 0) {
      history.deleteThread(history.activeThreadId);
    }
    const id = history.createThread(model, filePath);
    setMessages([]);
    resetSession();
    history.setShowThreadList(false);
    return id;
  }, [history, messages.length, model, filePath, setMessages, resetSession]);

  const handleSwitchThread = useCallback(
    (id: string) => {
      const thread = history.threads.find((t) => t.id === id);
      if (thread) {
        window.api.resetSession();
        setMessages(thread.messages);
      }
      history.switchThread(id);
    },
    [history, setMessages],
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      const wasActive = id === history.activeThreadId;
      if (wasActive) {
        const remaining = history.threads.filter((t) => t.id !== id);
        window.api.resetSession();
        if (remaining.length > 0) {
          setMessages(remaining[0].messages);
        } else {
          setMessages([]);
        }
      }
      history.deleteThread(id);
    },
    [history, setMessages],
  );

  useEffect(() => {
    if (chatDraft) {
      setInput(chatDraft);
      setChatDraft('');
      textareaRef.current?.focus();
    }
  }, [chatDraft, setChatDraft]);

  useEffect(() => {
    if (pendingChatMessage && !isLoading && isReady) {
      sendMessage(pendingChatMessage.message, pendingChatMessage.context);
      setPendingChatMessage(null);
    }
  }, [pendingChatMessage, isLoading, isReady, sendMessage, setPendingChatMessage]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectedEdgeId = useUIStore((s) => s.selectedEdgeId);
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  const setSelectedEdge = useUIStore((s) => s.setSelectedEdge);
  const ontology = useOntologyStore((s) => s.ontology);

  const selectionContext = useMemo(() => {
    if (selectedNodeId) {
      const cls = ontology.classes.get(selectedNodeId);
      if (!cls) return null;
      const parts = [`Currently selected class "${cls.label || cls.uri}" (${cls.uri})`];
      if (cls.comment) parts.push(`comment: "${cls.comment}"`);
      if (cls.subClassOf.length) parts.push(`subClassOf: ${cls.subClassOf.join(', ')}`);
      return {
        type: 'class' as const,
        label: cls.label || cls.uri,
        contextString: `[Context: ${parts.join(' - ')}]`,
      };
    }
    if (selectedEdgeId) {
      const prop = ontology.objectProperties.get(selectedEdgeId);
      if (!prop) return null;
      const parts = [`Currently selected property "${prop.label || prop.uri}" (${prop.uri})`];
      if (prop.comment) parts.push(`comment: "${prop.comment}"`);
      if (prop.domain.length) parts.push(`domain: ${prop.domain.join(', ')}`);
      if (prop.range.length) parts.push(`range: ${prop.range.join(', ')}`);
      return {
        type: 'property' as const,
        label: prop.label || prop.uri,
        contextString: `[Context: ${parts.join(' - ')}]`,
      };
    }
    return null;
  }, [selectedNodeId, selectedEdgeId, ontology]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSubmit = (e?: React.FormEvent): void => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    if (!isReady) return;
    sendMessage(input.trim(), selectionContext?.contextString);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const fileThreads = useMemo(
    () => history.threadsForFile(filePath),
    [history.threadsForFile, filePath],
  );

  const activeThread = history.getActiveThread();
  const headerTitle =
    activeThread?.title && activeThread.title !== 'New chat' ? activeThread.title : 'Claude';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={() => history.setShowThreadList(!history.showThreadList)}
          title={history.showThreadList ? 'Hide chat history' : 'Show chat history'}
        >
          <List className="size-3.5" />
        </Button>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate flex-1">
          {history.showThreadList ? 'Chat History' : headerTitle}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={handleNewChat}
          title="New chat"
        >
          <SquarePen className="size-3.5" />
        </Button>
      </div>

      {history.showThreadList ? (
        <ChatThreadList
          threads={fileThreads}
          activeThreadId={history.activeThreadId}
          onSelect={handleSwitchThread}
          onDelete={handleDeleteThread}
        />
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <Empty className="border-0 p-4">
                <EmptyHeader>
                  {isReady && (
                    <EmptyMedia variant="icon">
                      <BotMessageSquare />
                    </EmptyMedia>
                  )}
                  <EmptyTitle className="text-sm font-medium">
                    {isReady ? 'Start a conversation' : 'Not connected'}
                  </EmptyTitle>
                  <EmptyDescription className="text-xs">
                    {isReady
                      ? 'Describe the ontology you want to create or select a node to get context-aware suggestions.'
                      : authMode === 'max'
                        ? 'Claude CLI not detected. Configure in toolbar.'
                        : 'Set your API key in the toolbar to start chatting.'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex gap-1 items-center text-xs text-muted-foreground">
                <span className="animate-pulse">●</span>
                <span>Claude is thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Selection Context Badge */}
          {selectionContext && (
            <div className="px-3 pt-2">
              <Badge className="inline-flex gap-1.5 px-2.5 py-1 rounded-full max-w-full text-xs font-normal h-auto bg-primary-display/10 text-primary-display border border-primary-display hover:bg-primary-display/10">
                <span className="opacity-60">{selectionContext.type === 'class' ? '◆' : '→'}</span>
                <span className="truncate">{selectionContext.label}</span>
                <button
                  type="button"
                  onClick={() =>
                    selectionContext.type === 'class'
                      ? setSelectedNode(null)
                      : setSelectedEdge(null)
                  }
                  className="text-muted-foreground hover:text-foreground ml-0.5 shrink-0"
                >
                  ×
                </button>
              </Badge>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-border">
            <div
              className={cn(
                'rounded-xl border border-input bg-card transition-shadow',
                'focus-within:ring-1 focus-within:ring-ring',
                (!isReady || isLoading) && 'opacity-60',
              )}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isReady ? 'Ask anything...' : 'Configure auth first...'}
                disabled={!isReady || isLoading}
                rows={1}
                className={cn(
                  'w-full resize-none bg-transparent px-3 pt-3 pb-2 text-sm',
                  'placeholder:text-muted-foreground focus:outline-none',
                  'disabled:cursor-not-allowed max-h-32 overflow-y-auto',
                )}
              />
              <div className="flex items-center gap-1.5 px-2 pb-2">
                <Select value={model} onValueChange={(v) => setModel(v as ModelId)}>
                  <SelectTrigger className="w-24 h-7 text-xs border-0 bg-transparent shadow-none focus:ring-0 px-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Model</SelectLabel>
                      <SelectItem value="claude-haiku-4-5-20251001">Haiku</SelectItem>
                      <SelectItem value="claude-sonnet-4-6">Sonnet</SelectItem>
                      <SelectItem value="claude-opus-4-6">Opus</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select
                  value={thinkingBudget}
                  onValueChange={(v) => setThinkingBudget(v as ThinkingBudget)}
                >
                  <SelectTrigger className="w-20 h-7 text-xs border-0 bg-transparent shadow-none focus:ring-0 px-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Effort</SelectLabel>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="med">Med</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <div className="ml-auto">
                  {isLoading ? (
                    <button
                      type="button"
                      onClick={() => window.api.abortClaude()}
                      className="size-7 rounded-lg flex items-center justify-center bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                    >
                      <Square className="size-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!isReady || !input.trim()}
                      className={cn(
                        'size-7 rounded-lg flex items-center justify-center transition-colors',
                        isReady && input.trim()
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-muted text-muted-foreground cursor-not-allowed',
                      )}
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function localName(uri?: string): string {
  if (!uri) return '';
  const idx = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
  return idx >= 0 ? uri.substring(idx + 1) : uri;
}

function toolFeedbackSummary(toolName?: string, input?: Record<string, unknown>): string | null {
  if (!toolName || !input) return null;
  switch (toolName) {
    case 'add_class':
      return `+ class "${input.label || localName(input.uri as string)}"`;
    case 'add_object_property':
      return `+ property "${input.label || localName(input.uri as string)}" (${(input.domain as string[])?.map(localName).join(', ')} → ${(input.range as string[])?.map(localName).join(', ')})`;
    case 'add_datatype_property':
      return `+ attribute "${input.label || localName(input.uri as string)}" : ${localName(input.range as string)}`;
    case 'modify_class':
      return `~ modified "${localName(input.uri as string)}"`;
    case 'remove_element':
      return `- removed ${input.type} "${localName(input.uri as string)}"`;
    case 'generate_ontology':
      return '↻ replaced entire ontology';
    case 'validate_ontology':
      return '✓ ran validation';
    default:
      return null;
  }
}

function MessageBubble({ message }: { message: ChatMessage }): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground text-sm rounded-lg px-3 py-1.5 max-w-[85%]">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'tool') {
    const summary = toolFeedbackSummary(message.toolName, message.toolInput);
    return (
      <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1 font-mono space-y-0.5">
        <div>⚡ {message.toolName}</div>
        {summary && <div className="text-[10px] opacity-75 pl-3">{summary}</div>}
      </div>
    );
  }

  return (
    <div className="text-sm text-foreground max-w-[95%] leading-relaxed">
      <Streamdown plugins={{ code }}>{message.content}</Streamdown>
      {message.cost !== undefined && (
        <span className="text-[10px] text-muted-foreground ml-2">${message.cost.toFixed(4)}</span>
      )}
    </div>
  );
}
