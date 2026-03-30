import type { UIMessage } from "ai";
import type { ComponentData } from "./types";

export interface ChatState {
  messages: UIMessage[];
  isLoading: boolean;
  isDataLoading: boolean;
  messageComponents: Record<string, ComponentData>;
}

// Shared chat state manager for cross-component coordination.
export class ChatStateManager {
  private static instance: ChatStateManager;
  private chatState: ChatState | null = null;
  private listeners: Set<(state: ChatState | null) => void> = new Set();
  private inputCloseCallback: (() => void) | null = null;

  static getInstance(): ChatStateManager {
    if (!ChatStateManager.instance) {
      ChatStateManager.instance = new ChatStateManager();
    }
    return ChatStateManager.instance;
  }

  setChatState(state: ChatState) {
    this.chatState = state;
    this.listeners.forEach((listener) => listener(state));
  }

  getChatState() {
    return this.chatState;
  }

  subscribe(listener: (state: ChatState | null) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setInputCloseCallback(callback: () => void) {
    this.inputCloseCallback = callback;
  }

  closeInput() {
    this.inputCloseCallback?.();
  }
}

