export function Wordmark() {
  return (
    <a className="wordmark" aria-label="RyCruit home" href="/">
      <svg className="brand-mark" viewBox="0 0 36 36" aria-hidden="true">
        <path d="M8 4 32 18 8 32Z" fill="currentColor" />
      </svg>
      <span className="brand-name">
        <span className="brand-ry">Ry</span>
        <span className="brand-cruit">Cruit</span>
      </span>
    </a>
  );
}
