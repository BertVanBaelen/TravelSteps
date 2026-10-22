import { useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import { useT } from '../i18n';
import { useCelebrate } from './Celebration';
import { HeartIcon } from './icons';

interface Props {
  postId: string;
  likeCount: number;
  likedByMe: boolean;
  onChange?: (state: { likeCount: number; likedByMe: boolean }) => void;
}

/** Optimistic like toggle. */
export function LikeButton({ postId, likeCount, likedByMe, onChange }: Props) {
  const msg = useT();
  const [state, setState] = useState({ likeCount, likedByMe });
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const celebrate = useCelebrate();

  async function toggle() {
    if (busy) return;
    const previous = state;
    const next = {
      likedByMe: !state.likedByMe,
      likeCount: state.likeCount + (state.likedByMe ? -1 : 1),
    };
    setState(next);
    if (next.likedByMe) void celebrate('like', button.current);
    setBusy(true);
    try {
      const res = await api<{ likeCount: number; likedByMe: boolean }>(`/posts/${postId}/like`, {
        method: previous.likedByMe ? 'DELETE' : 'PUT',
      });
      setState(res);
      onChange?.(res);
    } catch (err) {
      setState(previous);
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      ref={button}
      type="button"
      className={`action-btn${state.likedByMe ? ' liked' : ''}`}
      onClick={() => void toggle()}
      aria-pressed={state.likedByMe}
      aria-label={state.likedByMe ? msg.likes.unlike : msg.likes.like}
    >
      <HeartIcon filled={state.likedByMe} />
      <span>{state.likeCount}</span>
    </button>
  );
}
