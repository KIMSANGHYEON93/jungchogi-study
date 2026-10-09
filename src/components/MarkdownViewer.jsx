import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useThemeContext } from '../hooks/useTheme';
import { splitDetails } from '../utils/splitDetails';
import { normalizeItemText } from '../utils/studyChecklist';

/** hast 노드의 글자만 이어 붙인다 (체크리스트 항목 문구를 키로 쓰기 위해) */
function hastText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  return (node.children ?? []).map(hastText).join('');
}

/**
 * @param {{content: string, checklist?: {isChecked: (item: string) => boolean, onToggle: (item: string, checked: boolean) => void}}} props
 *   `checklist` 를 주면 `- [ ]` 항목이 실제로 체크·저장되는 체크박스가 된다. 없으면 remark-gfm 기본(읽기 전용)이다.
 */
export default function MarkdownViewer({ content, checklist }) {
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
          ...(checklist
            ? {
                // remark-gfm 은 체크박스를 disabled 로 그린다. 항목(li) 단위로 바꿔 그려 라벨 전체를 누를 수 있게 한다.
                input(props) {
                  if (props.type === 'checkbox') return null;
                  const rest = { ...props };
                  delete rest.node;
                  return <input {...rest} />;
                },
                li({ node, className, children, ...props }) {
                  if (!String(className ?? '').includes('task-list-item')) {
                    return <li className={className} {...props}>{children}</li>;
                  }
                  const item = normalizeItemText(hastText(node));
                  const checked = checklist.isChecked(item);
                  return (
                    <li className={`${className} md-check-item${checked ? ' is-checked' : ''}`} {...props}>
                      <label>
                        <input type="checkbox" checked={checked} onChange={(e) => checklist.onToggle(item, e.target.checked)} />
                        <span>{children}</span>
                      </label>
                    </li>
                  );
                },
              }
            : {}),
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
