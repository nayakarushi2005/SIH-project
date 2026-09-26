import { useSyncExternalStore } from 'react';

import { DUMMY_CHATS } from '../constants/dummyChats';

let chats = DUMMY_CHATS;
const listeners = new Set();

function update(next) {
  chats = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return chats;
}

function lastAt(chat) {
  return chat.messages[chat.messages.length - 1]?.at ?? 0;
}

export function useChats() {
  const all = useSyncExternalStore(subscribe, getSnapshot);
  return [...all].sort((a, b) => lastAt(b) - lastAt(a));
}

export function useChat(id) {
  const all = useSyncExternalStore(subscribe, getSnapshot);
  return all.find((chat) => chat.id === id) ?? null;
}

export function markRead(id) {
  if (!chats.some((chat) => chat.id === id && chat.unread > 0)) return;
  update(chats.map((chat) => (chat.id === id ? { ...chat, unread: 0 } : chat)));
}

export function sendMessage(id, text) {
  const body = text.trim();
  if (!body) return;
  const message = { id: `${id}-${Date.now()}`, fromMe: true, text: body, at: Date.now() };
  update(chats.map((chat) => (chat.id === id ? { ...chat, messages: [...chat.messages, message] } : chat)));
}

export function formatChatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (timestamp >= startOfToday) {
    return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }
  if (timestamp >= startOfToday - 24 * 60 * 60 * 1000) return 'Yesterday';
  if (timestamp >= startOfToday - 6 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString('en-IN', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
