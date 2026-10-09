import ReactMarkdown from 'react-markdown';

/** Renders user Markdown; raw HTML is dropped and links open in a new tab. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
