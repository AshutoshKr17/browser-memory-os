import type { PageMemory } from '../../shared/types';
import { faviconFor, timeAgo } from '../util';

interface Props {
  memory: PageMemory;
  score?: number;
  matchType?: string;
  selected?: boolean;
  onOpen: (id: number) => void;
}

export function MemoryRow({ memory, score, matchType, selected, onOpen }: Props) {
  return (
    <div
      className={`row ${selected ? 'sel' : ''}`}
      onClick={() => memory.id != null && onOpen(memory.id)}
    >
      <img
        className="fav"
        src={faviconFor(memory.url, memory.favicon)}
        alt=""
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
        }}
      />
      <div className="main">
        <div className="title">{memory.title || memory.url}</div>
        <div className="sub">{memory.summary || memory.url}</div>
        <div className="meta">
          <span className="badge dim">{memory.domain}</span>
          {memory.category && memory.category !== 'General' && (
            <span className="badge">{memory.category}</span>
          )}
          <span className="sub" style={{ fontSize: 11 }}>
            {timeAgo(memory.lastVisitedAt)}
          </span>
          {score != null && matchType === 'semantic' && (
            <span className="score">{Math.round(score * 100)}%</span>
          )}
        </div>
      </div>
    </div>
  );
}
