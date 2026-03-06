/**
 * AI Assistant Drawer - WebSocket Version
 *
 * Real-time bidirectional communication with the agent using WebSocket.
 * Features streaming thoughts, tool executions, and beautiful timeline UI.
 * Single scrollable chat with all messages, thinking, and tool executions inline.
 */

'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { Send, Bot, User, Loader2, AlertCircle, Sparkles, RotateCcw, Shield, Target, Zap, HelpCircle, WifiOff, Wifi, Square, Play, ChevronDown, Radar, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import styles from './AIAssistantDrawer.module.css'
import { useAgentWebSocket } from '@/hooks/useAgentWebSocket'
import { useEngagementBrief, formatBriefForPrompt, generateSuggestedPrompts } from '@/hooks/useEngagementBrief'
import {
  MessageType,
  ConnectionStatus,
  type ServerMessage,
  type ApprovalRequestPayload,
  type QuestionRequestPayload,
  type TodoItem
} from '@/lib/websocket-types'
import { AgentTimeline } from './AgentTimeline'
import { TodoListWidget } from './TodoListWidget'
import type { ThinkingItem, ToolExecutionItem } from './AgentTimeline'
import { useProject } from '@/providers/ProjectProvider'
import { useProjectById } from '@/hooks'
import type { ReconStatus } from '@/lib/recon-types'

export interface ExplainPayload {
  text: string
}

type Phase = 'informational' | 'exploitation' | 'post_exploitation'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolUsed?: string | null
  toolOutput?: string | null
  error?: string | null
  phase?: Phase
  timestamp: Date
  isGuidance?: boolean
  /** Phase 2: citation context for "Explain these logs" — enables View in Recon deep link */
  explainContext?: { logExcerpt: string }
}

type ChatItem = Message | ThinkingItem | ToolExecutionItem

interface AIAssistantDrawerProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  projectId: string
  sessionId: string
  onResetSession?: () => void
  modelName?: string
  panelMode?: boolean // When true, disables drawer positioning
  /** Phase 1: recon awareness — show Live Recon run capsule */
  reconStatus?: ReconStatus
  reconPhase?: string | null
  reconPhaseNumber?: number | null
  /** Phase 1: "Explain this" from Recon Logs — send this to agent and show in chat */
  explainPayload?: ExplainPayload | null
  onExplainSent?: () => void
  /** Phase 2: deep link from citation to Recon tab with highlight */
  onViewInRecon?: (logExcerpt: string) => void
  /** Phase 3: run controls — start opens recon modal, stop ends recon */
  onStartRecon?: () => void
  onStopRecon?: () => void
  isReconLoading?: boolean
}

const PHASE_CONFIG = {
  informational: {
    label: 'Informational',
    icon: Shield,
    color: 'var(--accent-primary)',
    bgColor: 'rgba(59, 130, 246, 0.1)',
  },
  exploitation: {
    label: 'Exploitation',
    icon: Target,
    color: 'var(--status-warning)',
    bgColor: 'rgba(245, 158, 11, 0.1)',
  },
  post_exploitation: {
    label: 'Post-Exploitation',
    icon: Zap,
    color: 'var(--status-error)',
    bgColor: 'rgba(239, 68, 68, 0.1)',
  },
}

type AttackPathType =
  | 'cve_exploit'
  | 'brute_force_credential_guess'
  | 'llm_exploit'
  | 'web_app_exploit'
  | 'credential_capture'
  | 'social_engineering'
  | 'dos'
  | 'fuzzing'
  | 'wireless'
  | 'client_side_exploit'
  | 'local_privilege_escalation'

const ATTACK_PATH_CONFIG: Record<
  AttackPathType,
  { label: string; shortLabel: string; color: string; bgColor: string }
> = {
  cve_exploit: {
    label: 'CVE Exploit',
    shortLabel: 'CVE',
    color: 'var(--status-warning)',
    bgColor: 'rgba(245, 158, 11, 0.15)',
  },
  brute_force_credential_guess: {
    label: 'Brute Force',
    shortLabel: 'BRUTE',
    color: 'var(--accent-secondary, #8b5cf6)',
    bgColor: 'rgba(139, 92, 246, 0.15)',
  },
  llm_exploit: {
    label: 'LLM Exploit',
    shortLabel: 'LLM',
    color: '#06b6d4',
    bgColor: 'rgba(6, 182, 212, 0.15)',
  },
  web_app_exploit: {
    label: 'Web App',
    shortLabel: 'WEB',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
  },
  credential_capture: {
    label: 'Credential Capture',
    shortLabel: 'CAPT',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
  },
  social_engineering: {
    label: 'Social Engineering',
    shortLabel: 'SOC',
    color: '#ec4899',
    bgColor: 'rgba(236, 72, 153, 0.15)',
  },
  dos: {
    label: 'DoS',
    shortLabel: 'DoS',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
  },
  fuzzing: {
    label: 'Fuzzing',
    shortLabel: 'FUZZ',
    color: '#84cc16',
    bgColor: 'rgba(132, 204, 22, 0.15)',
  },
  wireless: {
    label: 'Wireless',
    shortLabel: 'WIFI',
    color: '#0ea5e9',
    bgColor: 'rgba(14, 165, 233, 0.15)',
  },
  client_side_exploit: {
    label: 'Client-Side',
    shortLabel: 'CLI',
    color: '#a855f7',
    bgColor: 'rgba(168, 85, 247, 0.15)',
  },
  local_privilege_escalation: {
    label: 'Local Privesc',
    shortLabel: 'PRIV',
    color: '#dc2626',
    bgColor: 'rgba(220, 38, 38, 0.15)',
  },
}

