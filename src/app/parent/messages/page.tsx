'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData, notifyChange } from '@/lib/store';
import { getDb } from '@/lib/db';
import { randomId } from '@/lib/crypto';
import { formatDateTime } from '@/lib/format';
import { Card, EmptyState, Loading, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { Message } from '@/lib/types';

const THREAD_ID = 'thr-parent-teacher';
const ADVISER_ID = 'usr-teacher';

export default function ParentMessagesPage() {
  const { session, t } = useSession();
  const userId = session?.userId ?? '';
  const [draft, setDraft] = useState('');

  const { data, loading } = useLiveData(async () => {
    if (!userId) return null;
    const [messages, adviser] = await Promise.all([
      getDb().messages.where('threadId').equals(THREAD_ID).toArray(),
      getDb().users.get(ADVISER_ID),
    ]);
    return {
      messages: messages.sort((a, b) => a.timestamp - b.timestamp),
      adviser: adviser ?? null,
    };
  }, [userId]);

  async function send() {
    if (!session || !draft.trim()) return;
    const message: Message = {
      id: randomId('msg-'),
      threadId: THREAD_ID,
      fromId: session.userId,
      toId: ADVISER_ID,
      body: draft.trim(),
      timestamp: Date.now(),
      read: false,
    };
    await getDb().messages.put(message);
    setDraft('');
    notifyChange();
  }

  return (
    <>
      <PageHeader
        title={t('messages')}
        description={`Direct line to your child's class adviser${data?.adviser ? ` — ${data.adviser.name}` : ''}.`}
      />

      {loading || !data ? (
        <Loading rows={5} />
      ) : (
        <Card title={data.adviser?.name ?? 'Class adviser'} subtitle={data.adviser?.position}>
          {data.messages.length === 0 ? (
            <EmptyState title={t('no_data')} />
          ) : (
            <ul className="space-y-3">
              {data.messages.map((m) => {
                const mine = m.fromId === userId;
                return (
                  <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                        mine ? 'bg-deped-700 text-white' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      <p>{m.body}</p>
                      <p className={`mt-1 text-[11px] ${mine ? 'text-deped-100' : 'text-slate-500'}`}>
                        {formatDateTime(m.timestamp)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="sr-only" htmlFor="draft">Message</label>
            <input
              id="draft"
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your message…"
            />
            <button type="submit" className="btn-primary" disabled={!draft.trim()}>
              <Icon name="chat" className="h-5 w-5" />
              Send
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Messages are stored on the device and delivered when a connection is available.
          </p>
        </Card>
      )}
    </>
  );
}
