import { TodoList } from './TodoList';
import { listTodos } from '../api/todos';

export function App() {
  const items = listTodos();
  return <main><h1>Tasks</h1><TodoList items={items} /></main>;
}
