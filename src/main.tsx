import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useEditor } from './editor/store';
import './styles.css';

// 개발 서버에서만: 브라우저 점검 스크립트가 편집기 상태를 바꿔 볼 수 있게(배포본에는 빠진다)
if (import.meta.env.DEV) (window as unknown as { __editor: typeof useEditor }).__editor = useEditor;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
