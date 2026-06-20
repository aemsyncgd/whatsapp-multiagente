import { state, setState } from './store.js';

const BASE = '/api';

function getToken() {
  return state.token || localStorage.getItem('token');
}

async function request(method, path, body = null) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error de servidor');
  return data;
}

async function login(username, password) {
  const data = await request('POST', '/auth/login', { username, password });
  localStorage.setItem('token', data.token);
  setState({ user: data.user, token: data.token });
  return data;
}

function logout() {
  localStorage.removeItem('token');
  setState({ user: null, token: null });
}

async function fetchChats(type) {
  return request('GET', `/chats?type=${type}`);
}

async function fetchMessages(chatId) {
  return request('GET', `/chats/${chatId}/messages`);
}

async function assignChat(chatId) {
  return request('POST', `/chats/${chatId}/assign`);
}

async function releaseChat(chatId) {
  return request('POST', `/chats/${chatId}/release`);
}

async function resolveChat(chatId) {
  return request('POST', `/chats/${chatId}/resolve`);
}

async function sendMessage(chatId, body) {
  return request('POST', `/chats/${chatId}/send`, { body });
}

async function fetchUnassignedCount() {
  return request('GET', '/unassigned-count');
}

async function fetchOpenWaStatus() {
  return request('GET', '/openwa/status');
}

async function syncChats() {
  return request('POST', '/chats/sync');
}

async function syncChatMessages(chatId) {
  return request('POST', `/chats/${chatId}/sync-messages`);
}

export {
  login, logout,
  fetchChats, fetchMessages,
  assignChat, releaseChat, resolveChat,
  sendMessage,
  fetchUnassignedCount, fetchOpenWaStatus,
  syncChats,
  syncChatMessages,
};
