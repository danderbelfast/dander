import React, { useRef, useState } from 'react';

export function FileDropzone({ label, hint, onFile, accept = 'image/*', preview }) {
  const inputRef    = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  function handleChange(e) {
    const file = e.target.files[0];
    if (file) onFile(file);
  }

  return (
    <div
      className={`dropzone ${dragOver ? 'drag-over' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {preview ? (
        <div className="dropzone-preview">
          <img src={preview} alt="Preview" />
          <p className="dropzone-hint" style={{ marginTop: 8 }}>Click or drag to replace</p>
        </div>
      ) : (
        <>
          <div className="dropzone-icon">📷</div>
          <div className="dropzone-label">{label}</div>
          <div className="dropzone-hint">{hint || 'PNG, JPG, WebP up to 5 MB'}</div>
        </>
      )}
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleChange} />
    </div>
  );
}
