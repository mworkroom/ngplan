import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ENGINE_VERSION } from './domain/constants';
import { CloudApp } from './ui/CloudApp';
import './ui/theme.css';
import './ui/styles.css';

document.documentElement.dataset.engineVersion = ENGINE_VERSION;

const appElement = document.getElementById('app');

if (appElement === null) {
  throw new Error('애플리케이션 루트 요소를 찾을 수 없습니다.');
}

createRoot(appElement).render(
  <StrictMode>
    <CloudApp />
  </StrictMode>,
);
