"use client";

import { useSyncExternalStore } from "react";
import type { AskResponse, HistoryEntry, SavedQuestion } from "../types";

/**
 * Browser-side app state. History, saved questions and preferences persist in
 * localStorage (this browser only). No secrets, credentials or SQL are ever stored.
 */
export interface Settings {
  /** Empty string means "use the server default model". */
  model: string;
  rowLimit: number;
  pageSize: number;
  currency: string;
  locale: string;
  saveHistory: boolean;
}

export interface AskState {
  question: string;
  status: "idle" | "loading" | "success" | "error";
  result: AskResponse | null;
  error: { code: string; message: string; retryAfterSeconds?: number } | null;
  askedQuestion: string | null;
}

interface State {
  hydrated: boolean;
  history: HistoryEntry[];
  saved: SavedQuestion[];
  settings: Settings;
  /** Current Ask page state. Memory only, so results survive navigation but not reloads. */
  ask: AskState;
  /** A question queued by another page (history, saved) to run on the Ask page. */
  pendingQuestion: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  model: "",
  rowLimit: 500,
  pageSize: 25,
  currency: "INR",
  locale: "en-IN",
  saveHistory: true,
};

const MAX_HISTORY = 200;
const KEY = "querymind:v1";

const initialAsk: AskState = { question: "", status: "idle", result: null, error: null, askedQuestion: null };

const serverState: State = {
  hydrated: false,
  history: [],
  saved: [],
  settings: DEFAULT_SETTINGS,
  ask: initialAsk,
  pendingQuestion: null,
};

let state: State = serverState;
const listeners = new Set<() => void>();

function persist() {
  try {
    const { history, saved, settings } = state;
    localStorage.setItem(KEY, JSON.stringify({ history, saved, settings }));
  } catch {
    // Storage may be full or blocked (private mode); the app keeps working in memory.
  }
}

function hydrate() {
  if (state.hydrated || typeof window === "undefined") return;
  let stored: Partial<Pick<State, "history" | "saved" | "settings">> = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    stored = {};
  }
  state = {
    ...state,
    hydrated: true,
    history: Array.isArray(stored.history) ? stored.history.slice(0, MAX_HISTORY) : [],
    saved: Array.isArray(stored.saved) ? stored.saved : [],
    settings: { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) },
  };
}

function set(update: Partial<State> | ((s: State) => Partial<State>), save = true) {
  state = { ...state, ...(typeof update === "function" ? update(state) : update) };
  if (save) persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (!state.hydrated) {
    hydrate();
    queueMicrotask(() => listeners.forEach((l) => l()));
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(serverState),
  );
}

export function getState(): State {
  return state;
}

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export const actions = {
  setAsk(patch: Partial<AskState>) {
    set((s) => ({ ask: { ...s.ask, ...patch } }), false);
  },
  resetAsk() {
    set({ ask: initialAsk }, false);
  },
  queueQuestion(question: string) {
    set({ pendingQuestion: question }, false);
  },
  takePendingQuestion(): string | null {
    const q = state.pendingQuestion;
    if (q) set({ pendingQuestion: null }, false);
    return q;
  },

  addHistory(entry: Omit<HistoryEntry, "id" | "createdAt">): HistoryEntry | null {
    if (!state.settings.saveHistory) return null;
    const full: HistoryEntry = { ...entry, id: newId(), createdAt: now() };
    set((s) => ({ history: [full, ...s.history].slice(0, MAX_HISTORY) }));
    return full;
  },
  deleteHistory(id: string) {
    set((s) => ({ history: s.history.filter((h) => h.id !== id) }));
  },
  clearHistory() {
    set({ history: [] });
  },

  saveQuestion(name: string, question: string): SavedQuestion {
    const item: SavedQuestion = { id: newId(), name: name.trim(), question: question.trim(), createdAt: now(), updatedAt: now() };
    set((s) => ({ saved: [item, ...s.saved] }));
    return item;
  },
  updateSaved(id: string, patch: Pick<SavedQuestion, "name" | "question">) {
    set((s) => ({
      saved: s.saved.map((q) => (q.id === id ? { ...q, name: patch.name.trim(), question: patch.question.trim(), updatedAt: now() } : q)),
    }));
  },
  duplicateSaved(id: string) {
    const src = state.saved.find((q) => q.id === id);
    if (!src) return;
    const copy: SavedQuestion = { ...src, id: newId(), name: `${src.name} (copy)`, createdAt: now(), updatedAt: now() };
    set((s) => ({ saved: [copy, ...s.saved] }));
  },
  deleteSaved(id: string) {
    set((s) => ({ saved: s.saved.filter((q) => q.id !== id) }));
  },

  updateSettings(patch: Partial<Settings>) {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
  },
  resetSettings() {
    set({ settings: DEFAULT_SETTINGS });
  },
};
