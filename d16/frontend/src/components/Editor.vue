<template>
  <div class="editor-container">
    <div ref="editorContainer" class="editor"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
import { EditorState, RangeSet } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration, WidgetType } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { useDocumentStore } from '../stores/document';

const editorContainer = ref(null);
let view = null;
let ignoreNextChange = false;
const docStore = useDocumentStore();

const userColors = [
  '#61afef',
  '#98c379',
  '#e5c07b',
  '#c678dd',
  '#e06c75',
  '#56b6c2',
  '#d19a66',
  '#8b5cf6'
];

function getUserColor(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return userColors[Math.abs(hash) % userColors.length];
}

class CursorWidget extends WidgetType {
  constructor(userName, color) {
    super();
    this.userName = userName;
    this.color = color;
  }

  toDOM() {
    const div = document.createElement('span');
    div.className = 'remote-cursor';
    div.style.cssText = `
      position: relative;
      display: inline-block;
      width: 2px;
      height: 1.2em;
      background: ${this.color};
      margin-left: -1px;
      margin-right: -1px;
      vertical-align: text-bottom;
    `;
    
    const label = document.createElement('span');
    label.className = 'cursor-label';
    label.textContent = this.userName;
    label.style.cssText = `
      position: absolute;
      top: -18px;
      left: 0;
      background: ${this.color};
      color: #1a1a2e;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 3px;
      white-space: nowrap;
      z-index: 100;
      pointer-events: none;
      opacity: 0.9;
    `;
    div.appendChild(label);
    
    return div;
  }

  ignoreEvent() {
    return true;
  }
}

function getRemoteSelections() {
  return EditorView.decorations.compute([], (state) => {
    const decorations = [];
    
    docStore.users.forEach((user) => {
      if (user.id !== docStore.userId && user.selection) {
        const { anchor, head } = user.selection;
        const from = Math.min(anchor, head);
        const to = Math.max(anchor, head);
        const color = getUserColor(user.id);
        
        if (from === to) {
          const widget = Decoration.widget({
            widget: new CursorWidget(user.name, color),
            side: 1
          });
          decorations.push(widget.range(Math.min(from, state.doc.length)));
        } else {
          const mark = Decoration.mark({
            class: 'remote-selection',
            attributes: { style: `background: ${color}40` }
          });
          const safeFrom = Math.min(from, state.doc.length);
          const safeTo = Math.min(to, state.doc.length);
          if (safeFrom < safeTo) {
            decorations.push(mark.range(safeFrom, safeTo));
          }
          
          const cursorWidget = Decoration.widget({
            widget: new CursorWidget(user.name, color),
            side: 1
          });
          decorations.push(cursorWidget.range(Math.min(head, state.doc.length)));
        }
      }
    });
    
    return RangeSet.of(decorations.sort((a, b) => a.from - b.from));
  });
}

function createEditor(content) {
  const state = EditorState.create({
    doc: content,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      history(),
      markdown(),
      oneDark,
      getRemoteSelections(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !ignoreNextChange) {
          const changes = update.changes;
          changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
            const insertedText = inserted.toString();
            const deletedLength = toA - fromA;
            
            if (insertedText.length > 0) {
              const op = docStore.Operation.insert(fromA, insertedText, docStore.userId);
              docStore.sendOperation(op);
            } else if (deletedLength > 0) {
              const op = docStore.Operation.delete(fromA, deletedLength, docStore.userId);
              docStore.sendOperation(op);
            }
          });
        }
        
        if (update.selectionSet && view) {
          const mainRange = view.state.selection.main;
          const selection = {
            anchor: mainRange.anchor,
            head: mainRange.head
          };
          docStore.sendSelectionUpdate(selection);
        }
      }),
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '14px'
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'Consolas, Monaco, monospace',
          lineHeight: '1.6'
        },
        '.cm-content': {
          padding: '20px'
        },
        '.cm-line': {
          padding: '0 4px'
        },
        '.cm-gutters': {
          background: '#1e1e2e',
          borderRight: '1px solid #3a3a5a'
        },
        '.remote-selection': {
          borderRadius: '2px'
        }
      })
    ]
  });

  return new EditorView({
    state,
    parent: editorContainer.value
  });
}

let updateTimeout = null;

function triggerEditorUpdate() {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
  updateTimeout = setTimeout(() => {
    if (view) {
      view.dispatch({});
    }
  }, 10);
}

onMounted(() => {
  view = createEditor(docStore.content);
  
  watch(() => docStore.content, (newContent) => {
    if (!view) return;
    
    const currentContent = view.state.doc.toString();
    if (currentContent !== newContent) {
      ignoreNextChange = true;
      const transaction = view.state.update({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: newContent
        },
        annotations: [EditorView.remote.of(true)]
      });
      view.dispatch(transaction);
      nextTick(() => {
        ignoreNextChange = false;
      });
    }
  });

  watch(
    () => docStore.users.map(u => ({ id: u.id, selection: u.selection })),
    () => {
      triggerEditorUpdate();
    },
    { deep: true }
  );
});
</script>

<style scoped>
.editor-container {
  width: 100%;
  height: 100%;
  background: #282c34;
  border-radius: 8px;
  overflow: hidden;
}

.editor {
  width: 100%;
  height: 100%;
}

:deep(.cm-editor) {
  height: 100%;
}

:deep(.remote-selection) {
  border-radius: 2px;
}
</style>
