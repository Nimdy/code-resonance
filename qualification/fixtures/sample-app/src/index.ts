import { handle } from './api/server';
import { App } from './ui/App';

export function boot() {
  handle('GET');
  return App;
}
