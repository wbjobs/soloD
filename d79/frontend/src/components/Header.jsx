function Header({ docId, setDocId, showPreview, setShowPreview }) {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">📝 离线 Markdown 编辑器</h1>
        <input
          type="text"
          value={docId}
          onChange={(e) => setDocId(e.target.value)}
          className="doc-input"
          placeholder="文档 ID"
        />
      </div>
      <div className="header-right">
        <button
          className="toggle-btn"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? '隐藏预览' : '显示预览'}
        </button>
      </div>
    </header>
  );
}

export default Header;