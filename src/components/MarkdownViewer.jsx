import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useThemeContext } from '../hooks/useTheme';
import { splitDetails } from '../utils/splitDetails';

export default function MarkdownViewer({ content }) {
  const { theme } = useThemeContext();
  const syntaxTheme = theme === 'dark' ? oneDark : oneLight;

  const markdown = (text, key) => (
      <ReactMarkdown
        key={key}
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match) {
              return (
                <SyntaxHighlighter
                  style={syntaxTheme}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              );
            }
            return <code className={className} {...props}>{children}</code>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
  );

  return (
    <div className="md-content">
      {splitDetails(content).map((part, i) =>
        part.kind === 'md' ? (
          markdown(part.text, i)
        ) : (
          <details key={i} className="md-answer">
            <summary>{part.summary}</summary>
            <div className="md-answer-body">{markdown(part.text, 'body')}</div>
          </details>
        )
      )}
    </div>
  );
}
