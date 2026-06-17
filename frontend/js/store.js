const state = {
  user: null,
  token: null,
  currentTab: 'my',
  chats: { my: [], unassigned: [], groups: [], all: [] },
  activeChatId: null,
  messages: [],
  unassignedCount: 0,
  openwaConnected: false,
  qrCode: null,
};

const listeners = {};

function on(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
  return () => {
    listeners[event] = listeners[event].filter(f => f !== fn);
  };
}

function emit(event, data) {
  (listeners[event] || []).forEach(fn => fn(data));
}

function setState(partial) {
  for (const key of Object.keys(partial)) {
    if (key.startsWith('chats.') && key.length > 6) {
      const tab = key.slice(6);
      if (state.chats[tab] !== undefined) {
        state.chats[tab] = partial[key];
        continue;
      }
    }
    state[key] = partial[key];
  }
  emit('state:changed', state);
}

function getState() {
  return state;
}

export { state, on, emit, setState, getState };
