export const componentLibrary = [
  { type: 'Button', name: '按钮', icon: '🔘', category: 'basic', defaultProps: { text: '按钮', type: 'primary' }, defaultStyle: { padding: '8px 16px' } },
  { type: 'Input', name: '输入框', icon: '📝', category: 'form', defaultProps: { placeholder: '请输入' }, defaultStyle: { width: '200px' } },
  { type: 'Text', name: '文本', icon: '📄', category: 'display', defaultProps: { content: '这是一段文本' }, defaultStyle: { fontSize: '14px', color: '#333' } },
  { type: 'Image', name: '图片', icon: '🖼️', category: 'display', defaultProps: { src: 'https://picsum.photos/200/200', alt: '图片' }, defaultStyle: { width: '200px', height: '200px' } },
  { type: 'Container', name: '容器', icon: '📦', category: 'basic', defaultProps: {}, defaultStyle: { padding: '20px', border: '1px solid #eee', minHeight: '100px' } },
  { type: 'Card', name: '卡片', icon: '💳', category: 'display', defaultProps: { title: '卡片标题' }, defaultStyle: { padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' } },
  { type: 'Select', name: '下拉选择', icon: '📋', category: 'form', defaultProps: { options: [{label: '选项1', value: '1'}, {label: '选项2', value: '2'}] }, defaultStyle: { width: '200px' } },
  { type: 'Table', name: '表格', icon: '📊', category: 'display', defaultProps: { columns: [{prop: 'name', label: '名称'}, {prop: 'value', label: '值'}], data: [{name: '示例1', value: '123'}] }, defaultStyle: { width: '100%' } }
]