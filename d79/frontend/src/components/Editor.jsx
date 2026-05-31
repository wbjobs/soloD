import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { yCollab } from 'y-codemirror.next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useYjs } from '../contexts/YjsContext';

function Editor({ showPreview }) {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const { ydoc, isOnline } = useYjs();
  const [markdownContent, setMarkdownContent] = useState('');

  useEffect(() => {
    if (!ydoc || !editorRef.current) return;

    const ytext = ydoc.getText('codemirror');
    
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const content = update.state.doc.toString();
        setMarkdownContent(content);
      }
    });

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        markdown(),
        oneDark,
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' }
        }),
        yCollab(ytext),
        updateListener
      ]
    });

    const view = new EditorView({
      state,
      parent: editorRef.current
    });

    viewRef.current = view;

    const yObserver = () => {
      setMarkdownContent(ytext.toString());
    };
    ytext.observe(yObserver);

    return () => {
      ytext.unobserve(yObserver);
      view.destroy();
    };
  }, [ydoc]);

  return (
    <div className="editor-container">
      <div className={`editor-panel ${!showPreview ? 'single-panel' : ''}`}>
        <div className="panel-title">Markdown 编辑器</div>
        <div ref={editorRef} style={{ flex: 1, overflow: 'hidden' }} />
      </div>
      
      {showPreview && (
        <div className="editor-panel">
          <div className="panel-title">实时预览</div>
          <div className="preview-panel">
            <div className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {markdownContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Editor;