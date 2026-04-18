(function () {
  const sessionStorageKey = 'ingest.sessionId';
  const messageList = document.getElementById('messageList');
  const actionRow = document.getElementById('actionRow');
  const form = document.getElementById('messageForm');
  const input = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');
  const connectionState = document.getElementById('connectionState');

  const languageButtons = [
    { label: 'Malayalam' },
    { label: 'English' },
    { label: 'Tamil' },
    { label: 'Hindi' }
  ];

  let sessionId = localStorage.getItem(sessionStorageKey);
  if (!sessionId) {
    sessionId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ingest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(sessionStorageKey, sessionId);
  }

  let currentSession = { state: 'idle' };

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function statusTextFromState(state) {
    switch (state) {
      case 'waiting_language':
        return 'Waiting for language';
      case 'waiting_folder_name':
        return 'Waiting for folder name';
      case 'queued':
        return 'Queued';
      case 'downloading':
        return 'Downloading';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Ready';
    }
  }

  function setConnectionState(text) {
    connectionState.textContent = text;
  }

  function emptyStateText(session) {
    switch ((session && session.state) || 'idle') {
      case 'waiting_language':
        return 'Choose a language.';
      case 'waiting_folder_name':
        return 'Movie folder name?';
      default:
        return 'Paste a magnet link to begin.';
    }
  }

  function renderMessages(messages, session) {
    messageList.innerHTML = '';
    if (!messages.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = emptyStateText(session);
      messageList.appendChild(empty);
      return;
    }

    for (const message of messages) {
      const bubble = document.createElement('div');
      bubble.className = `message ${message.role}`;
      if (typeof message.content === 'string' && message.content.toLowerCase().includes('failed')) {
        bubble.classList.add('status-danger');
      } else if (typeof message.content === 'string' && (message.content.startsWith('Queued') || message.content.startsWith('Download complete'))) {
        bubble.classList.add('status-success');
      }
      bubble.innerHTML = escapeHtml(message.content);
      messageList.appendChild(bubble);
    }

    messageList.scrollTop = messageList.scrollHeight;
  }

  function renderPrompt(session) {
    currentSession = session || { state: 'idle' };
    setConnectionState(statusTextFromState(currentSession.state));

    actionRow.innerHTML = '';
    actionRow.hidden = true;

    if (currentSession.state === 'waiting_language') {
      actionRow.hidden = false;
      for (const item of languageButtons) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip';
        button.textContent = item.label;
        button.addEventListener('click', () => submitMessage(item.label, 'language'));
        actionRow.appendChild(button);
      }
      input.placeholder = 'Choose a language or paste a magnet link.';
      return;
    }

    if (currentSession.state === 'waiting_folder_name') {
      input.placeholder = 'Movie folder name?';
      return;
    }

    input.placeholder = 'Paste a magnet link to begin.';
  }

  async function loadHistory() {
    try {
      const response = await fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`);
      if (!response.ok) {
        throw new Error('Failed to load history');
      }

      const data = await response.json();
      renderMessages(data.messages || [], data.session || { state: 'idle' });
      renderPrompt(data.session || { state: 'idle' });
    } catch (error) {
      setConnectionState('Offline');
      renderMessages([], currentSession);
      renderPrompt(currentSession);
    }
  }

  async function submitMessage(message, inputType) {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
      return;
    }

    sendButton.disabled = true;
    input.disabled = true;

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          message: trimmed,
          inputType: inputType || 'text'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      input.value = '';
      await loadHistory();
      renderPrompt(data.session || currentSession);
    } catch (error) {
      const failure = document.createElement('div');
      failure.className = 'message system status-danger';
      failure.textContent = 'Failed to submit message.';
      messageList.appendChild(failure);
      messageList.scrollTop = messageList.scrollHeight;
      renderPrompt(currentSession);
    } finally {
      sendButton.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitMessage(input.value, 'text');
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  loadHistory();
})();
