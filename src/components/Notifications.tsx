import { useEffect, useState } from 'react';
import { fetchNotifications, markNotificationRead } from '../api';
import { conductorId } from '../storage';
import type { AppNotification } from '../types';

export function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);

  async function load() {
    const id = conductorId();
    if (!id) {
      setItems([]);
      return;
    }
    setItems(await fetchNotifications(id));
  }

  useEffect(() => {
    const onPing = () => {
      void load();
    };
    window.addEventListener('smena-profile', onPing);
    void load();
    return () => window.removeEventListener('smena-profile', onPing);
  }, []);

  const unread = items.filter((item) => !item.readAt).length;

  return (
    <div className="notice-wrap">
      <button
        type="button"
        className="bell"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          void load();
        }}
      >
        Оповещения
        {unread > 0 ? <span>{unread}</span> : null}
      </button>
      {open && (
        <div className="notice-panel">
          {items.length === 0 ? <p>Пока пусто. Закрепите бейдж на старте смены.</p> : null}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.readAt ? 'is-read' : ''}
              onClick={() => {
                void markNotificationRead(item.id).then(() => load());
              }}
            >
              <b>{item.title}</b>
              <span>{item.body}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
