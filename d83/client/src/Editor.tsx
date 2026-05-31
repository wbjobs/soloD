import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import * as Y from 'yjs';
import { yCollab } from 'y-codemirror.next';
import { Awareness } from 'y-protocols/awareness';

interface EditorProps {
  ytext: Y.Text;
  awareness: Awareness;
}

const Editor = ({ ytext, awareness }: EditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  
  useEffect(() => {
    if (!editorRef.current) return;
    
    const yUndoManager = new Y.UndoManager(ytext);
    
    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        basicSetup,
        markdown(),
        yCollab(ytext, awareness, { undoManager: yUndoManager }),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    });
    
    const view = new EditorView({
      state,
      parent: editorRef.current,
    });
    
    viewRef.current = view;
    
    return () => {
      view.destroy();
      yUndoManager.destroy();
    };
  }, [ytext, awareness]);
  
  return (
    <div ref={editorRef} className="h-full" />
  );
};

export default Editor;
