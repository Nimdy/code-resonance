import type { Todo } from '../api/todos';

export function TodoList({ items }: { items: Todo[] }) {
  return <ul>{items.map(item => <li>{item.title}</li>)}</ul>;
}
