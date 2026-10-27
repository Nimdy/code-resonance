import { listTodos, addTodo } from './todos';

export function handle(method: string, body?: { title: string }) {
  if (method === 'GET') return listTodos();
  if (method === 'POST' && body) return addTodo(body.title);
  return { error: 'unsupported' };
}