const DEFAULT_ATTACK_PATH_CONFIG = ATTACK_PATH_CONFIG.cve_exploit

function getAttackPathConfig(type: string) {
  return ATTACK_PATH_CONFIG[type as AttackPathType] ?? DEFAULT_ATTACK_PATH_CONFIG
}

export function AIAssistantDrawer({
  isOpen,
  onClose,
  userId,
  projectId,
  sessionId,
  onResetSession,
  modelName,
  panelMode = false,
  reconStatus = 'idle',
  reconPhase = null,
  reconPhaseNumber = null,
  explainPayload = null,
  onExplainSent,
  onViewInRecon,
  onStartRecon,
  onStopRecon,
  isReconLoading = false,
}: AIAssistantDrawerProps) {
  const { currentProject, setCurrentProject } = useProject()
  const [showModelSwitcher, setShowModelSwitcher] = useState(false)
  const [isChangingModel, setIsChangingModel] = useState(false)
  const [showModelChangeConfirm, setShowModelChangeConfirm] = useState(false)
  const [pendingModel, setPendingModel] = useState<string | null>(null)
  const [chatItems, setChatItems] = useState<ChatItem[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStopped, setIsStopped] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<Phase>('informational')
  const [attackPathType, setAttackPathType] = useState<AttackPathType>('cve_exploit')
  const [iterationCount, setIterationCount] = useState(0)
  const [awaitingApproval, setAwaitingApproval] = useState(false)
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequestPayload | null>(null)
  const [modificationText, setModificationText] = useState('')

  // Q&A state
  const [awaitingQuestion, setAwaitingQuestion] = useState(false)
  const [questionRequest, setQuestionRequest] = useState<QuestionRequestPayload | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])

  const [todoList, setTodoList] = useState<TodoItem[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isProcessingApproval = useRef(false)
  const awaitingApprovalRef = useRef(false)
  const isProcessingQuestion = useRef(false)
  const awaitingQuestionRef = useRef(false)
  const shouldAutoScroll = useRef(true)
  const lastExplainPayloadRef = useRef<string | null>(null)

  const scrollToBottom = useCallback((force = false) => {
    if (force || shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  // Check if user is at the bottom of the scroll
  const checkIfAtBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return true

    const threshold = 50 // pixels from bottom
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold

    shouldAutoScroll.current = isAtBottom
    return isAtBottom
  }, [])

  // Auto-scroll only if user is at bottom
  useEffect(() => {
    scrollToBottom()
  }, [chatItems, scrollToBottom])

  useEffect(() => {
    if (isOpen && inputRef.current && !awaitingApproval) {
      setTimeout(() => {
        inputRef.current?.focus()
        scrollToBottom(true) // Force scroll to bottom when opening
      }, 300)
    }
  }, [isOpen, awaitingApproval, scrollToBottom])

  // Reset state when session changes
  useEffect(() => {
    setChatItems([])
    setCurrentPhase('informational')
    setAttackPathType('cve_exploit')
    setIterationCount(0)
    setAwaitingApproval(false)
    setApprovalRequest(null)
    setAwaitingQuestion(false)
    setQuestionRequest(null)
    setAnswerText('')
    setSelectedOptions([])
    setTodoList([])
    setIsStopped(false)
    awaitingApprovalRef.current = false
    isProcessingApproval.current = false
    awaitingQuestionRef.current = false
    isProcessingQuestion.current = false
    shouldAutoScroll.current = true // Reset to auto-scroll on new session
    lastExplainPayloadRef.current = null
  }, [sessionId])

  // Close model switcher when clicking outside
  useEffect(() => {
    if (!showModelSwitcher) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element
      const container = document.querySelector(`.${styles.modelSwitcherContainer}`)
      if (container && !container.contains(target)) {
        setShowModelSwitcher(false)
      }
    }

    // Use setTimeout to avoid immediate closure when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showModelSwitcher])

  // Close dropdown when model changes
  useEffect(() => {
    if (modelName) {
      setShowModelSwitcher(false)
    }
  }, [modelName])

  // WebSocket message handler
  const handleWebSocketMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case MessageType.CONNECTED:
        break

      case MessageType.THINKING:
        // Add thinking item to chat
        const thinkingItem: ThinkingItem = {
          type: 'thinking',
          id: `thinking-${Date.now()}`,
          timestamp: new Date(),
          thought: message.payload.thought || '',
          reasoning: message.payload.reasoning || '',
          action: 'thinking',
          updated_todo_list: todoList,
        }
        setChatItems(prev => [...prev, thinkingItem])
        setIsLoading(true)
        setIsStopped(false)
        break

      case MessageType.TOOL_START:
        // Add tool execution item to chat
        const toolItem: ToolExecutionItem = {
          type: 'tool_execution',
          id: `tool-${Date.now()}`,
          timestamp: new Date(),
          tool_name: message.payload.tool_name,
          tool_args: message.payload.tool_args,
          status: 'running',
          output_chunks: [],
        }
        setChatItems(prev => [...prev, toolItem])
        setIsLoading(true)
        break

      case MessageType.TOOL_OUTPUT_CHUNK:
        // Append output chunk to the matching tool execution item (by tool_name)
        setChatItems(prev => {
          // Find the tool execution item by tool_name (handles any ordering)
          const toolIndex = prev.findIndex(
            item => 'type' in item &&
                    item.type === 'tool_execution' &&
                    item.tool_name === message.payload.tool_name &&
                    item.status === 'running'
          )
          if (toolIndex !== -1) {
            const toolItem = prev[toolIndex] as ToolExecutionItem
            return [
              ...prev.slice(0, toolIndex),
              {
                ...toolItem,
                output_chunks: [...toolItem.output_chunks, message.payload.chunk],
              },
              ...prev.slice(toolIndex + 1)
            ]
          }
          return prev
        })
        break

      case MessageType.TOOL_COMPLETE:
        // Mark tool as complete and add rich analysis data
        setChatItems(prev => {
          // Find the tool execution item (may not be the last item due to message ordering)
          const toolIndex = prev.findIndex(
            item => 'type' in item &&
                    item.type === 'tool_execution' &&
                    item.tool_name === message.payload.tool_name &&
                    item.status === 'running'
          )
          if (toolIndex !== -1) {
            const toolItem = prev[toolIndex] as ToolExecutionItem
            const updatedItem: ToolExecutionItem = {
              ...toolItem,
              status: message.payload.success ? 'success' : 'error',
              final_output: message.payload.output_summary,
              actionable_findings: message.payload.actionable_findings || [],
              recommended_next_steps: message.payload.recommended_next_steps || [],
            }
            return [
              ...prev.slice(0, toolIndex),
              updatedItem,
              ...prev.slice(toolIndex + 1)
            ]
          }
          return prev
        })
        setIsLoading(false)
        break

      case MessageType.PHASE_UPDATE:
        setCurrentPhase(message.payload.current_phase as Phase)
        setIterationCount(message.payload.iteration_count)
        if (message.payload.attack_path_type) {
          setAttackPathType(String(message.payload.attack_path_type) as AttackPathType)
        }
        break

      case MessageType.TODO_UPDATE:
        setTodoList(message.payload.todo_list)
        // Update the last thinking item with the new todo list
        setChatItems(prev => {
          if (prev.length === 0) return prev
          const lastItem = prev[prev.length - 1]
          if ('type' in lastItem && lastItem.type === 'thinking') {
            return [
              ...prev.slice(0, -1),
              { ...lastItem, updated_todo_list: message.payload.todo_list }
            ]
          }
          return prev
        })
        break

      case MessageType.APPROVAL_REQUEST:
        // Ignore duplicate approval requests if we're already awaiting or just processed one
        if (awaitingApprovalRef.current || isProcessingApproval.current) {
          console.log('Ignoring duplicate approval request - already processing')
          break
        }

        console.log('Received approval request:', message.payload)
        awaitingApprovalRef.current = true
        setAwaitingApproval(true)
        setApprovalRequest(message.payload)
        setIsLoading(false)
        break

      case MessageType.QUESTION_REQUEST:
        // Ignore duplicate question requests if we're already awaiting or just processed one
        if (awaitingQuestionRef.current || isProcessingQuestion.current) {
          console.log('Ignoring duplicate question request - already processing')
          break
        }

        console.log('Received question request:', message.payload)
        awaitingQuestionRef.current = true
        setAwaitingQuestion(true)
        setQuestionRequest(message.payload)
        setIsLoading(false)
        break

      case MessageType.RESPONSE:
        // Add agent response message
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: message.payload.answer,
          phase: message.payload.phase as Phase,
          timestamp: new Date(),
        }
        setChatItems(prev => [...prev, assistantMessage])
        setIsLoading(false)
        break

      case MessageType.ERROR:
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'An error occurred while processing your request.',
          error: message.payload.message,
          timestamp: new Date(),
        }
        setChatItems(prev => [...prev, errorMessage])
        setIsLoading(false)
        break

      case MessageType.TASK_COMPLETE:
        const completeMessage: Message = {
          id: `complete-${Date.now()}`,
          role: 'assistant',
          content: message.payload.message,
          phase: message.payload.final_phase as Phase,
          timestamp: new Date(),
        }
        setChatItems(prev => [...prev, completeMessage])
        setIsLoading(false)
        break

      case MessageType.GUIDANCE_ACK:
        // Already shown in chat from handleSend
        break

      case MessageType.STOPPED:
        setIsLoading(false)
        setIsStopped(true)
        break
    }
  }, [todoList])

  // Initialize WebSocket — use currentProject when it matches, else fallback to fullProject from API.
  // modeOverride: user can switch mode in-chat (session-only); null = use project setting.
  const { data: fullProject } = useProjectById(projectId || null)
  const projectMode: 'guided' | 'offensive' | undefined = currentProject?.id === projectId
    ? (currentProject?.agentOperatingMode as 'guided' | 'offensive' | undefined)
    : (fullProject?.agentOperatingMode as 'guided' | 'offensive' | undefined)
  const [modeOverride, setModeOverride] = useState<'guided' | 'offensive' | null>(null)
  const operatingMode: 'guided' | 'offensive' = modeOverride ?? projectMode ?? 'guided'

  // Reset mode override when project changes so new project's default applies
  useEffect(() => {
    setModeOverride(null)
  }, [projectId])

  // Live engagement brief — injected into agent system prompt on every query
  const { brief: engagementBrief } = useEngagementBrief(projectId || null)
  const formattedBrief = engagementBrief ? formatBriefForPrompt(engagementBrief) : undefined
  const dynamicSuggestions = engagementBrief ? generateSuggestedPrompts(engagementBrief) : null

  const { status, isConnected, reconnectAttempt, sendQuery, sendApproval, sendAnswer, sendGuidance, sendStop, sendResume } = useAgentWebSocket({
    userId: userId || process.env.NEXT_PUBLIC_USER_ID || 'default_user',
    projectId: projectId || process.env.NEXT_PUBLIC_PROJECT_ID || 'default_project',
    sessionId: sessionId || process.env.NEXT_PUBLIC_SESSION_ID || 'default_session',
    operatingMode,
    engagementBrief: formattedBrief,
    enabled: isOpen,
    onMessage: handleWebSocketMessage,
    onError: (error) => {
      // Only show connection errors once, not for every retry
      if (error.message === 'Initial connection failed') {
        const errorMsg: Message = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Failed to connect to agent. Please check that the backend is running at ${process.env.NEXT_PUBLIC_AGENT_WS_URL || 'ws://localhost:8090/ws/agent'}`,
          error: error.message,
          timestamp: new Date(),
        }
        setChatItems(prev => [...prev, errorMsg])
      }
    },
  })

  // Phase 1: "Explain this" from Recon Logs — when user selects logs and clicks Ask AI, we receive explainPayload
  useEffect(() => {
    if (!explainPayload?.text?.trim() || !isConnected || !onExplainSent) return
    if (lastExplainPayloadRef.current === explainPayload.text) return
    lastExplainPayloadRef.current = explainPayload.text
    const prompt = `Explain these recon log lines and what they mean (errors, warnings, or findings):\n\n${explainPayload.text.trim()}`
    const userMessage: Message = {
      id: `user-explain-${Date.now()}`,
      role: 'user',
      content: `Explain these recon logs:\n\n${explainPayload.text.trim().slice(0, 500)}${explainPayload.text.length > 500 ? '…' : ''}`,
      timestamp: new Date(),
      explainContext: { logExcerpt: explainPayload.text.trim() },
    }
    setChatItems(prev => [...prev, userMessage])
    setIsLoading(true)
    sendQuery(prompt)
    onExplainSent()
  }, [explainPayload, isConnected, onExplainSent, sendQuery])

  const handleSend = useCallback(() => {
    const question = inputValue.trim()
    if (!question || !isConnected || awaitingApproval || awaitingQuestion) return

    // Typing "stop" and pressing Enter stops the agent
    if (question.toLowerCase() === 'stop') {
      sendStop()
      setInputValue('')
      return
    }

    if (isLoading) {
      // Agent is working → send as guidance
      const guidanceMessage: Message = {
        id: `guidance-${Date.now()}`,
        role: 'user',
        content: question,
        isGuidance: true,
        timestamp: new Date(),
      }
      setChatItems(prev => [...prev, guidanceMessage])
      setInputValue('')
      sendGuidance(question)
    } else {
      // Normal query
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: question,
        timestamp: new Date(),
      }
      setChatItems(prev => [...prev, userMessage])
      setInputValue('')
      setIsLoading(true)

      try {
        sendQuery(question)
      } catch (error) {
        setIsLoading(false)
      }
    }
  }, [inputValue, isConnected, isLoading, awaitingApproval, awaitingQuestion, sendQuery, sendGuidance, sendStop])

  const handleApproval = useCallback((decision: 'approve' | 'modify' | 'abort') => {
    // Prevent double submission using ref (immediate check, not async state)
    if (!awaitingApproval || isProcessingApproval.current || !awaitingApprovalRef.current) {
      return
    }

    // Mark as processing immediately
    isProcessingApproval.current = true
    awaitingApprovalRef.current = false

    setAwaitingApproval(false)
    setApprovalRequest(null)
    setIsLoading(true)

    // Add decision message
    const decisionMessage: Message = {
      id: `decision-${Date.now()}`,
      role: 'user',
      content: decision === 'approve'
        ? 'Approved phase transition'
        : decision === 'modify'
        ? `Modified: ${modificationText}`
        : 'Aborted phase transition',
      timestamp: new Date(),
    }
    setChatItems(prev => [...prev, decisionMessage])

    try {
      sendApproval(decision, decision === 'modify' ? modificationText : undefined)
      setModificationText('')
    } catch (error) {
      setIsLoading(false)
      awaitingApprovalRef.current = false
      isProcessingApproval.current = false
    } finally {
      // Reset the processing flag after a delay to prevent backend from sending duplicate
      setTimeout(() => {
        isProcessingApproval.current = false
      }, 1000)
    }
  }, [modificationText, sendApproval, awaitingApproval])

  const handleAnswer = useCallback(() => {
    // Prevent double submission using ref (immediate check, not async state)
    if (!awaitingQuestion || isProcessingQuestion.current || !awaitingQuestionRef.current) {
      return
    }

    if (!questionRequest) return

    // Mark as processing immediately
    isProcessingQuestion.current = true
    awaitingQuestionRef.current = false

    setAwaitingQuestion(false)
    setQuestionRequest(null)
    setIsLoading(true)

    const answer = questionRequest.format === 'text'
      ? answerText
      : selectedOptions.join(', ')

    // Add answer message
    const answerMessage: Message = {
      id: `answer-${Date.now()}`,
      role: 'user',
      content: `Answer: ${answer}`,
      timestamp: new Date(),
    }
    setChatItems(prev => [...prev, answerMessage])

    try {
      sendAnswer(answer)
      setAnswerText('')
      setSelectedOptions([])
    } catch (error) {
      setIsLoading(false)
      awaitingQuestionRef.current = false
      isProcessingQuestion.current = false
    } finally {
      // Reset the processing flag after a delay to prevent backend from sending duplicate
      setTimeout(() => {
        isProcessingQuestion.current = false
      }, 1000)
    }
  }, [questionRequest, answerText, selectedOptions, sendAnswer, awaitingQuestion])

  const handleStop = useCallback(() => {
    sendStop()
  }, [sendStop])

  const handleResume = useCallback(() => {
    sendResume()
    setIsStopped(false)
    setIsLoading(true)
  }, [sendResume])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  const handleNewChat = () => {
    setChatItems([])
    setCurrentPhase('informational')
    setAttackPathType('cve_exploit')
    setIterationCount(0)
    setAwaitingApproval(false)
    setApprovalRequest(null)
    setAwaitingQuestion(false)
    setQuestionRequest(null)
    setAnswerText('')
    setSelectedOptions([])
    setTodoList([])
    setIsStopped(false)
    awaitingApprovalRef.current = false
    isProcessingApproval.current = false
    awaitingQuestionRef.current = false
    isProcessingQuestion.current = false
    shouldAutoScroll.current = true // Reset to auto-scroll on new chat
    onResetSession?.()
  }

  const PhaseIcon = PHASE_CONFIG[currentPhase].icon

  // Connection status indicator with color
  const getConnectionStatusColor = () => {
    return status === ConnectionStatus.CONNECTED ? '#10b981' : '#ef4444' // green : red
  }

  const getConnectionStatusIcon = () => {
    const color = getConnectionStatusColor()
    if (status === ConnectionStatus.CONNECTED) {
      return <Wifi size={12} className={styles.connectionIcon} style={{ color }} />
    } else if (status === ConnectionStatus.RECONNECTING) {
      return <Loader2 size={12} className={`${styles.connectionIcon} ${styles.spinner}`} style={{ color }} />
    } else {
      return <WifiOff size={12} className={styles.connectionIcon} style={{ color }} />
    }
  }

  const getConnectionStatusText = () => {
    switch (status) {
      case ConnectionStatus.CONNECTING:
        return 'Connecting...'
      case ConnectionStatus.CONNECTED:
        return 'Connected'
      case ConnectionStatus.RECONNECTING:
        return `Reconnecting... (${reconnectAttempt}/5)`
      case ConnectionStatus.FAILED:
        return 'Connection failed'
      case ConnectionStatus.DISCONNECTED:
        return 'Disconnected'
    }
  }

  // Group timeline items by their sequence (between messages)
  const groupedChatItems: Array<{ type: 'message' | 'timeline', content: Message | Array<ThinkingItem | ToolExecutionItem> }> = []

  let currentTimelineGroup: Array<ThinkingItem | ToolExecutionItem> = []

  chatItems.forEach((item) => {
    if ('role' in item) {
      // It's a message - push any accumulated timeline items first
      if (currentTimelineGroup.length > 0) {
        groupedChatItems.push({ type: 'timeline', content: currentTimelineGroup })
        currentTimelineGroup = []
      }
      // Then push the message
      groupedChatItems.push({ type: 'message', content: item })
    } else if ('type' in item && (item.type === 'thinking' || item.type === 'tool_execution')) {
      // It's a timeline item - add to current group
      currentTimelineGroup.push(item)
    }
  })

  // Push any remaining timeline items
  if (currentTimelineGroup.length > 0) {
    groupedChatItems.push({ type: 'timeline', content: currentTimelineGroup })
  }

  const renderMessage = (item: Message) => {
    return (
      <div
        key={item.id}
        className={`${styles.message} ${
          item.role === 'user' ? styles.messageUser : styles.messageAssistant
        } ${item.isGuidance ? styles.messageGuidance : ''} ${item.explainContext ? styles.messageWithCitation : ''}`}
      >
        <div className={styles.messageIcon}>
          {item.role === 'user' ? <User size={14} /> : <Bot size={14} />}
        </div>
        <div className={styles.messageContent}>
          {item.isGuidance && (
            <span className={styles.guidanceBadge}>Guidance</span>
          )}
          {item.explainContext && (
            <span className={styles.citationBadge}>Recon logs</span>
          )}
          <div className={styles.messageText}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '')
                  const language = match ? match[1] : ''
                  const isInline = !className

                  return !isInline && language ? (
                    <SyntaxHighlighter
                      style={vscDarkPlus as any}
                      language={language}
                      PreTag="div"
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  )
                }
              }}
            >
              {item.content}
            </ReactMarkdown>
          </div>

          {item.explainContext && onViewInRecon && (
            <button
              type="button"
              className={styles.viewInReconButton}
              onClick={() => onViewInRecon(item.explainContext!.logExcerpt)}
              title="Jump to Recon tab and highlight this log excerpt"
            >
              <ExternalLink size={12} />
              <span>View in Recon</span>
            </button>
          )}

          {item.error && (
            <div className={styles.errorBadge}>
              <AlertCircle size={12} />
              <span>{item.error}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''} ${panelMode ? styles.panelMode : ''}`}
      aria-hidden={!isOpen}
      data-panel-mode={panelMode ? 'true' : undefined}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <Sparkles size={16} />
          </div>
          <div className={styles.headerText}>
            <h2 className={styles.title}>AI Assistant</h2>
            <div className={styles.headerMeta}>
              <select
                className={styles.modeSwitcher}
                value={operatingMode}
                onChange={(e) => setModeOverride(e.target.value as 'guided' | 'offensive')}
                title="Switch between Guided (approval gates) and Offensive (autonomous) mode"
                aria-label="Operating mode"
                data-mode={operatingMode}
              >
                <option value="guided">Guided</option>
                <option value="offensive">Offensive</option>
              </select>
              <div className={styles.connectionStatus}>
              {getConnectionStatusIcon()}
              <span className={styles.subtitle} style={{ color: getConnectionStatusColor() }}>
                {getConnectionStatusText()}
              </span>
            </div>
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          {/* Kill chain stage badge */}
          {engagementBrief && engagementBrief.killChain.status !== 'idle' && (
            <div
              className={styles.killChainBadge}
              title={`Kill Chain: Stage ${engagementBrief.killChain.stage} — ${engagementBrief.killChain.stageName}`}
              data-status={engagementBrief.killChain.status}
            >
              <Target size={11} />
              <span>S{engagementBrief.killChain.stage}</span>
            </div>
          )}
          <button
            className={styles.iconButton}
            onClick={handleNewChat}
            title="New conversation"
            aria-label="Start new conversation"
          >
            <RotateCcw size={14} />
          </button>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close assistant"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Phase 1+3: Live Recon run capsule — always show when project has recon; Phase 3 adds Start/Stop controls */}
      {projectId && (
        <div className={styles.runCapsule} data-live-recon="true" data-phase={reconPhase ?? ''}>
          <Radar size={14} className={styles.runCapsuleIcon} />
          <span className={styles.runCapsuleText}>
            {reconStatus === 'starting' && 'Starting…'}
            {reconStatus === 'running' && (
              reconPhaseNumber != null && reconPhase
                ? `Phase ${reconPhaseNumber}/7 · ${reconPhase}`
                : 'Test running…'
            )}
            {reconStatus === 'paused' && 'Test paused'}
            {reconStatus === 'completed' && 'Completed'}
            {reconStatus === 'error' && 'Error'}
            {reconStatus === 'idle' && 'Idle'}
            {reconStatus === 'stopping' && 'Stopping…'}
          </span>
          {onStartRecon && (reconStatus === 'idle' || reconStatus === 'completed' || reconStatus === 'error') && (
            <button
              type="button"
              className={styles.runCapsuleButton}
              onClick={onStartRecon}
              disabled={isReconLoading}
              title="Launch test (Stage 1: Reconnaissance)"
            >
              <Play size={12} />
              <span>Start</span>
            </button>
          )}
          {onStopRecon && (reconStatus === 'running' || reconStatus === 'starting' || reconStatus === 'paused') && (
            <button
              type="button"
              className={`${styles.runCapsuleButton} ${styles.runCapsuleButtonStop}`}
              onClick={onStopRecon}
              disabled={isReconLoading}
              title="Stop assessment"
            >
              <Square size={12} />
              <span>Stop</span>
            </button>
          )}
        </div>
      )}

      {/* Phase Indicator */}
      <div className={styles.phaseIndicator}>
        <div
          className={styles.phaseBadge}
          style={{
            backgroundColor: PHASE_CONFIG[currentPhase].bgColor,
            borderColor: PHASE_CONFIG[currentPhase].color,
          }}
        >
          <PhaseIcon size={14} style={{ color: PHASE_CONFIG[currentPhase].color }} />
          <span style={{ color: PHASE_CONFIG[currentPhase].color }}>
            {PHASE_CONFIG[currentPhase].label}
          </span>
        </div>

        {/* Attack Path Badge - Show when in exploitation or post_exploitation phase */}
        {(currentPhase === 'exploitation' || currentPhase === 'post_exploitation') && (
          <div
            className={styles.phaseBadge}
            style={{
              backgroundColor: getAttackPathConfig(attackPathType).bgColor,
              borderColor: getAttackPathConfig(attackPathType).color,
            }}
          >
            <span style={{ color: getAttackPathConfig(attackPathType).color }}>
              {getAttackPathConfig(attackPathType).shortLabel}
            </span>
          </div>
        )}

        {iterationCount > 0 && (
          <span className={styles.iterationCount}>Step {iterationCount}</span>
        )}

        {modelName && projectId && (
          <div className={styles.modelSwitcherContainer}>
            <button
              className={styles.modelSwitcherButton}
              onClick={() => setShowModelSwitcher(!showModelSwitcher)}
              disabled={isChangingModel}
              title="Switch AI model"
            >
              <span className={styles.modelBadge}>{modelName}</span>
              <ChevronDown size={12} className={styles.modelSwitcherIcon} />
            </button>
            {showModelSwitcher && (
              <div className={styles.modelSwitcherDropdown}>
                <div className={styles.modelSwitcherHeader}>Select AI Model</div>
                <select
                  className={styles.modelSwitcherSelect}
                  value={modelName || ''}
                  onChange={(e) => {
                    const newModel = e.target.value
                    if (newModel && newModel !== modelName) {
                      setPendingModel(newModel)
                      setShowModelChangeConfirm(true)
                      setShowModelSwitcher(false)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                >
                  <optgroup label="Anthropic Claude">
                    <option value="claude-opus-4-6">Claude Opus 4.6 — Most capable model</option>
                    <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 — Balanced performance</option>
                    <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — Fast and efficient</option>
                  </optgroup>
                  <optgroup label="GPT-5.2">
                    <option value="gpt-5.2">gpt-5.2 — Flagship reasoning model</option>
                    <option value="gpt-5.2-pro">gpt-5.2-pro — Smarter, more precise (Responses API)</option>
                  </optgroup>
                  <optgroup label="GPT-5">
                    <option value="gpt-5">gpt-5 — Previous reasoning model</option>
                    <option value="gpt-5-mini">gpt-5-mini — Faster, cost-efficient GPT-5</option>
                    <option value="gpt-5-nano">gpt-5-nano — Fastest, cheapest GPT-5</option>
                  </optgroup>
                  <optgroup label="GPT-4.1">
                    <option value="gpt-4.1">gpt-4.1 — Smartest non-reasoning model</option>
                    <option value="gpt-4.1-mini">gpt-4.1-mini — Fast, cost-efficient</option>
                    <option value="gpt-4.1-nano">gpt-4.1-nano — Fastest, cheapest</option>
                  </optgroup>
                  <optgroup label="GPT-4o">
                    <option value="gpt-4o">gpt-4o — Latest GPT-4 optimized model</option>
                    <option value="gpt-4o-mini">gpt-4o-mini — Faster, cost-efficient GPT-4o</option>
                  </optgroup>
                  <optgroup label="Google Gemini">
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro — Latest, most capable (recommended)</option>
                    <option value="gemini-3-pro-preview">Gemini 3 Pro — Previous gen pro model</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash — Fast and efficient</option>
                    <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Experimental — Latest experimental</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro — Previous generation pro model</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash — Fast previous generation</option>
                  </optgroup>
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Todo List Widget */}
      {todoList.length > 0 && (
        <div className={styles.todoWidgetContainer}>
          <TodoListWidget items={todoList} />
        </div>
      )}

      {/* Unified Chat (Messages + Timeline Items) */}
      <div className={styles.messages} ref={messagesContainerRef} onScroll={checkIfAtBottom}>
        {chatItems.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Bot size={32} />
            </div>
            <h3 className={styles.emptyTitle}>How can I help you?</h3>
            <p className={styles.emptyDescription}>
              Ask me about vulnerabilities, scan results, or query the graph database.
            </p>
            <div className={styles.suggestions}>
              {(dynamicSuggestions ?? [
                'What vulnerabilities were found?',
                'Show me all CVEs with critical severity',
                'What technologies are in use?',
              ]).map((prompt) => (
                <button
                  key={prompt}
                  className={styles.suggestion}
                  onClick={() => setInputValue(prompt)}
                  disabled={!isConnected}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Render messages and timeline items in chronological order */}
        {groupedChatItems.map((groupItem, index) => {
          if (groupItem.type === 'message') {
            return renderMessage(groupItem.content as Message)
          } else {
            // Render timeline group
            const items = groupItem.content as Array<ThinkingItem | ToolExecutionItem>
            return (
              <AgentTimeline
                key={`timeline-${index}`}
                items={items}
                isStreaming={isLoading && index === groupedChatItems.length - 1}
              />
            )
          }
        })}

        {isLoading && (
          <div className={`${styles.message} ${styles.messageAssistant}`}>
            <div className={styles.messageIcon}>
              <Bot size={14} />
            </div>
            <div className={styles.messageContent}>
              <div className={styles.loadingIndicator}>
                <Loader2 size={14} className={styles.spinner} />
                <span>Processing...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Approval Dialog */}
      {awaitingApproval && approvalRequest && (
        <div className={styles.approvalDialog}>
          <div className={styles.approvalHeader}>
            <AlertCircle size={16} />
            <span>Phase Transition Request</span>
          </div>
          <div className={styles.approvalContent}>
            <p className={styles.approvalTransition}>
              <span className={styles.approvalFrom}>{approvalRequest.from_phase}</span>
              <span className={styles.approvalArrow}>→</span>
              <span className={styles.approvalTo}>{approvalRequest.to_phase}</span>
            </p>
            <p className={styles.approvalReason}>{approvalRequest.reason}</p>

            {approvalRequest.planned_actions.length > 0 && (
              <div className={styles.approvalSection}>
                <strong>Planned Actions:</strong>
                <ul>
                  {approvalRequest.planned_actions.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
              </div>
            )}

            {approvalRequest.risks.length > 0 && (
              <div className={styles.approvalSection}>
                <strong>Risks:</strong>
                <ul>
                  {approvalRequest.risks.map((risk, i) => (
                    <li key={i}>{risk}</li>
                  ))}
                </ul>
              </div>
            )}

            <textarea
              className={styles.modificationInput}
              placeholder="Optional: provide modification feedback..."
              value={modificationText}
              onChange={(e) => setModificationText(e.target.value)}
            />
          </div>
          <div className={styles.approvalActions}>
            <button
              className={`${styles.approvalButton} ${styles.approvalButtonApprove}`}
              onClick={() => handleApproval('approve')}
              disabled={isLoading}
            >
              Approve
            </button>
            <button
              className={`${styles.approvalButton} ${styles.approvalButtonModify}`}
              onClick={() => handleApproval('modify')}
              disabled={isLoading || !modificationText.trim()}
            >
              Modify
            </button>
            <button
              className={`${styles.approvalButton} ${styles.approvalButtonAbort}`}
              onClick={() => handleApproval('abort')}
              disabled={isLoading}
            >
              Abort
            </button>
          </div>
        </div>
      )}

      {/* Q&A Dialog */}
      {awaitingQuestion && questionRequest && (
        <div className={styles.questionDialog}>
          <div className={styles.questionHeader}>
            <HelpCircle size={16} />
            <span>Agent Question</span>
          </div>
          <div className={styles.questionContent}>
            <p className={styles.questionText}>{questionRequest.question}</p>
            <p className={styles.questionContext}>{questionRequest.context}</p>

            {questionRequest.format === 'text' && (
              <textarea
                className={styles.answerInput}
                placeholder={questionRequest.default_value || 'Type your answer...'}
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
              />
            )}

            {questionRequest.format === 'single_choice' && questionRequest.options.length > 0 && (
              <div className={styles.optionsList}>
                {questionRequest.options.map((option, i) => (
                  <label key={i} className={styles.optionRadio}>
                    <input
                      type="radio"
                      name="question-option"
                      value={option}
                      checked={selectedOptions[0] === option}
                      onChange={() => setSelectedOptions([option])}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            )}

            {questionRequest.format === 'multi_choice' && questionRequest.options.length > 0 && (
              <div className={styles.optionsList}>
                {questionRequest.options.map((option, i) => (
                  <label key={i} className={styles.optionCheckbox}>
                    <input
                      type="checkbox"
                      value={option}
                      checked={selectedOptions.includes(option)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedOptions([...selectedOptions, option])
                        } else {
                          setSelectedOptions(selectedOptions.filter(o => o !== option))
                        }
                      }}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className={styles.questionActions}>
            <button
              className={`${styles.answerButton} ${styles.answerButtonSubmit}`}
              onClick={handleAnswer}
              disabled={isLoading || (questionRequest.format === 'text' ? !answerText.trim() : selectedOptions.length === 0)}
            >
              Submit Answer
            </button>
          </div>
        </div>
      )}

      {/* Model Change Confirmation Dialog */}
      {showModelChangeConfirm && pendingModel && (
        <div className={styles.modalOverlay} onClick={() => setShowModelChangeConfirm(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <AlertCircle size={20} className={styles.modalIcon} />
              <h3 className={styles.modalTitle}>Switch AI Model?</h3>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalText}>
                Changing the AI model will reset your current conversation session.
              </p>
              <p className={styles.modalText}>
                <strong>Current:</strong> {modelName}<br />
                <strong>New:</strong> {pendingModel}
              </p>
              <p className={styles.modalWarning}>
                All conversation history, todos, and phase progress will be cleared.
              </p>
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.modalButtonSecondary}
                onClick={() => {
                  setShowModelChangeConfirm(false)
                  setPendingModel(null)
                }}
                disabled={isChangingModel}
              >
                Cancel
              </button>
              <button
                className={styles.modalButtonPrimary}
                onClick={async () => {
                  if (!projectId || !pendingModel) {
                    return
                  }

                  setIsChangingModel(true)
                  try {
                    // Update project settings
                    const response = await fetch(`/api/projects/${projectId}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ agentOpenaiModel: pendingModel }),
                    })

                    if (!response.ok) {
                      const errorData = await response.json().catch(() => ({}))
                      throw new Error(errorData.error || 'Failed to update model')
                    }

                    const updatedProject = await response.json()

                    // Update project context
                    if (currentProject) {
                      setCurrentProject({
                        ...currentProject,
                        agentOpenaiModel: pendingModel,
                      })
                    }

                    // Reset session to clear conversation history
                    onResetSession?.()

                    // Close dialogs
                    setShowModelChangeConfirm(false)
                    setPendingModel(null)
                    setShowModelSwitcher(false)
                  } catch (error) {
                    console.error('Failed to change model:', error)
                    const errorMessage = error instanceof Error ? error.message : 'Failed to change model. Please try again.'
                    alert(errorMessage)
                    // Keep dialog open on error so user can retry
                  } finally {
                    setIsChangingModel(false)
                  }
                }}
                disabled={isChangingModel}
              >
                {isChangingModel ? (
                  <>
                    <Loader2 size={16} className={styles.spinner} />
                    Changing...
                  </>
                ) : (
                  'Switch Model'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className={styles.inputContainer}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              !isConnected
                ? 'Connecting to agent...'
                : awaitingApproval
                ? 'Respond to the approval request above...'
                : awaitingQuestion
                ? 'Answer the question above...'
                : isStopped
                ? 'Agent stopped. Click resume to continue...'
                : isLoading
                ? 'Send guidance to the agent...'
                : 'Ask a question...'
            }
            rows={1}
            disabled={awaitingApproval || awaitingQuestion || !isConnected || isStopped}
          />
          <div className={styles.inputActions}>
            {(isLoading || isStopped) && (
              <button
                className={`${styles.stopResumeButton} ${isStopped ? styles.resumeButton : styles.stopButton}`}
                onClick={isStopped ? handleResume : handleStop}
                aria-label={isStopped ? 'Resume agent' : 'Stop agent'}
                title={isStopped ? 'Resume execution' : 'Stop execution'}
              >
                {isStopped ? <Play size={13} /> : <Square size={13} />}
              </button>
            )}
            <button
              className={styles.sendButton}
              onClick={handleSend}
              disabled={!inputValue.trim() || awaitingApproval || awaitingQuestion || !isConnected || isStopped}
              aria-label="Send message"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
        <span className={styles.inputHint}>
          {isConnected
            ? isLoading
              ? "Send guidance, or type 'stop' and press Enter to stop"
              : "Press Enter to send, Shift+Enter for new line. Type 'stop' to stop."
            : 'Waiting for connection...'}
        </span>
      </div>
    </div>
  )
}
